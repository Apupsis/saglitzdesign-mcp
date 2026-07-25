import { describe, it, expect } from "vitest";
import { decodePng } from "../dist/png.js";
import { measure } from "../dist/screenshot.js";
import { encodePng, canvasRows } from "./helpers/pngFixture.js";

/**
 * A canvas of a known background with coloured rectangles drawn on it, so
 * every measured number has a known correct answer.
 */
function canvas(
  width: number,
  height: number,
  bg: [number, number, number],
  rects: Array<{ x: number; y: number; w: number; h: number; rgb: [number, number, number] }> = [],
) {
  return decodePng(encodePng({ width, height, colorType: 2, bitDepth: 8, rows: canvasRows(width, height, bg, rects) }));
}

const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [17, 24, 39];      // #111827
const BRAND: [number, number, number] = [79, 70, 229];   // #4f46e5

describe("palette measurement", () => {
  it("reports the dominant colour and its coverage exactly", () => {
    const img = canvas(100, 100, WHITE, [{ x: 0, y: 0, w: 10, h: 10, rgb: INK }]);
    const r = measure(img, { name: "test.png" });
    expect(r.palette.clusters[0].hex).toBe("#ffffff");
    expect(r.palette.clusters[0].coverage).toBeCloseTo(0.99, 2);
    expect(r.palette.clusters[1].hex).toBe("#111827");
    expect(r.palette.clusters[1].coverage).toBeCloseTo(0.01, 3);
  });

  it("counts exact colours and significant ones separately", () => {
    const img = canvas(100, 100, WHITE, [
      { x: 0, y: 0, w: 10, h: 10, rgb: INK },
      { x: 20, y: 0, w: 10, h: 10, rgb: BRAND },
      { x: 40, y: 0, w: 1, h: 1, rgb: [1, 2, 3] }, // 0.01% — below the significance floor
    ]);
    const r = measure(img);
    expect(r.palette.distinctExact).toBe(4);
    expect(r.palette.significant).toBe(3); // the 1px colour is not significant
  });

  it("merges indistinguishable colours into one cluster", () => {
    const img = canvas(100, 100, WHITE, [{ x: 0, y: 0, w: 50, h: 50, rgb: [254, 254, 254] }]);
    const r = measure(img);
    expect(r.palette.distinctExact).toBe(2);
    expect(r.palette.clusters).toHaveLength(1);
    expect(r.palette.clusters[0].members).toBe(1);
  });

  it("records the source dimensions and scale", () => {
    const img = canvas(40, 20, WHITE);
    const r = measure(img, { name: "shot.png", scale: 2 });
    expect(r.source).toMatchObject({ name: "shot.png", width: 40, height: 20, scale: 2 });
  });
});

describe("density measurement", () => {
  it("reports background coverage and empty bands", () => {
    // two 10px-tall bars with gaps above, between and below
    const img = canvas(100, 100, WHITE, [
      { x: 10, y: 10, w: 80, h: 10, rgb: INK },
      { x: 10, y: 50, w: 80, h: 10, rgb: INK },
    ]);
    const r = measure(img);
    expect(r.density.backgroundCoverage).toBeCloseTo(0.84, 2);
    expect(r.density.largestEmptyBand).toBe(40); // rows 60..99
    expect(r.density.emptyBands).toBe(3);        // 0..9, 20..49, 60..99
  });
});
