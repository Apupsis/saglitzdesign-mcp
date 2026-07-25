# measure_screenshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tool that measures a real PNG screenshot from its pixels — palette, WCAG contrast, density and structure with confidence levels — and renders the result as a self-contained HTML report the user can open and share.

**Architecture:** Four new modules in a one-way pipeline: `png.ts` decodes to an RGBA8 buffer; `screenshot.ts` measures that buffer into a plain `ScreenshotReport` data object; `report.ts` renders that object to markdown or to a standalone HTML document. `colorutil.ts` holds colour maths shared with the existing `dsaudit.ts`. Both renderers are pure functions of the report, so HTML and markdown can never disagree.

**Tech Stack:** TypeScript (ES2022, Node16 modules), Node ≥20, `node:zlib` (built in), vitest. **No new dependencies** — this is a hard constraint of the project.

## Global Constraints

- **Zero runtime dependencies.** The only permitted imports are `node:*` built-ins and existing `src/*.js` modules. Adding a package fails review.
- **Tests import from `dist/`, not `src/`.** Always `npm run build` before `npx vitest run`. Test helpers written in TypeScript under `tests/` are imported directly (vitest transforms them).
- **ESM with explicit `.js` specifiers.** Import as `./png.js` even though the file is `png.ts`.
- **Every tool goes through the `tool()` wrapper** in `src/index.ts`. Its callback parameter must be typed `(args: any) => unknown`, or destructured args become implicit-any and the build fails.
- **Tools return text, never throw.** Errors are a sentence naming the problem and the fix, in the existing house style.
- **Findings describe the image, never the interface.** `"four left edges detected at x = 16, 17, 24, 24 — confidence: high"` is allowed. `"your buttons are misaligned"` is not. This is the project's positioning and is enforced by review.
- **No finding below its confidence threshold is reported at all.**
- All lengths are **image pixels** unless a `scale` was supplied, in which case logical px are reported and labelled.
- Target version: **0.16.0**. Do not bump the version until the final task.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/colorutil.ts` | **Create.** Redmean colour distance, `INDISTINGUISHABLE` threshold, clustering. Extracted from `dsaudit.ts` so screenshot and CSS audits share one definition of "same colour". |
| `src/dsaudit.ts` | **Modify.** Import the colour maths instead of defining it. Behaviour must not change. |
| `src/png.ts` | **Create.** PNG → `{width, height, data: RGBA8}`. Rejects anything it cannot decode correctly. |
| `src/screenshot.ts` | **Create.** RGBA8 → `ScreenshotReport`. All measurement logic. |
| `src/report.ts` | **Create.** `ScreenshotReport` → markdown / standalone HTML. No measurement logic. |
| `src/index.ts` | **Modify.** Register tool #27, path validation, wire the renderers. |
| `src/prompts.ts` | **Modify.** `critique_screenshot` and `design_review` measure before judging. |
| `tests/helpers/pngFixture.ts` | **Create.** Test-only PNG *encoder* so fixtures have known pixels. |
| `tests/png.test.ts`, `tests/screenshot.test.ts`, `tests/report.test.ts` | **Create.** |
| `tests/colorutil.test.ts` | **Create.** Locks the extracted maths. |
| `tests/dsaudit.test.ts`, `tests/server.test.ts`, `tests/integrity.test.ts`, `tests/prompts.test.ts` | **Modify.** Regression guard + new tool coverage. |

---

### Task 1: Extract the colour maths into `colorutil.ts`

Pure refactor. `audit_design_system` must behave identically afterwards — that is the point of the regression guard.

**Files:**
- Create: `src/colorutil.ts`
- Modify: `src/dsaudit.ts` (remove `hexToRgb`, `colorDistance`, `INDISTINGUISHABLE`, `clusterColors`; import them; re-export the `ColorCluster` type)
- Test: `tests/colorutil.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface ValueUse { value: string; count: number }
  export interface ClusterMember { value: string; count: number; distance: number }
  export interface FullCluster { keep: string; members: ClusterMember[]; count: number }
  export interface ColorCluster { keep: string; drop: ClusterMember[] }
  export const INDISTINGUISHABLE = 12;
  export function hexToRgb(hex: string): { r: number; g: number; b: number };
  export function colorDistance(a: string, b: string): number;
  export function clusterAll(colors: ValueUse[], threshold?: number): FullCluster[];
  export function clusterColors(colors: ValueUse[], threshold?: number): ColorCluster[];
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/colorutil.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { colorDistance, clusterAll, clusterColors, INDISTINGUISHABLE, hexToRgb } from "../dist/colorutil.js";

describe("colour distance", () => {
  it("is zero for identical colours and maximal for black vs white", () => {
    expect(colorDistance("#4f46e5", "#4f46e5")).toBe(0);
    expect(Math.round(colorDistance("#000000", "#ffffff"))).toBe(765);
  });

  it("calls a 1-step difference indistinguishable and a real difference not", () => {
    expect(colorDistance("#ffffff", "#fefefe")).toBeLessThan(INDISTINGUISHABLE);
    expect(colorDistance("#111827", "#4f46e5")).toBeGreaterThan(INDISTINGUISHABLE);
  });

  it("parses hex to rgb", () => {
    expect(hexToRgb("#4f46e5")).toEqual({ r: 79, g: 70, b: 229 });
  });
});

