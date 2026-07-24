// Layout system generator: breakpoints, container widths, a column grid,
// container queries and section rhythm — the one foundation the other
// generators (color, type, elevation, motion) left to guesswork.
//
// Opinion baked in: breakpoints belong to the *content*, not to device
// models. The presets below are chosen so a layout changes where a line of
// text gets too long or a card grid gets too narrow, which is why the same
// four numbers keep reappearing across well-built sites.

export type LayoutPreset = "marketing-site" | "web-app" | "docs" | "mobile-first";

export interface LayoutOptions {
  preset?: LayoutPreset;
  /** max width of the readable content column, px */
  maxWidth?: number;
  columns?: number;
  /** gutter between columns, px */
  gutter?: number;
  containerQueries?: boolean;
}

export interface Breakpoint {
  name: string;
  px: number;
  intent: string;
}

export interface LayoutSystem {
  preset: LayoutPreset;
  breakpoints: Breakpoint[];
  containers: Array<{ name: string; px: number }>;
  gutter: number;
  columns: number;
  maxWidth: number;
  edgePadding: Array<{ at: string; px: number }>;
  sectionRhythm: Array<{ name: string; min: number; max: number }>;
}

const BREAKPOINTS: Breakpoint[] = [
  { name: "sm", px: 640, intent: "large phone / small tablet portrait — single column still, but padding and type can grow" },
  { name: "md", px: 768, intent: "tablet portrait — two-column cards become viable" },
  { name: "lg", px: 1024, intent: "tablet landscape / small laptop — sidebars and 3-up grids appear" },
  { name: "xl", px: 1280, intent: "desktop — the design's intended full layout" },
  { name: "2xl", px: 1536, intent: "large desktop — cap the content, grow the margins, do not stretch text" },
];

const PRESETS: Record<LayoutPreset, { maxWidth: number; columns: number; gutter: number; note: string }> = {
  "marketing-site": {
    maxWidth: 1200,
    columns: 12,
    gutter: 24,
    note: "Wide hero/imagery bands, but prose capped near 65ch inside them. Sections do the pacing, not the grid.",
  },
  "web-app": {
    maxWidth: 1440,
    columns: 12,
    gutter: 16,
    note: "Denser gutters, a fixed sidebar outside the grid, and a content area that uses the full remaining width.",
  },
  docs: {
    maxWidth: 1280,
    columns: 12,
    gutter: 32,
    note: "Three zones: nav / prose / on-this-page. Prose column stays at 65–75ch no matter how wide the window gets.",
  },
  "mobile-first": {
    maxWidth: 960,
    columns: 4,
    gutter: 16,
    note: "A 4-column grid that grows to 8 then 12; everything is designed at 375px first and only then allowed to widen.",
  },
};

export function generateLayoutSystem(opts: LayoutOptions = {}): LayoutSystem {
  const preset = opts.preset ?? "marketing-site";
  const base = PRESETS[preset];
  const maxWidth = opts.maxWidth ?? base.maxWidth;
  const columns = opts.columns ?? base.columns;
  const gutter = opts.gutter ?? base.gutter;

  const containers = [
    { name: "sm", px: Math.min(640 - 32, maxWidth) },
    { name: "md", px: Math.min(768 - 48, maxWidth) },
    { name: "lg", px: Math.min(1024 - 64, maxWidth) },
    { name: "xl", px: Math.min(1280 - 96, maxWidth) },
    { name: "2xl", px: maxWidth },
  ];

  return {
    preset,
    breakpoints: BREAKPOINTS,
    containers,
    gutter,
    columns,
    maxWidth,
    edgePadding: [
      { at: "base (< sm)", px: 16 },
      { at: "sm", px: 24 },
      { at: "lg", px: 32 },
      { at: "xl", px: 48 },
    ],
    sectionRhythm: [
      { name: "tight", min: 32, max: 48 },
      { name: "default", min: 48, max: 80 },
      { name: "loose", min: 64, max: 112 },
      { name: "hero", min: 80, max: 160 },
    ],
  };
}

const rem = (px: number) => `${+(px / 16).toFixed(4)}rem`;

function clampBetween(minPx: number, maxPx: number, fromPx = 640, toPx = 1280): string {
  // Linear interpolation between two viewport widths, expressed in vw + rem so
  // it still scales when the user zooms.
  const slope = (maxPx - minPx) / (toPx - fromPx);
  const intercept = minPx - slope * fromPx;
  return `clamp(${rem(minPx)}, ${rem(intercept)} + ${+(slope * 100).toFixed(3)}vw, ${rem(maxPx)})`;
}

