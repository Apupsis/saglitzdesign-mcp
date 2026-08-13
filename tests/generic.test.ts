import { describe, it, expect } from "vitest";
import { genericVisualRules, genericCopyRules } from "../dist/generic.js";

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
