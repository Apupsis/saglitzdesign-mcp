---
id: search-design
title: "Search — Placement, Suggestions, Scoping and the States Nobody Designs"
category: component
platform: both
tags: [search, searching, search-field, searchbar, filters, scope, tokens, suggestions, autocomplete, empty-states, zero-results, navigation, ios, ipados, macos]
sources: ["https://developer.apple.com/videos/play/wwdc2026/292/", "https://developer.apple.com/design/human-interface-guidelines/searching", "https://developer.apple.com/design/human-interface-guidelines/search-fields", "https://m3.material.io/components/search/overview", "https://www.nngroup.com/articles/search-visible-and-simple/"]
updated: 2026-08-03
---

# Search

Search is how someone reaches a known item faster than they could navigate to it — and, increasingly, how they discover what they did not know was there. It is also the feature most often shipped as a field and a list, with none of the states that decide whether it works.

Two questions settle most of the design before any pixels:

1. **How do people navigate this app?** A tabbed app, a sidebar app and a single-stack app each put search somewhere different.
2. **What is the scope of this search?** Whatever you scope it to is what people will believe the app contains.

## The field itself

Four parts, and each does a job:

- **Leading search icon** — the visual identity of the control; it is how the field is recognised before it is read.
- **Placeholder** — says where you are typing and, when useful, what will be searched. It is not a label and not a tip.
- **Clear button** — appears once there is text. Its absence is a small, constant irritation.
- **Cancel affordance** — on touch, focusing search should offer a way out that also dismisses the keyboard.

The field should adopt the presentation of wherever it sits: glass-and-floating in a toolbar, plain in a scrolling region. A search field styled identically in both places is wrong in one of them.

## Placement

### Touch (iOS)

- **Bottom toolbar** — the ergonomic default. It animates up over the keyboard, which puts the field, the keyboard and the thumb in the same place. Choose this unless something else already owns the bottom.
- **Top toolbar** — when the bottom is taken by sheets or other controls.
- **Dedicated search tab** — when search is a primary way to use the app, not an accessory to it.
- **Inline, below the toolbar or in content** — for a list you filter rather than a corpus you query. It stays at the top when active.

### Pointer and large screens (iPad, Mac, web)

- **Trailing position in the toolbar** is the strong default for split views. It lets someone move through results while the selected item stays visible in the detail pane — the reason Mail-shaped apps put it there.
- **In the sidebar** when search filters the navigation itself rather than the content.
- **Dedicated search tab or page** for apps with many distinct sections.
- The field should scale with available width and collapse to a button when there is none.

Keep large-screen behaviour aligned across iPad and desktop; a person who learns one should not have to relearn the other.

### Two flavours of a search tab

- **Standard** — tapping the tab opens a landing page with the field at the top. Right when the mindset is exploratory and the page itself has something to offer.
- **Prominent** — tapping the tab focuses the field and raises the keyboard immediately. Right when people arrive already knowing what they want.

Choosing the wrong one is a common, quiet cost: a browse-first audience gets a keyboard they did not ask for, or a look-it-up audience has to tap twice every time.

## Suggestions and recents

- On touch, show recents and suggestions **inline** as soon as the field is focused. On pointer platforms in a toolbar or sidebar, a menu is the natural home. In a search tab, present them alongside whatever the page already suggests.
- **Be selective about recents.** A complete history is not a feature. Offer swipe-to-remove per item and a clear-all in the header — search history is personal, and people must be able to get rid of it.
- **Predictive suggestions must correspond to what is being typed**, and must visually distinguish what the person typed from what you are proposing. Without that distinction, the field reads as if it is editing itself.
- **Limit how many you show.** Suggestions exist to shorten the path to results, not to compete with them.

Ranked well, people should not have to finish typing.

## Narrowing: scope bars, filters, tokens

Three mechanisms, and they are not interchangeable.

- **Scope bar** — lightweight, for switching between a small, fixed set of locations. "All Mailboxes" versus "This Mailbox".
- **Filters** — robust, for narrowing a large result set. Show only filters that are relevant to what is being searched; a filter that never applies is noise on every other search.
- **Tokens** — keywords that become chips inside the field, combinable into a natural-language query: photos, from Joshua Tree, in 2021. Powerful and **not discoverable**. Never use tokens as the only way to filter. They work when they are the fast path next to a visible scope bar or filter control, not when they replace one.

## The states nobody designs

- **Zero results.** Never a blank view. Show a search symbol, a title, a sentence saying nothing matched — and **echo the query back**, because the fastest way for someone to spot their own typo is to see it. Then offer a next step: clear the filter, broaden the scope, or a suggestion.
- **Empty, before typing.** This is the recents-and-suggestions state, and it is prime real estate. An empty field over an empty page teaches people the search is not worth using.
- **Loading.** Results arriving in a jolt read as slowness even when they are fast. Reserve the space.
- **Error and offline.** Say which, and whether retrying will help.

## Checklist

- [ ] Placement chosen from how the app is navigated, not from where there was room.
- [ ] Scope is explicit, and matches what people will assume the app contains.
- [ ] Field has icon, placeholder, clear button, and a way out that dismisses the keyboard.
- [ ] Recents are trimmed, removable individually, and clearable wholesale.
- [ ] Predictive text visually separates what was typed from what is proposed.
- [ ] Filters shown are relevant to the current query.
- [ ] Tokens, if used, sit beside a visible filter control rather than replacing it.
- [ ] Zero-results state names the query and offers a next step.
- [ ] Empty-before-typing state earns its space.
- [ ] Results reachable without finishing the query.
- [ ] Keyboard: correct type, Return submits, Escape dismisses on pointer platforms, and results are keyboard-navigable.

## Anti-patterns

- **A field with no scope statement.** People conclude the app does not contain what they searched for, when it was only searching one section.
- **Tokens as the only filter.** Invisible power. Discoverable to the team that built it and nobody else.
- **A blank zero-results view.** The single most common search defect, and the cheapest to fix.
- **Search history that cannot be cleared.** A privacy problem, not a convenience feature.
- **A prominent search tab for a browsing audience.** The keyboard arrives before the intent does.
- **Suggestions that outnumber results.** The list becomes a maze instead of a shortcut.
- **A command palette as the only search on a touch device.** See `compare_design_languages("search")` for what does and does not port between platforms.
- **Hover-only affordances in results.** Invisible on touch.

See also: [[navigation]], [[information-architecture]], [[mobile-empty-states-buttons]], [[forms-inputs]], [[ios-app-design]], [[macos-app-design]], [[web-dashboards]].
