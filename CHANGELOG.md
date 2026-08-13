# Changelog

All notable changes to SaglitzDesign MCP are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.21.0] — 2026-08-13

The knowledge base already said what gives a generated page away.
`typography-craft` carries a reflex-reject font list with Inter on it;
`design-critique-scoring` states the slop test outright. None of it was
enforced. An agent that never opened either document could ship indigo-to-violet
on Inter with a rocket emoji in the hero, and the server would raise no
objection — the knowledge existed to prevent exactly that page and nothing
read it back against what got built.

### Added

- **`audit_generic_design` — the 94th document and the 31st tool.**
  `knowledge/craft/ai-default-aesthetic.md` catalogues the defaults, cited to
  each system's own docs: the stock Tailwind indigo/violet/purple gradient (as
  classes, hex, or OKLCH), Inter/Roboto/Open Sans/DM Sans/Plus Jakarta Sans as
  the only declared typeface, emoji standing in for icons, the `rounded-2xl` +
  `shadow-lg` + border card recipe, gradient-filled heading text, an eyebrow
  over every heading, the `backdrop-blur` + `white/10` glass recipe, stock
  hype-opener copy, stacked filler adverbs, and a page whose every CTA is
  drawn from the stock set. Ten rules run those checks against real source and
  copy, never against taste — a class name, a phrase, a repeated structure,
  each a fact about the file rather than a verdict on the design. The score
  counts distinct signals, not occurrences, so forty cards sharing the stock
  chrome recipe are not more generic than three, and every point is itemised
  to its rule and file:line so a reader can disagree with a line instead of
  the whole verdict. Judgement stays where it already lived — pair this with
  `design_review_checklist` or `get_design_doc("design-critique-scoring")` for
  the half a fact-checker cannot do.
- **Five fixtures score 0.** A brutalist page, a serif editorial layout, a
  dense dashboard set in Inter, a warm consumer screen, and a monochrome
  developer tool each assert a generic score of zero — proof the tool
  penalises the defaults and not the categories of product that happen to
  share a typeface or a grid with them.

### Notes

- **One planned rule was cut before it shipped.** It fired on any three
  elements sharing a class string — nav links, footer buttons, dashboard KPI
  tiles, pricing tiers — and told every one of them their consistent
  components lacked hierarchy. A grid-parent gate would not have saved it,
  because dashboard tiles and pricing tiers genuinely do sit in a grid;
  separating "cards that need hierarchy" from "components that should be
  consistent" is a judgement about what the elements mean, not a fact about
  the source, so it falls outside what this tool can check. Ten rules ship,
  not eleven.
- **Writing the document first corrected the spec's own premises.**
  shadcn/ui's theming docs name no typeface at all — font selection routes to
  the scaffold, not the library — so `default-ui-font` only fires against a
  face actually declared in the source, never against an assumption about
  what shadcn ships. Its stock theme carries zero chroma on every token but
  `--destructive`; any hue in a shadcn project was added by hand. And Tailwind
  v4 authors its palette in OKLCH, publishing hex as "the nearest hex value"
  — the derived form, not the source of truth — which is why the gradient
  rule matches on OKLCH and class names, not on a hardcoded hex table that
  would have gone stale at the next palette revision.

## [0.20.0] — 2026-08-12

88 documents, and not one of them contained the string `Content-Security-Policy`
— nor `OWASP`, `XSS`, `CSRF`, `SameSite`, `HttpOnly`, `HSTS` or `Subresource
Integrity`, anywhere in the knowledge base. A site built end to end from this
server's guidance shipped with whatever header and cookie defaults the
framework happened to pick. This release adds a `security` category to close
that.

### Added

- **Five knowledge documents, a new `security` category — 93 documents:**
  - `web-security-headers` — CSP (nonce/hash, `strict-dynamic`, Trusted
    Types), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, Subresource
    Integrity, and the headers that are dead weight now (`X-Frame-Options`
    superseded by `frame-ancestors`; `X-XSS-Protection` actively harmful in a
    modern browser).
  - `frontend-attack-surface` — XSS sinks, unsandboxed third-party iframes,
    wildcard `postMessage`, mixed content, credentials in `localStorage`,
    secret-shaped `NEXT_PUBLIC_`/`VITE_` env vars.
  - `auth-and-session-ux` — session cookie attributes (`HttpOnly`, `Secure`,
    `SameSite`), CSRF defenses, passkeys, account-recovery flows that don't
    become the weak link.
  - `privacy-consent-and-tracking` — consent-before-load for tracking
    scripts, cookie categories, GDPR/UK-GDPR/KVKK-shaped requirements.
  - `ai-feature-security` — prompt injection from untrusted content and
    insecure output handling in AI features, mapped from the OWASP LLM Top 10
    to a frontend.
  - Every claim is sourced to a spec or a first-party vendor doc — a security
    document citing a blog is now a test failure, not a style note — and
    re-verified on a 90-day clock, the tightest staleness threshold in the
    table: a reader who believes a stale security claim thinks they're
    covered when they're not.