function cssBlock(s: LayoutSystem): string {
  const lines = [
    ":root {",
    "  /* breakpoints — for reference in JS/container config; media queries need literals */",
    ...s.breakpoints.map((b) => `  --bp-${b.name}: ${b.px}px;`),
    "",
    "  /* container max-widths */",
    ...s.containers.map((c) => `  --container-${c.name}: ${rem(c.px)};`),
    `  --container-max: ${rem(s.maxWidth)};`,
    "",
    "  /* grid */",
    `  --grid-columns: ${s.columns};`,
    `  --grid-gutter: ${rem(s.gutter)};`,
    "",
    "  /* horizontal breathing room at the viewport edge */",
    "  --edge-padding: 1rem;",
    "",
    "  /* vertical rhythm between sections (fluid) */",
    ...s.sectionRhythm.map((r) => `  --section-${r.name}: ${clampBetween(r.min, r.max)};`),
    "",
    "  /* readable measure — the single most under-used layout constraint */",
    "  --measure: 65ch;",
    "  --measure-narrow: 45ch;",
    "}",
    "",
    "@media (min-width: 640px) { :root { --edge-padding: 1.5rem; } }",
    "@media (min-width: 1024px) { :root { --edge-padding: 2rem; } }",
    "@media (min-width: 1280px) { :root { --edge-padding: 3rem; } }",
    "",
    ".container {",
    "  width: 100%;",
    "  max-width: var(--container-max);",
    "  margin-inline: auto;",
    "  padding-inline: var(--edge-padding);",
    "}",
    "",
    "/* Content-width utility: prose never gets wider than it is readable. */",
    ".prose { max-width: var(--measure); }",
    "",
    ".grid {",
    "  display: grid;",
    "  grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));",
    "  gap: var(--grid-gutter);",
    "}",
    "",
    "/* Auto-fit card grid: no breakpoints needed — items wrap when they must. */",
    ".grid-auto {",
    "  display: grid;",
    "  grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));",
    "  gap: var(--grid-gutter);",
    "}",
    "",
    "/* Vertical rhythm primitives */",
    ".section { padding-block: var(--section-default); }",
    ".stack > * + * { margin-block-start: var(--grid-gutter); }",
    ".cluster { display: flex; flex-wrap: wrap; gap: var(--grid-gutter); align-items: center; }",
  ];
  return lines.join("\n");
}

function containerQueryBlock(s: LayoutSystem): string {
  return [
    "/* Container queries: a component should respond to the space IT has, not",
    "   to the window. This is what lets the same card work in a sidebar and in",
    "   a full-width grid without a variant prop. */",
    ".card-host { container-type: inline-size; container-name: card; }",
    "",
    ".card { display: grid; gap: 0.75rem; }",
    "",
    "@container card (min-width: 24rem) {",
    "  .card { grid-template-columns: 8rem 1fr; align-items: start; }",
    "}",
    "",
    "@container card (min-width: 40rem) {",
    `  .card { grid-template-columns: 12rem 1fr; gap: ${rem(s.gutter)}; }`,
    "}",
  ].join("\n");
}

function tailwindBlock(s: LayoutSystem): string {
  return [
    "/* Tailwind v4 — drop into your CSS entry point */",
    "@theme {",
    ...s.breakpoints.map((b) => `  --breakpoint-${b.name}: ${b.px}px;`),
    "",
    ...s.containers.map((c) => `  --container-${c.name}: ${rem(c.px)};`),
    "",
    ...s.sectionRhythm.map((r) => `  --spacing-section-${r.name}: ${clampBetween(r.min, r.max)};`),
    `  --spacing-gutter: ${rem(s.gutter)};`,
    "}",
  ].join("\n");
}

export function layoutSystemReport(opts: LayoutOptions = {}): string {
  const s = generateLayoutSystem(opts);
  const preset = PRESETS[s.preset];
  const useCQ = opts.containerQueries ?? true;

  const out: string[] = [
    `# Layout system — ${s.preset}`,
    "",
    preset.note,
    "",
    `**Grid:** ${s.columns} columns · ${s.gutter}px gutter · content capped at ${s.maxWidth}px · readable measure 65ch.`,
    "",
    "## Breakpoints",
    "",
    "| name | min-width | what changes here |",
    "|---|---|---|",
    ...s.breakpoints.map((b) => `| \`${b.name}\` | ${b.px}px | ${b.intent} |`),
    "",
    "**Rule:** these are starting points, not a contract. Add a breakpoint where *your* content breaks — a headline wrapping badly, a card grid squeezing below ~280px, a table needing to scroll — and delete any you never used. Never name a breakpoint after a device.",
    "",
    "## Container widths",
    "",
    "| at | container | edge padding |",
    "|---|---|---|",
    ...s.containers.map((c, i) => `| ${c.name} | ${c.px}px | ${s.edgePadding[Math.min(i, s.edgePadding.length - 1)].px}px |`),
    "",
    "## Section rhythm (fluid)",
    "",
    "| token | small screen | large screen |",
    "|---|---|---|",
    ...s.sectionRhythm.map((r) => `| \`--section-${r.name}\` | ${r.min}px | ${r.max}px |`),
    "",
    "Vertical space is what makes a page feel designed. Use these four; do not invent a fifth per section.",
    "",
    "## CSS custom properties",
    "",
    "```css",
    cssBlock(s),
    "```",
    "",
    "## Tailwind v4",
    "",
    "```css",
    tailwindBlock(s),
    "```",
    "",
  ];

  if (useCQ) {
    out.push("## Container queries", "", "```css", containerQueryBlock(s), "```", "");
  }

  out.push(
    "## Rules that matter more than the numbers",
    "",
    "- **Design the narrow case first.** A layout that works at 375px widens gracefully; a desktop layout squeezed down never does.",
    "- **Cap the measure, not the container.** Wide sections are fine; wide *paragraphs* are not — 45–75 characters per line.",
    "- **Prefer intrinsic layout to breakpoints.** `auto-fit` + `minmax()` and container queries remove most media queries outright.",
    "- **One gutter value.** A grid whose gaps vary per section reads as accidental — the same failure `audit_design_system` measures.",
    "- **Grow the margins, not the text.** Past the largest container, add whitespace; do not stretch the content.",
    "- **Respect the safe area** on mobile (`padding: env(safe-area-inset-*)`) and keep interactive targets clear of the edges.",
    "",
    "_Deterministic output. Pair with `generate_type_scale` (the measure), `generate_design_tokens` (emit these as your token set), and `get_design_doc(\"spacing-layout\")` for the reasoning behind the numbers._",
  );
  return out.join("\n");
}
