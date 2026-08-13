# Generic-Design Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the anti-slop guidance the knowledge base already carries into rules that fire — an `audit_generic_design` tool that names the AI-default signals in source and copy, and scores them.

**Architecture:** A new `src/generic.ts` mirroring the shape `audit_security` proved: snippet-or-directory input, findings in the existing `LintFinding` form, an explicit statement of what the audit could not see. It reuses `scanTags` and `maskComments` rather than growing a third scanner. `src/lint.ts` is not touched — `design_lint` keeps its six focused rules.

**Tech Stack:** TypeScript (ESM, `node16` resolution), Zod for tool schemas, `@modelcontextprotocol/sdk`, Vitest. Tests import from `dist/`, so `npm test` builds first.

## Global Constraints

- **Only facts become rules.** A rule ships only if it can be stated as a fact about the source. "`from-indigo-500 to-purple-600` is present" qualifies; "the palette is timid" does not and belongs to `design_review_checklist`.
- **No heuristics, and the clean case must be provably clean.** A false positive here is worse than in the security tool: a developer told their deliberate indigo brand is "AI slop" has no external authority to check it against, and stops reading the output.
- **No new runtime dependencies.** The package ships `@modelcontextprotocol/sdk` and `zod` only.
- **No network call**, in source or tests.
- **Node ≥ 20**, TypeScript ESM with `node16` resolution — relative imports carry the `.js` extension even from `.ts` files.
- **Every rule sets `doc`** to a knowledge document id that exists. Valid targets: `ai-default-aesthetic` (new), `typography-craft`, `visual-craft-standards`, `ux-writing`, `design-critique-scoring`, `iconography`, `clean-app-design`.
- **The score counts distinct signals, not occurrences.** Each rule contributes its weight at most once.
- **Permitted sources for the new knowledge document:** `tailwindcss.com`, `ui.shadcn.com`, `rsms.me`, `fonts.google.com`, `lucide.dev`, `heroicons.com`, `developer.mozilla.org`, `caniuse.com`, plus anything already on the security allowlist. **Not** design blogs, listicles, Medium/dev.to, or agency marketing.
- **Commit messages carry NO AI/assistant attribution** — no `Co-Authored-By: Claude`, no "Generated with" line. Absolute.

---

## File Structure

| File | Responsibility |
|---|---|
| `knowledge/craft/ai-default-aesthetic.md` | What the widely-used systems ship as defaults, with sources |
| `src/generic.ts` | Visual rules, copy rules, scoring, report |
| `src/security.ts` | *Modified* — export `maskComments` (one keyword) |
| `src/index.ts` | *Modified* — tool registration |
| `src/catalog.ts` | *Modified* — wire the new document into review checklists |
| `tests/generic.test.ts` | Rule behaviour both directions; the distinctive-page matrix |
| `tests/integrity.test.ts`, `tests/server.test.ts` | *Modified* — tool name, SMOKE entry |

---

### Task 1: The `ai-default-aesthetic` document

**Files:**
- Create: `knowledge/craft/ai-default-aesthetic.md`
- Modify: `src/catalog.ts` (`REVIEW_MAP`, `ROADMAPS`)

**Interfaces:**
- Consumes: nothing.
- Produces: doc id `ai-default-aesthetic`, cited by most rules in Tasks 2 and 3.

- [ ] **Step 1: Write the document**

Frontmatter, verbatim:

```markdown
---
id: ai-default-aesthetic
title: "The AI-Default Aesthetic — What the Systems Ship"
category: craft
platform: web
tags: [craft, ai, defaults, tailwind, shadcn, typography, color, icons]
sources: ["https://tailwindcss.com/docs/colors", "https://ui.shadcn.com/docs/theming", "https://ui.shadcn.com/docs/installation", "https://rsms.me/inter/", "https://lucide.dev/", "https://heroicons.com/", "https://fonts.google.com/specimen/Inter", "https://tailwindcss.com/docs/box-shadow", "https://tailwindcss.com/docs/border-radius"]
updated: 2026-08-13
---
```

**The governing instruction for this document — read it before writing a word.**

Everything written about "AI slop design" is opinion, and none of it is citable
here. So do not write commentary. Write a **catalogue of defaults**: for each
widely-used system, what it actually ships, cited to that system's own
documentation, and the specific thing that makes it recognisable when it goes
unchanged.

*"Indigo gives away AI"* is an opinion and must not appear.
*"Tailwind's palette ships `indigo-500` as its stock accent, and `indigo`/`violet`/`purple` sit adjacent on its ramp, so the default gradient pair is two neighbours from the same region"* is a fact, verifiable at `tailwindcss.com`, and lets the reader draw their own conclusion.

Required sections:

