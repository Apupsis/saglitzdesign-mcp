// SEO and GEO auditing for pages and the site-level files around them.
//
// `seo_geo_guide` has shipped this server's SEO and GEO documents since
// v0.9.0. Nothing ever checked a page against them, so a team could read every
// word and still ship three H1s, a canonical pointing at a laptop, and no
// llms.txt. These are the rules.
//
// ── The governing rule of this module ────────────────────────────────────────
//
// **These rules audit what is authored, not what is measured.** A rule may
// state a fact about the source and pair it with a documented causal link. No
// rule, message or fix may assert or imply a Core Web Vitals verdict or a
// ranking outcome: vitals are 75th-percentile field data and ranking is a
// search engine's behaviour, and neither is in a file. "Your LCP is fine",
// said from source, is this package's forbidden claim.
//
// ── And the rule this project has now learned three times ────────────────────
//
// **Only facts become rules.** security.ts and generic.ts between them lost a
// rule outright and took nine repair rounds, and every single defect was a
// rule firing on correct work. A false positive here does not add noise — it
// teaches the reader the output is unreliable, and the true finding in the
// next run is skimmed past with the rest. Every negative test in this module's
// suite is load-bearing.
//
// Two rules were cut or narrowed on that ground before this module shipped.
//
// **`og-incomplete` is not here, and its absence is deliberate.** It was
// specified with `on-page-seo` as its document. That document does not mention
// Open Graph — and neither does any other document in this knowledge base:
// "Open Graph", "og:title" and "og:image" return nothing across all of
// `knowledge/`. A rule must cite a document that exists *and* makes the rule's
// claim, and the generic-design package already shipped one that cited a real
// document saying nothing about it. There is no document here to cite, so
// there is no rule. If Open Graph coverage is wanted, the document comes
// first and the rule follows it.
//
// `jsonld-missing-required` is narrowed to `@context` and `@type` for the same
// reason; see the rule itself.
//
// ── The framework-metadata question, which decides whether this is usable ────
//
// A Next.js App Router page exports `metadata`; the `<title>` is nowhere in
// that file. An Astro page has frontmatter. A SvelteKit page has
// `<svelte:head>`. And in every one of them the metadata may live in a layout
// this tool was never given — Next.js merges a page's metadata over its
// layout's, so a page that sets only a title is not a page with no
// description. One file therefore cannot prove metadata absent for any
// framework, whatever it does or does not contain.
//
// So absence is claimed at two different scopes, and never guessed at either:
//   • `seoRules` claims it only for a *self-contained document* — a plain HTML
//     file with a `<head>` in it. That head is the whole head; if there is no
//     `<title>` in it, there is no title.
//   • `seoConfigRules` claims it for a *project*: given every file, "no file
//     anywhere declares a description" is a fact about what was read. It runs
//     only when no self-contained document was scanned, so the two scopes can
//     never both report the same defect.
// A framework component on its own gets silence, which is the honest answer.

import { type LintFinding } from "./lint.js";
import { scanTags, type Tag, maskComments, elementSpan, flattenTags } from "./scan.js";

const lineOf = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

// Same attribute-boundary reasoning as security.ts: `\b` matches inside
// `data-href`, so an attribute name may only start at the beginning of the
// attribute chunk or after whitespace / the previous value's closing quote.
const ATTR_START = `(?:^|[\\s"'])`;

const hasAttr = (tag: Tag, name: string): boolean =>
  new RegExp(`${ATTR_START}${name}(?=[\\s=/>]|$)`, "i").test(tag.attrs);

