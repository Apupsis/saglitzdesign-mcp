// Detects the defaults that generated interfaces reach for.
//
// The governing rule, and the reason this module is small: only facts become
// rules. "`from-indigo-500 to-purple-600` is present" is a fact about the
// source. "The palette is timid" is a judgement, and belongs to
// design_review_checklist, which is honest about being one.
//
// A false positive costs more here than in the security auditor. A developer
// told their deliberate indigo brand is "AI slop" has no external authority to
// check that against — there is no spec to appeal to — so they stop reading the
// output entirely. Every negative test in this module's suite is load-bearing.

import { scanTags, type LintFinding, type Tag } from "./lint.js";
import { maskComments } from "./security.js";

const lineOf = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

const classesOf = (tag: Tag): string => {
  const m = /\b(?:class|className)\s*=\s*("([^"]*)"|'([^']*)'|\{`([^`]*)`\})/i.exec(tag.attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "") : "";
};

// Tailwind's indigo / violet / purple ramps sit adjacent on its scale, so the
// stock gradient is two neighbours from the same region.
//
// Task 1 established two things that shape this. First, v4 authors the palette
// in **OKLCH**, and its docs give hex only as "the nearest hex value" — so a
// hex list can never be more than a convenience match for hand-written CSS,
// and the class-name match is the reliable one. Second, v4 renamed the
// direction utility from `bg-gradient-to-*` to `bg-linear-to-*`; keying on the
// `from-`/`via-`/`to-` stops rather than the direction class means both
// versions are covered without caring which is in use.
//
// Verify these values against tailwindcss.com before changing them; the
// palette moved once already — the list below carries both the v3 hexes
// (`#6366f1` etc., still common in projects that haven't upgraded) and the
// v4 "nearest hex" values Task 1 pulled from the current docs
// (`#615fff` indigo-500, `#4f39f6` indigo-600, `#8e51ff` violet-500,
// `#ad46ff` purple-500, `#9810fa` purple-600).
const DEFAULT_HEXES = /#(6366f1|818cf8|a5b4fc|8b5cf6|7c3aed|a78bfa|a855f7|c084fc|9333ea|d946ef|615fff|4f39f6|8e51ff|ad46ff|9810fa)/i;

// The same region expressed in OKLCH, which is how v4 actually ships it: high
// chroma at a hue angle in the blue-violet band. Matched loosely on the hue
// angle, because the exact triples differ per shade and a project writing its
// own OKLCH is not necessarily copying Tailwind's.
const DEFAULT_OKLCH = /oklch\(\s*0?\.\d+\s+0?\.[12]\d*\s+(2[6-9]\d|3[0-1]\d)(?:\.\d+)?\s*\)/i;

// Inter is on typography-craft's reflex-reject list, which is why this rule
// exists — NOT because a component system ships it as a default. Task 1
// verified that shadcn/ui's documentation names no typeface at all, and that
// its stock theme carries no accent hue (`--primary: oklch(0.205 0 0)`). Do not
// write a message that attributes these faces to any system.
const DEFAULT_FAMILIES = /\b(Inter|Roboto|Open Sans|DM Sans|Plus Jakarta Sans)\b/i;

