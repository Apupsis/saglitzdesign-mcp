// The inverse of generate_design_tokens: read an existing, *named* token
// source and normalise it into the same TokenSpec the emitters already speak.
//
// The rule that shapes everything here: only named tokens are read. A CSS
// custom property, a DTCG entry and a theme key all carry a name that states
// intent; a bare `color: #4f46e5` inside a rule does not. Deciding that some
// hex in a stylesheet is "your primary" would be exactly the confident
// wrongness this project exists to avoid — audit_design_system already counts
// unnamed values without claiming to know what they mean.
//
// JavaScript is never evaluated.

import { normalizeHex, DEFAULT_SPACING, DEFAULT_RADII, DEFAULT_FONT_SIZES, DEFAULT_FONT_FAMILIES } from "./tokens.js";
import { hslToRgb } from "./color.js";

export type ImportFormat = "css" | "dtcg" | "json" | "unsupported";

export interface ImportedTokens {
  format: ImportFormat;
  colors: Record<string, string>;
  spacing: number[];
  radii: Record<string, number>;
  fontSizes: Record<string, number>;
  fontFamilies: Record<string, string>;
  /** Named values we could not classify — carried, never guessed at. */
  unclassified: Record<string, string>;
  /** Semantic roles this project expects that the source does not provide. */
  missingRoles: string[];
  /** Which groups fell back to the documented defaults. */
  defaulted: string[];
  problems: string[];
}

/** The semantic roles a complete system is expected to name. */
const EXPECTED_ROLES = [
  "background", "surface", "border", "primary", "onPrimary", "textPrimary", "textSecondary", "focus",
];

/**
 * This project's own role vocabulary. The emitters kebab-case it on the way out
 * (`onPrimary` → `--color-on-primary`), so importing has to put it back or a
 * round trip would rename every role it touches.
 *
 * Only exact matches are canonicalised. A foreign convention like shadcn's
 * `primary-foreground` is left exactly as written — silently deciding it means
 * `onPrimary` would be the kind of guess this module refuses to make.
 */
const CANONICAL_ROLES = [
  "background", "surface", "onSurface", "border", "primary", "onPrimary", "secondary", "onSecondary",
  "textPrimary", "textSecondary", "textMuted", "focus", "danger", "onDanger", "success", "warning", "subtle",
];
const CANONICAL_BY_KEY = new Map(CANONICAL_ROLES.map((r) => [r.toLowerCase(), r]));

function canonicalise(role: string): string {
  return CANONICAL_BY_KEY.get(role.replace(/-/g, "").toLowerCase()) ?? role;
}

// ── value classification ─────────────────────────────────────────────────────

const FONT_STACK_RE = /[a-z]/i;

