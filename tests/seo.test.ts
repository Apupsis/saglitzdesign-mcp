import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { seoRules, seoConfigRules, seoReport, SEO_NOT_VISIBLE, SEO_EXTENSIONS, SEO_FILENAMES, SEO_CAPABILITIES } from "../dist/seo.js";
import { loadKnowledge, findDoc } from "../dist/knowledge.js";
import {
  CORRECT_STACK_PAGES, NEXT_APP_ROUTER, ASTRO_PAGE, SVELTEKIT_PAGE, STATIC_HTML,
  DOCUSAURUS_BUILT, BROKEN_PAGE, IMAGE_ONLY_SPLASH, MINIMAL_404,
} from "./helpers/stackFixtures.js";

const ids = (code: string, filename?: string) =>
  seoRules(code, filename).map((f) => f.rule).sort();

const configIds = (files: Array<{ path: string; source: string }>) =>
  seoConfigRules(files).map((f) => f.rule).sort();

/** A complete, correct static page — the base every "one thing wrong" case edits. */
const GOOD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Website Redesign Pricing for UK Startups | Saglitz</title>
  <meta name="description" content="What a website redesign costs in 2026, broken down by scope, with real line-item numbers from twelve recent studio projects and a four-week timeline.">
  <link rel="canonical" href="https://saglitz.com/pricing/">
</head>
<body>
  <main>
    <h1>Website redesign pricing</h1>
    <p>A redesign for a small business site runs between eight and twenty thousand pounds, depending on how many templates you need and whether the copy is written from scratch.</p>
    <h2>What changes the price</h2>
    <p>Template count is the single largest driver. A five-template marketing site costs roughly half what a twenty-template site costs, because every template needs its own layout, responsive pass and content model.</p>
    <img src="/studio.jpg" alt="The studio during a design review">
  </main>
</body>
</html>`;

describe("page rules — fire when they should", () => {
  it("flags two <h1>s on one page", () => {
    const code = GOOD_HTML.replace("<h2>What changes the price</h2>", "<h1>What changes the price</h1>");
    expect(ids(code, "index.html")).toContain("multiple-h1");
  });

  it("flags a JSON-LD block with a trailing comma, rather than throwing", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Organization","name":"Saglitz",}
  </script></head>`);
    const f = seoRules(code, "index.html").find((x) => x.rule === "jsonld-unparseable");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("error");
  });

  it("flags a JSON-LD block with no @type", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">
  {"@context":"https://schema.org","name":"Saglitz"}
  </script></head>`);
    expect(ids(code, "index.html")).toContain("jsonld-missing-required");
  });

  it("flags an empty root div beside a bundle script and nothing else", () => {
    const code = `<!doctype html>
<html lang="en">
<head><title>App</title></head>
<body>
  <div id="root"></div>
  <script src="/assets/index-4f2c.js"></script>
</body>
</html>`;
    const f = seoRules(code, "index.html").find((x) => x.rule === "content-not-in-html");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("flags a document whose head carries no <title>", () => {
    expect(ids(GOOD_HTML.replace(/<title>[^<]*<\/title>/, ""), "index.html")).toContain("title-missing");
  });

  it("flags a title well past the truncation point", () => {
    const long = "Website Redesign Pricing for UK Startups, Agencies and Small Businesses | Saglitz Design";
    expect(long.length).toBeGreaterThan(60);
    expect(ids(GOOD_HTML.replace(/<title>[^<]*<\/title>/, `<title>${long}</title>`), "index.html"))
      .toContain("title-length");
  });

  it("flags a one-word title", () => {
    expect(ids(GOOD_HTML.replace(/<title>[^<]*<\/title>/, "<title>Home</title>"), "index.html"))
      .toContain("title-length");
  });

  it("flags a document with no meta description", () => {
    expect(ids(GOOD_HTML.replace(/<meta name="description"[^>]*>/, ""), "index.html"))
      .toContain("meta-description-missing");
  });

  it("flags a meta description far past 160 characters", () => {
    const long = "x".repeat(240);
    expect(ids(GOOD_HTML.replace(/content="[^"]*"(?=>\n  <link rel="canonical")/, `content="${long}"`), "index.html"))
      .toContain("meta-description-length");
  });

  it("flags a document with no canonical", () => {
    expect(ids(GOOD_HTML.replace(/<link rel="canonical"[^>]*>/, ""), "index.html")).toContain("canonical-missing");
  });

  it("flags a relative canonical", () => {
    expect(ids(GOOD_HTML.replace('href="https://saglitz.com/pricing/"', 'href="/pricing/"'), "index.html"))
      .toContain("canonical-not-absolute");
  });

  it("flags a canonical left pointing at a host nobody can reach, at error severity", () => {
    const code = GOOD_HTML.replace("https://saglitz.com/pricing/", "http://localhost:3000/pricing/");
    const f = seoRules(code, "index.html").find((x) => x.rule === "canonical-points-elsewhere");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("error");
  });

  it("flags a canonical pointing at a staging host", () => {
    const code = GOOD_HTML.replace("https://saglitz.com/pricing/", "https://staging.saglitz.com/pricing/");
    expect(ids(code, "index.html")).toContain("canonical-points-elsewhere");
  });

  it("flags an h1 followed by an h3", () => {
    const code = GOOD_HTML.replace("<h2>What changes the price</h2>", "<h3>What changes the price</h3>");
    const f = seoRules(code, "index.html").find((x) => x.rule === "heading-order-skipped");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  it("flags an image with no alt attribute at all", () => {
    expect(ids(GOOD_HTML.replace(' alt="The studio during a design review"', ""), "index.html"))
      .toContain("alt-missing");
  });

  it("flags an hreflang set that never names this page", () => {
    const code = GOOD_HTML.replace("</head>", `<link rel="alternate" hreflang="de" href="https://saglitz.com/de/preise/">
  <link rel="alternate" hreflang="fr" href="https://saglitz.com/fr/tarifs/">
  </head>`);
    expect(ids(code, "index.html")).toContain("hreflang-not-reciprocal");
  });

  it("points a metadata finding at the line the reader has to edit", () => {
    const code = `import type { Metadata } from "next";

export const metadata: Metadata = {
  description: "What a website redesign costs in 2026, broken down by scope, with real line-item numbers from twelve recent studio projects and a four-week timeline.",
  title: "${"t".repeat(90)}",
};`;
    const f = seoRules(code, "app/page.tsx").find((x) => x.rule === "title-length");
    expect(f).toBeDefined();
    expect(f!.line).toBe(5);
  });

  // technical-seo §4 lists the types whose rich results Google retired, and is
  // equally clear the markup stays valid: "Keep FAQPage markup if cheap; don't
  // build strategy on it." So this notes a retired expectation, not a defect,
  // and must not ask for a deletion the cited document argues against.
  it("notes a retired rich-result type without asking for the markup back", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}
  </script></head>`);
    const f = seoRules(code, "index.html").find((x) => x.rule === "jsonld-deprecated-type");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
    expect(f!.message).toContain("FAQPage");
    // The cited document says to keep the markup, so the fix may not instruct
    // its removal — "Nothing to remove" is the sentence, not a violation of it.
    expect(f!.fix).toMatch(/nothing to remove|keep it/i);
    expect(`${f!.message} ${f!.fix}`).not.toMatch(/\b(?:remove|delete|drop|strip)\s+(?:it|this|the (?:block|markup|type))\b/i);
  });

  it("says nothing about a type whose rich results are still supported", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Organization","name":"Saglitz"}
  </script></head>`);
    expect(ids(code, "index.html")).not.toContain("jsonld-deprecated-type");
  });

  it("finds a retired type inside an @graph too", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">
  {"@context":"https://schema.org","@graph":[{"@type":"WebSite","url":"https://saglitz.com/"},{"@type":"HowTo","name":"x"}]}
  </script></head>`);
    expect(ids(code, "index.html")).toContain("jsonld-deprecated-type");
  });

  it("gives every finding a message, a fix and a doc", () => {
    const findings = seoRules(GOOD_HTML.replace(/<title>[^<]*<\/title>/, ""), "index.html");
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message).toBeTruthy();
      expect(f.fix).toBeTruthy();
      expect(f.doc).toBeTruthy();
      expect(f.line).toBeGreaterThan(0);
    }
  });
});

