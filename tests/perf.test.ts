import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { perfRules, perfReport, PERF_NOT_VISIBLE, PERF_EXTENSIONS } from "../dist/perf.js";
import { loadKnowledge, findDoc } from "../dist/knowledge.js";

const ids = (code: string, filename?: string) =>
  perfRules(code, filename).map((f) => f.rule).sort();

/**
 * A complete, correct static page — the base every "one thing wrong" case
 * edits. Every negative in the suite is load-bearing: this page carries a
 * header logo that is lazy-loaded (correct), a below-the-fold image that is
 * lazy-loaded (correct, and the whole point of the attribute), explicit
 * dimensions everywhere, a self-hosted font with font-display, and a deferred
 * script. It must produce nothing.
 */
const GOOD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Website Redesign Pricing | Saglitz</title>
  <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
  <style>
    @font-face {
      font-family: "Inter";
      src: url("/fonts/inter-var.woff2") format("woff2");
      font-display: swap;
    }
  </style>
  <script defer src="/js/app.js"></script>
</head>
<body>
  <header>
    <a href="/"><img src="/logo.svg" alt="Saglitz" width="120" height="32" loading="lazy"></a>
  </header>
  <main>
    <img src="/hero.avif" alt="The studio during a design review" width="1600" height="900" fetchpriority="high">
    <h1>Website redesign pricing</h1>
    <p>A redesign for a small business site runs between eight and twenty thousand pounds, depending on how many templates you need and whether the copy is written from scratch.</p>
    <img src="/chart.avif" alt="Cost by template count" width="800" height="500" loading="lazy" decoding="async">
  </main>
