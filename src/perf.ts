// Performance auditing for pages, components and the stylesheets beside them.
//
// ── The governing rule of this module ────────────────────────────────────────
//
// **These rules audit what is authored, not what is measured.** Core Web
// Vitals are 75th-percentile field data from real visitors on real devices;
// this reads a file. So a rule here may state a fact about the source and pair
// it with a causal link the cited document makes — "the hero image carries
// loading=\"lazy\", which holds its request back until layout has run" — and no
// rule, message or fix may ever assert or imply that a page's LCP, INP or CLS
// is good, bad, passing or failing. A team told from a static read that their
// vitals are fine would stop measuring, which is worse than telling them
// nothing. Every message in this file is written against that line.
//
// ── And the rule this project has now learned four times ─────────────────────
//
// **Only facts become rules.** security.ts and generic.ts between them lost a
// rule outright and took nine repair rounds; seo.ts cut one more before it
// shipped. Every one of those defects was a rule firing on correct work. A
// false positive here does not add noise — it teaches the reader the output is
// unreliable, and the true finding in the next run is skimmed past with the
// rest. Every negative test in this module's suite is load-bearing.
//
// ── `font-host-not-preconnected` is not here, and its absence is deliberate ──
//
// It was specified with `technical-seo` as its document. Neither that document
// nor any other in this knowledge base recommends preconnecting to a font
// host: "preconnect" appears four times across `knowledge/`, in two files and
// never in an SEO or performance one. Twice in `privacy-consent-and-tracking`,
// where a `<link rel="preconnect">` to a third party is described as *contact*
// with it — a consent problem added by a performance ticket — and twice in
// `ai-feature-security`, where it is a request type a CSP has to close. Not
// one of the four recommends it. The remedy the knowledge base does document is the
// opposite one: seo-for-designers §2 says "Self-host WOFF2. Third-party font
// CDNs add a connection." So the connection cost is real and cited, and the
// rule that states it is `third-party-font-host`, which points at self-hosting
// rather than at a resource hint no document here endorses.
//
// This is the same judgement seo.ts made when it cut `og-incomplete`: a rule
// cites a document that exists *and* makes the rule's claim, or it does not
// ship.
//
// ── `lazy-hero`, and the false positive that would have discredited the tool ─
//
// The rule was specified as "loading=\"lazy\" on the first in-document image",
// with "first image" standing in for "the LCP element". On most sites the
// first in-document image is a header logo, and a logo carrying
// loading="lazy" is *correct*. Reporting that at error severity would have
// been this module's first and last finding for most readers.
//
// There is no fact in a source file that identifies the LCP element — it is
// whichever painted element happens to be largest in a real viewport, which
// is a render-time property of a device this tool never sees. So the rule
// does not claim to find it. It fires on two things it can actually establish:
//
//   1. **A contradiction the author wrote themselves** — `loading="lazy"`
//      on the same element as `fetchpriority="high"` or next/image's
//      `priority`. Those are opposite instructions; one of them is wrong
//      whatever the render looks like, and no position heuristic is involved.
//
//   2. **The LCP *candidate*** — the first image inside `<main>`, at the top
//      of the primary content. `<main>` is the anchor because it is the one
//      landmark that means "this document's own content", which structurally
//      excludes a header logo and a nav icon without guessing at either.
//      Four further conditions keep it honest: the image must not sit inside
//      a `<header>`, `<nav>` or `<footer>` nested within main (an article
//      byline avatar); it must not declare a width under 100px (an inline
//      badge or icon); the visible copy preceding it inside `<main>` must be
//      under HERO_TEXT_BUDGET characters, so a documentation page's
//      mid-article diagram — correctly lazy-loaded — is never read as a hero;
//      and no unresolved component may sit above it, because `<Hero />` is
//      almost certainly rendering the image that really comes first.
//
// The cost of that scoping is stated plainly rather than hidden: **a file with
// no `<main>`, or with a component wrapping the top of it, gets no candidate
// and no finding.** A Next.js page whose `<main>` lives in `layout.tsx`, or
// one whose hero is `<Hero />`, is silent here. That is a false negative, and
// this module prefers it to the false positive — but it means `lazy-hero` and
// `hero-no-fetchpriority` do not cover every page, and the report should say
// so rather than let a silent run read as a clean one.

import { type LintFinding, type AuditReport, assembleAuditReport } from "./lint.js";
import {
  scanTags, type Tag, maskComments, elementSpan, flattenTags,
  findAttr, hasAttr as sharedHasAttr, hasSpread as sharedHasSpread,
} from "./scan.js";
import { scanProject, MAX_FILES } from "./project.js";

const lineOf = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

// Attribute reading — the boundary rules, the framework binding forms and the
// spread convention — is `scan.ts`'s job, and this module's private copy of it
// is what taught this codebase that it should be. See the note there.
const hasAttr = (tag: Tag, name: string): boolean => sharedHasAttr(tag.attrs, name);
const hasSpread = (tag: Tag): boolean => sharedHasSpread(tag.attrs);

/**
 * An attribute's value, and whether it is *readable*. `loading={eager ?
 * "eager" : "lazy"}` is a declaration whose value only exists at render time;
 * reading one of its branches would be inventing a finding, so it comes back
 * as `{ present: true, value: undefined }` — enough to suppress an absence
 * claim, never enough to grade. A framework binding (`:loading="lazy"`,
 * `[width]="w"`) is the same case in another syntax: in Vue, `:loading="lazy"`
 * names a variable, and reading it as the literal string would grade a value
 * that is not in the file.
 */
interface AttrValue { present: boolean; value?: string }

