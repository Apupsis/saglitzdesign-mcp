import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKnowledge, mergeKnowledge, searchKnowledge, findDoc } from "../dist/knowledge.js";

// A team's own design rules have to live somewhere the agent looks, and that
// somewhere cannot be inside the installed package — npm update wipes it.
// These tests cover the merge, and above all the override: taking someone
// else's document silently is the failure mode to avoid.

const root = join(__dirname, "..");
let userDir: string;

function doc(dir: string, file: string, frontmatter: string, body = "Body text about buttons.") {
  writeFileSync(join(dir, file), `---\n${frontmatter}\n---\n\n${body}\n`);
}

beforeAll(() => {
  userDir = mkdtempSync(join(tmpdir(), "saglitz-knowledge-"));
  mkdirSync(join(userDir, "nested"), { recursive: true });

  doc(userDir, "house-rules.md",
    'id: house-rules\ntitle: "Acme House Rules"\ncategory: craft\nplatform: both\ntags: [acme, rules]\nupdated: 2026-08-02',
    "Primary buttons are always filled. We never ship an outline primary.");

  // Same id as a built-in — the team deliberately replaces our guidance.
  doc(userDir, "buttons.md",
    'id: buttons\ntitle: "Acme Buttons"\ncategory: component\nplatform: both\ntags: [buttons]\nupdated: 2026-08-02',
    "At Acme a primary button is 48px tall, always.");

  // Opts itself into a review checklist — the difference between searchable
  // and enforced.
  doc(join(userDir, "nested"), "brand-voice.md",
    'id: acme-brand-voice\ntitle: "Acme Brand Voice"\ncategory: craft\nplatform: web\ntags: [voice]\nreview: [website, landing-page]\nupdated: 2026-08-02',
    "We write in second person. Never say 'utilize'.");

  // A category we do not know — must not crash the server.
  doc(userDir, "odd.md",
    'id: acme-odd\ntitle: "Acme Odd"\ncategory: procurement\nplatform: both\ntags: []\nupdated: 2026-08-02',
    "Something outside the vocabulary.");
});

afterAll(() => rmSync(userDir, { recursive: true, force: true }));

describe("loading a user knowledge directory", () => {
  it("marks where each document came from", () => {
    const builtin = loadKnowledge(join(root, "knowledge"));
    const user = loadKnowledge(userDir, "user");
    expect(builtin.every((d) => d.origin === "builtin")).toBe(true);
    expect(user.every((d) => d.origin === "user")).toBe(true);
    expect(user.length).toBe(4); // including the nested one
  });

  it("walks nested directories", () => {
    expect(loadKnowledge(userDir, "user").map((d) => d.id)).toContain("acme-brand-voice");
  });

  it("reads the review opt-in from frontmatter", () => {
    const d = loadKnowledge(userDir, "user").find((x) => x.id === "acme-brand-voice")!;
    expect(d.review).toEqual(["website", "landing-page"]);
  });

  it("defaults review to empty for documents that do not ask", () => {
    const d = loadKnowledge(userDir, "user").find((x) => x.id === "house-rules")!;
    expect(d.review).toEqual([]);
  });

  it("keeps an unknown category rather than dropping the document", () => {
    const d = loadKnowledge(userDir, "user").find((x) => x.id === "acme-odd")!;
    expect(d.category).toBe("procurement");
  });
});

describe("merging", () => {
  const builtin = () => loadKnowledge(join(root, "knowledge"));
  const user = () => loadKnowledge(userDir, "user");

  it("adds the team's documents to the base", () => {
    const { docs } = mergeKnowledge(builtin(), user());
    expect(docs.length).toBe(builtin().length + 3); // 4 user docs, 1 replaces
    expect(findDoc(docs, "house-rules")?.title).toBe("Acme House Rules");
  });

  it("lets a user document replace a built-in of the same id", () => {
    const { docs } = mergeKnowledge(builtin(), user());
    const buttons = findDoc(docs, "buttons")!;
    expect(buttons.title).toBe("Acme Buttons");
    expect(buttons.origin).toBe("user");
    expect(docs.filter((d) => d.id === "buttons")).toHaveLength(1);
  });

  it("REPORTS every override instead of taking it silently", () => {
    const { overridden } = mergeKnowledge(builtin(), user());
    expect(overridden).toEqual(["buttons"]);
  });

  it("reports categories outside the known vocabulary", () => {
    const { unknownCategories } = mergeKnowledge(builtin(), user());
    expect(unknownCategories).toContain("procurement");
  });

  it("keeps the merged set searchable as one base", () => {
    const { docs } = mergeKnowledge(builtin(), user());
    const hits = searchKnowledge(docs, "outline primary filled", { limit: 5 }).map((r) => r.doc.id);
    expect(hits).toContain("house-rules");
  });

  it("is a no-op when there is no user directory", () => {
    const { docs, overridden } = mergeKnowledge(builtin(), []);
    expect(docs.length).toBe(builtin().length);
    expect(overridden).toEqual([]);
  });
});

