# SEO/GEO and Performance Auditors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two auditors that check what a page actually authored — `audit_seo_geo` and `audit_performance` — returning structured output from the first commit.

**Architecture:** The scanning primitives three modules now share move to `src/scan.ts` first, then the two auditors are built on them in the shape `audit_security` and `audit_generic_design` proved: snippet-or-directory input, `LintFinding` findings, an explicit statement of what was not checked. Both declare an `outputSchema` and return `structuredContent`.

**Tech Stack:** TypeScript (ESM, `node16`), Zod, `@modelcontextprotocol/sdk` 1.29 (which already supports `outputSchema`), Vitest. Tests import from `dist/`.

## Global Constraints

- **These tools audit what is authored, not what is measured.** A rule may state a fact about the source with a documented causal link — "the hero image carries `loading=\"lazy\"`". No rule, message or summary may assert or imply a Core Web Vitals verdict. Vitals are 75th-percentile field data; this reads source.
- **Only facts become rules**, carried over from the generic-design package. A rule that cannot be stated as a fact about the source is cut, not softened.
- **No new runtime dependencies.** No HTML parser, no XML parser, no network call — in source or tests.
- **No running anything.** No Lighthouse, no headless browser.
- Node ≥ 20, TypeScript ESM with `node16` resolution — relative imports carry `.js`.
- **Every rule sets `doc`** to a knowledge document id that exists **and** that actually makes the rule's claim. Valid: `technical-seo`, `on-page-seo`, `seo-for-designers`, `geo-fundamentals`, `geo-tactics-checklist`, `accessibility`, `design-engineering`, `modern-css-design-primitives`.
- **Commit messages carry NO AI/assistant attribution** — no `Co-Authored-By: Claude`, no "Generated with". Absolute.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/scan.ts` | new — the scanning primitives three modules share |
| `src/security.ts`, `src/generic.ts` | *modified* — import from `scan.ts` instead of defining |
| `src/index.ts` | *modified* — `tool()` accepts an optional `outputSchema`; two registrations |
| `src/seo.ts` | new — SEO/GEO rules, report, structured result |
| `src/perf.ts` | new — performance rules, report, structured result |
| `tests/scan.test.ts`, `tests/seo.test.ts`, `tests/perf.test.ts` | new |
| `tests/integrity.test.ts`, `tests/server.test.ts` | *modified* — tool names, SMOKE entries |

---

### Task 1: `src/scan.ts` — pay the shared-primitive debt

**Files:**
- Create: `src/scan.ts`, `tests/scan.test.ts`
- Modify: `src/security.ts`, `src/generic.ts`, `src/lint.ts`

**Interfaces:**
- Produces: `maskComments(source, path)`, `elementSpan(masked, tag)`, `flattenTags(src)`, re-exported `scanTags` and `Tag`.

This is a **pure move**. `maskComments` lives in `security.ts` and is imported by `generic.ts`; `elementSpan` and `flattenTags` are private in `generic.ts` and this package needs both. Two earlier tasks left a note saying these belong in a shared module once a third consumer appears. This package is the third consumer.

- [ ] **Step 1: Move, do not rewrite**

Create `src/scan.ts`. Move the three function bodies **byte-for-byte**, with their comments — those comments record three fix rounds of reasoning about comment masking and nested elements, and rewriting them loses it. Re-export `scanTags` and `Tag` from `./lint.js` so consumers have one import.

Then change `security.ts` and `generic.ts` to import from `./scan.js`. `security.ts` keeps exporting `maskComments` for one release so nothing outside breaks; mark it `@deprecated - import from scan.js`.

- [ ] **Step 2: The suite is the proof**

```bash
npm test
```

Expected: **720 passing, unchanged.** This task adds no behaviour. If a single test moves, the move was not pure — find what changed rather than updating the test.

- [ ] **Step 3: Add the characterisation tests the primitives never had**

`tests/scan.test.ts`: `maskComments` is length-preserving for every syntax it handles (`<!-- -->`, `//`, `/* */`, JSX `{/* */}`, `#` in `.toml`/`_headers`, and `.astro` frontmatter, which splits and recurses). That property is load-bearing — `security.ts` and `generic.ts` both slice by offset against the unmasked source — and no test asserts it directly today.

- [ ] **Step 4: Commit**