const attrValue = (tag: Tag, name: string): AttrValue => {
  // Locate the name in the blanked copy, then read its value from the
  // original at the same offset — the blanking preserves length, so the two
  // stay aligned.
  const at = findAttr(tag.attrs, name);
  if (!at) return { present: false };
  if (at.bound) return { present: true };                     // an expression, not a value
  const after = tag.attrs.slice(at.index + at.length);
  // Quoted, braced, or a bare token. `<img loading=lazy fetchpriority=high>`
  // is valid HTML and is what a minifier emits; not reading it turned this
  // module's only `error` into an `info` telling the author to add the
  // attribute their image already carries. `security.ts` grew the same branch
  // first, and the character class is its.
  const m = /^\s*=\s*("([^"]*)"|'([^']*)'|(\{[^}]*\})|([^\s"'`=<>\\]+))/.exec(after);
  if (!m) return { present: true };                           // valueless
  const raw = m[2] ?? m[3] ?? m[5];
  if (raw === undefined) return { present: true };            // a JSX expression
  if (/\$\{|\{[^}]*\}/.test(raw)) return { present: true };   // interpolated literal
  return { present: true, value: raw };
};

/** Extensions worth reading for page-level performance signals. */
export const PERF_EXTENSIONS = [
  ".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".css", ".scss",
];

const STYLESHEET_FILE = /\.(?:css|scss|sass|less)$/i;

// ── element regions ──────────────────────────────────────────────────────────

/**
 * `[start, end)` of every `<name>…</name>` pair, paired with a stack so a
 * nested `<header>` inside `<main>` closes the inner one first. Written by
 * index rather than by `elementSpan` because these elements repeat and can
 * nest; `elementSpan` answers the single-element question and is used for
 * `<main>` and `<head>`, which do neither.
 */
function elementRanges(masked: string, name: string): Array<[number, number]> {
  const re = new RegExp(`<(/?)${name}(?=[\\s/>])(?:"[^"]*"|'[^']*'|[^>])*>`, "gi");
  const out: Array<[number, number]> = [];
  const open: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    if (m[1] === "/") {
      const start = open.pop();
      if (start !== undefined) out.push([start, m.index]);
    } else if (!m[0].endsWith("/>")) {
      open.push(m.index + m[0].length);
    }
  }
  while (open.length) out.push([open.pop()!, masked.length]);
  return out;
}

const inRanges = (index: number, ranges: Array<[number, number]>): boolean =>
  ranges.some(([start, end]) => index >= start && index < end);

/** The content span of the document's first `<name>` element, if it has one. */
function firstSpan(masked: string, tags: Tag[], name: string): [number, number] | null {
  const tag = tags.find((t) => t.name.toLowerCase() === name);
  return tag ? elementSpan(masked, tag) : null;
}

// ── stylesheet regions ───────────────────────────────────────────────────────

/**
 * `/* … *\/` blanked to spaces, length-preserving. `maskComments` handles this
 * for JS-like files and for `<!-- -->` everywhere, but it deliberately does
 * not treat `/*` as a comment opener in a `.css` file — nor should it, since
 * `//` inside `url(//cdn.example.com/x.woff2)` is a URL rather than a comment.
 * So block comments are masked here, and only inside a region already known
 * to be CSS.
 */
const maskBlockComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

interface CssRegion { start: number; text: string }

/**
 * The CSS in a file: the whole of a stylesheet, or the contents of each
 * `<style>` element in a document or a single-file component. Astro, Svelte
 * and Vue all put their scoped styles in a real `<style>` block, so the same
 * scan covers them.
 *
 * A CSS-in-JS template literal is deliberately out of scope: `styled.div\`…\``
 * interpolates values this module cannot resolve, and a `@font-face` assembled
 * from a variable cannot be proven to lack anything.
 */
function cssRegions(masked: string, path: string): CssRegion[] {
  if (STYLESHEET_FILE.test(path)) return [{ start: 0, text: maskBlockComments(masked) }];
  const out: CssRegion[] = [];
  const re = /<style(?:"[^"]*"|'[^']*'|[^>])*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    const start = m.index + m[0].length;
    const close = masked.toLowerCase().indexOf("</style", start);
    const end = close === -1 ? masked.length : close;
    out.push({ start, text: maskBlockComments(masked.slice(start, end)) });
    re.lastIndex = end;
  }
  return out;
}

/** The `{ … }` block of each `@font-face` rule, at its absolute offset. */
function fontFaceBlocks(region: CssRegion): Array<{ index: number; body: string }> {
  const out: Array<{ index: number; body: string }> = [];
  const re = /@font-face\s*\{/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region.text)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = region.text.length;
    for (let i = open; i < region.text.length; i++) {
      if (region.text[i] === "{") depth++;
      else if (region.text[i] === "}" && --depth === 0) { end = i; break; }
    }
    out.push({ index: region.start + m.index, body: region.text.slice(open, end) });
    re.lastIndex = end;
  }
  return out;
}

// ── URLs ─────────────────────────────────────────────────────────────────────

