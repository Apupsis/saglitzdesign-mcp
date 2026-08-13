import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadKnowledge, searchKnowledge, sections, tokenize } from "../dist/knowledge.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = loadKnowledge(join(root, "knowledge"));

describe("loadKnowledge", () => {
  it("loads the full knowledge base", () => {
    expect(docs.length).toBeGreaterThanOrEqual(70);
  });
  it("every doc has id, title, category and body", () => {
    for (const d of docs) {
      expect(d.id, d.path).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(d.category).toBeTruthy();
      expect(d.body.length).toBeGreaterThan(0);
    }
  });
  it("ids are unique", () => {
    const ids = docs.map((d) => d.id);
    expect(new Set(ids).size, `duplicate ids: ${ids.filter((v, i) => ids.indexOf(v) !== i)}`).toBe(ids.length);
  });
  it("categories stay within the registered enum", () => {
    const allowed = new Set(["design-language", "component", "ux", "seo", "geo", "pattern", "craft", "book", "process", "marketing", "security"]);
    for (const d of docs) expect(allowed.has(d.category), `${d.id}: ${d.category}`).toBe(true);
  });
});

describe("searchKnowledge", () => {
  it("ranks a title match highly", () => {
    const r = searchKnowledge(docs, "accessibility", { limit: 3 });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].doc.id).toContain("accessibility");
  });
  it("respects the category filter", () => {
    const r = searchKnowledge(docs, "button", { category: "component", limit: 5 });
    for (const hit of r) expect(hit.doc.category).toBe("component");
  });
  it("returns an empty array for an empty query", () => {
    expect(searchKnowledge(docs, "   ", { limit: 3 })).toHaveLength(0);
  });
  it("produces a non-empty excerpt", () => {
    const [top] = searchKnowledge(docs, "typography", { limit: 1 });
    expect(top.excerpt.length).toBeGreaterThan(0);
  });
});

describe("sections", () => {
  it("splits a doc on ## headings", () => {
    const doc = docs.find((d) => d.body.includes("\n## "));
    expect(doc).toBeTruthy();
    expect(sections(doc!).length).toBeGreaterThan(0);
  });
});

describe("inflection should not decide whether a document is findable", () => {
  // Tags were the workaround: every new document needed someone to imagine
  // every form a query might take. "tokens" was in a title and "token" found
  // nothing there. Matching titles and tags is exact-token, so the fix belongs
  // in the tokenizer, not in a growing list of tags.
  const docs = loadKnowledge(join(root, "knowledge"));
  const titleTag = (d: (typeof docs)[number]) =>
    new Set([...tokenize(d.title + " " + d.id), ...d.tags.flatMap(tokenize)]);

  it("matches a singular query against a plural title or tag", () => {
    for (const [singular, plural] of [["token", "tokens"], ["form", "forms"], ["button", "buttons"], ["color", "colors"]]) {
      const found = docs.some((d) => titleTag(d).has(tokenize(singular)[0]));
      expect(found, `"${singular}" should reach a document titled/tagged "${plural}"`).toBe(true);
    }
  });

  it("matches across an -ing form", () => {
    expect(tokenize("naming")).toEqual(tokenize("name"));
    expect(tokenize("searching")).toEqual(tokenize("search"));
  });

  it("does not mangle words that merely end in s or ing", () => {
    // Over-stemming invents matches, which is worse than missing one.
    for (const w of ["css", "class", "status", "focus", "analysis", "string", "spring", "design"]) {
      expect(tokenize(w)[0], w).toBe(w);
    }
  });

  it("leaves short words alone", () => {
    for (const w of ["is", "as", "css", "ios"]) expect(tokenize(w)[0], w).toBe(w);
  });

  it("keeps the searches that already worked", () => {
    for (const [q, expected] of [
      ["primary button size mobile", "buttons"],
      ["core web vitals", "technical-seo"],
      ["dark mode colors", "color-systems"],
    ] as const) {
      expect(searchKnowledge(docs, q, { limit: 3 }).map((r) => r.doc.id), q).toContain(expected);
    }
  });
});
