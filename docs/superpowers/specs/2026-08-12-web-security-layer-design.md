# Web security layer — design

**Date:** 2026-08-12
**Target release:** v0.20.0
**Status:** approved, ready for implementation

## Why

The knowledge base has 88 documents and does not contain the string
`Content-Security-Policy`. Nor `OWASP`, `XSS`, `CSRF`, `SameSite`, `HttpOnly`,
`Subresource Integrity`, `HSTS`, or `clickjacking` — not once, in any file. The
files that match a search for "security" are `fintech-trust`,
`ecommerce-checkout` and `branding-identity`, where the word means a trust badge.

So a site built end to end from this server's guidance ships with no CSP, no
Trusted Types, unpinned third-party scripts, and whatever cookie defaults the
framework happened to pick. Every other axis is covered to a professional
standard — that gap is the one thing between this and shippable work.

This package closes it for the web. Native mobile security is a separate body of
knowledge and gets its own spec.

## The rule that shapes the whole design

**Every rule the tool fires cites the document that explains it.**

`LintFinding` already carries `doc?`, and `lint.ts` uses it — `doc: "accessibility"`,
`doc: "iconography"`. The security tool extends that pattern rather than inventing
one: a finding names the defect, the fix, and the section a person can read to
understand why it matters.

The reason this matters more for security than for design: a design warning that
someone doesn't understand gets ignored, which costs polish. A security warning
that someone doesn't understand gets suppressed, which costs the breach. Findings
without reachable reasoning train people to silence the tool.

## The second rule: no heuristics

Every rule ships only if it is high-confidence. No "this looks like it might be
unsanitised" pattern matching, no entropy-guessing at secrets beyond obvious
assignment shapes.

A false positive in a design linter is noise. A false positive in a security
linter is worse than noise — it teaches the reader that the security output is
unreliable, and the true positive in the next run gets skimmed past with the rest.
A rule that cannot be stated as a fact about the source is not shipped.

## Scope

**In:** the web front end and its deployment configuration — what a designer or
frontend developer ships wrong.

**Out, deliberately:**

- **Live HTTP header checks.** The README's promise is that the server reads only
  local files, has no external API, and nothing leaves the machine. A security
  tool that opens a network socket to do its job would contradict the position it
  exists to defend. Header state is inferred from local configuration instead.
- **Server-side security** — SQL injection, IDOR, authorization logic, API
  authentication. This is a design server. Auditing backend access control would
  be done badly and would blur what the product is. The documents state the
  boundary out loud rather than leaving a reader to assume coverage.
- **Native mobile** — Keychain/Keystore, ATS, certificate pinning, biometrics,
  privacy manifests. Separate spec.
- **`audit_project` integration.** Sensible, but it widens this package. It lands
  as a small follow-up once `audit_security` is proven.

## Knowledge: `knowledge/security/`, five documents

New category `security`, platform `web`. Existing frontmatter contract
(`id`, `title`, `category`, `platform`, `tags`, `sources`, `updated`),
prescriptive, with numbers.

### Source policy

Security guidance is the one category where a confidently wrong, stale answer
does direct harm — a reader who deploys a policy from a 2019 blog post gets a
false sense of coverage. So sourcing is a hard constraint here, not a preference.

**Permitted sources**, in order of preference:

1. Standards bodies and their reference documentation — W3C, WHATWG, IETF RFCs,
   MDN, FIDO Alliance/WebAuthn specs.
2. The implementers — web.dev, Chrome Developers, WebKit, Mozilla security blog,
   the framework's own security documentation (Next.js, Astro, SvelteKit).
3. OWASP — Top 10, ASVS, and the Cheat Sheet Series.
4. Regulators for the privacy document — EDPB guidelines, the ICO, the KVKK
   authority. Not law-firm marketing pages.

**Not permitted as the basis for a rule:** SEO content blogs, listicles,
Medium/dev.to posts, vendor pages selling a scanner. If a claim appears only in
that tier, it does not go in.

**Currency:** every claim is verified against the source as of the writing date,
and anything version-dependent (baseline browser support, header deprecation,
threshold values) states which. Where a widely-repeated claim turns out to be
wrong, the document says so explicitly — `technical-seo` already does this for
the fabricated "LCP threshold dropped to 2.0s" claim, and that myth-check habit
carries over. A superseded mechanism is named as superseded rather than omitted,
because readers arrive carrying it: `X-Frame-Options`, `X-XSS-Protection`,
Expect-CT, `document.domain`.

Each document's `sources` array lists what was actually read, and the `updated`
date is the verification date — not the date the file was created.

### `web-security-headers`