// The load-bearing half. Every case here is correct work, and a rule that
// fires on any of them makes the tool worse than nothing on that stack.
describe("negatives — correct pages stay silent", () => {
  it("says nothing about a correct Next.js App Router page exporting metadata", () => {
    const code = `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Website Redesign Pricing for UK Startups | Saglitz",
  description: "What a website redesign costs in 2026, broken down by scope, with real line-item numbers from twelve recent studio projects and a four-week timeline.",
  alternates: { canonical: "https://saglitz.com/pricing/" },
};

export default function PricingPage() {
  return (
    <main>
      <h1>Website redesign pricing</h1>
      <p>A redesign runs between eight and twenty thousand pounds.</p>
      <h2>What changes the price</h2>
      <img src="/studio.jpg" alt="The studio during a design review" />
    </main>
  );
}`;
    expect(seoRules(code, "app/pricing/page.tsx")).toEqual([]);
  });

  it("says nothing about the same page written with generateMetadata", () => {
    const code = `import type { Metadata } from "next";

export async function generateMetadata({ params }): Promise<Metadata> {
  const page = await getPage(params.slug);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: \`https://saglitz.com/\${params.slug}/\` },
  };
}

export default function Page() {
  return (
    <main>
      <h1>Website redesign pricing</h1>
      <h2>What changes the price</h2>
      <img src="/studio.jpg" alt="The studio during a design review" />
    </main>
  );
}`;
    expect(seoRules(code, "app/[slug]/page.tsx")).toEqual([]);
  });

  it("says nothing about a root layout that renders <html> and exports metadata", () => {
    const code = `export const metadata = {
  title: { default: "Saglitz Design", template: "%s | Saglitz Design" },
  description: "UK web design studio building conversion-focused websites for small businesses across the country.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}`;
    expect(seoRules(code, "app/layout.tsx")).toEqual([]);
  });

  it("says nothing about a component that has no metadata of its own", () => {
    const code = `export function PriceCard({ tier }) {
  return (
    <article className="card">
      <h2>{tier.name}</h2>
      <p>{tier.blurb}</p>
      <img src={tier.icon} alt="" />
    </article>
  );
}`;
    expect(seoRules(code, "components/PriceCard.tsx")).toEqual([]);
  });

  it("says nothing about an Astro page with frontmatter metadata", () => {
    const code = `---
const title = "Website Redesign Pricing for UK Startups | Saglitz";
const description = "What a website redesign costs in 2026, broken down by scope, with real numbers from twelve recent studio projects and a four-week delivery timeline.";
---
<html lang="en">
  <head>
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href="https://saglitz.com/pricing/" />
  </head>
  <body>
    <main>
      <h1>Website redesign pricing</h1>
      <h2>What changes the price</h2>
      <img src="/studio.jpg" alt="The studio during a design review" />
    </main>
  </body>
</html>`;
    expect(seoRules(code, "src/pages/pricing.astro")).toEqual([]);
  });

  it("says nothing about a SvelteKit page using <svelte:head>", () => {
    const code = `<script>
  export let data;
</script>

<svelte:head>
  <title>Website Redesign Pricing for UK Startups | Saglitz</title>
  <meta name="description" content="What a website redesign costs in 2026, broken down by scope, with real numbers from twelve recent studio projects and a four-week delivery timeline." />
  <link rel="canonical" href="https://saglitz.com/pricing/" />
</svelte:head>

<main>
  <h1>Website redesign pricing</h1>
  <h2>What changes the price</h2>
  <img src="/studio.jpg" alt="The studio during a design review" />
</main>`;
    expect(seoRules(code, "src/routes/pricing/+page.svelte")).toEqual([]);
  });

  it("says nothing about a next-seo shaped declaration", () => {
    const code = `import { NextSeo } from "next-seo";

export default function Page() {
  return (
    <>
      <NextSeo
        title="Website Redesign Pricing for UK Startups | Saglitz"
        description="What a website redesign costs in 2026, broken down by scope, with real numbers from twelve recent studio projects and a four-week delivery timeline."
        canonical="https://saglitz.com/pricing/"
      />
      <h1>Website redesign pricing</h1>
    </>
  );
}`;
    expect(seoRules(code, "pages/pricing.jsx")).toEqual([]);
  });

  it("accepts a 58-character title and a 155-character description", () => {
    const title = "Website Redesign Pricing for UK Startups | Saglitz Design";
    const description =
      "What a website redesign costs in 2026, broken down by scope, with line-item numbers from twelve recent studio projects and a four-week timeline";
    expect(title.length).toBe(57);
    expect(description.length).toBe(143);
    const code = GOOD_HTML
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`);
    const fired = ids(code, "index.html");
    expect(fired).not.toContain("title-length");
    expect(fired).not.toContain("meta-description-length");
  });

  it("accepts exactly the boundary lengths", () => {
    const code = GOOD_HTML
      .replace(/<title>[^<]*<\/title>/, `<title>${"t".repeat(60)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${"d".repeat(160)}">`);
    const fired = ids(code, "index.html");
    expect(fired).not.toContain("title-length");
    expect(fired).not.toContain("meta-description-length");
  });

  it("never calls a short framework title too short — a layout template can only add to it", () => {
    const code = `export const metadata = {
  title: "About",
  description: "The studio, the people who work in it, and the way we run a redesign from kickoff through to the handover call at the end.",
  alternates: { canonical: "https://saglitz.com/about/" },
};

export default function About() {
  return <main><h1>About the studio</h1></main>;
}`;
    expect(ids(code, "app/about/page.tsx")).not.toContain("title-length");
  });

  it("accepts one h1 with several h2s", () => {
    const code = GOOD_HTML.replace("</main>", "<h2>Timeline</h2><h2>What you get</h2></main>");
    const fired = ids(code, "index.html");
    expect(fired).not.toContain("multiple-h1");
    expect(fired).not.toContain("heading-order-skipped");
  });

  it("accepts an h3 that follows an h2 from an earlier section", () => {
    const code = `<!doctype html>
<html lang="en">
<head>
  <title>Configuring the design token pipeline end to end | Saglitz</title>
  <meta name="description" content="How the token pipeline is wired, from the Figma variables export through the build step to the CSS custom properties your components actually read at runtime.">
  <link rel="canonical" href="https://saglitz.com/docs/tokens/">
</head>
<body>
  <h1>Design tokens</h1>
  <h2>Installation</h2>
  <p>Install the package.</p>
  <h3>From npm</h3>
  <p>Run the install command.</p>
  <h2>Configuration</h2>
  <p>Point the config at your export.</p>
  <h3>Custom prefixes</h3>
  <p>Set a prefix in the config file.</p>
</body>
</html>`;
    expect(ids(code, "docs/tokens.html")).not.toContain("heading-order-skipped");
  });

  it("accepts a decorative image with an empty alt", () => {
    const code = GOOD_HTML.replace('alt="The studio during a design review"', 'alt=""');
    expect(ids(code, "index.html")).not.toContain("alt-missing");
  });

  // `ATTR_START` lets an attribute name begin after a quote, so a word inside
  // *another attribute's value* satisfied the test for a bare `alt` — a real
  // finding swallowed because the page happened to contain the word. A sibling
  // task hit the identical defect in perf.ts.
  it.each([
    ["a title that contains the word alt", `<img src="/a.jpg" title="alt text here">`],
    ["an aria-label that contains it", `<img src="/a.jpg" aria-label="alt view">`],
    ["nothing at all", `<img src="/a.jpg">`],
  ])("flags an image with no alt attribute when it has %s", (_name, img) => {
    expect(ids(GOOD_HTML.replace(/<img[^>]*>/, img), "index.html")).toContain("alt-missing");
  });

  it("does not read an attribute named inside another attribute's value", () => {
    // Without the fix this link's href reads as "/wrong" and the canonical is
    // reported relative.
    const code = GOOD_HTML.replace(
      '<link rel="canonical" href="https://saglitz.com/pricing/">',
      '<link rel="canonical" title="see href=/wrong" href="https://saglitz.com/pricing/">',
    );
    expect(seoRules(code, "index.html")).toEqual([]);
  });

  it("accepts an image whose alt arrives through a spread", () => {
    const code = `<article><img src="/a.jpg" {...imageProps} /></article>`;
    expect(ids(code, "components/Figure.jsx")).not.toContain("alt-missing");
  });

  it("accepts a JSON-LD block written as an @graph", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "ProfessionalService", "@id": "https://saglitz.com/#business", "name": "Saglitz" },
      { "@type": "WebSite", "url": "https://saglitz.com/", "publisher": { "@id": "https://saglitz.com/#business" } }
    ]
  }
  </script></head>`);
    const fired = ids(code, "index.html");
    expect(fired).not.toContain("jsonld-unparseable");
    expect(fired).not.toContain("jsonld-missing-required");
  });

  it("says nothing about JSON-LD that is assembled at runtime", () => {
    const code = `export default function Page({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data.schema) }}
    />
  );
}`;
    const fired = ids(code, "app/page.tsx");
    expect(fired).not.toContain("jsonld-unparseable");
    expect(fired).not.toContain("jsonld-missing-required");
  });

  // Found by running correct files through the rules rather than reading them:
  // an icon's accessible name was being read as the page's title, and a
  // framework's HTML template was being read as a finished document.
  it("does not read an icon's <title> as the page title", () => {
    const code = `export function CloseButton() {
  return (
    <button aria-label="Close">
      <svg viewBox="0 0 16 16"><title>Close</title><path d="M1 1 L15 15" /></svg>
    </button>
  );
}`;
    expect(seoRules(code, "components/CloseButton.tsx")).toEqual([]);
  });

  it("says nothing about a framework HTML template whose head is injected", () => {
    const code = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>`;
    expect(seoRules(code, "src/app.html")).toEqual([]);
  });

  it("reports a client-rendered shell as a shell, and claims nothing about the head its script writes", () => {
    const code = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Vite + React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    expect(ids(code, "index.html")).toEqual(["content-not-in-html"]);
  });

  // The client-shell guard was one keystroke wide: it required the mount to be
  // literally empty *and* its id to match, so five ordinary scaffolds missed by
  // a character and were then read as finished documents — three fabricated
  // warnings each about a head their own script writes. The absence guard is
  // now decoupled from the mount match: the finding needs a precise root to
  // point at, the guard only needs the fact that nothing here is authored.
  describe("the shapes a client-rendered shell actually ships in", () => {
    const shell = (body: string) => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>App</title></head>
  <body>${body}<script src="/bundle.js"></script></body>
</html>`;

    it.each([
      ["a spinner inside the root", shell(`<div id="root"><div class="spinner"></div></div>`)],
      ["a Loading string inside the root", shell(`<div id="root">Loading…</div>`)],
      ["a noscript notice inside the root", shell(`<div id="root"><noscript>You need JavaScript.</noscript></div>`)],
      ["an ember-app mount", shell(`<div id="ember-app"></div>`)],
    ])("reports %s as exactly one shell finding", (_name, code) => {
      expect(ids(code, "index.html")).toEqual(["content-not-in-html"]);
    });

    // Angular's own src/index.html carries no script tag at all — the CLI
    // injects the bundle — so requiring one went blind on the framework's
    // default. The element exists only as a mount, which is evidence enough.
    it("reports Angular's script-less index.html as exactly one shell finding", () => {
      const code = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>App</title><base href="/"></head>
  <body><app-root></app-root></body>
</html>`;
      expect(ids(code, "src/index.html")).toEqual(["content-not-in-html"]);
    });
  });

  // Widening the shell guard to "any <script src>" silenced the title,
  // description and canonical rules on every thin page carrying an analytics,
  // chat or ads tag — a much larger class than the shells it was widened for.
  // A third-party tag is served by someone else and is no evidence about how
  // this page renders.
  describe("a thin page is not a shell just because it loads a script", () => {
    const thin = (script: string) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body>
  <p>Under construction.</p>
  ${script}
</body>
</html>`;

    it.each([
      ["a cross-origin analytics tag", `<script src="https://cdn.example.com/analytics.js"></script>`],
      ["a tag manager", `<script src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>`],
      ["a same-origin analytics file", `<script src="/js/analytics.js"></script>`],
      ["no script at all", ``],
      // A build *filename* proves nothing on its own: `/js/main.js` is what a
      // hand-written site calls its one script. Excluding `js/` from the build
      // directories did not help while the filename check ignored the
      // directory — the same bug one level down.
      ["a hand-written /js/main.js", `<script src="/js/main.js"></script>`],
      ["a hand-written /js/index.js", `<script src="/js/index.js"></script>`],
      ["a hand-written /js/app.js", `<script src="/js/app.js"></script>`],
      ["a hand-written /js/app.bundle.js", `<script src="/js/app.bundle.js"></script>`],
      // `type="module"` is an ES module, not evidence of a bundled app.
      ["a hand-authored ES module", `<script type="module" src="/toggle-menu.js"></script>`],
    ])("still grades a page carrying %s", (_name, script) => {
      expect(ids(thin(script))).toEqual(["canonical-missing", "meta-description-missing", "title-missing"]);
    });

    it.each([
      ["a Vite build output", `<script src="/assets/index-4f2c.js"></script>`],
      ["a CRA hashed bundle", `<script src="/static/js/main.a1b2c3d4.js"></script>`],
      ["a minified build file", `<script src="/js/app.min.js"></script>`],
      ["a Next.js chunk", `<script src="/_next/static/chunks/main-app.js"></script>`],
    ])("still reads %s as the page's own bundle", (_name, script) => {
      expect(seoRules(thin(script), "index.html")).toEqual([]);
    });
  });

  // `attrValue` suppressed `${…}` and `{…}` but not the server-template forms,
  // so an ERB layout was told to "Write the full URL:
  // https://example.com/<%= canonical_url %>".
  describe("server templates, whose values are not in the file", () => {
    const page = (title: string, description: string, canonical: string) => `<!doctype html>
<html lang="en">
<head>
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
</head>
<body><h1>Pricing</h1><p>Prose long enough that this page is never read as a shell of any kind, several sentences deep.</p></body>
</html>`;

    it("says nothing about an ERB layout", () => {
      expect(seoRules(page("<%= yield :title %>", "<%= yield :description %>", "<%= canonical_url %>"),
        "app/views/layouts/application.html.erb")).toEqual([]);
    });

    it("says nothing about a PHP layout", () => {
      expect(seoRules(page("<?= $title ?>", "<?php echo $desc; ?>", "<?= $canonical ?>"), "layout.html")).toEqual([]);
    });

    it("says nothing about an HtmlWebpackPlugin index", () => {
      const code = `<!doctype html><html><head><meta charset="utf-8"><title><%= htmlWebpackPlugin.options.title %></title></head><body><div id="app"></div></body></html>`;
      expect(seoRules(code, "public/index.html")).toEqual([]);
    });
  });

  // An email correctly has no title, description or canonical — there is no URL
  // and no crawler. But a layout table is a habit, not a fact: the first
  // version of this exemption asked only for a table, no stylesheet link and
  // no nav, and a single-page lander built that way — a deliberate CRO pattern
  // — lost two real findings. The table now has to be joined by something a
  // web page does not have.
  describe("emails, and the landing pages that look like them", () => {
    const emailBody = `
  <table role="presentation" cellpadding="0" cellspacing="0" width="600">
    <tr><td><h1>Your order</h1><p>Thanks — it ships tomorrow morning.</p></td></tr>
  </table>`;

    it("says nothing about an email under emails/", () => {
      const code = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>.wrap{max-width:600px}</style></head>
<body>${emailBody}</body>
</html>`;
      expect(seoRules(code, "emails/order-confirmation.html")).toEqual([]);
    });

    // A pixel-width table with no viewport meta was a third exemption signal
    // and has been removed: a genuine landing page with a `width="640"` layout
    // table and no viewport tag was exempted by it, losing two real findings.
    // The cost is disclosed and accepted — an email outside a mail path and
    // without Outlook markup is now graded as a page, which is the cheaper of
    // the two errors.
    it("still grades a fixed-width table page that gives no other email signal", () => {
      const code = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Website redesign pricing for UK startups | Saglitz</title><style>.w{margin:0 auto}</style></head>
<body>
  <table role="presentation" width="640"><tr><td>
    <h1>Redesign pricing</h1>
    <p>Twelve recent projects, with the line items and the four-week delivery timeline that produced them.</p>
  </td></tr></table>
</body>
</html>`;
      expect(ids(code, "templates/pricing.html")).toEqual(["canonical-missing", "meta-description-missing"]);
      // The same file under a mail path is still an email.
      expect(seoRules(code, "emails/pricing.html")).toEqual([]);
    });

    // scan.ts masks `/* */` only in JS-like files, so in a plain `.html` a dead
    // declaration inside a `<style>` comment, or a `<pre><code>` sample about
    // Outlook, both reached the check as if they were live email markup. The
    // narrowing happens here: `maskComments` is shared by three modules and is
    // not this one's to change.
    it("does not read a commented-out mso declaration as email markup", () => {
      const code = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Redesign pricing for UK startups | Saglitz</title>
<style>/* mso-line-height-rule: exactly; legacy, removed */ .w{margin:0 auto}</style></head>
<body><table role="presentation" width="100%"><tr><td><h1>Pricing</h1><p>Real prose on a real page.</p></td></tr></table></body>
</html>`;
      expect(ids(code, "landing.html")).toEqual(["canonical-missing", "meta-description-missing"]);
    });

    it("does not read a code sample about Outlook as email markup", () => {
      const code = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Email CSS support across Outlook clients | Saglitz</title></head>
<body><table role="presentation"><tr><td>
  <h1>Outlook CSS</h1>
  <pre><code>mso-line-height-rule: exactly;</code></pre>
</td></tr></table></body>
</html>`;
      expect(ids(code, "docs/email-css.html")).toEqual(["canonical-missing", "meta-description-missing"]);
    });

    it("says nothing about markup that exists only because Outlook does", () => {
      const code = `<!doctype html>
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>.x{mso-line-height-rule:exactly}</style></head>
<body><table role="presentation" width="100%"><tr><td><h1>Hi</h1><p>Body copy.</p></td></tr></table></body>
</html>`;
      expect(seoRules(code, "views/welcome.html")).toEqual([]);
    });

    it("still grades a landing page that uses a table for layout", () => {
      const code = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Get the 2026 redesign pricing guide from Saglitz</title>
  <style>.wrap{max-width:640px;margin:0 auto}</style>
</head>
<body>
  <table role="presentation" width="100%"><tr><td>
    <h1>Redesign pricing, itemised</h1>
    <p>Twelve recent studio projects, with the line items and the four-week delivery timeline that produced them.</p>
    <a href="/guide.pdf">Download the guide</a>
  </td></tr></table>
</body>
</html>`;
      expect(ids(code, "landing.html")).toEqual(["canonical-missing", "meta-description-missing"]);
    });
  });

  it("does not count an h1 inside an inert <template>", () => {
    const code = GOOD_HTML.replace("</main>", `<template id="row"><h1>Row title</h1></template></main>`);
    expect(ids(code, "index.html")).not.toContain("multiple-h1");
  });

  it("does not read a nested array as a node missing everything", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">[[{"@type":"Thing"}]]</script></head>`);
    expect(ids(code, "index.html")).not.toContain("jsonld-missing-required");
  });

  it("says it in the singular when one key is missing", () => {
    const code = GOOD_HTML.replace("</head>", `<script type="application/ld+json">{"@type":"Organization","name":"Saglitz"}</script></head>`);
    const f = seoRules(code, "index.html").find((x) => x.rule === "jsonld-missing-required");
    expect(f!.message).toContain("missing @context");
    expect(f!.message).toContain("Without it");
  });

  it("accepts a page with real content beside a small portal mount point", () => {
    const code = GOOD_HTML
      .replace("</body>", `<div id="portal"></div>\n<script src="/assets/index-4f2c.js"></script></body>`);
    expect(ids(code, "index.html")).not.toContain("content-not-in-html");
  });

  it("accepts an hreflang set that names this page", () => {
    const code = GOOD_HTML.replace("</head>", `<link rel="alternate" hreflang="en-gb" href="https://saglitz.com/pricing/">
  <link rel="alternate" hreflang="de" href="https://saglitz.com/de/preise/">
  <link rel="alternate" hreflang="x-default" href="https://saglitz.com/pricing/">
  </head>`);
    expect(ids(code, "index.html")).not.toContain("hreflang-not-reciprocal");
  });

  it("says nothing at all about a correct static page", () => {
    expect(seoRules(GOOD_HTML, "index.html")).toEqual([]);
  });

  it("does not read a commented-out canonical as a real one", () => {
    const code = GOOD_HTML.replace(/<link rel="canonical"[^>]*>/, `<!-- <link rel="canonical" href="https://saglitz.com/pricing/"> -->`);
    expect(ids(code, "index.html")).toContain("canonical-missing");
  });

  it("treats a two-branch conditional h1 as one h1", () => {
    const code = `export const metadata = { title: "Search results for everything in the catalogue", description: "Every product in the catalogue, filtered by the query you typed into the search box at the top of this page." };

export default function Page({ query }) {
  return (
    <main>
      {query ? <h1>Results for {query}</h1> : <h1>Search</h1>}
      <h2>Filters</h2>
    </main>
  );
}`;
    expect(ids(code, "app/search/page.tsx")).not.toContain("multiple-h1");
  });

  // The same page in three other languages. Each of these fired before the
  // conditional check learned to read that language's syntax.
  it("treats a Svelte {#if}/{:else} pair as one h1", () => {
    const code = `{#if query}
  <h1>Results for {query}</h1>
{:else}
  <h1>Search</h1>
{/if}`;
    expect(ids(code, "src/routes/search/+page.svelte")).not.toContain("multiple-h1");
  });

  it("treats a Vue v-if / v-else pair as one h1", () => {
    const code = `<template>
  <main>
    <h1 v-if="query">Results</h1>
    <h1 v-else>Search</h1>
  </main>
</template>`;
    expect(ids(code, "pages/search.vue")).not.toContain("multiple-h1");
  });

  it("still flags two unconditional h1s on a plain page", () => {
    const code = `<!doctype html><html><head>
<title>Website Redesign Pricing for UK Startups | Saglitz</title>
<meta name="description" content="What a website redesign costs in 2026, broken down by scope, with real line-item numbers from twelve recent studio projects and a timeline.">
<link rel="canonical" href="https://saglitz.com/x/"></head>
<body><h1>One</h1><p>Body copy long enough to read as a real page with actual prose on it, several sentences deep.</p><h1>Two</h1></body></html>`;
    expect(ids(code, "x.html")).toContain("multiple-h1");
  });
});

