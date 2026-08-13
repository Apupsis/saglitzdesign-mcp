# SEO/GEO and performance auditors — design

**Date:** 2026-08-13
**Target release:** v0.22.0
**Status:** approved, ready for implementation

## Why

`seo_geo_guide` returns the guides. It has done that since v0.9.0 and the guides
are good — `technical-seo` carries the current Core Web Vitals thresholds with a
myth-check on the fabricated 2.0s LCP claim, `geo-tactics-checklist` covers
llms.txt and citation tactics.

Nothing checks the page. A team can read every word and still ship a hero image
with `loading="lazy"`, three H1s, a canonical pointing at staging, and no
`llms.txt` — and this server will hand them the guide again.

The security package closed that gap for headers and the generic-design package
closed it for AI defaults. This closes it for discoverability and for the
authored half of performance.

## The rule that shapes the whole design

**These tools audit what is authored, not what is measured.**

They cannot fetch the page, cannot see rendered output, and cannot see field
data. So they check *authored signals* and must never imply a measured verdict.

A page can have flawless markup and a terrible LCP. Core Web Vitals are
75th-percentile real-user measurements; this tool reads source. So it may say
*"the hero image carries `loading=\"lazy\"`, which delays the LCP element"* —
that is a fact about the source with a documented causal link. It may **never**
say a page's LCP is good, or produce anything shaped like a pass/fail on a
vital.

This is the direct analogue of the security package's rule that you never claim
an absence you cannot prove. Telling a team their vitals are fine, from source,
would be the same error pointed at a different subject — and worse, because they
would stop measuring.

## Scope

**In:** authored signals in HTML, framework source and the small set of files
that carry discoverability configuration.

**Out:**

- **Running anything.** No Lighthouse, no headless browser, no network request.
  The server's published promise is that it reads only local files and nothing
  leaves the machine, and the security package already declined this for the
  same reason.
- **Bundle-weight estimation.** Reading `package.json` and `dist/` sizes to
  guess JavaScript weight ignores tree-shaking, code-splitting and compression,
  so the number would be wrong in a direction nobody can predict. A wrong number
  is worse than no number, because it gets quoted.
- **Content quality.** Whether the writing deserves to rank is not a fact about
  the source. `audit_ux_copy` and `on-page-seo` own that.
- **Anything requiring a crawl.** Broken internal links, orphan pages and
  redirect chains need the whole site graph; these tools see the files they are
  given.

## Two tools, because they read different things

`audit_seo_geo` reads HTML, `robots.txt`, `sitemap.xml`, `llms.txt` and
framework metadata exports. `audit_performance` reads HTML, `@font-face`
declarations, script tags and asset attributes. They cite different documents,
and an agent knows which it wants from the intent. One combined report would mix
two concerns and bury both.

### `audit_seo_geo`

| Rule | Severity |
|---|---|
| `title-missing` / `title-length` (outside 30–60 characters) | warning |
| `meta-description-missing` / `meta-description-length` (outside 70–160) | warning |
| `multiple-h1` — more than one `<h1>` in a document | warning |
| `heading-order-skipped` — an `<h3>` with no preceding `<h2>` | info |
| `canonical-missing` / `canonical-not-absolute` | warning |
| `canonical-points-elsewhere` — a canonical whose host differs from its siblings' | error |
| `hreflang-not-reciprocal` — within the scanned set only | warning |
| `jsonld-unparseable` — a `ld+json` block that is not valid JSON | error |
| `jsonld-missing-required` — declared `@type` missing a required property | warning |
| `og-incomplete` — `og:title`/`og:description`/`og:image` partially present | info |
| `alt-missing` — images with no `alt` attribute, counted | warning |
| `robots-blocks-everything` — `Disallow: /` under `User-agent: *` | error |
| `robots-blocks-ai-crawlers` — GPTBot, ClaudeBot, PerplexityBot disallowed | info |
| `llms-txt-absent` | info |
| `sitemap-not-referenced` — no `Sitemap:` line in `robots.txt` | info |
| `content-not-in-html` — an empty root element beside a script bundle | warning |

The last one is the GEO rule that matters most: AI crawlers do not execute
JavaScript. `technical-seo` states it; nothing checked it.

`robots-blocks-ai-crawlers` is deliberately `info` and its message must not
recommend a direction. Blocking them is a legitimate choice; the finding says
the choice was made, and points at `geo-fundamentals` for the trade-off.

### `audit_performance`

| Rule | Severity |
|---|---|
| `lazy-hero` — `loading="lazy"` on the first in-document image | error |
| `hero-no-fetchpriority` — first image lacks `fetchpriority="high"` | info |
| `css-hero-not-preloaded` — a `background-image` in an inline or head style with no matching `<link rel="preload">` | info |
| `font-display-missing` — an `@font-face` with no `font-display` | warning |
| `font-host-not-preconnected` — a cross-origin font URL with no `preconnect` | info |
| `image-without-dimensions` — `<img>`/`<video>`/`<iframe>` with neither dimensions nor `aspect-ratio` | warning |
| `render-blocking-script` — a `<script>` in `<head>` with neither `defer` nor `async` nor `type="module"` | warning |
| `third-party-script-count` — more than five distinct third-party origins | info |

Every one is a fact about the source with a causal link documented in
`technical-seo`. None asserts a measurement.

## Structured output, from the first commit

Both tools return `structuredContent` alongside their text, and declare an
`outputSchema`. The SDK already supports it at 1.29; the `tool()` wrapper needs
one additive optional parameter to pass it through, which leaves every existing
registration untouched.

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

This is package D's core, pulled forward for the two tools that are being
written anyway. D then applies the same treatment to the other thirty-one rather
than rewriting these two.

`notVisible` is a machine-readable array rather than prose buried in the text,
because an agent chaining `audit → fix` needs to know what was not checked as
much as what was.

## Knowledge

Probably none new. The generic-design package proved the knowledge was mostly
already written: `technical-seo` carries the CWV thresholds and the LCP/INP/CLS
quick wins, `on-page-seo` carries title and description guidance,
`geo-tactics-checklist` carries llms.txt, `geo-fundamentals` carries the
AI-crawler trade-off, `accessibility` carries alt text.

A document is added only if a rule has no citable home. If that happens, the
rule and the document arrive together — a rule whose `doc` points at a document
that does not make its claim is the defect the generic-design package found and
fixed on its own branch.

## Testing

The lesson both prior packages arrived at, applied from the first commit:

- Every rule tested in both directions; the negatives are load-bearing.
- **A per-stack fixture matrix of correctly-built pages asserting zero
  findings** — a Next.js App Router page with generated metadata, an Astro page,
  a SvelteKit page, a plain static site, and a Docusaurus-style docs page. This
  is the analogue of the security package's 13-framework matrix and the
  generic-design package's five distinctive pages, and it is what stops these
  tools flagging correct work.
- A **deliberately broken page** asserting a specific finding set, so the matrix
  proves it can tell the difference rather than returning clean for everything.
- The structured output asserted against its own `outputSchema`, and
  `structuredContent.summary` asserted to agree with `findings`.
- A test that every `doc` id resolves **and** that the cited document contains a
  word the rule declares — the two-way citation check the generic-design package
  arrived at, carried over rather than rediscovered.

## Out of scope for this spec, tracked

Package D (structured output for the remaining tools, SDK 1.30, full
annotations), the knowledge freshness sweep, `audit_project` integration for all
three auditors, and the iOS/macOS security layer, which the user has asked to
come last.
