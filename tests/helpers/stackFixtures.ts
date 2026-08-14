/**
 * The per-stack fixture matrix.
 *
 * Five pages, one per stack, each written the way a competent developer on
 * that stack would write it — proper metadata, one `<h1>`, a canonical,
 * headings in order, several sized images with alt text, a self-hosted font
 * declaring `font-display`, first-party script deferred and third-party
 * script kept inside a sane budget.
 *
 * They are here, in one module, rather than inline in either suite, because
 * the point of the matrix is that *both* auditors grade *the same* page. A
 * page that only `audit_seo_geo` ever sees proves nothing about
 * `audit_performance`, and a fixture forked between the two suites drifts
 * apart on the first edit.
 *
 * Two rules govern edits to this file:
 *
 *   1. A fixture that comes back clean because it contains nothing is
 *      worthless. Every page here carries real substrate — metadata, a hero,
 *      below-the-fold media, a font, third-party scripts, outbound links — so
 *      that silence from a rule means the rule looked and had nothing to say,
 *      not that it had nothing to look at.
 *
 *   2. When a fixture is not clean, fix the rule, not the fixture. These
 *      pages were written before the rules were read, precisely so that they
 *      cannot be reverse-engineered into passing.
 */

/** Next.js App Router page, `app/pricing/page.tsx`. */
export const NEXT_APP_ROUTER = `import type { Metadata } from "next";
import Image from "next/image";
import Script from "next/script";
import Link from "next/link";
import { Inter } from "next/font/google";
import studio from "@/public/studio.avif";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Website Redesign Pricing for UK Startups | Saglitz",
  description:
    "What a website redesign costs in 2026, broken down by scope, with line-item numbers from twelve recent studio projects and a four-week delivery timeline.",
  alternates: { canonical: "https://saglitz.com/pricing/" },
  openGraph: {
    type: "article",
    title: "Website Redesign Pricing for UK Startups",
    description:
      "Line-item redesign costs from twelve recent studio projects, with the scope decisions that move each number up or down.",
    url: "https://saglitz.com/pricing/",
    images: [{ url: "https://saglitz.com/og/pricing.png", width: 1200, height: 630 }],
  },
};

export default function PricingPage() {
  return (
    <main className={inter.className}>
      <Image
        src={studio}
        alt="Two designers reviewing wireframes pinned to a studio wall"
        priority
        sizes="100vw"
        placeholder="blur"
      />

      <h1>Website redesign pricing</h1>
      <p>
        A redesign for a small business site runs between eight and twenty thousand pounds. The
        spread is not padding: it is the difference between restyling five templates and rebuilding
        twenty of them against a content model that did not previously exist.
      </p>

      <h2>What changes the price</h2>
      <p>
        Template count is the single largest driver. Every template needs its own layout, its own
        responsive pass, and its own entry in the content model, and none of that work is shared
        with the template beside it.
      </p>

      <h3>Template count</h3>
      <p>
        A five-template marketing site costs roughly half what a twenty-template site costs. Count
        the templates before you count the pages: forty blog posts are one template, not forty.
      </p>
      <Image
        src="/charts/cost-by-template.avif"
        alt="Cost rising roughly linearly with template count across twelve projects"
        width={800}
        height={500}
        loading="lazy"
      />

      <h3>Whether the copy is written from scratch</h3>
      <p>
        Migrating existing copy is a day. Writing it is three weeks, and it is the line item most
        often discovered late, after the design is already signed off.
      </p>

      <h2>How we scope a project</h2>
      <p>
        We scope in four weeks: one week of discovery, two of design, one of build handover. The
        timeline below is the one we quote, and the one we have hit on eleven of the last twelve
        projects.
      </p>
      <Image
        src="/charts/timeline.avif"
        alt="A four-week timeline from discovery through design to build handover"
        width={1200}
        height={480}
        loading="lazy"
      />

      <p>
        Read the <Link href="/process/">process notes</Link> for what happens in each week, or the{" "}
        <a href="https://web.dev/articles/vitals" rel="noopener noreferrer">
          Core Web Vitals guide
        </a>{" "}
        for the performance targets every build here is held to.
      </p>

      <Script src="https://plausible.io/js/script.js" strategy="afterInteractive" />
      <Script src="https://js.stripe.com/v3/" strategy="lazyOnload" />
    </main>
  );
}
`;