// Font-family values arrive two shapes: a quoted name (`"Instrument Serif"`,
// possibly nested inside an HTML attribute's own quotes) and an unquoted list
// (`Inter, sans-serif`). Excluding all quote characters from the capture — the
// simplest regex — breaks the first shape entirely, and capturing across a
// bare `;`/`}` boundary without honouring an opening quote over-reads into
// whatever markup follows an inline `style="font-family:'Foo'"` attribute.
// The quoted alternative (backreferenced to its own opening quote) is tried
// first so it wins in both cases; the unquoted alternative falls back to
// stopping at `;`, `}`, or a quote it didn't open.
const FONT_FAMILY_RE = /font-family\s*:\s*(?:(["'])((?:(?!\1)[^\\])*)\1|([^;}"']+))/gi;

/** Emoji that stand in for an icon. Not an exhaustive emoji set — these six. */
const ICON_EMOJI = /[\u{1F680}\u{1F4A1}\u{2728}\u{26A1}\u{1F525}\u{1F3AF}]/u;

const BRAND_PATH = /(landing|marketing|\(marketing\)|home|hero|www)/i;
const CTA_COPY = /(get started|start free|try .{0,24}free|book a demo|request a demo|sign up free)/i;

/**
 * Inter is the right answer in a dense dashboard and the wrong one on a landing
 * page, so the font rule needs to know which it is looking at. Two signals: the
 * path, and an `<h1>` beside call-to-action copy.
 *
 * When neither fires this returns false and the rule stays silent. Warning a
 * dashboard about its font is precisely the false positive that gets the whole
 * report ignored, so ambiguity resolves toward silence.
 */
export function isBrandSurface(code: string, filename?: string): boolean {
  if (filename && BRAND_PATH.test(filename)) return true;
  return /<h1[\s>]/i.test(code) && CTA_COPY.test(code);
}

export function genericVisualRules(code: string, filename?: string): LintFinding[] {
  const masked = maskComments(code, filename ?? "snippet.html");
  const out: LintFinding[] = [];
  const push = (
    index: number,
    severity: LintFinding["severity"],
    rule: string,
    message: string,
    fix: string,
    doc: string,
  ) => out.push({ line: lineOf(code, index), severity, rule, message, fix, doc });

  // ── gradient ───────────────────────────────────────────────────────────────
  // Two different stops from the default region, not one — a single
  // `bg-indigo-500` is a colour choice, not the stock gradient.
  //
  // `blue` and `sky` are not in the core region — they sit one step cooler on
  // Tailwind's own ramp order (…cyan, sky, blue, indigo, violet, purple,
  // fuchsia…) — but ai-default-aesthetic.md measures `blue-500 → purple-600`
  // as one of its three named recurring pairs (42.5° hue, 6.5pt lightness),
  // so a rule that cites that document and cannot see that pair is wrong in a
  // way a plain miss is not. The fix stays narrow: `blue`/`sky` only count
  // when paired with a *core* stop. Two blues alone, or blue reaching to
  // `cyan` (two steps out, never measured in the doc), stay silent — this
  // is not "add blue to the region", it's "an edge of the core region can
  // reach one step into its cooler neighbour".
  const CORE_RAMPS = new Set(["indigo", "violet", "purple", "fuchsia"]);
  const gradientStops = [...masked.matchAll(/\b(?:from|via|to)-((indigo|violet|purple|fuchsia|blue|sky)-\d{3})/g)];
  const distinctStops = new Map<string, string>(gradientStops.map((m) => [m[1], m[2]]));
  const hasCoreStop = [...distinctStops.values()].some((ramp) => CORE_RAMPS.has(ramp));
  if (distinctStops.size >= 2 && hasCoreStop) {
    push(gradientStops[0].index!, "warning", "ai-default-gradient",
      `Gradient built from Tailwind's stock indigo/violet/purple region (${[...distinctStops.keys()].join(" → ")}).`,
      `Pick stops from your own palette, or drop the gradient — see ai-default-aesthetic for why this pair recurs.`,
      "ai-default-aesthetic");
  } else {
    // No blue/sky counterpart here, deliberately. This branch already matches
    // loosely — any two default-region colours found anywhere in the masked
    // source, not two stops of the same gradient() call — because hex/OKLCH
    // carry no from-/via-/to- structure to anchor to. Widening it with a
    // second hue band would mean "a core colour anywhere in the file, plus a
    // blue anywhere in the file, plus a gradient somewhere" fires — e.g. an
    // unrelated blue link colour and an unrelated purple badge, nowhere near
    // each other or the gradient. The class-name branch above can require the
    // adjacency to be a real pairing (both are `from-`/`via-`/`to-` stops);
    // this one cannot without becoming a real parser. Left unmatched rather
    // than approximated.
    const inGradient = /linear-gradient|radial-gradient|conic-gradient/i.test(masked);
    const hexes = [...masked.matchAll(new RegExp(DEFAULT_HEXES.source, "gi"))];
    const oklch = [...masked.matchAll(new RegExp(DEFAULT_OKLCH.source, "gi"))];
    const distinct = new Set([...hexes, ...oklch].map((m) => m[0].toLowerCase()));
    if (inGradient && distinct.size >= 2) {
      const at = (hexes[0] ?? oklch[0]).index!;
      push(at, "warning", "ai-default-gradient",
        `Gradient built from two stops in the stock indigo/violet/purple region.`,
        `Pick stops from your own palette, or drop the gradient.`,
        "ai-default-aesthetic");
    }
  }

  // ── typeface ───────────────────────────────────────────────────────────────
  const families = [...masked.matchAll(FONT_FAMILY_RE)].map((m) => m[2] ?? m[3] ?? "");
  const declared = families.join(" ");
  const onlyDefault =
    families.length > 0 &&
    DEFAULT_FAMILIES.test(declared) &&
    !/["']?[A-Z][A-Za-z0-9 ]{2,}["']?/.test(declared.replace(DEFAULT_FAMILIES, "").replace(/sans-serif|serif|monospace|system-ui|ui-sans-serif|-apple-system|BlinkMacSystemFont|Segoe UI|Helvetica|Arial/gi, ""));
  if (onlyDefault && isBrandSurface(code, filename)) {
    const at = masked.search(DEFAULT_FAMILIES);
    push(at < 0 ? 0 : at, "warning", "default-ui-font",
      `${DEFAULT_FAMILIES.exec(declared)?.[0]} is the only declared family on what looks like a brand surface.`,
      `Pair it with a display face that carries the brand, or replace it — typography-craft lists the faces to reach past.`,
      "typography-craft");
  }

  // ── tags ───────────────────────────────────────────────────────────────────
  const tags = scanTags(masked);
  // Keyed by the class *set*, not the literal string: a class-sorting
  // formatter (e.g. prettier-plugin-tailwindcss) reorders a card's classes
  // without changing what it renders, and a byte-for-byte key would call
  // three reformatted copies of one card three different cards. Sorting the
  // tokens before joining makes the key order-independent while still
  // requiring the exact same set — this is not the fuzzy/partial-overlap
  // comparison the task brief warns off; cards that merely share a few
  // utilities still get different keys and stay unflagged.
  const siblings = new Map<string, { count: number; index: number }>();
  let chromeCount = 0;
  let eyebrowRuns = 0;
  let lastWasEyebrow = false;

  for (const tag of tags) {
    const cls = classesOf(tag);
    const name = tag.name.toLowerCase();

    if (/^h[1-6]$/.test(name)) {
      const body = masked.slice(tag.end, masked.indexOf("<", tag.end + 1));
      if (ICON_EMOJI.test(body)) {
        push(tag.index, "warning", "emoji-as-icon",
          `An emoji is standing in for an icon in a heading.`,
          `Use a real icon from one icon family at one weight — see iconography.`,
          "iconography");
      }
      if (lastWasEyebrow) eyebrowRuns += 1;
      lastWasEyebrow = false;
    }

    if (/\btext-xs\b/.test(cls) && /\buppercase\b/.test(cls) && /\btracking-(wide|wider|widest)\b/.test(cls)) {
      lastWasEyebrow = true;
    }

    if (cls) {
      const classSet = cls.split(/\s+/).filter(Boolean).sort().join(" ");
      const rec = siblings.get(classSet);
      if (rec) rec.count += 1;
      else siblings.set(classSet, { count: 1, index: tag.index });
      if (/\brounded-2xl\b/.test(cls) && /\bshadow-(lg|xl)\b/.test(cls) && /\bborder\b/.test(cls)) chromeCount += 1;
      if (/\bbg-clip-text\b/.test(cls) && /\btext-transparent\b/.test(cls) && /\b(?:from|to)-\w+-\d{3}\b/.test(cls)) {
        push(tag.index, "info", "gradient-text",
          `Gradient-filled text.`,
          `Let the type carry weight on its own; reserve gradient fills for a mark, if at all.`,
          "visual-craft-standards");
      }
      if (/\bbackdrop-blur\b/.test(cls) && /\bbg-white\/(5|10)\b/.test(cls) && /\bborder-white\/10\b/.test(cls)) {
        push(tag.index, "info", "stock-glass-on-dark",
          `The stock glassmorphism recipe: backdrop-blur with white/10 fill and border.`,
          `If the surface needs depth, get it from your elevation scale — see visual-craft-standards.`,
          "visual-craft-standards");
      }
    }
  }

  const repeated = [...siblings.values()].find((r) => r.count >= 3);
  if (repeated) {
    push(repeated.index, "info", "uniform-card-grid",
      `${repeated.count} siblings carry the same class set, so none of them is the primary one.`,
      `Vary size or emphasis to encode importance — a bento grid without hierarchy is a broken grid.`,
      "visual-craft-standards");
  }
  if (chromeCount >= 3) {
    push(0, "info", "stock-card-chrome",
      `The rounded-2xl + shadow-lg + border triad repeats on ${chromeCount} elements.`,
      `Pick one of the three to carry the separation — see ai-default-aesthetic.`,
      "ai-default-aesthetic");
  }
  if (eyebrowRuns >= 3) {
    push(0, "info", "eyebrow-over-every-heading",
      `${eyebrowRuns} headings are each introduced by a small uppercase label.`,
      `Keep the eyebrow where it earns its place; a label on every section is chrome, not structure.`,
      "visual-craft-standards");
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
