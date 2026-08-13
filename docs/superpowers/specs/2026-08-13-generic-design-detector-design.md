# Generic-design detector — design

**Date:** 2026-08-13
**Target release:** v0.21.0
**Status:** approved, ready for implementation

## Why

This server exists because LLMs are confidently wrong about design. It now
contains excellent prose on the subject: `typography-craft` carries a
reflex-reject font list, `visual-craft-standards` has a section on being bolder
without slop, `design-critique-scoring` states the slop test outright — *"would
anyone say 'AI made that' without hesitation?"*

Nothing enforces any of it. `design_lint` ships six rules and not one of them
looks at the signals that actually give a generated page away. So the knowledge
is correct, reachable, and routinely ignored: an agent that never opens the
document ships indigo-to-violet on Inter with a rocket emoji, and the server
raises no objection.

This closes that gap the way the security package closed its own — by turning
the guidance already written into rules that fire.

## The rule that shapes the whole design

**Only facts become rules. Judgements stay with the human.**

The security package could ground every rule in a specification. This one
cannot: *"this page looks AI-made"* is not a measurable property. So the line is
drawn at what can be stated as a fact about the source.

| Fact — can be a rule | Judgement — cannot |
|---|---|
| `from-indigo-500 to-purple-600` is present | "the palette is timid" |
| `font-family: Inter` on a marketing surface | "the typography has no character" |
| `🚀` used as an icon in a heading | "the imagery is clichéd" |
| Three sibling cards carry byte-identical class strings | "the hierarchy is weak" |

The right-hand column belongs to `design_review_checklist` and
`design-critique-scoring`, which exist and are honest about being judgement.
This package does not touch them, and must not grow toward them.

## The second rule: no heuristics, carried over

A false positive here costs more than in the security tool, not less. A
developer who is told their deliberate indigo brand is "AI slop" stops reading
the output — and unlike a security finding, there is no external authority they
can check it against. Every rule ships only if it can be stated as a fact, and
the clean case must be provably clean.

## Sourcing: there are no primary sources, so cite the systems

No standards body publishes on what reads as machine-made, and everything
written on the subject is blog-tier — outside the allowlist the security
documents are held to.

The way through is to document **what the systems actually ship** rather than
what commentators say about them:

- *"Indigo gives away AI"* is an opinion.
- *"Tailwind's default palette ships `indigo-500` as its stock accent"* is a
  fact, verifiable at `tailwindcss.com`.
- *"shadcn/ui's default font is Inter"* is a fact, verifiable at `ui.shadcn.com`.

The document records the defaults, with their sources, and lets the reader draw
the conclusion their own eyes already support. This is more useful than citing
commentary: the reader learns the name and origin of the default they are trying
to escape, which is the actionable part.

Permitted hosts for this document are therefore the systems themselves —
`tailwindcss.com`, `ui.shadcn.com`, `rsms.me` (Inter), `fonts.google.com`,
`developer.mozilla.org`, `caniuse.com` — plus anything already on the security
allowlist. Not design blogs, not listicles, not agency marketing.

## Scope

**In:** source code and UI copy, together. The copy signals give a page away as
readily as the visual ones, and `audit_ux_copy` already exists to be
cross-linked rather than duplicated.

**Out:**

- **Rendered-screenshot analysis.** `measure_screenshot` exists, but inferring
  "this looks generated" from pixels is a weak signal with a high false-positive
  rate. The security package's entire lesson argues against shipping it.
- **Aesthetic judgement of any kind.** See the rule above.
- **Suggesting replacements.** The tool names the default and points at the
  document; choosing the alternative is design work, and
  `suggest_font_pairing` / `generate_color_system` already do it on request.

## Tool: `audit_generic_design`

New `src/generic.ts`, mirroring `audit_security`'s proven shape: `source`
snippet or `path` directory, findings in the existing `LintFinding` form, and an
explicit statement of what the audit could not see. Agents already understand
this shape, and the module reuses `scanTags` and `maskComments` rather than
growing a third scanner.

### Rules — the initial set

Visual, from the source:

| Rule | Severity |
|---|---|
| `ai-default-gradient` — an indigo/violet/purple gradient pair, in Tailwind classes or a `linear-gradient` built from those ramps' hexes | warning |
| `default-ui-font` — Inter, Roboto, Open Sans, DM Sans or Plus Jakarta as the only declared family, **on a brand surface only** | warning |
| `emoji-as-icon` — a rocket, bulb, sparkle, lightning, fire or target emoji standing in for an icon in a heading, card title or feature item | warning |
| `uniform-card-grid` — three or more siblings inside a grid with byte-identical class strings | info |
| `stock-card-chrome` — the `rounded-2xl` + `shadow-lg`/`xl` + `border` triad repeated across three or more elements | info |
| `eyebrow-over-every-heading` — a short uppercase/letter-spaced label immediately preceding three or more headings | info |
| `gradient-text` — `bg-clip-text` with `text-transparent` over a gradient | info |
| `stock-glass-on-dark` — `backdrop-blur` with `bg-white/5\|10` and `border-white/10` together | info |

