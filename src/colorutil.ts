// Colour maths shared by the CSS audit and the screenshot measurement, so that
// "23 colours in your stylesheet" and "23 colours on your screen" are counted
// by the same rule.

export interface ValueUse { value: string; count: number }
export interface ClusterMember { value: string; count: number; distance: number }
export interface FullCluster { keep: string; members: ClusterMember[]; count: number }
/** dsaudit's shape: only the clusters that absorbed at least one other colour. */
export interface ColorCluster { keep: string; drop: ClusterMember[] }

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/**
 * "Redmean" weighted RGB distance — a cheap, widely used approximation of
 * perceived difference. Range 0 (identical) … ~765 (black vs white).
 *
 * The numeric form exists because the screenshot pass calls this once per
 * pixel; parsing a hex string a few million times is the difference between
 * milliseconds and seconds.
 */
export function rgbDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const rmean = (r1 + r2) / 2;
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
}

export function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbDistance(x.r, x.g, x.b, y.r, y.g, y.b);
}

/** Below this, two colours are the same colour as far as any user is concerned. */
export const INDISTINGUISHABLE = 12;

/**
 * Greedy clustering, most-used colour first: every input colour lands in
 * exactly one cluster, and each cluster keeps the colour that appears most
 * often — the one worth keeping in a consolidation.
 */
export function clusterAll(colors: ValueUse[], threshold = INDISTINGUISHABLE): FullCluster[] {
  const ordered = [...colors].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const clusters: FullCluster[] = [];
  const taken = new Set<string>();
  for (const c of ordered) {
    if (taken.has(c.value)) continue;
    taken.add(c.value);
    const members: ClusterMember[] = [];
    for (const other of ordered) {
      if (taken.has(other.value)) continue;
      const d = colorDistance(c.value, other.value);
      if (d <= threshold) {
        members.push({ value: other.value, count: other.count, distance: +d.toFixed(1) });
        taken.add(other.value);
      }
    }
    members.sort((p, q) => p.distance - q.distance);
    clusters.push({ keep: c.value, members, count: c.count + members.reduce((n, m) => n + m.count, 0) });
  }
  return clusters;
}

export function clusterColors(colors: ValueUse[], threshold = INDISTINGUISHABLE): ColorCluster[] {
  return clusterAll(colors, threshold)
    .filter((c) => c.members.length > 0)
    .map((c) => ({ keep: c.keep, drop: c.members }));
}