describe("clustering", () => {
  const colors = [
    { value: "#ffffff", count: 100 },
    { value: "#fefefe", count: 10 },
    { value: "#111827", count: 50 },
    { value: "#4f46e5", count: 5 },
  ];

  it("clusterAll returns every colour exactly once, singletons included", () => {
    const all = clusterAll(colors);
    expect(all.map((c) => c.keep).sort()).toEqual(["#111827", "#4f46e5", "#ffffff"]);
    const white = all.find((c) => c.keep === "#ffffff")!;
    expect(white.members.map((m) => m.value)).toEqual(["#fefefe"]);
    expect(white.count).toBe(110); // keep + members
  });

  it("keeps the most-used colour of a cluster", () => {
    const all = clusterAll([{ value: "#fefefe", count: 3 }, { value: "#ffffff", count: 99 }]);
    expect(all).toHaveLength(1);
    expect(all[0].keep).toBe("#ffffff");
  });

  it("clusterColors reports only clusters that absorb something", () => {
    const merged = clusterColors(colors);
    expect(merged).toHaveLength(1);
    expect(merged[0].keep).toBe("#ffffff");
    expect(merged[0].drop[0].value).toBe("#fefefe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/colorutil.test.ts`
Expected: FAIL — cannot resolve `../dist/colorutil.js`.

- [ ] **Step 3: Write the implementation**

Create `src/colorutil.ts`:

```ts
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
 */
export function colorDistance(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const rmean = (x.r + y.r) / 2;
  const dr = x.r - y.r, dg = x.g - y.g, db = x.b - y.b;
  return Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
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
```

- [ ] **Step 4: Rewire `dsaudit.ts`**

In `src/dsaudit.ts`: delete the local `hexToRgb`, `colorDistance`, `INDISTINGUISHABLE` and `clusterColors` definitions and the local `ValueUse` / `ColorCluster` interface declarations. Add at the top, next to the existing `normalizeHex` import:

```ts
import { clusterColors, type ValueUse, type ColorCluster } from "./colorutil.js";
export type { ValueUse, ColorCluster };
```

Leave everything else — `tally`, `auditDesignSystem`, `designSystemAuditReport` — untouched.

- [ ] **Step 5: Run the new test and the regression guard**

Run: `npm run build && npx vitest run tests/colorutil.test.ts tests/dsaudit.test.ts`
Expected: PASS — all colorutil tests pass **and all 11 existing dsaudit tests still pass unchanged**. If any dsaudit test changed behaviour, the extraction is wrong; fix it rather than editing the dsaudit test.

- [ ] **Step 6: Commit**

```bash
git add src/colorutil.ts src/dsaudit.ts tests/colorutil.test.ts
git commit -m "refactor: extract shared colour distance and clustering into colorutil"
```

---

### Task 2: PNG fixture encoder + decode RGB/RGBA, all five filters

**Files:**
- Create: `tests/helpers/pngFixture.ts`, `src/png.ts`
- Test: `tests/png.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  // src/png.ts
  export interface DecodedImage { width: number; height: number; data: Uint8Array } // RGBA8, length = w*h*4
  export class PngError extends Error { readonly code: string }
  export function decodePng(buffer: Buffer): DecodedImage;

  // tests/helpers/pngFixture.ts
  export function encodePng(opts: {
    width: number; height: number; colorType: 0 | 2 | 3 | 4 | 6; bitDepth: number;
    rows: number[][];        // raw sample bytes per row, pre-filter
    filter?: 0 | 1 | 2 | 3 | 4;
    palette?: number[];      // flat RGB triples, colorType 3 only
    trns?: number[];         // per-palette-index alpha, colorType 3 only
    interlace?: 0 | 1;
  }): Buffer;
  ```

- [ ] **Step 1: Write the fixture encoder**

Create `tests/helpers/pngFixture.ts`. This is test-only code; it exists so every fixture has pixels we know exactly.

```ts
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

/** Apply a PNG filter to one scanline. `bpp` is bytes per complete pixel, min 1. */
function applyFilter(type: number, line: number[], prev: number[], bpp: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const x = line[i];
    const a = i >= bpp ? line[i - bpp] : 0;
    const b = prev[i] ?? 0;
    const c = i >= bpp ? prev[i - bpp] ?? 0 : 0;
    let v: number;
    if (type === 0) v = x;
    else if (type === 1) v = x - a;
    else if (type === 2) v = x - b;
    else if (type === 3) v = x - ((a + b) >> 1);
    else {
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v = x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
    out.push(v & 255);
  }
  return out;
}

export function encodePng(opts: {
  width: number; height: number; colorType: 0 | 2 | 3 | 4 | 6; bitDepth: number;
  rows: number[][]; filter?: 0 | 1 | 2 | 3 | 4; palette?: number[]; trns?: number[]; interlace?: 0 | 1;
}): Buffer {
  const { width, height, colorType, bitDepth, rows } = opts;
  const filter = opts.filter ?? 0;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const bpp = Math.max(1, Math.ceil((channels * bitDepth) / 8));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = opts.interlace ?? 0;

  let prev: number[] = new Array(rows[0]?.length ?? 0).fill(0);
  const raw: Buffer[] = [];
  for (const row of rows) {
    raw.push(Buffer.from([filter, ...applyFilter(filter, row, prev, bpp)]));
    prev = row;
  }

  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (opts.palette) parts.push(chunk("PLTE", Buffer.from(opts.palette)));
  if (opts.trns) parts.push(chunk("tRNS", Buffer.from(opts.trns)));
  parts.push(chunk("IDAT", zlib.deflateSync(Buffer.concat(raw))), chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** Convenience: a solid RGB image, useful as a canvas to draw on. */
export function solidRgb(width: number, height: number, rgb: [number, number, number]): number[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => rgb).flat());
}
```

- [ ] **Step 2: Write the failing decoder test**

Create `tests/png.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decodePng } from "../dist/png.js";
import { encodePng } from "./helpers/pngFixture.js";

/** Read pixel (x,y) as a hex string. */
function px(img: { width: number; data: Uint8Array }, x: number, y: number): string {
  const i = (y * img.width + x) * 4;
  return "#" + [0, 1, 2].map((k) => img.data[i + k].toString(16).padStart(2, "0")).join("");
}
function alpha(img: { width: number; data: Uint8Array }, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3];
}

describe("PNG decoding — truecolour", () => {
  const rows = [
    [255, 0, 0, 0, 255, 0, 0, 0, 255],
    [17, 24, 39, 79, 70, 229, 255, 255, 255],
  ];

  it("decodes 8-bit RGB with filter 0", () => {
    const img = decodePng(encodePng({ width: 3, height: 2, colorType: 2, bitDepth: 8, rows }));
    expect([img.width, img.height]).toEqual([3, 2]);
    expect(px(img, 0, 0)).toBe("#ff0000");
    expect(px(img, 0, 1)).toBe("#111827");
    expect(px(img, 1, 1)).toBe("#4f46e5");
    expect(alpha(img, 2, 1)).toBe(255);
  });

  it("decodes identically under every filter type", () => {
    for (const filter of [0, 1, 2, 3, 4] as const) {
      const img = decodePng(encodePng({ width: 3, height: 2, colorType: 2, bitDepth: 8, rows, filter }));
      expect(px(img, 1, 1), `filter ${filter}`).toBe("#4f46e5");
      expect(px(img, 2, 0), `filter ${filter}`).toBe("#0000ff");
    }
  });

  it("decodes 8-bit RGBA and preserves alpha", () => {
    const rgba = [[255, 0, 0, 128, 0, 255, 0, 255]];
    const img = decodePng(encodePng({ width: 2, height: 1, colorType: 6, bitDepth: 8, rows: rgba }));
    expect(px(img, 0, 0)).toBe("#ff0000");
    expect(alpha(img, 0, 0)).toBe(128);
    expect(alpha(img, 1, 0)).toBe(255);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/png.test.ts`
Expected: FAIL — cannot resolve `../dist/png.js`.

- [ ] **Step 4: Write the decoder**

Create `src/png.ts`:

```ts
// Minimal, correct PNG decoder built on node:zlib — no dependencies.
// It decodes what real screenshots actually are (8/16-bit truecolour, greyscale
// and palette, non-interlaced) and refuses everything else with a named code,
// because a wrong pixel silently poisons every measurement downstream.

import zlib from "node:zlib";

export interface DecodedImage { width: number; height: number; data: Uint8Array }

export class PngError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PngError";
    this.code = code;
  }
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
export const MAX_PIXELS = 40_000_000;
export const MAX_BYTES = 25 * 1024 * 1024;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(buffer: Buffer): DecodedImage {
  if (buffer.length > MAX_BYTES) {
    throw new PngError("too-large", `Image is ${(buffer.length / 1048576).toFixed(1)} MB; the limit is 25 MB.`);
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    throw new PngError("jpeg-unsupported", "This is a JPEG. Only PNG is supported — re-save or export the screenshot as PNG.");
  }
  if (buffer.length < 8 || SIGNATURE.some((b, i) => buffer[i] !== b)) {
    throw new PngError("not-png", "This file is not a PNG (the PNG signature is missing).");
  }

  let ihdr: Buffer | null = null, plte: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  let off = 8;
  while (off + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(off);
    const type = buffer.toString("ascii", off + 4, off + 8);
    const start = off + 8;
    if (start + len + 4 > buffer.length) throw new PngError("corrupt", "The PNG is truncated.");
    const data = buffer.subarray(start, start + len);
    if (type === "IHDR") ihdr = Buffer.from(data);
    else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    else if (type === "IEND") break;
    off = start + len + 4;
  }
  if (!ihdr || ihdr.length < 13) throw new PngError("corrupt", "The PNG has no valid header chunk.");
  if (idat.length === 0) throw new PngError("corrupt", "The PNG has no image data.");

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];

  if (width <= 0 || height <= 0) throw new PngError("corrupt", "The PNG reports a zero dimension.");
  if (width * height > MAX_PIXELS) {
    throw new PngError("too-large", `Image is ${width}×${height}; the limit is 40 megapixels.`);
  }
  if (interlace !== 0) {
    throw new PngError("interlace-unsupported", "Interlaced (Adam7) PNGs are not supported — re-save without interlacing.");
  }
  const channels = CHANNELS[colorType];
  if (!channels) throw new PngError("corrupt", `Unknown PNG colour type ${colorType}.`);
  const depthOk = colorType === 3 ? [1, 2, 4, 8].includes(bitDepth) : [8, 16].includes(bitDepth);
  if (!depthOk) {
    throw new PngError("bitdepth-unsupported", `Bit depth ${bitDepth} is not supported for colour type ${colorType}.`);
  }
  if (colorType === 3 && !plte) throw new PngError("corrupt", "A palette PNG is missing its palette chunk.");

  let inflated: Buffer;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    throw new PngError("corrupt", "The PNG image data could not be decompressed.");
  }

  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  if (inflated.length < height * (stride + 1)) throw new PngError("corrupt", "The PNG image data is shorter than its header claims.");

  // Un-filter in place, scanline by scanline.
  const raw = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const ft = inflated[y * (stride + 1)];
    const line = Buffer.from(inflated.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (ft === 1) line[i] = (line[i] + a) & 255;
      else if (ft === 2) line[i] = (line[i] + b) & 255;
      else if (ft === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (ft === 4) line[i] = (line[i] + paeth(a, b, c)) & 255;
      else if (ft !== 0) throw new PngError("corrupt", `Unknown PNG filter type ${ft}.`);
    }
    line.copy(raw, y * stride);
    prev = line;
  }

  // Expand to RGBA8.
  const data = new Uint8Array(width * height * 4);
  const step = bitDepth === 16 ? 2 : 1; // 16-bit: keep the high byte
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      let r = 0, g = 0, b = 0, a = 255;
      if (colorType === 3) {
        const idx = readSubByte(raw, y * stride, x, bitDepth);
        r = plte![idx * 3] ?? 0; g = plte![idx * 3 + 1] ?? 0; b = plte![idx * 3 + 2] ?? 0;
        a = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        const base = y * stride + x * channels * step;
        if (colorType === 0) { r = g = b = raw[base]; }
        else if (colorType === 4) { r = g = b = raw[base]; a = raw[base + step]; }
        else if (colorType === 2) { r = raw[base]; g = raw[base + step]; b = raw[base + 2 * step]; }
        else { r = raw[base]; g = raw[base + step]; b = raw[base + 2 * step]; a = raw[base + 3 * step]; }
      }
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
    }
  }
  return { width, height, data };
}

/** Extract the x-th sample of a sub-byte-packed scanline (bit depths 1, 2, 4). */
function readSubByte(raw: Buffer, rowStart: number, x: number, bitDepth: number): number {
  if (bitDepth === 8) return raw[rowStart + x];
  const perByte = 8 / bitDepth;
  const byte = raw[rowStart + Math.floor(x / perByte)];
  const shift = 8 - bitDepth * ((x % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/png.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/png.ts tests/png.test.ts tests/helpers/pngFixture.ts
git commit -m "feat: pure-Node PNG decoder for truecolour images"
```

---

### Task 3: Decode greyscale, palette and 16-bit

**Files:**
- Modify: `tests/png.test.ts`
- Test: same file (the decoder from Task 2 already handles these; this task proves it and fixes whatever it gets wrong)

**Interfaces:**
- Consumes: `decodePng` and `encodePng` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append to `tests/png.test.ts`:

```ts
describe("PNG decoding — other colour types", () => {
  it("decodes 8-bit greyscale by replicating the channel", () => {
    const img = decodePng(encodePng({ width: 2, height: 1, colorType: 0, bitDepth: 8, rows: [[0, 255]] }));
    expect(px(img, 0, 0)).toBe("#000000");
    expect(px(img, 1, 0)).toBe("#ffffff");
  });

  it("decodes greyscale + alpha", () => {
    const img = decodePng(encodePng({ width: 2, height: 1, colorType: 4, bitDepth: 8, rows: [[128, 64, 200, 255]] }));
    expect(px(img, 0, 0)).toBe("#808080");
    expect(alpha(img, 0, 0)).toBe(64);
    expect(alpha(img, 1, 0)).toBe(255);
  });

  it("resolves 8-bit palette indices through PLTE", () => {
    const img = decodePng(encodePng({
      width: 3, height: 1, colorType: 3, bitDepth: 8, rows: [[0, 1, 2]],
      palette: [17, 24, 39, 79, 70, 229, 255, 255, 255],
    }));
    expect(px(img, 0, 0)).toBe("#111827");
    expect(px(img, 1, 0)).toBe("#4f46e5");
    expect(px(img, 2, 0)).toBe("#ffffff");
  });

  it("applies tRNS alpha to palette entries", () => {
    const img = decodePng(encodePng({
      width: 2, height: 1, colorType: 3, bitDepth: 8, rows: [[0, 1]],
      palette: [255, 0, 0, 0, 0, 255], trns: [0, 200],
    }));
    expect(alpha(img, 0, 0)).toBe(0);
    expect(alpha(img, 1, 0)).toBe(200);
  });

  it("unpacks sub-byte palette depths", () => {
    // bitDepth 4 → two indices per byte: 0x01 = indices 0 then 1
    const img = decodePng(encodePng({
      width: 2, height: 1, colorType: 3, bitDepth: 4, rows: [[0x01]],
      palette: [17, 24, 39, 255, 255, 255],
    }));
    expect(px(img, 0, 0)).toBe("#111827");
    expect(px(img, 1, 0)).toBe("#ffffff");
  });

  it("reduces 16-bit samples to 8 by keeping the high byte", () => {
    // one RGB pixel: r=0x1122, g=0x3344, b=0x5566 → #113355
    const img = decodePng(encodePng({
      width: 1, height: 1, colorType: 2, bitDepth: 16, rows: [[0x11, 0x22, 0x33, 0x44, 0x55, 0x66]],
    }));
    expect(px(img, 0, 0)).toBe("#113355");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run build && npx vitest run tests/png.test.ts`
Expected: PASS. If the sub-byte or 16-bit case fails, the bug is in `readSubByte` or the `step` handling in `decodePng` — fix `src/png.ts`, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/png.ts tests/png.test.ts
git commit -m "test: cover greyscale, palette, tRNS, sub-byte and 16-bit PNG decoding"
```

---

### Task 4: Rejection paths

Every unsupported input must fail with its documented code rather than produce wrong pixels.

**Files:**
- Modify: `tests/png.test.ts`

**Interfaces:**
- Consumes: `PngError` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append to `tests/png.test.ts` (add `PngError` to the import from `../dist/png.js`):

```ts
describe("PNG decoding — refusals", () => {
  const expectCode = (fn: () => unknown, code: string) => {
    try {
      fn();
    } catch (e) {
      expect((e as { code?: string }).code, `expected code ${code}`).toBe(code);
      return;
    }
    throw new Error(`expected a PngError with code ${code}, but nothing was thrown`);
  };

  it("names a JPEG specifically", () => {
    expectCode(() => decodePng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "jpeg-unsupported");
  });

  it("rejects a non-PNG", () => {
    expectCode(() => decodePng(Buffer.from("not an image at all")), "not-png");
  });

  it("rejects interlaced PNGs instead of decoding them wrongly", () => {
    const buf = encodePng({ width: 2, height: 1, colorType: 2, bitDepth: 8, rows: [[1, 2, 3, 4, 5, 6]], interlace: 1 });
    expectCode(() => decodePng(buf), "interlace-unsupported");
  });

  it("rejects an unsupported bit depth", () => {
    const buf = encodePng({ width: 2, height: 1, colorType: 2, bitDepth: 4, rows: [[1, 2, 3]] });
    expectCode(() => decodePng(buf), "bitdepth-unsupported");
  });

  it("rejects a truncated file", () => {
    const good = encodePng({ width: 2, height: 1, colorType: 2, bitDepth: 8, rows: [[1, 2, 3, 4, 5, 6]] });
    expectCode(() => decodePng(good.subarray(0, good.length - 12)), "corrupt");
  });

  it("carries a human-readable message alongside the code", () => {
    try {
      decodePng(Buffer.from([0xff, 0xd8, 0xff]));
    } catch (e) {
      expect((e as Error).message).toMatch(/PNG/);
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run build && npx vitest run tests/png.test.ts`
Expected: PASS — all refusal tests. If the truncation test passes silently, tighten the length guard in `decodePng`.

- [ ] **Step 3: Commit**

```bash
git add src/png.ts tests/png.test.ts
git commit -m "test: PNG decoder refuses unsupported input with named codes"
```

---

### Task 5: Palette and density measurement

**Files:**
- Create: `src/screenshot.ts`
- Test: `tests/screenshot.test.ts`

**Interfaces:**
- Consumes: `DecodedImage` (Task 2), `clusterAll` / `ValueUse` (Task 1).
- Produces:
  ```ts
  export interface Detection<T> { value: T; confidence: "high" | "medium"; support: number }
  export interface ScreenshotReport {
    source: { name: string; width: number; height: number; scale: number; sampledEveryNth: number };
    palette: { clusters: Array<{ hex: string; coverage: number; members: number }>; distinctExact: number; significant: number };
    contrast: Array<{ fg: string; bg: string; ratio: number; passesNormal: boolean; passesLarge: boolean; fgCoverage: number }>;
    density: { backgroundCoverage: number; largestEmptyBand: number; emptyBands: number };
    structure: { leftEdges: Detection<number[]> | null; gaps: Detection<number[]> | null; offGridGaps: number[] };
  }
  export interface MeasureOptions { name?: string; scale?: 1 | 2 | 3; maxColors?: number }
  export function measure(img: DecodedImage, opts?: MeasureOptions): ScreenshotReport;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/screenshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decodePng } from "../dist/png.js";
import { measure } from "../dist/screenshot.js";
import { encodePng } from "./helpers/pngFixture.js";

/**
 * Build a canvas of a known background with coloured rectangles drawn on it,
 * so every measured number has a known correct answer.
 */
function canvas(width: number, height: number, bg: [number, number, number],
                rects: Array<{ x: number; y: number; w: number; h: number; rgb: [number, number, number] }>) {
  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const hit = rects.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      row.push(...(hit ? hit.rgb : bg));
    }
    rows.push(row);
  }
  return decodePng(encodePng({ width, height, colorType: 2, bitDepth: 8, rows }));
}

const WHITE: [number, number, number] = [255, 255, 255];
const INK: [number, number, number] = [17, 24, 39];      // #111827
const BRAND: [number, number, number] = [79, 70, 229];    // #4f46e5

describe("palette measurement", () => {
  it("reports the dominant colour and its coverage exactly", () => {
    const img = canvas(100, 100, WHITE, [{ x: 0, y: 0, w: 10, h: 10, rgb: INK }]);
    const r = measure(img, { name: "test.png" });
    expect(r.palette.clusters[0].hex).toBe("#ffffff");
    expect(r.palette.clusters[0].coverage).toBeCloseTo(0.99, 2);
    expect(r.palette.clusters[1].hex).toBe("#111827");
    expect(r.palette.clusters[1].coverage).toBeCloseTo(0.01, 3);
  });

  it("counts exact colours and significant ones separately", () => {
    const img = canvas(100, 100, WHITE, [
      { x: 0, y: 0, w: 10, h: 10, rgb: INK },
      { x: 20, y: 0, w: 10, h: 10, rgb: BRAND },
      { x: 40, y: 0, w: 1, h: 1, rgb: [1, 2, 3] }, // 0.01% — below the significance floor
    ]);
    const r = measure(img);
    expect(r.palette.distinctExact).toBe(4);
    expect(r.palette.significant).toBe(3); // the 1px colour is not significant
  });

  it("merges indistinguishable colours into one cluster", () => {
    const img = canvas(100, 100, WHITE, [{ x: 0, y: 0, w: 50, h: 50, rgb: [254, 254, 254] }]);
    const r = measure(img);
    expect(r.palette.distinctExact).toBe(2);
    expect(r.palette.clusters).toHaveLength(1);
    expect(r.palette.clusters[0].members).toBe(1);
  });

  it("records the source dimensions and scale", () => {
    const img = canvas(40, 20, WHITE, []);
    const r = measure(img, { name: "shot.png", scale: 2 });
    expect(r.source).toMatchObject({ name: "shot.png", width: 40, height: 20, scale: 2 });
  });
});

describe("density measurement", () => {
  it("reports background coverage and empty bands", () => {
    // two 10px-tall bars with a 30px gap between them
    const img = canvas(100, 100, WHITE, [
      { x: 10, y: 10, w: 80, h: 10, rgb: INK },
      { x: 10, y: 50, w: 80, h: 10, rgb: INK },
    ]);
    const r = measure(img);
    expect(r.density.backgroundCoverage).toBeCloseTo(0.84, 2);
    expect(r.density.largestEmptyBand).toBe(40); // rows 60..99
    expect(r.density.emptyBands).toBe(3);        // 0..9, 20..49, 60..99
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/screenshot.test.ts`
Expected: FAIL — cannot resolve `../dist/screenshot.js`.

- [ ] **Step 3: Write the implementation**

Create `src/screenshot.ts`:

```ts
// Measurement engine. Everything here is either an exact count over the pixel
// buffer or a detection carrying a confidence level. Nothing here claims to
// know what an element *is* — that is not something pixels establish.

import type { DecodedImage } from "./png.js";
import { clusterAll, colorDistance, type ValueUse } from "./colorutil.js";
import { contrastRatio } from "./a11y.js";

export interface Detection<T> { value: T; confidence: "high" | "medium"; support: number }

export interface ScreenshotReport {
  source: { name: string; width: number; height: number; scale: number; sampledEveryNth: number };
  palette: { clusters: Array<{ hex: string; coverage: number; members: number }>; distinctExact: number; significant: number };
  contrast: Array<{ fg: string; bg: string; ratio: number; passesNormal: boolean; passesLarge: boolean; fgCoverage: number }>;
  density: { backgroundCoverage: number; largestEmptyBand: number; emptyBands: number };
  structure: { leftEdges: Detection<number[]> | null; gaps: Detection<number[]> | null; offGridGaps: number[] };
}

export interface MeasureOptions { name?: string; scale?: 1 | 2 | 3; maxColors?: number }

const SAMPLE_BUDGET = 2_000_000;
const SIGNIFICANT = 0.005;     // ≥0.5% of the screen
const BACKGROUND_MIN = 0.15;   // a background covers at least 15%
const FOREGROUND_MAX = 0.15;
const FOREGROUND_MIN = 0.0005;
const EDGE_THRESHOLD = 24;
const SUPPORT_HIGH = 0.25;
const SUPPORT_MEDIUM = 0.10;
const ROW_EMPTY_RATIO = 0.99;

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

export function measure(img: DecodedImage, opts: MeasureOptions = {}): ScreenshotReport {
  const { width, height, data } = img;
  const scale = opts.scale ?? 1;
  const maxColors = opts.maxColors ?? 12;
  const total = width * height;
  const everyNth = Math.max(1, Math.ceil(total / SAMPLE_BUDGET));

  // ── palette ───────────────────────────────────────────────────────────────
  const counts = new Map<number, number>();
  let sampled = 0;
  for (let p = 0; p < total; p += everyNth) {
    const i = p * 4;
    if (data[i + 3] < 16) continue; // effectively transparent
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
    sampled++;
  }
  const tally: ValueUse[] = [...counts].map(([key, count]) => ({
    value: toHex((key >> 16) & 255, (key >> 8) & 255, key & 255),
    count,
  }));
  const clusters = clusterAll(tally)
    .map((c) => ({ hex: c.keep, coverage: sampled ? c.count / sampled : 0, members: c.members.length }))
    .sort((a, b) => b.coverage - a.coverage);

  const palette = {
    clusters: clusters.slice(0, maxColors),
    distinctExact: tally.length,
    significant: clusters.filter((c) => c.coverage >= SIGNIFICANT).length,
  };

  // ── contrast ──────────────────────────────────────────────────────────────
  const backgrounds = clusters.filter((c) => c.coverage >= BACKGROUND_MIN);
  const foregrounds = clusters.filter((c) => c.coverage >= FOREGROUND_MIN && c.coverage < FOREGROUND_MAX);
  const contrast: ScreenshotReport["contrast"] = [];
  for (const bg of backgrounds) {
    for (const fg of foregrounds) {
      const ratio = +contrastRatio(fg.hex, bg.hex).toFixed(2);
      contrast.push({
        fg: fg.hex, bg: bg.hex, ratio,
        passesNormal: ratio >= 4.5, passesLarge: ratio >= 3,
        fgCoverage: fg.coverage,
      });
    }
  }
  contrast.sort((a, b) => b.fgCoverage - a.fgCoverage || a.ratio - b.ratio);

  // ── density + horizontal bands ────────────────────────────────────────────
  const bgHex = clusters[0]?.hex ?? "#000000";
  const emptyRow: boolean[] = [];
  for (let y = 0; y < height; y++) {
    let same = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (colorDistance(toHex(data[i], data[i + 1], data[i + 2]), bgHex) <= 12) same++;
    }
    emptyRow.push(same / width >= ROW_EMPTY_RATIO);
  }
  const runs: number[] = [];
  let run = 0;
  for (const e of emptyRow) {
    if (e) run++;
    else if (run) { runs.push(run); run = 0; }
  }
  if (run) runs.push(run);

  const density = {
    backgroundCoverage: clusters[0]?.coverage ?? 0,
    largestEmptyBand: Math.round((runs.length ? Math.max(...runs) : 0) / scale),
    emptyBands: runs.length,
  };

  // ── structure ─────────────────────────────────────────────────────────────
  const lum = new Float32Array(total);
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const colSupport = new Int32Array(width);
  for (let x = 1; x < width; x++) {
    let n = 0;
    for (let y = 0; y < height; y++) {
      if (Math.abs(lum[y * width + x] - lum[y * width + x - 1]) > EDGE_THRESHOLD) n++;
    }
    colSupport[x] = n;
  }
  const minSupport = Math.max(1, Math.floor(SUPPORT_MEDIUM * height));
  const peaks: Array<{ x: number; support: number }> = [];
  for (let x = 1; x < width; x++) {
    if (colSupport[x] < minSupport) continue;
    const last = peaks[peaks.length - 1];
    if (last && x - last.x <= 2) {
      if (colSupport[x] > last.support) { last.x = x; last.support = colSupport[x]; }
    } else {
      peaks.push({ x, support: colSupport[x] });
    }
  }

  const leftPeaks = peaks.filter((p) => p.x < width / 3);
  const structure: ScreenshotReport["structure"] = { leftEdges: null, gaps: null, offGridGaps: [] };
  if (leftPeaks.length) {
    const weakest = Math.min(...leftPeaks.map((p) => p.support)) / height;
    structure.leftEdges = {
      value: leftPeaks.map((p) => Math.round(p.x / scale)),
      confidence: weakest >= SUPPORT_HIGH ? "high" : "medium",
      support: +weakest.toFixed(2),
    };
  }
  if (runs.length > 1) {
    const gaps = runs.map((r) => Math.round(r / scale));
    structure.gaps = { value: gaps, confidence: "high", support: 1 };
    structure.offGridGaps = gaps.filter((g) => g % 4 !== 0);
  }

  return {
    source: { name: opts.name ?? "screenshot.png", width, height, scale, sampledEveryNth: everyNth },
    palette, contrast, density, structure,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/screenshot.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screenshot.ts tests/screenshot.test.ts
git commit -m "feat: measure screenshot palette and density from real pixels"
```

---

### Task 6: Contrast pairs

**Files:**
- Modify: `tests/screenshot.test.ts`

**Interfaces:**
- Consumes: `measure` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `tests/screenshot.test.ts`:

```ts
describe("contrast measurement", () => {
  it("computes the exact WCAG ratio for a foreground on the dominant background", () => {
    const img = canvas(100, 100, WHITE, [{ x: 0, y: 0, w: 30, h: 30, rgb: INK }]);
    const r = measure(img);
    const pair = r.contrast.find((c) => c.fg === "#111827" && c.bg === "#ffffff")!;
    expect(pair).toBeDefined();
    expect(pair.ratio).toBeCloseTo(17.74, 1);
    expect(pair.passesNormal).toBe(true);
  });

  it("flags a failing pair", () => {
    const GREY: [number, number, number] = [170, 170, 170]; // #aaaaaa on white ≈ 2.32:1
    const img = canvas(100, 100, WHITE, [{ x: 0, y: 0, w: 30, h: 30, rgb: GREY }]);
    const pair = measure(img).contrast.find((c) => c.fg === "#aaaaaa")!;
    expect(pair.ratio).toBeLessThan(3);
    expect(pair.passesNormal).toBe(false);
    expect(pair.passesLarge).toBe(false);
  });

  it("does not treat a second large area as a foreground", () => {
    // a 50/50 split: both colours are backgrounds, so no pair is produced
    const img = canvas(100, 100, WHITE, [{ x: 0, y: 0, w: 100, h: 50, rgb: INK }]);
    expect(measure(img).contrast).toEqual([]);
  });

  it("orders pairs by how much of the screen the foreground occupies", () => {
    const img = canvas(100, 100, WHITE, [
      { x: 0, y: 0, w: 30, h: 30, rgb: INK },    // 9%
      { x: 50, y: 0, w: 10, h: 10, rgb: BRAND }, // 1%
    ]);
    const r = measure(img);
    expect(r.contrast[0].fg).toBe("#111827");
    expect(r.contrast[1].fg).toBe("#4f46e5");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run build && npx vitest run tests/screenshot.test.ts`
Expected: PASS. If the 50/50 test fails, `BACKGROUND_MIN` / `FOREGROUND_MAX` are being applied inconsistently — both colours are ≥15%, so neither may appear as a foreground.

- [ ] **Step 3: Commit**

```bash
git add tests/screenshot.test.ts
git commit -m "test: contrast pairs are measured, thresholded and ordered by prominence"
```

---

### Task 7: Structure detection and the false-positive guard

This task protects the project's positioning. A clean layout must produce **no** misalignment finding.

**Files:**
- Modify: `tests/screenshot.test.ts`, `src/screenshot.ts` (only if a test exposes a bug)

**Interfaces:**
- Consumes: `measure` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

Append to `tests/screenshot.test.ts`:

```ts
describe("structure detection", () => {
  it("detects a single consistent left edge for an aligned layout", () => {
    const img = canvas(200, 200, WHITE, [
      { x: 32, y: 20, w: 120, h: 12, rgb: INK },
      { x: 32, y: 60, w: 100, h: 12, rgb: INK },
      { x: 32, y: 100, w: 140, h: 12, rgb: INK },
    ]);
    const edges = measure(img).structure.leftEdges;
    expect(edges).not.toBeNull();
    expect(edges!.value).toEqual([32]);
  });

  it("FALSE-POSITIVE GUARD: a perfectly aligned layout reports one edge, never several", () => {
    const rects = Array.from({ length: 8 }, (_, i) => ({ x: 24, y: 10 + i * 24, w: 150, h: 12, rgb: INK }));
    const img = canvas(300, 300, WHITE, rects);
    const edges = measure(img).structure.leftEdges!;
    expect(edges.value).toHaveLength(1);
    expect(edges.value[0]).toBe(24);
  });

  it("detects genuinely different left edges", () => {
    const img = canvas(300, 300, WHITE, [
      { x: 16, y: 20, w: 150, h: 12, rgb: INK },
      { x: 24, y: 60, w: 150, h: 12, rgb: INK },
      { x: 40, y: 100, w: 150, h: 12, rgb: INK },
    ]);
    const edges = measure(img).structure.leftEdges!;
    expect(edges.value).toEqual([16, 24, 40]);
  });

  it("reports gaps and flags the ones off a 4px grid", () => {
    const img = canvas(100, 100, WHITE, [
      { x: 10, y: 20, w: 80, h: 10, rgb: INK },  // gap above: rows 0..19 = 20
      { x: 10, y: 50, w: 80, h: 10, rgb: INK },  // gap between: rows 30..49 = 20
    ]);                                           // gap below: rows 60..99 = 40
    const s = measure(img).structure;
    expect(s.gaps!.value).toEqual([20, 20, 40]);
    expect(s.offGridGaps).toEqual([]);
  });

  it("halves reported lengths at scale 2", () => {
    const img = canvas(200, 200, WHITE, [{ x: 32, y: 40, w: 120, h: 20, rgb: INK }]);
    const one = measure(img, { scale: 1 }).structure.leftEdges!.value[0];
    const two = measure(img, { scale: 2 }).structure.leftEdges!.value[0];
    expect(one).toBe(32);
    expect(two).toBe(16);
  });

  it("attaches a confidence level and support fraction", () => {
    const img = canvas(200, 200, WHITE, [{ x: 32, y: 0, w: 120, h: 200, rgb: INK }]);
    const edges = measure(img).structure.leftEdges!;
    expect(edges.confidence).toBe("high");
    expect(edges.support).toBeGreaterThanOrEqual(0.25);
  });

  it("reports nothing when there is nothing to detect", () => {
    const img = canvas(100, 100, WHITE, []);
    const s = measure(img).structure;
    expect(s.leftEdges).toBeNull();
    expect(s.gaps).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run build && npx vitest run tests/screenshot.test.ts`
Expected: PASS. Likely failures and their fixes:
- *Aligned layout reports two edges* — the 2 px peak-merge window is not merging; check the `x - last.x <= 2` branch updates `last` in place.
- *A blank canvas reports gaps* — `runs.length > 1` must be the guard; a single all-empty run is not a gap pattern.

- [ ] **Step 3: Commit**

```bash
git add src/screenshot.ts tests/screenshot.test.ts
git commit -m "test: structural detection thresholds, scale conversion and false-positive guard"
```

---

### Task 8: Markdown rendering

**Files:**
- Create: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: `ScreenshotReport` (Task 5).
- Produces:
  ```ts
  export function renderMarkdown(r: ScreenshotReport): string;
  export function escapeHtml(s: string): string;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/report.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { decodePng } from "../dist/png.js";
import { measure } from "../dist/screenshot.js";
import { renderMarkdown } from "../dist/report.js";
import { encodePng } from "./helpers/pngFixture.js";

function shot() {
  const rows: number[][] = [];
  for (let y = 0; y < 100; y++) {
    const row: number[] = [];
    for (let x = 0; x < 100; x++) {
      const ink = x >= 20 && x < 80 && y >= 20 && y < 40;
      row.push(...(ink ? [17, 24, 39] : [255, 255, 255]));
    }
    rows.push(row);
  }
  return measure(decodePng(encodePng({ width: 100, height: 100, colorType: 2, bitDepth: 8, rows })), { name: "hero.png" });
}

describe("markdown report", () => {
  const md = renderMarkdown(shot());

  it("states the source and dimensions", () => {
    expect(md).toContain("hero.png");
    expect(md).toContain("100×100");
  });

  it("lists the palette with coverage", () => {
    expect(md).toMatch(/#ffffff/);
    expect(md).toMatch(/#111827/);
    expect(md).toMatch(/%/);
  });

  it("reports contrast with the measured ratio", () => {
    expect(md).toMatch(/17\.\d+:1/);
  });

  it("labels lengths as image pixels when no scale was given", () => {
    expect(md).toMatch(/image px/i);
  });

  it("describes the image, never the interface", () => {
    // The positioning constraint, mechanically checked.
    expect(md).not.toMatch(/your (buttons|layout|design|spacing) (is|are)/i);
    expect(md).toMatch(/detected/i);
  });

  it("carries confidence next to every detection", () => {
    expect(md).toMatch(/confidence: (high|medium)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/report.test.ts`
Expected: FAIL — cannot resolve `../dist/report.js`.

- [ ] **Step 3: Write the implementation**

Create `src/report.ts`:

```ts
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
        ? `- **${v.length} left edge detected** at x = ${v[0]} — consistent (confidence: ${s.leftEdges.confidence}).`
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/report.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat: markdown rendering of the screenshot measurement"
```

---

### Task 9: Self-contained HTML report

**Files:**
- Modify: `src/report.ts`, `tests/report.test.ts`

**Interfaces:**
- Consumes: `ScreenshotReport`, `escapeHtml` (Task 8).
- Produces:
  ```ts
  export function renderHtml(r: ScreenshotReport, meta: { version: string; measuredAt: string }): string;
  ```

- [ ] **Step 1: Write the failing test**

Append to `tests/report.test.ts` (add `renderHtml` to the import):

```ts
describe("HTML report", () => {
  const html = renderHtml(shot(), { version: "0.16.0", measuredAt: "2026-07-25" });

  it("is a complete document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
  });

  it("is strictly self-contained — no external request is possible", () => {
    expect(html).not.toMatch(/https?:\/\/(?!github\.com\/HalidSaglam)/);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/\ssrc=/i);
  });

  it("styles both colour schemes", () => {
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("renders a swatch per palette colour", () => {
    expect(html).toContain("background-color:#ffffff");
    expect(html).toContain("background-color:#111827");
  });

  it("carries the discreet footer with version and link", () => {
    expect(html).toMatch(/Measured by SaglitzDesign/);
    expect(html).toContain("0.16.0");
    expect(html).toContain("2026-07-25");
  });

  it("escapes the file name so a hostile path cannot break the document", () => {
    const r = shot();
    r.source.name = '<script>alert(1)</script>.png';
    const out = renderHtml(r, { version: "0.16.0", measuredAt: "2026-07-25" });
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/report.test.ts`
Expected: FAIL — `renderHtml is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/report.ts`:

```ts
const STYLES = `
:root{--bg:#ffffff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb;--card:#f9fafb;--ok:#047857;--bad:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#0b0d12;--fg:#e5e7eb;--muted:#9ca3af;--line:#1f2937;--card:#111827;--ok:#34d399;--bad:#f87171}}
*{box-sizing:border-box}
body{margin:0;padding:2rem 1.25rem;background:var(--bg);color:var(--fg);
 font:16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:50rem;margin-inline:auto}
h1{font-size:1.5rem;margin:0 0 .25rem}
h2{font-size:1.05rem;margin:2.5rem 0 .75rem;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}
.sub{color:var(--muted);margin:0 0 .5rem}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(8rem,1fr));gap:.75rem;list-style:none;padding:0}
.swatch{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--card)}
.chip{height:3.5rem}
.meta{padding:.5rem .625rem;font-size:.8125rem}
.meta code{font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.9375rem}
th,td{text-align:left;padding:.5rem .625rem;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--muted);font-weight:600}
.pass{color:var(--ok)}.fail{color:var(--bad)}
ul.findings{padding-left:1.1rem}
.badge{display:inline-block;font-size:.75rem;padding:.05rem .4rem;border:1px solid var(--line);border-radius:999px;color:var(--muted)}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.8125rem}
footer a{color:inherit}
`;

export function renderHtml(r: ScreenshotReport, meta: { version: string; measuredAt: string }): string {
  const e = escapeHtml;
  const u = e(unit(r));

  const swatches = r.palette.clusters.map((c) => `
      <li class="swatch"><div class="chip" style="background-color:${e(c.hex)}"></div>
        <div class="meta"><code>${e(c.hex)}</code><br>${pct(c.coverage)}${c.members ? ` · +${c.members} merged` : ""}</div></li>`).join("");

  const contrastRows = r.contrast.map((c) => `
        <tr><td><code>${e(c.fg)}</code></td><td><code>${e(c.bg)}</code></td><td>${c.ratio.toFixed(2)}:1</td>
        <td class="${c.passesNormal ? "pass" : "fail"}">${c.passesNormal ? "pass" : "fail"}</td>
        <td class="${c.passesLarge ? "pass" : "fail"}">${c.passesLarge ? "pass" : "fail"}</td></tr>`).join("");

  const findings: string[] = [];
  const s = r.structure;
  if (s.leftEdges) {
    const v = s.leftEdges.value;
    findings.push(v.length === 1
      ? `<li>One left edge detected at x = ${v[0]} — consistent. <span class="badge">confidence: ${e(s.leftEdges.confidence)}</span></li>`
      : `<li>${v.length} left edges detected at x = ${v.join(", ")} — they do not agree. <span class="badge">confidence: ${e(s.leftEdges.confidence)}</span></li>`);
  }
  if (s.gaps) {
    findings.push(`<li>Vertical gaps detected: ${s.gaps.value.join(", ")} ${u}. <span class="badge">confidence: ${e(s.gaps.confidence)}</span></li>`);
    findings.push(s.offGridGaps.length
      ? `<li>${s.offGridGaps.length} gap(s) are not multiples of 4: ${s.offGridGaps.join(", ")}.</li>`
      : `<li>Every detected gap is a multiple of 4.</li>`);
  }
  if (!findings.length) findings.push("<li>Nothing crossed the detection threshold — no structural claim is made.</li>");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Screenshot measurement — ${e(r.source.name)}</title>
<style>${STYLES}</style></head>
<body><main>
  <h1>Screenshot measurement</h1>
  <p class="sub"><code>${e(r.source.name)}</code> · ${r.source.width}×${r.source.height} image pixels · lengths in ${u}${
    r.source.sampledEveryNth > 1 ? ` · colours sampled every ${r.source.sampledEveryNth}th pixel` : ""
  }</p>

  <h2>Palette</h2>
  <p class="sub"><strong>${r.palette.significant}</strong> significant colour(s) covering at least 0.5% of the screen, out of ${r.palette.distinctExact} distinct values.</p>
  <ul class="swatches">${swatches}</ul>

  <h2>Contrast</h2>
  ${r.contrast.length === 0
    ? `<p class="sub">No foreground/background pair was distinct enough to measure.</p>`
    : `<p class="sub">Colour pairs present on the screen. The ratio is exact; whether a pair is genuinely text on that background is not something pixels establish.</p>
  <div class="scroll"><table><thead><tr><th>foreground</th><th>background</th><th>ratio</th><th>AA normal</th><th>AA large / UI</th></tr></thead>
  <tbody>${contrastRows}</tbody></table></div>`}

  <h2>Density</h2>
  <ul class="findings">
    <li>Dominant colour covers ${pct(r.density.backgroundCoverage)} of the screen.</li>
    <li>${r.density.emptyBands} empty horizontal band(s); the tallest is ${r.density.largestEmptyBand} ${u}.</li>
  </ul>

  <h2>Structure</h2>
  <ul class="findings">${findings.join("")}</ul>

  <footer>Measured by SaglitzDesign v${e(meta.version)} on ${e(meta.measuredAt)} ·
    <a href="https://github.com/HalidSaglam/saglitzdesign-mcp">saglitzdesign-mcp</a></footer>
</main></body></html>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && npx vitest run tests/report.test.ts`
Expected: PASS — 12 tests. Note the self-containment test permits the one `github.com/HalidSaglam` footer link and nothing else.

- [ ] **Step 5: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat: self-contained HTML screenshot report"
```

---

### Task 10: Register the `measure_screenshot` tool

**Files:**
- Modify: `src/index.ts`
- Test: `tests/server.test.ts`, `tests/integrity.test.ts`

**Interfaces:**
- Consumes: `decodePng`/`PngError` (Task 2), `measure` (Task 5), `renderMarkdown`/`renderHtml` (Tasks 8–9), the existing `packageVersion()` in `src/index.ts`.
- Produces: tool `measure_screenshot`.

- [ ] **Step 1: Write the failing tests**

In `tests/server.test.ts`, the fixture must be created **before** the `SMOKE` map is declared, because the map references its path. Insert this immediately after the existing imports and the `const root = ...` line:

```ts
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { encodePng } from "./helpers/pngFixture.js";

const fixtureDir = mkdtempSync(join(tmpdir(), "saglitz-shot-"));
const fixturePath = join(fixtureDir, "fixture.png");
{
  const rows: number[][] = [];
  for (let y = 0; y < 60; y++) {
    const row: number[] = [];
    for (let x = 0; x < 60; x++) row.push(...(x >= 10 && x < 50 && y >= 10 && y < 20 ? [17, 24, 39] : [255, 255, 255]));
    rows.push(row);
  }
  writeFileSync(fixturePath, encodePng({ width: 60, height: 60, colorType: 2, bitDepth: 8, rows }));
}
```

Then add this entry to the `SMOKE` map, alongside the other tools (the "has a smoke case for every registered tool" test fails without it):

```ts
  measure_screenshot: { path: fixturePath, format: "both" },
```

Append a dedicated describe block:

```ts
describe("measure_screenshot", () => {
  it("returns a markdown measurement and an HTML document", async () => {
    const result = (await client.callTool({
      name: "measure_screenshot",
      arguments: { path: fixturePath, format: "both" },
    })) as { content?: Array<{ type: string; text?: string }> };
    const blocks = (result.content ?? []).map((c) => c.text ?? "");
    expect(blocks[0]).toContain("Screenshot measurement");
    expect(blocks[0]).toContain("#111827");
    expect(blocks.join("\n")).toContain("<!-- saglitzdesign:report:html -->");
    expect(blocks.join("\n")).toContain("<!doctype html>");
  }, 20_000);

  it("returns only markdown by default", async () => {
    const result = (await client.callTool({
      name: "measure_screenshot",
      arguments: { path: fixturePath },
    })) as { content?: Array<{ type: string; text?: string }> };
    expect(result.content).toHaveLength(1);
    expect(result.content![0].text).not.toContain("<!doctype html>");
  }, 20_000);

  it("explains a missing file by naming the resolved path", async () => {
    const result = (await client.callTool({
      name: "measure_screenshot",
      arguments: { path: "does-not-exist.png" },
    })) as { content?: Array<{ type: string; text?: string }> };
    expect(result.content![0].text).toMatch(/no file at/i);
    expect(result.content![0].text).toContain("does-not-exist.png");
  }, 20_000);

  it("tells the user to convert a JPEG rather than failing obscurely", async () => {
    const jpeg = join(fixtureDir, "fake.jpg");
    writeFileSync(jpeg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]));
    const result = (await client.callTool({
      name: "measure_screenshot",
      arguments: { path: jpeg },
    })) as { content?: Array<{ type: string; text?: string }> };
    expect(result.content![0].text).toMatch(/PNG/);
  }, 20_000);
});
```

In `tests/integrity.test.ts`, add `"measure_screenshot"` to the `TOOL_NAMES` set. In `tests/prompts.test.ts`, add `"measure_screenshot"` to its `TOOL_NAMES` array.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run build && npx vitest run tests/server.test.ts`
Expected: FAIL — "has a smoke case for every registered tool" still passes, but the new describe fails because the tool does not exist.

- [ ] **Step 3: Write the implementation**

In `src/index.ts`, add imports next to the other module imports:

```ts
import { statSync } from "node:fs";
import { isAbsolute, resolve, basename } from "node:path";
import { decodePng, PngError, MAX_BYTES } from "./png.js";
import { measure } from "./screenshot.js";
import { renderMarkdown, renderHtml } from "./report.js";
```

(`readFileSync` and `existsSync` are already imported at the top of the file; `join`/`dirname` are already imported from `node:path` — extend that import rather than adding a second one.)

Add the tool immediately after `compare_design_languages` and before the `// ── resources ──` section:

```ts
// ── Tool 27: measure a screenshot ────────────────────────────────────────────
// The only tool that reads a file the caller names. It still makes no network
// call and writes nothing — it decodes one PNG and reports what the pixels say.
tool(
  "measure_screenshot",
  "Measure a real screenshot from its actual pixels — the exact palette and how many distinct colours it really uses, true WCAG contrast ratios for the colour pairs on screen, whitespace/density, and structural detections (left-edge alignment, vertical rhythm, off-grid gaps) each carrying a confidence level. Returns a markdown measurement and, on request, a self-contained HTML report you can open and share. PNG only. Reads the local file you name; makes no network call. Use it before critiquing a UI so the review cites measured numbers instead of impressions; pair with fix_contrast for failures and audit_design_system for the codebase behind the screen.",
  {
    path: z.string().describe("Path to a .png screenshot. Absolute paths are strongly preferred — a relative path is resolved against the server's working directory, which is usually not your project folder."),
    scale: z.number().int().min(1).max(3).optional().describe("Device pixel ratio of the screenshot (default 1). Pass 2 for a Retina/2× capture so lengths are reported in logical px instead of image px."),
    format: z.enum(["markdown", "html", "both"]).optional().describe("'markdown' (default) for the measurement text, 'html' for a self-contained report document to save and open, 'both' for each."),
    max_colors: z.number().int().min(4).max(24).optional().describe("How many palette clusters to list (default 12)."),
  },
  async ({ path, scale, format, max_colors }) => {
    const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      return text(`There is no file at \`${abs}\`. Pass an absolute path to the .png screenshot.`);
    }
    if (!stat.isFile()) return text(`\`${abs}\` is not a file. Pass the path to a .png screenshot.`);
    if (stat.size > MAX_BYTES) {
      return text(`\`${abs}\` is ${(stat.size / 1048576).toFixed(1)} MB; the limit is 25 MB. Export a smaller PNG.`);
    }

    let report;
    try {
      const img = decodePng(readFileSync(abs));
      report = measure(img, { name: basename(abs), scale: scale as 1 | 2 | 3 | undefined, maxColors: max_colors });
    } catch (err) {
      if (err instanceof PngError) return text(`Could not read \`${basename(abs)}\`: ${err.message}`);
      return text(`Could not read \`${basename(abs)}\` as a PNG image.`);
    }

    const md = renderMarkdown(report);
    const want = format ?? "markdown";
    if (want === "markdown") return text(md);

    const html = renderHtml(report, {
      version: packageVersion(),
      measuredAt: new Date().toISOString().slice(0, 10),
    });
    const htmlBlock =
      "<!-- saglitzdesign:report:html -->\n" +
      "Save the document below as a .html file and open it in a browser — it is fully self-contained.\n\n" +
      html;

    return {
      content: want === "html"
        ? [{ type: "text" as const, text: htmlBlock }]
        : [{ type: "text" as const, text: md }, { type: "text" as const, text: htmlBlock }],
    };
  },
);
```

- [ ] **Step 4: Run the full suite**

Run: `npm run build && npx vitest run`
Expected: PASS — every suite, including the tool-count assertions. If "gives every tool a title, a description and read-only annotations" fails, the `tool()` wrapper was bypassed.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/server.test.ts tests/integrity.test.ts tests/prompts.test.ts
git commit -m "feat: measure_screenshot tool"
```

---

### Task 11: Make the workflows measure before they judge

**Files:**
- Modify: `src/prompts.ts`, `tests/prompts.test.ts`

**Interfaces:**
- Consumes: the `measure_screenshot` tool name (Task 10).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `tests/prompts.test.ts`:

```ts
describe("workflows measure before they judge", () => {
  it("critique_screenshot measures the image first", () => {
    const text = buildPromptText("critique_screenshot");
    expect(text).toContain("measure_screenshot");
    expect(text).toMatch(/measure.*before|first/i);
  });

  it("design_review offers measurement for screenshots", () => {
    expect(buildPromptText("design_review")).toContain("measure_screenshot");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && npx vitest run tests/prompts.test.ts`
Expected: FAIL — `measure_screenshot` not found in the prompt text.

- [ ] **Step 3: Write the implementation**

In `src/prompts.ts`, add to the `TOOLKIT` block under **Auditors**, after the `audit_ux_copy` line:

```
- measure_screenshot(path, scale, format) — measures a PNG screenshot's real palette, contrast ratios, density and structure. Use it whenever you have an image file rather than source.
```

In `critique_screenshot`, replace step 4 ("Measure what can be measured…") with:

```
4. **Measure before you judge.** If the screenshot exists as a file, call measure_screenshot(path) FIRST and let its numbers drive the critique — the real palette and how many colours the screen actually uses, exact WCAG ratios for the pairs on screen, density, and the structural detections with their confidence. Cite those numbers instead of impressions ("body text measures 2.9:1, AA needs 4.5"), and run fix_contrast for each failure. Respect the confidence levels: a medium-confidence detection is a question to check, not a finding to assert. If you only have an inline image and no file path, say so and critique visually.
```

In `design_review`, add to the step-2 auditor list, after the `audit_ux_copy` bullet:

```
   - measure_screenshot(path) — when you are reviewing a screenshot file rather than source, this is the equivalent of the auditors above.
```

- [ ] **Step 4: Run tests**

Run: `npm run build && npx vitest run tests/prompts.test.ts`
Expected: PASS — including the existing "never names a tool that does not exist" and "puts the whole server to work" assertions.

- [ ] **Step 5: Commit**

```bash
git add src/prompts.ts tests/prompts.test.ts
git commit -m "feat: critique and review workflows measure a screenshot before judging it"
```

---

### Task 12: Documentation, version, and end-to-end verification

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `package.json`, `server.json`

**Interfaces:**
- Consumes: everything above.
- Produces: a releasable v0.16.0.

- [ ] **Step 1: Update the README**

In the tools table, immediately after the `audit_design_system` row:

```markdown
| **`measure_screenshot`** | **Measures your actual screen.** Give it a PNG and it reports the real palette and colour count, true WCAG contrast ratios for the pairs on screen, density, and structural detections (alignment, rhythm, off-grid gaps) each with a confidence level — plus a self-contained HTML report you can open and share. Pure-Node PNG decoding, no network. |
```

Update the header line: `26 tools` → `27 tools`.

In the "Workflows" intro paragraph, after "runs the **deterministic verify gate**", add: "— and for screenshots, measures the pixels before it judges them".

- [ ] **Step 2: Update the CHANGELOG**

Add a new section above `## [0.15.0]`:

```markdown
## [0.16.0] — 2026-07-25

### Added

- **`measure_screenshot`** — measures a real screenshot from its pixels rather
  than describing it: the exact palette and how many distinct colours a screen
  actually uses, true WCAG contrast ratios for the colour pairs present,
  whitespace and density, and structural detections (left-edge alignment,
  vertical rhythm, off-grid gaps) each carrying a confidence level. Findings
  describe the image, never the interface's semantics, and anything below its
  confidence threshold is not reported at all.
- **Self-contained HTML report** — the measurement renders to a single
  standalone document with no external requests, readable in light and dark,
  that you can open, keep and share.
- **Pure-Node PNG decoding** (`src/png.ts`) built on `node:zlib` — truecolour,
  greyscale, palette with tRNS, 8- and 16-bit, all five scanline filters. No new
  dependencies. Unsupported input (JPEG, interlaced, corrupt) is refused with a
  named reason instead of producing wrong pixels.

### Changed

- `critique_screenshot` and `design_review` now measure a screenshot before
  judging it, so a critique cites "2.9:1, AA needs 4.5" instead of "contrast
  looks weak".
- Colour distance and clustering moved to `src/colorutil.ts`, shared by the
  screenshot measurement and `audit_design_system` — "23 colours in your CSS"
  and "23 colours on your screen" are now counted by the same rule.
- **27 tools** in total.
```

- [ ] **Step 3: Bump the version**

```bash
npm version minor --no-git-tag-version
node scripts/sync-version.mjs
```

Confirm `package.json` and `server.json` both read `0.16.0`.

- [ ] **Step 4: Full verification**

```bash
npm test
```

Expected: every suite passes. The integrity suite's "server.json carries the package.json version everywhere" test proves the bump propagated.

Then verify the tool end-to-end against the built server:

```bash
node --input-type=module -e "
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const t = new StdioClientTransport({ command: 'node', args: ['dist/index.js'], stderr: 'ignore' });
const c = new Client({ name: 'check', version: '1' }, { capabilities: {} });
await c.connect(t);
console.log('tools:', (await c.listTools()).tools.length);
await c.close();"
```

Expected: `tools: 27`.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md package.json server.json
git commit -m "docs: v0.16.0 — measure_screenshot"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: colorutil extraction → Task 1; png.ts supported formats → Tasks 2–3; rejection codes → Task 4; palette/density → Task 5; contrast → Task 6; structure + confidence + false-positive guard → Task 7; renderMarkdown → Task 8; renderHtml, self-containment, escaping, footer → Task 9; tool surface, path resolution, annotations → Task 10; prompt integration → Task 11; docs and version → Task 12. The spec's sampling disclosure is implemented in Task 5 (`sampledEveryNth`) and surfaced in both renderers.

**Type consistency.** `ScreenshotReport`, `Detection<T>`, `MeasureOptions`, `DecodedImage`, `PngError`, `FullCluster`, `ColorCluster` and `ValueUse` are declared once and referenced with the same names and shapes throughout. `clusterAll` is used by `screenshot.ts`; `clusterColors` keeps `dsaudit.ts` unchanged.

**Known deviation from the spec, deliberate:** the spec's `structure.leftEdges` / `structure.gaps` are typed `Detection<number[]> | null` rather than always present, so "nothing crossed the threshold" is representable without inventing an empty detection.
