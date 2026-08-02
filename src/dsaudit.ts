// Design-system audit: read real stylesheet / component source and measure how
// much of a *system* it actually is. Sprawl is the failure mode this catches —
// nineteen greys that should be four, a radius per component, a shadow per
// card — the thing that makes a UI feel accidental no matter how good each
// screen looks in isolation.
//
// Deterministic and static: it counts what is written, never runs the code.

import { normalizeHex } from "./tokens.js";
import { clusterColors, type ValueUse, type ColorCluster } from "./colorutil.js";

// Re-exported so existing consumers of these types keep working; the maths now
// lives in colorutil.ts and is shared with the screenshot measurement.
export type { ValueUse, ColorCluster };

export interface DimensionReport {
  id: string;
  label: string;
  unique: number;
  /** the count above which this dimension reads as sprawl */
  budget: number;
  values: ValueUse[];
  status: "ok" | "watch" | "sprawl";
  advice: string;
  tool?: string;
}

export interface DesignSystemAudit {
  dimensions: DimensionReport[];
  duplicateColors: ColorCluster[];
  offGridSpacing: ValueUse[];
  tokenUse: { tokens: number; literals: number; ratio: number };
  fontFamilies: ValueUse[];
  /** Focus rings, counted apart from elevation — they are box-shadows but not depth. */
  focusRings: ValueUse[];
  importantCount: number;
  zIndexOutliers: ValueUse[];
  score: number;
}

// ── extraction ───────────────────────────────────────────────────────────────

function tally(values: string[]): ValueUse[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Strip comments so documented examples don't count as usage. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, " ");
}

function toHex(raw: string): string | null {
  const hex = normalizeHex(raw.trim());
  if (hex) return hex.length === 9 ? hex.slice(0, 7) : hex;
  const rgb = raw.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    const c = (n: string) => Math.max(0, Math.min(255, Math.round(parseFloat(n)))).toString(16).padStart(2, "0");
    return `#${c(rgb[1])}${c(rgb[2])}${c(rgb[3])}`;
  }
  return null;
}

function extractColors(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const hex = toHex(m[0]);
    if (hex) out.push(hex);
  }
  for (const m of src.matchAll(/rgba?\([^)]*\)/gi)) {
    const hex = toHex(m[0]);
    if (hex) out.push(hex);
  }
  return out;
}

/** px / rem lengths for one property family, normalized to px for comparison. */
function extractLengths(src: string, props: RegExp): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(props)) {
    const decl = m[0];
    for (const v of decl.matchAll(/(-?[\d.]+)(px|rem|em)\b/g)) {
      const n = parseFloat(v[1]);
      if (!Number.isFinite(n)) continue;
      const px = v[2] === "px" ? n : n * 16;
      out.push(`${+px.toFixed(2)}px`);
    }
  }
  return out;
}

// ── audit ────────────────────────────────────────────────────────────────────

/**
 * True when every layer of a box-shadow has zero offset and zero blur — the
 * shape of a focus ring (`0 0 0 2px …`), not of elevation.
 */
export function isFocusRing(value: string): boolean {
  const layers = value.split(/,(?![^()]*\))/).map((l) => l.trim()).filter(Boolean);
  if (!layers.length) return false;
  return layers.every((layer) => {
    // Strip the colour first: rgba(0,0,0,.25) would otherwise contribute
    // "lengths". A unitless zero is valid CSS, so units are optional here.
    const lengths = [
      ...layer
        .replace(/(rgba?|hsla?|color-mix|var)\([^)]*\)/gi, " ")
        .replace(/#[0-9a-f]{3,8}\b/gi, " ")
        .matchAll(/(-?[\d.]+)(px|rem|em)?/g),
    ].map((m) => parseFloat(m[1]));
    // offset-x, offset-y and blur must all be zero; a spread may follow.
    return lengths.length >= 3 && lengths[0] === 0 && lengths[1] === 0 && lengths[2] === 0;
  });
}

function classify(unique: number, budget: number): DimensionReport["status"] {
  if (unique <= budget) return "ok";
  return unique <= Math.ceil(budget * 1.5) ? "watch" : "sprawl";
}