1. **`## Why defaults converge`** — one short paragraph. Component systems ship defaults; generated code reaches for defaults; the same defaults therefore appear across unrelated products. State the mechanism, not a judgement about the result.
2. **`## The palette`** — Tailwind's stock accent and the indigo/violet/purple adjacency, with the actual hex values from the current palette (verify them; the palette changed in v4). Name the exact gradient class pairs that appear most often.
3. **`## The typeface`** — Inter's role as the default in shadcn/ui and across component libraries, cited to their docs. Cross-link `[[typography-craft]]`, which already carries the reflex-reject list, rather than restating it.
4. **`## The component chrome`** — the `rounded-2xl` + `shadow-lg` + `border` combination, and what Tailwind's own defaults are for each, so the reader can see which part is the system and which part is the habit.
5. **`## The icons`** — Lucide and Heroicons as the pairings that ship with these systems, cited to their own sites; and emoji standing in for icons, which no system ships and which is purely a generation habit.
6. **`## The copy`** — the phrase families that recur. Cross-link `[[ux-writing]]`, which already bans AI-slop loading copy, rather than duplicating it.
7. **`## Escaping a default is not the same as being bold`** — the shortest section. Cross-link `[[visual-craft-standards]]`'s "bolder without slop" and `[[design-critique-scoring]]`'s slop test. Swapping indigo for teal changes nothing; the point is intent, not novelty.

Match the register of `knowledge/craft/typography-craft.md` — read it first. Prescriptive, specific, no filler.

- [ ] **Step 2: Wire it in — the suite fails otherwise**

`tests/integrity.test.ts` asserts no knowledge document is orphaned from every checklist and roadmap. Add `"ai-default-aesthetic"` to `REVIEW_MAP.website`, `REVIEW_MAP["landing-page"]` and `REVIEW_MAP.dashboard` — all three already carry `visual-craft-standards`, which is the document it sits beside — and to a phase of `ROADMAPS["website"]` and `ROADMAPS["landing-page"]`.

**Add the doc id and nothing else.** Do not edit any `goal` string or other existing text in `src/catalog.ts`.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: PASS. The suite stands at 563 tests across 24 files; all must still pass.

- [ ] **Step 4: Commit**

```bash
git add knowledge/craft/ai-default-aesthetic.md src/catalog.ts
git commit -m "feat: catalogue the defaults the widely-used systems ship

Everything written about generated-looking design is opinion and none of
it is citable. So this documents what the systems actually ship — the
stock accent on Tailwind's ramp, shadcn/ui's default font and component
chrome, the icon sets that pair with them — each cited to that system's
own documentation.

The reader gets the name and origin of the default they are trying to
escape, which is the actionable half. The conclusion their own eyes
already support is left to them."
```

---

### Task 2: Visual rules

**Files:**
- Create: `src/generic.ts`
- Modify: `src/security.ts` (export `maskComments`)
- Test: `tests/generic.test.ts`

**Interfaces:**
- Consumes: `LintFinding`, `scanTags`, `Tag` from `./lint.js`; `maskComments` from `./security.js`.
- Produces:
  - `export function genericVisualRules(code: string, filename?: string): LintFinding[]`
  - Rule ids: `ai-default-gradient`, `default-ui-font`, `emoji-as-icon`, `uniform-card-grid`, `stock-card-chrome`, `eyebrow-over-every-heading`, `gradient-text`, `stock-glass-on-dark`.
  - `export function isBrandSurface(code: string, filename?: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `tests/generic.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { genericVisualRules } from "../dist/generic.js";

const ids = (code: string, filename?: string) =>
  genericVisualRules(code, filename).map((f) => f.rule).sort();

