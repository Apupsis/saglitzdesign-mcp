import { describe, it, expect } from "vitest";
import { decodePng } from "../dist/png.js";
import { measure } from "../dist/screenshot.js";
import { renderMarkdown } from "../dist/report.js";
import { encodePng, canvasRows } from "./helpers/pngFixture.js";

function shot() {
  const rows = canvasRows(100, 100, [255, 255, 255], [{ x: 20, y: 20, w: 60, h: 20, rgb: [17, 24, 39] }]);
  return measure(decodePng(encodePng({ width: 100, height: 100, colorType: 2, bitDepth: 8, rows })), { name: "hero.png" });
}

describe("markdown report", () => {
  const md = renderMarkdown(shot());

  it("states the source and dimensions", () => {
    expect(md).toContain("hero.png");
    expect(md).toContain("100×100");
  });

  it("lists the palette with coverage", () => {
    expect(md).toMatch(/#ffffff/);
    expect(md).toMatch(/#111827/);
    expect(md).toMatch(/%/);
  });

  it("reports contrast with the measured ratio", () => {
    expect(md).toMatch(/17\.\d+:1/);
  });

  it("labels lengths as image pixels when no scale was given", () => {
    expect(md).toMatch(/image px/i);
  });

  it("describes the image, never the interface", () => {
    // The positioning constraint, mechanically checked.
    expect(md).not.toMatch(/your (buttons|layout|design|spacing) (is|are)/i);
    expect(md).toMatch(/detected/i);
  });

  it("carries confidence next to every detection", () => {
    expect(md).toMatch(/confidence: (high|medium)/);
  });
});