function toHex(raw: string): string | null {
  const v = raw.trim();
  const hex = normalizeHex(v);
  if (hex) return hex;

  const rgb = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    const c = (n: string) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, "0");
    return `#${c(rgb[1])}${c(rgb[2])}${c(rgb[3])}`;
  }

  const hsl = v.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if (hsl) {
    const { r, g, b } = hslToRgb({ h: parseFloat(hsl[1]), s: parseFloat(hsl[2]) / 100, l: parseFloat(hsl[3]) / 100 });
    const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`;
  }
  return null;
}

/** px value of a CSS length, or null if it is not a single length. */
function toPx(raw: string): number | null {
  const m = raw.trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (!m[2]) return null; // a bare number is not a length we should assume about
  return m[2] === "px" ? n : n * 16;
}

/** Strip the prefixes token systems use, leaving the role. */
function roleOf(rawName: string): { group: string; role: string } {
  let n = rawName.trim().replace(/^--/, "");
  n = n.replace(/([a-z0-9])([A-Z])/g, "$1-$2"); // camelCase → kebab, before lowercasing
  n = n.toLowerCase();

  const groups: Array<[RegExp, string]> = [
    [/^colors?[-.]/, "color"],
    [/^spacing[-.]|^space[-.]/, "spacing"],
    [/^(radius|radii|rounded)[-.]/, "radius"],
    [/^(text|font-size|fontsize)[-.]/, "fontSize"],
    [/^font[-.]/, "fontFamily"],
    [/^shadows?[-.]/, "shadow"],
  ];
  for (const [re, group] of groups) {
    if (re.test(n)) return { group, role: n.replace(re, "") };
  }
  // Bare names carry no group; the value's shape decides.
  return { group: "", role: n };
}

// ── parsers ──────────────────────────────────────────────────────────────────

/** Every `--name: value` declaration, wherever it appears. Named by definition. */
function parseCss(src: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of src.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+)/g)) {
    out.push([m[1], m[2].trim()]);
  }
  return out;
}

function isDtcg(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const seen = JSON.stringify(value);
  return seen.includes('"$value"');
}

/** Flatten a DTCG tree into `path-joined-name` → raw value. */
function parseDtcg(root: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (node: unknown, path: string[]) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if ("$value" in obj) {
      out.push([path.join("-"), String(obj.$value)]);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("$")) continue;
      walk(v, [...path, k]);
    }
  };
  walk(root, []);
  return out;
}

/** Flatten a plain theme object the same way. */
function parseJson(root: Record<string, unknown>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const walk = (node: unknown, path: string[]) => {
    if (node === null || node === undefined) return;
    if (typeof node === "string" || typeof node === "number") {
      out.push([path.join("-"), String(node)]);
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, [...path, k]);
  };
  walk(root, []);
  return out;
}

// ── import ───────────────────────────────────────────────────────────────────

export function importTokens(source: string): ImportedTokens {
  const result: ImportedTokens = {
    format: "unsupported",
    colors: {}, spacing: [], radii: {}, fontSizes: {}, fontFamilies: {},
    unclassified: {}, missingRoles: [], defaulted: [], problems: [],
  };
  const src = source.trim();
  if (!src) {
    result.problems.push("No source provided. Paste CSS custom properties, a DTCG token file, or a theme object as JSON.");
    return result;
  }

  let entries: Array<[string, string]> = [];
  let aliasSource: Record<string, string> = {};

  // JSON first — a DTCG or theme file is valid JSON; CSS is not.
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(src);
  } catch {
    /* not JSON */
  }

  if (parsed && typeof parsed === "object") {
    if (isDtcg(parsed)) {
      result.format = "dtcg";
      entries = parseDtcg(parsed as Record<string, unknown>);
      // DTCG aliases reference the dotted path; build a lookup before resolving.
      for (const [name, value] of entries) aliasSource[name.replace(/-/g, ".")] = value;
    } else {
      result.format = "json";
      entries = parseJson(parsed as Record<string, unknown>);
    }
  } else if (/--[A-Za-z0-9_-]+\s*:/.test(src)) {
    result.format = "css";
    entries = parseCss(src);
  } else if (/\b(module\.exports|export\s+default|require\s*\(|=>|function\s)/.test(src)) {
    result.problems.push(
      "This looks like a JavaScript config, which cannot be read safely — it is never evaluated. " +
      "Export your theme as CSS custom properties (Tailwind v4 `@theme`), as DTCG JSON, or paste the theme object as JSON.",
    );
    return result;
  } else {
    result.format = "css";
    result.problems.push(
      "Found no named tokens — only CSS custom properties, DTCG entries and theme keys are read. " +
      "A bare value inside a rule carries no role, so it is never imported as one; use audit_design_system to count those.",
    );
    return result;
  }

  // Resolve one level of DTCG alias.
  const resolve = (value: string): string | null => {
    const alias = value.match(/^\{([^}]+)\}$/);
    if (!alias) return value;
    const target = aliasSource[alias[1]];
    if (target === undefined || /^\{/.test(target)) {
      result.problems.push(`Alias \`{${alias[1]}}\` could not be resolved — the target is missing or is itself an alias.`);
      return null;
    }
    return target;
  };

  for (const [rawName, rawValue] of entries) {
    const value = resolve(rawValue);
    if (value === null) continue;
    const { group, role: rawRole } = roleOf(rawName);
    if (!rawRole) continue;
    const role = canonicalise(rawRole);

    const hex = toHex(value);
    const px = toPx(value);

    if (group === "color" || (!group && hex)) {
      if (hex) { result.colors[role] = hex; continue; }
    }
    if (group === "spacing") {
      if (px !== null) { result.spacing.push(px); continue; }
    }
    if (group === "radius") {
      if (px !== null) { result.radii[role || "default"] = px; continue; }
    }
    if (group === "fontSize") {
      if (px !== null) { result.fontSizes[role] = px; continue; }
    }
    if (group === "fontFamily" || (!group && !hex && px === null && value.includes(",") && FONT_STACK_RE.test(value))) {
      result.fontFamilies[role] = value;
      continue;
    }
    // Ungrouped names decided by value shape.
    if (!group && hex) { result.colors[role] = hex; continue; }
    if (!group && px !== null) {
      if (/radius|rounded/.test(role)) result.radii[role === "radius" ? "default" : role] = px;
      else if (/text|font/.test(role)) result.fontSizes[role] = px;
      else if (/space|gap|size/.test(role)) result.spacing.push(px);
      else result.radii[role] = px; // a lone `--radius` is the common case
      continue;
    }
    result.unclassified[role] = value;
  }

  result.spacing = [...new Set(result.spacing)].sort((a, b) => a - b);

  // Coverage: which expected roles are absent (case-insensitively).
  const have = new Set(Object.keys(result.colors).map((k) => k.toLowerCase().replace(/-/g, "")));
  result.missingRoles = EXPECTED_ROLES.filter((r) => !have.has(r.toLowerCase()));

  if (result.spacing.length === 0) { result.spacing = [...DEFAULT_SPACING]; result.defaulted.push("spacing"); }
  if (Object.keys(result.radii).length === 0) { result.radii = { ...DEFAULT_RADII }; result.defaulted.push("radii"); }
  if (Object.keys(result.fontSizes).length === 0) { result.fontSizes = { ...DEFAULT_FONT_SIZES }; result.defaulted.push("font sizes"); }
  if (Object.keys(result.fontFamilies).length === 0) { result.fontFamilies = { ...DEFAULT_FONT_FAMILIES }; result.defaulted.push("font families"); }

  if (Object.keys(result.colors).length === 0) {
    result.problems.push("No named colours were found in the source.");
  }
  return result;
}