describe("visual rules — fire when they should", () => {
  it("flags an indigo-to-violet Tailwind gradient", () => {
    expect(ids(`<div class="bg-gradient-to-r from-indigo-500 to-purple-600">`)).toContain("ai-default-gradient");
  });

  it("flags the same gradient written as hex in CSS", () => {
    expect(ids(`.hero { background: linear-gradient(135deg, #6366f1, #a855f7); }`)).toContain("ai-default-gradient");
  });

  it("flags it written in OKLCH, which is how Tailwind v4 actually ships the palette", () => {
    expect(ids(`.hero { background: linear-gradient(135deg, oklch(0.585 0.233 277.117), oklch(0.627 0.265 303.9)); }`)).toContain("ai-default-gradient");
  });

  it("flags the v4 direction utility as readily as the v3 one", () => {
    expect(ids(`<div class="bg-linear-to-r from-indigo-500 to-violet-600">`)).toContain("ai-default-gradient");
  });

  it("flags Inter as the sole family on a brand surface", () => {
    const code = `<h1>Ship faster</h1><a href="/signup">Get started</a><style>body{font-family:Inter,sans-serif}</style>`;
    expect(ids(code, "app/(marketing)/page.tsx")).toContain("default-ui-font");
  });

  it("flags an emoji standing in for an icon in a heading", () => {
    expect(ids(`<h3>🚀 Lightning fast</h3>`)).toContain("emoji-as-icon");
  });

  it("flags three siblings with byte-identical class strings", () => {
    const card = `<div class="rounded-2xl border p-6 shadow-lg"><h3>A</h3></div>`;
    expect(ids(`<div class="grid grid-cols-3">${card}${card}${card}</div>`)).toContain("uniform-card-grid");
  });

  it("flags the stock card chrome triad", () => {
    const card = (n: string) => `<div class="rounded-2xl shadow-lg border p-${n}"><h3>${n}</h3></div>`;
    expect(ids(`${card("4")}${card("6")}${card("8")}`)).toContain("stock-card-chrome");
  });

  it("flags an eyebrow label over every heading", () => {
    const block = `<p class="text-xs uppercase tracking-widest">Features</p><h2>Fast</h2>`;
    expect(ids(block + block + block)).toContain("eyebrow-over-every-heading");
  });

  it("flags gradient text", () => {
    expect(ids(`<span class="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">99%</span>`)).toContain("gradient-text");
  });

  it("flags stock glassmorphism on dark", () => {
    expect(ids(`<div class="backdrop-blur bg-white/10 border border-white/10">`)).toContain("stock-glass-on-dark");
  });
});

describe("visual rules — stay quiet when they should", () => {
  it("accepts a deliberate non-default gradient", () => {
    expect(ids(`<div class="bg-gradient-to-r from-amber-500 to-rose-700">`)).not.toContain("ai-default-gradient");
  });

  it("accepts a single stop from the region — one colour is a choice, not the stock pair", () => {
    expect(ids(`<div class="bg-indigo-600 text-white">`)).not.toContain("ai-default-gradient");
  });

  it("accepts an OKLCH gradient outside the blue-violet band", () => {
    expect(ids(`.hero { background: linear-gradient(135deg, oklch(0.72 0.19 45), oklch(0.55 0.21 25)); }`)).not.toContain("ai-default-gradient");
  });

  it("accepts Inter in application UI", () => {
    const code = `<table><tr><td>row</td></tr></table><style>body{font-family:Inter,sans-serif}</style>`;
    expect(ids(code, "app/dashboard/analytics/page.tsx")).not.toContain("default-ui-font");
  });

  it("accepts Inter paired with a display face on a brand surface", () => {
    const code = `<h1>Ship faster</h1><a href="/signup">Get started</a><style>h1{font-family:"Instrument Serif"}body{font-family:Inter}</style>`;
    expect(ids(code, "app/(marketing)/page.tsx")).not.toContain("default-ui-font");
  });

  it("accepts an emoji in body copy rather than as an icon", () => {
    expect(ids(`<p>We shipped it 🚀 last Tuesday after a long month.</p>`)).not.toContain("emoji-as-icon");
  });

  it("accepts sibling cards that differ", () => {
    const a = `<div class="rounded-2xl border p-6 col-span-2"><h3>A</h3></div>`;
    const b = `<div class="rounded-lg border p-4"><h3>B</h3></div>`;
    const c = `<div class="rounded-xl border p-8"><h3>C</h3></div>`;
    expect(ids(`<div class="grid">${a}${b}${c}</div>`)).not.toContain("uniform-card-grid");
  });

  it("accepts two identical siblings — a pair is not a grid of equals", () => {
    const card = `<div class="rounded-2xl border p-6 shadow-lg"><h3>A</h3></div>`;
    expect(ids(`<div class="grid grid-cols-2">${card}${card}</div>`)).not.toContain("uniform-card-grid");
  });

  it("does not fire on markup inside a comment", () => {
    expect(genericVisualRules(`<!-- <div class="from-indigo-500 to-purple-600"> -->`)).toEqual([]);
  });

  it("returns nothing at all for a distinctive snippet", () => {
    const code = `<h1 style="font-family:'Redaction 35'">Nothing here is stock</h1>`;
    expect(genericVisualRules(code)).toEqual([]);
  });
});

