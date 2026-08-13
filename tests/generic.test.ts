import { describe, it, expect } from "vitest";
import { genericVisualRules, genericCopyRules, genericScore, genericReport, RULE_WEIGHTS } from "../dist/generic.js";

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