/** Astro page, `src/pages/pricing.astro`. */
export const ASTRO_PAGE = `---
import { Image } from "astro:assets";
import studio from "../assets/studio.avif";

const title = "Website Redesign Pricing for UK Startups | Saglitz";
const description =
  "What a website redesign costs in 2026, broken down by scope, with line-item numbers from twelve recent studio projects and a four-week delivery timeline.";
const canonical = "https://saglitz.com/pricing/";
const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Website redesign pricing",
  description,
  author: { "@type": "Organization", name: "Saglitz Design" },
  datePublished: "2026-02-11",
};
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="Website Redesign Pricing for UK Startups" />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content="https://saglitz.com/og/pricing.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preconnect" href="https://plausible.io" />
    <script type="application/ld+json" set:html={JSON.stringify(schema)} />
    <script defer data-domain="saglitz.com" src="https://plausible.io/js/script.js"></script>
  </head>
  <body>
    <header>
      <a href="/"><img src="/logo.svg" alt="Saglitz Design" width="120" height="32" /></a>
      <nav aria-label="Primary">
        <a href="/work/">Work</a>
        <a href="/pricing/">Pricing</a>
        <a href="/contact/">Contact</a>
      </nav>
    </header>

    <main>
      <Image
        src={studio}
        alt="Two designers reviewing wireframes pinned to a studio wall"
        widths={[640, 1280, 1600]}
        sizes="100vw"
        loading="eager"
        fetchpriority="high"
      />

      <h1>Website redesign pricing</h1>
      <p>
        A redesign for a small business site runs between eight and twenty thousand pounds. The
        spread is the difference between restyling five templates and rebuilding twenty of them
        against a content model that did not previously exist.
      </p>

      <h2>What changes the price</h2>
      <p>
        Template count is the single largest driver. Every template needs its own layout, its own
        responsive pass and its own entry in the content model.
      </p>

      <h3>Template count</h3>
      <p>
        A five-template marketing site costs roughly half what a twenty-template site costs. Count
        templates before pages: forty blog posts are one template, not forty.
      </p>
      <img
        src="/charts/cost-by-template.avif"
        alt="Cost rising roughly linearly with template count across twelve projects"
        width="800"
        height="500"
        loading="lazy"
        decoding="async"
      />

      <h2>How we scope a project</h2>
      <p>
        One week of discovery, two of design, one of build handover. We have hit that timeline on
        eleven of the last twelve projects.
      </p>
      <img
        src="/charts/timeline.avif"
        alt="A four-week timeline from discovery through design to build handover"
        width="1200"
        height="480"
        loading="lazy"
        decoding="async"
      />

      <p>
        Read the <a href="/process/">process notes</a>, or the
        <a href="https://web.dev/articles/vitals" rel="noopener noreferrer">Core Web Vitals guide</a>
        for the targets every build here is held to.
      </p>
    </main>

    <footer>
      <p>Saglitz Design, Manchester. <a href="/privacy/">Privacy</a></p>
    </footer>

    <style is:global>
      @font-face {
        font-family: "Inter";
        src: url("/fonts/inter-var.woff2") format("woff2");
        font-weight: 100 900;
        font-display: swap;
      }
      body {
        font-family: "Inter", system-ui, sans-serif;
      }
    </style>
  </body>
</html>
`;

