import { describe, it, expect } from "vitest";
import { decodePng } from "../dist/png.js";
import { encodePng } from "./helpers/pngFixture.js";

/** Read pixel (x,y) as a hex string. */
function px(img: { width: number; data: Uint8Array }, x: number, y: number): string {
  const i = (y * img.width + x) * 4;
  return "#" + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, "0")).join("");
}
function alpha(img: { width: number; data: Uint8Array }, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3];
}

describe("PNG decoding — truecolour", () => {
  const rows = [
    [255, 0, 0, 0, 255, 0, 0, 0, 255],
    [17, 24, 39, 79, 70, 229, 255, 255, 255],
  ];

  it("decodes 8-bit RGB with filter 0", () => {
    const img = decodePng(encodePng({ width: 3, height: 2, colorType: 2, bitDepth: 8, rows }));
    expect([img.width, img.height]).toEqual([3, 2]);
    expect(px(img, 0, 0)).toBe("#ff0000");
    expect(px(img, 0, 1)).toBe("#111827");
    expect(px(img, 1, 1)).toBe("#4f46e5");
    expect(alpha(img, 2, 1)).toBe(255);
  });

  it("decodes identically under every filter type", () => {
    for (const filter of [0, 1, 2, 3, 4] as const) {
      const img = decodePng(encodePng({ width: 3, height: 2, colorType: 2, bitDepth: 8, rows, filter }));
      expect(px(img, 1, 1), `filter ${filter}`).toBe("#4f46e5");
      expect(px(img, 2, 0), `filter ${filter}`).toBe("#0000ff");
      expect(px(img, 0, 1), `filter ${filter}`).toBe("#111827");
    }
  });

  it("decodes 8-bit RGBA and preserves alpha", () => {
    const rgba = [[255, 0, 0, 128, 0, 255, 0, 255]];
    const img = decodePng(encodePng({ width: 2, height: 1, colorType: 6, bitDepth: 8, rows: rgba }));
    expect(px(img, 0, 0)).toBe("#ff0000");
    expect(alpha(img, 0, 0)).toBe(128);
    expect(alpha(img, 1, 0)).toBe(255);
  });
});
