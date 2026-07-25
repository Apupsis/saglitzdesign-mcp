// Renders a ScreenshotReport. Two pure functions over the same data, so the
// markdown an agent reads and the HTML a human opens can never disagree.

import type { ScreenshotReport } from "./screenshot.js";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

const pct = (n: number) => `${(n * 100).toFixed(n >= 0.01 ? 1 : 2)}%`;

function unit(r: ScreenshotReport): string {
  return r.source.scale === 1 ? "image px" : `logical px (at ${r.source.scale}× scale)`;
}

export function renderMarkdown(r: ScreenshotReport): string {
  const out: string[] = [
    `# Screenshot measurement — ${r.source.name}`,
    "",
    `${r.source.width}×${r.source.height} image pixels · lengths below are in **${unit(r)}**` +
      (r.source.sampledEveryNth > 1 ? ` · colours sampled every ${r.source.sampledEveryNth}th pixel` : ""),
    "",
    "## Palette",
    "",
    `**${r.palette.significant} significant colour(s)** (≥0.5% of the screen) out of ${r.palette.distinctExact} distinct values.`,
    "",
    "| colour | coverage | merged near-duplicates |",
    "|---|---|---|",
    ...r.palette.clusters.map((c) => `| \`${c.hex}\` | ${pct(c.coverage)} | ${c.members} |`),
    "",
  ];

  out.push("## Contrast", "");
  if (r.contrast.length === 0) {
    out.push("_No foreground/background pair was distinct enough to measure._", "");
  } else {
    out.push(
      "Colour pairs present on the screen. The ratio is exact; whether a pair is genuinely text on that background is not something pixels establish.",
      "",
      "| foreground | background | ratio | AA normal (4.5) | AA large / UI (3.0) |",
      "|---|---|---|---|---|",
      ...r.contrast.map((c) =>
        `| \`${c.fg}\` | \`${c.bg}\` | ${c.ratio.toFixed(2)}:1 | ${c.passesNormal ? "✅" : "❌"} | ${c.passesLarge ? "✅" : "❌"} |`),
      "",
    );
    const failing = r.contrast.filter((c) => !c.passesLarge);
    if (failing.length) {
      out.push(`${failing.length} pair(s) fall below 3:1. Repair one with \`fix_contrast\`.`, "");
    }
  }

  out.push(
    "## Density",
    "",
    `- Dominant colour covers **${pct(r.density.backgroundCoverage)}** of the screen.`,
    `- ${r.density.emptyBands} empty horizontal band(s); the tallest is **${r.density.largestEmptyBand} ${unit(r)}**.`,
    "",
    "## Structure",
    "",
  );

  const s = r.structure;
  if (!s.leftEdges && !s.gaps) {
    out.push("_Nothing crossed the detection threshold — no structural claim is made._", "");
  }
  if (s.leftEdges) {
    const v = s.leftEdges.value;
    out.push(
      v.length === 1
        ? `- **1 left edge detected** at x = ${v[0]} — consistent (confidence: ${s.leftEdges.confidence}).`
        : `- **${v.length} left edges detected** at x = ${v.join(", ")} — they do not agree (confidence: ${s.leftEdges.confidence}).`,
    );
  }
  if (s.gaps) {
    out.push(`- **Vertical gaps detected:** ${s.gaps.value.join(", ")} ${unit(r)} (confidence: ${s.gaps.confidence}).`);
    out.push(
      s.offGridGaps.length
        ? `- ${s.offGridGaps.length} gap(s) are not multiples of 4: ${s.offGridGaps.join(", ")}.`
        : "- Every detected gap is a multiple of 4.",
    );
  }

  out.push(
    "",
    "_Measured from the pixels. Exact values: palette, coverage, contrast ratios, density. Detections carry a confidence level and describe the image, not the interface's meaning. Pair with `design_review_checklist` and `get_design_doc(\"design-critique-scoring\")` for judgement._",
  );
  return out.join("\n");
}
