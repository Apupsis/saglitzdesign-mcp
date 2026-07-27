---
id: theming-off-the-shelf
title: "Theming an Off-the-Shelf System — shadcn/ui, Radix, Material, Native Kits"
category: process
platform: both
tags: [theming, shadcn, radix, material, design-tokens, adoption, dark-mode, css-variables]
sources: ["https://ui.shadcn.com/docs/theming", "https://ui.shadcn.com/docs/dark-mode", "https://www.radix-ui.com/themes/docs/theme/overview", "https://m3.material.io/styles/color/roles", "https://developer.apple.com/design/human-interface-guidelines/color", "https://www.designtokens.org/tr/2025.10/format/", "https://tailwindcss.com/docs/theme"]
updated: 2026-07-27
---

# Theming an Off-the-Shelf System

`design-systems-methodology` says to adopt and theme an existing system rather than reinvent one, and lists "reinventing an off-the-shelf system" among its anti-patterns. This is the other half of that advice: how to actually make someone else's components look like your product, and where that goes wrong.

The failure this prevents is not "the buttons look wrong". It is the slow one: a team adopts shadcn/ui or Material, overrides it component by component as each screen is built, and eighteen months later owns a fork it cannot upgrade — with none of the speed that adoption promised.

## The rule

**Theme at the token layer. Never fork a component to restyle it.**

Every serious component system exposes a small set of named values — CSS custom properties, Material colour roles, SwiftUI's semantic colours — that its components read. Change those and the whole library moves together. Reach past them into a component's internals and you have started a fork, whether or not you meant to.

Use `import_design_tokens` to read what the system already names before you change anything: it reports the roles present, the roles left undefined, and the contrast of the pairs it defines. Then use `generate_color_system` for a complete, contrast-verified set and map it onto those names.

## shadcn/ui

Not a dependency — the CLI copies components into your repo, so you own the source. That makes overriding tempting and forking easy. Resist both: it ships a token layer for exactly this.

- **The convention is paired.** Every surface role has a matching text role: `--background` / `--foreground`, `--card` / `--card-foreground`, `--primary` / `--primary-foreground`, `--muted` / `--muted-foreground`. The `-foreground` value is what sits *on* that surface. Change one, change its pair.
- **Map, don't rename.** Your `surface` becomes `--card`, your `onPrimary` becomes `--primary-foreground`. Renaming the variables means re-editing every component, which is the fork you were avoiding.
- **`--muted-foreground` is the one that fails.** It is the default for secondary text, timestamps, table meta and placeholder copy, and out of the box it lands near 2.3–2.6:1 on white — under the 4.5:1 that body text needs. Verify it with `audit_accessibility` and repair with `fix_contrast` before you build on it. This is the single most common accessibility defect in shadcn-based products.
- **`--radius` is one value** that derives the rest. Set it once; do not hand-tune corners per component.
- **Dark mode is a second `:root`,** the `.dark` class block. Every role you add or change must be defined in both, or dark mode inherits a light-mode value and looks broken in one specific place nobody notices until a user reports it.

## Radix Themes

- Scales are 12 steps with fixed semantics: 1–2 backgrounds, 3–5 component backgrounds, 6–8 borders, 9–10 solid fills, 11–12 text. Respect the step meanings — using step 9 for body text is a contrast failure by construction.
- Set `accentColor`, `grayColor`, `radius` and `scaling` at the `<Theme>` root rather than styling components.
- Radix Primitives (unstyled) are the opposite case: there is nothing to theme, so your tokens are the entire visual layer. `get_component_recipe` gives you accessible reference implementations to style against.

## Material 3

- Theme through **colour roles**, never raw hex: `primary` / `onPrimary` / `primaryContainer` / `onPrimaryContainer`, and the same shape for secondary, tertiary, error, surface. The `on*` roles exist so contrast is structural rather than remembered.
- Generate the scheme from a source colour with Material's own tooling and treat the output as the contract. Hand-editing one role breaks the tonal relationships the rest of the system assumes.
- **Dynamic colour** (wallpaper-derived, Android 12+) means you do not control the palette on those devices. If your brand colour must survive, opt out deliberately — do not assume.
- Elevation is surface *tone*, not shadow. Porting a CSS shadow ramp onto Material is a category error; see `compare_design_languages("elevation")`.

## Apple platforms

- Use semantic colours (`.label`, `.secondaryLabel`, `.systemBackground`, `.separator`) rather than fixed values. They adapt to light/dark, Increase Contrast and vibrancy for free — a hardcoded hex does none of that.
- Brand colour belongs in the accent/tint, and in the few surfaces that carry identity. Repainting standard controls is what makes an iOS app feel non-native.
- Dynamic Type is part of theming, not a separate task: a theme that assumes fixed text sizes breaks at accessibility sizes.

## Checklist

- [ ] `import_design_tokens` run on the system's own theme file before changing anything.
- [ ] Every value you change is a token the library reads — no component internals edited.
- [ ] Variable *names* kept as the library defines them; only values changed.
- [ ] Every role defined in both light and dark blocks.
- [ ] Every text/surface pair checked with `audit_accessibility`; failures repaired with `fix_contrast`.
- [ ] Secondary/muted text specifically verified — it is the usual failure.
- [ ] One radius value and one type scale, set at the theme root.
- [ ] An upgrade tried at least once before shipping, to prove you can still take upstream changes.
- [ ] `audit_design_system` run on the result: adopting a system and then hardcoding around it scores no better than having none.

## Anti-patterns

- **Forking a component to restyle it.** The moment you edit internals for appearance, you own maintenance forever and lose upgrades. Almost always the token layer could have done it.
- **Renaming the library's variables to match your own vocabulary.** Cosmetic, and it costs you every future upgrade. Map your names to theirs at the boundary instead.
- **Theming light mode and inferring dark.** Dark is not an inversion; unset roles fail silently in one component at a time.
- **Shipping the default muted/secondary text unverified.** It is the most-used text role after body and the most likely to fail contrast.
- **Adopting a system for speed, then overriding it screen by screen.** You end up with the constraints of someone else's system and none of the benefit. Either theme it properly or do not adopt it.
- **Treating the theme as done at launch.** Every new role added later needs the same light/dark and contrast checks as the originals.

See also: [[design-systems-methodology]], [[design-tokens-theming]], [[color-systems]], [[accessibility]], [[design-handoff]].