From the copy:

| Rule | Severity |
|---|---|
| `hype-opener` — "Elevate your", "Unlock the power of", "Supercharge", "Transform your", "Take your … to the next level", "Say goodbye to" | warning |
| `filler-adverb` — seamlessly, effortlessly, revolutionary, game-changing, cutting-edge, best-in-class, next-generation | info |
| `generic-cta` — "Get Started" and "Learn More" as the only call-to-action labels present | info |

The plan finalises the list. A rule that cannot be stated as a fact about the
source is cut rather than softened.

### The font rule's context test

Inter is the right answer in a dense dashboard and the wrong one on a landing
page, so `default-ui-font` fires only on a **brand surface** — inferred from
path and content signals (a marketing or landing route, a file containing an
`<h1>` beside a call to action) — and stays silent in application UI. The
inference is imperfect by nature; the test suite pins both directions, and where
the surface is genuinely ambiguous the rule stays quiet. Warning a dashboard
about its font is exactly the false positive that gets the whole output ignored.

### The score

`0-100`, and it counts **distinct signals, not occurrences**. A page with forty
cards is not more generic than one with three; both carry the same single
signal. Weighting each occurrence would let page length drive the number and
make the score meaningless across projects.

Each rule contributes its weight at most once. The score is always itemised:

```
Generic score: 62 / 100
  20  ai-default-gradient      indigo→violet, hero + 3 cards
  15  default-ui-font          Inter, sole family on a brand surface
  12  emoji-as-icon            🚀 💡 ✨ across 3 feature headings
   8  uniform-card-grid        3 siblings, byte-identical class strings
   7  hype-opener              "Unlock the power of"
```

No opaque number. Every point names the rule that produced it and where it was
found, so a reader can disagree with a specific line rather than with a verdict.

A page carrying none of the signals scores **0**, and the test suite asserts
that on deliberately distinctive fixtures — the discipline the security package
arrived at only after nine defects.

## Knowledge

Most of what these rules cite **already exists**, which is the point:
`typography-craft` (the reflex-reject list), `visual-craft-standards` (bolder
without slop), `ux-writing` (AI-slop copy), `design-critique-scoring` (the slop
test), `iconography`, `clean-app-design`.

One new document, `ai-default-aesthetic`, category `craft`: a catalogue of what
the widely-used systems ship as their defaults — Tailwind's palette, shadcn/ui's
font and component chrome, the icon sets that pair with them — each with its
source, and for each the specific thing that makes it recognisable when it goes
unchanged. It is the document the new rules cite, and it is written as
observation with citations, never as commentary.

## Changes to existing code

| File | Change |
|---|---|
| `src/generic.ts` | new — rules, scoring, report |
| `src/lint.ts` | none. `design_lint` keeps its six rules; growing it to seventeen would bury them |
| `src/index.ts` | tool registration, through the existing `tool()` wrapper |
| `src/catalog.ts`, `src/knowledge.ts` | `ai-default-aesthetic` wired into the review checklists; no new category — this is `craft` |
| `tests/generic.test.ts` | new |
| `tests/integrity.test.ts`, `tests/server.test.ts` | tool name, SMOKE entry, doc wiring |

`audit_project` integration is a follow-up, as it was for `audit_security`.

## Testing

The security package's hardest-won lesson applies from the first commit rather
than the last: **tests written from imagination only assert shapes someone
already had in mind.**

- Every rule tested in both directions. The negative cases are load-bearing.
- A **fixture matrix of deliberately distinctive pages** — a brutalist landing
  page, a serif editorial layout, a dense trading dashboard, a warm consumer app
  — each asserting a score of **0**. This is the direct analogue of the
  13-framework matrix, and it is what stops the tool from calling good work
  generic.
- The font rule pinned in both directions: a dashboard using Inter scores 0; a
  landing page whose only family is Inter fires.
- Score arithmetic asserted itemised, so a weight change that alters a total
  fails loudly rather than drifting.
- A page carrying every signal scores at the cap, not above it.

## Out of scope for this spec, tracked

Package C (SEO/GEO and performance auditors), package D (MCP structured output),
the knowledge freshness sweep, `audit_project` integration, and the iOS/macOS
security layer — which the user has asked to come last.
