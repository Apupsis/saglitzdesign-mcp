import { describe, it, expect } from "vitest";
import { maskComments } from "../dist/scan.js";

// `maskComments` is length-preserving by construction — every branch either
// copies a character through unchanged or replaces it with a same-width
// space/newline — and both `security.ts` and `generic.ts` depend on that
// invariant: they consult the masked copy to decide *whether* something is
// live code, then slice the *original, unmasked* source at the same offsets
// to report it. An off-by-one in any branch would silently misalign every
// finding's reported position. Nothing pinned this before now, though a
// reviewer verified it by reading the implementation once.
describe("maskComments — length-preserving for every syntax it handles", () => {
  it("HTML comments <!-- -->", () => {
    const source = `<div>\n<!-- a comment\nspanning lines --><p>text</p>\n</div>`;
    expect(maskComments(source, "page.html").length).toBe(source.length);
  });

  it("line comments //, in a JS-like file", () => {
    const source = `const x = 1; // trailing comment\n// a whole-line comment\nconst y = 2;`;
    expect(maskComments(source, "app.ts").length).toBe(source.length);
  });

  it("block comments /* */, in a JS-like file", () => {
    const source = `const x = /* inline */ 1;\n/*\n * a multi-line\n * block comment\n */\nconst y = 2;`;
    expect(maskComments(source, "app.js").length).toBe(source.length);
  });

  it("JSX comments {/* */}", () => {
    // `{` and `}` are not part of the comment syntax the masker recognises —
    // it is the `/* */` inside them that gets blanked — so this exercises the
    // same block-comment branch on a .jsx path.
    const source = `<div>\n  {/* a JSX comment */}\n  <span>hi</span>\n</div>`;
    expect(maskComments(source, "component.jsx").length).toBe(source.length);
  });

  it("# comments in .toml", () => {
    const source = `# top-level comment\n[headers]\nvalue = "x" # trailing comment\n`;
    expect(maskComments(source, "netlify.toml").length).toBe(source.length);
  });

  it("# comments in _headers", () => {
    const source = `# every route\n/*\n  X-Content-Type-Options: nosniff\n`;
    expect(maskComments(source, "_headers").length).toBe(source.length);
  });

  it(".astro frontmatter: both halves preserve length independently, and so does their concatenation", () => {
    const frontmatter = `---\nconst title = "Home"; // a comment\n/* block */\nconst n = 1;\n---\n`;
    const template = `<h1>{title}</h1>\n<!-- a template comment -->\n<p>body</p>\n`;
    const source = frontmatter + template;

    const closeIdx = source.indexOf("\n---", 3) + 1; // start of the closing fence line
    const frontHalf = source.slice(0, closeIdx);
    const templateHalf = source.slice(closeIdx);

    const maskedFront = maskComments(frontHalf, "frontmatter.ts");
    const maskedTemplate = maskComments(templateHalf, "template.html");
    expect(maskedFront.length).toBe(frontHalf.length);
    expect(maskedTemplate.length).toBe(templateHalf.length);

    const masked = maskComments(source, "page.astro");
    expect(masked.length).toBe(source.length);
    // The two independently-masked halves concatenate back to the same
    // length as masking the whole file in one call — the property the
    // recursive split relies on to keep offsets valid across the fence.
    expect(masked.length).toBe(maskedFront.length + maskedTemplate.length);
  });

  it(".astro with no closing fence falls back to masking the whole thing as template.html", () => {
    const source = `---\nconst title = "Home"; // unterminated frontmatter\n<h1>{title}</h1>\n`;
    expect(maskComments(source, "broken.astro").length).toBe(source.length);
  });

  it("mixed syntaxes in one file stay length-preserving together", () => {
    const source = [
      `<!-- html comment -->`,
      `<script>`,
      `  const s = "// not a comment inside a string";`,
      `  /* a block comment */`,
      `  const t = \`template // still not a comment\`;`,
      `</script>`,
    ].join("\n");
    expect(maskComments(source, "page.vue").length).toBe(source.length);
  });
});
