// Cross-platform design-language comparison.
//
// The most common expensive mistake in multi-platform work is porting a
// *solution* instead of an *intent*: shipping a Material top app bar with a
// back arrow on iOS, or an iOS-style segmented control on Android. Each row
// below states the intent, then how each platform expresses it, then the
// porting rule — including the cases where the honest answer is "don't".
//
// Curated and deterministic; the platform reference docs (get_design_language)
// carry the full specs and their sources.

export const COMPARE_TOPICS = [
  "navigation",
  "buttons",
  "modals-sheets",
  "typography",
  "color",
  "elevation",
  "motion",
  "forms",
  "lists",
  "icons",
  "search",
  "settings",
] as const;

export type CompareTopic = (typeof COMPARE_TOPICS)[number];
export type ComparePlatform = "ios" | "android" | "macos" | "web";

export const COMPARE_PLATFORMS: ComparePlatform[] = ["ios", "android", "macos", "web"];

const PLATFORM_LABEL: Record<ComparePlatform, string> = {
  ios: "iOS (HIG / Liquid Glass)",
  android: "Android (Material 3)",
  macos: "macOS (HIG)",
  web: "Web",
};

const PLATFORM_DOC: Record<ComparePlatform, string> = {
  ios: "ios-app-design",
  android: "material-3",
  macos: "macos-app-design",
  web: "web-trends-2026",
};

interface Row {
  aspect: string;
  ios: string;
  android: string;
  macos: string;
  web: string;
}

interface TopicEntry {
  title: string;
  intent: string;
  rows: Row[];
  porting: string[];
  doNotPort: string[];
  docs: string[];
}