</body>
</html>`;

describe("the negatives — correct work stays silent", () => {
  it("says nothing at all about a correct page", () => {
    expect(ids(GOOD_HTML, "index.html")).toEqual([]);
  });

  it("stays silent on a header logo that carries loading=\"lazy\"", () => {
    // The named over-fire: the first in-document image here is the logo, and
    // a logo is correctly lazy-loaded. `lazy-hero` must not read it as the
    // LCP candidate.
    expect(ids(GOOD_HTML, "index.html")).not.toContain("lazy-hero");
  });

  it("stays silent on a below-the-fold image that carries loading=\"lazy\"", () => {
    expect(ids(GOOD_HTML, "index.html")).not.toContain("lazy-hero");
  });

  it("stays silent on an <img> with width and height", () => {
    expect(ids(GOOD_HTML, "index.html")).not.toContain("image-without-dimensions");
  });

  it("stays silent on an <img> whose style attribute sets aspect-ratio", () => {
    const code = GOOD_HTML.replace(
      `<img src="/chart.avif" alt="Cost by template count" width="800" height="500" loading="lazy" decoding="async">`,
      `<img src="/chart.avif" alt="Cost by template count" style="aspect-ratio: 16 / 10; width: 100%" loading="lazy" decoding="async">`);
    expect(ids(code, "index.html")).not.toContain("image-without-dimensions");
  });

  it("stays silent on an <img> whose class carries aspect-ratio in the page's own CSS", () => {
    const code = GOOD_HTML
      .replace("@font-face {", ".chart { aspect-ratio: 16 / 10; }\n    @font-face {")
      .replace(
        `<img src="/chart.avif" alt="Cost by template count" width="800" height="500" loading="lazy" decoding="async">`,
        `<img class="chart" src="/chart.avif" alt="Cost by template count" loading="lazy" decoding="async">`);
    expect(ids(code, "index.html")).not.toContain("image-without-dimensions");
  });

  // Found by running the rules over this repository's own card recipe, which
  // is correct, shipped work and was reported twice. The image is sized by a
  // descendant rule; the class that carries the aspect-ratio is the wrapper's.
  it("stays silent on an image sized by a descendant selector", () => {
    const code = `<style>
  .card__media { width: 100%; aspect-ratio: 16 / 9; background: #eee; }
  .card__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
<article class="card">
  <div class="card__media">
    <img src="/case.avif" alt="Aerial view of a coastline" loading="lazy" />
  </div>
</article>`;
    expect(ids(code, "recipes/card/html-css.html")).not.toContain("image-without-dimensions");
  });

  it("stays silent on an image whose wrapper reserves the space", () => {
    const code = `<style>.media { aspect-ratio: 16 / 9; }</style>
<figure class="media"><img src="/case.avif" alt="A case study" loading="lazy"></figure>`;
    expect(ids(code, "work.html")).not.toContain("image-without-dimensions");
  });

  it("stays silent on Tailwind's dimension utilities, which never reach the file's CSS", () => {
    for (const classes of ["w-full h-64 object-cover", "aspect-video w-full", "size-12 rounded-full"]) {
      const code = `<img class="${classes}" src="/case.avif" alt="A case study" loading="lazy" />`;
      expect(ids(code, "Card.tsx"), classes).not.toContain("image-without-dimensions");
    }
  });

  it("still fires on a Tailwind image with a width but no height", () => {
    const code = `<img class="w-full h-auto rounded-lg" src="/case.avif" alt="A case study" loading="lazy" />`;
    expect(ids(code, "Card.tsx")).toContain("image-without-dimensions");
  });

  it("stays silent on an image whose class cannot be read — a CSS module names the file we cannot see", () => {
    const code = `export default () => <main><img src="/a.jpg" alt="Cover" className={styles.cover} /></main>;`;
    expect(ids(code, "Card.tsx")).not.toContain("image-without-dimensions");
  });

  it("stays silent on images in containers that are not painted with the page", () => {
    const pixel = `<body><noscript><img src="https://t.example.com/p.gif" alt=""></noscript></body>`;
    expect(ids(pixel, "p.html"), "tracking pixel").toEqual([]);
    const tpl = `<body><template><img src="/row.jpg" alt="Row"></template></body>`;
    expect(ids(tpl, "p.html"), "template row").toEqual([]);
    const dlg = `<body><dialog><img src="/promo.jpg" alt="Offer"></dialog></body>`;
    expect(ids(dlg, "p.html"), "dialog").toEqual([]);
  });

  it("stays silent on six script hosts that share one registrable domain", () => {
    const scripts = ["a", "b", "c", "d", "e", "f"]
      .map((s) => `<script async src="https://${s}.example.com/x.js"></script>`).join("");
    expect(ids(`<body>${scripts}</body>`, "p.html")).not.toContain("third-party-script-count");
  });

  it("does not let a scoped descendant rule silence every image in the file", () => {
    const code = `<style>.card__media img { width: 100%; height: 100%; }</style>
<div class="card__media"><img src="/a.jpg" alt="In the card"></div>
<div class="other"><img src="/b.jpg" alt="Not in the card"></div>`;
    const fired = perfRules(code, "p.html").filter((x) => x.rule === "image-without-dimensions");
    expect(fired).toHaveLength(1);
    expect(fired[0].line).toBe(3);
  });

  it("stays silent on an @font-face with font-display: swap", () => {
    expect(ids(GOOD_HTML, "index.html")).not.toContain("font-display-missing");
  });

  it("stays silent on a <script type=\"module\"> in the head — modules defer by default", () => {
    const code = GOOD_HTML.replace(`<script defer src="/js/app.js">`, `<script type="module" src="/js/app.js">`);
    expect(ids(code, "index.html")).not.toContain("render-blocking-script");
  });

  it("stays silent on a deferred and an async script in the head", () => {
    const code = GOOD_HTML.replace(
      `<script defer src="/js/app.js"></script>`,
      `<script defer src="/js/app.js"></script>\n  <script async src="https://plausible.io/js/script.js"></script>`);
    expect(ids(code, "index.html")).not.toContain("render-blocking-script");
  });

  it("stays silent on an inline script in the head — it may be the critical one", () => {
    const code = GOOD_HTML.replace(
      `<script defer src="/js/app.js"></script>`,
      `<script>document.documentElement.dataset.theme = localStorage.theme || "light";</script>`);
    expect(ids(code, "index.html")).not.toContain("render-blocking-script");
  });

  it("stays silent on a JSON-LD block in the head, which executes nothing", () => {
    const code = GOOD_HTML.replace(
      `<script defer src="/js/app.js"></script>`,
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script>`);
    expect(ids(code, "index.html")).not.toContain("render-blocking-script");
  });

  it("stays silent on a self-hosted font — nothing to preconnect to", () => {
    expect(ids(GOOD_HTML, "index.html")).not.toContain("third-party-font-host");
  });

  it("stays silent on three third-party script origins", () => {
    const code = GOOD_HTML.replace("</body>", `
  <script async src="https://plausible.io/js/script.js"></script>
  <script async src="https://cdn.usefathom.com/script.js"></script>
  <script async src="https://js.stripe.com/v3/"></script>
</body>`);
    expect(ids(code, "index.html")).not.toContain("third-party-script-count");
  });

  it("stays silent on an inline <svg>, which has no dimensions to declare", () => {
    const code = GOOD_HTML.replace("<h1>", `<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>\n    <h1>`);
    expect(ids(code, "index.html")).not.toContain("image-without-dimensions");
  });

  it("stays silent on a CSS background hero that is already preloaded", () => {
    const code = GOOD_HTML
      .replace("@font-face {", `.hero { background-image: url("/hero.avif"); }\n    @font-face {`)
      .replace(`<link rel="preload" href="/fonts/inter-var.woff2"`,
        `<link rel="preload" as="image" href="/hero.avif" fetchpriority="high">\n  <link rel="preload" href="/fonts/inter-var.woff2"`);
    expect(ids(code, "index.html")).not.toContain("css-hero-not-preloaded");
  });

  it("stays silent on a decorative CSS background nobody called a hero", () => {
    const code = GOOD_HTML.replace("@font-face {", `.testimonial { background-image: url("/quote-bg.png"); }\n    @font-face {`);
    expect(ids(code, "index.html")).not.toContain("css-hero-not-preloaded");
  });

  it("stays silent on a CSS gradient, which fetches nothing", () => {
    const code = GOOD_HTML.replace("@font-face {", `.hero { background-image: linear-gradient(#fff, #eee); }\n    @font-face {`);
    expect(ids(code, "index.html")).not.toContain("css-hero-not-preloaded");
  });

  it("stays silent on a commented-out @font-face", () => {
    const code = GOOD_HTML.replace("@font-face {", `/* @font-face { font-family: "Old"; src: url("/old.woff2"); } */\n    @font-face {`);
    expect(ids(code, "index.html")).not.toContain("font-display-missing");
  });

  it("stays silent on an image whose attributes may arrive through a spread", () => {
    const code = `export const Figure = (props) => <img src="/chart.avif" alt="Chart" {...props} />;`;
    expect(ids(code, "Figure.jsx")).toEqual([]);
  });

  it("stays silent on a <main> whose first image is a component that carries its own dimensions", () => {
    const code = `export default () => (
  <main>
    <Image src={hero} alt="Studio" priority sizes="100vw" />
    <h1>Pricing</h1>
  </main>
);`;
    expect(ids(code, "page.tsx")).toEqual([]);
  });
});

