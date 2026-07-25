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

describe("PNG decoding — other colour types", () => {
  it("decodes 8-bit greyscale by replicating the channel", () => {
    const img = decodePng(encodePng({ width: 2, height: 1, colorType: 0, bitDepth: 8, rows: [[0, 255]] }));
    expect(px(img, 0, 0)).toBe("#000000");
    expect(px(img, 1, 0)).toBe("#ffffff");
  });

  it("decodes greyscale + alpha", () => {
    const img = decodePng(encodePng({ width: 2, height: 1, colorType: 4, bitDepth: 8, rows: [[128, 64, 200, 255]] }));
    expect(px(img, 0, 0)).toBe("#808080");
    expect(alpha(img, 0, 0)).toBe(64);
    expect(alpha(img, 1, 0)).toBe(255);
  });

  it("resolves 8-bit palette indices through PLTE", () => {
    const img = decodePng(encodePng({
      width: 3, height: 1, colorType: 3, bitDepth: 8, rows: [[0, 1, 2]],
      palette: [17, 24, 39, 79, 70, 229, 255, 255, 255],
    }));
    expect(px(img, 0, 0)).toBe("#111827");
    expect(px(img, 1, 0)).toBe("#4f46e5");
    expect(px(img, 2, 0)).toBe("#ffffff");
  });

  it("applies tRNS alpha to palette entries", () => {
    const img = decodePng(encodePng({
      width: 2, height: 1, colorType: 3, bitDepth: 8, rows: [[0, 1]],
      palette: [255, 0, 0, 0, 0, 255], trns: [0, 200],
    }));
    expect(alpha(img, 0, 0)).toBe(0);
    expect(alpha(img, 1, 0)).toBe(200);
  });

  it("unpacks sub-byte palette depths", () => {
    // bitDepth 4 → two indices per byte: 0x01 = indices 0 then 1
    const img = decodePng(encodePng({
      width: 2, height: 1, colorType: 3, bitDepth: 4, rows: [[0x01]],
      palette: [17, 24, 39, 255, 255, 255],
    }));
    expect(px(img, 0, 0)).toBe("#111827");
    expect(px(img, 1, 0)).toBe("#ffffff");
  });

  it("reduces 16-bit samples to 8 by keeping the high byte", () => {
    // one RGB pixel: r=0x1122, g=0x3344, b=0x5566 → #113355
    const img = decodePng(encodePng({
      width: 1, height: 1, colorType: 2, bitDepth: 16, rows: [[0x11, 0x22, 0x33, 0x44, 0x55, 0x66]],
    }));
    expect(px(img, 0, 0)).toBe("#113355");
  });
});