/** SvelteKit route, `src/routes/pricing/+page.svelte`. */
export const SVELTEKIT_PAGE = `<script lang="ts">
  import { page } from "$app/stores";
  export let data;

  const title = "Website Redesign Pricing for UK Startups | Saglitz";
  const description =
    "What a website redesign costs in 2026, broken down by scope, with line-item numbers from twelve recent studio projects and a four-week delivery timeline.";
  const canonical = "https://saglitz.com/pricing/";
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="Website Redesign Pricing for UK Startups" />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content="https://saglitz.com/og/pricing.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
  <script defer data-domain="saglitz.com" src="https://plausible.io/js/script.js"></script>
</svelte:head>

<header>
  <a href="/"><img src="/logo.svg" alt="Saglitz Design" width="120" height="32" /></a>
  <nav aria-label="Primary">
    <a href="/work/">Work</a>
    <a href="/pricing/">Pricing</a>
    <a href="/contact/">Contact</a>
  </nav>
</header>

<main>
  <img
    src="/studio.avif"
    alt="Two designers reviewing wireframes pinned to a studio wall"
    width="1600"
    height="900"
    fetchpriority="high"
  />

  <h1>Website redesign pricing</h1>
  <p>
    A redesign for a small business site runs between eight and twenty thousand pounds. The spread
    is the difference between restyling five templates and rebuilding twenty of them against a
    content model that did not previously exist.
  </p>

  <h2>What changes the price</h2>
  <p>
    Template count is the single largest driver. Every template needs its own layout, its own
    responsive pass and its own entry in the content model.
  </p>

  <h3>Template count</h3>
  <p>{data.templateNote}</p>
  <img
    src="/charts/cost-by-template.avif"
    alt="Cost rising roughly linearly with template count across twelve projects"
    width="800"
    height="500"
    loading="lazy"
    decoding="async"
  />

  <h2>How we scope a project</h2>
  <p>
    One week of discovery, two of design, one of build handover. We have hit that timeline on eleven
    of the last twelve projects.
  </p>
  <img
    src="/charts/timeline.avif"
    alt="A four-week timeline from discovery through design to build handover"
    width="1200"
    height="480"
    loading="lazy"
    decoding="async"
  />

  <p>
    Read the <a href="/process/">process notes</a>, or the
    <a href="https://web.dev/articles/vitals" rel="noopener noreferrer">Core Web Vitals guide</a>
    for the targets every build here is held to.
  </p>
</main>

<footer>
  <p>Saglitz Design, Manchester. <a href="/privacy/">Privacy</a></p>
</footer>

<style>
  @font-face {
    font-family: "Inter";
    src: url("/fonts/inter-var.woff2") format("woff2");
    font-weight: 100 900;
    font-display: swap;
  }

  main {
    max-width: 68ch;
    margin-inline: auto;
    font-family: "Inter", system-ui, sans-serif;
  }

  img {
    max-width: 100%;
    height: auto;
  }
</style>
`;

/** Hand-written static page, `public/pricing/index.html`. */
export const STATIC_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Website Redesign Pricing for UK Startups | Saglitz</title>
  <meta name="description" content="What a website redesign costs in 2026, broken down by scope, with line-item numbers from twelve recent studio projects and a four-week delivery timeline.">
  <link rel="canonical" href="https://saglitz.com/pricing/">
  <meta property="og:type" content="article">
  <meta property="og:title" content="Website Redesign Pricing for UK Startups">
  <meta property="og:description" content="Line-item redesign costs from twelve recent studio projects, with the scope decisions that move each number up or down.">
  <meta property="og:url" content="https://saglitz.com/pricing/">
  <meta property="og:image" content="https://saglitz.com/og/pricing.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preconnect" href="https://plausible.io">
  <style>
    @font-face {
      font-family: "Inter";
      src: url("/fonts/inter-var.woff2") format("woff2");
      font-weight: 100 900;
      font-display: swap;
    }
    body { font-family: "Inter", system-ui, sans-serif; margin: 0; }
    main { max-width: 68ch; margin-inline: auto; padding: 2rem 1rem; }
    img { max-width: 100%; height: auto; }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Website redesign pricing",
    "description": "What a website redesign costs in 2026, broken down by scope.",
    "author": { "@type": "Organization", "name": "Saglitz Design" },
    "datePublished": "2026-02-11"
  }
  </script>
  <script defer src="/js/nav.js"></script>
  <script defer data-domain="saglitz.com" src="https://plausible.io/js/script.js"></script>