describe("robots.txt and the site-level files", () => {
  const robots = (source: string) => configIds([{ path: "public/robots.txt", source }]);

  it("flags Disallow: / under User-agent: *, at error severity", () => {
    const f = seoConfigRules([{ path: "public/robots.txt", source: "User-agent: *\nDisallow: /\n" }])
      .find((x) => x.rule === "robots-blocks-everything");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("error");
  });

  it("accepts a robots.txt that disallows /admin/ only", () => {
    const fired = robots("User-agent: *\nDisallow: /admin/\nSitemap: https://saglitz.com/sitemap.xml\n");
    expect(fired).not.toContain("robots-blocks-everything");
    expect(fired).not.toContain("robots-blocks-ai-crawlers");
  });

  it("does not read a commented-out Disallow as a real one", () => {
    const fired = robots("User-agent: *\n# Disallow: /\nDisallow: /admin/\nSitemap: https://saglitz.com/sitemap.xml\n");
    expect(fired).not.toContain("robots-blocks-everything");
  });

  it("reports a blocked AI crawler as a note, and does not argue the decision either way", () => {
    const f = seoConfigRules([{
      path: "robots.txt",
      source: "User-agent: *\nDisallow: /admin/\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://saglitz.com/sitemap.xml\n",
    }]).find((x) => x.rule === "robots-blocks-ai-crawlers");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
    expect(f!.message).toMatch(/GPTBot/);
    // The finding states the choice and points at the trade-off. It must not
    // tell the reader which way to decide — blocking is a legitimate business
    // decision, and a rule that argues policy has left the ground this module
    // stands on.
    const text = `${f!.message} ${f!.fix}`;
    expect(text).not.toMatch(/\b(unblock|should allow|allow them|remove the block|stop blocking|recommend)\b/i);
  });

  it("flags a robots.txt with no Sitemap reference", () => {
    expect(robots("User-agent: *\nDisallow: /admin/\n")).toContain("sitemap-not-referenced");
  });

  it("accepts a robots.txt that references its sitemap", () => {
    expect(robots("User-agent: *\nAllow: /\nSitemap: https://saglitz.com/sitemap.xml\n"))
      .not.toContain("sitemap-not-referenced");
  });

  it("notes an absent llms.txt when the site root was read", () => {
    const f = seoConfigRules([{ path: "public/robots.txt", source: "User-agent: *\nDisallow: /admin/\nSitemap: https://saglitz.com/sitemap.xml\n" }])
      .find((x) => x.rule === "llms-txt-absent");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  it("says nothing about llms.txt when one is there", () => {
    expect(configIds([
      { path: "public/robots.txt", source: "User-agent: *\nDisallow: /admin/\nSitemap: https://saglitz.com/sitemap.xml\n" },
      { path: "public/llms.txt", source: "# Saglitz Design\n\n> UK web design studio.\n" },
    ])).not.toContain("llms-txt-absent");
  });

  it("does not claim /llms.txt is absent when it was never given the site root", () => {
    expect(configIds([{ path: "app/page.tsx", source: `export const metadata = { title: "x" };` }]))
      .not.toContain("llms-txt-absent");
  });

  it("demotes an absence claim when the scan was cut short", () => {
    const f = seoConfigRules(
      [{ path: "public/robots.txt", source: "User-agent: *\nDisallow: /admin/\nSitemap: https://saglitz.com/sitemap.xml\n" }],
      { truncated: true },
    ).find((x) => x.rule === "llms-txt-absent");
    expect(f).toBeDefined();
    expect(f!.message).toMatch(/unconfirmed|stopped/i);
  });
});

// A framework page cannot prove its own metadata absent — the layout may set
// it. A whole project can: if no file anywhere declares a description, the
// absence is a fact about what was read rather than a guess about one file.
describe("project-level metadata, where absence is provable", () => {
  const astroPage = (head: string) => `---
const title = "Website Redesign Pricing for UK Startups | Saglitz";
---
<html lang="en">
  <head>${head}</head>
  <body><main><h1>Website redesign pricing</h1></main></body>
</html>`;

  it("flags a description no file in the project declares", () => {
    const files = [{ path: "src/pages/pricing.astro", source: astroPage(`<title>{title}</title><link rel="canonical" href="https://saglitz.com/pricing/" />`) }];
    expect(configIds(files)).toContain("meta-description-missing");
  });

  it("says nothing when a layout declares what the page does not", () => {
    const files = [
      { path: "src/pages/pricing.astro", source: astroPage(`<title>{title}</title><link rel="canonical" href="https://saglitz.com/pricing/" />`) },
      {
        path: "src/layouts/Base.astro",
        source: `---\nconst { description } = Astro.props;\n---\n<head><meta name="description" content={description} /></head>`,
      },
    ];
    expect(configIds(files)).not.toContain("meta-description-missing");
  });

  // Both of these were live defects, found by running correct pages from five
  // stacks through the rules rather than by reading them. Each produced three
  // fabricated warnings — no title, no description, no canonical — on a
  // project that declares all three, because the shape it declares them in was
  // not one this module read.
  it("reads a Remix route's meta export, rather than calling the project bare", () => {
    const files = [
      {
        path: "app/root.tsx",
        source: `export default function App() {
  return (
    <html lang="en">
      <head><meta charSet="utf-8" /><Meta /><Links /></head>
      <body><Outlet /><Scripts /></body>
    </html>
  );
}`,
      },
      {
        path: "app/routes/pricing.tsx",
        source: `import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Website Redesign Pricing for UK Startups | Saglitz" },
  { name: "description", content: "What a website redesign costs in 2026, broken down by scope, with real numbers from twelve recent studio projects." },
  { tagName: "link", rel: "canonical", href: "https://saglitz.com/pricing/" },
];

export default function Pricing() {
  return <main><h1>Website redesign pricing</h1></main>;
}`,
      },
    ];
    expect(configIds(files)).toEqual([]);
  });

  it("reads a Nuxt useHead call, including its meta and link arrays", () => {
    const files = [{
      path: "pages/pricing.vue",
      source: `<script setup lang="ts">
useHead({
  title: "Website Redesign Pricing for UK Startups | Saglitz",
  link: [{ rel: "canonical", href: "https://saglitz.com/pricing/" }],
  meta: [{ name: "description", content: "What a website redesign costs in 2026, broken down by scope, with real numbers from twelve recent studio projects." }],
});
</script>

<template>
  <main><h1>Website redesign pricing</h1></main>
</template>`,
    }];
    expect(configIds(files)).toEqual([]);
  });

  // The string beside `name:` is the tag's name, not its content. Reading it
  // as the description's value would report an eleven-character description.
  it("never reads a named-tag entry as the value it declares", () => {
    const files = [{
      path: "pages/pricing.vue",
      source: `<script setup>
useHead({ title: "Website Redesign Pricing for UK Startups | Saglitz", meta: [{ name: "description", content: someRef }] });
</script>
<template><main><h1>Pricing</h1></main></template>`,
    }];
    expect(configIds(files)).not.toContain("meta-description-length");
    expect(seoRules(files[0].source, files[0].path).map((f) => f.rule)).not.toContain("meta-description-length");
  });

  // The frameworks declare the *site's* metadata in a config file beside the
  // pages. Not reading them called a correct Nuxt project descriptionless and
  // canonical-less, and a correct Gatsby project canonical-less — with the
  // declaration one file away and never opened.
  it("reads a Nuxt project's app.head out of nuxt.config.ts", () => {
    expect(configIds([
      { path: "pages/index.vue", source: `<template><main><h1>Studio</h1></main></template>` },
      {
        path: "nuxt.config.ts",
        source: `export default defineNuxtConfig({
  app: {
    head: {
      title: "Saglitz Design",
      meta: [{ name: "description", content: "UK web design studio." }],
      link: [{ rel: "canonical", href: "https://saglitz.com/" }],
    },
  },
});`,
      },
    ])).toEqual([]);
  });

  it("reads a Gatsby project's siteMetadata out of gatsby-config.js", () => {
    expect(configIds([
      { path: "src/pages/index.jsx", source: `export default function Home() { return <main><h1>Studio</h1></main>; }` },
      {
        path: "gatsby-config.js",
        source: `module.exports = { siteMetadata: { title: "Saglitz Design", description: "UK web design studio.", siteUrl: "https://saglitz.com" } };`,
      },
    ])).toEqual([]);
  });

  it("reads Astro's site and Docusaurus's url as the canonical they generate", () => {
    expect(configIds([
      {
        path: "src/pages/index.astro",
        source: `---\nconst title = "Saglitz Design studio homepage";\n---\n<html><head><title>{title}</title><meta name="description" content="UK studio building conversion-focused sites." /></head><body><h1>Hi</h1></body></html>`,
      },
      { path: "astro.config.mjs", source: `export default defineConfig({ site: "https://saglitz.com" });` },
    ])).toEqual([]);

    expect(configIds([
      { path: "src/pages/index.jsx", source: `export default function Home() { return <main><h1>Docs</h1></main>; }` },
      {
        path: "docusaurus.config.js",
        source: `module.exports = { title: "Saglitz Docs", tagline: "How the design system works", url: "https://docs.saglitz.com" };`,
      },
    ])).toEqual([]);
  });

  // One file's readable surface used to license claims about all three keys
  // across every file — including a file whose shape this module admits it
  // cannot read. The surface doctrine was right and was being applied per
  // project instead of per key.
  it("does not let one page's title license claims about a page it cannot read", () => {
    expect(configIds([
      {
        path: "src/pages/index.astro",
        source: `---\nconst title = "Saglitz Design studio homepage";\n---\n<html><head><title>{title}</title></head><body><h1>Hi</h1></body></html>`,
      },
      {
        path: "app/page.tsx",
        source: `import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata({ title: "Home" });

export default function Page() { return <main><h1>Home</h1></main>; }`,
      },
    ])).toEqual([]);
  });

  it("treats a spread inside a metadata export as the merge it is", () => {
    expect(configIds([{
      path: "app/page.tsx",
      source: `import { base } from "@/lib/seo";

export const metadata = { ...base, title: "Home page for the studio" };

export default function Page() { return <main><h1>Home</h1></main>; }`,
    }])).toEqual([]);
  });

  it("still claims absence when nothing hides the key", () => {
    expect(configIds([{
      path: "app/page.tsx",
      source: `export const metadata = { title: "Home page for the studio and its work" };

export default function Page() { return <main><h1>Home</h1></main>; }`,
    }])).toEqual(["canonical-missing", "meta-description-missing"]);
  });

  it("claims nothing about a project whose metadata shape it does not recognise", () => {
    const files = [{
      path: "src/App.vue",
      source: `<template>
  <div id="app"><h1>Studio</h1></div>
</template>`,
    }];
    expect(configIds(files)).toEqual([]);
  });

  it("says nothing about a project with no page-metadata surface at all", () => {
    expect(configIds([{ path: "src/lib/format.ts", source: `export const fmt = (n: number) => n.toFixed(2);` }])).toEqual([]);
  });
});

describe("the exported file lists", () => {
  it("covers the markup extensions the page rules read", () => {
    for (const ext of [".html", ".jsx", ".tsx", ".astro", ".svelte", ".vue"]) {
      expect(SEO_EXTENSIONS).toContain(ext);
    }
  });

  it("names the site-level files that are read by name, not by extension", () => {
    for (const name of ["robots.txt", "llms.txt", "sitemap.xml"]) {
      expect(SEO_FILENAMES).toContain(name);
    }
  });
});

// Carried over from the generic-design package, where a rule cited a real
// document that never made its claim. Resolution alone is not enough: the
// cited document has to actually discuss the thing the reader was just told.
describe("every doc a rule cites resolves and makes the rule's claim", () => {
  const docs = loadKnowledge(join(__dirname, "..", "knowledge"));

  // No single page can fire every rule — a page cannot both lack a title and
  // have one that is too long — so the citation check runs over a set whose
  // union is the whole table.
  const SHELL_PAGE = `<!doctype html>
<html lang="en">
<head>
  <link rel="canonical" href="http://localhost:3000/pricing/">
  <link rel="alternate" hreflang="de" href="https://saglitz.com/de/preise/">
  <script type="application/ld+json">{"@context":"https://schema.org","name":"Saglitz",}</script>
</head>
<body>
  <div id="root"></div>
  <h1>One</h1>
  <h1>Two</h1>
  <h3>Skipped</h3>
  <img src="/a.jpg">
  <script src="/bundle.js"></script>
</body>
</html>`;

  const OVERLONG_PAGE = `<!doctype html>
<html lang="en">
<head>
  <title>${"t".repeat(90)}</title>
  <meta name="description" content="${"d".repeat(220)}">
  <link rel="canonical" href="/pricing/">
  <script type="application/ld+json">{"@type":"HowTo","name":"Redesign a site"}</script>
</head>
<body><h1>Pricing</h1></body>
</html>`;

  const BARE_HEAD_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
</head>
<body>
  <main>
    <h1>Pricing</h1>
    <p>A redesign for a small business site runs between eight and twenty thousand pounds, depending on how many templates you need and whether the copy is written from scratch by us or supplied.</p>
  </main>
</body>
</html>`;

  const CONFIG_FILES = [
    { path: "public/robots.txt", source: "User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nDisallow: /\n" },
  ];

  const findings = [
    ...seoRules(SHELL_PAGE, "index.html"),
    ...seoRules(OVERLONG_PAGE, "pricing.html"),
    ...seoRules(BARE_HEAD_PAGE, "about.html"),
    ...seoConfigRules(CONFIG_FILES),
  ];

  it("loads the knowledge base, so the checks below are not vacuous", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  // Each rule names the word its cited document must actually use. Re-point a
  // rule at a document that does not make its claim and this fails.
  // Each phrase is the sentence in the cited document that carries the rule's
  // claim, not a word that document merely happens to contain. A loose pattern
  // here defeats the whole check: `/h1/i` matches most of this knowledge base,
  // so `multiple-h1` could have been re-pointed at any document at all and
  // this test would still have passed.
  const CLAIM_VOCABULARY: Record<string, RegExp> = {
    "title-missing": /One unique `<title>` per page/i,
    "title-length": /\*\*50–60 characters\*\*/i,
    "meta-description-missing": /Every indexable page gets a unique one/i,
    "meta-description-length": /\*\*150–160 characters\.\*\*/i,
    "multiple-h1": /Multiple H1s won't tank you/i,
    "heading-order-skipped": /heading levels never skip/i,
    "canonical-missing": /a \*\*self-referencing\*\* canonical/i,
    "canonical-not-absolute": /Absolute URLs only/i,
    "canonical-points-elsewhere": /matching final protocol\/host/i,
    "hreflang-not-reciprocal": /Reciprocity \(return tags\)/i,
    "jsonld-unparseable": /Validate with Google's Rich Results Test/i,
    "jsonld-missing-required": /"@context": "https:\/\/schema\.org"/i,
    "jsonld-deprecated-type": /do NOT promise clients rich results from these/i,
    "alt-missing": /decorative → `alt=""`/i,
    "robots-blocks-everything": /blocks only genuinely private paths/i,
    "robots-blocks-ai-crawlers": /AI bots allowed in robots\.txt/i,
    "llms-txt-absent": /Serve `\/llms\.txt` at the site root/i,
    "sitemap-not-referenced": /Reference it in robots\.txt/i,
    "content-not-in-html": /AI crawlers \*\*read initial HTML only\*\*/i,
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

  // `audit_seo_geo`'s description once advertised canonical *self-reference*
  // (no such rule) and hreflang *reciprocity* (the rule reads self-reference —
  // reciprocity is a claim about two pages and only one is ever in the file).
  // A caller reads a tool description as a statement of reach, so an advertised
  // check that never runs turns silence into a clean bill. The description is
  // now built from SEO_CAPABILITIES; these two assertions are what keep that
  // table honest, in both directions.
  it("advertises nothing that is not a rule", () => {
    const claimed = SEO_CAPABILITIES.flatMap((c) => c.rules);
    expect(claimed.filter((r) => !(r in CLAIM_VOCABULARY))).toEqual([]);
  });

  it("leaves no rule unadvertised", () => {
    const claimed = new Set(SEO_CAPABILITIES.flatMap((c) => c.rules));
    expect(Object.keys(CLAIM_VOCABULARY).filter((r) => !claimed.has(r))).toEqual([]);
  });

  it.each(Object.entries(CLAIM_VOCABULARY))(
    "%s cites a document that actually makes the claim", (rule, vocabulary) => {
      const cited = findings.find((f) => f.rule === rule)?.doc;
      expect(cited, `${rule} emitted no doc id`).toBeTruthy();
      const doc = findDoc(docs, cited!);
      expect(doc, `${rule} → ${cited} does not resolve`).toBeTruthy();
      expect(vocabulary.test(doc!.body), `${cited} never mentions ${vocabulary}`).toBe(true);
    });

  // These tools read what is authored. A Core Web Vitals verdict or a ranking
  // outcome is a field measurement and a search engine's behaviour, neither of
  // which is in this file — claiming one from source is this package's
  // forbidden claim.
  it("never claims a measurement or a ranking outcome", () => {
    const forbidden = /\b(your LCP|your INP|your CLS|Core Web Vitals (?:score|verdict)|will rank|rank higher|improve your rankings|boost your ranking|guarantee)\b/i;
    for (const f of findings) {
      expect(forbidden.test(`${f.message} ${f.fix}`), `${f.rule}: ${f.message} ${f.fix}`).toBe(false);
    }
  });
});

// ── the report and its structured half ───────────────────────────────────────
//
// `seoReport` is the surface `audit_seo_geo` returns. The rules above are
// tested for what they claim; these test what the *report* claims, which is a
// separate liability: a summary that disagrees with its own findings, or a
// "Not visible" section that quietly drops a limitation the rules disclosed,
// is exactly the silent wrongness this package exists to avoid.

describe("seoReport — the prose and the structure agree", () => {
  const BAD_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body>
  <main>
    <h1>One</h1>
    <h1>Two</h1>
    <img src="/a.png">
  </main>
</body>
</html>`;

  it("returns markdown and a structured payload from one call", () => {
    const { text, structured } = seoReport({ source: BAD_PAGE, filename: "index.html" });
    expect(text).toContain("# SEO & GEO audit");
    expect(text.length).toBeGreaterThan(40);
    expect(structured.findings.length).toBeGreaterThan(0);
  });

  it("counts a summary that agrees with its own findings", () => {
    const { structured } = seoReport({ source: BAD_PAGE, filename: "index.html" });
    const count = (s: string) => structured.findings.filter((f) => f.severity === s).length;
    expect(structured.summary).toEqual({
      error: count("error"), warning: count("warning"), info: count("info"),
    });
    expect(structured.summary.error + structured.summary.warning + structured.summary.info)
      .toBe(structured.findings.length);
  });

  it("prints the same counts in the prose as it returns in the summary", () => {
    const { text, structured } = seoReport({ source: BAD_PAGE, filename: "index.html" });
    const { error, warning, info } = structured.summary;
    expect(text).toContain(`**${error} error · ${warning} warning · ${info} info**`);
  });

  it("gives every structured finding the fields an agent needs to act", () => {
    const { structured } = seoReport({ source: BAD_PAGE, filename: "index.html" });
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
    const dir = mkdtempSync(join(tmpdir(), "saglitz-seo-report-"));
    writeFileSync(join(dir, "index.html"), BAD_PAGE);
    const { text, structured } = seoReport({ root: dir });
    expect(text).toContain("index.html");
    const withFile = structured.findings.filter((f) => f.file === "index.html");
    expect(withFile.length).toBeGreaterThan(0);
    // The path is a field, not only a prefix inside the sentence.
    for (const f of withFile) expect(f.message.startsWith("index.html:")).toBe(false);
  });

  /**
   * The path travels as data, so a path that cannot survive a round trip
   * through prose still arrives. An earlier version prefixed the message with
   * `path: ` and split it back out on the first `": "`; a file named
   * `chapter 2: the fall.html` — legal on macOS and Linux — broke the split,
   * and `file` went silently missing from every finding in that file.
   */
  it("carries a path that contains a colon", () => {
    const dir = mkdtempSync(join(tmpdir(), "saglitz-seo-colon-"));
    writeFileSync(join(dir, "chapter 2: the fall.html"), BAD_PAGE);
    const { text, structured } = seoReport({ root: dir });
    expect(structured.findings.length).toBeGreaterThan(0);
    for (const f of structured.findings) expect(f.file, f.rule).toBe("chapter 2: the fall.html");
    expect(text).toContain("chapter 2: the fall.html:");
  });

  it("returns the notVisible list it printed, entry for entry", () => {
    const { text, structured } = seoReport({ source: BAD_PAGE, filename: "index.html" });
    expect(structured.notVisible).toEqual(SEO_NOT_VISIBLE);
    expect(structured.notVisible.length).toBeGreaterThan(5);
    for (const entry of structured.notVisible) expect(text).toContain(entry);
  });
});

describe("seoReport — what it discloses it cannot see", () => {
  const notVisible = SEO_NOT_VISIBLE.join("\n");

  it("says plainly that nothing here is measured", () => {
    expect(notVisible).toMatch(/Nothing here is measured/i);
    expect(notVisible).toMatch(/75th-percentile field data/i);
  });

  it("discloses metadata injected at build or request time", () => {
    expect(notVisible).toMatch(/build or request time/i);
  });

  it("discloses everything that needs the whole site graph", () => {
    expect(notVisible).toMatch(/broken links/i);
    expect(notVisible).toMatch(/orphan/i);
    expect(notVisible).toMatch(/redirect chains/i);
  });

  it("names the metadata shapes it recognises, and says an unrecognised one is silent", () => {
    for (const shape of [
      "generateMetadata", "useHead", "useSeoMeta", "svelte:head", "Astro frontmatter",
      "NextSeo", "Helmet", "links",
    ]) {
      expect(notVisible, shape).toContain(shape);
    }
    // The claim this entry makes about an unrecognised shape has to be the
    // true one, and the true one has two halves: silence in a single file,
    // and — because `title-missing`, `meta-description-missing` and
    // `canonical-missing` are also claimed at project scope — a possible
    // finding across a directory, against metadata that is really there in a
    // shape this audit cannot read. An earlier draft of this entry said only
    // "silence, not a finding", which understated it in the damaging
    // direction: a disclosure that hides a false positive is worse than none.
    expect(notVisible).toMatch(/costs silence/i);
    expect(notVisible).toMatch(/can cost a finding/i);
    expect(notVisible).toContain("meta-description-missing");
  });

  // The project-scope half of that entry, driven rather than asserted: a
  // directory whose description and canonical are declared in a shape this
  // module does not read draws both absence warnings anyway.
  it("does draw a project-scope absence finding against an unrecognised shape", () => {
    const dir = mkdtempSync(join(tmpdir(), "saglitz-seo-shape-"));
    writeFileSync(join(dir, "page.tsx"),
      `export const metadata = { title: "A recognised title" };\nexport default function P() { return <main><h1>Home</h1><p>Words.</p></main>; }\n`);
    writeFileSync(join(dir, "other.tsx"),
      `export const seo = defineSeo({ description: "Declared in a shape this module does not read.", canonical: "https://example.com/" });\nexport default function O() { return <main><h1>Other</h1><p>Words.</p></main>; }\n`);
    const rules = seoReport({ root: dir }).structured.findings.map((f) => f.rule);
    expect(rules).toContain("meta-description-missing");
    expect(rules).toContain("canonical-missing");
  });

  it("discloses that a real email outside a mail path is graded as a page", () => {
    expect(notVisible).toMatch(/mso-/);
    expect(notVisible).toMatch(/graded as a (?:web )?page/i);
  });

  it("discloses the SPA shell whose mount id it does not recognise", () => {
    expect(notVisible).toMatch(/mount/i);
    expect(notVisible).toMatch(/type="module"/);
  });

  it("discloses that a component demo page draws findings that are true of the file", () => {
    expect(notVisible).toMatch(/demo/i);
    expect(notVisible).toMatch(/html-css\.html/);
  });

  /**
   * The named example, driven. A disclosure that names the wrong rules is the
   * inversion of the thing it exists to serve, and this entry named one rule
   * that never fires here (`alt-missing` — only one recipe ships an `<img>`
   * and it carries `alt`) while omitting a third of the findings by count
   * (`title-length`). So the entry is checked against the rules the example
   * actually produces rather than against a memory of them.
   */
  it("names exactly the rules its own worked example produces", () => {
    const { structured } = seoReport({ root: join(__dirname, "..", "recipes") });
    const fired = new Set(structured.findings.map((f) => f.rule));
    expect([...fired].sort()).toEqual(["canonical-missing", "meta-description-missing", "title-length"]);
    expect(notVisible).toMatch(/missing description, missing canonical and short-title/i);
    expect(notVisible).not.toMatch(/missing alt text/i);
  });

  it("hands the question of whether the content deserves to rank to the right tools", () => {
    expect(notVisible).toMatch(/audit_ux_copy/);
    expect(notVisible).toMatch(/on-page-seo/);
  });

  it("never claims a vitals verdict or a ranking outcome anywhere in the report", () => {
    const { text } = seoReport({ source: "<p>hello</p>", filename: "index.html" });
    const forbidden = new RegExp([
      "your (?:LCP|INP|CLS)",
      "(?:LCP|INP|CLS) (?:is|will be|would be) (?:good|bad|fine|poor)",
      "Core Web Vitals (?:score|verdict|pass|fail)",
      "will rank", "rank higher", "improve your rankings", "boost your ranking", "guarantee",
    ].join("|"), "i");
    expect(forbidden.test(text), text).toBe(false);
  });
});

describe("seoReport — a truncated scan cannot prove absence", () => {
  /** A project whose files are read in full: nothing is capped. */
  const smallProject = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "saglitz-seo-small-"));
    writeFileSync(join(dir, "robots.txt"), "User-agent: *\nDisallow: /admin\n");
    writeFileSync(join(dir, "index.html"), "<!doctype html>\n<html><body><main><h1>Hi</h1><p>Words.</p></main></body></html>");
    return dir;
  };

  /** The same project, plus enough bytes to trip `scanProject`'s total cap. */
  const cappedProject = (): string => {
    const dir = smallProject();
    const padding = `<p>${"lorem ipsum dolor sit amet ".repeat(15_000)}</p>`; // ~405 KB, under the per-file cap
    for (let i = 0; i < 9; i++) writeFileSync(join(dir, `page-${i}.html`), padding);
    return dir;
  };

  it("claims absence outright when the whole project was read", () => {
    const { structured } = seoReport({ root: smallProject() });
    const sitemap = structured.findings.find((f) => f.rule === "sitemap-not-referenced");
    expect(sitemap, "robots.txt without a Sitemap line should be reported").toBeTruthy();
    expect(sitemap!.message).not.toMatch(/unconfirmed/i);
  });

  // The wiring this task exists to get right: `seoConfigRules` accepts
  // `{ truncated }` and demotes every absence claim when it is set, and this
  // report is the only place `hitFileCap || hitByteCap` can be handed to it.
  // Without the pass-through the demotion never runs and a capped scan claims
  // an absence it did not read far enough to prove.
  it("demotes every absence claim to an unconfirmed note when the scan stopped at a cap", () => {
    const { text, structured } = seoReport({ root: cappedProject() });
    expect(text).toMatch(/results are partial/i);
    const sitemap = structured.findings.find((f) => f.rule === "sitemap-not-referenced");
    expect(sitemap, "the robots.txt finding should still be produced").toBeTruthy();
    expect(sitemap!.message).toMatch(/absence is unconfirmed/i);
    expect(sitemap!.severity).toBe("info");
    for (const f of structured.findings.filter((x) => /missing|absent|not-referenced/.test(x.rule))) {
      expect(f.severity, `${f.rule} should be demoted`).toBe("info");
    }
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// The per-stack fixture matrix.
//
// Five correctly-made pages, one per stack, defined once in
// `tests/helpers/stackFixtures.ts` and graded here by `audit_seo_geo` and in
// `perf.test.ts` by `audit_performance`. Both tools read the same five pages,
// because a page only one auditor ever sees proves nothing about the other.
//
// Every page here was written before this module's rules were read, so none of
// them is reverse-engineered into passing. All five came back clean on the
// first run; no rule was changed to make that true.
// ─────────────────────────────────────────────────────────────────────────────
describe("the per-stack fixture matrix — five correct pages", () => {
  it.each(CORRECT_STACK_PAGES)("says nothing about a correct $stack page", ({ path, code }) => {
    expect(seoRules(code, path)).toEqual([]);
  });

  // Silence is only worth asserting if the page gave the rules something to
  // look at. Each probe below is one minimal edit to one of the five pages;
  // it must produce the named finding. A probe that goes silent means the
  // fixture above passed for want of substrate rather than for being correct,
  // and the assertion it anchors is worthless.
  const SUBSTRATE: Array<[string, string, string, string]> = [
    ["title-missing", "static HTML", STATIC_HTML.replace(/<title>.*?<\/title>\n/, ""), "public/pricing/index.html"],
    ["title-length", "static HTML", STATIC_HTML.replace(/<title>.*?<\/title>/, `<title>${"t".repeat(95)}</title>`), "public/pricing/index.html"],
    ["meta-description-missing", "static HTML", STATIC_HTML.replace(/<meta name="description".*?>\n/, ""), "public/pricing/index.html"],
    ["meta-description-length", "static HTML", STATIC_HTML.replace(/(<meta name="description" content=")[^"]*/, `$1${"d".repeat(230)}`), "public/pricing/index.html"],
    ["canonical-missing", "static HTML", STATIC_HTML.replace(/<link rel="canonical".*?>\n/, ""), "public/pricing/index.html"],
    ["canonical-not-absolute", "static HTML", STATIC_HTML.replace('href="https://saglitz.com/pricing/">', 'href="/pricing/">'), "public/pricing/index.html"],
    ["canonical-points-elsewhere", "static HTML", STATIC_HTML.replace('rel="canonical" href="https://saglitz.com/pricing/"', 'rel="canonical" href="http://localhost:3000/pricing/"'), "public/pricing/index.html"],
    ["jsonld-unparseable", "static HTML", STATIC_HTML.replace('"datePublished": "2026-02-11"', '"datePublished": "2026-02-11",'), "public/pricing/index.html"],
    ["jsonld-missing-required", "static HTML", STATIC_HTML.replace('"@context": "https://schema.org",\n    ', ""), "public/pricing/index.html"],
    ["jsonld-deprecated-type", "static HTML", STATIC_HTML.replace('"@type": "Article"', '"@type": "HowTo"'), "public/pricing/index.html"],
    ["alt-missing", "static HTML", STATIC_HTML.replace(' alt="Two designers reviewing wireframes pinned to a studio wall"', ""), "public/pricing/index.html"],
    ["heading-order-skipped", "static HTML", STATIC_HTML.replace("<h2>What changes the price</h2>", "<h4>What changes the price</h4>"), "public/pricing/index.html"],
    ["multiple-h1", "Next.js", NEXT_APP_ROUTER.replace("<h2>What changes the price</h2>", "<h1>What changes the price</h1>"), "app/pricing/page.tsx"],
    ["multiple-h1", "SvelteKit", SVELTEKIT_PAGE.replace("<h2>What changes the price</h2>", "<h1>What changes the price</h1>"), "src/routes/pricing/+page.svelte"],
    ["alt-missing", "Astro", ASTRO_PAGE.replace(' alt="Saglitz Design"', ""), "src/pages/pricing.astro"],
    ["heading-order-skipped", "Docusaurus", DOCUSAURUS_BUILT.replace("<h2>Where the shift comes from</h2>", "<h4>Where the shift comes from</h4>"), "build/docs/reserving-space/index.html"],
  ];

  it.each(SUBSTRATE)("%s had substrate in the %s fixture and stayed silent on purpose", (rule, _stack, code, path) => {
    expect(seoRules(code, path).map((f) => f.rule)).toContain(rule);
  });

  // A matrix that returns clean for everything has proved nothing. This page
  // carries ten seeded defects and the assertion names every finding it draws,
  // so a rule that stops firing, or starts firing twice, fails here.
  it("names every finding on the deliberately broken page", () => {
    expect(ids(BROKEN_PAGE, "public/broken.html")).toEqual([
      "alt-missing",
      "alt-missing",
      "canonical-missing",
      "heading-order-skipped",
      "jsonld-unparseable",
      "meta-description-missing",
      "multiple-h1",
      "title-length",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The two counterexamples that priced the `recipes/` guard.
//
// A reviewer proposed exempting a document with no <h1>, no sectioning
// landmark and no outbound link, to silence the 24 findings this package's own
// `recipes/*/html-css.html` demos draw. Measured against the eight demo files
// it removes 18 of the 24 — `recipes/card` has an <article> and a link and
// `recipes/empty-state` has a <section>, so both stay graded and the
// disclosure has to stand anyway.
//
// These two pages are what it would cost. Both are pages a real visitor
// reaches, both match the proposed signal on every term, and every finding
// below is true and actionable. The guard was declined; these assertions are
// where that decision is written down, so re-proposing it fails here first.
// ─────────────────────────────────────────────────────────────────────────────
describe("pages that match the proposed component-demo signal but are real pages", () => {
  it("grades an image-only splash page, which has no h1, no landmark and no link", () => {
    expect(ids(IMAGE_ONLY_SPLASH, "public/index.html")).toEqual([
      "canonical-missing",
      "meta-description-missing",
      "title-missing",
    ]);
  });

  it("grades a minimal 404, whose only structure is a link home", () => {
    expect(ids(MINIMAL_404, "public/404.html")).toEqual([
      "canonical-missing",
      "meta-description-missing",
      "title-length",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vue and Angular bind attributes rather than writing literals, and `.vue` is
// in SEO_EXTENSIONS while `RECOGNISED_METADATA` names Nuxt's `useHead` — both
// are advertised stacks. `alt-missing` claimed "has no alt attribute at all"
// on every bound alt in both of them; JSX's `alt={caption}` happened to satisfy
// a bare-name test, which is why ten React-family fixtures never caught it.
// ─────────────────────────────────────────────────────────────────────────────
describe("alt-missing — a bound alt is an alt", () => {
  const BOUND: Array<[string, string]> = [
    [`<img :src="s" :alt="caption">`, "src/components/Card.vue"],
    [`<img v-bind:alt="caption">`, "src/components/Card.vue"],
    [`<img v-bind="imgAttrs">`, "src/components/Card.vue"],
    [`<img [src]="s" [alt]="caption">`, "src/app/card.component.html"],
    [`<img [ngSrc]="s" [alt]="caption">`, "src/app/card.component.html"],
    [`<img x-bind:alt="caption">`, "public/page.html"],
    [`<img src="a.png" alt={caption} />`, "src/Card.tsx"],
  ];

  it.each(BOUND)("says nothing about %s", (code, path) => {
    expect(ids(code, path)).not.toContain("alt-missing");
  });

  it("still fires on an image that really has no alt, in the same file shapes", () => {
    expect(ids(`<img :src="s">`, "src/components/Card.vue")).toContain("alt-missing");
    expect(ids(`<img [src]="s">`, "src/app/card.component.html")).toContain("alt-missing");
  });
});

describe("multiple-h1 — a conditional marker is read at a name position", () => {
  it("fires on two unconditional H1s even when one names v-if in its title", () => {
    expect(ids(`<h1 title="in Vue use v-if here">A</h1><h1>B</h1>`, "public/page.html"))
      .toContain("multiple-h1");
  });

  it("still stands down for a real v-if / v-else pair", () => {
    expect(ids(`<h1 v-if="q">Results</h1><h1 v-else>Search</h1>`, "pages/search.vue"))
      .not.toContain("multiple-h1");
  });
});

describe("unquoted attribute values — valid HTML, and standard in minified output", () => {
  it("reads an unquoted meta description and canonical rather than reporting them absent", () => {
    const code = `<!doctype html>
<html lang=en>
<head>
  <title>Website Redesign Pricing for UK Startups | Saglitz</title>
  <meta name=description content="What a website redesign costs in 2026, broken down by scope, with real line-item numbers from twelve recent studio projects and a four-week timeline.">
  <link rel=canonical href=https://saglitz.com/pricing/>
</head>
<body><main><h1>Pricing</h1></main></body>
</html>`;
    const fired = ids(code, "public/pricing/index.html");
    expect(fired).not.toContain("meta-description-missing");
    expect(fired).not.toContain("canonical-missing");
    expect(fired).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// `canonical-not-absolute` flagged the exact idiom `canonical-missing`'s own
// fix recommends. Follow "in Next.js, metadata.alternates.canonical with
// metadataBase" and the rule fired, with a fix — hardcode an absolute URL per
// route — that breaks every preview deployment.
// ─────────────────────────────────────────────────────────────────────────────
describe("canonical-not-absolute — only where a relative canonical is provably one", () => {
  const NEXT_PAGE = `export const metadata = {
  title: "Website Redesign Pricing for UK Startups | Saglitz",
  alternates: { canonical: "/pricing" },
};

export default function Page() {
  return <main><h1>Website redesign pricing</h1></main>;
}`;

  it("says nothing about a route canonical resolved against metadataBase", () => {
    expect(ids(NEXT_PAGE, "app/pricing/page.tsx")).not.toContain("canonical-not-absolute");
  });

  it("says nothing about a relative canonical in any framework file", () => {
    expect(ids(`<script>useHead({ link: [{ rel: "canonical", href: "/pricing" }] })</script>`, "pages/pricing.vue"))
      .not.toContain("canonical-not-absolute");
  });

  it("still fires on a self-contained document, where that href is what ships", () => {
    expect(ids(GOOD_HTML.replace('href="https://saglitz.com/pricing/"', 'href="/pricing/"'), "index.html"))
      .toContain("canonical-not-absolute");
  });

  it("still fires on a staging host, which is wrong at every scope", () => {
    expect(ids(NEXT_PAGE.replace('"/pricing"', '"https://staging.saglitz.com/pricing"'), "app/pricing/page.tsx"))
      .toContain("canonical-points-elsewhere");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// "A component file is not a page" was applied rigorously to metadata and not
// at all to headings, so a module holding several components was graded as
// though a visitor received all of them at once. `.stories.tsx` matters most
// of the four: a design-system repository is this package's own audience.
// ─────────────────────────────────────────────────────────────────────────────
describe("headings — counted per rendered page, which in a JS module is per component", () => {
  it("says nothing about a story file with one <h1> per story", () => {
    const code = `export const Default = () => <h1>Section title</h1>;
export const Long = () => <h1>A considerably longer section title</h1>;
export const Short = () => <h1>Short</h1>;`;
    expect(ids(code, "src/components/Heading.stories.tsx")).toEqual([]);
  });

  it("says nothing about two error routes in one module", () => {
    const code = `export function NotFound() {
  return <h1>Page not found</h1>;
}

export function ServerError() {
  return <h1>Something went wrong</h1>;
}`;
    expect(ids(code, "app/routes/errors.tsx")).toEqual([]);
  });

  it("says nothing about a page and its error boundary", () => {
    const code = `export default function Page() {
  return <main><h1>Dashboard</h1></main>;
}

export function ErrorBoundary() {
  return <h1>This dashboard could not load</h1>;
}`;
    expect(ids(code, "app/dashboard/page.tsx")).toEqual([]);
  });

  it("does not read an h1 in one component and an h3 in the next as a skipped level", () => {
    const code = `export const Intro = () => <h1>Overview</h1>;

export const Detail = () => <h3>The fine print</h3>;`;
    expect(ids(code, "src/panels.tsx")).toEqual([]);
  });

  it("still fires on two <h1>s inside one component, which is the case the rule is for", () => {
    const code = `export default function Page() {
  return (
    <main>
      <h1>Website redesign pricing</h1>
      <h1>What changes the price</h1>
    </main>
  );
}`;
    expect(ids(code, "app/pricing/page.tsx")).toContain("multiple-h1");
  });

  it("still fires on a skipped level inside one component", () => {
    const code = `export default function Page() {
  return (
    <main>
      <h1>Website redesign pricing</h1>
      <h4>What changes the price</h4>
    </main>
  );
}`;
    expect(ids(code, "app/pricing/page.tsx")).toContain("heading-order-skipped");
  });

  it("treats a single-file component as one page, not several", () => {
    // `.vue`, `.svelte` and `.astro` hold one component per file; a
    // capitalised top-level const in the script block must not split them.
    const code = `<script setup lang="ts">
const Props = defineProps<{ title: string }>();
</script>

<template>
  <main>
    <h1>Website redesign pricing</h1>
    <h1>What changes the price</h1>
  </main>
</template>`;
    expect(ids(code, "pages/pricing.vue")).toContain("multiple-h1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Four `notVisible` entries were factually wrong or missing. Each assertion
// below is the behaviour its entry now describes — an entry that drifts from
// the code is worse than no entry, because a reader acts on it.
// ─────────────────────────────────────────────────────────────────────────────
describe("the disclosures, measured against what the rules actually do", () => {
  const EMAIL = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
  <table role="presentation" cellpadding="0" cellspacing="0">
    <tr><td><h1>Your invoice is ready</h1><p>The February invoice for your retainer is attached.</p></td></tr>
  </table>
</body>
</html>`;

  it("exempts an email in a mail path from the head-absence rules", () => {
    expect(ids(EMAIL, "emails/invoice.html")).toEqual([]);
  });

  it("grades that same email as a page the moment it links a stylesheet", () => {
    const withCss = EMAIL.replace("</head>", `  <link rel="stylesheet" href="/email.css">\n</head>`);
    const fired = ids(withCss, "emails/invoice.html");
    expect(fired).toContain("title-missing");
    expect(fired).toContain("meta-description-missing");
    expect(fired).toContain("canonical-missing");
  });

  it("grades that same email as a page the moment it uses a <nav>", () => {
    const withNav = EMAIL.replace("</body>", `  <nav><a href="https://example.com/">Home</a></nav>\n</body>`);
    expect(ids(withNav, "emails/invoice.html")).toContain("canonical-missing");
  });

  it("still grades a recognised email with the rules the exemption does not cover", () => {
    const twoH1s = EMAIL.replace("<p>The February", "<h1>Second heading</h1><p>The February");
    const fired = ids(twoH1s, "emails/invoice.html");
    expect(fired).toContain("multiple-h1");
    expect(fired).not.toContain("canonical-missing");
  });

  // `title-length` only half-applies to a recognised email: the over-60-
  // character branch doesn't need a self-contained document to mean
  // something, but the under-30-character branch is gated on one, and a
  // recognised email is never one. So a two-character subject line is
  // silent — the same string on a page is not — while an overlong subject
  // line still fires either way.
  it("grades an overlong email subject line, but not a two-character one", () => {
    const shortTitle = EMAIL.replace("<meta charset=\"utf-8\">", `<meta charset="utf-8"><title>Hi</title>`);
    expect(ids(shortTitle, "emails/invoice.html")).not.toContain("title-length");
    expect(ids(shortTitle, "page.html")).toContain("title-length");

    const longTitle = EMAIL.replace("<meta charset=\"utf-8\">", `<meta charset="utf-8"><title>${"x".repeat(65)}</title>`);
    expect(ids(longTitle, "emails/invoice.html")).toContain("title-length");
  });

  it("reads a Next.js app/robots.ts without parsing it, so it reports no robots findings", () => {
    const fired = configIds([
      { path: "app/robots.ts", source: `export default function robots() {\n  return { rules: { userAgent: "*", disallow: "/" } };\n}` },
      { path: "app/page.tsx", source: `export const metadata = { title: "Home" };` },
    ]);
    expect(fired).not.toContain("robots-blocks-everything");
    expect(fired).not.toContain("llms-txt-absent");
  });

  it("switches the whole project-metadata block off for one plain HTML file", () => {
    const framework = { path: "pages/index.vue", source: `<template><main><h1>Home</h1></main></template>\n<script setup>useHead({ title: "Home" });</script>` };
    const withoutHtml = configIds([framework]);
    const withHtml = configIds([
      framework,
      { path: "public/404.html", source: `<!doctype html><html lang="en"><head><title>Not found — this page has moved on</title></head><body><p>Not found.</p></body></html>` },
    ]);
    expect(withoutHtml).toContain("meta-description-missing");
    expect(withHtml).not.toContain("meta-description-missing");
  });

  it("names each of those in the report's notVisible list", () => {
    const joined = SEO_NOT_VISIBLE.join("\n");
    expect(joined).toMatch(/app\/robots\.ts/);
    expect(joined).toMatch(/rel=\\?"stylesheet\\?"/);
    expect(joined).toMatch(/404\.html/);
    expect(joined).toMatch(/metadataBase/);
  });
});