```bash
git add src/scan.ts src/security.ts src/generic.ts tests/scan.test.ts
git commit -m "refactor: give the shared scanning primitives one home

maskComments, elementSpan and flattenTags were spread across security.ts
and generic.ts, each exported or made private according to which module
happened to need it first. Two tasks left a note that they belong
together once a third consumer appeared; the SEO and performance
auditors are the third.

A pure move — the bodies and their comments are byte-identical, because
those comments record three fix rounds of reasoning about comment
masking and nested elements. The suite is the proof: 720 before, 720
after.

Adds the characterisation test the primitives never had: maskComments is
length-preserving for every syntax it handles, which is what lets both
callers slice by offset against unmasked source."
```

---

### Task 2: Structured output in the `tool()` wrapper

**Files:**
- Modify: `src/index.ts`
- Test: `tests/server.test.ts`

**Interfaces:**
- Produces: `tool(name, description, inputSchema, cb, outputSchema?)` — the fifth parameter optional, so all thirty-one existing registrations are untouched.

- [ ] **Step 1: Write the failing test**

In `tests/server.test.ts`, assert that a tool registered with an `outputSchema` advertises it in `tools/list`, and that every tool registered **without** one still advertises none. The second half matters: this must not accidentally give thirty-one tools an empty schema.

- [ ] **Step 2: Widen the wrapper**

```ts
function tool(
  name: string,
  description: string,
  schema: Record<string, unknown>,
  cb: (args: any) => unknown,
  outputSchema?: Record<string, unknown>,
) {
  const title = name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (server.registerTool as (n: string, c: unknown, cb: unknown) => unknown)(
    name,
    {
      title,
      description,
      inputSchema: schema,
      ...(outputSchema ? { outputSchema } : {}),
      annotations: { title, ...READONLY_ANNOTATIONS },
    },
    cb,
  );
}
```

The spread is conditional so the key is **absent**, not `undefined`, on tools that do not declare one.

- [ ] **Step 3: Run tests, commit**

```bash
npm test
git add src/index.ts tests/server.test.ts
git commit -m "feat: let a tool declare an output schema

The SDK has supported outputSchema since before 1.29 and no tool here
used it, so every result was prose an agent had to parse. The wrapper now
passes one through when given, spread conditionally so the key is absent
rather than undefined on the thirty-one tools that declare none.

This is package D's core arriving early for the two auditors being
written now, rather than rewriting them when D lands."
```

---

### Task 3: `src/seo.ts` — the SEO/GEO rules

**Files:**
- Create: `src/seo.ts`, `tests/seo.test.ts`

**Interfaces:**
- Produces: `seoRules(code, filename?): LintFinding[]`, `seoConfigRules(files): LintFinding[]`, `SEO_EXTENSIONS`, `SEO_FILENAMES`.

Rules, from the spec. Each cites a document that makes its claim:

| Rule | Severity | `doc` |
|---|---|---|
| `title-missing`, `title-length` (outside 30–60 chars) | warning | `on-page-seo` |
| `meta-description-missing`, `meta-description-length` (outside 70–160) | warning | `on-page-seo` |
| `multiple-h1` | warning | `on-page-seo` |
| `heading-order-skipped` | info | `accessibility` |
| `canonical-missing`, `canonical-not-absolute` | warning | `technical-seo` |
| `canonical-points-elsewhere` | error | `technical-seo` |
| `hreflang-not-reciprocal` | warning | `technical-seo` |
| `jsonld-unparseable` | error | `technical-seo` |
| `jsonld-missing-required` | warning | `technical-seo` |
| `og-incomplete` | info | `on-page-seo` |
| `alt-missing` | warning | `accessibility` |
| `robots-blocks-everything` | error | `technical-seo` |
| `robots-blocks-ai-crawlers` | info | `geo-fundamentals` |
| `llms-txt-absent` | info | `geo-tactics-checklist` |
| `sitemap-not-referenced` | info | `technical-seo` |
| `content-not-in-html` | warning | `technical-seo` |

- [ ] **Step 1: Write the failing tests, both directions**