</head>
<body>
  <header>
    <a href="/"><img src="/logo.svg" alt="Saglitz Design" width="120" height="32"></a>
    <nav aria-label="Primary">
      <a href="/work/">Work</a>
      <a href="/pricing/">Pricing</a>
      <a href="/contact/">Contact</a>
    </nav>
  </header>

  <main>
    <img src="/studio.avif" alt="Two designers reviewing wireframes pinned to a studio wall" width="1600" height="900" fetchpriority="high">

    <h1>Website redesign pricing</h1>
    <p>A redesign for a small business site runs between eight and twenty thousand pounds. The spread is not padding: it is the difference between restyling five templates and rebuilding twenty of them against a content model that did not previously exist.</p>

    <h2>What changes the price</h2>
    <p>Template count is the single largest driver. Every template needs its own layout, its own responsive pass, and its own entry in the content model, and none of that work is shared with the template beside it.</p>

    <h3>Template count</h3>
    <p>A five-template marketing site costs roughly half what a twenty-template site costs. Count the templates before you count the pages: forty blog posts are one template, not forty.</p>
    <figure>
      <img src="/charts/cost-by-template.avif" alt="Cost rising roughly linearly with template count across twelve projects" width="800" height="500" loading="lazy" decoding="async">
      <figcaption>Twelve projects, plotted by template count against final invoice.</figcaption>
    </figure>

    <h3>Whether the copy is written from scratch</h3>
    <p>Migrating existing copy is a day. Writing it is three weeks, and it is the line item most often discovered late, after the design is already signed off.</p>

    <h2>How we scope a project</h2>
    <p>One week of discovery, two of design, one of build handover. That is the timeline we quote, and the one we have hit on eleven of the last twelve projects.</p>
    <figure>
      <img src="/charts/timeline.avif" alt="A four-week timeline from discovery through design to build handover" width="1200" height="480" loading="lazy" decoding="async">
      <figcaption>The four-week schedule, week by week.</figcaption>
    </figure>

    <p>Read the <a href="/process/">process notes</a> for what happens in each week, or the <a href="https://web.dev/articles/vitals" rel="noopener noreferrer">Core Web Vitals guide</a> for the performance targets every build here is held to.</p>
  </main>

  <footer>
    <p>Saglitz Design, Manchester. <a href="/privacy/">Privacy</a></p>
  </footer>
</body>
</html>
`;

/**
 * A Docusaurus documentation page, as built: `build/docs/reserving-space/index.html`.
 *
 * `.md`/`.mdx` are in neither tool's extension list, so the artefact either
 * tool would ever actually read on a Docusaurus site is the emitted HTML —
 * server-rendered into `#__docusaurus`, with the theme's nav, sidebar,
 * breadcrumbs and prev/next links around the article.
 */