describe("resilience", () => {
  it("returns nothing for a directory that does not exist, rather than throwing", () => {
    expect(loadKnowledge(join(userDir, "no-such-dir"), "user")).toEqual([]);
  });

  it("skips a file with no id instead of failing the load", () => {
    const d = mkdtempSync(join(tmpdir(), "saglitz-bad-"));
    writeFileSync(join(d, "nope.md"), "# Just a heading, no frontmatter\n");
    doc(d, "ok.md", 'id: fine\ntitle: "Fine"\ncategory: craft\nplatform: both\ntags: []\nupdated: 2026-08-02');
    expect(loadKnowledge(d, "user").map((x) => x.id)).toEqual(["fine"]);
    rmSync(d, { recursive: true, force: true });
  });
});

describe("a team's rules outrank generic guidance", () => {
  const builtin = () => loadKnowledge(join(root, "knowledge"));
  const user = () => loadKnowledge(userDir, "user");

  it("puts a matching user document FIRST, not merely somewhere in the list", () => {
    const { docs } = mergeKnowledge(builtin(), user());
    const hits = searchKnowledge(docs, "outline primary filled", { limit: 5 });
    expect(hits[0].doc.id).toBe("house-rules");
    expect(hits[0].doc.origin).toBe("user");
  });

  it("leads on term coverage, not score — a short doc cannot win on frequency", () => {
    // The built-ins are long and score far higher on raw term counts; the
    // house-rules file wins because it covers every term you asked about.
    const { docs } = mergeKnowledge(builtin(), user());
    const hits = searchKnowledge(docs, "outline primary filled", { limit: 5 });
    expect(hits[0].coverage).toBe(1);
    expect(hits[0].score).toBeLessThan(hits[1].score);
  });

  it("does not inject a user document into a search it has nothing to do with", () => {
    const { docs } = mergeKnowledge(builtin(), user());
    const hits = searchKnowledge(docs, "core web vitals largest contentful paint", { limit: 5 })
      .map((r) => r.doc.id);
    expect(hits).not.toContain("acme-brand-voice");
    expect(hits).not.toContain("acme-odd");
  });

  it("leaves ranking untouched when there are no user documents", () => {
    const only = builtin();
    const a = searchKnowledge(only, "primary button size", { limit: 3 }).map((r) => r.doc.id);
    const { docs } = mergeKnowledge(only, []);
    const b = searchKnowledge(docs, "primary button size", { limit: 3 }).map((r) => r.doc.id);
    expect(b).toEqual(a);
  });
});

describe("coverage gating", () => {
  const builtin = () => loadKnowledge(join(root, "knowledge"));
  const user = () => loadKnowledge(userDir, "user");

  it("reports coverage on every result", () => {
    const { docs } = mergeKnowledge(builtin(), user());
    for (const r of searchKnowledge(docs, "primary button states", { limit: 5 })) {
      expect(r.coverage).toBeGreaterThan(0);
      expect(r.coverage).toBeLessThanOrEqual(1);
    }
  });

  it("does not let a house-rules file lead an unrelated search", () => {
    const { docs } = mergeKnowledge(builtin(), user());
    for (const q of ["core web vitals largest contentful paint", "llms.txt structured data"]) {
      const hits = searchKnowledge(docs, q, { limit: 5 });
      expect(hits[0].doc.origin, q).toBe("builtin");
    }
  });
});