// ── report ───────────────────────────────────────────────────────────────────

import { generateTokens, type TokenFormat } from "./tokens.js";
import { contrastRatio } from "./a11y.js";

/**
 * Roles that read as text, paired against roles that read as a surface.
 *
 * Text is matched FIRST and wins: shadcn names its text roles
 * `muted-foreground`, `primary-foreground` — which begin with words that also
 * name surfaces. Matching surfaces first classifies the most common failing
 * text colour in the ecosystem as a background, which both invents a
 * meaningless pair and hides the real one.
 */
const TEXT_ROLES = /(^|-)foreground$|^text|^on-|^on[A-Z]/;
const SURFACE_ROLES = /^(background|surface|card|popover|muted|subtle|bg)/i;

export function importTokensReport(source: string, format: TokenFormat = "all", name = "Imported"): string {
  const t = importTokens(source);

  if (t.format === "unsupported" || Object.keys(t.colors).length === 0) {
    const out = ["# Import design tokens", ""];
    out.push(...t.problems.map((p) => `**${p}**`));
    out.push(
      "",
      "Readable sources: CSS custom properties (Tailwind v4 `@theme`, a shadcn `:root` block, plain CSS), " +
      "W3C DTCG JSON, or a theme object as JSON.",
      "",
      "_Unnamed values — a bare `color: #4f46e5` inside a rule — carry no role, so they are never imported as one. " +
      "Use `audit_design_system` to count those, or `generate_design_tokens` to start a set from scratch._",
    );
    return out.join("\n");
  }

  const colorCount = Object.keys(t.colors).length;
  const out: string[] = [
    "# Import design tokens",
    "",
    `Read **${colorCount} named colour(s)** from a **${t.format.toUpperCase()}** source` +
      (t.spacing.length && !t.defaulted.includes("spacing") ? `, a ${t.spacing.length}-step spacing scale` : "") +
      (Object.keys(t.radii).length && !t.defaulted.includes("radii") ? `, ${Object.keys(t.radii).length} radius value(s)` : "") +
      (Object.keys(t.fontSizes).length && !t.defaulted.includes("font sizes") ? `, ${Object.keys(t.fontSizes).length} type step(s)` : "") +
      ".",
    "",
    "## Colours read",
    "",
    "| role | value |",
    "|---|---|",
    ...Object.entries(t.colors).map(([k, v]) => `| \`${k}\` | \`${v}\` |`),
    "",
  ];

  if (t.missingRoles.length) {
    out.push(
      "## Roles your source does not name",
      "",
      t.missingRoles.map((r) => `\`${r}\``).join(" · "),
      "",
      "These are the roles this project's generators expect. Absent ones are not invented — decide them yourself, " +
      "or run `generate_color_system` on your brand colour to derive a complete, contrast-verified set.",
      "",
    );
  }

  // Contrast across the pairs we can identify by role name.
  const texts = Object.entries(t.colors).filter(([k]) => TEXT_ROLES.test(k));
  const surfaces = Object.entries(t.colors).filter(([k]) => SURFACE_ROLES.test(k) && !TEXT_ROLES.test(k));
  const pairs: Array<{ fg: string; bg: string; fgHex: string; bgHex: string; ratio: number }> = [];
  const add = (fg: string, fgHex: string, bg: string, bgHex: string) =>
    pairs.push({ fg, bg, fgHex, bgHex, ratio: +contrastRatio(fgHex, bgHex).toFixed(2) });

  for (const [fg, fgHex] of texts) {
    // The paired convention states its own background, and whether the text
    // also appears elsewhere depends on what it is paired WITH:
    //
    //   `primary-foreground` belongs to a fill. It sits on `primary` and
    //   nowhere else — checking it against the page manufactures a failure
    //   that does not exist in the design, and being the worst "pair" it would
    //   capture the repair suggestion too.
    //
    //   `muted-foreground` belongs to a surface. It is secondary body text and
    //   is used across page surfaces, so checking it only against `muted`
    //   would hide the most common real failure in the ecosystem.
    const owner = fg.match(/^(.+)-foreground$/)?.[1];
    if (owner && t.colors[owner]) {
      add(fg, fgHex, owner, t.colors[owner]);
      if (SURFACE_ROLES.test(owner)) {
        for (const [bg, bgHex] of surfaces) if (bg !== owner) add(fg, fgHex, bg, bgHex);
      }
      continue;
    }
    for (const [bg, bgHex] of surfaces) add(fg, fgHex, bg, bgHex);
  }
  if (pairs.length) {
    pairs.sort((a, b) => a.ratio - b.ratio);
    const failing = pairs.filter((p) => p.ratio < 4.5);
    out.push(
      "## Contrast of the imported pairs",
      "",
      "| text role | on surface | ratio | AA normal (4.5) |",
      "|---|---|---|---|",
      ...pairs.slice(0, 12).map((p) => `| \`${p.fg}\` | \`${p.bg}\` | ${p.ratio.toFixed(2)}:1 | ${p.ratio >= 4.5 ? "✅" : "❌"} |`),
      "",
    );
    if (failing.length) {
      const worst = failing[0];
      out.push(
        `${failing.length} pair(s) fall below 4.5:1. Repair the worst with ` +
        `\`fix_contrast(foreground: "${worst.fgHex}", background: "${worst.bgHex}")\`.`,
        "",
      );
    }
  }

  if (t.defaulted.length) {
    out.push(
      "## Defaulted, not yours",
      "",
      `Your source named no ${t.defaulted.join(", ")}, so the tokens below use this project's defaults for ${t.defaulted.length === 1 ? "that scale" : "those scales"}. ` +
      "Replace them with your own values before shipping — a default you did not choose is not your design system.",
      "",
    );
  }

  if (Object.keys(t.unclassified).length) {
    out.push(
      "## Carried, unclassified",
      "",
      Object.entries(t.unclassified).slice(0, 12).map(([k, v]) => `\`${k}\` = ${v}`).join(" · "),
      "",
      "_These are named but their value is not a colour, length or font stack, so they were not filed into a scale rather than guessed at._",
      "",
    );
  }

  if (t.problems.length) {
    out.push("## Problems", "", ...t.problems.map((p) => `- ${p}`), "");
  }

  out.push(
    "## Re-emitted tokens",
    "",
    generateTokens({
      name,
      colors: t.colors,
      spacing: t.spacing,
      radii: t.radii,
      fontSizes: t.fontSizes,
      fontFamilies: t.fontFamilies,
    }, format),
    "",
    "_Only named tokens are read; a bare value inside a rule carries no role and is never imported as one. " +
    "Verify the result with `audit_accessibility`, and use `audit_design_system` on the stylesheet to see what is still hardcoded._",
  );
  return out.join("\n");
}