describe("every finding is actionable", () => {
  it("carries a message, a fix and a doc id", () => {
    const findings = genericVisualRules(`<div class="bg-gradient-to-r from-indigo-500 to-purple-600">`);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message.length).toBeGreaterThan(0);
      expect(f.fix.length).toBeGreaterThan(0);
      expect(f.doc).toBeTruthy();
      expect(f.line).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run build && npx vitest run tests/generic.test.ts
```

Expected: FAIL — `dist/generic.js` does not exist.

- [ ] **Step 3: Export `maskComments`**

In `src/security.ts`, change the declaration at roughly line 527 to be exported. Nothing else moves:

```ts
export function maskComments(source: string, path: string): string {
```

Add a line to its existing docblock noting that `generic.ts` consumes it too, and that it belongs in a shared module once a third consumer appears — the same judgement Task 6 of the security plan made for `scanTags`.

- [ ] **Step 4: Implement `src/generic.ts`**

```ts
// Detects the defaults that generated interfaces reach for.
//
// The governing rule, and the reason this module is small: only facts become
// rules. "`from-indigo-500 to-purple-600` is present" is a fact about the
// source. "The palette is timid" is a judgement, and belongs to
// design_review_checklist, which is honest about being one.
//
// A false positive costs more here than in the security auditor. A developer
// told their deliberate indigo brand is "AI slop" has no external authority to
// check that against — there is no spec to appeal to — so they stop reading the
// output entirely. Every negative test in this module's suite is load-bearing.

import { scanTags, type LintFinding, type Tag } from "./lint.js";
import { maskComments } from "./security.js";

const lineOf = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

const classesOf = (tag: Tag): string => {
  const m = /\b(?:class|className)\s*=\s*("([^"]*)"|'([^']*)'|\{`([^`]*)`\})/i.exec(tag.attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
};

// Tailwind's indigo / violet / purple ramps sit adjacent on its scale, so the
// stock gradient is two neighbours from the same region.
//
// Task 1 established two things that shape this. First, v4 authors the palette
// in **OKLCH**, and its docs give hex only as "the nearest hex value" — so a
// hex list can never be more than a convenience match for hand-written CSS,
// and the class-name match is the reliable one. Second, v4 renamed the
// direction utility from `bg-gradient-to-*` to `bg-linear-to-*`; keying on the
// `from-`/`via-`/`to-` stops rather than the direction class means both
// versions are covered without caring which is in use.
//
// Verify these values against tailwindcss.com before changing them; the palette
// moved once already.
const DEFAULT_HEXES = /#(6366f1|818cf8|a5b4fc|8b5cf6|7c3aed|a78bfa|a855f7|c084fc|9333ea|d946ef|615fff|4f39f6)/i;

// The same region expressed in OKLCH, which is how v4 actually ships it: high
// chroma at a hue angle in the blue-violet band. Matched loosely on the hue
// angle, because the exact triples differ per shade and a project writing its
// own OKLCH is not necessarily copying Tailwind's.
const DEFAULT_OKLCH = /oklch\(\s*0?\.\d+\s+0?\.[12]\d*\s+(2[6-9]\d|3[0-1]\d)(?:\.\d+)?\s*\)/i;

// Inter is on typography-craft's reflex-reject list, which is why this rule
// exists — NOT because a component system ships it as a default. Task 1
// verified that shadcn/ui's documentation names no typeface at all, and that
// its stock theme carries no accent hue (`--primary: oklch(0.205 0 0)`). Do not
// write a message that attributes these faces to any system.
const DEFAULT_FAMILIES = /\b(Inter|Roboto|Open Sans|DM Sans|Plus Jakarta Sans)\b/i;

/** Emoji that stand in for an icon. Not an exhaustive emoji set — these six. */
const ICON_EMOJI = /[\u{1F680}\u{1F4A1}\u{2728}\u{26A1}\u{1F525}\u{1F3AF}]/u;

const BRAND_PATH = /(landing|marketing|\(marketing\)|home|hero|www)/i;
const CTA_COPY = /(get started|start free|try .{0,24}free|book a demo|request a demo|sign up free)/i;

/**
 * Inter is the right answer in a dense dashboard and the wrong one on a landing
 * page, so the font rule needs to know which it is looking at. Two signals: the
 * path, and an `<h1>` beside call-to-action copy.
 *
 * When neither fires this returns false and the rule stays silent. Warning a
 * dashboard about its font is precisely the false positive that gets the whole
 * report ignored, so ambiguity resolves toward silence.
 */
export function isBrandSurface(code: string, filename?: string): boolean {
  if (filename && BRAND_PATH.test(filename)) return true;
  return /<h1[\s>]/i.test(code) && CTA_COPY.test(code);
}

export function genericVisualRules(code: string, filename?: string): LintFinding[] {
  const masked = maskComments(code, filename ?? "snippet.html");
  const out: LintFinding[] = [];
  const push = (
    index: number,
    severity: LintFinding["severity"],
    rule: string,
    message: string,
    fix: string,
    doc: string,
  ) => out.push({ line: lineOf(code, index), severity, rule, message, fix, doc });

  // ── gradient ───────────────────────────────────────────────────────────────
  // Two different stops from the default region, not one — a single
  // `bg-indigo-500` is a colour choice, not the stock gradient.
  const gradientStops = [...masked.matchAll(/\b(?:from|via|to)-((?:indigo|violet|purple|fuchsia)-\d{3})/g)];
  const distinctStops = new Set(gradientStops.map((m) => m[1]));
  if (distinctStops.size >= 2) {
    push(gradientStops[0].index!, "warning", "ai-default-gradient",
      `Gradient built from Tailwind's stock indigo/violet/purple region (${[...distinctStops].join(" → ")}).`,
      `Pick stops from your own palette, or drop the gradient — see ai-default-aesthetic for why this pair recurs.`,
      "ai-default-aesthetic");
  } else {
    const inGradient = /linear-gradient|radial-gradient|conic-gradient/i.test(masked);
    const hexes = [...masked.matchAll(new RegExp(DEFAULT_HEXES.source, "gi"))];
    const oklch = [...masked.matchAll(new RegExp(DEFAULT_OKLCH.source, "gi"))];
    const distinct = new Set([...hexes, ...oklch].map((m) => m[0].toLowerCase()));
    if (inGradient && distinct.size >= 2) {
      const at = (hexes[0] ?? oklch[0]).index!;
      push(at, "warning", "ai-default-gradient",
        `Gradient built from two stops in the stock indigo/violet/purple region.`,
        `Pick stops from your own palette, or drop the gradient.`,
        "ai-default-aesthetic");
    }
  }

  // ── typeface ───────────────────────────────────────────────────────────────
  const families = [...masked.matchAll(/font-family\s*:\s*([^;}"']+)/gi)].map((m) => m[1]);
  const declared = families.join(" ");
  const onlyDefault =
    families.length > 0 &&
    DEFAULT_FAMILIES.test(declared) &&
    !/["']?[A-Z][A-Za-z0-9 ]{2,}["']?/.test(declared.replace(DEFAULT_FAMILIES, "").replace(/sans-serif|serif|monospace|system-ui|ui-sans-serif|-apple-system|BlinkMacSystemFont|Segoe UI|Helvetica|Arial/gi, ""));
  if (onlyDefault && isBrandSurface(code, filename)) {
    const at = masked.search(DEFAULT_FAMILIES);
    push(at < 0 ? 0 : at, "warning", "default-ui-font",
      `${DEFAULT_FAMILIES.exec(declared)?.[0]} is the only declared family on what looks like a brand surface.`,
      `Pair it with a display face that carries the brand, or replace it — typography-craft lists the faces to reach past.`,
      "typography-craft");
  }

  // ── tags ───────────────────────────────────────────────────────────────────
  const tags = scanTags(masked);
  const siblings = new Map<string, number>();
  let chromeCount = 0;
  let eyebrowRuns = 0;
  let lastWasEyebrow = false;

  for (const tag of tags) {
    const cls = classesOf(tag);
    const name = tag.name.toLowerCase();

    if (/^h[1-6]$/.test(name)) {
      const body = masked.slice(tag.end, masked.indexOf("<", tag.end + 1));
      if (ICON_EMOJI.test(body)) {
        push(tag.index, "warning", "emoji-as-icon",
          `An emoji is standing in for an icon in a heading.`,
          `Use a real icon from one icon family at one weight — see iconography.`,
          "iconography");
      }
      if (lastWasEyebrow) eyebrowRuns += 1;
      lastWasEyebrow = false;
    }

    if (/\btext-xs\b/.test(cls) && /\buppercase\b/.test(cls) && /\btracking-(wide|wider|widest)\b/.test(cls)) {
      lastWasEyebrow = true;
    }

    if (cls) {
      siblings.set(cls, (siblings.get(cls) ?? 0) + 1);
      if (/\brounded-2xl\b/.test(cls) && /\bshadow-(lg|xl)\b/.test(cls) && /\bborder\b/.test(cls)) chromeCount += 1;
      if (/\bbg-clip-text\b/.test(cls) && /\btext-transparent\b/.test(cls) && /\b(?:from|to)-\w+-\d{3}\b/.test(cls)) {
        push(tag.index, "info", "gradient-text",
          `Gradient-filled text.`,
          `Let the type carry weight on its own; reserve gradient fills for a mark, if at all.`,
          "visual-craft-standards");
      }
      if (/\bbackdrop-blur\b/.test(cls) && /\bbg-white\/(5|10)\b/.test(cls) && /\bborder-white\/10\b/.test(cls)) {
        push(tag.index, "info", "stock-glass-on-dark",
          `The stock glassmorphism recipe: backdrop-blur with white/10 fill and border.`,
          `If the surface needs depth, get it from your elevation scale — see visual-craft-standards.`,
          "visual-craft-standards");
      }
    }
  }

  const repeated = [...siblings.entries()].find(([, n]) => n >= 3);
  if (repeated) {
    push(masked.indexOf(repeated[0]), "info", "uniform-card-grid",
      `${repeated[1]} siblings carry byte-identical class strings, so none of them is the primary one.`,
      `Vary size or emphasis to encode importance — a bento grid without hierarchy is a broken grid.`,
      "visual-craft-standards");
  }
  if (chromeCount >= 3) {
    push(0, "info", "stock-card-chrome",
      `The rounded-2xl + shadow-lg + border triad repeats on ${chromeCount} elements.`,
      `Pick one of the three to carry the separation — see ai-default-aesthetic.`,
      "ai-default-aesthetic");
  }
  if (eyebrowRuns >= 3) {
    push(0, "info", "eyebrow-over-every-heading",
      `${eyebrowRuns} headings are each introduced by a small uppercase label.`,
      `Keep the eyebrow where it earns its place; a label on every section is chrome, not structure.`,
      "visual-craft-standards");
  }

  const seen = new Set<string>();
  return out
    .filter((f) => {
      const key = `${f.rule}:${f.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.line - b.line);
}
```

Adjust the implementation as the tests demand — the brief's code is a starting point, not scripture. If a rule cannot pass both its positive and its negative test, **cut the rule** rather than loosening the negative.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS, all of `tests/generic.test.ts` plus the existing 563.

- [ ] **Step 6: Commit**

```bash
git add src/generic.ts src/security.ts tests/generic.test.ts
git commit -m "feat: detect the visual defaults generated interfaces reach for

Eight rules over markup and styles: the stock indigo/violet gradient, a
default UI font left as the only family on a brand surface, emoji
standing in for icons, sibling cards with byte-identical class strings,
the rounded-2xl/shadow-lg/border triad, an eyebrow over every heading,
gradient-filled text, and the stock glassmorphism recipe.

The font rule is the one that needed a context test. Inter is right in a
dense dashboard and wrong on a landing page, so it fires only where an
h1 sits beside call-to-action copy or the path says marketing — and
stays silent when neither signal is present. Warning a dashboard about
its font is the false positive that gets the whole report ignored."
```

---

### Task 3: Copy rules

**Files:**
- Modify: `src/generic.ts`
- Test: `tests/generic.test.ts`

**Interfaces:**
- Consumes: `genericVisualRules` and its helpers.
- Produces: `export function genericCopyRules(code: string): LintFinding[]` — rule ids `hype-opener`, `filler-adverb`, `generic-cta`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/generic.test.ts`:

```ts
import { genericCopyRules } from "../dist/generic.js";

const copyIds = (code: string) => genericCopyRules(code).map((f) => f.rule);

describe("copy rules", () => {
  it("flags a hype opener", () => {
    expect(copyIds(`<h1>Unlock the power of your data</h1>`)).toContain("hype-opener");
  });

  it("flags filler adverbs", () => {
    expect(copyIds(`<p>Seamlessly integrate with your effortlessly modern stack.</p>`)).toContain("filler-adverb");
  });

  it("flags Get Started and Learn More as the only CTAs", () => {
    expect(copyIds(`<a class="btn">Get Started</a><a class="btn">Learn More</a>`)).toContain("generic-cta");
  });

  it("accepts a specific CTA alongside them", () => {
    const code = `<a class="btn">Start a 14-day trial</a><a class="btn">Learn More</a>`;
    expect(copyIds(code)).not.toContain("generic-cta");
  });

  it("accepts concrete product copy", () => {
    const code = `<h1>Deploy a Postgres branch in 400ms</h1><p>Every pull request gets its own database.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not read copy out of a comment", () => {
    expect(copyIds(`<!-- Unlock the power of your data -->`)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run build && npx vitest run tests/generic.test.ts
```

Expected: FAIL — `genericCopyRules` is not exported.

- [ ] **Step 3: Implement**

Append to `src/generic.ts`. Match on **visible text**, not on markup: strip tags before testing, so a class named `learn-more` is not read as copy. Reuse `maskComments` first, for the same reason the visual rules do.

The three rules:
- `hype-opener` (warning) — `Elevate your`, `Unlock the power of`, `Supercharge`, `Transform your`, `Take your … to the next level`, `Say goodbye to`. Cite `ux-writing`.
- `filler-adverb` (info) — `seamlessly`, `effortlessly`, `revolutionary`, `game-changing`, `cutting-edge`, `best-in-class`, `next-generation`. Cite `ux-writing`.
- `generic-cta` (info) — fires only when every call-to-action-shaped label on the page is drawn from `{Get Started, Learn More, Sign Up, Read More, Contact Us}`. One specific CTA present means the page has made a choice, so the rule stays silent. Cite `ux-writing`.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/generic.ts tests/generic.test.ts
git commit -m "feat: detect the copy patterns that recur in generated pages

Three rules over visible text, not markup: the hype opener, the filler
adverb, and a page whose every call to action is drawn from the stock
set. The last one stays silent as soon as one specific CTA appears — a
page that says 'Start a 14-day trial' has made a choice, and the rule
has nothing to add."
```

---

### Task 4: Scoring, report and tool registration

**Files:**
- Modify: `src/generic.ts`, `src/index.ts`
- Test: `tests/generic.test.ts`, `tests/server.test.ts`, `tests/integrity.test.ts`

**Interfaces:**
- Produces: `export function genericScore(findings: LintFinding[]): { total: number; items: Array<{ rule: string; weight: number; count: number }> }` and `export function genericReport(input: { source?: string; filename?: string; root?: string }): string`, plus the registered tool `audit_generic_design`.

- [ ] **Step 1: Write the failing tests**

```ts
import { genericScore, genericReport } from "../dist/generic.js";

describe("the score", () => {
  it("counts a rule once however many times it fires", () => {
    const card = `<div class="rounded-2xl shadow-lg border"><h3>🚀 Fast</h3></div>`;
    const one = genericScore(genericVisualRules(card));
    const many = genericScore(genericVisualRules(card.repeat(5)));
    const emojiOne = one.items.find((i) => i.rule === "emoji-as-icon")?.weight ?? 0;
    const emojiMany = many.items.find((i) => i.rule === "emoji-as-icon")?.weight ?? 0;
    expect(emojiMany).toBe(emojiOne);
  });

  it("itemises every point it awards", () => {
    const { total, items } = genericScore(genericVisualRules(`<div class="from-indigo-500 to-purple-600">`));
    expect(items.length).toBeGreaterThan(0);
    expect(total).toBe(items.reduce((n, i) => n + i.weight, 0));
  });

  it("scores a distinctive page at zero", () => {
    const code = `<h1 style="font-family:'Redaction 35'">Deploy a Postgres branch in 400ms</h1>`;
    expect(genericScore(genericVisualRules(code)).total).toBe(0);
  });

  it("caps at 100", () => {
    const everything = `<div class="from-indigo-500 to-purple-600 bg-clip-text text-transparent backdrop-blur bg-white/10 border-white/10 rounded-2xl shadow-lg border"><h3>🚀 Fast</h3></div>`;
    expect(genericScore(genericVisualRules(everything.repeat(4))).total).toBeLessThanOrEqual(100);
  });
});

describe("the report", () => {
  it("always states what it could not see", () => {
    expect(genericReport({ source: `<p>Anything</p>` })).toMatch(/not visible to this audit/i);
  });

  it("prints the score itemised, not as a bare number", () => {
    const out = genericReport({ source: `<div class="from-indigo-500 to-purple-600">` });
    expect(out).toMatch(/ai-default-gradient/);
    expect(out).toMatch(/\d+\s*\/\s*100/);
  });
});
```

Add `"audit_generic_design"` to `TOOL_NAMES` in `tests/integrity.test.ts`, and a `SMOKE` entry in `tests/server.test.ts`:

```ts
  audit_generic_design: { code: `<div class="bg-gradient-to-r from-indigo-500 to-purple-600"><h3>🚀 Fast</h3></div>` },
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run build && npx vitest run tests/generic.test.ts tests/server.test.ts tests/integrity.test.ts
```

- [ ] **Step 3: Implement scoring and the report**

Weights, as a single exported table so a change is visible in one place:

```ts
export const RULE_WEIGHTS: Record<string, number> = {
  "ai-default-gradient": 20,
  "default-ui-font": 15,
  "emoji-as-icon": 12,
  "hype-opener": 10,
  "uniform-card-grid": 8,
  "stock-card-chrome": 8,
  "gradient-text": 7,
  "eyebrow-over-every-heading": 6,
  "stock-glass-on-dark": 6,
  "filler-adverb": 5,
  "generic-cta": 3,
};
```

`genericScore` groups findings by rule, awards each rule's weight once, records the occurrence count for display, sums, and caps at 100.

The report mirrors `securityReport`: the itemised score, then findings grouped by severity with `file:line`, then a **"Not visible to this audit"** section that is present in every report including a zero-finding one. Its bullets must say what this tool structurally cannot judge:

- Whether a default was chosen deliberately. A brand whose colour genuinely is indigo will be flagged; the finding names a fact, not a mistake.
- Anything about rendered output — spacing rhythm, optical alignment, how the page actually feels.
- Whether the writing is good. It detects stock phrases, not weak ones.
- Judgement of any kind: `design_review_checklist` and `design-critique-scoring` cover what this deliberately does not.

- [ ] **Step 4: Register the tool**

In `src/index.ts`, register through the existing `tool()` wrapper — it applies `READONLY_ANNOTATIONS`, which `server.test.ts` asserts for every tool. Do not pass an annotations argument. Follow the numbering-comment style of its neighbours. The description must state plainly that the tool reports facts about the source and does not judge taste, so a client does not reach for it expecting a design review.

- [ ] **Step 5: Run the full suite**

```bash
npm test && npm run preflight
```

- [ ] **Step 6: Commit**

```bash
git add src/generic.ts src/index.ts tests/
git commit -m "feat: add the audit_generic_design tool

The score counts distinct signals, not occurrences: a page with forty
cards is not more generic than one with three, and weighting each
occurrence would let page length drive the number. Every point names the
rule that produced it and where it was found, so a reader can disagree
with a line rather than with a verdict.

The report says what it structurally cannot judge — whether a default
was chosen deliberately, anything about rendered output, and taste of
any kind."
```

---

### Task 5: The distinctive-page matrix

**Files:**
- Modify: `tests/generic.test.ts`

**Interfaces:**
- Consumes: `genericReport`, `genericScore`.
- Produces: nothing; this is the gate.

- [ ] **Step 1: Write the matrix**

The security package learned, after nine defects, that tests written from imagination only assert shapes someone already had in mind. This applies that lesson at the start rather than the end.

Build **five deliberately distinctive pages**, each written the way a designer with a point of view would write it, and assert each scores **0**:

1. A brutalist landing page — heavy condensed type, hard borders, no radius, a single accent.
2. A serif editorial layout — a display serif, generous measure, no cards at all.
3. A dense trading dashboard — Inter throughout (this must not fire), tabular numbers, tight spacing, no gradients.
4. A warm consumer app screen — rounded soft type, a peach/clay palette, illustration rather than icons.
5. A monochrome developer tool — system mono, one accent, no shadows.

Each fixture must be realistic enough to exercise the rules: real class strings, real copy, an `<h1>`, several sibling elements. A fixture that scores 0 because it contains nothing is worthless.

Then one deliberately generic page asserting a score above 50, so the matrix proves it can tell the difference rather than merely returning 0 for everything.

- [ ] **Step 2: Run**

```bash
npm test
```

Any fixture that does not score 0 is a false positive. **Fix the rule, not the fixture** — unless the fixture genuinely does carry the signal, in which case say so in the commit.

- [ ] **Step 3: Commit**

```bash
git add tests/generic.test.ts
git commit -m "test: assert five pages with a point of view score zero

Every other test in this file asserts a shape someone already had in
mind. These assert the tool leaves good work alone: a brutalist landing
page, a serif editorial layout, a dense dashboard on Inter, a warm
consumer screen, and a monochrome developer tool.

The dashboard is the one that matters most — it uses Inter throughout,
which the font rule must not flag, because the surface is application UI
and not a brand page."
```

---

### Task 6: README, CHANGELOG and the version

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `package.json`, `server.json`

- [ ] **Step 1: Update the counts and the entry**

README: the summary line's document and tool counts, a row for `audit_generic_design` in the tools table matching its neighbours' style, and `ai-default-aesthetic` in the craft row of "What's inside".

CHANGELOG: a `## [0.21.0]` section in the house voice — lead with the problem, not the feature. The opening fact is that the knowledge base already said what gives a generated page away and nothing enforced it.

Bump the version with `npm version minor --no-git-tag-version` or by running `scripts/sync-version.mjs` after editing `package.json`, so `server.json` stays in step — `npm run preflight` asserts they agree.

- [ ] **Step 2: Verify packaging**

```bash
npm test && npm run preflight && npm run smoke
```

Confirm `knowledge/craft/ai-default-aesthetic.md` ships in the tarball.

- [ ] **Step 3: Run the tool against a real page**

Point `audit_generic_design` at this repository's `recipes/` directory and read the output. The recipes are hand-written reference components; if the tool calls them generic, a rule is wrong and I want to hear it rather than have it pass silently.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md package.json server.json
git commit -m "docs: v0.21.0 — the generic-design detector"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the knowledge document to Task 1; the eight visual rules and the brand-surface test to Task 2; the three copy rules to Task 3; the itemised score, the report and registration to Task 4; the distinctive-page matrix to Task 5; the counts and changelog to Task 6.

**Known soft spots, both stated rather than hidden.** `isBrandSurface` is an inference and will be wrong sometimes; it resolves ambiguity toward silence and Task 5's dashboard fixture pins the direction that matters. `uniform-card-grid` compares class strings byte-for-byte, so a formatter that reorders classes defeats it — that is a miss, not a false positive, which is the right side of this module's asymmetry.

**Type consistency.** `LintFinding` is used unchanged. `genericVisualRules(code, filename?)` and `genericCopyRules(code)` keep their signatures from Task 2 onward. `RULE_WEIGHTS` keys must exactly match the rule ids emitted by both rule functions — Task 4 should assert that in a test rather than trusting it.