/** `{...props}` — the attribute may well be forwarded; don't guess. */
const hasSpread = (tag: Tag): boolean => /\{\s*\.\.\./.test(tag.attrs);

/**
 * An attribute's value, and whether it is *readable*. `content={description}`
 * and `href={`${base}/x`}` are declarations whose value only exists at render
 * time; reporting a length or a host for them would be inventing one, so they
 * come back as `{ present: true, value: undefined }` — enough to suppress an
 * absence claim, never enough to grade.
 */
interface AttrValue { present: boolean; value?: string }

const attrValue = (tag: Tag, name: string): AttrValue => {
  const re = new RegExp(`${ATTR_START}${name}\\s*=\\s*("([^"]*)"|'([^']*)'|\\{[^}]*\\})`, "i");
  const m = re.exec(tag.attrs);
  if (!m) return { present: hasAttr(tag, name) };
  const raw = m[2] ?? m[3];
  if (raw === undefined) return { present: true };            // a JSX expression
  if (/\$\{|\{[^}]*\}/.test(raw)) return { present: true };   // interpolated literal
  return { present: true, value: raw };
};

// ── file shapes ──────────────────────────────────────────────────────────────

/**
 * A file whose metadata can live somewhere this call was not given. Everything
 * a framework renders is in here; `.html` deliberately is not, because a plain
 * HTML file with a `<head>` carries its whole head.
 */
const FRAMEWORK_FILE = /\.(?:[jt]sx|astro|svelte|vue|[cm]?[jt]s)$/i;

/** Extensions worth reading for page-level SEO signals. */
export const SEO_EXTENSIONS = [
  ".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro",
];

/**
 * Files read by name rather than extension — and, in `scanProject`, read
 * *before* the extension matches and exempt from the file cap. The same
 * judgement security.ts made for `_headers`: an audit that never opened
 * robots.txt reports the site's crawl rules absent, which is worse than not
 * looking. `sitemap.ts` / `robots.ts` are the Next.js App Router generators
 * for the two static files beside them.
 */
export const SEO_FILENAMES = [
  "robots.txt", "llms.txt", "llms-full.txt",
  "sitemap.xml", "sitemap-index.xml", "sitemap_index.xml",
  "robots.ts", "robots.js", "sitemap.ts", "sitemap.js",
  "next-sitemap.config.js", "next-sitemap.config.mjs",
  "next-seo.config.js", "next-seo.config.ts",
];

const basename = (path: string): string => path.split("/").pop() ?? path;

// ── metadata declarations ────────────────────────────────────────────────────

/**
 * The regions of a file in which a framework declares page metadata. Used to
 * bound the key search below: a bare file-wide hunt for `description:` finds
 * a prop on a card component and reads it as page metadata, and a bare hunt
 * that finds nothing has proven nothing either way.
 */
function metadataRegions(masked: string, path: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];

  const balanced = (from: number): number => {
    let depth = 0;
    for (let i = from; i < masked.length; i++) {
      if (masked[i] === "{") depth++;
      else if (masked[i] === "}" && --depth === 0) return i + 1;
    }
    return masked.length;
  };

  // `export const metadata = { … }` / `const metadata: Metadata = { … }`
  const metaRe = /\b(?:export\s+)?(?:const|let|var)\s+metadata\b[^=;{]*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(masked)) !== null) {
    const open = masked.indexOf("{", m.index + m[0].length - 1);
    regions.push([m.index, balanced(open)]);
  }

  // `generateMetadata(…): Promise<Metadata> { … }` — the argument list closes
  // at the first `)`, and the body opens at the first `{` after it.
  const genRe = /\bgenerateMetadata\s*(?:<[^>]*>)?\s*\(/g;
  while ((m = genRe.exec(masked)) !== null) {
    const close = masked.indexOf(")", m.index);
    const open = close === -1 ? -1 : masked.indexOf("{", close);
    if (open !== -1) regions.push([m.index, balanced(open)]);
  }

  // Nuxt's `useHead({ … })` / `useSeoMeta({ … })` / `definePageMeta({ … })`.
  const headFnRe = /\b(?:useHead|useSeoMeta|definePageMeta|defineOgImage)\s*\(\s*\{/g;
  while ((m = headFnRe.exec(masked)) !== null) {
    const open = masked.indexOf("{", m.index + m[0].length - 1);
    regions.push([m.index, balanced(open)]);
  }

  // Remix / React Router: `export const meta: MetaFunction = () => [ … ]`, and
  // the `links` export that carries a canonical. The value is an array of
  // objects behind an arrow function, so there is no single brace to balance
  // from — the region runs to the next top-level `export`, which is where the
  // declaration provably ends. Missing this shape reported a correct Remix
  // project as having no title, no description and no canonical: three
  // fabricated warnings on exemplary work, and the reason this window exists.
  const exportRe = /^[ \t]*export\s+(?:const|let|var|function|async\s+function)\s+(meta|links)\b/gm;
  while ((m = exportRe.exec(masked)) !== null) {
    const next = masked.indexOf("\nexport ", m.index + m[0].length);
    const end = next === -1 ? masked.length : next;
    regions.push([m.index, Math.min(end, m.index + 2000)]);
  }

  // Astro frontmatter: two languages in one file, with a hard fence between.
  if (/\.astro$/i.test(path)) {
    const open = /^---[ \t]*\r?\n/.exec(masked);
    const close = open ? masked.indexOf("\n---", open[0].length - 1) : -1;
    if (open && close !== -1) regions.push([open[0].length, close]);
  }

  // `<svelte:head>` — scanTags cannot see it (`:` is not a tag-name character
  // in its pattern), so it is found by index.
  const sh = masked.toLowerCase().indexOf("<svelte:head");
  if (sh !== -1) {
    const end = masked.toLowerCase().indexOf("</svelte:head", sh);
    regions.push([sh, end === -1 ? masked.length : end]);
  }

  // A `next-seo` config module is metadata from its first line to its last.
  if (/next-seo\.config\.[cm]?[jt]s$/i.test(path)) regions.push([0, masked.length]);

  return regions;
}

/**
 * The other shape a head declaration takes: a list entry that *names* the tag
 * it is building rather than keying on it — Nuxt's
 * `meta: [{ name: "description", content: … }]`, Remix's
 * `[{ tagName: "link", rel: "canonical", href: … }]`. These prove the
 * declaration exists and nothing more: the string beside the key is the tag's
 * name, not its value, and reading "description" as an eleven-character meta
 * description would be inventing a finding out of a match.
 */
const NAMED_TAG_SHAPE: Partial<Record<string, RegExp>> = {
  description: /(?:name|property)\s*[:=]\s*["'`]description["'`]/i,
  canonical: /rel\s*[:=]\s*["'`]canonical["'`]/i,
};

/**
 * A metadata key inside one of those regions, or an attribute of a
 * `<NextSeo …>` / `<Head>`-family component. Accepts `:` (an object literal)
 * and `=` (a JSX attribute, an Astro `const`).
 */
function keyInRegions(
  masked: string, regions: Array<[number, number]>, key: string,
): (AttrValue & { index: number }) | undefined {
  const re = new RegExp(`(?:^|[\\s{,"'])${key}\\s*[:=]\\s*(?:(["'\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1)?`, "i");
  const named = NAMED_TAG_SHAPE[key];
  let presentOnly: number | undefined;

  for (const [start, end] of regions) {
    const region = masked.slice(start, end);
    const m = re.exec(region);
    if (m) {
      // The declaration's own offset, so a finding points at the line the
      // reader has to edit rather than at the top of the first region.
      const index = start + m.index;
      const raw = m[2];
      if (raw === undefined || /\$\{/.test(raw)) return { present: true, index };
      return { present: true, value: raw, index };
    }
    const nm = named?.exec(region);
    if (nm && presentOnly === undefined) presentOnly = start + nm.index;
  }
  return presentOnly === undefined ? undefined : { present: true, index: presentOnly };
}

interface Declaration extends AttrValue {
  index: number;
  /** Read from a real `<title>` / `<meta>` / `<link>` tag rather than a metadata object. */
  fromTag: boolean;
}

interface PageDeclarations {
  /**
   * This file declares page metadata in a shape this module can *read* — a
   * metadata region, a head component, or a real head tag.
   *
   * Deliberately not "this file renders a `<head>`". A framework file with a
   * head and no recognised declaration means the project declares its metadata
   * some way this module does not know, and reading an unrecognised shape as
   * an absence is the exact failure security.ts spent four rounds removing.
   * No surface, no absence claim.
   */
  surface: boolean;
  title?: Declaration;
  description?: Declaration;
  canonical?: Declaration;
  hreflang: Array<{ index: number; href?: string; present: boolean }>;
  jsonld: Tag[];
}

/**
 * Components that carry head content as attributes or children — matched
 * **case-sensitively**, which is the only thing separating `<Head>` from
 * `<head>`. Lower-casing the name first made every plain HTML document look
 * like a project that declares metadata through a head component, which is
 * precisely the "unrecognised shape read as a recognised one" mistake the
 * surface rule exists to prevent.
 */
const HEAD_COMPONENTS = new Set(["Head", "Helmet", "NextSeo", "HeadContent", "Seo", "SEO", "MetaTags"]);

function declarationsOf(masked: string, tags: Tag[], path: string): PageDeclarations {
  const out: PageDeclarations = { surface: false, hreflang: [], jsonld: [] };
  const regions = metadataRegions(masked, path);

  for (const tag of tags) {
    const name = tag.name.toLowerCase();

    // A `<title>` inside an `<svg>` is the graphic's accessible name, not the
    // page's. Reading one as the page title fired `title-length` on a correct
    // icon button — "Close" is five characters — and, worse, would have
    // suppressed a real `title-missing` on a page whose only title tag was in
    // an icon.
    if (name === "title" && !out.title && !insideSvg(masked, tag.index)) {
      const span = elementSpan(masked, tag);
      const text = span ? masked.slice(span[0], span[1]) : "";
      const readable = !/[{}]|\$\{/.test(text);
      out.title = { present: true, value: readable ? text.trim() : undefined, index: tag.index, fromTag: true };
    }

    if (name === "meta") {
      const nameAttr = (attrValue(tag, "name").value ?? attrValue(tag, "property").value ?? "").toLowerCase();
      if (nameAttr === "description" && !out.description) {
        const content = attrValue(tag, "content");
        out.description = { ...content, index: tag.index, fromTag: true };
      }
    }

    if (name === "link") {
      const rel = (attrValue(tag, "rel").value ?? "").toLowerCase();
      if (rel === "canonical" && !out.canonical) {
        const href = attrValue(tag, "href");
        out.canonical = { ...href, index: tag.index, fromTag: true };
      }
      if (rel === "alternate" && hasAttr(tag, "hreflang")) {
        const href = attrValue(tag, "href");
        out.hreflang.push({ index: tag.index, href: href.value, present: href.present });
      }
    }

    if (name === "script" && /ld\+json/i.test(attrValue(tag, "type").value ?? "")) {
      out.jsonld.push(tag);
    }

    // `<NextSeo title="…" description="…" canonical="…" />` and friends: the
    // declaration lives in the attributes rather than in a nested tag.
    if (HEAD_COMPONENTS.has(tag.name)) {
      out.surface = true;
      for (const [key, slot] of [["title", "title"], ["description", "description"], ["canonical", "canonical"]] as const) {
        const v = attrValue(tag, key);
        if (v.present && !out[slot]) out[slot] = { ...v, index: tag.index, fromTag: false };
      }
    }
  }

  if (regions.length) out.surface = true;
  for (const [key, slot] of [["title", "title"], ["description", "description"], ["canonical", "canonical"]] as const) {
    if (out[slot]) continue;
    const found = keyInRegions(masked, regions, key);
    if (found) out[slot] = { ...found, fromTag: false };
  }

  if (out.title || out.description || out.canonical) out.surface = true;

  return out;
}

/** True when `index` sits between an `<svg>` and its closing tag. */
function insideSvg(masked: string, index: number): boolean {
  const lower = masked.toLowerCase();
  const open = lower.lastIndexOf("<svg", index);
  if (open === -1) return false;
  const close = lower.indexOf("</svg", open);
  return close === -1 || close > index;
}

// ── URL judgements ───────────────────────────────────────────────────────────

const ABSOLUTE_URL = /^https?:\/\//i;

const hostOf = (url: string): string => {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return (m?.[1] ?? "").toLowerCase().replace(/:\d+$/, "");
};

/**
 * Hosts that cannot be a live site: the loopback names, the reserved special-use
 * TLDs (RFC 2606 / 6761), and a leading `staging` label. Deliberately *not*
 * `*.vercel.app`, `*.netlify.app` or `*.github.io` — those are production hosts
 * for a great many real sites, and an `error` telling their owners the canonical
 * is wrong would be exactly the false positive this module refuses.
 */
const UNREACHABLE_HOST =
  /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$|\.(?:local|localhost|test|invalid|example|internal)$|^staging\./i;

/** Trailing slash and fragment removed, scheme and host lower-cased. */
const normalizeUrl = (url: string): string =>
  url.trim().replace(/#.*$/, "").replace(/^(https?:\/\/[^/?#]+)/i, (h) => h.toLowerCase()).replace(/\/+$/, "");

// ── page text ────────────────────────────────────────────────────────────────

/** Element ids a single-page-app framework mounts itself into. */
const ROOT_ID = /^(?:root|app|__next|___gatsby|__nuxt|main-app|q-app)$/i;

/**
 * A build-time or server-side placeholder — `%sveltekit.head%`, `{{ … }}`,
 * `{% … %}`, `<%= … %>`, `<?php … ?>`. An `.html` file carrying one is a
 * *template*: the head it ships is assembled somewhere else, and its own head
 * proves nothing about the page a visitor receives.
 */
const TEMPLATE_PLACEHOLDER = /%[A-Za-z][\w.:-]*%|\{\{|\{%|<%[=\-]|<\?php/;

/** Visible text, with script/style/noscript contents and every tag removed. */
function visibleText(masked: string): string {
  const stripped = masked
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ");
  return flattenTags(stripped).replace(/\s+/g, " ").trim();
}

/**
 * A document is self-contained when its own `<head>` is the whole head: a
 * plain HTML file, not a framework component, and not a template with a
 * placeholder where the head content will be injected. `src/app.html` with
 * `%sveltekit.head%` and CRA's `public/index.html` with `%PUBLIC_URL%` are
 * correct files that declare no title on purpose, and reporting three
 * warnings against each of them is the false positive this guard removes.
 */
function isSelfContainedDocument(masked: string, path: string): boolean {
  if (FRAMEWORK_FILE.test(path)) return false;
  if (!/<head[\s>]/i.test(masked)) return false;
  return !TEMPLATE_PLACEHOLDER.test(masked);
}

/**
 * The empty mount point of a client-rendered application: a root element with
 * nothing in it, a script bundle to fill it, and no other substantive text on
 * the page. All three are required — a page with real prose beside a small
 * `<div id="portal">` is a portal, not an empty page.
 */
function spaShellRoot(masked: string, tags: Tag[]): Tag | null {
  if (!/<body[\s>]|<html[\s>]/i.test(masked)) return null;
  const bundle = tags.some((t) => t.name.toLowerCase() === "script" && (attrValue(t, "src").value ?? "").length > 0);
  if (!bundle || visibleText(masked).length >= 200) return null;
  for (const tag of tags) {
    if (!ROOT_ID.test(attrValue(tag, "id").value ?? "")) continue;
    const span = elementSpan(masked, tag);
    if (span && !masked.slice(span[0], span[1]).trim()) return tag;
  }
  return null;
}

/**
 * True when this element is rendered conditionally, so only one of the
 * branches it belongs to ever reaches the page. Every templating language in
 * range writes that differently, and each of the three below was a live false
 * `multiple-h1` on a correct search page before it was handled:
 *   • JSX      `{query ? <h1>Results</h1> : <h1>Search</h1>}`
 *   • Svelte   `{#if query}<h1>…</h1>{:else}<h1>…</h1>{/if}`
 *   • Vue      `<h1 v-if="query">…</h1><h1 v-else>…</h1>`
 * A plain HTML page with two real `<h1>`s has none of these markers and still
 * fires, which is the whole point of the rule.
 */
const CONDITIONAL_ATTR = /(?:^|\s)(?:v-if|v-else|v-else-if|v-show|x-if|x-show|\*ngIf)\b/i;
const CONDITIONAL_BLOCK = /\?|&&|\|\||\.map\s*\(|\{\s*#(?:if|each|await)|\{\s*:(?:else|then|catch)|@(?:if|for|else)\b/;

function conditionallyRendered(masked: string, tag: Tag): boolean {
  if (CONDITIONAL_ATTR.test(tag.attrs)) return true;
  const open = masked.lastIndexOf("{", tag.index);
  if (open === -1 || tag.index - open > 400) return false;
  return CONDITIONAL_BLOCK.test(masked.slice(open, tag.index));
}

// ── the rule set ─────────────────────────────────────────────────────────────

// Ranges are the brief's, not the documents': on-page-seo targets 50–60
// characters for a title and 150–160 for a description, and firing on
// everything outside *those* would flag a great deal of correct work. What is
// flagged here is only what is outside a range wide enough that no reasonable
// reading of the document defends it.
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

export function seoRules(code: string, filename?: string): LintFinding[] {
  const path = filename ?? "";
  // A commented-out `<link rel="canonical">` is not a canonical, and a code
  // sample in a doc comment is not a page. Same masking pass, and the same
  // reasoning, as security.ts.
  const masked = maskComments(code, path);
  const tags = scanTags(masked);
  const decl = declarationsOf(masked, tags, path);

  const out: LintFinding[] = [];
  const push = (
    index: number, severity: LintFinding["severity"], rule: string,
    message: string, fix: string, doc: string,
  ) => out.push({ line: lineOf(code, index), severity, rule, message, fix, doc });

  // The empty mount point of a client-rendered app, if this document is one.
  // It decides two things: the `content-not-in-html` finding below, and
  // whether any head absence can be claimed at all — an app that renders its
  // own body renders its own head too, through whatever it uses for that
  // (react-helmet, vue-meta), and none of it is in this file.
  const shellRoot = spaShellRoot(masked, tags);

  /**
   * Can this file prove its own metadata absent? Only a self-contained
   * document can — see the module header. A framework component's `<head>`,
   * or its lack of one, says nothing about the layout that wraps it; a
   * template's head is completed at build time; a shell's head is completed
   * at run time.
   */
  const headMatch = /<head[\s>]/i.exec(masked);
  const selfContained = isSelfContainedDocument(masked, path) && headMatch !== null && !shellRoot;
  const headIndex = headMatch?.index ?? 0;

  // ── title ──────────────────────────────────────────────────────────────────
  if (selfContained && !decl.title) {
    push(headIndex, "warning", "title-missing",
      `This document's <head> carries no <title>, so search results and browser tabs fall back to whatever the engine can synthesise.`,
      `Add one unique <title> per page: the topic first, the brand last — "Website Redesign Pricing | Studio".`,
      "on-page-seo");
  }
  if (decl.title?.value) {
    const len = decl.title.value.length;
    // A framework `title` is only ever *added to*: a layout's
    // `title.template` ("%s | Studio") wraps the page's own string, and that
    // template is not in this file. So a short one here cannot be called short
    // — only a long one is already long whatever the layout does.
    // …and a shell's title is a placeholder its own script replaces, so a
    // short one there is not short either.
    const tooShort = len < TITLE_MIN && decl.title.fromTag && selfContained;
    if (len > TITLE_MAX || tooShort) {
      push(decl.title.index, "warning", "title-length",
        len > TITLE_MAX
          ? `The title is ${len} characters; past about 60 it is truncated in results, so the end of it is never read.`
          : `The title is ${len} characters, which leaves most of the available width unused.`,
        `Aim for 50–60 characters, topic in the first half, brand at the end.`,
        "on-page-seo");
    }
  }

  // ── meta description ───────────────────────────────────────────────────────
  if (selfContained && !decl.description) {
    push(headIndex, "warning", "meta-description-missing",
      `No meta description, so the engine writes its own snippet from whatever text it finds on the page.`,
      `Add a unique description per page: what the page delivers, the differentiator, a soft call to action.`,
      "on-page-seo");
  }
  if (decl.description?.value) {
    const len = decl.description.value.length;
    if (len > DESCRIPTION_MAX || len < DESCRIPTION_MIN) {
      push(decl.description.index, "warning", "meta-description-length",
        len > DESCRIPTION_MAX
          ? `The meta description is ${len} characters; past about 160 the tail is cut off in the snippet.`
          : `The meta description is ${len} characters, which is short of the width a snippet gives you.`,
        `Aim for 150–160 characters, front-loading a one-sentence direct answer.`,
        "on-page-seo");
    }
  }

  // ── canonical ──────────────────────────────────────────────────────────────
  if (selfContained && !decl.canonical) {
    push(headIndex, "warning", "canonical-missing",
      `No canonical link, so every URL variant of this page — parameters, trailing slash, protocol — is a separate document as far as a crawler is concerned.`,
      `Add a self-referencing <link rel="canonical" href="https://…"> with the page's final absolute URL.`,
      "technical-seo");
  }
  if (decl.canonical?.value) {
    const url = decl.canonical.value.trim();
    if (!ABSOLUTE_URL.test(url)) {
      push(decl.canonical.index, "warning", "canonical-not-absolute",
        `The canonical href "${url}" is relative. technical-seo asks for absolute URLs only, matching the final protocol and host exactly.`,
        `Write the full URL: https://example.com${url.startsWith("/") ? url : `/${url}`}`,
        "technical-seo");
    } else if (UNREACHABLE_HOST.test(hostOf(url))) {
      push(decl.canonical.index, "error", "canonical-points-elsewhere",
        `The canonical points at "${hostOf(url)}", which is not the host this page is served from — a development or staging URL left in the markup.`,
        `Point the canonical at the page's own production URL, matching the final protocol, host and trailing slash.`,
        "technical-seo");
    }
  }

  // ── hreflang ───────────────────────────────────────────────────────────────
  // Reciprocity is a claim about two pages, and only one is in this file. What
  // *is* checkable here is the other half of the same mechanism: a set that
  // never names this page cannot be reciprocated by the pages it points at,
  // because they have nothing to point back to.
  if (decl.hreflang.length && decl.canonical?.value && ABSOLUTE_URL.test(decl.canonical.value)) {
    const readable = decl.hreflang.every((h) => h.href !== undefined);
    const self = normalizeUrl(decl.canonical.value);
    if (readable && !decl.hreflang.some((h) => normalizeUrl(h.href!) === self)) {
      push(decl.hreflang[0].index, "warning", "hreflang-not-reciprocal",
        `This hreflang set never lists this page itself (${self}). Self-reference and return tags are what make a set reciprocal; one-way tags are ignored.`,
        `Add a <link rel="alternate" hreflang="…"> for this page's own locale pointing at its own canonical URL, and an x-default.`,
        "technical-seo");
    }
  }

  // ── JSON-LD ────────────────────────────────────────────────────────────────
  for (const tag of decl.jsonld) {
    const span = elementSpan(masked, tag);
    if (!span) continue;
    const body = code.slice(span[0], span[1]).trim();
    // Nothing to read: an empty block, a block rendered through
    // dangerouslySetInnerHTML, or one assembled from a template literal. A
    // block whose contents only exist at render time cannot be parsed here,
    // and guessing at it would be inventing a finding.
    if (!body || /\$\{/.test(body) || !/^[[{]/.test(body)) continue;

    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch (err) {
      push(tag.index, "error", "jsonld-unparseable",
        `This application/ld+json block is not valid JSON (${(err as Error).message}), so every consumer of it — rich results, AI extraction — skips the block entirely.`,
        `Fix the JSON (a trailing comma and an unquoted key are the usual causes) and re-check it in the Rich Results Test.`,
        "technical-seo");
      continue;
    }

    // Narrowed deliberately. Which properties a *type* requires is Google's
    // per-type documentation, and technical-seo does not state them — a rule
    // claiming "Article needs an author" would be citing a document that never
    // said so, the exact defect the generic-design package shipped once. What
    // every example in the cited document does carry, and what makes a block
    // interpretable at all, is `@context` and a `@type` on each node.
    const nodes = (Array.isArray(data) ? data : [data]).filter(
      (n): n is Record<string, unknown> => typeof n === "object" && n !== null);
    const missing: string[] = [];
    for (const node of nodes) {
      if (!("@context" in node)) missing.push("@context");
      const graph = node["@graph"];
      const typed = Array.isArray(graph)
        ? graph.filter((g): g is Record<string, unknown> => typeof g === "object" && g !== null)
        : [node];
      if (typed.some((t) => !("@type" in t))) missing.push("@type");
    }
    if (missing.length) {
      push(tag.index, "warning", "jsonld-missing-required",
        `This JSON-LD block is missing ${[...new Set(missing)].join(" and ")}. Without them it is an anonymous object rather than a schema.org node.`,
        `Add "@context": "https://schema.org" and a "@type" on every node, then validate with the Rich Results Test.`,
        "technical-seo");
    }
  }

  // ── headings ───────────────────────────────────────────────────────────────
  const headings = tags
    .filter((t) => /^h[1-6]$/i.test(t.name))
    .map((t) => ({ level: Number(t.name[1]), index: t.index, tag: t }));

  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length > 1 && !h1s.some((h) => conditionallyRendered(masked, h.tag))) {
    push(h1s[1].index, "warning", "multiple-h1",
      `${h1s.length} <h1> elements on one page. One is the clean signal of the page's topic, for search engines and for the models that parse structure into chunks.`,
      `Keep one <h1> and demote the rest to <h2>. Size them with CSS, not with the tag.`,
      "on-page-seo");
  }

  // Only checked when the file contains an `<h1>`. Without one there is no
  // root to the outline, and a fragment that legitimately starts at `<h3>`
  // because its parent rendered the `<h2>` would be reported as a skip.
  if (h1s.length) {
    let previous = 0;
    for (const h of headings) {
      if (previous && h.level > previous + 1) {
        push(h.index, "info", "heading-order-skipped",
          `Heading order jumps from h${previous} to h${h.level}. Heading levels are the document's outline; skipping one breaks the nesting a screen reader and a retrieval chunker both walk.`,
          `Use the next level down and style it with CSS.`,
          "accessibility");
      }
      previous = h.level;
    }
  }

  // ── images ─────────────────────────────────────────────────────────────────
  for (const tag of tags) {
    if (tag.name !== "img" && tag.name !== "Image") continue;
    // `alt=""` is the correct marking for a decorative image, not a missing
    // one, and `hasAttr` sees it. A spread may forward the attribute.
    if (hasAttr(tag, "alt") || hasSpread(tag)) continue;
    push(tag.index, "warning", "alt-missing",
      `<${tag.name}> has no alt attribute at all, so it is opaque to a screen reader and carries no text for anything reading the page as text.`,
      `Describe it: alt="…" for a meaningful image, alt="" for a decorative one.`,
      "accessibility");
  }

  // ── content in the HTML ────────────────────────────────────────────────────
  // The GEO rule nothing in this server has ever checked: AI crawlers read the
  // initial HTML only, technical-seo §3 says so, and until now nothing here
  // looked. A shell page for a genuinely client-only app is a fact worth
  // reporting even though the app works.
  if (shellRoot) {
    push(shellRoot.index, "warning", "content-not-in-html",
      `<${shellRoot.name} id="${attrValue(shellRoot, "id").value}"> is empty and the page carries no other substantive text, so this document's content arrives only after its script runs. AI crawlers read the initial HTML only.`,
      `Server-render or pre-render the content for this route (SSG, SSR or ISR) and hydrate for interactivity.`,
      "technical-seo");
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

// ── site-level rules ─────────────────────────────────────────────────────────
//
// robots.txt, llms.txt and the sitemap reference are read the way security.ts
// reads `_headers`: by filename, wherever in the tree they turned up.

interface RobotsGroup {
  /** As written in the file — a finding should name `GPTBot`, not `gptbot`. */
  agents: string[];
  disallow: string[];
  allow: string[];
  line: number;
}

/**
 * robots.txt as the standard defines it: consecutive `User-agent` lines form
 * one group's agent list, and the first non-agent directive closes it. `#`
 * starts a comment — a commented-out `Disallow: /` is not a rule, and reading
 * it as one would report a site blocked that is not.
 */
function parseRobots(source: string): { groups: RobotsGroup[]; sitemaps: string[] } {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let collectingAgents = false;

  source.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) return;
    const key = m[1].toLowerCase();
    const value = m[2].trim();

    if (key === "user-agent") {
      if (!current || !collectingAgents) {
        current = { agents: [], disallow: [], allow: [], line: i + 1 };
        groups.push(current);
      }
      current.agents.push(value);
      collectingAgents = true;
      return;
    }
    if (key === "sitemap") {
      sitemaps.push(value);
      return;
    }
    collectingAgents = false;
    if (!current) return;
    if (key === "disallow") current.disallow.push(value);
    if (key === "allow") current.allow.push(value);
  });

  return { groups, sitemaps };
}

/**
 * The AI crawlers geo-tactics-checklist §7 and geo-fundamentals §5 name.
 * Bingbot and Googlebot are deliberately absent: blocking those is a search
 * decision with different consequences, and this note is about the AI ones.
 */
const AI_CRAWLERS = [
  "gptbot", "oai-searchbot", "chatgpt-user", "claudebot", "claude-user", "anthropic-ai",
  "perplexitybot", "perplexity-user", "google-extended", "ccbot", "bytespider",
  "applebot-extended", "meta-externalagent", "amazonbot", "cohere-ai", "youbot", "diffbot",
];

const blocksEverything = (g: RobotsGroup): boolean =>
  g.disallow.some((d) => d === "/") && g.allow.length === 0;

export interface SeoConfigOptions {
  /** The scan stopped early, so no absence claim below can be proven. */
  truncated?: boolean;
}

export function seoConfigRules(
  files: Array<{ path: string; source: string }>,
  options: SeoConfigOptions = {},
): LintFinding[] {
  const out: LintFinding[] = [];
  const truncated = options.truncated === true;

  const push = (
    file: string, line: number, severity: LintFinding["severity"],
    rule: string, message: string, fix: string, doc: string,
  ) => out.push({ line, severity, rule, message: `${file}: ${message}`, fix, doc });

  /**
   * An absence claim, demoted to an unconfirmed note when the scan was cut
   * short — the same guard securityConfigRules uses, for the same reason: a
   * capped scan cannot prove absence, and saying it can is the one failure
   * this family of modules refuses.
   */
  const absent = (
    rule: string, severity: LintFinding["severity"],
    message: string, fix: string, doc: string, file = "configuration", line = 1,
  ) => push(file, line, truncated ? "info" : severity, rule,
    truncated
      ? `${message} The scan stopped before reading every file, so this absence is unconfirmed — the declaration may sit in a file that was never opened.`
      : message,
    truncated ? `Re-run on a narrower path to confirm, then: ${fix}` : fix,
    doc);

  // ── robots.txt ─────────────────────────────────────────────────────────────
  const robotsFiles = files.filter((f) => basename(f.path).toLowerCase() === "robots.txt");

  for (const file of robotsFiles) {
    const { groups, sitemaps } = parseRobots(file.source);

    for (const group of groups) {
      if (!blocksEverything(group)) continue;

      if (group.agents.includes("*")) {
        push(file.path, group.line, "error", "robots-blocks-everything",
          `"Disallow: /" under "User-agent: *" tells every crawler to fetch nothing on this host.`,
          `Disallow only the paths that are genuinely private, and never CSS or JS — a renderer needs them.`,
          "technical-seo");
      }

      const ai = group.agents.filter((a) => AI_CRAWLERS.includes(a.toLowerCase()));
      if (ai.length) {
        // Deliberately `info`, and deliberately silent on which way to decide.
        // Blocking an AI crawler is a legitimate business decision — licensing,
        // competitive, a publisher's whole revenue model — and a rule that
        // argues policy has left the ground this module stands on. It states
        // the choice, names its consequence as documented fact, and points at
        // the document that lays out the trade-off.
        push(file.path, group.line, "info", "robots-blocks-ai-crawlers",
          `This robots.txt disallows ${ai.join(", ")} across the whole site. Those crawlers are how the answer engines behind them retrieve and cite pages, so this site's content is outside that surface by design.`,
          `If that is the intent, nothing to do — geo-fundamentals lays out what visibility in AI answers is worth and what it costs, for whenever the decision is revisited.`,
          "geo-fundamentals");
      }
    }

    if (!sitemaps.length) {
      absent("sitemap-not-referenced", "info",
        `robots.txt names no sitemap, so a crawler has to discover every URL by following links.`,
        `Add "Sitemap: https://example.com/sitemap.xml" and submit it in Search Console.`,
        "technical-seo", file.path, 1);
    }
  }

  // ── llms.txt ───────────────────────────────────────────────────────────────
  // Only claimed when a robots.txt was actually read. Without one there is no
  // evidence this scan was pointed at a site root at all, and "/llms.txt is
  // absent" would be a claim about a directory nobody looked in.
  if (robotsFiles.length && !files.some((f) => basename(f.path).toLowerCase() === "llms.txt")) {
    absent("llms-txt-absent", "info",
      `No llms.txt was found beside robots.txt. It is a curated markdown index of a site's key pages, served at /llms.txt.`,
      `Optional and low priority — large-scale tests show no measurable citation lift yet, and geo-tactics-checklist §6 rates it a cheap hedge rather than a tactic. Roughly thirty minutes if you want one.`,
      "geo-tactics-checklist");
  }

  // ── project-level metadata ─────────────────────────────────────────────────
  // See the module header. This runs only when no self-contained document was
  // scanned; when one was, `seoRules` already claimed absence at the only
  // scope where it can be proven, and repeating it here would report one
  // defect twice.
  const pages = files.filter((f) => /\.(?:html?|[jt]sx|astro|svelte|vue)$/i.test(f.path));
  const selfContained = pages.some((f) => isSelfContainedDocument(maskComments(f.source, f.path), f.path));

  if (!selfContained && pages.length) {
    const declared = pages.map((f) => {
      const masked = maskComments(f.source, f.path);
      return declarationsOf(masked, scanTags(masked), f.path);
    });

    if (declared.some((d) => d.surface)) {
      const anywhere = (key: "title" | "description" | "canonical") => declared.some((d) => d[key]?.present);

      if (!anywhere("title")) {
        absent("title-missing", "warning",
          `No file read here declares a page title — no <title>, no metadata export, no head component.`,
          `Give every route a unique title: the topic first, the brand last.`,
          "on-page-seo");
      }
      if (!anywhere("description")) {
        absent("meta-description-missing", "warning",
          `No file read here declares a meta description, so every snippet is written by the engine from whatever text it finds.`,
          `Give every route a unique description: what the page delivers, the differentiator, a soft call to action.`,
          "on-page-seo");
      }
      if (!anywhere("canonical")) {
        absent("canonical-missing", "warning",
          `No file read here declares a canonical URL, so every URL variant of a route — parameters, trailing slash, protocol — is a separate document to a crawler.`,
          `Set a self-referencing canonical per route (in Next.js, metadata.alternates.canonical with metadataBase).`,
          "technical-seo");
      }
    }
  }

  return out.sort((a, b) => a.line - b.line);
}
