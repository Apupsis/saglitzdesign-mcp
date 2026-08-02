// Run the design auditors over a real project instead of a pasted snippet.
//
// design_lint, audit_design_system and the rest all take a string, which meant
// auditing a codebase involved copying files into a chat one at a time. Good
// tools nobody can afford to use.
//
// Deliberate limits, all of them reported rather than silent: a truncated audit
// that looks complete is worse than one that says what it skipped.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { designLint, type LintFinding } from "./lint.js";
import { auditDesignSystem, type DesignSystemAudit } from "./dsaudit.js";

/** Directories that are never anyone's source. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit",
  "coverage", "vendor", ".turbo", ".cache", ".parcel-cache", "__pycache__", ".venv", "target",
  ".output", "storybook-static", ".vercel", ".netlify",
]);

/**
 * Extensions worth linting for *design* defects. `.js`/`.ts` are excluded by
 * default: most are logic, and linting them for missing alt text produces noise
 * that buries the real findings. Callers who keep components in `.js` can ask.
 */
const UI_EXTENSIONS = [".css", ".scss", ".sass", ".less", ".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro"];
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);

export const MAX_FILES = 400;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
export const MAX_FILE_BYTES = 500 * 1024;

export interface ProjectFile {
  path: string;   // relative to the root
  bytes: number;
  source: string;
}

export interface ScanResult {
  files: ProjectFile[];
  scannedBytes: number;
  skippedLarge: string[];
  hitFileCap: boolean;
  hitByteCap: boolean;
  unreadable: string[];
}

export interface ProjectAudit {
  root: string;
  scan: ScanResult;
  findings: Array<LintFinding & { file: string }>;
  system: DesignSystemAudit;
  /** Files ranked by how much needs fixing. */
  worstFiles: Array<{ file: string; errors: number; warnings: number; info: number }>;
}

export function scanProject(root: string, extensions: string[] = UI_EXTENSIONS): ScanResult {
  const wanted = new Set(extensions.map((e) => e.toLowerCase()));
  const files: ProjectFile[] = [];
  const skippedLarge: string[] = [];
  const unreadable: string[] = [];
  let scannedBytes = 0;
  let hitFileCap = false;
  let hitByteCap = false;

  const walk = (dir: string) => {
    if (hitFileCap || hitByteCap) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      unreadable.push(relative(root, dir) || ".");
      return;
    }
    // Deterministic order, so the same project always produces the same report.
    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (hitFileCap || hitByteCap) return;
      if (entry.name.startsWith(".") && entry.isDirectory() && !SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!wanted.has(extname(entry.name).toLowerCase())) continue;

      let size = 0;
      try {
        size = statSync(full).size;
      } catch {
        unreadable.push(relative(root, full));
        continue;
      }
      const rel = relative(root, full);
      if (size > MAX_FILE_BYTES) {
        skippedLarge.push(rel);
        continue;
      }
      if (files.length >= MAX_FILES) {
        hitFileCap = true;
        return;
      }
      if (scannedBytes + size > MAX_TOTAL_BYTES) {
        hitByteCap = true;
        return;
      }
      try {
        files.push({ path: rel, bytes: size, source: readFileSync(full, "utf8") });
        scannedBytes += size;
      } catch {
        unreadable.push(rel);
      }
    }
  };

  walk(root);
  return { files, scannedBytes, skippedLarge, hitFileCap, hitByteCap, unreadable };
}

export function auditProject(root: string, extensions?: string[]): ProjectAudit {
  const scan = scanProject(root, extensions);

  const findings: Array<LintFinding & { file: string }> = [];
  for (const f of scan.files) {
    for (const finding of designLint(f.source)) findings.push({ ...finding, file: f.path });
  }

  // The consistency score is a property of the styles as a whole, so it is
  // computed over everything at once — cross-file drift is the thing a
  // per-file audit cannot see, and the reason this tool exists.
  const styleSource = scan.files
    .filter((f) => STYLE_EXTENSIONS.has(extname(f.path).toLowerCase()) || /style|class(Name)?=/.test(f.source))
    .map((f) => f.source)
    .join("\n");
  const system = auditDesignSystem(styleSource);

  const byFile = new Map<string, { file: string; errors: number; warnings: number; info: number }>();
  for (const f of findings) {
    const row = byFile.get(f.file) ?? { file: f.file, errors: 0, warnings: 0, info: 0 };
    if (f.severity === "error") row.errors++;
    else if (f.severity === "warning") row.warnings++;
    else row.info++;
    byFile.set(f.file, row);
  }
  const worstFiles = [...byFile.values()].sort(
    (a, b) => b.errors - a.errors || b.warnings - a.warnings || b.info - a.info || a.file.localeCompare(b.file),
  );

  return { root, scan, findings, system, worstFiles };
}

// ── report ───────────────────────────────────────────────────────────────────

const ICON = { error: "🔴", warning: "🟡", info: "🔵" } as const;
const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;