- **`audit_security`** — audits a directory or a pasted snippet for the
  defects above: missing or weak CSP, absent HSTS, unpinned cross-origin
  scripts, mixed content, `localStorage` credentials, secret-named public env
  vars, unsandboxed iframes, wildcard `postMessage`, unsanitised raw-HTML
  sinks, production source maps, un-ignored `.env` files. Header and CSP
  state is inferred by reading `next.config` / `vercel.json` / `netlify.toml`
  / `_headers` / middleware as text — never evaluated — so it also reports
  what it could not see rather than guessing. **30 tools** in total.
- The five documents are wired into every web-facing `design_review_checklist`
  (`website`, `landing-page`, `dashboard`) and roadmap (`website`,
  `landing-page`, `saas-web-app`) — a document nothing references is a
  document nobody reads. `tests/integrity.test.ts` now asserts the wiring
  directly, rather than only that each document is referenced from somewhere.

### Notes

Writing these turned up several widely repeated claims that don't hold up
against the spec or the vendor's own current docs:

- Trusted Types is no longer Chromium-only.
- `strict-origin-when-cross-origin` has been the browser default
  `Referrer-Policy` since 2020 — its absence from a response is not a
  finding, and an auditor that flags it anyway is simply wrong.
- Browsers imply `noopener` on `target="_blank"` anchors automatically;
  `window.open()` still does not, and still needs it spelled out.
- MDN states `SameSite=Lax` is the browser default; caniuse measures actual
  support at 76.34%, and only in Chrome and Edge. The two numbers describe
  different things, and neither one is wrong.

## [0.19.1] — 2026-08-06

### Fixed

- **An unsupported Node produced a syntax error, not an explanation.** `dist/index.js`
  uses top-level await, which older runtimes cannot parse, so the failure was
  `SyntaxError: Unexpected reserved word` pointing at a file the user did not
  write — and no check inside that file could ever run, because the parse fails
  before the first statement. `bin` now points at a small launcher written in
  deliberately old syntax, which names the required version and shows how to aim
  a client at a newer Node. Node 18 is not blocked: it works end to end in
  testing, so it starts with a warning rather than an error. A guard added to
  improve a message must not become a new source of breakage.

### Changed

- **The startup line names its transport.** It said "server running", which reads
  as "serving" to anyone who deployed this somewhere — the process would then
  wait on standard input forever with nothing to explain why it was unreachable.
  It now says "ready on stdio", and adds an explicit note when started by hand
  from a terminal, where the wait looks exactly like a hang. The README states
  the same thing: stdio only, no HTTP or SSE, cannot be hosted remotely — which
  is also why nothing leaves the machine.

## [0.19.0] — 2026-08-03

### Added

- **Status colours.** `generate_color_system` produced fourteen roles and none
  of them was an error colour, while `create_design_system` called itself a
  complete foundation. Adds `danger`, `success` and `warning` as full scales
  plus verified semantic roles in both themes, seeded from the conventional
  hues at the brand's own saturation so a muted brand does not get a
  fluorescent red.
- **Four knowledge documents**, all from primary sources, all on subjects the
  base had never covered — 88 documents:
  - `modern-css-design-primitives` — `contrast-color()`, `light-dark()`,
    `color-mix()`, `@scope`, container style queries, `field-sizing`, anchor
    positioning and the new font-relative units. Written around the limits:
    `contrast-color()` returns only white or black, and MDN's own example is a
    royal blue where it returns unreadable black.
  - `brand-on-native-platforms` — expressing brand inside a platform's
    conventions, built on the UI-layer / content-layer split.
  - `search-design` — `compare_design_languages` had listed "search" as a topic
    since v0.15.0 with nothing behind it.
  - `naming-features-and-labels` — criteria, process and evaluation for naming.

### Changed

- **`get_component_recipe` swaps whole ramps, not roles.** Role mapping handled
  `indigo-600` because that is "the primary" and left `indigo-300/400/500/800`
  behind, because no role names the shade a dark theme uses — so every dark UI
  built from these recipes kept our accent. Neutrals failed the same question
  from the other side: `bg-neutral-900` is a surface and `text-neutral-900` is
  text. Pass the `neutral`, `primary` and `danger` scales and each is swapped
  step for step, which needs no inference and therefore cannot be wrong. Nine
  components across both web stacks now return with no house colour left.
- `create_design_system` prints the exact payload to hand to
  `get_component_recipe`, and a test asserts every role in it is one the recipe
  tool accepts, so the two cannot drift apart.

### Fixed

- **Focus rings were counted as elevation.** A ring is a box-shadow but not
  depth, and counting them together punished exactly the codebases that do this
  properly. A ring has no offset and no blur, which separates the two precisely.
- **`design_lint` called best-practice code an error.**
  `:focus:not(:focus-visible) { outline: none }` is the recommended way to drop
  the ring for pointer focus while keeping it for the keyboard. Found by running
  `audit_project` against a real site.
- **The recipe library was not one system.** Four components used indigo as the
  accent and four used blue. Audited at 54/100 by our own tool, now 90, with a
  test that keeps it there.