The negatives are load-bearing. At minimum these must stay silent:
- A correct Next.js page exporting `metadata` with `title`, `description` and `alternates.canonical` — the metadata is not in the HTML, and flagging it as missing is the false positive that would make this tool useless on the most common stack.
- A 58-character title and a 155-character description.
- One `<h1>` with several `<h2>`s.
- A decorative image with `alt=""` — that is correct, not missing.
- A `robots.txt` that disallows `/admin/` only.
- A documentation page whose `<h3>` follows an `<h2>` in a previous section.
- A JSON-LD block using `@graph`.

And these must fire: two `<h1>`s; a `ld+json` block with a trailing comma; `Disallow: /` under `User-agent: *`; an empty `<div id="root">` beside a single bundle script.

- [ ] **Step 2: Implement**

Reuse `scanTags`, `maskComments` and `elementSpan` from `./scan.js`. Parse JSON-LD with `JSON.parse` inside a `try` — an unparseable block is the finding, not a crash.

**`content-not-in-html` needs care.** Fire only when a root element is empty *and* a script bundle is present *and* the document has no other substantive text. A shell page for a genuinely client-only app is still a fact worth reporting, but a page with real content plus a small mount point must stay silent.

**Framework metadata is not missing metadata.** Before firing `title-missing` or `meta-description-missing` on a `.tsx`/`.jsx`/`.astro`/`.svelte` file, check for a `metadata` export, a `<svelte:head>`, an Astro frontmatter `title`, or a `next-seo`-shaped object. If the file is a framework component and no such export is found, stay silent rather than firing — the metadata may live in a layout this tool was not given.

- [ ] **Step 3: Run tests, commit**

---

### Task 4: `src/perf.ts` — the performance rules

**Files:**
- Create: `src/perf.ts`, `tests/perf.test.ts`

**Interfaces:**
- Produces: `perfRules(code, filename?): LintFinding[]`, `PERF_EXTENSIONS`.

| Rule | Severity | `doc` |
|---|---|---|
| `lazy-hero` — `loading="lazy"` on the first in-document image | error | `technical-seo` |
| `hero-no-fetchpriority` | info | `technical-seo` |
| `css-hero-not-preloaded` | info | `technical-seo` |
| `font-display-missing` | warning | `technical-seo` |
| `font-host-not-preconnected` | info | `technical-seo` |
| `image-without-dimensions` | warning | `technical-seo` |
| `render-blocking-script` | warning | `technical-seo` |
| `third-party-script-count` (> 5 distinct origins) | info | `technical-seo` |

- [ ] **Step 1: Write the failing tests, both directions**

Must stay silent: an image below the fold with `loading="lazy"` (that is correct); an `<img>` with `width`/`height`; one with `aspect-ratio` in a `style`; an `@font-face` with `font-display: swap`; a `<script type="module">` in head; a `<script defer>`; a self-hosted font with no `preconnect` needed; three third-party origins.

Must fire: `loading="lazy"` on the first image; an `<img>` with neither dimensions nor aspect-ratio; an `@font-face` with no `font-display`; a bare `<script src>` in `<head>`.

**The rule most likely to over-fire is `lazy-hero`.** "First in-document image" is a proxy for "LCP element" and it is wrong when the first image is a logo in a header. Require the image to be outside a `<header>`/`<nav>` and to carry no `width` under 100px — or, if that cannot be established as a fact, restrict the rule to the first image inside `<main>` and say so in the not-visible section. **Do not guess.**

- [ ] **Step 2: Implement, run tests, commit**

---

### Task 5: Reports, structured output and both registrations

**Files:**
- Modify: `src/seo.ts`, `src/perf.ts`, `src/index.ts`
- Test: `tests/seo.test.ts`, `tests/perf.test.ts`, `tests/server.test.ts`, `tests/integrity.test.ts`

**Interfaces:**
- Produces: `seoReport(input)`, `perfReport(input)`, each returning `{ text, structured }`; the registered tools `audit_seo_geo` and `audit_performance`.

- [ ] **Step 1: The structured shape**

```ts
{
  findings: Array<{
    rule: string; severity: "error" | "warning" | "info";
    message: string; fix: string; doc: string;
    file?: string; line?: number;
  }>;
  summary: { error: number; warning: number; info: number };
  notVisible: string[];
}
```

Declare it as the `outputSchema` with Zod, and return it as `structuredContent` beside the text. `notVisible` is a machine-readable array, not prose — an agent chaining `audit → fix` needs to know what was not checked as much as what was.

