import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProject, auditProject, projectAuditReport, MAX_FILE_BYTES } from "../dist/project.js";

// The auditors were only usable on pasted strings, so nobody could afford to
// run them on a real codebase. These tests cover the walk and, above all, the
// limits: an audit that quietly stops early but reads as complete is worse than
// no audit.

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "saglitz-project-"));
  mkdirSync(join(root, "src", "components"), { recursive: true });
  mkdirSync(join(root, "node_modules", "junk"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, ".git"), { recursive: true });

  writeFileSync(join(root, "src", "components", "Card.tsx"), '<img src="/a.png" />\n');
  writeFileSync(join(root, "src", "styles.css"), ".a{color:#111827;border-radius:6px}\n.b{color:#111928;border-radius:7px}\n");
  writeFileSync(join(root, "src", "logic.ts"), 'export const x = "#ff0000";\n');
  writeFileSync(join(root, "node_modules", "junk", "bad.css"), ".x{color:#123456}\n");
  writeFileSync(join(root, "dist", "built.css"), ".y{color:#654321}\n");
  writeFileSync(join(root, ".git", "config.css"), ".z{color:#abcdef}\n");
  writeFileSync(join(root, "huge.css"), `/* big */\n${"a".repeat(MAX_FILE_BYTES + 10)}\n`);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("scanning", () => {
  it("walks source and never enters build or vendor output", () => {
    const files = scanProject(root).files.map((f) => f.path.replace(/\\/g, "/"));
    expect(files).toContain("src/components/Card.tsx");
    expect(files).toContain("src/styles.css");
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.startsWith("dist/"))).toBe(false);
    expect(files.some((f) => f.startsWith(".git"))).toBe(false);
  });

  it("excludes .ts by default, and includes it when asked", () => {
    expect(scanProject(root).files.some((f) => f.path.endsWith("logic.ts"))).toBe(false);
    expect(scanProject(root, [".ts"]).files.some((f) => f.path.endsWith("logic.ts"))).toBe(true);
  });

  it("skips a file over the per-file cap and names it", () => {
    const scan = scanProject(root);
    expect(scan.files.some((f) => f.path === "huge.css")).toBe(false);
    expect(scan.skippedLarge).toContain("huge.css");
  });

  it("is deterministic", () => {
    expect(scanProject(root).files.map((f) => f.path)).toEqual(scanProject(root).files.map((f) => f.path));
  });
});

describe("auditing", () => {
  it("attaches a file to every finding", () => {
    const { findings } = auditProject(root);
    const img = findings.find((f) => f.rule === "img-no-alt")!;
    expect(img).toBeDefined();
    expect(img.file.replace(/\\/g, "/")).toBe("src/components/Card.tsx");
    expect(img.line).toBeGreaterThan(0);
  });

  it("scores consistency across files, not per file", () => {
    // The two near-identical colours live in one file here, but the point is
    // that the score is computed over the whole project at once.
    const { system } = auditProject(root);
    expect(system.duplicateColors.length).toBeGreaterThan(0);
  });

  it("ranks files by how much needs fixing", () => {
    const { worstFiles } = auditProject(root);
    expect(worstFiles[0].errors).toBeGreaterThanOrEqual(worstFiles[worstFiles.length - 1].errors);
  });
});

describe("the report never reads as complete when it is not", () => {
  it("names what it skipped", () => {
    const report = projectAuditReport(root);
    expect(report).toMatch(/What this did not look at/);
    expect(report).toMatch(/node_modules/);
    expect(report).toMatch(/Capped:.*huge\.css|huge\.css/);
  });

  it("carries the caveat that budgets are calibrated for one product", () => {
    expect(projectAuditReport(root)).toMatch(/calibrated for one product/i);
  });

  it("says so plainly when there is nothing to audit", () => {
    const empty = mkdtempSync(join(tmpdir(), "saglitz-empty-"));
    expect(projectAuditReport(empty)).toMatch(/Found no design source/);
    rmSync(empty, { recursive: true, force: true });
  });
});