export const DOCUSAURUS_BUILT = `<!doctype html>
<html lang="en" dir="ltr" class="docs-wrapper plugin-docs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title data-rh="true">Reserving space for late-loading media | Saglitz Docs</title>
  <meta data-rh="true" name="description" content="Why cumulative layout shift is a design defect rather than a build defect, and the four places to reserve space before the asset arrives.">
  <link data-rh="true" rel="canonical" href="https://saglitz.com/docs/reserving-space/">
  <meta data-rh="true" property="og:title" content="Reserving space for late-loading media">
  <meta data-rh="true" property="og:description" content="Why cumulative layout shift is a design defect rather than a build defect, and the four places to reserve space.">
  <meta data-rh="true" property="og:url" content="https://saglitz.com/docs/reserving-space/">
  <meta data-rh="true" property="og:image" content="https://saglitz.com/img/docs-social-card.png">
  <meta data-rh="true" name="twitter:card" content="summary_large_image">
  <link rel="preload" href="/assets/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin>
  <style data-styled="true">
    @font-face {
      font-family: "Inter";
      src: url("/assets/fonts/inter-var.woff2") format("woff2");
      font-display: swap;
    }
  </style>
  <script defer src="/assets/js/runtime~main.4f1c2b.js"></script>
  <script defer src="/assets/js/main.9a7d31.js"></script>
</head>
<body class="navigation-with-keyboard">
  <div id="__docusaurus">
    <nav class="navbar" aria-label="Main">
      <a class="navbar__brand" href="/">
        <img class="navbar__logo" src="/img/logo.svg" alt="Saglitz Docs" width="32" height="32">
        <b class="navbar__title">Saglitz Docs</b>
      </a>
      <a class="navbar__item navbar__link" href="/docs/intro/">Guides</a>
      <a class="navbar__item navbar__link" href="/docs/api/">API</a>
      <a class="navbar__item navbar__link" href="https://github.com/saglitz/design" rel="noopener noreferrer">GitHub</a>
    </nav>

    <div class="main-wrapper">
      <aside class="theme-doc-sidebar-container">
        <nav class="menu" aria-label="Docs sidebar">
          <a class="menu__link" href="/docs/intro/">Introduction</a>
          <a class="menu__link menu__link--active" href="/docs/reserving-space/">Reserving space</a>
          <a class="menu__link" href="/docs/fonts/">Font loading</a>
        </nav>
      </aside>

      <main class="docMainContainer">
        <nav class="theme-doc-breadcrumbs" aria-label="Breadcrumbs">
          <a class="breadcrumbs__link" href="/">Home</a>
          <a class="breadcrumbs__link" href="/docs/intro/">Guides</a>
          <span class="breadcrumbs__link breadcrumbs__link--active">Reserving space</span>
        </nav>

        <article>
          <h1>Reserving space for late-loading media</h1>
          <p>Cumulative layout shift is caused almost entirely by designed elements arriving after first paint: images without reserved space, ad slots that expand on fill, announcement bars injected above existing content, and skeleton screens sized differently from the content that replaces them.</p>
          <p>The remedy is dimensional rather than architectural, which is why it belongs in the design specification rather than in a performance ticket raised six months after launch.</p>

          <h2>Where the shift comes from</h2>
          <p>Four sources account for nearly every shift we have measured in a studio build. Each has a fix that costs nothing at design time and a great deal once the page is live.</p>

          <h3>Images without dimensions</h3>
          <p>An image with no width and height attributes occupies zero rows until its bytes arrive, then pushes everything below it down by its full height. Setting both attributes, or an aspect ratio in CSS, reserves the box in advance.</p>
          <figure>
            <img src="/img/diagrams/cls-grid.avif" alt="A card grid shifting downwards as each image finishes loading" width="960" height="540" loading="lazy" decoding="async">
            <figcaption>The shift a missing height attribute produces on a three-column grid.</figcaption>
          </figure>

          <h3>Injected banners</h3>
          <p>A consent bar or announcement strip inserted above the header moves the entire document. Reserve its height in the layout from the first paint, and hide rather than remove it when it is dismissed.</p>
          <figure>
            <img src="/img/diagrams/banner-shift.avif" alt="A page header pushed down by a consent banner injected after load" width="960" height="420" loading="lazy" decoding="async">
            <figcaption>The same document, before and after the banner arrives.</figcaption>
          </figure>

          <h2>What to specify</h2>
          <p>Give every media slot an intrinsic ratio, every injected region a reserved height, and every skeleton the dimensions of the content it stands in for. See the <a href="/docs/fonts/">font loading guide</a> for the text-side equivalent, and <a href="https://web.dev/articles/cls" rel="noopener noreferrer">web.dev on CLS</a> for the measurement definition.</p>
        </article>

        <nav class="pagination-nav" aria-label="Docs pages">
          <a class="pagination-nav__link" href="/docs/intro/">Previous: Introduction</a>
          <a class="pagination-nav__link" href="/docs/fonts/">Next: Font loading</a>
        </nav>
      </main>
    </div>

    <footer class="footer">
      <p>Saglitz Design. <a href="/privacy/">Privacy</a></p>
    </footer>
  </div>
</body>
</html>
`;