**`notVisible` must include, for both tools:**
- Nothing here is measured. Core Web Vitals are 75th-percentile field data; these are authored signals in source.
- Metadata or headers a framework injects at build or request time.
- Anything requiring the whole site graph — broken links, orphan pages, redirect chains.
- For `audit_seo_geo`: whether the content deserves to rank. That is `audit_ux_copy` and `on-page-seo`.

- [ ] **Step 2: Register both tools**

Through the existing `tool()` wrapper, now with the fifth argument. Add `SMOKE` entries in `tests/server.test.ts` and `TOOL_NAMES` entries in `tests/integrity.test.ts`.

Each description must state plainly that the tool reads source and does not measure, so a client does not call it expecting a vitals report.

- [ ] **Step 3: Assert the structured output**

Test that `structuredContent` validates against the declared `outputSchema`, and that `summary` agrees with `findings` — a summary that drifts from its own findings is the kind of silent wrongness this project exists to avoid.

- [ ] **Step 4: Run tests, preflight, commit**

---

### Task 6: The per-stack fixture matrix

**Files:**
- Modify: `tests/seo.test.ts`, `tests/perf.test.ts`

Both prior packages arrived at this and one of them needed nine defects to get there. It applies here from the start.

- [ ] **Step 1: Build correctly-made pages, one per stack**

A Next.js App Router page with generated `metadata`; an Astro page with frontmatter metadata; a SvelteKit page with `<svelte:head>`; a plain static HTML page; a Docusaurus-style documentation page. Each **correct** — proper title and description lengths, one `<h1>`, canonical, sized images, deferred scripts, `font-display`.

Each asserts **zero findings** from both auditors.

**A fixture that scores clean because it contains nothing is worthless.** Each must be substantial: real metadata, several images, a font declaration, third-party scripts within budget, headings in order.

Write them as a developer would, then run them. Do not consult the rules first.

- [ ] **Step 2: One deliberately broken page**

Asserting a specific finding set by name, so the matrix proves it can tell the difference rather than returning clean for everything.

- [ ] **Step 3: The two-way citation test**

Every `doc` id emitted by any rule resolves **and** the cited document contains a word the rule declares. This is the check the generic-design package arrived at after a rule cited a real document that did not make its claim — carried over rather than rediscovered.

- [ ] **Step 4: Run tests, commit**

---

### Task 7: README, CHANGELOG and v0.22.0

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `package.json`, `server.json`

- [ ] **Step 1: Counts and rows**

README: the tool count (31 → 33), rows for both tools matching their neighbours' style, and any other count that has gone stale. Check the whole file — this project's README has been found understated twice.

CHANGELOG: a `## [0.22.0]` entry in the house voice, leading with the problem. The opening fact: `seo_geo_guide` has returned the guides since v0.9.0 and nothing checked the page, so a team could read every word and still ship a hero image with `loading="lazy"`, three H1s and a canonical pointing at staging.

Record that these are the first tools to return structured output, and the governing rule — authored, not measured.

- [ ] **Step 2: Verify and commit**

```bash
npm test && npm run preflight && npm run smoke
```

Then run both tools against this repository's `recipes/` directory and against a real page in it, and report what they say. If they call hand-written reference components broken, a rule is wrong.

---

## Self-Review

**Spec coverage.** Every section maps to a task: the shared-primitive move to Task 1 (which the spec did not name but which the package needs and two prior tasks promised); the wrapper change and structured output to Tasks 2 and 5; the two rule sets to Tasks 3 and 4; the fixture matrix and citation test to Task 6; counts and version to Task 7.

**The riskiest rules, named rather than hidden.** `lazy-hero` uses "first in-document image" as a proxy for the LCP element and will be wrong on a header logo — Task 4 requires that to be resolved as a fact or scoped down and disclosed. `content-not-in-html` must separate a genuine client-only shell from a page with content plus a mount point. `title-missing` on framework components is the false positive most likely to make the tool useless on the most common stack, and Task 3 requires it to stay silent when metadata may live in a layout it was not given.

**Type consistency.** `LintFinding` is used unchanged throughout. `seoRules(code, filename?)` and `perfRules(code, filename?)` keep their signatures from their own tasks onward. The structured shape in Task 5 is the same object both reports return.