CSP as the centrepiece: nonce vs hash vs `strict-dynamic`, and why host
allowlists fail in practice. `object-src 'none'`, `base-uri 'none'`,
`frame-ancestors`. Report-only rollout with `report-to` before enforcement.
Trusted Types (`require-trusted-types-for 'script'`) as the DOM-XSS class
eliminator. HSTS with `preload` and an explicit warning that preload is
effectively irreversible. COOP/COEP/CORP and when cross-origin isolation is
actually required. Permissions-Policy defaults for camera/mic/geolocation.
Referrer-Policy, X-Content-Type-Options. SRI for every third-party script.

Closes with a paste-ready starter policy per stack (Next.js middleware with a
nonce, Vite/static, Astro) **and what each one breaks** — inline styles, analytics
snippets, embedded video. A policy nobody can deploy because it broke the site
gets reverted, and the reverted state is worse than never having started.

### `auth-and-session-ux`

Where security and UX genuinely meet, which is why it belongs in this server.

Passkeys/WebAuthn as the 2026 default, conditional UI (autofill), and the
fallback ladder for users who can't or won't. Cookie rules: `__Host-` prefix,
`HttpOnly`, `Secure`, `SameSite=Lax` vs `Strict` vs `None`, and why a token in
`localStorage` turns any XSS into full account takeover. Idle vs absolute session
timeout. Step-up re-authentication before sensitive actions. CSRF: double-submit
vs SameSite-only, and the cases where SameSite alone is not enough. Rate limiting
and lockout that don't enable account enumeration. The account-takeover paths that
are always flows, never code: password reset, email change, 2FA enrolment and
recovery.

Error copy that doesn't leak — cross-linked to `ux-writing`.

### `frontend-attack-surface`

XSS by context (HTML body, attribute, URL, JS, CSS) and why escaping is
context-dependent — the single most common wrong mental model.
`dangerouslySetInnerHTML` / `v-html` / `{@html}`: when it is ever acceptable and
what sanitiser to reach for. Reverse tabnabbing. `javascript:` and `data:` URLs
built from user input. Open redirects. `postMessage` origin validation. iframe
`sandbox`. Clickjacking, and why `frame-ancestors` supersedes `X-Frame-Options`.
Third-party scripts as an XSS and supply-chain vector — SRI, self-hosting,
subresource budgets. Secrets that leak into the bundle: `NEXT_PUBLIC_*` /
`VITE_*`, source maps in production.

### `privacy-consent-and-tracking`

GDPR / KVKK / ePrivacy reduced to what the person designing the banner needs.
Consent UI that is not a dark pattern — reject as easy as accept, no pre-ticked
boxes, no interface interference — cross-linked to `ethical-design`. Gating
scripts before consent, and Consent Mode. Data minimisation and retention.
Deletion and data-access request flows as UX surfaces. Privacy-preserving
analytics options.

Carries an explicit line that it is engineering and design guidance, not legal
advice.

### `ai-feature-security`

Prompt injection reframed for the front end: model output is untrusted input.
Rendering it as markdown or HTML, and image-URL exfiltration as the quiet
channel. Confirmation UX for destructive tool calls. Partial-render XSS during
streaming. Cross-linked to `ai-product-ux`.

## Tool: `audit_security`

New `src/security.ts`. Reuses the `LintFinding` shape so output reads identically
to `design_lint`, and reuses that module's tag scanner rather than writing a
second one.

Two entry modes, matching the two shapes already in the codebase:

- `source` (string) + optional `filename` — like `design_lint`
- `path` (directory) — like `audit_project`

### Source rules

Fired over `.html`, `.htm`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.ts`, `.js`.

| Rule | Severity |
|---|---|
| `blank-without-noopener` — `target="_blank"` without `rel="noopener"` | error |
| `external-script-no-sri` — cross-origin `<script src>` without `integrity` | error |
| `http-subresource` — `src`/`href` on `http://` | error |
| `token-in-localstorage` — `localStorage.setItem` keyed on token/jwt/auth/session | error |
| `public-env-secret` — `NEXT_PUBLIC_*` / `VITE_*` naming SECRET/KEY/TOKEN/PASSWORD | error |
| `hardcoded-secret` — long base64/hex assigned to an obviously-secret identifier | error |
| `dangerous-html` — `dangerouslySetInnerHTML` / `v-html` / `{@html}` with no sanitiser imported in the file | warning |
| `iframe-no-sandbox` — cross-origin `<iframe>` without `sandbox` | warning |
| `postmessage-wildcard-origin` — `postMessage(…, "*")`, or a handler with no origin check | warning |
| `inline-event-handler` — `onclick=` etc. in HTML (not JSX) | warning |
| `inline-script-no-nonce` — `<script>` with a body and neither `nonce` nor `integrity` | warning |
| `password-autocomplete` — password field with `autocomplete="off"`, or missing `current-password` / `new-password` | warning |

