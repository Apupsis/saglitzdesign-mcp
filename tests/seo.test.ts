import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { seoRules, seoConfigRules, SEO_EXTENSIONS, SEO_FILENAMES } from "../dist/seo.js";
import { loadKnowledge, findDoc } from "../dist/knowledge.js";

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

  it("says nothing about an HTML email, which correctly has no canonical", () => {
    const code = `<!doctype html>
<html>
<head><meta charset="utf-8"><style>.wrap{max-width:600px}</style></head>
<body>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr><td><h1>Your order</h1><p>Thanks — it ships tomorrow morning.</p></td></tr>
  </table>
</body>
</html>`;
    expect(seoRules(code, "emails/order-confirmation.html")).toEqual([]);
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