/** Absolute or protocol-relative; a relative URL is this origin and returns "". */
const hostOf = (url: string): string => {
  const m = /^(?:https?:)?\/\/([^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase().replace(/:\d+$/, "") : "";
};

const basenameOf = (url: string): string =>
  (url.split(/[?#]/)[0].split("/").pop() ?? "").toLowerCase();

/**
 * The last two labels of a host, or three where the second-to-last is one of
 * the common second-level registry labels (`example.co.uk`). Approximate by
 * design — the exact answer is the Public Suffix List, which is a dependency
 * this module will not take — and it errs toward *merging* hosts, which is the
 * direction that avoids a finding rather than invents one.
 */
const REGISTRY_SLD = /^(?:co|com|org|net|ac|gov|edu|mil|sch)$/i;

function registrableDomain(host: string): string {
  if (!host) return "";
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const [sld, tld] = labels.slice(-2);
  const take = REGISTRY_SLD.test(sld) && tld.length <= 3 ? 3 : 2;
  return labels.slice(-take).join(".");
}

/**
 * Font CDNs, named rather than inferred. Every one of these is a host whose
 * only job is serving typefaces, so "this page's fonts come from a third
 * party" is a fact rather than a guess about what a generic CDN is carrying.
 */
const FONT_HOSTS = [
  "fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net", "p.typekit.net",
  "use.fontawesome.com", "fast.fonts.net", "cloud.typography.com", "fonts.bunny.net",
  "cdn.fonts.net", "use.edgefonts.net",
];

/**
 * The hosts whose files may lawfully be served from your own origin. Google
 * Fonts and Bunny serve open-licensed families (OFL/Apache) and Font Awesome
 * ships a self-host distribution, so "download the WOFF2 and serve it
 * yourself" is available advice.
 *
 * The rest are subscription foundries — Adobe Fonts, Monotype, Hoefler — whose
 * licences do not permit redistributing the font files. Telling those readers
 * to self-host is telling them to breach their licence, which is worse than a
 * false positive: it is confident, actionable and wrong. The fix string is
 * gated on this list for exactly that reason.
 */
const SELF_HOSTABLE_FONT_HOSTS = [
  "fonts.googleapis.com", "fonts.gstatic.com", "fonts.bunny.net", "use.fontawesome.com",
];

// ── the LCP candidate ────────────────────────────────────────────────────────

/**
 * The most copy that may precede an image inside `<main>` before it stops
 * being a hero. A hero sits at the top of the primary content, above or
 * beside the opening heading; a documentation diagram sits after the intro
 * that introduces it. This is the line between them, and it is the reason a
 * correctly lazy-loaded mid-article figure stays silent.
 */
const HERO_TEXT_BUDGET = 200;

/** Below this declared width an image is a badge or an icon, not a hero. */
const HERO_MIN_WIDTH = 100;

/**
 * More than this many distinct third-party script origins on one document.
 * Deliberately looser than seo-for-designers §8, which budgets three: this
 * fires where no reasonable reading of "minimise" defends the count, not
 * wherever a page is over the ideal.
 */
const THIRD_PARTY_ORIGIN_LIMIT = 5;

/**
 * An element that renders an image. The lowercase `img`, plus the component
 * convention every framework follows — a capitalised name ending in `Img`,
 * `Image` or `Picture`: next/image's `Image`, Nuxt's `NuxtImg` and
 * `NuxtPicture`, Gatsby's `GatsbyImage` and `StaticImage`, `CldImage`.
 *
 * The list started at `img` and `Image` alone, and a correct Nuxt page paid
 * for it: `<NuxtImg>` was not recognised, so the *second* image in `<main>` —
 * a below-the-fold chart, correctly carrying loading="lazy" — became the LCP
 * candidate and was reported at error severity. Not recognising an image is
 * not a neutral gap; it silently promotes the next one.
 */
const isImageTag = (name: string): boolean =>
  name === "img" || (/^[A-Z]/.test(name) && /(?:Img|Image|Picture)$/.test(name));

/**
 * A component whose markup this module cannot see. `<Hero />` above an
 * `<img loading="lazy">` very probably renders the real hero image, and any
 * position claim made past it is a guess about a file that was never opened.
 */
const isOpaqueComponent = (name: string): boolean =>
  /^[A-Z]/.test(name) && !isImageTag(name);

/** Visible text, with script/style contents and every tag removed. */
const visibleText = (masked: string): string =>
  flattenTags(
    masked
      .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style[\s\S]*?<\/style\s*>/gi, " "),
  ).replace(/\s+/g, " ").trim();

/**
 * The image this document's LCP element is most likely to be, or null when
 * nothing in the source establishes one. See the module header for why the
 * answer is so often null and why that is the right trade.
 */
function lcpCandidate(masked: string, tags: Tag[], css: SizedCss): Tag | null {
  const main = firstSpan(masked, tags, "main");
  if (!main) return null;

  const excluded = [
    ...elementRanges(masked, "header"),
    ...elementRanges(masked, "nav"),
    ...elementRanges(masked, "footer"),
    ...inertRanges(masked),
  ];

  const images = tags.filter((t) => isImageTag(t.name) && !inRanges(t.index, excluded));
  const first = images.find((t) => t.index >= main[0] && t.index < main[1]);
  if (!first) return null;

  // **The general form of the Nuxt defect: skipping an image promotes the next
  // one.** Recognising more component names fixed one cause of skipping; these
  // two withdrawals cover the rest, and both are facts about the source rather
  // than guesses about the render.
  //
  // First: some other image in this document carries the author's own priority
  // marking. They have named the element they want painted first and it is not
  // this one — a `<header class="site-hero">` image with `fetchpriority="high"`
  // above a lazy chart inside `<main>` had this module reporting the chart,
  // with the real answer sitting in the same file. Every image is considered
  // here, including the ones inside the landmarks excluded above, because the
  // marking is the author's statement and its position does not weaken it.
  if (tags.some((t) => isImageTag(t.name) && t !== first && declaresHighPriority(t))) return null;

  // Second: an image above `<main>` that is not in a header, nav or footer —
  // a full-bleed `<section class="hero">` laid out before the primary content.
  // It is painted before anything in `<main>` and may well be the largest
  // thing on screen, so no image inside `<main>` can be called first.
  if (images.some((t) => t.index < main[0])) return null;

  // An unresolved component between the top of `<main>` and this image may be
  // rendering the image that actually comes first. No claim about ordering
  // survives that, so the candidate is withdrawn rather than guessed at.
  const opaqueAbove = tags.some(
    (t) => isOpaqueComponent(t.name) && t.index >= main[0] && t.index < first.index,
  );
  if (opaqueAbove) return null;

  // Small, or named as something small. The width attribute was the only thing
  // read here at first, which missed every image sized in CSS: a 40px byline
  // avatar and a sponsor logo strip both led `<main>` and both were reported
  // at error severity.
  const width = declaredWidth(first, css);
  if (width !== undefined && width < HERO_MIN_WIDTH) return null;
  if (namedDecorative(first) || namedDecorative(nearestWrapper(masked, tags, first))) return null;

  if (visibleText(masked.slice(main[0], first.index)).length > HERO_TEXT_BUDGET) return null;

  return first;
}

/**
 * Containers whose contents are not painted with the page: `<template>` is
 * inert until a script clones it, `<noscript>` renders only when scripting is
 * off (which is where the standard 1×1 tracking pixel lives), and a `<dialog>`
 * is not displayed until it is opened. None of them can hold the LCP element
 * or shift the layout on load.
 */
const inertRanges = (masked: string): Array<[number, number]> => [
  ...elementRanges(masked, "template"),
  ...elementRanges(masked, "noscript"),
  ...elementRanges(masked, "dialog"),
];

/** What the author called it. A logo or an avatar is not a hero, whatever its position. */
const DECORATIVE_NAME =
  /(?:^|[^a-z])(?:avatar|logo|badge|icon|thumb|thumbnail|byline|sponsor|profile-pic)(?![a-z])/i;

const namedDecorative = (tag: Tag | null): boolean => {
  if (!tag) return false;
  const named = `${classesOf(tag)} ${attrValue(tag, "id").value ?? ""}`;
  return DECORATIVE_NAME.test(named);
};

/**
 * A width in CSS pixels the source declares for this element — the `width`
 * attribute, a `width: 40px` in its `style`, or a rule in the file's own CSS
 * matching one of its classes. Percentages and viewport units are not a pixel
 * width and are deliberately not read as one.
 */
function declaredWidth(tag: Tag, css: SizedCss): number | undefined {
  const attr = Number(attrValue(tag, "width").value);
  if (Number.isFinite(attr) && attr > 0) return attr;

  const style = attrValue(tag, "style").value;
  const inline = style ? /(?:^|[\s;])width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(style) : null;
  if (inline) return Number(inline[1]);

  const widths = classesOf(tag).split(/\s+/)
    .map((c) => (c ? css.pixelWidths.get(c) : undefined))
    .filter((w): w is number => w !== undefined);
  return widths.length ? Math.min(...widths) : undefined;
}

/** next/image's `priority` prop compiles to `fetchpriority="high"`. */
const declaresHighPriority = (tag: Tag): boolean =>
  hasAttr(tag, "priority") || (attrValue(tag, "fetchpriority").value ?? "").toLowerCase() === "high";

const isLazy = (tag: Tag): boolean =>
  (attrValue(tag, "loading").value ?? "").toLowerCase() === "lazy";

// ── scripts ──────────────────────────────────────────────────────────────────

/**
 * A `type` that means the element is data or a declaration rather than code
 * the parser has to stop for. `type="module"` is absent on purpose — a module
 * *is* code, but it is deferred by default, which is handled where the rule
 * reads it.
 */
const NON_EXECUTING_TYPE = /^(?:application\/(?:ld\+json|json)|importmap|speculationrules|text\/(?:template|html|x-template))$/i;

// ── the rule set ─────────────────────────────────────────────────────────────

export function perfRules(code: string, filename?: string): LintFinding[] {
  const path = filename ?? "";
  // A commented-out `<script src>` is not a script, and a code sample in a doc
  // comment is not a page. Same masking pass, and the same reasoning, as
  // security.ts and seo.ts.
  const masked = maskComments(code, path);
  const tags = scanTags(masked);
  const regions = cssRegions(masked, path);

  const out: LintFinding[] = [];
  const push = (
    index: number, severity: LintFinding["severity"], rule: string,
    message: string, fix: string, doc: string,
  ) => out.push({ line: lineOf(code, index), severity, rule, message, fix, doc });

  const headSpan = firstSpan(masked, tags, "head");
  const css = sizedSelectors(regions);
  const candidate = lcpCandidate(masked, tags, css);

  // ── the LCP candidate image ────────────────────────────────────────────────

  // 1. The contradiction, which needs no position at all: the author marked
  //    this image as the one to fetch first and also asked for it to be
  //    deferred. Whatever the render looks like, one of the two is wrong.
  const contradictory = tags.filter(
    (t) => isImageTag(t.name) && isLazy(t) && declaresHighPriority(t),
  );
  for (const tag of contradictory) {
    const marker = hasAttr(tag, "fetchpriority") ? `fetchpriority="high"` : "next/image's priority prop";
    push(tag.index, "error", "lazy-hero",
      `<${tag.name}> carries loading="lazy" alongside ${marker}. Those are opposite instructions: one asks the browser to start this request ahead of the queue, the other to hold it back until layout has run and the element is known to be near the viewport.`,
      `Decide which this image is. If it is the hero, drop loading="lazy" and keep the priority marking; if it is below the fold, drop the priority marking and keep loading="lazy".`,
      "technical-seo");
  }

  // 2. The candidate, established structurally — see the module header.
  const candidateLazy = candidate !== null && isLazy(candidate) && !contradictory.includes(candidate);
  if (candidateLazy) {
    push(candidate!.index, "error", "lazy-hero",
      `This is the first image inside <main>, near the top of the primary content, which makes it this document's LCP candidate — and it carries loading="lazy", which holds its request back until layout has run. technical-seo's LCP quick wins say the LCP element is never lazy-loaded.`,
      `If this image is above the fold, remove loading="lazy" and add fetchpriority="high". If it is genuinely below the fold, loading="lazy" is correct and this finding is reading the wrong image — only the render can settle that.`,
      "technical-seo");
  }

  if (candidate && !candidateLazy && !declaresHighPriority(candidate) && !hasSpread(candidate)) {
    push(candidate.index, "info", "hero-no-fetchpriority",
      `This is the first image inside <main>, the document's LCP candidate, and it declares no fetch priority, so the browser requests it in document order behind the stylesheets and scripts above it.`,
      `Add fetchpriority="high" (with next/image, the priority prop) to this one image only — marking several removes the point of it.`,
      "technical-seo");
  }

  // ── CSS background heroes ──────────────────────────────────────────────────
  //
  // Only claimed when the file has a `<head>` of its own: without one, the
  // preload link may sit in a layout this call was never given, and "no
  // preload" would be a claim about a file nobody opened.
  if (headSpan) {
    // A preload whose href cannot be read suppresses the claim entirely — it
    // may well be this image, and guessing otherwise invents the finding.
    const preloads = tags.filter(
      (t) => t.name.toLowerCase() === "link"
        && /\bpreload\b/i.test(attrValue(t, "rel").value ?? "")
        && (attrValue(t, "as").value ?? "").toLowerCase() === "image",
    );
    const unreadablePreload = preloads.some((t) => attrValue(t, "href").value === undefined);
    const preloaded = new Set(preloads.map((t) => basenameOf(attrValue(t, "href").value ?? "")));

    for (const { index, url, name } of backgroundImages(masked, tags, regions)) {
      if (unreadablePreload || preloaded.has(basenameOf(url))) continue;
      push(index, "info", "css-hero-not-preloaded",
        `The hero background ${url} is declared in CSS (${name}), so the browser only discovers it once the stylesheet has downloaded and parsed — the preload scanner never sees it in the HTML.`,
        `Add <link rel="preload" as="image" href="${url}" fetchpriority="high"> to the head, or move the hero to an <img>, which the preload scanner finds on its own.`,
        "technical-seo");
    }
  }

  // ── fonts ──────────────────────────────────────────────────────────────────
  for (const region of regions) {
    for (const block of fontFaceBlocks(region)) {
      // A block assembled from an interpolated value cannot be proven to lack
      // anything — the missing declaration may be in the variable.
      if (/\$\{/.test(block.body)) continue;
      if (/(?:^|[\s;{])font-display\s*:/i.test(block.body)) continue;
      push(block.index, "warning", "font-display-missing",
        `This @font-face declares no font-display, so the text it applies to stays invisible while the file downloads — the FOIT that seo-for-designers §2 says font-display exists to prevent.`,
        `Add font-display: swap; — or optional, when zero layout shift matters more than showing the branded face on a slow connection. Pair swap with a metric-matched fallback (size-adjust, ascent-override) so the swap itself does not reflow the page.`,
        "seo-for-designers");
    }
  }

  // A font host is a *host*, not a hint: this states which origin the fonts
  // come from and what the documented alternative is. Using Google Fonts is a
  // legitimate choice, which is why this is `info` and why the fix describes
  // the trade rather than issuing an instruction.
  const fontHosts = new Map<string, number>();
  const noteFontHost = (url: string, index: number) => {
    const host = hostOf(url);
    if (FONT_HOSTS.includes(host) && !fontHosts.has(host)) fontHosts.set(host, index);
  };
  for (const tag of tags) {
    if (tag.name.toLowerCase() !== "link") continue;
    // Only a link that *loads* something. A `preconnect` or `dns-prefetch` to
    // fonts.gstatic.com beside the stylesheet is the second half of one
    // decision, not a second decision, and reporting both turned the standard
    // two-line Google Fonts snippet into two findings.
    if (!/\b(?:stylesheet|preload)\b/i.test(attrValue(tag, "rel").value ?? "")) continue;
    noteFontHost(attrValue(tag, "href").value ?? "", tag.index);
  }
  for (const region of regions) {
    const re = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(region.text)) !== null) noteFontHost(m[1], region.start + m.index);
  }
  if (fontHosts.size) {
    const hosts = [...fontHosts.keys()].sort();
    const selfHostable = hosts.filter((h) => SELF_HOSTABLE_FONT_HOSTS.includes(h));
    const licensed = hosts.filter((h) => !SELF_HOSTABLE_FONT_HOSTS.includes(h));

    // The advice is split by what the licence actually allows. Telling an
    // Adobe Fonts or Monotype subscriber to "download the files and serve
    // them yourself" is telling them to breach their licence — confident,
    // actionable and wrong, which is worse than saying nothing.
    const fix = selfHostable.length
      ? `seo-for-designers §2 asks for self-hosted WOFF2: download the ${selfHostable.join(" and ")} files, serve them from this origin, subset them to the character sets in use, and preload the primary text face. next/font and Fontsource both automate the download and the CSS.`
      : `Self-hosting is what seo-for-designers §2 asks for, and ${licensed.join(" and ")} ${licensed.length > 1 ? "do" : "does"} not license redistribution of the files, so that is not available here. What is: preload the font CSS, keep the family and weight count to the §8 budget, and set font-display so text is never invisible while the round trip completes.`;

    push(Math.min(...fontHosts.values()), "info", "third-party-font-host",
      `Fonts are loaded from ${hosts.join(" and ")} — ${hosts.length > 1 ? "third-party font CDNs" : "a third-party font CDN"}. That is an extra DNS lookup, TLS handshake and round trip before the first glyph is requested, and the request itself carries the visitor's IP address to another company.`,
      fix,
      "seo-for-designers");
  }

  // ── image dimensions ───────────────────────────────────────────────────────
  //
  // Deliberately restricted to lowercase `<img>`. A capital `<Image>` is
  // next/image or astro:assets, and both emit width and height themselves —
  // next/image requires them as props or takes them from a static import,
  // Astro infers them from the imported asset. Reporting a correct
  // `<Image src={hero} alt="…" />` as dimensionless would be flagging the one
  // component in the ecosystem that cannot ship without dimensions.
  const reserved = (tag: Tag): boolean => {
    const classes = classesOf(tag);
    if (utilitySized(classes)) return true;
    if (tag.name === "img" && css.elements.has("img")) return true;
    return classes.split(/\s+/).some((c) => c && css.classes.has(c));
  };

  const inert = inertRanges(masked);

  for (const tag of tags) {
    if (tag.name !== "img") continue;
    if (hasSpread(tag)) continue;
    // Nothing here is painted with the page: a `<template>` is inert until a
    // script clones it, a `<noscript>` renders only when scripting is off —
    // which is where the standard 1×1 tracking pixel lives — and a `<dialog>`
    // is not displayed until it is opened. None of them shifts the layout on
    // load, which is the whole subject of this rule.
    if (inRanges(tag.index, inert)) continue;
    // Fire only when there is no dimensional information at all. A
    // width-without-height image is a narrower question than this module can
    // settle from source, and silence is the honest answer to it.
    if (hasAttr(tag, "width") || hasAttr(tag, "height")) continue;
    const style = attrValue(tag, "style");
    if (style.present && (style.value === undefined || /aspect-ratio|height|width/i.test(style.value))) continue;
    // An unreadable class is the same case as an unreadable style, and this
    // rule honoured it for one and not the other: `className={styles.cover}`
    // yielded an empty string and the image was reported as unsized, when the
    // CSS module naming it is exactly the file this module admits it cannot
    // see. No readable class, no absence claim.
    const cls = attrValue(tag, "class");
    const cn = attrValue(tag, "className");
    if ((cls.present && cls.value === undefined) || (cn.present && cn.value === undefined)) continue;
    if (reserved(tag)) continue;
    // The wrapper that reserves the space, which is where a card, a figure or
    // a media slot normally puts it — `.card__media { aspect-ratio: 16 / 9 }`
    // around an `<img>` filling it, or `.card__media img { … }` sizing the
    // image through it. Only the *nearest* enclosing element is considered: an
    // `<html class="h-full">` shell is not a reservation for every image on
    // the page, and treating it as one would silence the rule outright on a
    // great many Tailwind projects.
    const wrapper = nearestWrapper(masked, tags, tag);
    if (wrapper && (reserved(wrapper)
      || classesOf(wrapper).split(/\s+/).some((c) => c && css.wrappers.has(c)))) continue;
    push(tag.index, "warning", "image-without-dimensions",
      `<img> declares neither width and height nor an aspect-ratio, so nothing in this file reserves the box before the image arrives, and anything below it can shift when it does.`,
      `Add width and height attributes at the image's intrinsic pixel size — CSS can still resize it with width: 100%; height: auto — or set aspect-ratio on it in CSS. technical-seo asks for this on all images, videos, iframes and embeds.`,
      "technical-seo");
  }

  // ── scripts ────────────────────────────────────────────────────────────────
  //
  // Only inside a real `<head>`: a `<script src>` in a component says nothing
  // about where in the document it lands. An inline script is left alone —
  // the theme-flash guard and the dataLayer initialiser are both correct
  // there, and neither has a network cost to defer.
  if (headSpan) {
    for (const tag of tags) {
      if (tag.name !== "script") continue;
      if (tag.index < headSpan[0] || tag.index >= headSpan[1]) continue;
      const src = attrValue(tag, "src");
      if (!src.present || hasSpread(tag)) continue;
      const type = (attrValue(tag, "type").value ?? "").trim();
      if (NON_EXECUTING_TYPE.test(type) || /^module$/i.test(type)) continue;
      if (hasAttr(tag, "defer") || hasAttr(tag, "async")) continue;
      push(tag.index, "warning", "render-blocking-script",
        `This <script src> in the <head> carries neither defer nor async nor type="module", so the parser stops here — no further HTML is parsed and nothing more is painted — until the file has downloaded and executed.`,
        `Add defer (runs after parsing, in document order) or async (runs the moment it arrives, in no fixed order), or make it type="module", which defers by default. technical-seo asks for non-essential JS to be deferred and critical CSS inlined.`,
        "technical-seo");
    }
  }

  // ── remote script domains ──────────────────────────────────────────────────
  //
  // Counted by *registrable domain*, not by host: six scripts from
  // `a.example.com` … `f.example.com` are one party's infrastructure, and
  // calling them six third parties was both wrong and the kind of wrong a
  // reader can see at a glance.
  //
  // And the message says "remote domains", not "third-party origins". This
  // module reads one file; it does not know which host the document is served
  // from, so it cannot establish that any of these is a third party. What it
  // can establish is that the script is fetched from somewhere else by
  // absolute URL. The reader knows which of them are their own.
  const remote = new Map<string, number>();
  for (const tag of tags) {
    if (tag.name !== "script") continue;
    const domain = registrableDomain(hostOf(attrValue(tag, "src").value ?? ""));
    if (!domain || remote.has(domain)) continue;
    remote.set(domain, tag.index);
  }
  if (remote.size > THIRD_PARTY_ORIGIN_LIMIT) {
    const domains = [...remote.keys()].sort();
    push(Math.min(...remote.values()), "info", "third-party-script-count",
      `This document loads scripts from ${domains.length} distinct remote domains (${domains.join(", ")}). Each is a separate connection to open and a separate body of code running on the same main thread the page's own event handlers use. Some may be your own infrastructure; the rest are third parties.`,
      `technical-seo asks for third-party scripts to be minimised: give each one a named owner and a business reason, drop the ones with neither, and load what survives after first interaction or with defer. seo-for-designers §8 budgets three, all deferred.`,
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

// ── supporting scans ─────────────────────────────────────────────────────────

/**
 * The name the author gave the thing. `css-hero-not-preloaded` cites a
 * document that talks specifically about "CSS background heroes", so the rule
 * only fires where the source itself says hero — in the selector, in the
 * element's class or id, or in the image's own filename. A decorative panel
 * background is nobody's LCP element and is left alone.
 */
const HERO_NAME = /(?:^|[^a-z])(?:hero|banner|masthead|jumbotron|splash|cover)(?![a-z])/i;

/** A URL a browser actually fetches as an image — not a gradient, not a data URI. */
const RASTER_URL = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i;

interface BackgroundImage { index: number; url: string; name: string }

function backgroundImages(masked: string, tags: Tag[], regions: CssRegion[]): BackgroundImage[] {
  const out: BackgroundImage[] = [];
  const seen = new Set<string>();

  const note = (index: number, url: string, name: string) => {
    if (!RASTER_URL.test(url) || url.startsWith("data:")) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ index, url, name });
  };

  const urlRe = /background(?:-image)?\s*:\s*[^;{}]*?url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

  for (const region of regions) {
    let m: RegExpExecArray | null;
    urlRe.lastIndex = 0;
    while ((m = urlRe.exec(region.text)) !== null) {
      const brace = region.text.lastIndexOf("{", m.index);
      if (brace === -1) continue;
      const selector = region.text.slice(region.text.lastIndexOf("}", brace) + 1, brace).trim();
      const url = m[2].trim();
      if (!HERO_NAME.test(selector) && !HERO_NAME.test(basenameOf(url))) continue;
      note(region.start + m.index, url, selector.split(/\s*,\s*/)[0]);
    }
  }

  for (const tag of tags) {
    const style = attrValue(tag, "style").value;
    if (!style) continue;
    urlRe.lastIndex = 0;
    const m = urlRe.exec(style);
    if (!m) continue;
    const url = m[2].trim();
    const named = `${attrValue(tag, "class").value ?? ""} ${attrValue(tag, "id").value ?? ""}`;
    if (!HERO_NAME.test(named) && !HERO_NAME.test(basenameOf(url))) continue;
    note(tag.index, url, `<${tag.name}>`);
  }

  return out;
}

const classesOf = (tag: Tag): string =>
  `${attrValue(tag, "class").value ?? ""} ${attrValue(tag, "className").value ?? ""}`;

/**
 * Tailwind's dimension utilities, which set exactly the CSS properties the
 * cited document asks for — `aspect-video`, `size-32`, or a `w-*` and an `h-*`
 * together. They are named here rather than found in the file's CSS because
 * they never appear in it: the framework generates them, so a scan of the
 * page's own `<style>` sees nothing and would report every correctly sized
 * Tailwind image as unsized. `h-auto` is excluded — it derives the height from
 * the image, which is the thing that is not yet known.
 */
const TW_ASPECT = /(?:^|\s|:)aspect-(?:\[[^\]]*\]|[\w./-]+)/;
const TW_SIZE = /(?:^|\s|:)size-(?:\[[^\]]*\]|[\w./-]+)/;
const TW_WIDTH = /(?:^|\s|:)w-(?:\[[^\]]*\]|[\w./-]+)/;
const TW_HEIGHT = /(?:^|\s|:)h-(?!auto(?:\s|$))(?:\[[^\]]*\]|[\w./-]+)/;

const utilitySized = (classes: string): boolean =>
  TW_ASPECT.test(classes) || TW_SIZE.test(classes)
  || (TW_WIDTH.test(classes) && TW_HEIGHT.test(classes));

/**
 * What the file's own CSS says about the size of things.
 *
 *  • `elements` — element names given a determined box by a *top-level*
 *    selector (`img { aspect-ratio: 3 / 2 }`).
 *  • `classes` — class names given a determined box on the element that
 *    carries them (`.cover { aspect-ratio: 16 / 9 }`).
 *  • `wrappers` — class names whose *descendant* images are sized
 *    (`.card__media img { width: 100%; height: 100% }`). Kept separate from
 *    `elements` because a descendant rule sizes the images under one wrapper,
 *    not every image in the document; folding it into a bare `img` key
 *    silenced the rule file-wide.
 *  • `pixelWidths` — a class's declared px width, so a 40px byline avatar is
 *    known to be small even though nothing says so in the markup.
 *
 * A determined box is an `aspect-ratio`, or a `width` and a `height` that are
 * not `auto`; either reserves the space correctly without width and height
 * attributes, and reporting one would be flagging the second of the two
 * remedies the cited document itself names.
 *
 * Only this file's CSS is read, which is the limit of what can be proven: an
 * image sized by an external stylesheet or a CSS module still fires, because
 * nothing here can see that file.
 */
interface SizedCss {
  elements: Set<string>;
  classes: Set<string>;
  wrappers: Set<string>;
  pixelWidths: Map<string, number>;
}

function sizedSelectors(regions: CssRegion[]): SizedCss {
  const out: SizedCss = {
    elements: new Set(), classes: new Set(), wrappers: new Set(), pixelWidths: new Map(),
  };
  const determined = (body: string): boolean =>
    /(?:^|[\s;{])aspect-ratio\s*:/i.test(body)
    || (/(?:^|[\s;{])width\s*:\s*(?!auto)/i.test(body) && /(?:^|[\s;{])height\s*:\s*(?!auto)/i.test(body));

  for (const region of regions) {
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(region.text)) !== null) {
      const [, selectors, body] = m;
      const px = /(?:^|[\s;{])width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(body);

      for (const selector of selectors.split(",")) {
        const compounds = selector.trim().split(/[\s>+~]+/).filter(Boolean);
        const last = compounds[compounds.length - 1] ?? "";
        const lastClasses = [...last.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((c) => c[1]);

        if (px) for (const cls of lastClasses) out.pixelWidths.set(cls, Number(px[1]));
        if (!determined(body)) continue;

        if (/^img(?![\w-])/i.test(last)) {
          if (compounds.length === 1) {
            out.elements.add("img");
          } else {
            // `.card__media img { … }` — the images under that wrapper.
            for (const part of compounds.slice(0, -1)) {
              for (const cls of part.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.wrappers.add(cls[1]);
            }
          }
        }
        for (const cls of lastClasses) out.classes.add(cls);
      }
    }
  }
  return out;
}

/** Elements that have no closing tag, so they can never wrap anything. */
const VOID_TAGS = new Set([
  "img", "br", "hr", "input", "meta", "link", "source", "track",
  "area", "base", "col", "embed", "param", "wbr",
]);

/** The innermost element enclosing `tag`, or null when it has no wrapper here. */
function nearestWrapper(masked: string, tags: Tag[], tag: Tag): Tag | null {
  let best: Tag | null = null;
  for (const other of tags) {
    if (other.index >= tag.index || other.selfClosing) continue;
    if (VOID_TAGS.has(other.name.toLowerCase())) continue;
    const span = elementSpan(masked, other);
    if (!span || tag.index < span[0] || tag.index >= span[1]) continue;
    if (!best || other.index > best.index) best = other;
  }
  return best;
}

// ── the report ───────────────────────────────────────────────────────────────

/**
 * What this audit structurally cannot see, as a machine-readable list.
 *
 * The first three entries are the ones every auditor in this family owes its
 * reader. The rest are the specific limitations the rules above discovered and
 * disclosed in their own comments — and a limitation disclosed only in a source
 * comment has not reached the person acting on the output. `lazy-hero`'s
 * scoping in particular buys its accuracy with silence, and silence read as a
 * clean bill is the failure that scoping exists to avoid.
 */
export const PERF_NOT_VISIBLE: string[] = [
  "**Nothing here is measured.** Core Web Vitals — LCP, INP, CLS — are 75th-percentile field data from real visitors on real devices. This reads authored signals out of source text, makes no request to your site and renders nothing, so no finding above is a vitals result and no clean run is a vitals verdict. Measure with field data (CrUX, RUM) and profile a real load; this only tells you what the source instructs the browser to do.",
  "**Anything a framework or a server adds at build or request time.** A bundler that splits, preloads or inlines; an image component that generates `srcset` and dimensions; a font a plugin subsets and self-hosts; caching, compression and `Priority` hints set on the response. None of it is in the files that were read.",
  "**Anything that needs the whole site graph.** Broken links, orphan pages, redirect chains, how many bytes a route really ships, and what a third-party script pulls in after it loads. Every finding above is scoped to the file it names.",
  "**Whether an image is above the fold.** Nothing in a source file says which element the browser painted largest, or what fell inside the first viewport — that depends on a viewport, a device and a scroll position this audit never sees. `lazy-hero` and `hero-no-fetchpriority` report the first image inside `<main>` as a *candidate*; whether it is really the one that matters is a judgement the reader has to make.",
  "**`lazy-hero` and `hero-no-fetchpriority` on a page whose hero cannot be located.** They say nothing at all when the file has no `<main>` (a Next.js page whose `<main>` lives in `layout.tsx`), when an unresolved component sits above the first image (`<Hero />` is very likely rendering the image that really comes first), or when more than 200 characters of visible copy precede it inside `<main>` (a mid-article diagram, correctly lazy). Silence from these two rules usually means no candidate could be identified — it is not a verdict on the hero.",
  "**A font loaded through a framework's font loader rather than an `@font-face` block.** `font-display-missing` reads `@font-face` declarations in the file it was given. `next/font`'s `Inter({ subsets: [\"latin\"], display: \"swap\" })`, and the equivalent loaders in other frameworks, generate that block at build time and write none into the source — so this rule never sees them, and a loader call that sets `display` and one that omits it are equally silent here. Check the `display` option on the call itself; a clean run says nothing about it.",
  "**Anything inside `<svelte:head>`.** Every rule that asks whether a tag is in the document head — `render-blocking-script` above all — finds that head by scanning for a `<head>` element, and `<svelte:head>` is not one: `:` is not a tag-name character, so the whole block is invisible to the scanner. A `<script src>` there carrying neither `defer` nor `async` nor `type=\"module\"` draws nothing, while the identical tag in an `.astro`, `.html` or built page fires. On a Svelte or SvelteKit component, read the `<svelte:head>` block by eye.",
  "**Sizing that lives outside the file being read.** `image-without-dimensions` reads `width`/`height` attributes, inline styles, Tailwind sizing utilities, and CSS in the *same* file — a `<style>` block beside the markup, or the stylesheet itself when a `.css` file is what was read. Every file is audited on its own, so an external stylesheet does not size an image even when that stylesheet was scanned in the same run: a `.cover` class sized in `styles.css` still draws the finding on `index.html`. A CSS module reached through `className={styles.cover}` goes the other way — the class is unreadable, so the rule stays silent rather than invent a finding. It errs in both directions here, and the file it names is the one to check.",
];

/**
 * The performance audit for one snippet or a whole project, in both registers.
 *
 * There are no project-level rules here — every performance rule is a fact
 * about one file — so directory mode is the same rules run over every file, and
 * a capped scan costs coverage rather than correctness. It is still reported:
 * a partial audit that reads as a complete one is the failure this whole family
 * of modules is built against.
 */
export function perfReport(input: { source?: string; filename?: string; root?: string }): AuditReport {
  const findings: Array<LintFinding & { file?: string }> = [];
  let scanned: string;

  if (input.root) {
    const scan = scanProject(input.root, PERF_EXTENSIONS);
    // The path rides along as a field; the report folds it into the prose.
    for (const f of scan.files) {
      findings.push(...perfRules(f.source, f.path).map((x) => ({ ...x, file: f.path })));
    }
    scanned = `Scanned ${scan.files.length} files under \`${input.root}\`.`;
    if (scan.hitFileCap) scanned += ` Stopped at the ${MAX_FILES}-file cap — results are partial, and files after it were not read at all.`;
    if (scan.hitByteCap) scanned += ` Stopped at the total-bytes cap — results are partial, and files after it were not read at all.`;
    if (scan.skippedLarge.length) scanned += ` Skipped ${scan.skippedLarge.length} oversized file(s).`;
  } else {
    findings.push(...perfRules(input.source ?? "", input.filename));
    scanned = "Scanned one snippet. Sizing and font rules read only the CSS in this snippet — a separate stylesheet is not resolved here, and passing `path` audits each file on its own rather than joining them.";
  }

  return assembleAuditReport({
    heading: "Performance audit",
    scanned,
    findings,
    preamble: "This audit reads local files only — it makes no request to your site, loads nothing and times nothing. It cannot see:",
    notVisible: PERF_NOT_VISIBLE,
    closing: "A clean result here means the source that was read instructs the browser correctly on these specific points. What the page actually does for a real visitor is a measurement, and this is not one — take it from field data and a profiled load.",
    file: input.root ? undefined : input.filename,
  });
}