export function auditDesignSystem(rawSource: string): DesignSystemAudit {
  const src = stripComments(rawSource);

  const colors = tally(extractColors(src));
  const radii = tally(extractLengths(src, /border-radius\s*:[^;{}]+|rounded-\[[^\]]+\]/gi));
  const fontSizes = tally(extractLengths(src, /font-size\s*:[^;{}]+|text-\[[^\]]+\]/gi));
  const spacing = tally(
    extractLengths(src, /(?:^|[;{\s])(?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block))?\s*:[^;{}]+/gi),
  );
  // A focus ring is written as a box-shadow but is not elevation, and counting
  // the two together punishes exactly the codebases that do this properly: a
  // consistent five-level ramp plus a handful of ring states reads as "ten
  // shadows, sprawl". A ring has no offset and no blur — only spread — which
  // separates the two precisely.
  const allShadows = [...src.matchAll(/box-shadow\s*:\s*([^;{}]+)/gi)]
    .map((m) => m[1].trim().replace(/\s+/g, " ").toLowerCase())
    .filter((v) => v && v !== "none");
  const shadows = tally(allShadows.filter((v) => !isFocusRing(v)));
  const focusRings = tally(allShadows.filter(isFocusRing));
  const fontFamilies = tally(
    [...src.matchAll(/font-family\s*:\s*([^;{}]+)/gi)].map((m) => m[1].trim().replace(/\s+/g, " ").replace(/["']/g, "")),
  );

  // Near-duplicate colors: the clearest single signal of an unmanaged palette.
  const duplicateColors = clusterColors(colors);
  const redundantColors = duplicateColors.reduce((n, c) => n + c.drop.length, 0);

  // Spacing that is not a multiple of 4 breaks vertical rhythm.
  const offGridSpacing = spacing.filter((s) => {
    const n = parseFloat(s.value);
    return n > 0 && Math.abs(n % 4) > 0.01;
  });

  const tokens = (src.match(/var\(\s*--[\w-]+/g) ?? []).length;
  const literals = colors.reduce((n, c) => n + c.count, 0) + fontSizes.reduce((n, f) => n + f.count, 0);
  const importantCount = (src.match(/!important/g) ?? []).length;

  const zIndex = tally([...src.matchAll(/z-index\s*:\s*(-?\d+)/gi)].map((m) => m[1]));
  const zIndexOutliers = zIndex.filter((z) => Math.abs(parseInt(z.value, 10)) >= 100);

  const dimensions: DimensionReport[] = [
    {
      id: "color",
      label: "Colors",
      unique: colors.length,
      budget: 14,
      values: colors,
      status: classify(colors.length, 14),
      advice:
        "A managed palette is one brand ramp + one neutral ramp + semantic roles — roughly 10–14 distinct values in the source, everything else derived. Replace raw hexes with tokens.",
      tool: "generate_color_system",
    },
    {
      id: "type",
      label: "Font sizes",
      unique: fontSizes.length,
      budget: 9,
      values: fontSizes,
      status: classify(fontSizes.length, 9),
      advice: "A modular scale has ~8–9 steps. More than that means sizes were chosen per component instead of picked from a scale.",
      tool: "generate_type_scale",
    },
    {
      id: "radius",
      label: "Border radii",
      unique: radii.length,
      budget: 4,
      values: radii,
      status: classify(radii.length, 4),
      advice: "One radius language: a small, a medium, a large, and pill. Mixed radii are the single most common reason a UI reads as accidental.",
      tool: "generate_design_tokens",
    },
    {
      id: "shadow",
      label: "Shadows",
      unique: shadows.length,
      budget: 6,
      values: shadows.slice(0, 12),
      status: classify(shadows.length, 6),
      advice: "Elevation should be a ramp of named levels, not a shadow authored per component. Each level = one token used everywhere.",
      tool: "generate_elevation_system",
    },
    {
      id: "spacing",
      label: "Spacing values",
      unique: spacing.length,
      budget: 12,
      values: spacing,
      status: classify(spacing.length, 12),
      advice: "Spacing should come from one scale (4/8pt). Every off-scale value is a small misalignment the eye notices even when the reader cannot name it.",
      tool: "generate_design_tokens",
    },
  ];

  // Score: start at 100, subtract for each dimension over budget and for the
  // sharper signals (near-duplicate colors, off-grid spacing, !important).
  let score = 100;
  for (const d of dimensions) {
    if (d.status === "watch") score -= 6;
    if (d.status === "sprawl") score -= 14;
  }
  score -= Math.min(15, redundantColors * 4);
  score -= Math.min(10, offGridSpacing.length * 2);
  score -= Math.min(10, Math.floor(importantCount / 2) * 2);
  if (fontFamilies.length > 2) score -= 5;
  score = Math.max(0, Math.min(100, score));

  return {
    dimensions,
    duplicateColors,
    offGridSpacing,
    tokenUse: { tokens, literals, ratio: tokens + literals === 0 ? 0 : +(tokens / (tokens + literals)).toFixed(2) },
    fontFamilies,
    focusRings,
    importantCount,
    zIndexOutliers,
    score,
  };
}

// ── report ───────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<DimensionReport["status"], string> = { ok: "✅", watch: "🟡", sprawl: "🔴" };

function preview(values: ValueUse[], max = 10): string {
  if (values.length === 0) return "_none found_";
  const shown = values.slice(0, max).map((v) => `\`${v.value}\`×${v.count}`).join(" · ");
  return values.length > max ? `${shown} … +${values.length - max} more` : shown;
}

export function designSystemAuditReport(source: string): string {
  if (!source.trim()) {
    return "# Design-system audit\n\nNo source provided. Paste the CSS, Tailwind config, token file, or component source you want measured.";
  }
  const a = auditDesignSystem(source);
  const verdict =
    a.score >= 85 ? "**Systematic.** This reads as one design system."
    : a.score >= 65 ? "**Mostly systematic** — a few dimensions drifted."
    : a.score >= 40 ? "**Drifting.** Values are being chosen per component rather than picked from a scale."
    : "**Ad-hoc.** There is no enforced system here yet; every screen is re-deciding the basics.";

  const out: string[] = [
    "# Design-system audit",
    "",
    `**Consistency score: ${a.score}/100** — ${verdict}`,
    "",
    "| dimension | unique | budget | status |",
    "|---|---|---|---|",
    ...a.dimensions.map((d) => `| ${d.label} | ${d.unique} | ≤ ${d.budget} | ${STATUS_ICON[d.status]} ${d.status} |`),
    "",
  ];

  const problems = a.dimensions.filter((d) => d.status !== "ok");
  if (problems.length) {
    out.push("## Where it drifted", "");
    for (const d of problems) {
      out.push(`### ${STATUS_ICON[d.status]} ${d.label} — ${d.unique} distinct (budget ≤ ${d.budget})`);
      out.push(preview(d.values));
      out.push(`**Fix:** ${d.advice}${d.tool ? ` → call \`${d.tool}\`.` : ""}`, "");
    }
  }

  if (a.duplicateColors.length) {
    const redundant = a.duplicateColors.reduce((n, c) => n + c.drop.length, 0);
    out.push(
      "## Near-duplicate colors",
      "",
      `${redundant} color(s) are indistinguishable from another one already in use. Nobody can see the difference — but each costs a token and guarantees drift:`,
      "",
      ...a.duplicateColors.slice(0, 10).map(
        (c) => `- **Keep \`${c.keep}\`** — replace ${c.drop.map((d) => `\`${d.value}\` (${d.count}× use, Δ${d.distance})`).join(", ")}`,
      ),
      "",
    );
  }

  if (a.offGridSpacing.length) {
    out.push(
      "## Off-grid spacing",
      "",
      `${a.offGridSpacing.length} value(s) are not multiples of 4px: ${preview(a.offGridSpacing)}`,
      "",
      "**Fix:** snap to the nearest step on a 4/8pt scale. Rhythm is felt even when it is not noticed.",
      "",
    );
  }

  const notes: string[] = [];
  notes.push(
    a.tokenUse.tokens === 0
      ? `**Token adoption: 0%** — ${a.tokenUse.literals} literal color/size value(s) and no \`var(--…)\` reference. Generate a token set with \`generate_design_tokens\` and reference it.`
      : `**Token adoption: ${Math.round(a.tokenUse.ratio * 100)}%** — ${a.tokenUse.tokens} token reference(s) vs ${a.tokenUse.literals} literal value(s).`,
  );
  if (a.fontFamilies.length > 2) {
    notes.push(`**${a.fontFamilies.length} font families** — ${preview(a.fontFamilies, 6)}. Two is the working maximum (plus mono for code); more reads as inconsistency. → \`suggest_font_pairing\``);
  }
  if (a.importantCount > 0) {
    notes.push(`**${a.importantCount} \`!important\`** — usually a specificity workaround. Each one makes the next override harder.`);
  }
  if (a.zIndexOutliers.length) {
    notes.push(`**Magic z-index values:** ${preview(a.zIndexOutliers, 6)}. Define a named layer scale (dropdown/sticky/modal/toast) instead.`);
  }
  if (notes.length) out.push("## Notes", "", ...notes.map((n) => `- ${n}`), "");

  out.push(
    "## Consolidation plan",
    "",
    "1. `create_design_system` (or `generate_color_system` + `generate_type_scale` + `generate_elevation_system`) to produce the target scales.",
    "2. `generate_design_tokens` to emit them as CSS variables / Tailwind theme / SwiftUI / Compose.",
    "3. Replace the literals above with token references, mapping each near-duplicate onto the surviving token.",
    "4. Re-run this audit — the unique counts should land inside every budget.",
    "5. `design_lint` on the migrated components to catch hardcoded values that crept back in.",
    "",
    "_Static analysis of the source you pasted: it counts written values and cannot see values computed at runtime or supplied by a framework theme. Budgets are craft heuristics, not standards — a large multi-brand product legitimately exceeds them._",
  );
  return out.join("\n");
}
