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
// host: "preconnect" appears exactly twice across `knowledge/`, both times in
// `privacy-consent-and-tracking`, where a `<link rel="preconnect">` to a third
// party is described as *contact* with it — a consent problem added by a
// performance ticket. The remedy the knowledge base does document is the
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

import { type LintFinding } from "./lint.js";
import { scanTags, type Tag, maskComments, elementSpan, flattenTags } from "./scan.js";

const lineOf = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

// Same attribute-boundary reasoning as security.ts and seo.ts: `\b` matches
// inside `data-src`, so an attribute name may only start at the beginning of
// the attribute chunk or after whitespace / the previous value's closing quote.
const ATTR_START = `(?:^|[\\s"'])`;

const hasAttr = (tag: Tag, name: string): boolean =>
  new RegExp(`${ATTR_START}${name}(?=[\\s=/>]|$)`, "i").test(tag.attrs);

/** `{...props}` — the attribute may well be forwarded; don't guess. */
const hasSpread = (tag: Tag): boolean => /\{\s*\.\.\./.test(tag.attrs);

/**
 * An attribute's value, and whether it is *readable*. `loading={eager ?
 * "eager" : "lazy"}` is a declaration whose value only exists at render time;
 * reading one of its branches would be inventing a finding, so it comes back
 * as `{ present: true, value: undefined }` — enough to suppress an absence
 * claim, never enough to grade.
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
 * Font CDNs, named rather than inferred. Every one of these is a host whose
 * only job is serving typefaces, so "this page's fonts come from a third
 * party" is a fact rather than a guess about what a generic CDN is carrying.
 */
const FONT_HOSTS = [
  "fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net", "p.typekit.net",
  "use.fontawesome.com", "fast.fonts.net", "cloud.typography.com", "fonts.bunny.net",
  "cdn.fonts.net", "use.edgefonts.net",
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
function lcpCandidate(masked: string, tags: Tag[]): Tag | null {
  const main = firstSpan(masked, tags, "main");
  if (!main) return null;

  const excluded = [
    ...elementRanges(masked, "header"),
    ...elementRanges(masked, "nav"),
    ...elementRanges(masked, "footer"),
  ];

  const first = tags.find(
    (t) => isImageTag(t.name) && t.index >= main[0] && t.index < main[1] && !inRanges(t.index, excluded),
  );
  if (!first) return null;

  // An unresolved component between the top of `<main>` and this image may be
  // rendering the image that actually comes first. No claim about ordering
  // survives that, so the candidate is withdrawn rather than guessed at.
  const opaqueAbove = tags.some(
    (t) => isOpaqueComponent(t.name) && t.index >= main[0] && t.index < first.index,
  );
  if (opaqueAbove) return null;

  const width = Number(attrValue(first, "width").value);
  if (Number.isFinite(width) && width > 0 && width < HERO_MIN_WIDTH) return null;

  if (visibleText(masked.slice(main[0], first.index)).length > HERO_TEXT_BUDGET) return null;

  return first;
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
  const candidate = lcpCandidate(masked, tags);

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
      `This is the first image inside <main>, above the page's opening copy, which makes it the document's LCP candidate — and it carries loading="lazy", which holds its request back until layout has run. technical-seo's LCP quick wins say the LCP element is never lazy-loaded.`,
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
    push(Math.min(...fontHosts.values()), "info", "third-party-font-host",
      `Fonts are loaded from ${hosts.join(" and ")} — ${hosts.length > 1 ? "third-party font CDNs" : "a third-party font CDN"}. That is an extra DNS lookup, TLS handshake and round trip before the first glyph is requested, and the request itself carries the visitor's IP address to another company.`,
      `seo-for-designers §2 asks for self-hosted WOFF2: download the files, serve them from this origin, subset them to the character sets in use, and preload the primary text face. next/font and Fontsource both automate the download and the CSS.`,
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
  const sized = sizedSelectors(regions);
  const reserved = (tag: Tag): boolean => {
    const classes = classesOf(tag);
    if (utilitySized(classes)) return true;
    if (sized.has("img") && tag.name === "img") return true;
    return classes.split(/\s+/).some((c) => c && sized.has(c));
  };

  for (const tag of tags) {
    if (tag.name !== "img") continue;
    if (hasSpread(tag)) continue;
    // Fire only when there is no dimensional information at all. A
    // width-without-height image is a narrower question than this module can
    // settle from source, and silence is the honest answer to it.
    if (hasAttr(tag, "width") || hasAttr(tag, "height")) continue;
    const style = attrValue(tag, "style");
    if (style.present && (style.value === undefined || /aspect-ratio|height|width/i.test(style.value))) continue;
    if (reserved(tag)) continue;
    // The wrapper that reserves the space, which is where a card, a figure or
    // a media slot normally puts it — `.card__media { aspect-ratio: 16 / 9 }`
    // around an `<img>` filling it. Only the *nearest* enclosing element is
    // considered: an `<html class="h-full">` shell is not a reservation for
    // every image on the page, and treating it as one would silence the rule
    // outright on a great many Tailwind projects.
    const wrapper = nearestWrapper(masked, tags, tag);
    if (wrapper && reserved(wrapper)) continue;
    push(tag.index, "warning", "image-without-dimensions",
      `<img> declares neither width and height nor an aspect-ratio, so nothing in this markup tells the browser the shape of the box before the file arrives and everything below it moves when it does.`,
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

  // ── third-party script origins ─────────────────────────────────────────────
  const thirdParty = new Map<string, number>();
  for (const tag of tags) {
    if (tag.name !== "script") continue;
    const host = hostOf(attrValue(tag, "src").value ?? "");
    if (!host || thirdParty.has(host)) continue;
    thirdParty.set(host, tag.index);
  }
  if (thirdParty.size > THIRD_PARTY_ORIGIN_LIMIT) {
    const hosts = [...thirdParty.keys()].sort();
    push(Math.min(...thirdParty.values()), "info", "third-party-script-count",
      `This document loads scripts from ${hosts.length} third-party origins (${hosts.join(", ")}). Each is a separate connection to open and a separate body of code running on the same main thread the page's own event handlers use.`,
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
 * Class names — and the bare `img` element selector — that the file's own CSS
 * gives a determined box: an `aspect-ratio`, or a `width` and a `height` that
 * are not `auto`. An image sized either way reserves its space correctly
 * without width and height attributes, and reporting it would be flagging the
 * second of the two remedies the cited document itself names.
 *
 * Only the *last* compound of a selector is read, because that is the element
 * the rule sizes. `.card__media img { width: 100%; height: 100% }` sizes the
 * image, not the media slot — collecting `card__media` from it and then
 * looking for that class on the `<img>` is what made this module report the
 * repository's own card recipe, correct and shipped, as a layout-shift defect.
 *
 * Only this file's CSS is read, which is the limit of what can be proven: an
 * image sized by an external stylesheet or a CSS module still fires, because
 * nothing here can see that file.
 */
function sizedSelectors(regions: CssRegion[]): Set<string> {
  const out = new Set<string>();
  const determined = (body: string): boolean =>
    /(?:^|[\s;{])aspect-ratio\s*:/i.test(body)
    || (/(?:^|[\s;{])width\s*:\s*(?!auto)/i.test(body) && /(?:^|[\s;{])height\s*:\s*(?!auto)/i.test(body));

  for (const region of regions) {
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(region.text)) !== null) {
      if (!determined(m[2])) continue;
      for (const selector of m[1].split(",")) {
        const last = selector.trim().split(/[\s>+~]+/).pop() ?? "";
        if (/^img(?![\w-])/i.test(last)) out.add("img");
        for (const cls of last.matchAll(/\.([A-Za-z_][\w-]*)/g)) out.add(cls[1]);
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
