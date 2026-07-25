import { describe, it, expect } from "vitest";
import { colorDistance, rgbDistance, clusterAll, clusterColors, INDISTINGUISHABLE, hexToRgb } from "../dist/colorutil.js";

describe("colour distance", () => {
  it("is zero for identical colours and maximal for black vs white", () => {
    expect(colorDistance("#4f46e5", "#4f46e5")).toBe(0);
    expect(Math.round(colorDistance("#000000", "#ffffff"))).toBe(765);
  });

  it("calls a 1-step difference indistinguishable and a real difference not", () => {
    expect(colorDistance("#ffffff", "#fefefe")).toBeLessThan(INDISTINGUISHABLE);
    expect(colorDistance("#111827", "#4f46e5")).toBeGreaterThan(INDISTINGUISHABLE);
  });

  it("parses hex to rgb", () => {
    expect(hexToRgb("#4f46e5")).toEqual({ r: 79, g: 70, b: 229 });
  });

  it("rgbDistance agrees with colorDistance without parsing strings", () => {
    // The hot pixel loop uses the numeric form; the two must never disagree.
    expect(rgbDistance(255, 255, 255, 254, 254, 254)).toBeCloseTo(colorDistance("#ffffff", "#fefefe"), 10);
    expect(rgbDistance(17, 24, 39, 79, 70, 229)).toBeCloseTo(colorDistance("#111827", "#4f46e5"), 10);
  });
});

describe("clustering", () => {
  const colors = [
    { value: "#ffffff", count: 100 },
    { value: "#fefefe", count: 10 },
    { value: "#111827", count: 50 },
    { value: "#4f46e5", count: 5 },
  ];

  it("clusterAll returns every colour exactly once, singletons included", () => {
    const all = clusterAll(colors);
    expect(all.map((c) => c.keep).sort()).toEqual(["#111827", "#4f46e5", "#ffffff"]);
    const white = all.find((c) => c.keep === "#ffffff")!;
    expect(white.members.map((m) => m.value)).toEqual(["#fefefe"]);
    expect(white.count).toBe(110); // keep + members
  });

  it("keeps the most-used colour of a cluster", () => {
    const all = clusterAll([{ value: "#fefefe", count: 3 }, { value: "#ffffff", count: 99 }]);
    expect(all).toHaveLength(1);
    expect(all[0].keep).toBe("#ffffff");
  });

  it("clusterColors reports only clusters that absorb something", () => {
    const merged = clusterColors(colors);
    expect(merged).toHaveLength(1);
    expect(merged[0].keep).toBe("#ffffff");
    expect(merged[0].drop[0].value).toBe("#fefefe");
  });
});