const TOPICS: Record<CompareTopic, TopicEntry> = {
  navigation: {
    title: "Primary navigation",
    intent: "Let someone see the app's top-level destinations, know where they are, and get back.",
    rows: [
      {
        aspect: "Top-level switcher",
        ios: "Tab bar pinned to the bottom, 2–5 tabs. Tapping the active tab scrolls to top / pops to root.",
        android: "Navigation bar (3–5 destinations) on compact; navigation rail on medium; drawer only for many destinations.",
        macos: "Source-list sidebar (collapsible), often with a segmented control in the toolbar for modes.",
        web: "Top horizontal nav for marketing; persistent left sidebar for apps. No universal convention — be conventional for your category.",
      },
      {
        aspect: "Going back",
        ios: "Back button top-left with the previous screen's title, plus the interactive edge-swipe gesture — which must always work.",
        android: "System back (gesture or button) is global and must be honored; predictive back shows the destination during the swipe.",
        macos: "Back/forward in the toolbar; ⌘[ / ⌘]. Window history, not a stack, in most apps.",
        web: "Browser back must not break. In-app breadcrumbs for depth; never trap history with modal state.",
      },
      {
        aspect: "Titles",
        ios: "Large title that collapses into a compact title on scroll.",
        android: "Top app bar title; large/medium variants collapse on scroll.",
        macos: "Window title in the title bar; toolbar carries actions, not identity.",
        web: "<h1> per page, and the <title> tag — both matter for SEO and for screen readers.",
      },
      {
        aspect: "Depth model",
        ios: "Stack navigation — push/pop, one path.",
        android: "Back stack with predictable up-vs-back semantics.",
        macos: "Multiple windows and tabs; depth lives across windows, not within one.",
        web: "URL is the navigation state. Every meaningful view should be linkable.",
      },
    ],
    porting: [
      "Port the destinations, not the chrome: the same 4 top-level areas become a tab bar on iOS, a navigation bar/rail on Android, a sidebar on macOS, a top nav or sidebar on web.",
      "On web, make every state addressable by URL — that is web's equivalent of the native back stack.",
      "Keep the count small everywhere: if you need more than 5 top-level destinations, the information architecture is the problem, not the component.",
    ],
    doNotPort: [
      "A bottom tab bar onto macOS or a desktop-width website.",
      "An iOS-style top-left back chevron onto Android — the system back is already there.",
      "A hamburger drawer onto iOS as the primary navigation.",
    ],
    docs: ["navigation", "mobile-navigation-home", "information-architecture"],
  },

  buttons: {
    title: "Buttons & actions",
    intent: "Make the one thing you want the user to do obvious, reachable, and clearly interactive.",
    rows: [
      {
        aspect: "Hierarchy",
        ios: "Filled/prominent for the primary action, tinted for secondary, plain text for tertiary. One prominent action per screen.",
        android: "Filled → tonal → outlined → text, in that order of emphasis. FAB for the single most likely screen action.",
        macos: "Default (accent, responds to Return) → bordered → borderless. Destructive actions are red and never the default.",
        web: "Solid primary, outline/ghost secondary, link tertiary. One primary per view.",
      },
      {
        aspect: "Minimum target",
        ios: "44×44pt.",
        android: "48×48dp.",
        macos: "Pointer-sized controls are smaller, but keep ≥24px hit areas and generous spacing.",
        web: "24×24px minimum (WCAG 2.2 AA, 2.5.8); 44×44 recommended for anything touched.",
      },
      {
        aspect: "Shape",
        ios: "Capsule or continuous-corner rounded rect; corner radius scales with size.",
        android: "M3 Expressive shape scale — full-round by default for buttons.",
        macos: "Small radius, compact height; consistent across the window.",
        web: "Your choice — but exactly one radius language across the whole UI.",
      },
      {
        aspect: "States",
        ios: "Pressed dim/scale, disabled at reduced opacity, plus haptic feedback on commit.",
        android: "Ripple on press, state-layer opacities for hover/focus/press/drag.",
        macos: "Hover highlight, focus ring, key-equivalent hint. Keyboard is a first-class input.",
        web: "Hover, focus-visible (never remove it), active, disabled, loading — all five, always.",
      },
    ],
    porting: [
      "Port the hierarchy (one primary, the rest quieter), not the shape or the ripple.",
      "Recompute the touch target per platform — 44pt and 48dp are not the same number, and both differ from web's 24px floor.",
      "A FAB has no equivalent on iOS or macOS: promote the action into the toolbar or a prominent inline button instead.",
    ],
    doNotPort: [
      "Material ripple onto iOS/macOS.",
      "A capsule iOS button style onto Android where the platform shape scale already answers it.",
      "Desktop-sized hit areas onto touch.",
    ],
    docs: ["buttons", "accessibility"],
  },

  "modals-sheets": {
    title: "Modals, sheets & dialogs",
    intent: "Interrupt for something that genuinely needs a decision, then get out of the way.",
    rows: [
      {
        aspect: "Default container",
        ios: "Sheet with detents (medium/large), grabber, swipe-to-dismiss. Alerts only for consequential confirmations.",
        android: "Bottom sheet (modal or standard); dialogs for short confirmations; full-screen dialog for complex input.",
        macos: "Sheet attached to the window for document-scoped work; separate panel/window for inspectors; alerts sparingly.",
        web: "Centered dialog (<dialog> / role=dialog) with a focus trap; bottom sheet on mobile widths; side drawer for filters.",
      },
      {
        aspect: "Dismissal",
        ios: "Swipe down, Cancel button, tap outside for non-destructive sheets.",
        android: "System back dismisses; scrim tap; drag down.",
        macos: "Esc, Cancel button, or the sheet's own dismiss control.",
        web: "Esc, scrim click, and an always-visible close button. Return focus to the trigger.",
      },
      {
        aspect: "When NOT to use one",
        ios: "Anything the user will want to come back to — push a screen instead.",
        android: "Frequent, non-blocking info — use a snackbar or inline area.",
        macos: "Long-lived tools — use an inspector pane, not a modal.",
        web: "Content that should be linkable or indexable — make it a page.",
      },
    ],
    porting: [
      "Port the *decision* the modal is asking for. If a mobile sheet exists to fit a small screen, the desktop answer is often an inline panel, not a dialog.",
      "Focus management is the web's substitute for the platform's automatic modality: trap focus, restore it on close, label the dialog.",
    ],
    doNotPort: [
      "Stacked modals — a modal opening a modal is a structural bug on every platform.",
      "A bottom sheet onto a wide desktop viewport.",
    ],
    docs: ["cards-lists-modals", "principles-heuristics"],
  },

  typography: {
    title: "Typography",
    intent: "Establish hierarchy and stay readable at every user text size.",
    rows: [
      {
        aspect: "System face",
        ios: "SF Pro (SF Pro Text / Display switch by size); SF Rounded for friendlier surfaces.",
        android: "Roboto / Roboto Flex, with M3's type-scale roles.",
        macos: "SF Pro, generally at smaller sizes and tighter leading than iOS.",
        web: "System stack or a licensed webfont; subset it and preload it or it costs you LCP.",
      },
      {
        aspect: "Scale",
        ios: "Named text styles (largeTitle…caption2) — use the style, not a raw point size.",
        android: "M3 roles: display / headline / title / body / label, each in L/M/S.",
        macos: "Same named styles as iOS, smaller defaults; denser UI.",
        web: "A modular scale (see generate_type_scale). Body 16px minimum; never set font-size in px.",
      },
      {
        aspect: "User text scaling",
        ios: "Dynamic Type — support it, including accessibility sizes. Layouts must reflow.",
        android: "Font-size scaling in system settings; use sp units, never dp, for text.",
        macos: "Less prominent, but respect it and never hardcode heights around text.",
        web: "Browser zoom + user font size. rem everywhere; no fixed-height text containers.",
      },
      {
        aspect: "Measure",
        ios: "Naturally narrow — the screen enforces it.",
        android: "Same.",
        macos: "Constrain prose columns; do not let text stretch across a wide window.",
        web: "45–75 characters. The single most common desktop typography failure.",
      },
    ],
    porting: [
      "Port the hierarchy (how many levels, and their relative weight), not the point sizes — each platform's baseline differs.",
      "If your design breaks at 200% text size on any platform, it is broken, not 'edge case'.",
    ],
    doNotPort: ["Fixed pixel sizes across platforms.", "Desktop line lengths onto a phone, or phone leading onto desktop."],
    docs: ["typography", "typography-craft", "accessibility"],
  },

  color: {
    title: "Color & theming",
    intent: "Carry brand and meaning while staying legible in both appearances.",
    rows: [
      {
        aspect: "System colors",
        ios: "Semantic system colors (label, secondaryLabel, systemBackground…) adapt to light/dark and increased contrast automatically.",
        android: "M3 color roles from a tonal palette; dynamic color can derive the scheme from the user's wallpaper.",
        macos: "Same semantic colors as iOS, plus the user's accent color and vibrancy over materials.",
        web: "Your own semantic tokens + `color-scheme` and `prefers-color-scheme`.",
      },
      {
        aspect: "Dark mode",
        ios: "Not optional. Elevated surfaces get lighter, not darker; avoid pure black except on OLED-intentional designs.",
        android: "Surface-tone elevation replaces heavy shadows in dark theme.",
        macos: "Materials and vibrancy carry depth; test over both light and dark desktops.",
        web: "Same discipline; also fix the scrollbars, form controls and images that light-mode assumptions leak into.",
      },
      {
        aspect: "Contrast floor",
        ios: "4.5:1 body text, 3:1 large text and UI. Support Increase Contrast.",
        android: "Same WCAG floors; M3 on-color roles are designed to meet them.",
        macos: "Same.",
        web: "WCAG 2.2 AA is the baseline you will be measured against — verify with audit_accessibility.",
      },
    ],
    porting: [
      "Port the *roles* (background / surface / border / text / primary / on-primary), not the hex values — each platform derives real colors from the roles.",
      "Generate one role set with generate_color_system and emit it per platform with generate_design_tokens.",
    ],
    doNotPort: ["A light-mode-only palette.", "Brand colors used as text colors without re-checking contrast on each platform's background."],
    docs: ["color-systems", "design-tokens-theming", "accessibility"],
  },

  elevation: {
    title: "Elevation & depth",
    intent: "Communicate what floats above what, without decorating.",
    rows: [
      {
        aspect: "Mechanism",
        ios: "Liquid Glass materials, blur and translucency; shadows are subtle and used sparingly.",
        android: "M3 uses surface tone + a small shadow; tonal elevation carries most of the signal.",
        macos: "Vibrancy and materials over the desktop; window shadows are the system's job.",
        web: "Box-shadow ramps plus backdrop-filter. Easy to overdo — one ramp, used consistently.",
      },
      {
        aspect: "Levels",
        ios: "Few: base, raised card, sheet, alert.",
        android: "M3 levels 0–5, each mapped to a surface tone.",
        macos: "Base, panel, sheet, popover.",
        web: "flat → raised → overlay → sticky → modal is enough for almost every product (see generate_elevation_system).",
      },
    ],
    porting: [
      "Port the layering *order*, not the shadow values — a Material tonal elevation has no direct CSS equivalent and vice versa.",
      "In dark themes, raise by lightening the surface rather than deepening the shadow.",
    ],
    doNotPort: ["Heavy CSS drop shadows onto iOS/macOS, where materials do this job.", "Frosted-glass effects onto low-end Android without checking performance."],
    docs: ["apple-hig-liquid-glass", "material-3", "visual-craft-standards"],
  },

  motion: {
    title: "Motion",
    intent: "Explain what changed and where it came from — never to decorate.",
    rows: [
      {
        aspect: "Physics",
        ios: "Spring-based, interruptible, gesture-driven. Animation must track the finger and be reversible mid-flight.",
        android: "M3 Expressive spring tokens (spatial vs effects); predictive back previews the destination.",
        macos: "Quicker and subtler — pointer input has no travel time to cover.",
        web: "ease-out on enter, ease-in on exit, 150–300ms for most UI. Springs where you can afford them.",
      },
      {
        aspect: "Duration",
        ios: "~0.3–0.5s for screen transitions, shorter for controls.",
        android: "Short 50–200ms, medium 250–400ms, long 450–600ms token sets.",
        macos: "150–250ms typical.",
        web: "Under 300ms unless the movement covers real distance.",
      },
      {
        aspect: "Reduced motion",
        ios: "Respect Reduce Motion — cross-fade instead of moving/scaling.",
        android: "Respect the animator duration scale and reduced-motion setting.",
        macos: "Same as iOS.",
        web: "`prefers-reduced-motion` — swap transform animation for opacity, never remove feedback entirely.",
      },
    ],
    porting: [
      "Port the *choreography* — what moves, from where, in what order — and re-tune durations per platform.",
      "Interruptibility is the highest-value property to carry across: any animation the user can start must be reversible.",
    ],
    doNotPort: ["Long, cinematic transitions from a marketing site into a productivity app.", "Ripples, or bounces tuned for a phone, onto a pointer-driven desktop."],
    docs: ["motion-microinteractions", "animation-craft", "wwdc-design-principles"],
  },

  forms: {
    title: "Forms & input",
    intent: "Get the data with the fewest possible decisions and no surprises.",
    rows: [
      {
        aspect: "Field style",
        ios: "Grouped inset rows or bordered fields; labels above or as leading row text.",
        android: "M3 filled or outlined text fields with a floating label and supporting text.",
        macos: "Right-aligned labels beside compact fields; tab order is a design decision.",
        web: "Label always visible above the field. A placeholder is not a label.",
      },
      {
        aspect: "Keyboard",
        ios: "Correct keyboard type + textContentType for autofill; the keyboard must never cover the focused field.",
        android: "inputType + autofill hints; same coverage rule.",
        macos: "Full keyboard navigation, Return to submit, Esc to cancel.",
        web: "type/inputmode/autocomplete attributes — they are half of mobile form UX.",
      },
      {
        aspect: "Validation",
        ios: "Validate on blur/submit; inline messages next to the field.",
        android: "Same, using the field's error state and supporting text.",
        macos: "Inline, plus disable submit only when you can explain why.",
        web: "Inline, specific, and never only by color. Preserve what the user typed.",
      },
    ],
    porting: [
      "Port the field order and the validation rules; re-implement the control with the platform's native component every time.",
      "Autofill hints are platform-specific and are the highest-ROI detail in any form.",
    ],
    doNotPort: ["Custom-drawn text fields that lose autofill, dictation and accessibility.", "Placeholder-as-label onto any platform."],
    docs: ["forms-inputs", "ux-writing", "accessibility"],
  },

  lists: {
    title: "Lists & collections",
    intent: "Show many items so that scanning, acting and reaching the end all feel effortless.",
    rows: [
      {
        aspect: "Row anatomy",
        ios: "Inset grouped or plain rows; leading icon/avatar, title + subtitle, trailing detail/chevron.",
        android: "M3 list items (one/two/three-line) with leading and trailing slots.",
        macos: "Denser rows, multi-column tables, sortable headers, selection semantics.",
        web: "Cards or table rows — pick one per view and keep the anatomy identical across items.",
      },
      {
        aspect: "Item actions",
        ios: "Swipe actions (leading/trailing), context menu on long press.",
        android: "Swipe-to-dismiss, long-press for contextual action mode.",
        macos: "Right-click context menu, keyboard shortcuts, drag & drop.",
        web: "Visible action buttons or a kebab menu — hover-only actions are invisible on touch.",
      },
      {
        aspect: "Empty & loading",
        ios: "Skeletons or a spinner, then an empty state that explains and offers one action.",
        android: "Same.",
        macos: "Same, plus a sensible zero-selection state in detail panes.",
        web: "Skeletons matching the final layout, so nothing shifts (CLS).",
      },
    ],
    porting: [
      "Port the row anatomy and sort/filter model; re-map the gestures — a swipe action needs a visible equivalent anywhere a pointer is the input.",
      "Every list needs its empty, loading, error and end-of-list states designed on every platform.",
    ],
    doNotPort: ["Hidden swipe-only actions onto desktop.", "Infinite scroll into a view that also has a footer."],
    docs: ["cards-lists-modals", "mobile-empty-states-buttons", "web-dashboards"],
  },

  icons: {
    title: "Iconography",
    intent: "Speed up recognition without becoming decoration or ambiguity.",
    rows: [
      {
        aspect: "System set",
        ios: "SF Symbols — weight and scale match the adjacent text automatically.",
        android: "Material Symbols, with variable weight/fill/grade axes.",
        macos: "SF Symbols, typically smaller and lighter.",
        web: "One open-source family (Lucide, Phosphor, Tabler…) — see suggest_icon_library.",
      },
      {
        aspect: "Labels",
        ios: "Tab-bar icons are labelled. Icon-only actions need an accessibility label.",
        android: "Navigation destinations labelled; same accessibility rule.",
        macos: "Toolbar icons need tooltips and menu-bar equivalents.",
        web: "Icon-only buttons need aria-label — design_lint flags the ones that don't.",
      },
    ],
    porting: [
      "Port the *meaning*; swap the family. SF Symbols cannot be shipped on Android or the web, and Material Symbols look foreign on iOS.",
      "Keep one family per platform build, at one weight — mixing families is the most visible cheapness in an interface.",
    ],
    doNotPort: ["SF Symbols assets outside Apple platforms (licensing).", "Two icon families in one product."],
    docs: ["iconography"],
  },

  search: {
    title: "Search",
    intent: "Let someone find a known item faster than they could navigate to it.",
    rows: [
      {
        aspect: "Placement",
        ios: "Search bar in the navigation bar, revealed on pull-down, or a dedicated tab.",
        android: "M3 search bar that expands into a full-screen search view.",
        macos: "Toolbar search field, ⌘F for find-in-view; a command palette for actions.",
        web: "Header search for content sites; ⌘K command palette for apps.",
      },
      {
        aspect: "Behavior",
        ios: "Live results as you type; scoped filters below the bar.",
        android: "Suggestions in the expanded view; recent queries first.",
        macos: "Instant filtering, keyboard-navigable results, Return opens.",
        web: "Debounced queries, keyboard navigation, and a real zero-results state with a next step.",
      },
    ],
    porting: [
      "Port the index and the ranking; re-place the entry point per platform convention.",
      "Design the zero-results state everywhere — it is the state users hit when they most need help.",
    ],
    doNotPort: ["A ⌘K palette as the *only* way to search on a touch device."],
    docs: ["navigation", "information-architecture"],
  },

  settings: {
    title: "Settings & preferences",
    intent: "Let people change what they need without reading a manual — and reverse it.",
    rows: [
      {
        aspect: "Structure",
        ios: "Grouped list, sections with footnotes explaining consequences; destructive items last and red.",
        android: "Preference screens with categories; switches inline.",
        macos: "Settings window with tabs/sidebar; changes apply immediately.",
        web: "Sectioned settings page with anchors; save explicitly or show a clear autosave indicator.",
      },
      {
        aspect: "Applying changes",
        ios: "Immediate, no Save button.",
        android: "Immediate.",
        macos: "Immediate.",
        web: "Either is acceptable — but be unambiguous about which, and never lose input on navigation.",
      },
      {
        aspect: "Account & data",
        ios: "Account, privacy, data export and deletion must be findable — increasingly a store requirement.",
        android: "Same.",
        macos: "Same.",
        web: "Same, plus honest cookie/consent handling.",
      },
    ],
    porting: [
      "Port the information architecture; adopt each platform's apply-immediately convention rather than forcing a Save button everywhere.",
      "Anything destructive needs confirmation and, where possible, an undo — on every platform.",
    ],
    doNotPort: ["A web-style Save button into native settings.", "Burying account deletion — several stores now require it to be reachable."],
    docs: ["mobile-settings-lists", "ethical-design"],
  },
};

