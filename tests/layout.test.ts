import { describe, it, expect } from "vitest";
import { generateLayoutSystem, layoutSystemReport } from "../dist/layout.js";

/** Evaluate a generated clamp() at a given viewport width, in px. */
function clampAt(css: string, viewportPx: number): number {
  const m = css.match(/clamp\(([\d.]+)rem,\s*(-?[\d.]+)rem \+ (-?[\d.]+)vw,\s*([\d.]+)rem\)/);
  if (!m) throw new Error(`not a parseable clamp: ${css}`);
  const [min, intercept, vw, max] = [+m[1] * 16, +m[2] * 16, +m[3], +m[4] * 16];
  return Math.min(Math.max(intercept + (vw / 100) * viewportPx, min), max);
}

describe("generate_layout_system", () => {
  it("defaults to the marketing preset with a 12-column grid", () => {
    const s = generateLayoutSystem();
    expect(s.preset).toBe("marketing-site");
    expect(s.columns).toBe(12);
    expect(s.breakpoints.map((b) => b.name)).toEqual(["sm", "md", "lg", "xl", "2xl"]);
  });

  it("changes the grid with the preset", () => {
    expect(generateLayoutSystem({ preset: "mobile-first" }).columns).toBe(4);
    expect(generateLayoutSystem({ preset: "web-app" }).maxWidth).toBe(1440);
    expect(generateLayoutSystem({ preset: "docs" }).gutter).toBe(32);
  });

  it("honors explicit overrides", () => {
    const s = generateLayoutSystem({ preset: "docs", maxWidth: 1100, columns: 16, gutter: 20 });
    expect([s.maxWidth, s.columns, s.gutter]).toEqual([1100, 16, 20]);
  });

  it("never lets a container exceed the max width", () => {
    const s = generateLayoutSystem({ maxWidth: 800 });
    for (const c of s.containers) expect(c.px, c.name).toBeLessThanOrEqual(800);
  });

  it("keeps breakpoints in ascending order", () => {
    const px = generateLayoutSystem().breakpoints.map((b) => b.px);
    expect([...px].sort((a, b) => a - b)).toEqual(px);
  });

  it("generates fluid section spacing that actually interpolates", () => {
    const report = layoutSystemReport();
    const decl = report.match(/--section-default:\s*([^;]+);/)![1];
    expect(clampAt(decl, 375)).toBeCloseTo(48, 0); // clamped to the minimum
    expect(clampAt(decl, 640)).toBeCloseTo(48, 0); // start of the ramp
    expect(clampAt(decl, 1280)).toBeCloseTo(80, 0); // end of the ramp
    expect(clampAt(decl, 1920)).toBeCloseTo(80, 0); // clamped to the maximum
  });

  it("emits CSS variables, a Tailwind theme and intrinsic layout helpers", () => {
    const report = layoutSystemReport({ preset: "web-app" });
    for (const marker of [
      "--breakpoint-lg",
      "--container-max",
      "--grid-gutter",
      "--measure: 65ch",
      "@theme {",
      "auto-fit",
      "minmax(",
      "padding-inline: var(--edge-padding)",
    ]) {
      expect(report, marker).toContain(marker);
    }
  });

  it("includes container queries by default and can omit them", () => {
    expect(layoutSystemReport()).toContain("@container");
    expect(layoutSystemReport({ containerQueries: false })).not.toContain("@container");
  });

  it("states the rules, not just the numbers", () => {
    const report = layoutSystemReport();
    expect(report).toMatch(/45–75 characters/);
    expect(report).toMatch(/Never name a breakpoint after a device/);
    expect(report).toMatch(/safe-area-inset/);
  });
});
