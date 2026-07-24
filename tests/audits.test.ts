import { describe, it, expect } from "vitest";
import { designLint } from "../dist/lint.js";
import { analyzeCopy } from "../dist/uxcopy.js";
import { createDesignSystem } from "../dist/designsystem.js";

describe("design_lint", () => {
  it("flags the classic anti-patterns", () => {
    const code = [
      '<img src="a.png">',
      '<button><svg /></button>',
      '.x { outline: none; font-size: 14px; }',
      '<div onClick={go}>hi</div>',
    ].join("\n");
    const rules = designLint(code).map((f) => f.rule);
    expect(rules).toContain("img-no-alt");
    expect(rules).toContain("icon-button-no-label");
    expect(rules).toContain("outline-none");
    expect(rules).toContain("px-font-size");
    expect(rules).toContain("clickable-div");
  });
  it("does not flag clean, tokenized code", () => {
    const code = [
      '<img src="a.png" alt="A cat">',
      '<button aria-label="Close"><svg /></button>',
      '.x { color: var(--color-primary); font-size: 1rem; }',
    ].join("\n");
    expect(designLint(code)).toHaveLength(0);
  });
  it("does not flag outline:none when paired with focus", () => {
    expect(designLint(".btn:focus { outline: none; box-shadow: 0 0 0 2px blue; }").filter((f) => f.rule === "outline-none")).toHaveLength(0);
  });
  it("reports 1-indexed line numbers", () => {
    const f = designLint('\n\n<img src="x">');
    expect(f[0].line).toBe(3);
  });
});

describe("audit_ux_copy", () => {
  it("scores easy copy high and hard copy low", () => {
    const easy = analyzeCopy("You can turn this on any time. It takes one tap.");
    const hard = analyzeCopy("Leverage our seamless synergy to utilize best-in-class robust functionality.");
    expect(easy.fleschReadingEase).toBeGreaterThan(hard.fleschReadingEase);
    expect(hard.jargonHits.length).toBeGreaterThan(2);
  });
  it("flags filler and weak CTAs", () => {
    expect(analyzeCopy("Just simply click here").fillerHits).toContain("just");
    expect(analyzeCopy("Submit").weakCta).toBe("submit");
    expect(analyzeCopy("Start free trial").weakCta).toBeUndefined();
  });
  it("detects user- vs company-focus", () => {
    const c = analyzeCopy("We built our platform so we can grow our business.");
    expect(c.weCount).toBeGreaterThan(c.youCount);
  });
  it("detects passive voice", () => {
    expect(analyzeCopy("The file was uploaded by the system.").passiveHits.length).toBeGreaterThan(0);
  });
});

describe("create_design_system", () => {
  it("assembles a coherent foundation with all layers", () => {
    const ds = createDesignSystem("#4F46E5", "modern saas dashboard", "web", "Acme");
    for (const marker of ["Acme — design system starter", "## 2. Color", "## 3. Typography", "## 4. Icons", "## 5. Elevation", "## 6. Layout", "## 7. Tokens", "## 8. Components", "## 9. Build checklist"]) {
      expect(ds, marker).toContain(marker);
    }
    expect(ds).toMatch(/@theme|--color-/); // web → tailwind/css tokens
  });

  it("includes a layout layer suited to the platform", () => {
    const web = createDesignSystem("#4F46E5", "modern saas dashboard", "web");
    expect(web).toMatch(/12 columns/);
    expect(web).toMatch(/65ch/);
    expect(web).toContain("generate_layout_system");

    const ios = createDesignSystem("#4F46E5", "premium fintech app", "ios");
    expect(ios).toMatch(/44×44pt/);
    expect(ios).toMatch(/Dynamic Type/);
    expect(ios).not.toMatch(/12 columns/); // a column grid is not how iOS lays out

    const android = createDesignSystem("#4F46E5", "material android app", "android");
    expect(android).toMatch(/48×48dp/);
  });

  it("closes the loop by pointing at its own auditors", () => {
    const ds = createDesignSystem("#4F46E5", "modern saas dashboard", "web");
    expect(ds).toContain("audit_design_system");
    expect(ds).toContain("design_lint");
  });
  it("switches token output by platform", () => {
    expect(createDesignSystem("#e11d48", "premium fintech app", "ios")).toContain("Tokens.swift");
    expect(createDesignSystem("#059669", "material android app", "android")).toContain("Tokens.kt");
  });
});

// Regression suite for the tag-aware linter. Every case here failed (or fired
// falsely) with the earlier line-by-line implementation: Prettier splits JSX
// attributes across lines, so a per-line rule cannot see whether `alt` is
// present, and `outline: none` can only be judged against the whole snippet.
describe("design_lint — formatting must not change the verdict", () => {
  const rules = (code: string) => [...new Set(designLint(code).map((f) => f.rule))].sort();

  it("accepts a multi-line <img> that has alt", () => {
    expect(rules('<img\n  src="/hero.png"\n  alt="Product screenshot"\n/>')).toEqual([]);
  });

  it("still flags a multi-line <img> without alt", () => {
    expect(rules('<img\n  src="/hero.png"\n  className="w-full"\n/>')).toEqual(["img-no-alt"]);
  });

  it("does not guess when attributes arrive via a spread", () => {
    expect(rules('<img src="/a.png" {...rest} />')).toEqual([]);
  });

  it("accepts a multi-line icon button that has aria-label", () => {
    expect(rules('<button\n  aria-label="Delete"\n>\n  <TrashIcon />\n</button>')).toEqual([]);
  });

  it("flags a multi-line icon-only button", () => {
    expect(rules('<button\n  className="p-2"\n>\n  <TrashIcon />\n</button>')).toEqual(["icon-button-no-label"]);
  });

  it("accepts a multi-line button with a real text label", () => {
    expect(rules('<button\n  className="btn"\n>\n  Save changes\n</button>')).toEqual([]);
  });

  it("flags a multi-line clickable div", () => {
    expect(rules("<div\n  onClick={go}\n  className=\"card\"\n>x</div>")).toContain("clickable-div");
  });

  it("flags outline:none when nothing replaces the focus ring", () => {
    expect(rules(".btn:focus { outline: none; }")).toEqual(["outline-none"]);
  });

  it("accepts outline:none paired with a visible :focus-visible style", () => {
    expect(rules(".btn:focus{outline:none}\n.btn:focus-visible{outline:2px solid var(--ring)}")).toEqual([]);
    expect(rules("a:focus{outline:none}\na:focus-visible{box-shadow:0 0 0 3px #99f}")).toEqual([]);
  });

  it("reads Tailwind outline-none with any variant prefix", () => {
    expect(rules('<button className="focus:outline-none">Save changes</button>')).toEqual(["outline-none"]);
    expect(rules('<a className="md:focus:outline-none">Read the docs</a>')).toEqual(["outline-none"]);
    expect(rules('<button className="focus:outline-none focus-visible:ring-2">Save changes</button>')).toEqual([]);
  });

  it("flags a form control with no way to attach a label", () => {
    expect(rules('<input type="email" placeholder="Email" />')).toEqual(["control-no-label"]);
    expect(rules('<label for="e">Email</label><input id="e" type="email" />')).toEqual([]);
  });

  it("reports one finding per rule per line", () => {
    const findings = designLint('<img src="/a.png"><img src="/b.png">');
    expect(findings.filter((f) => f.rule === "img-no-alt").length).toBe(1);
  });
});
