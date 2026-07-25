# Changelog

All notable changes to SaglitzDesign MCP are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
  dependencies. Unsupported input (JPEG, interlaced, truncated) is refused with
  a named reason instead of producing wrong pixels.

### Changed

- `critique_screenshot` and `design_review` now measure a screenshot before
  judging it, so a critique cites "2.9:1, AA needs 4.5" instead of "contrast
  looks weak".
- Colour distance and clustering moved to `src/colorutil.ts`, shared by the
  screenshot measurement and `audit_design_system` — "23 colours in your CSS"
  and "23 colours on your screen" are now counted by the same rule.
- **27 tools** in total.

### Testing

- Fixtures are synthesised in-test by a PNG *encoder*, so every assertion
  checks an exactly known answer rather than an approximation. Two
  false-positive guards protect the positioning: a perfectly aligned layout must
  report a single edge, and an anti-aliased edge — which produces two adjacent
  peaks above threshold — must merge into one.

## [0.15.0] — 2026-07-24

An audit-and-repair release: three bugs were silently degrading the flagship
orchestration tools, and the test suite could not have caught any of them.
Also adds MCP resources, argument completion, and three new tools.

### Fixed

- **11 pattern documents were invisible to every roadmap and checklist.**
  `ROADMAPS` referenced pattern docs by their bare name (`onboarding-paywall`)
  while the documents carry platform-prefixed ids (`mobile-onboarding-paywall`).
  Unknown ids were silently filtered out, so — for one example — the iOS
  roadmap's "Monetization & key flows" phase omitted the paywall, auth,
  checkout and settings patterns it exists to point at. Ids are now canonical,
  and `findDoc()` resolves either form so cross-links inside the knowledge base
  (`[[onboarding-paywall]]`) keep working.
- **`cross-platform` documents disappeared from platform-filtered searches.**
  The filter only exempted `both`, so `design-tokens-theming` and `fluent-2`
  vanished from any search scoped to `web`, `mobile` or `macos`.
- **`design_lint` misjudged formatted markup.** The rules ran line by line
  while JSX is routinely wrapped across lines, so a multi-line `<img>` *with*
  `alt` was reported as an error, and a single-line `:focus { outline: none }`
  — the most dangerous case — was skipped. Markup rules now use a tag scanner
  over the whole snippet, and `outline: none` is judged against whether the
  snippet provides a focus replacement anywhere. Attributes arriving via
  `{...spread}` are no longer guessed at.
- **5 broken `[[wiki-links]]`** in the knowledge base now point at real docs.
- **`get_design_examples` no longer over-promises.** Screenshots are a
  local-only asset (third-party images are not redistributed), so published
  installs never returned them despite the description saying otherwise. The
  tool now detects which mode it is in and describes itself accordingly.

### Added

- **MCP resources.** The knowledge base is browsable without spending a tool
  call: `saglitzdesign://index`, `saglitzdesign://doc/{id}` (all 83 docs) and
  `saglitzdesign://recipe/{component}`, with **argument completion** for ids
  and component names.
- **`audit_design_system`** — point it at CSS/JSX/token source and it reports
  design-system sprawl: near-duplicate colors, radius/shadow/font-size/spacing
  scales, hardcoded values vs tokens, with a consolidation plan.
- **`generate_layout_system`** — breakpoints, container widths, a fluid grid,
  container queries and section rhythm as CSS custom properties and a
  Tailwind v4 `@theme` block.
- **`compare_design_languages`** — side-by-side iOS/HIG, Material 3, macOS and
  web equivalents for one surface (navigation, buttons, modals, motion,
  typography, elevation…), with the porting rule for each.
- **26 tools** in total, up from 23.
- **`port_to_platform` workflow** — takes a UI to another platform surface by
  surface, driven by `compare_design_languages` and its "do NOT port" lists.
- **`design-system-audit` skill** for the `npx skills add` distribution.

### Changed

- **The `/` workflows now drive the whole server.** They had not been updated
  since v0.4.0 and orchestrated only 8 of 26 tools — no generators, no recipes,
  no auditors. Every build workflow now generates the design system before
  writing pixels, builds from the component recipes, and passes a
  **deterministic verify gate** (`design_lint` → `audit_accessibility` →
  `audit_design_system` → `audit_ux_copy`) before it may claim to be done.
  `design_review` and `redesign` now lead with measured numbers instead of
  opinions, and report a real before→after.
- `create_design_system` gained the layout layer it was missing (grid,
  breakpoints, measure and section rhythm for web; margins, touch targets and
  adaptivity for iOS/Android) and now closes the loop by pointing at its own
  auditors.
- The `skills/` distribution was refreshed — it advertised a 68-document,
  12-tool server and referenced almost none of the tooling.
- 12 previously unreferenced documents (AI product UX, i18n, information
  architecture, emotional design, branding, email, ad creative, content
  distribution, and three distilled classics) are now wired into the roadmaps
  and review checklists that should have been citing them.
- Catalogue data (categories, review maps, roadmaps, freshness thresholds)
  moved to `src/catalog.ts` so it can be validated without starting a server.
- The server version is read from `package.json` at runtime; `npm version`
  syncs `server.json` automatically via `scripts/sync-version.mjs`.
- Minimum Node is now 20 (18 is end-of-life); CI runs 20/22/24.

### Testing

- **76 → 190+ tests.** New `tests/prompts.test.ts` validates the workflow prose
  itself — no phantom tool names, no broken document ids, and every build
  workflow gated on the auditors; `tests/integrity.test.ts` does the same for
  the `skills/` distribution. New `tests/integrity.test.ts` asserts that every doc id
  referenced by a roadmap, checklist, enum or wiki-link resolves, that ids are
  unique, and that release metadata is in sync. New `tests/server.test.ts`
  drives the real stdio server: every tool is listed, annotated and answers a
  representative call; resources and completions are exercised end to end.

## [0.14.0] — 2026-07-23

- Registered all 23 tools through a wrapper adding human titles and MCP
  annotations (`readOnlyHint`, `idempotentHint`, `openWorldHint: false`).
- Sharpened the knowledge-tool descriptions and parameter documentation.

## [0.13.0] — 2026-07-23

- Flagship `create_design_system`: one call turns a brand color + vibe +
  platform into a complete foundation.
- Added `generate_type_scale`, `generate_elevation_system`, `generate_motion`,
  `design_lint`, `audit_ux_copy`.
- Five new knowledge docs (e-commerce checkout, fintech trust, visionOS,
  HTML email development, design handoff) — 83 documents total.

## [0.12.0] — 2026-07-14

- Added `apple-intelligence-design`: how to design AI features the Apple way.

## [0.11.0] — 2026-07-14

- Added `suggest_icon_library` and the `iconography` craft doc. No icon assets
  are bundled.

## [0.10.0] — 2026-07-13

- Added `generate_color_system`, `suggest_font_pairing`, `fix_contrast`.
- First test suite (vitest) and CI across Node 18/20/22.
- Four new knowledge docs; MCP Registry and Smithery manifests.

## [0.9.0] — 2026-07-10

- Added `get_component_recipe` with production-ready code for 9 components
  across react-tailwind, html-css, SwiftUI and Compose.

## [0.8.0] — 2026-07-09

- Added the `skills/` distribution (5 skills) and 4 knowledge docs.

## [0.7.0] and earlier

- Knowledge base, search, roadmaps, review checklists, design tokens,
  accessibility auditing, prompts, and the curated example library.
  See the repository history for details.