- **Inflection decided findability.** Title and tag matching is exact-token, so
  "token" scored nothing against a document titled "Design Tokens". Query and
  index tokens are now stemmed — plurals and `-ing` only; `-ed` is left alone
  because "embed" would become "emb", and a stemmer that invents matches is
  worse than one that misses them.

### Notes

The first status-colour implementation passed every test while producing
`#46100b` for danger — a near-black brown that white reads on perfectly and
nobody reads as an error. Contrast passed, hue passed, saturation passed; the
constraint that bites is lightness. Measuring is not enough on its own — it has
to be the right measurement.

Apple's Human Interface Guidelines pages render client-side and return only
their titles to a fetch, so nothing was written from memory about the June 2026
HIG revisions. SF Symbols 8, Icon Composer 2, Pass Designer, scroll edge effects
and app schemas remain uncovered for that reason rather than by choice.

## [0.18.0] — 2026-08-02

Three gaps, each found by measuring rather than guessing: the pipeline broke in
the middle, teams could not add their own rules, and the auditors could not see
a project.

### Added

- **Your own knowledge directory.** `SAGLITZDESIGN_KNOWLEDGE_DIR` points at one
  or more directories whose documents join the base. The README used to say
  "drop a file under `knowledge/`", which means editing the installed package —
  `npm update` wipes it, so extending was effectively impossible from npm.
  A document with the same id replaces the built-in one, announced at startup
  and marked as your team's wherever it is served; `review: [website]` in
  frontmatter puts it into that checklist, ahead of the curated list.
- **`audit_project`** — the auditors over a directory instead of a pasted
  snippet, with the consistency score computed across files, findings ranked
  worst-file-first, and an explicit list of what was skipped.
- **`get_component_recipe` takes your tokens** and returns the code in your
  colours. Substitution happens on the way out, never on disk, so the recipe
  files stay valid runnable code; without tokens the output is byte-identical
  to before.
- **29 tools** in total.

### Fixed

- **Focus rings were counted as elevation.** A ring is a box-shadow but not
  depth, and counting them together punished exactly the codebases that do this
  properly — a consistent ramp plus a few ring states read as "sprawl". A ring
  has no offset and no blur, which separates the two precisely.
- **`design_lint` called best-practice code an error.**
  `:focus:not(:focus-visible) { outline: none }` is the recommended way to drop
  the ring for pointer focus while keeping it for the keyboard. Found by running
  `audit_project` against a real site.
- **The recipe library was not one system.** Four components used indigo as the
  accent and four used blue, so a UI built from these recipes put an indigo
  button beside a blue tab; radii had two values for "control" and two for
  "container". Audited at 54/100 by our own tool, now 90, with a test that keeps
  it there — a project shipping `audit_design_system` cannot ship a library that
  fails it.

### Notes

Ranking a team's documents took three attempts. A flat score boost was
arbitrary; gating on a fraction of the best built-in score failed outright,
because the scoring is length-biased — body frequency rewards long documents, so
a twenty-line house-rules file can never out-score a two-hundred-line reference.
Term coverage is length-independent: a document containing everything you asked
about leads, one sharing a single word does not.

## [0.17.0] — 2026-07-27

### Added

- **`import_design_tokens`** — the inverse `generate_design_tokens` never had.
  Reads CSS custom properties (a Tailwind v4 `@theme` block, a shadcn `:root`
  block, plain CSS), a W3C DTCG token file, or a theme object as JSON, and
  returns the roles it names, the semantic roles it leaves undefined, a WCAG
  contrast check on the pairs it defines, and the whole set re-emitted as CSS /
  Tailwind / SwiftUI / Compose / DTCG. Until now the server only served
  greenfield projects; this one meets a codebase that already has a system.
- **`theming-off-the-shelf`** knowledge doc — how to theme shadcn/ui, Radix,
  Material and native kits with your own tokens instead of rebuilding them.
  `design-systems-methodology` had told people to adopt and theme rather than
  reinvent without ever saying how. 84 documents.

### Changed

- Build workflows now import an existing theme before generating a new one, and
  `port_to_platform` re-emits the tokens a project already has for the target
  platform rather than starting over.
- **28 tools** in total.

### Deliberately not added

shadcn/ui component recipes. `design-systems-methodology` lists "reinventing an
off-the-shelf system" among its anti-patterns and names shadcn/ui specifically;
shipping our own competing button would contradict our own published guidance,
and it would be worse maintained than the one `npx shadcn add button` gives you.
The useful thing for those users is knowing how to theme what they already have,
which is the knowledge doc above.

### Notes

Only *named* tokens are read — CSS custom properties, DTCG entries and theme
keys carry a role; a bare `color: #4f46e5` inside a rule does not, and is never
imported as one. JavaScript configs are never evaluated. Text roles are
classified before surfaces: shadcn names its text roles `muted-foreground` and
`primary-foreground`, and matching surfaces first filed the most common failing
text colour in the ecosystem as a background.

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
