import { describe, it, expect } from "vitest";
import { compareDesignLanguages, COMPARE_TOPICS, COMPARE_PLATFORMS } from "../dist/compare.js";

describe("compare_design_languages", () => {
  it("covers every advertised topic with a complete table", () => {
    for (const topic of COMPARE_TOPICS) {
      const out = compareDesignLanguages(topic);
      expect(out.length, topic).toBeGreaterThan(500);
      expect(out, topic).toContain("Shared intent:");
      expect(out, topic).toContain("## Porting rules");
      expect(out, topic).toContain("## Do NOT port");
      // one header row + one separator row + at least two content rows
      const rows = out.split("\n").filter((l) => l.startsWith("|"));
      expect(rows.length, topic).toBeGreaterThanOrEqual(4);
    }
  });

  it("emits one column per platform, in the requested order", () => {
    const out = compareDesignLanguages("navigation", ["ios", "android"]);
    expect(out).toContain("| iOS (HIG / Liquid Glass) | Android (Material 3) |");
    expect(out).not.toContain("macOS (HIG)");

    const all = compareDesignLanguages("navigation", COMPARE_PLATFORMS);
    for (const label of ["iOS", "Android", "macOS", "Web"]) expect(all).toContain(label);
  });

  it("keeps every table row the same width as its header", () => {
    for (const topic of COMPARE_TOPICS) {
      const lines = compareDesignLanguages(topic, ["ios", "web"]).split("\n").filter((l) => l.startsWith("|"));
      const widths = new Set(lines.map((l) => l.split("|").length));
      expect(widths.size, `${topic}: ragged table`).toBe(1);
    }
  });

  it("never leaves a cell empty", () => {
    for (const topic of COMPARE_TOPICS) {
      const lines = compareDesignLanguages(topic).split("\n").filter((l) => l.startsWith("| **"));
      for (const line of lines) {
        const cells = line.split("|").slice(1, -1).map((c) => c.trim());
        for (const c of cells) expect(c.length, `${topic}: ${line}`).toBeGreaterThan(3);
      }
    }
  });

  it("points at the platform references and the topic docs", () => {
    const out = compareDesignLanguages("buttons");
    expect(out).toContain('get_design_language("material-3")');
    expect(out).toContain('get_design_doc("buttons")');
  });

  it("carries the platform-correct minimum touch targets", () => {
    const out = compareDesignLanguages("buttons");
    expect(out).toContain("44×44pt");
    expect(out).toContain("48×48dp");
    expect(out).toContain("24×24px");
  });
});