export function compareDesignLanguages(topic: CompareTopic, platforms: ComparePlatform[] = COMPARE_PLATFORMS): string {
  const t = TOPICS[topic];
  const cols = platforms.length ? platforms : COMPARE_PLATFORMS;

  const out: string[] = [
    `# ${t.title} across platforms`,
    "",
    `**Shared intent:** ${t.intent}`,
    "",
    `| | ${cols.map((p) => PLATFORM_LABEL[p]).join(" | ")} |`,
    `|---|${cols.map(() => "---").join("|")}|`,
    ...t.rows.map((r) => `| **${r.aspect}** | ${cols.map((p) => r[p]).join(" | ")} |`),
    "",
    "## Porting rules",
    "",
    ...t.porting.map((p) => `- ${p}`),
    "",
    "## Do NOT port",
    "",
    ...t.doNotPort.map((p) => `- ${p}`),
    "",
    "## Go deeper",
    "",
    `- Platform references: ${cols.map((p) => `\`get_design_language("${PLATFORM_DOC[p]}")\``).join(" · ")}`,
    `- Topic docs: ${t.docs.map((d) => `\`get_design_doc("${d}")\``).join(" · ")}`,
    "",
    "_The rule underneath all of these: share the intent, the information architecture and the content; re-implement the control natively. A cross-platform product that feels native everywhere is one that ported decisions, not components._",
  ];
  return out.join("\n");
}