/**
 * The deliberately broken page. Every defect here is one somebody actually
 * ships, and each is named in the assertions so the matrix has to tell them
 * apart rather than returning clean for everything.
 *
 * Seeded defects, by intent:
 *  - title far over any sane length
 *  - no meta description
 *  - no canonical
 *  - two `<h1>`s
 *  - a heading level skipped (h1 straight to h3)
 *  - an image with no alt, and images with no dimensions
 *  - a hero carrying loading="lazy"
 *  - a render-blocking third-party script in <head>
 *  - a Google Fonts stylesheet (third-party font host, no font-display)
 *  - JSON-LD that does not parse
 */
export const BROKEN_PAGE = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pricing and Costs and Rates and Quotes for Website Redesign Projects for Small Businesses and Startups Across the United Kingdom in 2026</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900" rel="stylesheet">
  <script src="https://cdn.example.com/tracker.js"></script>
  <script src="https://widget.example.com/chat.js"></script>
  <script src="https://ads.example.com/pixel.js"></script>
  <script src="https://cdn.example.com/heatmap.js"></script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","headline":"Pricing",}
  </script>
</head>
<body>
  <div class="page">
    <img src="/hero.png" loading="lazy">
    <h1>Pricing</h1>
    <h3>Templates</h3>
    <p>It depends.</p>
    <h1>Contact</h1>
    <img src="/office.png">
  </div>
</body>
</html>
`;

/**
 * Counterexample one for the `recipes/` question: an image-only splash page.
 *
 * No `<h1>`, no sectioning landmark, no outbound link — the exact signal
 * proposed as a guard for hand-written component demos — but this is a real
 * page a real visitor lands on, and its missing title and description are
 * real defects that a guard keyed on that signal would swallow.
 */
export const IMAGE_ONLY_SPLASH = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; display: grid; place-items: center; min-height: 100vh; }
  </style>
</head>
<body>
  <div class="splash">
    <img src="/brand/wordmark.png" alt="Saglitz Design">
    <img src="/brand/coming-soon.png" alt="Launching March 2026">
  </div>
</body>
</html>
`;

/**
 * Counterexample two for the `recipes/` question: a minimal 404 page.
 *
 * Also carries no `<h1>`, no landmark and no outbound link, and is also a
 * page a visitor genuinely reaches.
 */
export const MINIMAL_404 = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404</title>
</head>
<body>
  <div class="wrap">
    <p><strong>404</strong> — that page has moved or never existed.</p>
    <p><a href="/">Back to the homepage</a></p>
  </div>
</body>
</html>
`;

/** The five correctly-made pages, with the path each would live at. */
export const CORRECT_STACK_PAGES: Array<{ stack: string; path: string; code: string }> = [
  { stack: "Next.js App Router", path: "app/pricing/page.tsx", code: NEXT_APP_ROUTER },
  { stack: "Astro", path: "src/pages/pricing.astro", code: ASTRO_PAGE },
  { stack: "SvelteKit", path: "src/routes/pricing/+page.svelte", code: SVELTEKIT_PAGE },
  { stack: "static HTML", path: "public/pricing/index.html", code: STATIC_HTML },
  { stack: "Docusaurus (built)", path: "build/docs/reserving-space/index.html", code: DOCUSAURUS_BUILT },
];
