# measure_screenshot — design

**Date:** 2026-07-25
**Target release:** v0.16.0
**Status:** approved, ready for implementation planning

## Why

SaglitzDesign is installed ~2,400 times a month and has zero GitHub stars. People use it and forget it, because nothing it produces is ever *seen*: all 26 tools return markdown into an agent's context, so the user experiences Claude's answer, not SaglitzDesign.

This release adds the one capability no competing design MCP has — measuring a real screenshot from its actual pixels — and makes its output a self-contained HTML report the user opens and shares. Diagnosis of one's own work is the thing people pass around, and a shared report carries the project's name with it.

The rule this must not break: SaglitzDesign's positioning is *"LLMs are confidently wrong about design; we are not."* Every number reported must be either exactly measured or explicitly labelled as a detection with a confidence level. No claim about interface semantics is made from pixels alone.

## Scope

**In:** PNG decoding, palette/contrast/density measurement, structural detection with confidence, a self-contained HTML report, one new tool, prompt integration.

**Out (explicitly):** JPEG/WebP decoding, OCR, UI-element recognition, tap-target estimation, hierarchy inference, network access, writing files from the server.

## Architecture

Four modules, one tool. Zero new dependencies — `node:zlib` is built in.

```
src/png.ts         PNG → RGBA8 pixel buffer
src/colorutil.ts   redmean distance + greedy clustering (extracted from dsaudit.ts)
src/screenshot.ts  measurement engine → ScreenshotReport
src/report.ts      ScreenshotReport → self-contained HTML document
src/index.ts       tool #27: measure_screenshot
```

`colorutil.ts` is a refactor, not new logic: `colorDistance`, `INDISTINGUISHABLE` and `clusterColors` move out of `dsaudit.ts`, which then imports them. Both consumers must use the same threshold so "23 colors in your CSS" and "23 colors on your screen" mean the same thing.

Data flow is one direction, no shared state:

```
path → png.decode() → {width, height, data: RGBA8}
                          ↓
                    screenshot.measure(pixels, opts) → ScreenshotReport
                          ↓                                    ↓
              report.renderMarkdown()              report.renderHtml()
```

`ScreenshotReport` is a plain data object. Both renderers are pure functions of it, so the HTML and the markdown can never disagree.

## Module: png.ts

```ts
export interface DecodedImage { width: number; height: number; data: Uint8Array } // RGBA8
export function decodePng(buffer: Buffer): DecodedImage   // throws PngError
export class PngError extends Error { code: string }
```

**Supported:** signature check; chunks IHDR, PLTE, tRNS, IDAT (concatenated across chunks), IEND; ancillary chunks skipped. Color types 0 (grey), 2 (RGB), 3 (palette), 4 (grey+alpha), 6 (RGBA). Bit depth 8 and 16 for types 0/2/4/6; bit depth 1/2/4/8 for type 3. Filter types 0–4 per scanline. Interlace method 0.

**Rejected with a specific `code`, never a wrong answer:**

| Condition | code |
|---|---|
| Missing/short PNG signature (incl. JPEG magic `FF D8`) | `not-png` / `jpeg-unsupported` |
| Interlace method 1 (Adam7) | `interlace-unsupported` |
| Unsupported bit depth for the colour type | `bitdepth-unsupported` |
| `width × height` > 40,000,000 | `too-large` |
| Buffer > 25 MB | `too-large` |
| Truncated/corrupt chunk, inflate failure | `corrupt` |

16-bit samples are reduced to 8 by taking the high byte. Greyscale is replicated across R/G/B. Palette indices resolve through PLTE, with alpha from tRNS when present; missing alpha is 255.

## Module: screenshot.ts

```ts
export interface MeasureOptions { scale?: 1 | 2 | 3; maxColors?: number }
export function measure(img: DecodedImage, opts?: MeasureOptions): ScreenshotReport
```

### Sampling and the scale contract

All measurements are taken in **image pixels**. When `scale` is given, reported lengths are additionally expressed as logical px (`imagePx / scale`) and the report states which is which. The tool never guesses the device pixel ratio — a 2× screenshot measured as 1× would silently double every number.

If `width × height > 2,000,000`, colour tallying samples every *n*-th pixel (`n = ceil(pixels / 2_000_000)`) and the report discloses the sampling rate. Structural detection always runs on the full buffer, since it depends on edges.

### Palette (exact)

1. Tally exact RGB, skipping pixels with alpha < 16.
2. Sort by frequency; cluster with `colorutil` (redmean ≤ 12). Each cluster keeps its most frequent member.
3. Report: top `maxColors` clusters with coverage %, the total count of exact distinct colours, and — the number that actually matters — how many clusters cover ≥ 0.5 % of the screen ("significant colours").

### Contrast (exact ratio, honestly scoped)

- Background candidates: clusters covering ≥ 15 %.
- Foreground candidates: clusters covering between 0.05 % and 15 % (text and icons occupy little area).
- For each foreground × background pair, compute the ratio with the existing `a11y.ts:contrastRatio`; report against 4.5 (normal text) and 3.0 (large text / UI), sorted by foreground coverage.

The report states plainly: these are colour pairs *present on the screen*. Whether a given pair is genuinely text on that background is not something pixels alone establish. The ratio is exact; the pairing is a candidate.

### Density (exact)

Dominant-cluster coverage %, and the largest horizontal bands where ≥ 99 % of a row belongs to the dominant cluster (count and tallest run).

### Structure (detected, with confidence)

Operate on luminance `L = 0.2126R + 0.7152G + 0.0722B`.

