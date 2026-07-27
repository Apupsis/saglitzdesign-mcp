# import_design_tokens — design

**Date:** 2026-07-27
**Target release:** v0.17.0
**Status:** approved, ready for implementation

## Why

`generate_design_tokens` only emits. Someone who already has a design system — a Tailwind theme, a shadcn `:root` block, a Figma/Style Dictionary export — cannot get SwiftUI or Compose tokens out of it, and cannot check what their system is missing. The tool has no inverse, so the server only serves greenfield projects.

This adds the missing direction: read a *named* token source, normalise it, report what is there and what is absent, and re-emit it in any supported format.

The scope deliberately excludes shipping shadcn/ui component code. This project's own `design-systems-methodology` doc lists "reinventing an off-the-shelf system" as an anti-pattern and names shadcn/ui specifically; publishing our own competing button would contradict our published guidance. The useful thing for those users is knowing how to *theme* what they already have — which is the knowledge doc below, not a recipe file.

## The rule that shapes the whole design

**Only named tokens are read.** Tailwind theme keys, CSS custom properties and DTCG entries all carry a name that states intent (`--color-primary`, `colors.brand.500`, `background`). A bare hex inside a CSS rule does not. The tool never looks at an arbitrary `color: #4f46e5` and decides it is your primary — inferring a role from a raw value is exactly the confident wrongness this project exists to avoid. Unnamed values are already served by `audit_design_system`, which counts them without claiming to know what they mean.

JavaScript is never evaluated. A `tailwind.config.js` is not executed or parsed as code.

## Supported inputs

| Format | Covers | Fidelity |
|---|---|---|
| `css` | CSS custom properties in any block — Tailwind v4 `@theme`, shadcn `:root` / `.dark`, plain stylesheets | exact |
| `dtcg` | W3C DTCG JSON, Style Dictionary and Figma exports that follow it (`{ "$value": … }`) | exact |
| `json` | A plain nested object of name → value, e.g. a Tailwind `theme` dumped to JSON | exact |
| auto | Detected from the input's shape | — |

Anything else is refused with a sentence naming the fix ("export your theme as CSS custom properties or DTCG JSON — a JS config cannot be read safely").

## Normalisation

Names are flattened to a role: DTCG paths join with `-`, `--color-` / `color.` / `colors.` prefixes are stripped, camelCase becomes kebab-case, and shadcn's `foreground` convention maps onto the project's `on*` roles where it is unambiguous. Values are classified by shape, not by their key:

- hex, `rgb()`, `hsl()` → colour
- length with a unit → spacing / radius / font-size, decided by the name (`spacing-*`, `radius-*`, `text-*`, `font-size-*`)
- a font stack string → font family
- anything else is carried into an "unclassified" list rather than guessed at

Colours are normalised through the existing `normalizeHex`; `hsl()` and `rgb()` are converted. A DTCG alias (`{color.brand.500}`) is resolved one level; an unresolvable alias is reported, not silently dropped.

## Output

1. **Coverage report** — which of the project's semantic roles are present, which are missing (`onPrimary`, `border`, `focus`…), how many extra roles the source carries, and the scales found (spacing, radii, font sizes).
2. **Contrast check** — every text/background pair among the imported roles, through the existing `contrastRatio`; failures point at `fix_contrast`.
3. **Re-emitted tokens** — the normalised spec through the existing `generateTokens`, in the requested format. Values not present fall back to the documented defaults, and the report says which ones were defaulted so nobody mistakes a default for their own value.

## Architecture

```
src/importtokens.ts   parse (css | dtcg | json) → normalise → ImportedTokens
src/index.ts          tool #28, wires the report + generateTokens + contrast
```

`extractColors` / `extractLengths` currently live private in `dsaudit.ts`. Only the value-classification helpers move to a shared module if both need them; if the parsing turns out to be genuinely different (named vs unnamed), duplication is not shared and each keeps its own — a shared helper that serves neither well is worse than two clear ones.

## Testing

- Round-trip: emit a token set with `generateTokens("css")`, import it back, assert the colours and scales survive unchanged. This is the strongest available check — the two directions must agree.
- A real shadcn `:root` block imports with its roles recognised and its missing roles named.
- A DTCG fixture with a nested group and an alias imports; an unresolvable alias is reported rather than dropped.
- A Tailwind v4 `@theme` block imports.
- A JS config input is refused with the documented message, not partially parsed.
- A bare `color: #4f46e5` inside a rule is **not** imported as a role — the guard on the rule above.
- Defaulted values are labelled as defaulted in the report.

## Knowledge doc: `theming-off-the-shelf`

Category `process`, platform `both`. How to theme shadcn/ui, Radix, Material and native kits with a generated token set instead of rebuilding them: the `--background`/`--foreground` convention and how it maps to semantic roles, which defaults to override first, where dark mode usually breaks, and when adopting stops being right. Wired into `REVIEW_MAP` and the `saas-web-app` / `website` roadmaps, and cross-linked from `design-systems-methodology`.
