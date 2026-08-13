import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genericVisualRules, genericCopyRules, genericScore, genericReport, isBrandSurface, RULE_WEIGHTS } from "../dist/generic.js";

const ids = (code: string, filename?: string) =>
  genericVisualRules(code, filename).map((f) => f.rule).sort();

const copyIds = (code: string) => genericCopyRules(code).map((f) => f.rule);

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

  it("flags blue reaching into the core region", () => {
    expect(ids(`<div class="bg-gradient-to-r from-blue-500 to-purple-600">`)).toContain("ai-default-gradient");
  });

  it("flags blue-600 to violet-500 the same way", () => {
    expect(ids(`<div class="bg-gradient-to-r from-blue-600 to-violet-500">`)).toContain("ai-default-gradient");
  });

  it("flags Inter as the sole family on a brand surface", () => {
    const code = `<h1>Ship faster</h1><a href="/signup">Get started</a><style>body{font-family:Inter,sans-serif}</style>`;
    expect(ids(code, "app/(marketing)/page.tsx")).toContain("default-ui-font");
  });

  it("flags two defaults declared together — Inter, Roboto is not a custom face", () => {
    const code = `<h1>Ship faster</h1><a href="/signup">Get started</a><style>body{font-family:Inter,Roboto,sans-serif}</style>`;
    expect(ids(code, "app/(marketing)/page.tsx")).toContain("default-ui-font");
  });

  it("flags an emoji standing in for an icon in a heading", () => {
    expect(ids(`<h3>🚀 Lightning fast</h3>`)).toContain("emoji-as-icon");
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

  it("accepts blue reaching only to cyan — two steps out, never the measured pair", () => {
    expect(ids(`<div class="bg-gradient-to-r from-blue-500 to-cyan-500">`)).not.toContain("ai-default-gradient");
  });

  it("accepts a blue-on-blue gradient — a colour choice, not the stock pair", () => {
    expect(ids(`<div class="bg-gradient-to-r from-sky-400 to-blue-600">`)).not.toContain("ai-default-gradient");
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

  it("accepts an emoji in a changelog heading that carries a version string", () => {
    expect(ids(`<h3>v2.4.0 🚀 Faster builds</h3>`)).not.toContain("emoji-as-icon");
  });

  it("accepts an emoji in a changelog heading with no version number at all", () => {
    expect(ids(`<h2>✨ New in this release</h2>`)).not.toContain("emoji-as-icon");
  });

  it("accepts a deliberate teal-to-lime gradient with unrelated indigo/purple colours elsewhere in the file", () => {
    const code = `.hero { background: linear-gradient(135deg, #14b8a6, #84cc16); }\n.badge { color: #6366f1; }\n.link:hover { color: #a855f7; }`;
    expect(ids(code)).not.toContain("ai-default-gradient");
  });

  it("accepts gradient-filled text outside the stock indigo/violet/purple region", () => {
    expect(ids(`<span class="bg-gradient-to-r from-teal-400 to-lime-400 bg-clip-text text-transparent">99%</span>`)).not.toContain("gradient-text");
  });

  it("does not fire on markup inside a comment", () => {
    expect(genericVisualRules(`<!-- <div class="from-indigo-500 to-purple-600"> -->`)).toEqual([]);
  });

  it("returns nothing at all for a distinctive snippet", () => {
    const code = `<h1 style="font-family:'Redaction 35'">Nothing here is stock</h1>`;
    expect(genericVisualRules(code)).toEqual([]);
  });
});

describe("uniform-card-grid was cut — none of these ever fire it", () => {
  // A review built real inputs and found the byte/set-identical-class-string
  // check firing on every one of these. None of them is the "broken feature
  // grid" the rule was trying to name; all five are ordinary, deliberate
  // uses of a consistent design system. The rule id must never appear again.
  it("three identical cards in a grid — the module's own original positive case", () => {
    const card = `<div class="rounded-2xl border p-6 shadow-lg"><h3>A</h3></div>`;
    expect(ids(`<div class="grid grid-cols-3">${card}${card}${card}</div>`)).not.toContain("uniform-card-grid");
  });

  it("three nav links sharing classes, no grid class anywhere in the document", () => {
    const link = `<a class="text-sm text-gray-500 hover:text-gray-900">Item</a>`;
    expect(ids(`<nav>${link}${link}${link}</nav>`)).not.toContain("uniform-card-grid");
  });

  it("three buttons scattered across nav, section and footer sharing a design-system class", () => {
    const btn = `<button class="rounded-md bg-slate-900 px-4 py-2 text-white">Go</button>`;
    const code = `<nav>${btn}</nav><section>${btn}</section><footer>${btn}</footer>`;
    expect(ids(code)).not.toContain("uniform-card-grid");
  });

  it("three identical dashboard KPI tiles", () => {
    const tile = `<div class="rounded-lg border p-4"><p>Revenue</p></div>`;
    expect(ids(`<div class="grid grid-cols-3">${tile}${tile}${tile}</div>`)).not.toContain("uniform-card-grid");
  });

  it("a three-tier pricing table with identical card chrome", () => {
    const plan = `<div class="rounded-2xl border p-8"><h3>Plan</h3></div>`;
    expect(ids(`<div class="grid grid-cols-3">${plan}${plan}${plan}</div>`)).not.toContain("uniform-card-grid");
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

describe("copy rules — stay quiet on real product copy that shares a verb", () => {
  it("accepts a product description that uses a listed verb without the stock construction", () => {
    expect(copyIds(`<h1>Transform any CSV into a chart in one step</h1>`)).toEqual([]);
  });

  it("judged silent: a single hype word describing an actual claim, not the stacked construction", () => {
    // "revolutionary" is on the filler-adverb list, but it appears once. The
    // same fact-based threshold that keeps a changelog entry silent (below)
    // has to apply here too, or the rule is just a keyword match wearing a
    // count as a disguise — so one adverb, anywhere, stays silent, even when
    // the sentence around it reads as a marketing claim.
    expect(copyIds(`<p>Our revolutionary new pricing is simply lower.</p>`)).toEqual([]);
  });

  it("accepts a changelog entry using one filler word — a feature note, not marketing", () => {
    expect(copyIds(`<li>Effortlessly resume interrupted uploads</li>`)).toEqual([]);
  });

  it("accepts a page whose only CTAs are one specific action and one stock label", () => {
    const code = `<a class="btn">Start a 14-day trial</a><a class="btn">Learn More</a>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not flag stock copy quoted in prose as an example of what not to write", () => {
    const code = `<p>Avoid headlines like "Unlock the power of your data" — describe the actual feature instead.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not flag stock copy quoted inside inline code in a documentation page", () => {
    const code = `<p>Don't write <code>"Unlock the power of your data"</code> as a headline.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not read hype-opener or filler-adverb phrases out of a comment", () => {
    const code = `<!-- Unlock the power of your data. Seamlessly integrate with your effortlessly modern stack. -->`;
    expect(copyIds(code)).toEqual([]);
  });
});

describe("copy rules — supercharge matches a construction, not the bare word", () => {
  it("flags the real signal: a short, generic, sentence-final object", () => {
    expect(copyIds(`<h1>Supercharge your workflow</h1>`)).toContain("hype-opener");
  });

  it("accepts a blog title — a specific, named object, not the stock short noun", () => {
    expect(copyIds(`<h2>Supercharge Your Local Dev Loop With Bun</h2>`)).toEqual([]);
  });

  it("accepts an ordinary sentence using the word as a plain verb", () => {
    expect(copyIds(`<p>This laptop's new chip can supercharge video exports.</p>`)).toEqual([]);
  });

  it("accepts the word used as a product name", () => {
    expect(copyIds(`<p>Supercharge is our new CI caching layer.</p>`)).toEqual([]);
  });
});

describe("copy rules — quoted example copy, including CMS-typeset entity quotes", () => {
  it("does not flag stock copy quoted with &ldquo;/&rdquo; entities", () => {
    const code = `<p>Avoid headlines like &ldquo;Unlock the power of your data&rdquo; — describe the actual feature instead.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not flag stock copy quoted with &quot; entities", () => {
    const code = `<p>Avoid headlines like &quot;Unlock the power of your data&quot; — describe the actual feature instead.</p>`;
    expect(copyIds(code)).toEqual([]);
  });
});

describe("copy rules — filler-adverb catches a hero/subhead pair split across elements", () => {
  it("flags a heading and its very next paragraph when each carries one filler adverb", () => {
    const code = `<h1>Seamlessly manage your team</h1><p>Built for cutting-edge teams who move fast.</p>`;
    expect(copyIds(code)).toContain("filler-adverb");
  });

  it("does not merge two unrelated list items that each use one filler word", () => {
    const code = `<li>Effortlessly resume interrupted uploads</li><li>Seamlessly retry failed jobs</li>`;
    expect(copyIds(code)).toEqual([]);
  });

  // A first cut of the hero/subhead pass paired by array position alone —
  // "the next text-bearing element in document order" — with no check for
  // what sat between the two tags in the actual markup. All three of these
  // are ordinary pages with two unrelated sections that each happen to use
  // one common word from the filler-adverb list; none of them is a
  // hero/subhead, and the pass must not pair across any of them.
  it("does not pair a heading with an unrelated paragraph behind an intervening <img>", () => {
    const code = `<h1>Seamlessly onboard new hires</h1><img src="a.png" alt=""><p>Built for cutting-edge deployment pipelines.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not pair a heading with an unrelated paragraph behind an intervening empty <div>", () => {
    const code = `<h1>Seamlessly onboard new hires</h1><div></div><p>Built for cutting-edge deployment pipelines.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not pair a heading in one <article> with a paragraph in a sibling <article>", () => {
    const code = `<article><h1>Seamlessly onboard new hires</h1></article><article><p>Built for cutting-edge deployment pipelines.</p></article>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not pair a heading in one <section> with a paragraph in a sibling <section>", () => {
    const code = `<section><h1>Seamlessly onboard new hires</h1></section><section><p>Built for cutting-edge deployment pipelines.</p></section>`;
    expect(copyIds(code)).toEqual([]);
  });

  // Round 3: the reviewer was asked to defeat the adjacency reasoning, not
  // just re-check the three cases above, and found two more gaps — one in
  // each direction.
  it("does not pair across an HTML comment used as a section boundary (A1)", () => {
    // maskComments blanks the whole comment, delimiters included, before this
    // rule ever sees the source — a naive gap check reading the masked text
    // would see nothing but whitespace here and wrongly pair the two.
    const code = `<h1>Seamlessly onboard new hires</h1><!-- section break --><p>Built for cutting-edge deployment pipelines.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("does not pair across two consecutive HTML comments", () => {
    const code = `<h1>Seamlessly onboard new hires</h1><!-- End Hero --><!-- Begin Features --><p>Built for cutting-edge deployment pipelines.</p>`;
    expect(copyIds(code)).toEqual([]);
  });

  it("pairs an anchored-permalink heading with the paragraph right after it (A2)", () => {
    // The heading's own <a> is itself a TEXT_TAGS entry sitting between the
    // heading and the real next paragraph in array order — nothing at all
    // sits between </h1> and <p> in the actual markup.
    const code = `<h1><a href="#">Seamlessly onboard new hires</a></h1><p>Built for cutting-edge deployment pipelines.</p>`;
    expect(copyIds(code)).toContain("filler-adverb");
  });

  it("stays silent for an anchored heading whose paragraph genuinely has no filler adverb", () => {
    // Proves the previous test fires because the pairing mechanism actually
    // reached the paragraph and evaluated it — not because anchored headings
    // are silently exempt from the threshold check.
    const code = `<h1><a href="#">Seamlessly onboard new hires</a></h1><p>Every plan includes unlimited projects and priority support.</p>`;
    expect(copyIds(code)).toEqual([]);
  });
});

describe("copy rules — isQuoted does not treat an ordinary contraction as a quote mark", () => {
  it("fires when a genuine hype phrase sits between two unrelated contractions", () => {
    const code = `<p>Don't miss out — unlock the power of your data, it's free.</p>`;
    expect(copyIds(code)).toContain("hype-opener");
  });

  it("still fires when only a leading contraction is nearby", () => {
    const code = `<p>It's time to unlock the power of your data warehouse.</p>`;
    expect(copyIds(code)).toContain("hype-opener");
  });
});

describe("copy rules — say goodbye to: kept as a fixed collocation, not narrowed", () => {
  it("still fires on the stock construction", () => {
    expect(copyIds(`<h1>Say goodbye to slow builds</h1>`)).toContain("hype-opener");
  });

  it("also fires on a deprecation note using the same stock phrase — accepted trade-off, see report", () => {
    expect(copyIds(`<p>Say goodbye to the legacy v1 API.</p>`)).toContain("hype-opener");
  });
});

describe("the score", () => {
  it("keys and rule ids agree in both directions", () => {
    // A weight for a cut rule reads as coverage; a rule with no weight reads as
    // clean. uniform-card-grid was cut in Task 2 — this is what catches the
    // next one. The two inputs below are built to fire every one of the ten
    // rules at least once, so the check runs both directions: every emitted id
    // has a weight (a stray rule wouldn't silently score nothing), and every
    // weighted id is actually reachable (a stale weight wouldn't silently read
    // as coverage).
    const visualCode = `
      <div class="from-indigo-500 to-purple-600 bg-clip-text text-transparent backdrop-blur bg-white/10 border-white/10 rounded-2xl shadow-lg border"><h3>🚀 Fast</h3></div>
      <div class="rounded-2xl shadow-lg border">A</div>
      <div class="rounded-2xl shadow-lg border">B</div>
      <span class="text-xs uppercase tracking-wide">Eyebrow</span><h2>One</h2>
      <span class="text-xs uppercase tracking-wide">Eyebrow</span><h2>Two</h2>
      <span class="text-xs uppercase tracking-wide">Eyebrow</span><h2>Three</h2>
      <h1>Ship faster</h1><a href="/signup">Get started</a><style>body{font-family:Inter,sans-serif}</style>
    `;
    const copyCode = `<h1>Unlock the power of seamlessly modern tooling</h1><a>Get Started</a><a>Learn More</a><p>Seamlessly integrate your effortlessly modern workflow.</p>`;

    const emitted = new Set([
      ...genericVisualRules(visualCode),
      ...genericCopyRules(copyCode),
    ].map((f) => f.rule));

    for (const id of emitted) expect(Object.keys(RULE_WEIGHTS)).toContain(id);
    for (const id of Object.keys(RULE_WEIGHTS)) expect([...emitted], id).toContain(id);
  });

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

  it("clamps total at 100 and still reconciles the itemised sum via rawTotal", () => {
    // The ten real weights sum to 92 (see the comment on RULE_WEIGHTS), so
    // no findings genericVisualRules/genericCopyRules can actually produce
    // ever trips the clamp — the test above never exercises that branch. A
    // synthetic weight table that sums past 100 is the only way to reach it,
    // which is what this test does, restoring RULE_WEIGHTS afterward.
    const original = { ...RULE_WEIGHTS };
    for (const key of Object.keys(RULE_WEIGHTS)) delete RULE_WEIGHTS[key];
    Object.assign(RULE_WEIGHTS, { "test-only-a": 70, "test-only-b": 60 });
    try {
      const findings = [
        { line: 1, severity: "info", rule: "test-only-a", message: "m", fix: "f" },
        { line: 2, severity: "info", rule: "test-only-b", message: "m", fix: "f" },
      ];
      const { total, rawTotal, items } = genericScore(findings as Parameters<typeof genericScore>[0]);
      // The clamp actually engaged...
      expect(total).toBe(100);
      // ...and the parts still add up to something stated, not silently
      // capped and dropped: rawTotal carries the true, uncapped sum, and
      // every item keeps its real, citable weight rather than a rescaled
      // fraction that no longer matches RULE_WEIGHTS.
      expect(rawTotal).toBe(130);
      expect(items.reduce((n, i) => n + i.weight, 0)).toBe(rawTotal);
      expect(items.find((i) => i.rule === "test-only-a")?.weight).toBe(70);
      expect(items.find((i) => i.rule === "test-only-b")?.weight).toBe(60);
    } finally {
      for (const key of Object.keys(RULE_WEIGHTS)) delete RULE_WEIGHTS[key];
      Object.assign(RULE_WEIGHTS, original);
    }
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

describe("the report — directory-mode breadth", () => {
  // Reproduces the exact gap a project-wide score can't carry on its own:
  // two files each carrying one instance of the same signals score
  // identically to one file carrying both signals twice. The score is right
  // not to tell those apart (see the comment on `filesByRule` in
  // genericReport) — but the reader should still be able to.
  const gradientCard = `<div class="from-indigo-500 to-purple-600"><h3>🚀 Fast</h3></div>`;

  it("shows how many scanned files a rule was found in, alongside an identical score", () => {
    const twoFiles = mkdtempSync(join(tmpdir(), "sd-generic-breadth-"));
    const oneFile = mkdtempSync(join(tmpdir(), "sd-generic-breadth-"));
    try {
      writeFileSync(join(twoFiles, "a.html"), gradientCard);
      writeFileSync(join(twoFiles, "b.html"), gradientCard);
      writeFileSync(join(oneFile, "a.html"), gradientCard.repeat(2));

      const twoFilesReport = genericReport({ root: twoFiles });
      const oneFileReport = genericReport({ root: oneFile });

      // Same signals, so the same score either way...
      const scoreOf = (report: string) => report.match(/\*\*Score: (\d+) \/ 100\*\*/)?.[1];
      expect(scoreOf(twoFilesReport)).toBe(scoreOf(oneFileReport));

      // ...but the breadth the score can't carry is now visible, and differs.
      expect(twoFilesReport).toMatch(/ai-default-gradient.*found in 2 of 2 files/);
      expect(oneFileReport).toMatch(/ai-default-gradient.*found in 1 of 1 files/);
    } finally {
      rmSync(twoFiles, { recursive: true, force: true });
      rmSync(oneFile, { recursive: true, force: true });
    }
  });

  it("says nothing about file breadth in snippet mode", () => {
    expect(genericReport({ source: gradientCard })).not.toMatch(/found in \d+ of \d+ files/);
  });
});

// ---------------------------------------------------------------------------
// The distinctive-page matrix.
//
// Every other test in this file asserts a shape someone already had in mind.
// These assert the opposite property: that a page made by a designer with a
// point of view survives the audit untouched. The pages below were written
// first, as pages, and only then run through the rules. That ordering is the
// whole value of this block — a fixture reverse-engineered from a rule tests
// the rule against itself.
//
// A fixture that scores zero because it contains nothing proves only that
// empty input produces no findings. Each of these carries an <h1>, real class
// strings, sibling sections, body copy a person would actually write, and a
// call to action where the design would have one.
// ---------------------------------------------------------------------------

const pageFindings = (code: string, filename?: string) =>
  [...genericVisualRules(code, filename), ...genericCopyRules(code, filename)]
    .map((f) => f.rule)
    .sort();

const pageScore = (code: string, filename?: string) =>
  genericScore([...genericVisualRules(code, filename), ...genericCopyRules(code, filename)]).total;

// 1. Brutalist. Condensed display face, 4px rules instead of cards, square
//    corners throughout, one acid accent against paper and ink.
const BRUTALIST_LANDING = `
<style>
  :root { --ink:#000000; --paper:#F2F0EB; --volt:#D6FF3F; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font-family:"Archivo Expanded","Archivo Black",Helvetica,sans-serif;
         -webkit-font-smoothing:antialiased; }
  .masthead { display:flex; justify-content:space-between; align-items:baseline;
              padding:14px 24px; border-bottom:4px solid var(--ink); }
  .masthead a { color:var(--ink); text-decoration:none; font-size:13px;
                letter-spacing:.06em; text-transform:uppercase; }
  .masthead nav a + a { margin-left:24px; }
  h1 { margin:0; padding:32px 24px 20px; font-size:clamp(52px,12vw,168px);
       line-height:.86; letter-spacing:-.035em; text-transform:uppercase; }
  .standfirst { max-width:40ch; margin:0; padding:0 24px 40px;
                font-size:20px; line-height:1.35; }
  .slab { border-top:4px solid var(--ink); padding:28px 24px; }
  .slab h2 { margin:0 0 10px; font-size:30px; line-height:1.05;
             text-transform:uppercase; letter-spacing:-.02em; }
  .slab p { margin:0; max-width:54ch; line-height:1.5;
            font-family:"Suisse Int'l Mono",monospace; font-size:15px; }
  .terms { border-top:4px solid var(--ink); background:var(--ink);
           color:var(--volt); padding:32px 24px; }
  .terms h2 { margin:0 0 14px; font-size:30px; text-transform:uppercase; }
  .terms p { max-width:56ch; line-height:1.5; }
  .apply { display:inline-block; margin-top:20px; padding:18px 26px;
           background:var(--volt); color:var(--ink); border:4px solid var(--volt);
           font-size:18px; letter-spacing:.02em; text-transform:uppercase;
           text-decoration:none; }
  .apply:hover { background:var(--ink); color:var(--volt); }
</style>

<header class="masthead">
  <a href="/">Bad Handwriting</a>
  <nav>
    <a href="/curriculum">Curriculum</a>
    <a href="/tutors">Tutors</a>
    <a href="/archive">Archive 2019—2025</a>
  </nav>
</header>

<h1>Nine weeks<br>drawing letters<br>by hand</h1>
<p class="standfirst">A type design intensive in Rotterdam. You will cut a lowercase, space it
badly, space it again, and go home with a text face that works at 9pt.</p>

<section class="slab">
  <h2>Weeks 1—3 · The skeleton</h2>
  <p>Broad-nib and pointed-pen exercises until the strokes stop arguing with each other.
  No software for the first fortnight. Twelve people, two tables, one very old lightbox.</p>
</section>

<section class="slab">
  <h2>Weeks 4—6 · Spacing and fitting</h2>
  <p>The part nobody teaches. You will print, cut, tape, and reprint the same six words
  until the rhythm holds at text size and at 300pt. Expect to hate n and o by Thursday.</p>
</section>

<section class="slab">
  <h2>Weeks 7—9 · Cutting the family</h2>
  <p>Roman, italic, and a bold that is genuinely a different drawing rather than an
  interpolation. Kerning by hand first, then by class. The last week is production.</p>
</section>

<section class="terms">
  <h2>€2,400 · 12 places · starts 6 October</h2>
  <p>Tuition covers materials, the studio key, and a hot plate that only sometimes works.
  Two bursaries per cohort for applicants from outside the EU. Applications close 1 September
  and we read them in the order they arrive.</p>
  <a class="apply" href="/apply">Apply for the October cohort</a>
</section>
`;

// 2. Serif editorial. A display serif at three optical sizes, a 62ch measure,
//    and no card anywhere — the page is a column with rules and white space.
const SERIF_EDITORIAL = `
<style>
  @font-face { font-family:"Canela Deck"; src:url("/fonts/CanelaDeck-Light.woff2") format("woff2");
               font-weight:300; font-display:swap; }
  @font-face { font-family:"Canela Text"; src:url("/fonts/CanelaText-Regular.woff2") format("woff2");
               font-weight:400; font-display:swap; }
  body { margin:0; background:#FBF9F4; color:#1B1815;
         font-family:"Canela Text",Georgia,"Times New Roman",serif; }
  .measure { max-width:62ch; margin:0 auto; padding:0 24px; }
  .kicker { font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:#8A7E72; }
  h1 { font-family:"Canela Deck",Georgia,serif; font-weight:300;
       font-size:clamp(38px,6vw,80px); line-height:1.04; letter-spacing:-.018em;
       margin:.2em 0 .4em; text-wrap:balance; }
  .standfirst { font-size:23px; line-height:1.5; color:#4A423B; margin-bottom:2.4em; }
  .measure p { font-size:19px; line-height:1.68; margin:0 0 1.35em; }
  .measure p + p { text-indent:1.6em; }
  .dropcap::first-letter { float:left; font-family:"Canela Deck",Georgia,serif;
                           font-size:4.6em; line-height:.78; padding:.06em .1em 0 0; }
  blockquote { margin:2.6em 0; padding:0; border:0;
               font-family:"Canela Deck",Georgia,serif; font-weight:300;
               font-size:30px; line-height:1.28; color:#6E1F1A; }
  blockquote cite { display:block; margin-top:.7em; font-size:14px; font-style:normal;
                    letter-spacing:.06em; text-transform:uppercase; color:#8A7E72; }
  h2 { font-family:"Canela Deck",Georgia,serif; font-weight:300; font-size:30px;
       line-height:1.2; margin:2.4em 0 .6em; }
  .subscribe { margin:4em 0 6em; padding-top:1.6em; border-top:1px solid #DED6C9; }
  .subscribe a { color:#6E1F1A; font-size:19px; text-underline-offset:.22em; }
</style>

<article class="measure">
  <p class="kicker">Reported from Cais do Sodré · 4 August 2026</p>
  <h1>The last man setting the ferry timetable in metal</h1>
  <p class="standfirst">Every quarter for fifty-one years, Álvaro Neves has composed the
  Tejo crossing schedule by hand. In November the presses go to a museum in Porto and the
  timetable becomes a PDF like everything else.</p>

  <p class="dropcap">The composing room is on the second floor of a building that the
  harbour authority has been trying to sell since 2011. It smells of oil and warm paper.
  Neves works standing, as compositors have always worked standing, with the case open in
  front of him and a galley proof drying on the sill behind.</p>

  <p>He has the departure times memorised — not the current ones, all of them. Ask him what
  the last boat to Cacilhas was in the winter of 1988 and he will tell you, and then tell you
  why it changed. The schedule is a document with a memory, he says, and a PDF has none.</p>

  <blockquote>They think the timetable is the times. The timetable is the spacing. If the
  eye cannot find Saturday in half a second, the boat leaves without you.
  <cite>Álvaro Neves, compositor</cite></blockquote>

  <p>His point is not sentimental. The sheet is read in bad light, in wind, by people who are
  late. Over five decades he has widened the gutter between weekday and weekend columns twice
  and shortened the rule under each heading once, each time after standing at the terminal
  watching where people's eyes went.</p>

  <h2>What the museum is taking</h2>

  <p>Two Monotype casters, a proof press, and eleven cases of a 1954 Portuguese cut that has
  never been digitised. The curator has asked Neves to record himself composing a full sheet.
  He has agreed on the condition that nobody speaks during the recording.</p>

  <p>What the museum is not taking is the judgement — which of the eleven cases to open for a
  line that has to hold nine numerals and the word <em>excepto</em>. That leaves with him.</p>

  <div class="subscribe">
    <a href="/subscribe">Subscribe to Estuário — twelve issues, €54 a year, posted flat</a>
  </div>
</article>
`;

// 3. Dense trading dashboard. Inter from top to bottom, tabular figures,
//    18px rows, no gradient and no ornament. This is the fixture that decides
//    whether `default-ui-font` is usable: Inter on an application surface is
//    a correct choice, not a tell.
const TRADING_DASHBOARD = `
import { useOrderBook, usePositions } from "@/lib/desk";

export default function PositionsDesk() {
  const positions = usePositions("EU-RATES");
  const book = useOrderBook();

  return (
    <main className="h-screen overflow-hidden bg-[#0B0D10] text-[#C9CFD8] font-sans text-[12px] leading-[16px] tabular-nums">
      <header className="flex items-baseline justify-between border-b border-[#191D24] px-3 py-1.5">
        <h1 className="text-[12px] font-semibold uppercase tracking-[.08em] text-[#E8ECF2]">
          Positions — EU Rates
        </h1>
        <div className="flex items-baseline gap-5">
          <span className="text-[#6B7480]">Day P&L</span>
          <span className="text-[13px] font-semibold text-[#3FBF7F]">+1,284,905</span>
          <span className="text-[#6B7480]">DV01</span>
          <span className="text-[13px] font-semibold text-[#E8ECF2]">−41,207</span>
          <span className="text-[#6B7480]">as of 14:02:11.338 CET</span>
        </div>
      </header>

      <div className="grid h-full grid-cols-[minmax(0,1fr)_320px]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#191D24] text-left text-[11px] uppercase tracking-[.06em] text-[#6B7480]">
              <th className="px-2 py-1 font-medium">Instrument</th>
              <th className="px-2 py-1 text-right font-medium">Net</th>
              <th className="px-2 py-1 text-right font-medium">Avg</th>
              <th className="px-2 py-1 text-right font-medium">Mark</th>
              <th className="px-2 py-1 text-right font-medium">Unreal</th>
              <th className="px-2 py-1 text-right font-medium">DV01</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="h-[18px] border-b border-[#12161C] hover:bg-[#12161C]">
                <td className="px-2 font-medium text-[#E8ECF2]">{p.instrument}</td>
                <td className="px-2 text-right">{p.net}</td>
                <td className="px-2 text-right text-[#8A93A0]">{p.avg}</td>
                <td className="px-2 text-right">{p.mark}</td>
                <td className={p.unreal < 0 ? "px-2 text-right text-[#E05A5A]" : "px-2 text-right text-[#3FBF7F]"}>
                  {p.unreal}
                </td>
                <td className="px-2 text-right text-[#8A93A0]">{p.dv01}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <aside className="border-l border-[#191D24]">
          <div className="border-b border-[#191D24] px-2 py-1 text-[11px] uppercase tracking-[.06em] text-[#6B7480]">
            Order ticket — RXZ5
          </div>
          <form className="px-2 py-2">
            <label className="mb-1 block text-[11px] text-[#6B7480]" htmlFor="qty">Qty</label>
            <input id="qty" defaultValue={250} className="mb-2 w-full border border-[#232830] bg-[#0F1318] px-2 py-1 text-right text-[#E8ECF2] outline-none focus:border-[#3D6EF5]" />
            <label className="mb-1 block text-[11px] text-[#6B7480]" htmlFor="lmt">Limit</label>
            <input id="lmt" defaultValue={"132.41"} className="mb-3 w-full border border-[#232830] bg-[#0F1318] px-2 py-1 text-right text-[#E8ECF2] outline-none focus:border-[#3D6EF5]" />
            <div className="flex gap-1.5">
              <button type="submit" className="flex-1 border border-[#3FBF7F] bg-[#0F1A15] py-1.5 text-[#3FBF7F] hover:bg-[#12241B]">Buy</button>
              <button type="button" className="flex-1 border border-[#E05A5A] bg-[#1A0F0F] py-1.5 text-[#E05A5A] hover:bg-[#241212]">Sell</button>
            </div>
            <button type="button" className="mt-1.5 w-full border border-[#232830] py-1.5 text-[#8A93A0] hover:text-[#E8ECF2]">
              Flatten book ({book.workingOrders} working)
            </button>
          </form>
        </aside>
      </div>

      <style jsx global>{\`
        :root { font-family: Inter, "Helvetica Neue", Arial, sans-serif;
                font-variant-numeric: tabular-nums; font-feature-settings: "cv05" 1, "ss03" 1; }
      \`}</style>
    </main>
  );
}
`;

// 4. Warm consumer screen. Peach and clay, a rounded humanist face, and a
//    drawn watering can rather than an icon set. Written in Tailwind on
//    purpose: it is the only clean fixture besides the dashboard that puts
//    real utility strings in front of the class-based rules, and it sits
//    deliberately near `stock-card-chrome` — the panels are round and raised
//    because warmth needs softness, but the tint carries the separation, so
//    no panel wears radius, shadow, and a border at once.
const WARM_CONSUMER_APP = `
export default function TodayScreen({ thirsty, forecast }: TodayProps) {
  return (
    <main className="mx-auto min-h-screen max-w-[420px] bg-[#FFF8F2] px-5 pb-28 pt-7 font-body text-[#43302A]">
      <p className="mb-1 text-[14px] text-[#8C7268]">Wednesday morning, 18°C on the sill</p>
      <h1 className="mb-6 font-display text-[30px] font-medium leading-[1.18] tracking-[-.01em]">
        Two of your plants are thirsty today
      </h1>

      <section className="overflow-hidden rounded-[28px] bg-[#FBE3D2] px-6 pt-6">
        <p className="mb-4 max-w-[24ch] leading-relaxed">
          The fiddle leaf has gone eleven days. That is two longer than it likes in August.
        </p>
        <svg viewBox="0 0 150 118" className="-mb-1 block w-[150px]" role="img"
             aria-label="A watering can tipped over a terracotta pot">
          <path d="M34 52h58v46a10 10 0 0 1-10 10H44a10 10 0 0 1-10-10z" fill="#C2694A" />
          <path d="M28 44h70v12H28z" fill="#A9573B" />
          <path d="M92 62c18-6 30-2 34 10" stroke="#A9573B" strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M63 44c0-16 7-28 20-34-4 16-9 26-20 34z" fill="#7C8B5F" />
          <path d="M60 44C52 32 40 26 26 26c8 12 18 18 34 18z" fill="#8F9E71" />
          <circle cx="126" cy="86" r="3.5" fill="#9EC7D8" />
          <circle cx="133" cy="96" r="2.5" fill="#9EC7D8" />
        </svg>
      </section>

      <ul className="mt-7 divide-y divide-[#F0E2D8]">
        {thirsty.map((plant) => (
          <li key={plant.id} className="flex items-center gap-3.5 py-3.5">
            <img src={plant.photo} alt={plant.alt} className="size-13 rounded-[18px] object-cover" />
            <div>
              <div className="font-display text-[18px]">{plant.nickname}</div>
              <div className="text-[14px] text-[#8C7268]">{plant.spot} · {plant.species}</div>
            </div>
            <div className="ml-auto text-[14px] text-[#C2694A]">{plant.daysSince} days</div>
          </li>
        ))}
      </ul>

      <section className="mt-6 rounded-3xl bg-[#F6F2E9] px-5 py-4.5 shadow-[0_2px_20px_rgba(194,105,74,0.09)]">
        <h2 className="mb-1.5 font-display text-[19px] font-medium">Nothing else until Saturday</h2>
        <p className="text-[15px] leading-relaxed text-[#6E5A52]">
          The succulents on the balcony are fine through the weekend. We will nudge you Friday
          evening if {forecast.summary} changes.
        </p>
      </section>

      <button
        type="button"
        className="fixed bottom-5 left-1/2 w-[min(380px,calc(100%-40px))] -translate-x-1/2 rounded-full bg-[#C2694A] py-4 text-[17px] text-[#FFF6F0] active:bg-[#A9573B]"
      >
        Water both and start the clock
      </button>

      <style jsx global>{\`
        @font-face { font-family:"Recoleta"; src:url("/f/Recoleta-Medium.woff2") format("woff2"); font-weight:500; }
        @font-face { font-family:"Basier Circle"; src:url("/f/BasierCircle-Regular.woff2") format("woff2"); }
        .font-display { font-family:"Recoleta",Georgia,serif; }
        .font-body { font-family:"Basier Circle","Avenir Next",sans-serif; }
      \`}</style>
    </main>
  );
}
`;

// 5. Monochrome developer tool. The system mono stack as the primary family —
//    a deliberate choice on a tool page, not a fallback — one accent, no
//    shadow anywhere, and hairline borders instead of elevation.
const MONO_DEV_TOOL = `
<style>
  :root { --bg:#0E0E0E; --panel:#151515; --line:#242424; --fg:#E6E6E6;
          --dim:#8A8A8A; --accent:#FF6B2C; }
  body { margin:0; background:var(--bg); color:var(--fg);
         font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
         font-size:14px; line-height:1.65; }
  .wrap { max-width:76ch; margin:0 auto; padding:64px 20px 96px; }
  h1 { font-size:21px; font-weight:500; letter-spacing:-.01em; margin:0 0 6px; }
  .tagline { color:var(--dim); margin:0 0 40px; }
  h2 { font-size:14px; font-weight:500; margin:44px 0 12px; color:var(--fg); }
  h2::before { content:"## "; color:var(--accent); }
  p { margin:0 0 16px; color:#CFCFCF; }
  pre { background:var(--panel); border:1px solid var(--line); padding:14px 16px;
        overflow-x:auto; margin:0 0 16px; }
  pre .prompt { color:var(--accent); user-select:none; }
  ul { margin:0 0 16px; padding-left:1.4em; }
  li { margin-bottom:6px; }
  li::marker { color:var(--dim); }
  table { width:100%; border-collapse:collapse; margin:0 0 16px; }
  th,td { border-bottom:1px solid var(--line); padding:7px 8px; text-align:left; }
  th { color:var(--dim); font-weight:500; }
  a { color:var(--accent); text-decoration:underline; text-underline-offset:3px; }
  .install { border:1px solid var(--accent); padding:14px 16px; margin:36px 0 0;
             display:flex; justify-content:space-between; align-items:center; gap:16px; }
  .install button { background:none; border:1px solid var(--line); color:var(--fg);
                    font:inherit; padding:6px 12px; cursor:pointer; }
  .install button:hover { border-color:var(--accent); color:var(--accent); }
</style>

<div class="wrap">
  <h1>zt — a trace viewer for Postgres that fits in a terminal</h1>
  <p class="tagline">Tails auto_explain output, folds the plan tree, and shows you the one node that cost you the query.</p>

  <h2>Why it exists</h2>
  <p>pg_stat_statements tells you which query is slow. It does not tell you that the slowness
  is a nested loop that only misestimates after the nightly load. zt keeps the last N plans per
  query fingerprint in a ring buffer so you can compare a fast run against a slow one side by side.</p>

  <h2>Install</h2>
  <pre><span class="prompt">$</span> brew install saglitz/tap/zt
<span class="prompt">$</span> zt tail --dsn "postgres://localhost/shop" --min-ms 200</pre>

  <h2>What it does</h2>
  <ul>
    <li>Folds plan trees to the nodes above a cost threshold you set</li>
    <li>Diffs two plans for the same fingerprint and colours the rows that moved</li>
    <li>Exports a single plan as JSON for explain.depesz.com or a bug report</li>
    <li>Runs against a replica; it never issues a write</li>
  </ul>

  <h2>What it does not do</h2>
  <ul>
    <li>Rewrite your query. It will show you the node, not the fix.</li>
    <li>Store history beyond the ring buffer. Point it at a file if you want that.</li>
    <li>Work on RDS without auto_explain enabled in the parameter group.</li>
  </ul>

  <h2>Overhead</h2>
  <table>
    <thead><tr><th>Setting</th><th>Added latency p99</th><th>Log volume</th></tr></thead>
    <tbody>
      <tr><td>min-ms 200, no analyze</td><td>0.3 ms</td><td>~40 MB/day</td></tr>
      <tr><td>min-ms 50, no analyze</td><td>0.4 ms</td><td>~310 MB/day</td></tr>
      <tr><td>min-ms 200, analyze on</td><td>4.1 ms</td><td>~90 MB/day</td></tr>
    </tbody>
  </table>
  <p>Measured on a c7g.2xlarge running pgbench at scale 500. Numbers from your workload will
  differ; the analyze row is the only one worth being careful about.</p>

  <div class="install">
    <span>MIT licensed · 2,900 lines of Go · no daemon</span>
    <button type="button">Read the source</button>
  </div>
</div>
`;

// The control. Written the way a page comes out when nobody made a decision:
// the stock indigo-to-violet wash, Inter as the only family on a marketing
// route, glass cards on dark, an emoji per feature, an eyebrow over every
// heading, and copy assembled from the usual parts.
const GENERIC_LANDING = `
<style>body { font-family: Inter, sans-serif; }</style>
<section class="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 py-24 text-center text-white">
  <p class="text-xs uppercase tracking-widest opacity-80">Introducing FlowStack</p>
  <h1 class="text-6xl font-bold">Ship faster with AI</h1>
  <p class="mt-4 text-lg opacity-90">In today's fast-paced world, teams need to move quickly.
  FlowStack seamlessly integrates with your existing workflow to effortlessly unlock your team's
  full potential.</p>
  <p class="mt-6 text-5xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">10x</p>
  <div class="mt-8 flex justify-center gap-4">
    <a href="/signup" class="rounded-full bg-white px-8 py-3 font-semibold text-indigo-600">Get Started</a>
    <a href="/docs" class="rounded-full border border-white px-8 py-3 font-semibold">Learn More</a>
  </div>
</section>

<section class="bg-slate-900 py-20">
  <p class="text-xs uppercase tracking-widest text-indigo-400">Features</p>
  <h2 class="text-4xl font-bold text-white">Everything you need</h2>
  <div class="mt-10 grid grid-cols-3 gap-6">
    <div class="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur">
      <h3 class="text-xl font-semibold text-white">🚀 Lightning fast</h3>
      <p class="mt-2 text-slate-300">Blazing fast performance that seamlessly scales.</p>
    </div>
    <div class="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur">
      <h3 class="text-xl font-semibold text-white">🔒 Enterprise ready</h3>
      <p class="mt-2 text-slate-300">Bank-grade security that effortlessly protects your data.</p>
    </div>
    <div class="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur">
      <h3 class="text-xl font-semibold text-white">⚡ Built for scale</h3>
      <p class="mt-2 text-slate-300">Infrastructure that effortlessly grows with you.</p>
    </div>
  </div>
</section>

<section class="bg-slate-900 py-20">
  <p class="text-xs uppercase tracking-widest text-indigo-400">Testimonials</p>
  <h2 class="text-4xl font-bold text-white">Loved by teams everywhere</h2>
  <p class="mt-4 text-slate-300">Join thousands of teams who have already made the switch.</p>
</section>

<section class="bg-slate-900 py-20 text-center">
  <p class="text-xs uppercase tracking-widest text-indigo-400">Get started today</p>
  <h2 class="text-4xl font-bold text-white">Ready to transform your workflow?</h2>
  <a href="/signup" class="mt-8 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-10 py-4 font-semibold text-white">Get Started</a>
</section>
`;

describe("the distinctive-page matrix — pages with a point of view score zero", () => {
  it("leaves a brutalist landing page alone", () => {
    expect(pageFindings(BRUTALIST_LANDING, "app/page.html")).toEqual([]);
    expect(pageScore(BRUTALIST_LANDING, "app/page.html")).toBe(0);
  });

  it("leaves a serif editorial layout alone", () => {
    expect(pageFindings(SERIF_EDITORIAL, "app/(reading)/estuario/page.html")).toEqual([]);
    expect(pageScore(SERIF_EDITORIAL, "app/(reading)/estuario/page.html")).toBe(0);
  });

  // The decisive one. Inter is the correct family for a dense application
  // surface, and `default-ui-font` is only usable if it can tell that surface
  // apart from a brand page. If this fires, the rule is wrong, not the page.
  it("leaves a dense trading dashboard on Inter alone", () => {
    expect(pageFindings(TRADING_DASHBOARD, "src/app/(desk)/positions/page.tsx")).toEqual([]);
    expect(pageScore(TRADING_DASHBOARD, "src/app/(desk)/positions/page.tsx")).toBe(0);
  });

  it("leaves a warm consumer app screen alone", () => {
    expect(pageFindings(WARM_CONSUMER_APP, "src/app/(app)/today/page.tsx")).toEqual([]);
    expect(pageScore(WARM_CONSUMER_APP, "src/app/(app)/today/page.tsx")).toBe(0);
  });

  it("leaves a monochrome developer tool alone", () => {
    expect(pageFindings(MONO_DEV_TOOL, "app/page.html")).toEqual([]);
    expect(pageScore(MONO_DEV_TOOL, "app/page.html")).toBe(0);
  });

  // The five assertions above would all still pass if `isBrandSurface` were
  // hard-wired to false — every one of these pages sits on a path that does
  // not read as marketing. These two tests remove that escape hatch.
  //
  // First: four of the five are clean because of what they are, not where
  // they live. Put the same source on a marketing route, where the font rule
  // is at its most willing to speak, and it still finds nothing — because a
  // condensed grotesque, a display serif, a rounded humanist face, and the
  // system mono stack are none of them a default UI sans.
  it("keeps four of them clean even when served from a marketing route", () => {
    for (const [name, page] of [
      ["brutalist", BRUTALIST_LANDING],
      ["serif editorial", SERIF_EDITORIAL],
      ["warm consumer", WARM_CONSUMER_APP],
      ["mono developer tool", MONO_DEV_TOOL],
    ] as const) {
      expect(isBrandSurface(page, "app/(marketing)/page.tsx")).toBe(true);
      expect(pageFindings(page, "app/(marketing)/page.tsx"), name).toEqual([]);
    }
  });

  // Second, and this is the one that gives the dashboard assertion its teeth:
  // the dashboard is the single fixture whose silence *is* a surface decision.
  // Same markup, same Inter, moved to a marketing route — and the rule speaks.
  // That proves the dashboard is quiet because the audit understood it was
  // application UI, not because `default-ui-font` is dead on arrival.
  it("still flags that same Inter when the dashboard markup is served as a brand page", () => {
    expect(pageFindings(TRADING_DASHBOARD, "app/(marketing)/page.tsx")).toContain("default-ui-font");
  });

  // Without this the matrix above would pass just as well if every rule were
  // deleted. This is the half that proves the tool can still tell.
  it("scores a page nobody made a decision about well above 50", () => {
    expect(pageScore(GENERIC_LANDING, "app/(marketing)/page.tsx")).toBeGreaterThan(50);
  });

  it("names the usual suspects on that page rather than one catch-all", () => {
    const fired = new Set(pageFindings(GENERIC_LANDING, "app/(marketing)/page.tsx"));
    for (const rule of [
      "ai-default-gradient",
      "default-ui-font",
      "emoji-as-icon",
      "stock-card-chrome",
      "eyebrow-over-every-heading",
      "gradient-text",
      "stock-glass-on-dark",
      "hype-opener",
      "filler-adverb",
      "generic-cta",
    ]) {
      expect(fired, `expected ${rule} on the generic page`).toContain(rule);
    }
  });

  it("does not resurrect the uniform-card-grid rule that was cut", () => {
    expect(pageFindings(GENERIC_LANDING, "app/(marketing)/page.tsx")).not.toContain("uniform-card-grid");
  });
});
