---
id: web-security-headers
title: "Web Security Headers & Content Security Policy"
category: security
platform: web
tags: [security, csp, headers, trusted-types, hsts, sri, clickjacking, cors]
sources: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP", "https://web.dev/articles/strict-csp", "https://w3c.github.io/webappsec-csp/", "https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security", "https://web.dev/articles/coop-coep", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy", "https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity", "https://web.dev/articles/trusted-types", "https://nextjs.org/docs/app/guides/content-security-policy", "https://developer.chrome.com/docs/lighthouse/best-practices/csp-xss", "https://developer.chrome.com/docs/lighthouse/best-practices/has-hsts", "https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html", "https://caniuse.com/trusted-types", "https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-XSS-Protection", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Expect-CT", "https://developer.mozilla.org/en-US/docs/Web/API/Document/domain", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/report-to", "https://docs.astro.build/en/reference/configuration-reference/", "https://nextjs.org/docs/app/api-reference/file-conventions/proxy"]
updated: 2026-08-12
---

# Web Security Headers & Content Security Policy

Response headers are the cheapest security you will ever ship: no code change, no dependency, no build step. The catch is that most published header checklists are five years stale — they still recommend headers browsers removed, and they recommend the *weak* form of the headers that still exist. Everything below was verified against the specs and vendor docs on 2026-08-12.

Ship headers, not `<meta>` tags. `frame-ancestors`, `report-uri` and `sandbox` are **ignored** when a CSP is delivered in a `<meta http-equiv>` element (CSP Level 3), so a meta-only policy silently has no clickjacking protection and no reporting.

## The one policy that matters

One header. Copy it, replace `{RANDOM}`, ship it.

```
Content-Security-Policy:
  script-src 'nonce-{RANDOM}' 'strict-dynamic' https: 'unsafe-inline';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'self';
  require-trusted-types-for 'script';
  report-uri https://example.com/csp-reports;
  report-to csp-endpoint
```

Line by line:

| Directive | Why it is there |
|---|---|
| `script-src 'nonce-{RANDOM}' 'strict-dynamic'` | The whole point. Only scripts carrying this response's nonce run, plus whatever those scripts load. |
| `https: 'unsafe-inline'` | **Backward-compat fallbacks, not a weakening.** `'strict-dynamic'` needs Chrome 52+, Edge 79+, Firefox 52+, Safari 15.4+. Browsers that support it ignore both fallbacks; browsers that don't at least get `https:`. All recent browsers ignore `'unsafe-inline'` when a nonce or hash is present. |
| `object-src 'none'` | Kills `<object>`/`<embed>` plugin-based script execution. One of the three directives a strict CSP is *defined* by. |
| `base-uri 'none'` | Blocks an injected `<base href>` from re-pointing every relative script URL at an attacker's host. `default-src` does **not** cover this. |
| `frame-ancestors 'none'` | Clickjacking. This is the real control; `X-Frame-Options` is the legacy shadow of it. Use `'self'` if you embed yourself. |
| `form-action 'self'` | Stops injected markup from posting your form data to another origin. Not covered by `default-src`. |
| `require-trusted-types-for 'script'` | See [Trusted Types](#trusted-types). Add it in report-only first. |
| `report-uri` + `report-to` | Send both. Browsers that support `report-to` ignore `report-uri`; browsers that don't still report. |

`default-src 'self'` is a reasonable extra line, but it is **not** the security boundary — `script-src`, `object-src` and `base-uri` are. A policy of `default-src 'self'` alone with no `object-src`/`base-uri` is the single most common "we have a CSP" that provides no XSS protection.

## Why host allowlists fail

The instinct is to list your CDNs: `script-src 'self' https://cdn.example.com https://www.googletagmanager.com`. Do not.

- **The majority of `script-src` allowlists can be circumvented by an attacker who already has an XSS bug**, and provide little protection against script injection (Chrome/Lighthouse, verified 2026-08-12).
- The bypass does not need the allowlisted host to be compromised. Ordinary, benign functionality is enough: **a JSONP endpoint** (`?callback=` returns attacker-chosen JS wrapped in a function name), **a hosted copy of AngularJS** (its template engine executes expressions), an **open redirect** on an allowlisted origin (path-relative script URLs follow it off-origin), or any page on that host serving user-controlled content.
- Allowlists are also unmaintainable at the size vendors demand: MDN notes that integrating Google Analytics alone asks a developer to allowlist **187 Google domains**.
- OWASP's summary: a non-strict policy "that is too granular or permissive is likely to lead to bypasses and a loss of protection."

**Rule:** allow scripts individually with a nonce or a hash and let `'strict-dynamic'` propagate that trust. A strict CSP is not URL-based, so URL-based bypasses do not apply to it. Domain allowlists remain fine for non-executable resource types (`img-src`, `font-src`, `connect-src`) — they are a XSS dead end there.

## Nonce vs hash vs strict-dynamic

**Nonce requirements — all four, or the policy is decorative:**

1. Cryptographically strong random value, **128 bits or more**, base64-encoded.
2. **Newly generated for every HTTP response.** Not per session, not per deploy, not per build.
3. Unpredictable — "in practice this means that the nonce must be different for every HTTP response, and must not be predictable" (MDN).
4. Present both in the `Content-Security-Policy` header and on each `<script nonce="…">` you intend to run.

**A nonce on a statically cached page is worthless.** This is the most common way a CSP is deployed broken, and it fails silently — the browser reports no violation, scanners score you green, and the policy protects nothing. If the HTML is generated at build time, or cached at the CDN, or served from ISR, then every visitor receives the *same* nonce, and any attacker can read it out of view-source and paste it into their injected `<script>`. MDN states it plainly: with nonces "the server cannot serve static HTML, because it must insert a new nonce each time."

That trade is real and expensive. If you cannot render dynamically per request, use hashes instead — do not use a nonce anyway.

| | Nonce | Hash | Host allowlist |
|---|---|---|---|
| Works with static HTML / CDN caching | ❌ | ✅ | ✅ |
| Needs per-request server render | ✅ | ❌ | ❌ |
| Survives a script's contents changing | ✅ | ❌ (rebuild hashes) | ✅ |
| Bypassable via JSONP / open redirect | ❌ | ❌ | ✅ (assume yes) |
| Recommended | For SSR apps | For static sites | Never, for `script-src` |

**Hashes:** `script-src 'sha256-{HASHED_INLINE_SCRIPT}' 'strict-dynamic'; object-src 'none'; base-uri 'none';`. Both the CSP and the content stay static, which is what makes hashes the right answer for static sites and client-rendered apps. Generate them at build time; several frameworks now do it for you (see [Per-stack starter](#per-stack-starter)).

**`'strict-dynamic'` honestly:** it propagates the trust of a nonced/hashed root script to every script that script loads, which is what makes the whole approach survive contact with tag managers and third-party widgets. It also *reduces* protection in one specific case — if one of your trusted scripts builds `<script>` elements from a value an attacker controls, CSP will not stop it. That is a code-review item, not a reason to go back to allowlists.

## Rolling out without breaking the site

Enforce and report-only headers can be sent **at the same time**. Ship the strict policy in report-only alongside whatever you enforce today; you break nothing while you learn.

```
Reporting-Endpoints: csp-endpoint="https://example.com/csp-reports"
Content-Security-Policy-Report-Only: script-src 'nonce-{RANDOM}' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; report-to csp-endpoint
```

Sequence:

1. **Wire the nonce first.** Generate it, put it on the header and on every first-party `<script>`. Getting this wrong is the only failure mode that matters.
2. **Report-only for 1–2 weeks minimum** — long enough to cover a marketing campaign, a A/B test, and whatever the growth team ships on a Friday. Traffic from real browsers finds things staging never will.
3. **Triage reports, do not chase them all.** Browser extensions generate large volumes of noise; violations with a `blocked-uri` of `chrome-extension:`, `moz-extension:`, `about`, or `inline` on an origin you don't recognize are usually not yours.
4. **Enforce.** Keep the report-only header for the next tightening (adding `require-trusted-types-for`, dropping the `https:` fallback).

What a strict policy typically breaks, in the order you will hit it:

- **Inline `style="…"` attributes.** A `style-src` nonce does not cover style *attributes* — nonces apply to elements. Either leave `style-src` permissive at first, or move the styles into classes. Do not solve this by loosening `script-src`.
- **Analytics and tag managers.** GTM/GA snippets are inline scripts and will be blocked. Pass the nonce into the snippet (Next.js's `<GoogleTagManager nonce={nonce} />`, or the `nonce` prop on `<Script>`). Tags injected *by* GTM are covered by `'strict-dynamic'`.
- **Embedded video and maps.** Iframes are `frame-src`, not `script-src`. A strict `script-src` doesn't block them, but a `default-src 'self'` does — add `frame-src https://www.youtube-nocookie.com` etc. explicitly.
- **Injected third-party widgets** — chat, consent banners, session replay, support bubbles. These are exactly what `'strict-dynamic'` exists for, provided the loader snippet itself carries the nonce.
- **`eval` in development.** React uses `eval` in dev to reconstruct server error stacks; you need `'unsafe-eval'` in dev only. Neither React nor Next.js use `eval` in production by default. Gate it on `NODE_ENV`.
- **WebAssembly** needs `'wasm-unsafe-eval'`, which is *not* the same as `'unsafe-eval'` and is far narrower. Use it.

## Trusted Types

`require-trusted-types-for 'script'` removes DOM XSS as a *class* instead of patching sinks one at a time. With it enforced, passing a plain string to a dangerous DOM sink throws instead of executing.

```
Content-Security-Policy-Report-Only: require-trusted-types-for 'script'; trusted-types default dompurify; report-uri https://example.com/csp-reports
```

Sinks it covers: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `iframe.srcdoc`, `document.write`/`writeln`, `DOMParser.parseFromString`, `<script src>` and script text, `<embed src>`, `<object data>`/`codebase`, `eval`, `setTimeout`, `setInterval`, `new Function()`.

**Browser support, verified 2026-08-12 — this is where LLM training data is most out of date.** Trusted Types was Chromium-only for years and most guidance still says so. It is not:

| Browser | Support |
|---|---|
| Chrome / Edge | 83+ |
| Firefox | 148+ (145–147 shipped it behind a flag) |
| Safari | 26.0+ |

MDN marks the Trusted Types API **Baseline "newly available" as of February 2026**; caniuse puts global support at roughly **90%**. Browsers that do not support it ignore the directive — the header is safe to send everywhere and costs nothing on old browsers.

Rules:

- **Additive, never a replacement.** Trusted Types stops DOM XSS (attacker string reaches a sink in your own JS). A strict `script-src` stops injected-markup XSS. You need both; neither covers the other's case.
- Report-only first, always. Enforcement throws at runtime and will take out a page.
- The only thing that can reintroduce DOM XSS once enforced is the code inside your own policies. Use `trustedTypes.createPolicy()` with a real sanitizer (DOMPurify), and use the **default policy sparingly** — prefer refactoring call sites to named policies.

## HSTS

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- `max-age=63072000` is two years — the value both Chrome/Lighthouse and OWASP recommend, and the one shown on the preload service itself.
- **The preload list requires `max-age` ≥ `31536000` (1 year) and `includeSubDomains`.** Sending `preload` without both does nothing.
- **`includeSubDomains` breaks every plain-HTTP subdomain**, immediately and for the whole `max-age`. Legacy `status.`, `mail.`, IoT callbacks, that one vendor iframe — inventory your subdomains before you send it, not after. Note the scope rule: a policy on `secure.example.com` covers `login.secure.example.com` but **not** `example.com` or `insecure.example.com`. Every host should send its own header.
- **Preload is effectively one-way.** OWASP is blunt: sending `preload` "can have **PERMANENT CONSEQUENCES** and prevent users from accessing your site and any of its subdomains if you find you need to switch back to HTTP." The list is compiled into browser binaries; removal means waiting for a browser release train to ship worldwide, on top of the `max-age` already cached in every visitor's browser. Months, not days, and not under your control.

**Rollout, don't leap:** `max-age=3600` → verify nothing broke → raise to a day, then a month → run for ~3 months clean → only then `includeSubDomains; preload` and submit. Adding `preload` on day one to score a header grade is the classic self-inflicted outage.

## Cross-origin isolation

COOP + COEP are **not** general-purpose hardening, and shipping them "for security points" is a common and expensive overreach. They exist to buy back three capabilities that Spectre took away:

- `SharedArrayBuffer` (and therefore WebAssembly threads)
- `performance.measureUserAgentSpecificMemory()`
- High-resolution timers — `performance.now()` / `performance.timeOrigin` at 5 µs resolution instead of the clamped 100 µs

**If you do not use one of those three, you do not need cross-origin isolation.** Skip this section.

If you do:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- Verify at runtime with `self.crossOriginIsolated === true`. Sending the headers is not the same as being isolated.
- `COEP: require-corp` means **every** cross-origin subresource must opt in with `Cross-Origin-Resource-Policy: same-site` or `cross-origin` (or pass CORS). Third-party images, fonts and iframes that don't will simply stop loading. This is what breaks sites.
- `Cross-Origin-Embedder-Policy: credentialless` (Chrome 96+) is the softer path: cross-origin resources load without CORP by being fetched without credentials.
- Both have report-only variants (`Cross-Origin-Embedder-Policy-Report-Only`, and COOP report-only). Use them exactly as with CSP.
- `Cross-Origin-Resource-Policy` on *your own* responses is the cheap half of this family and is worth setting independently — it stops other origins embedding your resources.

## The cheap ones

Three headers, no rollout risk, set them today.

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

**`X-Content-Type-Options: nosniff`** — for requests whose destination is `"script"` or `"style"`, the browser blocks the response when the MIME type doesn't match (a JavaScript MIME type for scripts, `text/css` for stylesheets). For everything else it uses the declared `Content-Type` as-is instead of inferring from content. This is what stops a user-uploaded `.jpg` full of JavaScript from being executed as a script. No downside, no compatibility risk.

**`Referrer-Policy: strict-origin-when-cross-origin`** — same-origin requests send origin + path + query; cross-origin requests at the same security level send origin only; HTTPS→HTTP sends nothing.

> **Myth check (verified 2026-08-12):** this is already the browser **default** when no policy is set or the value is invalid. Checklists that call a missing `Referrer-Policy` a vulnerability are describing 2019 (`no-referrer-when-downgrade` was the default until the Nov 2020 spec revision). Set it anyway — to be explicit, and to override a weaker value a framework or CDN may inject — but do not treat its absence as a finding, and do not "fix" it with `no-referrer`, which breaks your own analytics attribution for no security gain.

**`Permissions-Policy`** — `()` is an empty allowlist, meaning the feature is disabled in the top-level document *and* in every nested `<iframe>` regardless of origin. Deny by default and add back only what a page uses. Values: `*` (everywhere), `()` (nowhere), `self` (this origin only), `"https://vendor.example"` (quoted origins, space-separated) in the header.

```
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

## Subresource Integrity

Required on **every** cross-origin `<script>` and `<link rel="stylesheet">`.

```html
<script
  src="https://cdn.example.com/lib.js"
  integrity="sha384-{BASE64_OF_SHA384_DIGEST}"
  crossorigin="anonymous"></script>
```

```bash
cat lib.js | openssl dgst -sha384 -binary | openssl base64 -A
```

- Algorithms: `sha256`, `sha384`, `sha512`. `sha384` is the sensible default. If you list several, **the browser uses only the strongest algorithm present** and ignores the rest — mixing `sha256` and `sha384` does not mean "either will do."
- **`crossorigin="anonymous"` is mandatory**, not decoration. Cross-origin resources default to `no-cors` mode where the response body is unreadable, and browsers block SRI on `no-cors` requests — otherwise an attacker could probe a subresource's contents by trying hashes and watching which loads succeed. Without CORS headers on the CDN's side, the resource fails to load entirely.
- **SRI + a CDN that mutates its bundle = a blank page.** On any hash mismatch the browser refuses the resource and returns a network error. "Latest" URLs, auto-minifying CDNs, edge A/B'd bundles and font services that vary output by User-Agent are all incompatible with SRI by design.

**Therefore: self-host.** Pin the file into your own build, hash it there, serve it from your origin. You get integrity, one fewer DNS lookup, one fewer TLS handshake, no third-party outage in your critical path, and no cross-origin request to justify to a DPO. Reach for SRI when self-hosting genuinely isn't possible — and pin an immutable, versioned URL when you do.

## Superseded — do not recommend

Readers arrive carrying these. Auditors still ask for them. Omitting them does not correct anyone.

| Header / API | Status (verified 2026-08-12) | Do this instead |
|---|---|---|
| `X-Frame-Options: DENY` | Legacy. `frame-ancestors 'none'` is the standardized control and is what modern browsers honor. | `frame-ancestors`. Keeping `X-Frame-Options` alongside it is harmless for ancient clients; do not ship it *alone*. |
| `X-XSS-Protection: 1; mode=block` | **Non-standard and deprecated.** MDN warns that "in some cases, `X-XSS-Protection` can create XSS vulnerabilities in otherwise safe websites." The auditor asking for it is asking you to add a vulnerability. | CSP. If a compliance tool demands the header exist, send `X-XSS-Protection: 0`. |
| `Expect-CT` | **Obsolete.** Only Chromium implemented it; Chromium deprecated it from version 107 because it now enforces Certificate Transparency by default. Mostly moot since June 2021, when the last pre-March-2018 certificates expired. | Nothing. Delete the header. |
| `document.domain` setter | **Deprecated.** It "undermines the security protections provided by the same origin policy." Already a no-op on cross-origin-isolated pages and on pages sending `Origin-Agent-Cluster`. | `window.postMessage()` for cross-origin communication. |
| `Feature-Policy` | Renamed. | `Permissions-Policy` (different syntax — allowlists are parenthesized, origins quoted). |
| CSP `report-uri` alone | Superseded by `report-to` + `Reporting-Endpoints`, but not yet safe to drop. | Send **both**; supporting browsers ignore `report-uri`. |

## Per-stack starter

### Next.js (App Router, nonce-based)

> **Naming, verified 2026-08-12:** Next.js **16.0 deprecated `middleware.ts` and renamed the convention to `proxy.ts`**, with the exported function renamed `middleware` → `proxy`. Current docs show `proxy.ts` only. On Next 15 and earlier the identical code lives in `middleware.ts` and exports `middleware`. Migrate with `npx @next/codemod@canary middleware-to-proxy .`.

```ts
// proxy.ts  (Next.js 16+; middleware.ts on 15 and earlier)
import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const isDev = process.env.NODE_ENV === 'development'
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'none';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
`
  const value = cspHeader.replace(/\s{2,}/g, ' ').trim()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', value)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', value)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
```

Next.js parses the `'nonce-{value}'` pattern out of the CSP header during SSR and attaches the nonce automatically to framework scripts, page bundles, its own inline scripts, and any `<Script nonce={…}>`. You read it in a Server Component with `(await headers()).get('x-nonce')`.

**Know the price before you pay it.** Nonces require dynamic rendering, so: static optimization and ISR are disabled, **Partial Prerendering is incompatible** (the static shell has no nonce), pages are not CDN-cacheable by default, and every request costs an SSR. Force it explicitly with `await connection()` in pages that would otherwise prerender. If that cost is unacceptable, use Next's experimental hash-based path instead — `experimental: { sri: { algorithm: 'sha256' } }` in `next.config.js` emits `integrity` attributes at build time and keeps pages static — and drop the nonce rather than shipping a cached one.

### Static site / CDN (`_headers`)

Netlify and Cloudflare Pages read a `_headers` file from the publish directory. Hash-based CSP, because there is no server to mint a nonce.

```
/*
  Content-Security-Policy: script-src 'sha256-REPLACE_WITH_BUILD_HASH' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'
  Strict-Transport-Security: max-age=63072000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Resource-Policy: same-origin
```

Regenerate the hashes on every build that changes an inline script — a stale hash blocks your own code. Add `preload` to HSTS only after the 3-month soak.

### Astro

Astro has built-in CSP as a **stable** `security.csp` option since **6.0**. It hashes your bundled scripts and styles at build time and emits a `<meta>` CSP in each page's `<head>`.

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'

export default defineConfig({
  security: {
    csp: {
      algorithm: 'SHA-512',
      directives: [
        "default-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "img-src 'self' https://images.cdn.example.com",
      ],
      scriptDirective: { resources: ["'self'"] },
    },
  },
})
```

Two traps:

1. Because Astro delivers the policy in `<meta>`, **`frame-ancestors` and reporting will not work there.** Send `frame-ancestors`, `Strict-Transport-Security`, `Referrer-Policy` and the rest as real headers from your host (`_headers`, `vercel.json`, nginx, adapter middleware).
2. `server.headers` in `astro.config.mjs` applies to `astro dev` and `astro preview` **only**. It is not your production configuration, and a green header scan locally proves nothing about the deployed site.

## Verify, don't assume

```bash
curl -sI https://example.com | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy|permissions-policy|cross-origin'
```

Then, on the deployed site, in DevTools:

- Load two pages and compare the nonce. **Same nonce twice = the nonce is fake.** This is the check nobody runs.
- Confirm `self.crossOriginIsolated` only if you actually needed it.
- Read the Console for CSP violations on the real page, with real third parties, not on localhost.