// An attribute name must only be found where a name can appear. The earlier
// idiom allowed a quote or a space before the name, which meant a name
// occurring inside another attribute's *value* counted — in both directions,
// and both were serious.
describe("an attribute name inside another attribute's value is not that attribute", () => {
  it.each([
    ["alt", `<img src="/b.avif" alt="Priority support illustration" width="800" height="600" loading="lazy">`],
    ["class", `<img src="/b.avif" class="priority low" alt="x" width="800" height="600" loading="lazy">`],
    ["title", `<img src="/b.avif" title="Priority queue" alt="x" width="800" height="600" loading="lazy">`],
  ])("does not read \"priority\" in a %s value as the priority prop", (_where, code) => {
    expect(ids(code, "index.html")).not.toContain("lazy-hero");
  });

  it("does not read \"width\" in alt text as a width attribute", () => {
    expect(ids(`<main><img src="/a.jpg" alt="Full width photo"></main>`, "p.html"))
      .toContain("image-without-dimensions");
  });

  it("does not read \"height\" in alt text as a height attribute", () => {
    expect(ids(`<main><img src="/a.jpg" alt="height of the wall"></main>`, "p.html"))
      .toContain("image-without-dimensions");
  });

  it("does not read \"async\" in a data attribute's value as async", () => {
    const code = `<html><head><script src="/a.js" data-x="run async later"></script></head><body></body></html>`;
    expect(ids(code, "p.html")).toContain("render-blocking-script");
  });

  it("still reads a real valueless attribute, and a real one after a quoted value", () => {
    const code = `<html><head><script src="/a.js" data-note="x" defer></script></head><body></body></html>`;
    expect(ids(code, "p.html")).not.toContain("render-blocking-script");
  });
});

