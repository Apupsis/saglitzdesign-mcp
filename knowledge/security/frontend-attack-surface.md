---
id: frontend-attack-surface
title: "Frontend Attack Surface"
category: security
platform: web
tags: [security, xss, sanitization, clickjacking, supply-chain, secrets, postmessage]
sources: ["https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API", "https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML", "https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout", "https://caniuse.com/mdn-api_element_sethtml", "https://caniuse.com/mdn-api_element_sethtmlunsafe", "https://svelte.dev/docs/svelte/@html", "https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage", "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy", "https://caniuse.com/mdn-html_elements_iframe_credentialless", "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel", "https://developer.mozilla.org/en-US/docs/Web/API/Window/opener", "https://developer.mozilla.org/en-US/docs/Web/API/Window/open", "https://html.spec.whatwg.org/multipage/links.html", "https://caniuse.com/mdn-html_elements_a_implicit_noopener", "https://owasp.org/www-community/attacks/Reverse_Tabnabbing", "https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data", "https://owasp.org/www-community/attacks/Clickjacking", "https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Javascript_Management_Cheat_Sheet.html", "https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf", "https://nextjs.org/docs/app/guides/environment-variables", "https://vite.dev/guide/env-and-mode", "https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps", "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html"]
updated: 2026-08-12
---

# Frontend Attack Surface

[[web-security-headers]] is the perimeter. [[auth-and-session-ux]] is what an attacker walks off with. This document is the code in between — the lines a designer-who-codes or a frontend developer actually writes, and the seven places where writing them the obvious way ships a vulnerability.

None of these are exotic. They are a prop called `dangerouslySetInnerHTML`, a link that opens in a new tab, an embedded Calendly, a `message` listener, an env var with a `NEXT_PUBLIC_` prefix. Every claim below was verified against the specs, OWASP cheat sheets, MDN and caniuse on 2026-08-12 — including two pieces of standard advice that are now wrong in the *opposite* direction, where the correct answer is "stop flagging that."

## XSS is contextual

The most common wrong mental model in frontend security is that escaping is one function. It is not. The same string is inert in one place and executable in another, and the escaping that makes it safe differs per place. OWASP's XSS Prevention cheat sheet is organised around exactly this: five contexts, five different encodings.