- **Vertical edges:** for each column *x*, count rows where `|L(x,y) − L(x−1,y)| > 24`. Columns whose support ≥ `0.10 × height` are peaks; peaks within 2 px merge.
- **Left edges:** peaks in the left third. Distinct values (merged at 2 px tolerance) become the candidate margin set.
- **Horizontal bands:** rows that are ≥ 99 % dominant-colour are gap rows; contiguous runs are gaps. Gap heights are checked against multiples of 4 and 8.

**Confidence:** `high` when support ≥ 0.25 × height, `medium` when ≥ 0.10 × height. Anything below threshold is not reported at all — few and correct beats many and doubtful.

**Wording is mandatory and mechanical.** Findings describe the image: *"four left edges detected at x = 16, 17, 24, 24 — confidence: high"*. They never describe the interface: never *"your buttons are misaligned"*. A reviewer must be able to check that no finding string asserts semantics.

### Report shape

```ts
interface ScreenshotReport {
  source: { name: string; width: number; height: number; scale: number; sampledEveryNth: number };
  palette: { clusters: Array<{ hex: string; coverage: number; members: number }>;
             distinctExact: number; significant: number };
  contrast: Array<{ fg: string; bg: string; ratio: number; passesNormal: boolean; passesLarge: boolean; fgCoverage: number }>;
  density: { backgroundCoverage: number; largestEmptyBand: number; emptyBands: number };
  structure: { leftEdges: Detection<number[]>; gaps: Detection<number[]>; offGridGaps: number[] };
}
interface Detection<T> { value: T; confidence: "high" | "medium"; support: number }
```

## Module: report.ts

```ts
export function renderMarkdown(r: ScreenshotReport): string
export function renderHtml(r: ScreenshotReport, meta: { version: string; measuredAt: string }): string
```

`version` and `measuredAt` are supplied by the caller (`index.ts` already resolves the version from `package.json`), keeping the renderer a pure function — the same report always produces the same document.

`renderHtml` returns a complete `<!doctype html>` document that is **strictly self-contained**: inline CSS only, no external stylesheet, font, script, or image; colour swatches are `background-color` rules. It honours `prefers-color-scheme` for light and dark, and is readable on a phone.

Sections: header (file name, dimensions, scale, sampling note) · palette swatch grid · contrast table · density · structure findings with confidence badges · footer.

**Footer** — one quiet line: measurement date, server version, "Measured by SaglitzDesign" with a link to the repository. Nothing above the fold, nothing that survives a crop badly. A user who wants it gone deletes one line.

**Escaping:** every interpolated value, above all the file name, passes through `escapeHtml` (`& < > " '`). A path containing `<` must not be able to break the document.

## Tool surface

```
measure_screenshot({
  path: string,                                  // path to a .png — absolute strongly preferred
  scale?: 1 | 2 | 3,                             // device pixel ratio, default 1
  format?: "markdown" | "html" | "both",         // default "markdown"
  max_colors?: number                            // default 12, range 4–24
})
```

Always returns the markdown summary as the first text block. For `html` / `both`, a second text block follows, opening with the marker line `<!-- saglitzdesign:report:html -->` and a one-sentence instruction to save it as `.html` and open it. The server does not write files; the agent does.

**Annotations** stay `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` — the tool reads one file the caller names and makes no network call. This is the first tool that reads a user-supplied path, and the description says so explicitly.

**Path resolution.** The server's working directory is not the user's project directory — it is wherever the MCP client launched the process. A relative path is therefore resolved against `process.cwd()` and, when it misses, the error names the *resolved absolute path* it tried, so the caller can see why. The parameter description asks for absolute paths.

**Path safety:** the path must exist and be a regular file, with the size cap applied before reading. Errors are returned as text in the existing house style (a sentence naming the problem and the fix), never thrown.

## Integration

- `critique_screenshot` prompt: measure first, then judge — the critique cites measured ratios instead of asserting "contrast looks weak".
- `design_review` prompt: add `measure_screenshot` to the "measure before you opine" step.
- README tools table, CHANGELOG, version → 0.16.0.

## Testing

The decisive property: **fixtures are synthesised in-test, so the expected answer is known exactly.**

- `tests/png.test.ts` — build PNGs in-test (as the feasibility prototype already did) covering colour types 0/2/3/4/6, all five filter types, palette + tRNS, 16-bit, and 1/2/4-bit palettes; assert byte-exact RGBA round-trip. Assert each rejection path returns its documented `code`, including a JPEG header and an Adam7 image.
- `tests/screenshot.test.ts` — render a canvas with known colours, known margins and known gaps; assert the measured palette, coverage percentages, contrast ratios, margins and gap heights match exactly. Include a **false-positive test**: a perfectly aligned layout must produce no misalignment finding. Include a scale test: the same image at `scale: 2` reports halved logical lengths.
- `tests/report.test.ts` — the HTML contains no `http://`, `https://`, `src=`, `@import` or `<script src`; both colour schemes are present; the footer is present; a file name containing `<script>` appears escaped.
- `tests/server.test.ts` — a smoke case using a PNG fixture written to a temp path; tool count 27.
- `tests/integrity.test.ts` — the new tool appears in the tool-name list; `dsaudit` still clusters identically after the `colorutil` extraction (regression guard on the refactor).

## Risks

| Risk | Mitigation |
|---|---|
| A structural finding is wrong and damages the "never confidently wrong" position | Confidence thresholds, findings describe the image not the UI, sub-threshold findings suppressed entirely, false-positive test in the suite |
| Retina screenshots silently double every number | `scale` parameter; all lengths labelled "image px" unless converted |
| Large screenshots are slow | Sampling above 2 MP with disclosure; structural pass is a single linear scan |
| The `colorutil` extraction changes `audit_design_system` behaviour | Existing `dsaudit` tests must pass unchanged; explicit regression test |
| Users try JPEG and get a confusing failure | Detect the JPEG magic number specifically and say "convert to PNG" |