describe("the positives — a real defect fires", () => {
  it("flags loading=\"lazy\" on the first image inside <main>", () => {
    const code = GOOD_HTML.replace(
      `<img src="/hero.avif" alt="The studio during a design review" width="1600" height="900" fetchpriority="high">`,
      `<img src="/hero.avif" alt="The studio during a design review" width="1600" height="900" loading="lazy">`);
    const f = perfRules(code, "index.html").find((x) => x.rule === "lazy-hero");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("error");
  });

  it("flags loading=\"lazy\" beside fetchpriority=\"high\" wherever it sits", () => {
    const code = `<img src="/logo.svg" alt="Saglitz" width="120" height="32" fetchpriority="high" loading="lazy">`;
    expect(ids(code, "Nav.jsx")).toContain("lazy-hero");
  });

  it("flags loading=\"lazy\" beside next/image's priority prop", () => {
    const code = `export default () => <Image src={hero} alt="Studio" priority loading="lazy" />;`;
    expect(ids(code, "page.tsx")).toContain("lazy-hero");
  });

  it("flags the LCP candidate when it declares no fetchpriority", () => {
    const code = GOOD_HTML.replace(` fetchpriority="high"`, "");
    const f = perfRules(code, "index.html").find((x) => x.rule === "hero-no-fetchpriority");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  it("does not report a lazy hero as also missing fetchpriority — one image, one finding", () => {
    const code = GOOD_HTML.replace(` fetchpriority="high"`, ` loading="lazy"`);
    const fired = ids(code, "index.html");
    expect(fired).toContain("lazy-hero");
    expect(fired).not.toContain("hero-no-fetchpriority");
  });

  it("flags an <img> with neither dimensions nor aspect-ratio", () => {
    const code = GOOD_HTML.replace(
      `<img src="/chart.avif" alt="Cost by template count" width="800" height="500" loading="lazy" decoding="async">`,
      `<img src="/chart.avif" alt="Cost by template count" loading="lazy" decoding="async">`);
    const f = perfRules(code, "index.html").find((x) => x.rule === "image-without-dimensions");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("flags an @font-face with no font-display", () => {
    const code = GOOD_HTML.replace("      font-display: swap;\n", "");
    const f = perfRules(code, "index.html").find((x) => x.rule === "font-display-missing");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("flags an @font-face with no font-display in a standalone stylesheet", () => {
    const code = `@font-face {
  font-family: "Inter";
  src: url("/fonts/inter-var.woff2") format("woff2");
}`;
    expect(ids(code, "src/styles/fonts.css")).toContain("font-display-missing");
  });

  it("flags a bare <script src> in the <head>", () => {
    const code = GOOD_HTML.replace(`<script defer src="/js/app.js">`, `<script src="/js/app.js">`);
    const f = perfRules(code, "index.html").find((x) => x.rule === "render-blocking-script");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("flags more than five distinct third-party script origins", () => {
    const code = GOOD_HTML.replace("</body>", `
  <script async src="https://plausible.io/js/script.js"></script>
  <script async src="https://cdn.usefathom.com/script.js"></script>
  <script async src="https://js.stripe.com/v3/"></script>
  <script async src="https://widget.intercom.io/widget.js"></script>
  <script async src="https://static.hotjar.com/c/hotjar.js"></script>
  <script async src="https://connect.facebook.net/en_US/fbevents.js"></script>
</body>`);
    const f = perfRules(code, "index.html").find((x) => x.rule === "third-party-script-count");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  it("counts origins, not tags — six scripts from one host is one origin", () => {
    const many = Array.from({ length: 6 }, (_, i) => `  <script async src="https://cdn.example.com/a${i}.js"></script>`).join("\n");
    const code = GOOD_HTML.replace("</body>", `${many}\n</body>`);
    expect(ids(code, "index.html")).not.toContain("third-party-script-count");
  });

  it("flags a CSS background hero with no preload", () => {
    const code = GOOD_HTML.replace("@font-face {", `.hero { background-image: url("/hero-wide.avif"); }\n    @font-face {`);
    const f = perfRules(code, "index.html").find((x) => x.rule === "css-hero-not-preloaded");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  it("flags a hero background set through a style attribute", () => {
    const code = GOOD_HTML.replace("<main>", `<main>\n    <section class="hero" style="background-image: url('/hero-wide.avif')"></section>`);
    expect(ids(code, "index.html")).toContain("css-hero-not-preloaded");
  });

  it("flags a third-party font host", () => {
    const code = GOOD_HTML.replace("<style>",
      `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">\n  <style>`);
    const f = perfRules(code, "index.html").find((x) => x.rule === "third-party-font-host");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  // The standard Google Fonts snippet is a preconnect pair plus a stylesheet.
  // That is one decision, and it produced three findings before this.
  it("reports the standard Google Fonts snippet exactly once", () => {
    const code = GOOD_HTML.replace("<style>", `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">
  <style>`);
    const fired = perfRules(code, "index.html").filter((x) => x.rule === "third-party-font-host");
    expect(fired).toHaveLength(1);
  });
});

describe("lazy-hero's scope, which is narrower than \"first image on the page\"", () => {
  it("claims nothing when the document has no <main> to anchor the candidate to", () => {
    const code = `<div class="page">
  <img src="/hero.avif" alt="Studio" width="1600" height="900" loading="lazy">
  <h1>Pricing</h1>
</div>`;
    expect(ids(code, "Hero.jsx")).not.toContain("lazy-hero");
  });

  it("skips an image inside a <header> nested in <main>", () => {
    const code = `<main>
  <header><img src="/avatar.jpg" alt="Jane" width="48" height="48" loading="lazy"></header>
  <h1>How layout shift kills conversions</h1>
</main>`;
    expect(ids(code, "post.html")).not.toContain("lazy-hero");
  });

  it("skips a small explicit-width image, which is an icon rather than a hero", () => {
    const code = `<main>
  <img src="/badge.svg" alt="Certified" width="32" height="32" loading="lazy">
  <h1>Pricing</h1>
</main>`;
    expect(ids(code, "index.html")).not.toContain("lazy-hero");
  });

  it("skips an image that arrives after the page's opening copy", () => {
    const code = `<main>
  <h1>Reserving space for late-loading media</h1>
  <p>Cumulative Layout Shift is caused almost entirely by designed elements arriving after first paint: images without reserved space, ad slots that expand, banners injected above existing content, and skeletons sized differently from the content that replaces them. The fix is nearly always dimensional rather than architectural.</p>
  <figure><img src="/diagrams/cls.avif" alt="A layout shift" width="960" height="540" loading="lazy"></figure>
</main>`;
    expect(ids(code, "docs/cls.html")).not.toContain("lazy-hero");
  });

  // Found by running a correct Nuxt page. `<NuxtImg>` was not recognised as
  // an image, so the below-the-fold chart beneath it — correctly lazy-loaded —
  // was promoted to LCP candidate and reported at error severity.
  it("recognises a framework image component rather than promoting the one below it", () => {
    const code = `<template>
  <main>
    <NuxtImg src="/hero.avif" alt="Studio" width="1600" height="900" fetchpriority="high" />
    <h1>Website redesign pricing</h1>
    <p>A redesign runs between eight and twenty thousand pounds.</p>
    <img src="/chart.avif" alt="Cost by template" width="800" height="500" loading="lazy" />
  </main>
</template>`;
    expect(ids(code, "pages/index.vue")).toEqual([]);
  });

  it("withdraws the candidate when an unresolved component sits above it", () => {
    // <Hero /> very probably renders the image that really comes first.
    const code = `export default () => (
  <main>
    <Hero />
    <img src="/chart.avif" alt="Cost by template" width="800" height="500" loading="lazy" />
  </main>
);`;
    expect(ids(code, "app/page.tsx")).toEqual([]);
  });

  // Skipping an image silently promotes the next one. Recognising more
  // component names fixed one cause; these are the rest.
  it("does not promote past an image in a <dialog>, which is not displayed on load", () => {
    const code = `<main>
  <dialog><img src="/promo.avif" alt="Spring offer" width="600" height="400" loading="lazy"></dialog>
  <img src="/hero.avif" alt="Studio" width="1600" height="900" fetchpriority="high">
  <h1>Pricing</h1>
</main>`;
    expect(ids(code, "index.html")).toEqual([]);
  });

  it("still reaches the real hero past a <dialog>, and points at it", () => {
    const code = `<main>
  <dialog><img src="/promo.avif" alt="Spring offer" width="600" height="400" loading="lazy"></dialog>
  <img src="/hero.avif" alt="Studio" width="1600" height="900" loading="lazy">
  <h1>Pricing</h1>
</main>`;
    const f = perfRules(code, "index.html").find((x) => x.rule === "lazy-hero");
    expect(f).toBeDefined();
    expect(f!.line).toBe(3);
  });

  it("withdraws when another image already carries the author's priority marking", () => {
    const code = `<header class="site-hero"><img src="/hero.avif" alt="Studio" width="1600" height="900" fetchpriority="high"></header>
<main><img src="/chart.avif" alt="Costs" width="800" height="500" loading="lazy"></main>`;
    expect(ids(code, "index.html")).toEqual([]);
  });

  it("withdraws when an image sits above <main> outside the landmarks", () => {
    const code = `<section class="hero"><img src="/hero.avif" alt="Studio" width="1600" height="900"></section>
<main><img src="/chart.avif" alt="Costs" width="800" height="500" loading="lazy"></main>`;
    expect(ids(code, "index.html")).toEqual([]);
  });

  it("skips a small image sized only in the page's own CSS", () => {
    const code = `<style>.byline-avatar { width: 40px; height: 40px; border-radius: 50%; }</style>
<main><img class="byline-avatar" src="/jane.jpg" alt="Jane" loading="lazy"><h1>Post</h1></main>`;
    expect(ids(code, "post.html")).toEqual([]);
  });

  it("skips an image the author named a logo, an avatar or a badge", () => {
    for (const name of ["site-logo", "author-avatar", "trust-badge", "icon-tick"]) {
      const code = `<main><img class="${name}" src="/x.svg" alt="x" width="120" height="40" loading="lazy"><h1>Page</h1></main>`;
      expect(ids(code, "index.html"), name).toEqual([]);
    }
  });

  it("still fires when the candidate sits under the page's heading", () => {
    const code = `<main>
  <h1>Website redesign pricing</h1>
  <img src="/hero.avif" alt="Studio" width="1600" height="900" loading="lazy">
</main>`;
    expect(ids(code, "index.html")).toContain("lazy-hero");
  });
});

// Task 3 found five false positives by building correct pages from real stacks
// and running them, rather than by reasoning about them. Same exercise here.
describe("correct pages from real stacks stay silent", () => {
  it("Next.js App Router page", () => {
    const code = `import Image from "next/image";
import Script from "next/script";
import hero from "@/public/hero.avif";

export default function PricingPage() {
  return (
    <main>
      <Image src={hero} alt="The studio during a design review" priority sizes="100vw" />
      <h1>Website redesign pricing</h1>
      <p>A redesign runs between eight and twenty thousand pounds.</p>
      <Image src="/chart.avif" alt="Cost by template count" width={800} height={500} loading="lazy" />
      <Script src="https://plausible.io/js/script.js" strategy="afterInteractive" />
    </main>
  );
}`;
    expect(ids(code, "app/pricing/page.tsx")).toEqual([]);
  });

  it("Astro page with scoped styles and astro:assets", () => {
    const code = `---
import { Image } from "astro:assets";
import hero from "../assets/hero.avif";
---
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Website Redesign Pricing | Saglitz</title>
  <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
  <script type="module" src="/scripts/nav.js"></script>
</head>
<body>
  <header><a href="/"><img src="/logo.svg" alt="Saglitz" width="120" height="32" /></a></header>
  <main>
    <Image src={hero} alt="The studio during a design review" fetchpriority="high" />
    <h1>Website redesign pricing</h1>
  </main>
  <style>
    @font-face {
      font-family: "Inter";
      src: url("/fonts/inter-var.woff2") format("woff2");
      font-display: swap;
    }
  </style>
</body>
</html>`;
    expect(ids(code, "src/pages/pricing.astro")).toEqual([]);
  });

  it("SvelteKit route component", () => {
    const code = `<script lang="ts">
  export let data;
</script>

<svelte:head>
  <title>Website Redesign Pricing | Saglitz</title>
</svelte:head>

<main>
  <img src="/hero.avif" alt="The studio during a design review" width="1600" height="900" fetchpriority="high" />
  <h1>Website redesign pricing</h1>
  <p>{data.intro}</p>
  <img src="/chart.avif" alt="Cost by template count" width="800" height="500" loading="lazy" decoding="async" />
</main>

<style>
  .hero { aspect-ratio: 16 / 9; width: 100%; }
</style>`;
    expect(ids(code, "src/routes/pricing/+page.svelte")).toEqual([]);
  });

  it("plain static page", () => {
    expect(ids(GOOD_HTML, "public/index.html")).toEqual([]);
  });

  it("documentation page whose first image is a mid-article diagram", () => {
    const code = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reserving space for media | Docs</title>
  <script defer src="/js/search.js"></script>
</head>
<body>
  <nav><a href="/">Home</a><a href="/docs/">Docs</a></nav>
  <main>
    <h1>Reserving space for late-loading media</h1>
    <p>Cumulative Layout Shift is caused almost entirely by designed elements arriving after first paint: images without reserved space, ad slots that expand on fill, announcement bars injected above existing content, and skeleton screens sized differently from the content that eventually replaces them.</p>
    <p>The remedy is dimensional rather than architectural, and it belongs in the design spec rather than in a performance ticket six months later.</p>
    <figure>
      <img src="/diagrams/cls.avif" alt="A card grid shifting as images load" width="960" height="540" loading="lazy" decoding="async">
      <figcaption>The shift a missing height attribute produces.</figcaption>
    </figure>
  </main>
</body>
</html>`;
    expect(ids(code, "docs/media.html")).toEqual([]);
  });
});

// A fix a reader cannot lawfully follow is worse than no fix: it is
// confident, actionable and wrong.
describe("advice stays inside what the source and the licence allow", () => {
  const fixFor = (host: string) => {
    const code = `<!doctype html><html><head><link href="https://${host}/x.css" rel="stylesheet"></head><body></body></html>`;
    return perfRules(code, "index.html").find((x) => x.rule === "third-party-font-host")!.fix;
  };

  it("tells a Google Fonts user to download and self-host", () => {
    expect(fixFor("fonts.googleapis.com")).toMatch(/download/i);
  });

  it.each(["use.typekit.net", "p.typekit.net", "cloud.typography.com", "fast.fonts.net"])(
    "never tells a %s subscriber to redistribute the files", (host) => {
      const fix = fixFor(host);
      expect(fix).not.toMatch(/download the/i);
      expect(fix).toMatch(/not license redistribution/i);
    });

  it("claims a possible shift, not a certain one, from a read that cannot see external CSS", () => {
    const f = perfRules(`<main><img src="/a.jpg" alt="A photo"></main>`, "p.html")
      .find((x) => x.rule === "image-without-dimensions")!;
    expect(f.message).toMatch(/can shift/);
    expect(f.message).not.toMatch(/everything below it moves/);
  });

  it("describes the candidate's position as the code establishes it", () => {
    const code = GOOD_HTML.replace(` fetchpriority="high"`, ` loading="lazy"`);
    const f = perfRules(code, "index.html").find((x) => x.rule === "lazy-hero")!;
    expect(f.message).toMatch(/near the top of the primary content/);
  });

  it("counts remote domains without asserting they are third parties", () => {
    const scripts = ["plausible.io", "cdn.usefathom.com", "js.stripe.com", "widget.intercom.io",
      "static.hotjar.com", "connect.facebook.net"]
      .map((h) => `<script async src="https://${h}/x.js"></script>`).join("");
    const f = perfRules(`<body>${scripts}</body>`, "p.html")
      .find((x) => x.rule === "third-party-script-count")!;
    expect(f.message).toMatch(/distinct remote domains/);
    expect(f.message).toMatch(/Some may be your own infrastructure/);
  });
});

describe("the shape the rest of the package consumes", () => {
  it("covers the markup and stylesheet extensions the rules read", () => {
    for (const ext of [".html", ".jsx", ".tsx", ".astro", ".svelte", ".vue", ".css"]) {
      expect(PERF_EXTENSIONS).toContain(ext);
    }
  });

  it("gives every finding a line, a severity, a fix and a doc", () => {
    const code = GOOD_HTML
      .replace(` fetchpriority="high"`, ` loading="lazy"`)
      .replace("      font-display: swap;\n", "");
    const findings = perfRules(code, "index.html");
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.line).toBeGreaterThan(0);
      expect(f.message.length).toBeGreaterThan(20);
      expect(f.fix.length).toBeGreaterThan(10);
      expect(f.doc).toBeTruthy();
    }
  });
});

// Carried over from seo.ts, and from the generic-design package before it,
// where a rule cited a real document that never made its claim. Resolution
// alone is not enough: the cited document has to actually discuss the thing
// the reader was just told.
describe("every doc a rule cites resolves and makes the rule's claim", () => {
  const docs = loadKnowledge(join(__dirname, "..", "knowledge"));

  // No single page can fire every rule — an image cannot both be a lazy hero
  // and a hero missing fetchpriority — so the check runs over a set whose
  // union is the whole table.
  const LAZY_PAGE = `<!doctype html>
<html lang="en">
<head>
  <link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">
  <script src="/js/app.js"></script>
  <style>
    .hero { background-image: url("/hero-wide.avif"); }
    @font-face { font-family: "Inter"; src: url("/fonts/inter.woff2") format("woff2"); }
  </style>
</head>
<body>
  <main>
    <img src="/hero.avif" alt="Studio" width="1600" height="900" loading="lazy">
    <h1>Pricing</h1>
    <img src="/chart.avif" alt="Chart">
  </main>
  <script async src="https://plausible.io/js/script.js"></script>
  <script async src="https://cdn.usefathom.com/script.js"></script>
  <script async src="https://js.stripe.com/v3/"></script>
  <script async src="https://widget.intercom.io/widget.js"></script>
  <script async src="https://static.hotjar.com/c/hotjar.js"></script>
  <script async src="https://connect.facebook.net/en_US/fbevents.js"></script>
</body>
</html>`;

  const BARE_HERO_PAGE = `<!doctype html>
<html lang="en">
<head><title>Pricing</title></head>
<body>
  <main>
    <img src="/hero.avif" alt="Studio" width="1600" height="900">
    <h1>Pricing</h1>
  </main>
</body>
</html>`;

  const findings = [
    ...perfRules(LAZY_PAGE, "index.html"),
    ...perfRules(BARE_HERO_PAGE, "pricing.html"),
  ];

  it("loads the knowledge base, so the checks below are not vacuous", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  // Each rule names the words its cited document must actually use. Re-point a
  // rule at a document that does not make its claim and this fails.
  const CLAIM_VOCABULARY: Record<string, RegExp> = {
    "lazy-hero": /never lazy-loaded/i,
    "hero-no-fetchpriority": /fetchpriority="high"/i,
    "css-hero-not-preloaded": /rel="preload" as="image"/i,
    "font-display-missing": /font-display: swap/i,
    "third-party-font-host": /Self-host WOFF2/i,
    "image-without-dimensions": /Explicit `width`\/`height`/i,
    "render-blocking-script": /defer non-critical CSS and all non-essential JS/i,
    "third-party-script-count": /Minimize third-party scripts/i,
  };

  it("fires every rule in the table, so no rule escapes the citation check", () => {
    const fired = new Set(findings.map((f) => f.rule));
    const never = Object.keys(CLAIM_VOCABULARY).filter((r) => !fired.has(r));
    expect(never).toEqual([]);
  });

  it("emits no rule the vocabulary table does not cover", () => {
    const undeclared = [...new Set(findings.map((f) => f.rule))].filter((r) => !(r in CLAIM_VOCABULARY));
    expect(undeclared).toEqual([]);
  });

  it("resolves every cited id", () => {
    const dangling = findings.filter((f) => !f.doc || !findDoc(docs, f.doc)).map((f) => `${f.rule} → ${f.doc}`);
    expect(dangling).toEqual([]);
  });

  it.each(Object.entries(CLAIM_VOCABULARY))(
    "%s cites a document that actually makes the claim", (rule, vocabulary) => {
      const cited = findings.find((f) => f.rule === rule)?.doc;
      expect(cited, `${rule} emitted no doc id`).toBeTruthy();
      const doc = findDoc(docs, cited!);
      expect(doc, `${rule} → ${cited} does not resolve`).toBeTruthy();
      expect(vocabulary.test(doc!.body), `${cited} never mentions ${vocabulary}`).toBe(true);
    });

  // This module reads what is authored. A Core Web Vitals verdict is a
  // 75th-percentile field measurement and is not in any file — claiming one
  // from source is this package's forbidden claim, and a team told their
  // vitals are fine from a static read would stop measuring.
  it("never claims a measurement, a verdict or a ranking outcome", () => {
    const forbidden = new RegExp([
      "your (?:LCP|INP|CLS)",
      "(?:LCP|INP|CLS) (?:is|will be|would be) (?:good|bad|fine|poor|fast|slow)",
      "Core Web Vitals (?:score|verdict|pass|fail)",
      "passes? (?:CWV|Core Web Vitals)",
      "fails? (?:CWV|Core Web Vitals)",
      "will rank", "rank higher", "improve your rankings", "boost your ranking", "guarantee",
      "\\d+(?:\\.\\d+)?\\s*s(?:econds)? (?:faster|off)",
    ].join("|"), "i");
    for (const f of findings) {
      expect(forbidden.test(`${f.message} ${f.fix}`), `${f.rule}: ${f.message} ${f.fix}`).toBe(false);
    }
  });
});

// ── the report and its structured half ───────────────────────────────────────
//
// `perfReport` is the surface `audit_performance` returns. The rules above are
// tested for what they claim; these test what the *report* claims. The report
// is where a silent rule becomes a misleading clean bill, so the limitations
// `lazy-hero` and `image-without-dimensions` disclose in their own comments
// have to survive the trip out to the caller.

describe("perfReport — the prose and the structure agree", () => {
  const BAD_PAGE = `<!doctype html>
<html lang="en">
<head>
  <script src="/js/analytics-tag.js"></script>
</head>
<body>
  <main>
    <img src="/hero.jpg" alt="Hero" loading="lazy" fetchpriority="high">
  </main>
</body>
</html>`;

  it("returns markdown and a structured payload from one call", () => {
    const { text, structured } = perfReport({ source: BAD_PAGE, filename: "index.html" });
    expect(text).toContain("# Performance audit");
    expect(text.length).toBeGreaterThan(40);
    expect(structured.findings.length).toBeGreaterThan(0);
  });

  it("counts a summary that agrees with its own findings", () => {
    const { structured } = perfReport({ source: BAD_PAGE, filename: "index.html" });
    const count = (s: string) => structured.findings.filter((f) => f.severity === s).length;
    expect(structured.summary).toEqual({
      error: count("error"), warning: count("warning"), info: count("info"),
    });
    expect(structured.summary.error + structured.summary.warning + structured.summary.info)
      .toBe(structured.findings.length);
  });

  it("prints the same counts in the prose as it returns in the summary", () => {
    const { text, structured } = perfReport({ source: BAD_PAGE, filename: "index.html" });
    const { error, warning, info } = structured.summary;
    expect(text).toContain(`**${error} error · ${warning} warning · ${info} info**`);
  });

  it("gives every structured finding the fields an agent needs to act", () => {
    const { structured } = perfReport({ source: BAD_PAGE, filename: "index.html" });
    for (const f of structured.findings) {
      expect(f.rule, JSON.stringify(f)).toBeTruthy();
      expect(["error", "warning", "info"]).toContain(f.severity);
      expect(f.message.length, f.rule).toBeGreaterThan(10);
      expect(f.fix.length, f.rule).toBeGreaterThan(10);
      expect(f.doc, f.rule).toBeTruthy();
      expect(typeof f.line, f.rule).toBe("number");
    }
  });

  it("names the file on every finding in directory mode, not only in the prose", () => {
    const dir = mkdtempSync(join(tmpdir(), "saglitz-perf-report-"));
    writeFileSync(join(dir, "index.html"), BAD_PAGE);
    const { text, structured } = perfReport({ root: dir });
    expect(text).toContain("index.html");
    const withFile = structured.findings.filter((f) => f.file === "index.html");
    expect(withFile.length).toBeGreaterThan(0);
    for (const f of withFile) expect(f.message.startsWith("index.html:")).toBe(false);
  });

  /** The path is data, not a prefix parsed back out of the sentence. */
  it("carries a path that contains a colon", () => {
    const dir = mkdtempSync(join(tmpdir(), "saglitz-perf-colon-"));
    writeFileSync(join(dir, "chapter 2: the fall.html"), BAD_PAGE);
    const { text, structured } = perfReport({ root: dir });
    expect(structured.findings.length).toBeGreaterThan(0);
    for (const f of structured.findings) expect(f.file, f.rule).toBe("chapter 2: the fall.html");
    expect(text).toContain("chapter 2: the fall.html:");
  });

  it("reports a capped scan as partial rather than complete", () => {
    const dir = mkdtempSync(join(tmpdir(), "saglitz-perf-capped-"));
    const padding = `<p>${"lorem ipsum dolor sit amet ".repeat(15_000)}</p>`;
    for (let i = 0; i < 9; i++) writeFileSync(join(dir, `page-${i}.html`), padding);
    expect(perfReport({ root: dir }).text).toMatch(/results are partial/i);
  }, 30_000);

  it("returns the notVisible list it printed, entry for entry", () => {
    const { text, structured } = perfReport({ source: BAD_PAGE, filename: "index.html" });
    expect(structured.notVisible).toEqual(PERF_NOT_VISIBLE);
    expect(structured.notVisible.length).toBeGreaterThan(4);
    for (const entry of structured.notVisible) expect(text).toContain(entry);
  });
});

describe("perfReport — what it discloses it cannot see", () => {
  const notVisible = PERF_NOT_VISIBLE.join("\n");

  it("says plainly that nothing here is measured", () => {
    expect(notVisible).toMatch(/Nothing here is measured/i);
    expect(notVisible).toMatch(/75th-percentile field data/i);
  });

  it("discloses metadata and headers injected at build or request time", () => {
    expect(notVisible).toMatch(/build or request time/i);
  });

  it("discloses everything that needs the whole site graph", () => {
    expect(notVisible).toMatch(/broken links/i);
    expect(notVisible).toMatch(/orphan/i);
    expect(notVisible).toMatch(/redirect chains/i);
  });

  it("names all three conditions that silence lazy-hero and hero-no-fetchpriority", () => {
    expect(notVisible).toContain("lazy-hero");
    expect(notVisible).toContain("hero-no-fetchpriority");
    expect(notVisible).toMatch(/no `?<main>`?/i);
    expect(notVisible).toMatch(/unresolved component/i);
    expect(notVisible).toMatch(/200 characters/);
  });

  it("discloses that image-without-dimensions cannot read sizing from elsewhere", () => {
    expect(notVisible).toContain("image-without-dimensions");
    expect(notVisible).toMatch(/external stylesheet/i);
    expect(notVisible).toMatch(/CSS module/i);
    // Not "it cannot see an unscanned stylesheet" — every file is audited on
    // its own, so a stylesheet scanned in the same run does not size an image
    // in another file either. Implying that a directory audit joins them
    // would send a reader to re-run the tool instead of to the file.
    expect(notVisible).toMatch(/even when that stylesheet was scanned/i);
  });

  it("is right about that: a scanned sibling stylesheet does not size the image", () => {
    const dir = mkdtempSync(join(tmpdir(), "saglitz-perf-css-"));
    writeFileSync(join(dir, "index.html"),
      `<!doctype html><html lang="en"><head><link rel="stylesheet" href="/styles.css"></head><body><main><p>Copy.</p><img src="/p.jpg" alt="A photo" class="cover"></main></body></html>`);
    writeFileSync(join(dir, "styles.css"), `.cover { aspect-ratio: 16 / 9; width: 100%; }`);
    const { structured } = perfReport({ root: dir });
    expect(structured.findings.map((f) => f.rule)).toContain("image-without-dimensions");
  });

  it("leaves the above-the-fold judgement with the reader", () => {
    expect(notVisible).toMatch(/above the fold/i);
    expect(notVisible).toMatch(/judgement/i);
  });

  it("never claims a vitals verdict or a ranking outcome anywhere in the report", () => {
    const { text } = perfReport({ source: "<p>hello</p>", filename: "index.html" });
    const forbidden = new RegExp([
      "your (?:LCP|INP|CLS)",
      "(?:LCP|INP|CLS) (?:is|will be|would be) (?:good|bad|fine|poor|fast|slow)",
      "Core Web Vitals (?:score|verdict|pass|fail)",
      "passes? (?:CWV|Core Web Vitals)", "fails? (?:CWV|Core Web Vitals)",
      "will rank", "rank higher", "improve your rankings", "boost your ranking", "guarantee",
    ].join("|"), "i");
    expect(forbidden.test(text), text).toBe(false);
  });
});