### Configuration rules

Fired over `next.config.*`, `vercel.json`, `netlify.toml`, `_headers`,
`middleware.ts`, `astro.config.*`, `nuxt.config.*`, `svelte.config.*`,
`.env` and siblings, and a root `index.html`.

| Rule | Severity |
|---|---|
| `csp-missing` — no CSP found in any configuration source | error |
| `csp-unsafe-inline` / `csp-unsafe-eval` in `script-src` | error |
| `csp-wildcard` — `*` in `script-src` or `default-src` | error |
| `env-committed` — a `.env` present and not covered by `.gitignore` | error |
| `hsts-missing` / `hsts-short-max-age` (< 15552000) / `hsts-no-subdomains` | warning |
| `csp-missing-object-src` / `csp-missing-base-uri` / `csp-missing-frame-ancestors` | warning |
| `referrer-policy-unsafe` — set to a value that leaks more than the browser default | warning |
| `permissions-policy-missing` | warning |
| `x-content-type-options-missing` | warning |
| `sourcemaps-in-production` | warning |
| `trusted-types-absent` | info |

Configuration files are **read as text, never evaluated** — the same rule
`import_design_tokens` established for `tailwind.config.js`. A CSP assembled at
runtime from variables is reported as *undeterminable*, not as absent.

### The report

Findings, a severity summary, and — load-bearing — an explicit **"not visible to
this audit"** section: headers injected by a CDN, WAF or reverse proxy; runtime
middleware logic; anything behind a variable.

`project.ts` opens with the principle that a truncated audit which looks complete
is worse than one that says what it skipped. Security raises the stakes on that:
a clean bill of health from an audit that could not see the relevant file is not
a neutral outcome, it is an actively harmful one.

## Changes to existing code

| File | Change |
|---|---|
| `src/lint.ts` | `scanTags` and the `Tag` interface are currently private. Exported so the security rules match markup with the same scanner instead of a second, subtly-different regex |
| `src/catalog.ts:9` | `"security"` added to `CATEGORIES`; topic filters gain a security mapping |
| `src/knowledge.ts:101` | `"security"` added to `KNOWN_CATEGORIES` |
| `src/project.ts` | `scanProject` matches on exact filenames as well as extensions — `_headers` and `.env` have no extension. Additive; existing calls unaffected |
| `src/index.ts` | Tool registration with `readOnlyHint`, MCP resource registration for the new docs |
| `tests/integrity.test.ts` | Document count and category assertions |
| `README.md`, `CHANGELOG.md` | Counts, the new category, the new tool |

`UI_EXTENSIONS` is **not** modified. `audit_project` deliberately excludes
`.ts`/`.js` because linting logic files for design defects buries the real
findings — that reasoning is still correct. `audit_security` passes its own
extension set instead, so the existing tool's behaviour does not move.

## Testing

- A minimal fixture project with a deliberately bad `next.config` — `unsafe-inline`,
  no HSTS — produces exactly the expected rule ids, no more.
- A fixture with a **correct** strict CSP produces zero CSP findings. Guards the
  false-positive rule: the clean case must be provably clean.
- CSP present in `vercel.json`, in `_headers`, and in `middleware.ts` each satisfy
  `csp-missing` independently — one source is enough.
- A CSP built from a template literal reports *undeterminable*, not `csp-missing`.
- `dangerous-html` does not fire when DOMPurify is imported in the same file.
- `target="_blank"` split across lines by a formatter still fires — the tag
  scanner exists precisely so formatting never decides whether a rule matches.
- A same-origin `<script src>` does not fire `external-script-no-sri`.
- A `.env` listed in `.gitignore` does not fire `env-committed`.
- Every rule's `doc` id resolves to a document that exists. Asserted for all
  rules, not sampled — a citation pointing nowhere breaks the rule the whole
  design rests on.
- The "not visible" section is present in every report, including reports with
  zero findings.
- Every `sources` entry across the five documents is on a permitted-tier domain.
  Asserted mechanically in `integrity.test.ts` against an allowlist, so the source
  policy survives future edits instead of holding only on the day it was written.

## Out of scope for this spec, tracked

Package B (generic-design detector), Package C (SEO/GEO and performance
auditors), Package D (MCP structured output). C's tools will be written with
structured output from the start so D does not rewrite them.