| Context | Where it lands | The rule | Safe sink |
|---|---|---|---|
| **HTML body** | `<div>DATA</div>` | HTML-entity encode `&`, `<`, `>`, `"`, `'` | `.textContent` — "It is a Safe Sink" |
| **HTML attribute** | `<div title="DATA">` | Encode all characters as `&#xHH;`, **and quote the attribute**. Unquoted attributes are escapable with a space. | `.setAttribute()` / `[attribute]`, which HTML-attribute-encode for you |
| **JavaScript** | `<script>var x = "DATA";</script>` | The "only 'safe' location for placing variables in JavaScript is inside a quoted data value", encoded as `\xHH`. Not `\"`-style backslash escaping. | Don't. Emit `<script type="application/json">` and `JSON.parse` it, or read a `data-` attribute. |
| **URL** | `<a href="DATA">` | URL-encode as `%HH` **and** allowlist the scheme: "Allow-list http and HTTPS URLs only" | `new URL()` + a protocol check — see [Links and redirects](#links-and-redirects) |
| **CSS** | `style="width: DATA"` | CSS hex encoding, and only ever in a property **value** | `style.property = x` — "This is a Safe Sink" |

And the slots where **no** encoding saves you, per OWASP: directly inside a `<script>` block, inside an HTML comment, in an attribute *name*, in a tag name, and directly in CSS. If untrusted data is reaching one of those, the fix is a different design, not a better escape function.

Three consequences worth internalising:

- **`escapeHtml()` applied everywhere is the bug**, not the fix. Entity-encoding a value that lands in an `href` produces a perfectly encoded `javascript:` URL. Entity-encoding a value that lands inside a `<script>` produces a perfectly encoded `</script>`.
- **Escape at output, never at input.** Storing a pre-escaped value bakes one context's encoding into the data, corrupts it for every other consumer (your API, your CSV export, your email), and produces `&amp;amp;` the day someone escapes it again.
- **Your framework already handles the body and attribute contexts.** JSX `{value}`, Vue's `{{ value }}` and Svelte's `{value}` escape interpolated text and attribute values for you. Every bug in this document lives where you *left* that path: the sinks below, the URL-bearing attributes escaping cannot make safe (`href`, `src`, `style`, `on*`), and raw DOM code in a `useEffect`.

## The dangerous sinks

Every framework ships one escape hatch out of its own escaping, and each one is named to be greppable. That is a feature — the names are your audit list.

| Framework | Escape hatch | Underlying sink |
|---|---|---|
| React | `dangerouslySetInnerHTML={{ __html }}` | `innerHTML` |
| Vue | `v-html` | `innerHTML` |
| Svelte | `{@html …}` | `innerHTML` |
| Plain DOM | `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`/`writeln`, `iframe.srcdoc` | itself |
| Code-as-string | `eval`, `new Function`, `setTimeout("…")`, `setInterval("…")` | the JS parser |

Svelte's own docs put the obligation where it belongs: "Make sure that you either escape the passed string or only populate it with values that are under your control in order to prevent XSS attacks. **Never render unsanitized content.**" OWASP is blunter about the code-as-string family: "It is always a bad idea to use user-controlled input in dangerous sources such as eval. 99% of the time it is an indication of bad or lazy programming."

> **Myth check — "`innerHTML` is fine, `<script>` tags don't run" (verified 2026-08-12).** They don't, and it does not help. MDN: `innerHTML` "is probably the most common vector for cross-site scripting (XSS) attacks… While the property does prevent `<script>` elements from executing when they are injected, it is susceptible to many other ways that attackers can craft HTML to run malicious JavaScript." The canonical payload has no `<script>` in it at all:
>
> ```js
> const name = "<img src='x' onerror='alert(1)'>";
> el.innerHTML = name; // shows the alert
> ```
>
> Any injected event handler attribute — `onerror`, `onload`, `onfocus` with `autofocus`, `onanimationend` — executes. A filter that strips `<script>` is a filter that stops nothing.

`setTimeout` with a string deserves its own line because it does not look like `eval`. MDN classifies it as an injection sink: "When the `code` parameter is used, this method dynamically executes its value as JavaScript." A CSP with `script-src` or `default-src` blocks it by default; the only way to keep it working is `'unsafe-eval'`, which is a large price for a convenience you did not need. Pass a function.

### When you must render untrusted HTML

Rich-text comments, CMS body fields, a Markdown renderer's output, and — increasingly — **model output**: an LLM response rendered as HTML is untrusted input carrying an attacker's prompt-injected payload, and it belongs on this list. See [[ai-product-ux]].

> **Myth check — the Sanitizer API is real now, and still not enough (verified 2026-08-12).** Guidance written before ~2025 calls it a proposal; guidance written last month calls it the answer. Both are wrong. `Element.setHTML()`, `ShadowRoot.setHTML()` and `Document.parseHTML()` have shipped and are safe by default — MDN: "The safe methods always remove XSS-unsafe elements and attributes… which removes both XSS-unsafe elements and attributes, such as `<script>` elements and `onclick` event handlers." But MDN also marks the API **not Baseline**, "because it does not work in some of the most widely-used browsers," and caniuse puts `Element.setHTML()` at roughly **68% global**: Chrome/Edge 146+, Firefox 148+, **Safari not at all**. Treat it as progressive enhancement, not as a dependency you can drop.

So today: **DOMPurify**, which OWASP names outright — "OWASP recommends DOMPurify for HTML Sanitization" — with two of its cautions attached, because they are the ways teams neuter it:

- "If you sanitize content and then modify it afterwards, you can easily void your security efforts." Sanitise last, at the point of render, not on the way into the database.
- "You must regularly patch DOMPurify… Bypasses are being discovered regularly." A pinned 2023 copy in your lockfile is not a sanitizer, it is a version of one that has since been broken.

> **The trap in the naming:** `setHTMLUnsafe()` is not a sibling of `setHTML()` with an opt-out — it exists to parse declarative shadow DOM and it **does not sanitize anything**. It is also the one you will find first if you go looking, because it has ~**88% global support** (Chrome/Edge 124+, Firefox 123+, Safari 17.4 partial and 26.0+ full) against `setHTML()`'s 68%. Reaching for the widely-supported "setHTML-ish" API gets you `innerHTML` with extra steps.

The class-level fix — `require-trusted-types-for 'script'`, which makes passing a bare string to any of these sinks throw — is in [[web-security-headers]]. Ship it in report-only and refactor toward it; everything in this section becomes a compile-time-ish error instead of a code review item.

## Links and redirects

### `target="_blank"`

The classic finding: a link with `target="_blank"` and no `rel="noopener"` hands the opened page a live `window.opener` reference, and OWASP's Reverse Tabnabbing page describes what that buys — "a page linked from the target page is able to rewrite that page, for example to replace it with a phishing site," typically via `window.opener.location = "https://phish.example.com"`. The victim comes back to a tab that looks like your site and asks for their password.

> **Myth check — browsers already imply `noopener`, and this finding is mostly historical (verified 2026-08-12).** The HTML Standard's *get an element's noopener* algorithm returns true "If element's link types do not include the `opener` keyword and target is an ASCII case-insensitive match for `_blank`". MDN says the same in one sentence: "Windows opened because of links with a `target` of `_blank` don't get an `opener`, unless explicitly requested with `rel=opener`." caniuse measures the behaviour at **95.58% global** — Chrome/Edge 88+, Firefox 79+, Safari 12.1+, iOS Safari 12.2+, Opera 74+, Samsung Internet 15+, never in IE. OWASP's own page concedes it: the vulnerability "isn't as widespread and critical as before."
>
> Keep writing `rel="noopener"` — it costs four words, covers the residual few percent of old engines and embedded WebViews, and every linter will flag its absence anyway. But do not report it as a finding with the severity of 2018, and do not let it absorb the attention that belongs to the two cases the implicit default does **not** cover.

**Case one: `window.open()`.** The implicit `noopener` is a property of *element* navigation. The API is unchanged — MDN documents `noopener` as a window feature you have to ask for: "If this feature is set, the new window will not have access to the originating window via `Window.opener` and returns `null`."

```js
// Vulnerable — the opened page gets a working window.opener
window.open(url);

// Correct
window.open(url, '_blank', 'noopener,noreferrer');
```

**Case two: `rel="noreferrer"` is a different control.** It suppresses the `Referer` header (and implies `noopener`). With `strict-origin-when-cross-origin` as the browser default (see [[web-security-headers]]), a cross-origin link already leaks only your origin, so add `noreferrer` when even the origin is sensitive — a password-reset page, an internal tool, a URL whose *hostname* discloses a customer.

While you are in that markup: a link that opens a new tab should say so. See [[accessibility]].

### `href` from user input

Never concatenate. Parse, then allowlist the scheme:

```js
function safeHref(input) {
  let url;
  try { url = new URL(input, window.location.origin); } catch { return '/'; }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '/';
}
```

Why parse rather than string-match: the URL parser normalises the cases a denylist misses — leading whitespace and control characters, `JaVaScRiPt:`, embedded newlines, percent-encoded colons. And a denylist of `javascript` alone still admits `data:`, `blob:`, `vbscript:` and whatever ships next. Allowlist two schemes and be done.

> **Myth check — `data:` URLs no longer navigate (verified 2026-08-12).** MDN: "A number of security issues (for example, phishing) have been associated with data URLs, and navigating to them in the browser's top level. To mitigate such issues, **top-level navigation to `data:` URLs is blocked in all modern browsers.**" So `<a href="data:text/html,…">` is not the live payload the older cheat sheets describe. It is still not a scheme to allow — it survives in other sinks (`iframe src`, `object data`, `embed src`), and the allowlist above excludes it for free.

`javascript:` has no such reprieve: a click runs the attacker's code in your origin, with your user's session. The strict `script-src` in [[web-security-headers]] is the backstop for the link you forgot to filter — but it is a backstop, not the filter.

### Open redirects

OWASP: "Unvalidated redirects and forwards are possible when a web application accepts untrusted input that could cause the web application to redirect the request to a URL contained within untrusted input." The result is a link that begins with *your* domain, passes a spam filter and a security-aware user's glance, and lands on a phishing page. Your reputation is the payload.

They hide in the most ordinary parameters: `?next=`, `?redirect=`, `?returnTo=`, `?continue=`, `?url=` — post-login returns, post-logout returns, "click to continue" interstitials, tracked outbound links.

Defences, in OWASP's order of strength:

1. **Don't take the URL at all.** Hardcode the destination.
2. **Map an opaque value server-side.** "Have the user provide short name, ID or token which is mapped server-side to a full target URL. This provides the highest degree of protection against the attack tampering with the URL."
3. **Allowlist** — "based on an allow-list approach, rather than a denylist."
4. **Interstitial** — "Force all redirects to first go through a page notifying users that they are going off of your site, with the destination clearly displayed." Design it so the destination host is legible, not truncated mid-domain; see [[ux-writing]].

The check that fails: `if (next.startsWith('/'))`. `//evil.example` starts with `/` and resolves to a different host entirely. Parse with `new URL(next, origin)` and compare `url.origin` to yours exactly — substring and `endsWith` comparisons are how `example.org.attacker.com` gets through.

## Framing

Two directions, and teams usually only think about one.

**You, framed.** OWASP: clickjacking "is when an attacker uses multiple transparent or opaque layers to trick a user into clicking on a button or link on another page when they were intending to click on the top level page." Their prevention list is three items: `frame-ancestors` response headers (with `X-Frame-Options` retained only "for graceful degradation and older browser compatibility"), `SameSite=Strict` or `Lax` authentication cookies, and defensive framebusting code for legacy browsers. The header is the control and it belongs to [[web-security-headers]]; the cookie attribute belongs to [[auth-and-session-ux]]. Set both, and note that framebusting JavaScript is the *legacy fallback*, not the mechanism — the attacker controls the framing page, and a `sandbox` attribute on their own iframe withholds both the scripting and the top-level navigation that framebusting depends on.

**Others, framed by you.** Every embedded widget — a video, a map, a scheduling tool, a payment field, a support chat — is a document you did not write running inside your page. `sandbox` is the control, and MDN describes the default: "The value of the attribute can either be empty to apply all restrictions, or space-separated tokens to lift particular restrictions." Start empty. Add back the minimum.

```html
<iframe
  src="https://widget.vendor.example/embed"
  sandbox="allow-scripts allow-forms"
  allow="camera 'none'; microphone 'none'; geolocation 'none'"
  referrerpolicy="no-referrer"
  loading="lazy"
  title="Booking widget"></iframe>
```

> **`allow-scripts` + `allow-same-origin` is the pair that undoes the sandbox — but read the nuance (verified 2026-08-12).** MDN's warning is scoped: "When the embedded document has the same origin as the embedding page, it is strongly discouraged to use both `allow-scripts` and `allow-same-origin`, as that lets the embedded document remove the `sandbox` attribute — making it no more secure than not using the `sandbox` attribute at all." That is the literal escape, and it is why you must never same-origin-host a third-party embed. Cross-origin, the frame cannot reach up and delete your attribute — but the pair still restores its access to its own origin's cookies and storage plus scripting, which is most of what you sandboxed it away from. Either way, if a vendor tells you they need both, you are not sandboxing them; you are typing an attribute.

Two more attributes worth knowing:

- **`allow`** is the per-frame Permissions Policy — MDN: it "defines what features are available to the `<iframe>` (for example, access to the microphone, camera, battery, web-share, etc.)". It narrows, it never widens: "A Permissions Policy specified by the `allow` attribute implements a further restriction on top of the policy specified in the `Permissions-Policy` header. It doesn't replace it." So the inheritance runs one way — "For an `<iframe>` to have a feature enabled its allowed origin must also be in the allowlist for the parent page." You cannot grant a frame something your own page policy denies, and MDN's resulting advice is to "specify the widest acceptable support for a feature in the HTTP header, and then specify the subset of support you need in each `<iframe>`" — set the ceiling once in the header from [[web-security-headers]], then cut each frame down from it. Mind the syntax, which is *not* the header's: `allow="camera 'none'; geolocation 'self'"`, semicolon-separated, with `'none'`/`'self'`/`'src'`/`*`/unquoted origins — and note MDN's default, "`src` is the default `allowlist` value for features listed in `allow`", so naming a feature without a value grants it to the frame's own origin rather than denying it.
- **`credentialless`** loads the frame "in a new, ephemeral context. It doesn't have access to the network, cookies, and storage data associated with its origin" — a genuinely strong control for untrusted embeds, but **Chromium-only**: caniuse puts it at ~**74% global**, Chrome/Edge 110+, not implemented in Firefox or Safari. Additive hardening, never your only layer.

## postMessage

`postMessage` is a hole you drill through the same-origin policy on purpose. Both ends of it need a check, and each end is routinely written with the check missing.

**Sending — never `"*"`.** MDN: "Always specify an exact target origin, not `*`, when you use `postMessage` to dispatch data to other windows. A malicious site can change the location of the window without your knowledge, and therefore it can intercept the data sent using `postMessage`." The window you hold a handle to is not guaranteed to still contain the document you think it does.

```js
iframe.contentWindow.postMessage({ type: 'SET_THEME', theme }, 'https://widget.vendor.example');
```

**Receiving — verify, then validate.** MDN: "Any window (including, for example, `http://evil.example.com`) can send a message to any other window within the iframe hierarchy from top to every iframe below of the current document," so "always verify the sender's identity using the `origin` and possibly `source` properties," and "Having verified identity, however, you still should always verify the syntax of the received message."

```js
const ALLOWED = new Set(['https://widget.vendor.example']);

window.addEventListener('message', (event) => {
  if (!ALLOWED.has(event.origin)) return;        // exact match, never includes()/startsWith()
  if (event.source !== iframe.contentWindow) return;
  const msg = event.data;
  if (typeof msg !== 'object' || msg?.type !== 'RESIZE' || typeof msg.height !== 'number') return;
  container.style.height = `${Math.min(msg.height, 2000)}px`;
});
```

Three failure modes behind that snippet:

- **`event.origin.includes('vendor.example')`** passes for `https://vendor.example.attacker.com`. The comparison must be an exact string match against a fixed set. This is the same lesson as the redirect check above, and it is the same bug.
- **A verified sender is still untrusted data.** A message that reaches `innerHTML`, `eval`, a URL you navigate to, or a token you store is DOM XSS with a courier. Everything in [The dangerous sinks](#the-dangerous-sinks) applies to `event.data`.
- **Don't listen at all if you don't need to.** MDN: "If you do not expect to receive messages from other sites, *do not* add any event listeners for `message` events. This is a completely foolproof way to avoid security problems." Dead listeners left behind by a removed feature are free attack surface.

## Third-party scripts

A `<script src>` you did not write, on your origin, is not "a tool the marketing team added." It is arbitrary code execution with your users' session, on every page, forever. OWASP's Third Party JavaScript Management cheat sheet names three risks precisely:

- **Arbitrary execution.** Third-party JS runs with the same privileges as your own code — the same position an XSS payload occupies. It can read the DOM, rewrite forms, and call your API as the logged-in user.
- **Loss of control.** "New features may be pushed in the third-party code at any time" — you approved a version once; you receive whatever they deploy tonight. Historic incidents include "malicious injections in third-party code after the organization's servers were compromised."
- **Data leakage.** "The browser directly contacts the third-party servers" and shares "the referrer… and any cookies previously set by the third-party." Your checkout page's URL is now their analytics.

**Tag managers are the sharp edge.** They exist so that a non-engineer can deploy JavaScript to production instantly, with no pull request, no review, no CI, and no one attaching your CSP nonce to it. OWASP notes the code "is generally obfuscated" and recommends restricting the manager to a controlled data layer rather than the DOM. Practically: treat tag-manager access as production deploy access, keep a named owner per container, and audit it on the same cadence as your dependencies.

What actually reduces this surface:

1. **Self-host and pin.** Vendor the file into your build, version it, review the diff on upgrade. This is also the SRI answer and the performance answer — see [[web-security-headers]] for the integrity mechanics and why "latest" URLs and SRI are incompatible.
2. **Jail what you cannot self-host.** OWASP: "Put vendor JavaScript into an iframe from different domain… It will work as a 'jail'," communicating over `postMessage` with the checks above.
3. **Budget them.** Count the third-party scripts on your production HTML today. Assign each an owner and a business reason. Delete the ones with neither — there are always some, usually a trial from two years ago.
4. **Gate on consent, and gate correctly.** EDPB Guidelines 2/2023 restate Article 5(3) ePD: "the storing of information, or the gaining of access to information already stored, in the terminal equipment of a subscriber or user" is "only allowed on the basis of consent or necessity for specific purposes," and — the part teams miss — "Article 5(3) ePD does not exclusively apply to cookies, but also to 'similar technologies'." The consent requirement "also applies when a read-only value is accessed." So "we don't set cookies, we use `localStorage`" is not an exemption, and neither is a fingerprint. The tag must not load before consent, not merely not-fire. See [[ethical-design]].

## Secrets in the bundle

Anything the browser can run, a user can read. The framework prefixes exist to mark exactly that boundary, and they are routinely read as "how to use an env var on the client" rather than as "publish this."

**Next.js** — the docs are explicit about the mechanism: Next.js will "'inline' a value, at build time, into the js bundle that is delivered to the client, replacing all references to `process.env.[variable]` with a hard-coded value" for anything prefixed `NEXT_PUBLIC_`. Two consequences the docs also spell out: the value is frozen at build ("after being built, your app will no longer respond to changes to these environment variables"), and dynamic lookups are **not** inlined — `process.env[varName]` and `const env = process.env; env.NEXT_PUBLIC_X` both silently become `undefined` in the browser, which is the reverse footgun and a genuinely confusing bug to chase.

**Vite** — same mechanism, blunter warning: "Variables prefixed with `VITE_` will be exposed in client-side source code after Vite bundling," and "`VITE_*` variables should *not* contain sensitive information such as API keys. The values of these variables are bundled into your source code at build time."

The rules that follow:

- **A prefix is a publishing decision.** If the key's safety depends on nobody seeing it, it cannot be prefixed. Keys that are legitimately public are only safe because a *server-side* control makes them safe — a row-level security policy, a domain restriction, a scope on the token. Publishable-by-design keys are fine. "Probably nobody will look" is not a control.
- **Anything that has shipped is burned, and deleting the variable does not unship it.** The bundle is in a CDN cache, in browser caches, in an archived copy of your site, in someone's HAR file. OWASP: "Keys that were exposed should undergo immediate revocation." Rotate first, then remove the reference.
- **Rotate on a schedule regardless.** OWASP: "You should regularly rotate secrets so that any stolen credentials will only work for a short time."

**Source maps.** Next.js disables them for production builds "to prevent you leaking your source on the client, unless you specifically opt-in with the configuration flag." Shipping them publishes your original, unminified, comment-bearing source — including the internal API shapes and the feature flags you assumed nobody could read. If you need them for error tracking, upload them to the error tracker and do not serve them from your origin.

**`.env` in git.** Next.js's template "ensures all `.env` files are added to your `.gitignore`. You almost never want to commit these files to your repository," and Vite recommends `*.local` in `.gitignore` for the same reason. The point OWASP adds is the one that changes behaviour: prevention has to happen *before* the commit, "because they are then visible in the history." A later commit that deletes the file does not remove the value from history, from any clone, or from any fork. Enable "secrets detection at the developer level… either in the IDE, as part of test-driven development, or via pre-commit hook," and treat every historical hit as leaked, not as tidy-up.

**Hardcoded secrets** are the same failure with fewer steps: an API key pasted into a component, a private key in a JSON fixture, a bearer token in a code comment, a staging password in a Storybook story. If the file is reachable from a client entry point, it is in the bundle. Grep your own source for `sk_`, `AKIA`, `-----BEGIN`, `Bearer ` and `api_key` before someone else does.

## Ship checklist

- [ ] No `escapeHtml()`-everywhere: each interpolation escaped for the context it lands in, and no untrusted data in a tag name, attribute name, comment or bare `<script>` block
- [ ] Every `dangerouslySetInnerHTML` / `v-html` / `{@html}` / `innerHTML` call site listed, justified, and sanitised at render time with a current DOMPurify
- [ ] No `eval`, `new Function`, or string-argument `setTimeout`/`setInterval`
- [ ] Model-generated and CMS-authored HTML treated as untrusted input
- [ ] `rel="noopener"` on `target="_blank"` (cheap, not urgent) — and `window.open(url, '_blank', 'noopener,noreferrer')` everywhere, which is the case browsers do not cover for you
- [ ] Every user-influenced `href`/`src` parsed with `new URL()` and scheme-allowlisted to `http:`/`https:`
- [ ] Every `?next=`/`?redirect=` parameter mapped server-side or allowlisted by exact origin — no `startsWith('/')`
- [ ] `frame-ancestors` set for your own pages (see [[web-security-headers]]); every third-party iframe `sandbox`ed, never with `allow-scripts allow-same-origin` together
- [ ] `postMessage` sends an exact target origin, never `"*"`; every `message` listener checks `event.origin` against an exact-match allowlist, validates the payload shape, and keeps it away from every sink above
- [ ] Third-party script inventory with a named owner per entry; self-hosted and pinned where possible; tag-manager access treated as deploy access
- [ ] Non-essential tags load only after consent — including ones that touch `localStorage` rather than cookies
- [ ] No secret behind `NEXT_PUBLIC_*` / `VITE_*`; anything that ever shipped there rotated, not just deleted
- [ ] Production source maps off, or uploaded privately to the error tracker
- [ ] `.env*` gitignored, secret scanning in pre-commit and CI, every historical hit revoked