export function projectAuditReport(root: string, extensions?: string[]): string {
  const a = auditProject(root, extensions);
  const { scan } = a;

  if (scan.files.length === 0) {
    return [
      "# Project design audit",
      "",
      `Found no design source under \`${root}\`.`,
      "",
      `Looked for ${UI_EXTENSIONS.join(", ")} outside ${[...SKIP_DIRS].slice(0, 6).join(", ")} and friends.`,
      "",
      "_If your components live in `.js`/`.ts`, pass those extensions explicitly — they are excluded by default because most such files are logic, and linting them for missing alt text buries the real findings._",
    ].join("\n");
  }

  const errors = a.findings.filter((f) => f.severity === "error").length;
  const warnings = a.findings.filter((f) => f.severity === "warning").length;
  const info = a.findings.filter((f) => f.severity === "info").length;

  const out: string[] = [
    "# Project design audit",
    "",
    `\`${root}\` — ${scan.files.length} file(s), ${kb(scan.scannedBytes)} scanned.`,
    "",
    `**${errors} error · ${warnings} warning · ${info} info** across ${a.worstFiles.length} file(s) · ` +
      `**consistency ${a.system.score}/100**`,
    "",
  ];

  // System first: cross-file drift is what a per-file pass cannot see.
  out.push(
    "## Is it one system?",
    "",
    "_Budgets are calibrated for one product's UI. A portfolio showing ten brands, a multi-tenant app, or a component library demonstrating every state in both themes legitimately exceeds them — read the numbers, not just the score._",
    "",
  );
  out.push("| dimension | distinct | budget | |", "|---|---|---|---|");
  for (const d of a.system.dimensions) {
    const mark = d.status === "ok" ? "✅" : d.status === "watch" ? "🟡" : "🔴";
    out.push(`| ${d.label} | ${d.unique} | ≤ ${d.budget} | ${mark} |`);
  }
  out.push("");
  const drifting = a.system.dimensions.filter((d) => d.status !== "ok");
  if (drifting.length) {
    for (const d of drifting) out.push(`- **${d.label}:** ${d.advice}${d.tool ? ` → \`${d.tool}\`` : ""}`);
    out.push("");
  }
  if (a.system.duplicateColors.length) {
    const redundant = a.system.duplicateColors.reduce((n, c) => n + c.drop.length, 0);
    out.push(
      `- **${redundant} indistinguishable colour(s)** across the project: ` +
      a.system.duplicateColors.slice(0, 5).map((c) => `keep \`${c.keep}\`, drop ${c.drop.map((d) => `\`${d.value}\``).join(", ")}`).join(" · "),
      "",
    );
  }

  // Then the per-file findings, worst file first.
  if (a.findings.length) {
    out.push("## Findings, worst file first", "");
    for (const row of a.worstFiles.slice(0, 20)) {
      const fileFindings = a.findings.filter((f) => f.file === row.file);
      out.push(`### \`${row.file}\` — ${row.errors} error · ${row.warnings} warning · ${row.info} info`);
      for (const f of fileFindings.slice(0, 12)) {
        out.push(`- ${ICON[f.severity]} **L${f.line}** \`${f.rule}\` — ${f.message}`);
      }
      if (fileFindings.length > 12) out.push(`- _…and ${fileFindings.length - 12} more in this file._`);
      out.push("");
    }
    if (a.worstFiles.length > 20) {
      out.push(`_${a.worstFiles.length - 20} further file(s) have findings; they are not listed here._`, "");
    }
    out.push(
      "Fixes for each rule are in `design_lint` — run it on a single file to get the fix text, or read the rule id.",
      "",
    );
  } else {
    out.push("## Findings", "", "No design or accessibility anti-patterns were detected in the scanned files.", "");
  }

  // Never let a capped scan read as a complete one.
  const notes: string[] = [];
  if (scan.hitFileCap) notes.push(`the ${MAX_FILES}-file cap was reached, so later files were not read`);
  if (scan.hitByteCap) notes.push(`the ${kb(MAX_TOTAL_BYTES)} total cap was reached, so later files were not read`);
  if (scan.skippedLarge.length) notes.push(`${scan.skippedLarge.length} file(s) over ${kb(MAX_FILE_BYTES)} were skipped: ${scan.skippedLarge.slice(0, 5).join(", ")}`);
  if (scan.unreadable.length) notes.push(`${scan.unreadable.length} path(s) could not be read`);

  out.push(
    "## What this did not look at",
    "",
    `- Directories never scanned: ${[...SKIP_DIRS].slice(0, 8).join(", ")}, and other build/vendor output.`,
    `- Extensions scanned: ${(extensions ?? UI_EXTENSIONS).join(", ")}. \`.js\`/\`.ts\` are excluded by default — pass them explicitly if your components live there.`,
    "- `.gitignore` is not parsed; the skip list above is fixed.",
    "- Copy is not audited here: run `audit_ux_copy` on the strings that matter. Screens are not measured: run `measure_screenshot` on a PNG.",
    ...notes.map((n) => `- **Capped:** ${n}.`),
    "",
    "_Static analysis of the files as written. It cannot see values that arrive at runtime, from a theme provider, or from a framework's own defaults._",
  );
  return out.join("\n");
}
