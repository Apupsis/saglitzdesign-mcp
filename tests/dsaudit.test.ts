import { describe, it, expect } from "vitest";
import { auditDesignSystem, designSystemAuditReport } from "../dist/dsaudit.js";

const SPRAWL = `
.card  { background:#ffffff; color:#111827; border-radius:6px;  padding:13px; font-size:15px;   box-shadow:0 1px 2px rgba(0,0,0,.06) }
.card2 { background:#fefefe; color:#111928; border-radius:7px;  padding:11px; font-size:15.5px; box-shadow:0 1px 3px rgba(0,0,0,.07) }
.btn   { background:#4f46e5; color:#fff;    border-radius:9px;  padding:10px 18px; font-size:14px }
.btn2  { background:#4f47e6;                border-radius:12px; padding:9px 17px;  font-size:13px }
.modal { z-index:9999; border-radius:20px; font-size:22px; font-family: Inter, sans-serif }
.alt   { font-family: Georgia, serif }
.alt2  { font-family: Roboto, sans-serif }
.hack  { color:#333 !important }
`;

const SYSTEMATIC = `
:root {
  --color-surface:#ffffff; --color-text:#111827; --color-primary:#4f46e5;
  --radius-md:10px; --space-4:16px; --space-6:24px;
}
.card { background:var(--color-surface); color:var(--color-text); border-radius:var(--radius-md); padding:var(--space-4) }
.btn  { background:var(--color-primary); border-radius:var(--radius-md); padding:var(--space-4); font-size:1rem }
.hero { padding:var(--space-6); font-size:2rem }
`;

describe("audit_design_system", () => {
  it("scores a systematic stylesheet far above a sprawling one", () => {
    const sprawl = auditDesignSystem(SPRAWL).score;
    const clean = auditDesignSystem(SYSTEMATIC).score;
    expect(clean).toBeGreaterThan(sprawl + 20);
    expect(clean).toBeGreaterThanOrEqual(85);
  });

  it("clusters indistinguishable colors and names the survivor", () => {
    const { duplicateColors } = auditDesignSystem(SPRAWL);
    const pairs = duplicateColors.flatMap((c) => c.drop.map((d) => [c.keep, d.value]));
    expect(pairs).toContainEqual(["#ffffff", "#fefefe"]);
    expect(pairs).toContainEqual(["#111827", "#111928"]);
    expect(pairs).toContainEqual(["#4f46e5", "#4f47e6"]);
  });

  it("does not call visibly different colors duplicates", () => {
    const { duplicateColors } = auditDesignSystem(".a{color:#000000}.b{color:#ffffff}.c{color:#4f46e5}");
    expect(duplicateColors).toEqual([]);
  });

  it("normalizes shorthand hex and rgb() to the same color", () => {
    const { dimensions } = auditDesignSystem(".a{color:#fff}.b{color:#ffffff}.c{color:rgb(255,255,255)}");
    const colors = dimensions.find((d) => d.id === "color")!;
    expect(colors.unique).toBe(1);
    expect(colors.values[0].count).toBe(3);
  });

  it("flags spacing that is off the 4px grid", () => {
    const { offGridSpacing } = auditDesignSystem(".a{padding:13px}.b{margin:16px}.c{gap:9px}");
    expect(offGridSpacing.map((s) => s.value).sort()).toEqual(["13px", "9px"]);
  });

  it("counts rem lengths on the same scale as px", () => {
    const { offGridSpacing } = auditDesignSystem(".a{padding:1rem}.b{padding:0.5rem}");
    expect(offGridSpacing).toEqual([]); // 16px and 8px are both on-grid
  });

  it("reports token adoption", () => {
    expect(auditDesignSystem(SYSTEMATIC).tokenUse.tokens).toBeGreaterThan(5);
    expect(auditDesignSystem(SPRAWL).tokenUse.tokens).toBe(0);
  });

  it("ignores values that only appear in comments", () => {
    const withComment = "/* .old { color:#abcdef; border-radius:3px } */\n.a{color:#111827}";
    const colors = auditDesignSystem(withComment).dimensions.find((d) => d.id === "color")!;
    expect(colors.values.map((v) => v.value)).toEqual(["#111827"]);
  });

  it("surfaces font-family sprawl, !important and magic z-index", () => {
    const a = auditDesignSystem(SPRAWL);
    expect(a.fontFamilies.length).toBe(3);
    expect(a.importantCount).toBe(1);
    expect(a.zIndexOutliers.map((z) => z.value)).toEqual(["9999"]);
  });

  it("renders a report with the score, the drift and a plan", () => {
    const report = designSystemAuditReport(SPRAWL);
    expect(report).toContain("Consistency score");
    expect(report).toContain("Near-duplicate colors");
    expect(report).toContain("Off-grid spacing");
    expect(report).toContain("Consolidation plan");
    expect(report).toContain("generate_design_tokens");
  });

  it("asks for input instead of scoring an empty string", () => {
    expect(designSystemAuditReport("   ")).toMatch(/No source provided/);
  });
});
