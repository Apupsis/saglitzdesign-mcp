import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

export interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  platform: string;
  tags: string[];
  sources: string[];
  /** ISO date the content was last verified/updated */
  updated: string;
  body: string;
  path: string;
}

/** Minimal frontmatter parser — supports strings, quoted strings and inline arrays. */
function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      meta[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: raw.slice(match[0].length) };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (extname(entry.name) === ".md") out.push(full);
  }
  return out;
}

export function loadKnowledge(rootDir: string): KnowledgeDoc[] {
  const docs: KnowledgeDoc[] = [];
  for (const path of walk(rootDir)) {
    try {
      const raw = readFileSync(path, "utf8");
      const { meta, body } = parseFrontmatter(raw);
      if (!meta.id) continue;
      docs.push({
        id: String(meta.id),
        title: String(meta.title ?? meta.id),
        category: String(meta.category ?? "general"),
        platform: String(meta.platform ?? "both"),
        tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
        sources: Array.isArray(meta.sources) ? (meta.sources as string[]) : [],
        updated: typeof meta.updated === "string" && meta.updated
          ? meta.updated
          : statSync(path).mtime.toISOString().slice(0, 10),
        body: body.trim(),
        path,
      });
    } catch {
      // skip unreadable files
    }
  }
  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Platform values that mean "applies everywhere". A doc marked `cross-platform`
 * (design-tokens-theming, fluent-2) must not disappear when a caller filters by
 * a concrete platform — it applies to that platform too.
 */
const UNIVERSAL_PLATFORMS = new Set(["both", "cross-platform", "all", "any", ""]);

export function platformMatches(docPlatform: string, want?: string): boolean {
  if (!want) return true;
  const p = (docPlatform ?? "").trim().toLowerCase();
  if (UNIVERSAL_PLATFORMS.has(p)) return true;
  return p === want.trim().toLowerCase();
}

/**
 * Pattern docs carry platform-prefixed ids (`mobile-onboarding-paywall`,
 * `web-hero-sections`) while prose and cross-links inside the knowledge base
 * refer to the bare name (`[[onboarding-paywall]]`). Resolve both, in either
 * direction, so a caller never gets a spurious "no such document".
 */
const ID_PREFIXES = ["mobile-", "web-", "ios-", "android-", "macos-"];

export function findDoc(docs: KnowledgeDoc[], id: string): KnowledgeDoc | undefined {
  const key = id.trim().toLowerCase();
  if (!key) return undefined;
  const exact = docs.find((d) => d.id.toLowerCase() === key);
  if (exact) return exact;
  const prefixed = docs.find((d) => ID_PREFIXES.some((p) => d.id.toLowerCase() === p + key));
  if (prefixed) return prefixed;
  const worn = ID_PREFIXES.find((p) => key.startsWith(p));
  if (worn) {
    const bare = key.slice(worn.length);
    const unprefixed = docs.find((d) => d.id.toLowerCase() === bare);
    if (unprefixed) return unprefixed;
  }
  return docs.find((d) => d.title.trim().toLowerCase() === key);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9ğüşıöç]+/)
    .filter((t) => t.length > 1);
}

export interface SearchResult {
  doc: KnowledgeDoc;
  score: number;
  excerpt: string;
}

/** Split a doc body into ## sections; returns [heading, content] pairs. */
export function sections(doc: KnowledgeDoc): Array<{ heading: string; content: string }> {
  const parts = doc.body.split(/^## /m);
  const out: Array<{ heading: string; content: string }> = [];
  for (const part of parts.slice(1)) {
    const nl = part.indexOf("\n");
    out.push({
      heading: part.slice(0, nl === -1 ? undefined : nl).trim(),
      content: nl === -1 ? "" : part.slice(nl + 1).trim(),
    });
  }
  return out;
}

export function searchKnowledge(
  docs: KnowledgeDoc[],
  query: string,
  opts: { category?: string; platform?: string; limit?: number } = {},
): SearchResult[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const results: SearchResult[] = [];

  for (const doc of docs) {
    if (opts.category && doc.category !== opts.category) continue;
    if (!platformMatches(doc.platform, opts.platform)) continue;

    const titleTokens = new Set(tokenize(doc.title + " " + doc.id));
    const tagTokens = new Set(doc.tags.flatMap(tokenize));
    const bodyLower = doc.body.toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (titleTokens.has(term)) score += 8;
      if (tagTokens.has(term)) score += 6;
      const occurrences = bodyLower.split(term).length - 1;
      score += Math.min(occurrences, 10);
    }
    // Exact-id / exact-title queries are a strong intent signal — surface that
    // doc first even if another mentions the term more often in its body.
    const qNorm = query.trim().toLowerCase();
    if (doc.id === qNorm || terms.join("-") === doc.id || doc.title.toLowerCase() === qNorm) score += 20;
    if (score === 0) continue;

    // Best-matching section as excerpt
    let best = { heading: "", content: doc.body.slice(0, 600), hits: -1 };
    for (const sec of sections(doc)) {
      const secLower = (sec.heading + "\n" + sec.content).toLowerCase();
      const hits = terms.reduce((n, t) => n + (secLower.split(t).length - 1), 0);
      if (hits > best.hits) best = { ...sec, hits };
    }
    const excerpt =
      (best.heading ? `## ${best.heading}\n` : "") +
      (best.content.length > 900 ? best.content.slice(0, 900) + "\n…(truncated)" : best.content);

    results.push({ doc, score, excerpt });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, opts.limit ?? 5);
}
