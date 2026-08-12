---
id: auth-and-session-ux
title: "Authentication & Session Security as UX"
category: security
platform: web
tags: [security, auth, passkeys, webauthn, cookies, session, csrf, 2fa]
sources: ["https://web.dev/articles/passkey-form-autofill", "https://passkeys.dev/docs/use-cases/bootstrapping/", "https://fidoalliance.org/passkeys/", "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie", "https://web.dev/articles/samesite-cookies-explained", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API", "https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies", "https://developer.chrome.com/blog/cookie-max-age-expires", "https://developer.chrome.com/docs/identity/webauthn-conditional-create", "https://developer.chrome.com/docs/web-platform/device-bound-session-credentials", "https://developer.chrome.com/blog/io26-web-identity", "https://web.dev/articles/passkey-checklist", "https://web.dev/articles/passkey-management", "https://web.dev/case-studies/adidas-passkeys", "https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps", "https://caniuse.com/webauthn", "https://caniuse.com/mdn-api_publickeycredential_isconditionalmediationavailable_static", "https://caniuse.com/mdn-http_headers_set-cookie_samesite_lax_default", "https://caniuse.com/mdn-http_headers_sec-fetch-site", "https://developers.google.com/identity/passkeys/ux/user-journeys"]
updated: 2026-08-12
---

# Authentication & Session Security as UX

This is the half of security that is a design problem. A session timeout is an interaction. An error message is copy. A step-up prompt is a flow. Every one of them is also the control that decides whether a stolen laptop, a leaked password or one XSS bug becomes an account takeover — and each is routinely designed by someone optimising only for the happy path.

[[web-security-headers]] is the other half: it stops the injection. This document assumes injection will happen anyway and asks what the attacker gets. All claims verified against the specs, OWASP cheat sheets and vendor docs on 2026-08-12.

The through-line: **the security control and the usability fix are usually the same change.** Passkeys are both faster and unphishable. A rotated session ID is invisible to the honest user and fatal to a fixation attack. Identical error copy for "wrong password" and "no such account" is both kinder and non-enumerable. When you find yourself trading one against the other, you have usually chosen the wrong control.

## Passkeys are the default now

**Myth check (verified 2026-08-12):** passkeys are not emerging, experimental, or Chromium-only — the belief that they are is the single most common reason teams postpone them. WebAuthn is **Baseline Widely available**, and MDN records it as available across browsers **since September 2021**. caniuse puts the API at roughly **96% global support**, and `isConditionalMediationAvailable()` — the specific thing autofill needs — at roughly **94%** (Chrome/Edge 108+, Firefox 119+, Safari and iOS Safari 16.0+). You are not early. You are late.

The measured effect is not marginal. adidas, in a March 2026 web.dev case study: passkey sign-in success rate **above 99%** against a historical password success rate of **70%**, with a 47% overall passkey creation rate. FIDO Alliance's published deployment figures include 6× faster sign-in (Amazon), a 4× improvement in sign-in success rate vs passwords (Google), a 50% reduction in login abandonment (Air New Zealand), and an 81% reduction in login-related help-desk tickets. A password reset is an abandoned session; see [[conversion-ux]] for what that costs.

### Conditional UI — the passkey goes *in* the autofill sheet

The failure mode is not technical, it is placement. A "Sign in with a passkey" button below the password field is a second thing to understand, and users do not click it. Conditional mediation puts the passkey inside the browser's own autofill dropdown, next to saved passwords, on the field the user was already going to tap.

```html
<input type="text" name="username" autocomplete="username webauthn" autofocus>
```

`autocomplete="username webauthn"` — two space-separated tokens, both required. Dropping `webauthn` silently disables the whole flow with no error.

```js
if (await PublicKeyCredential.isConditionalMediationAvailable()) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challengeFromServer,   // fresh, server-generated, single-use
      rpId: 'example.com',
      userVerification: 'preferred',
      // allowCredentials omitted on purpose — accept any discoverable credential
    },
    mediation: 'conditional',
    signal: abortController.signal,
  });
}
```

Four rules that are easy to get wrong:

- **Call it on page load, not on click.** The promise sits pending until the user picks a passkey from the autofill sheet. It is set-and-forget.
- **Omit `allowCredentials`.** You do not know who the user is yet — that is the entire point. Only *discoverable* credentials (resident keys) appear in conditional mediation, and by definition a passkey is always a discoverable credential.
- **Keep the `AbortController`.** If the user ignores the sheet and types a password, abort the pending call before you submit the form.
- **Do not treat non-resolution as failure.** If the user picks a password or ignores the passkey, the promise typically never resolves. That is the designed behaviour, not an error state, and it is what makes the password path keep working unchanged.

### Conditional Create — enrol without an interstitial

The other half, and newer: `navigator.credentials.create({ publicKey, mediation: 'conditional' })` called **immediately after a successful password sign-in** silently upgrades that user to a passkey, with no modal, no "would you like to…" screen, no extra step. Detect it with `PublicKeyCredential.getClientCapabilities()` and the `conditionalCreate` key. Chrome for Developers (last updated 2025-12-22) reports support on Safari for macOS and all iOS browsers, and Chrome on desktop and Android, working with iCloud Keychain and Google Password Manager; third-party providers on iOS 18+ and Android 14+ may support it.

It only fires when the user has a saved password in their default password manager and used it recently — hence "immediately after login". Swallow three exceptions as normal outcomes, not bugs: `InvalidStateError` (a passkey already exists), `NotAllowedError` (conditions not met), `AbortError`. adidas attributed an **8% increase in passkey creations** to this alone, "without requiring manual user action". It is the cheapest adoption win available and it costs zero screens — which is exactly why it beats the enrolment interstitial you were about to design. Compare the priming logic in [[onboarding-permission-priming]]: the best permission prompt is the one you did not have to show.

### The fallback ladder — and why "passkey only" is a trap

Passkeys live in a *provider* (iCloud Keychain, Google Password Manager, a third-party manager, a security key). Users lose access to providers: they switch ecosystems, wipe a device, get locked out of the account that syncs the passkey. A passkey is a strong credential, not an indestructible one.

Ship the ladder in this order:

1. **Conditional UI passkey** on the username field. Free, and most returning users never leave this rung.
2. **Legacy authentication** for everyone else — passkeys.dev's bootstrapping guidance is explicit that when autofill does not resolve you "perform a 'legacy' user authentication: you'll get a username from this first page, and you then serve appropriate further login challenges (such as passwords, responding to SMS challenges, etc.)".
3. **A verified email or phone recovery channel**, so a user who has deleted every passkey can still get in.
4. **A second passkey from a different provider** — the real fix. If a user loses access to one provider, another still works.

Design rules that follow from this:

- **Allow multiple passkeys per account** and let users see and delete them, labelled by provider (use the AAGUID to name the credential), creation time, last use, and whether they are syncable.
- **Warn before deletion of the last passkey**: make it clear they will have to sign in another way, and say which way.
- **Offer passkey creation inside account recovery**, not a new password. Recovery is the moment a user is most motivated and most likely to otherwise set a weak, reused password.
- **Use `excludeCredentials`** so a provider that already holds a passkey does not mint a duplicate the user cannot tell apart.
- **Use the Signal API** — `signalAllAcceptedCredentials()` after every successful sign-in, `signalUnknownCredential()` after a failed one, `signalCurrentUserDetails()` when a display name changes. adidas kept `PASSKEY_NOT_FOUND` errors below **0.3%** of sign-in attempts with it. Without it, a credential you deleted server-side goes on being offered by the user's password manager forever, and the user reads that as your product being broken.

Coming, worth knowing but not worth waiting for: **immediate mediation** (Chrome 149+) shows the account picker on page load rather than on field focus, and **Related Origin Requests** lets one passkey work across several domains you own.

## Cookies

The session cookie is the credential. Everything in this table is one string in one header, and getting it right costs nothing.

```
Set-Cookie: __Host-id=<128+ bits of CSPRNG>; Secure; HttpOnly; SameSite=Lax; Path=/
```

| Attribute | What it actually prevents | Notes |
|---|---|---|
| `HttpOnly` | **Exfiltration** of the cookie by injected script — `document.cookie` cannot read it. OWASP calls it "mandatory to prevent session ID stealing through XSS attacks." | **Not** abuse. See the myth check below. |
| `Secure` | The cookie ever crossing a plaintext connection, so a network attacker cannot lift it. OWASP: "mandatory to prevent the disclosure of the session ID through MitM attacks." | The HTTPS requirement is **ignored on `localhost`**, so dev works unchanged. An `http:` page cannot *set* a `Secure` cookie. |
| `SameSite=Strict` | The cookie riding along on *any* cross-site request. OWASP's preferred value for session cookies. | Cost: a user arriving from an email link or a search result lands logged-out on the first navigation. For most products that is a worse first impression than the risk it buys. |
| `SameSite=Lax` | The cookie riding on cross-site subresource loads, form POSTs, iframes and `fetch`. Sent on top-level navigation with a safe method. | The right default for a session cookie. Not a CSRF defence on its own — see [CSRF](#csrf). |
| `SameSite=None` | Nothing. It is an opt-*out*, for cookies that must work in a third-party context. | **Requires `Secure`** or the browser rejects the cookie outright. Never on a session cookie. |
| `__Host-` prefix | An attacker on `evil.yoursite.com` (or on plain HTTP) overwriting your session cookie — cookie *injection*, which is what breaks naive double-submit CSRF tokens. | Enforces `Secure`, no `Domain`, `Path=/`. The strongest binding available, and nearly free. |
| `__Secure-` prefix | The same, minus the host binding — use only when subdomains genuinely must share the cookie. | Enforces `Secure` only. |
| `Path` | **Nothing, security-wise.** MDN is explicit that `Path` "does not protect against unauthorized cookie reading from different paths." | Set `Path=/` because `__Host-` requires it, not because it defends anything. |
| `Max-Age` / `Expires` | Nothing directly; it decides how long a stolen cookie stays useful. | OWASP: "it is highly recommended to use non-persistent cookies for session management." `Max-Age` takes precedence over `Expires` and is less error-prone (no client-clock skew). |

Also set: **no `Domain` attribute** (restricts the cookie to the exact host that issued it), a **generic cookie name** — OWASP suggests `id` rather than `PHPSESSID` or `JSESSIONID`, which announce your stack to a scanner — and **at least 64 bits of entropy**, meaning a minimum of 16 hexadecimal characters. 128 bits is the number to actually ship.

> **Myth check — `HttpOnly` does not stop XSS from using your session (verified 2026-08-12).** It stops the script *reading* the cookie. MDN: cookies with `HttpOnly` "are still sent with JavaScript-initiated requests" — `fetch()` and `XMLHttpRequest`. Injected script on your origin can therefore call your API as the logged-in user for as long as the page is open; the IETF OAuth browser-based apps BCP makes the same point, that an `HttpOnly` cookie is still reachable "via request proxying". `HttpOnly` converts *permanent, portable* account takeover into *transient, on-page* account takeover. That is a large and worthwhile reduction. It is not immunity, and it is not a reason to skip the CSP in [[web-security-headers]].

> **Myth check — `SameSite=Lax` is not the browser default everywhere (verified 2026-08-12).** MDN's cookie guide says an unset `SameSite` is "treated as `Lax` by default", and most checklists repeat it as universal. caniuse measures the actual feature — *Set-Cookie SameSite defaults to Lax* — at **76.34% global support**: Chrome 80+ and Edge 86+ only. **Firefox and Safari, desktop and iOS, do not apply it**, at any version shipped to date. So for roughly a quarter of traffic an omitted `SameSite` means `None`-like behaviour with no `Secure` requirement. Unlike a missing `Referrer-Policy` (a non-finding, per [[web-security-headers]]), a missing `SameSite` on a session cookie is a real one. Set it explicitly.

> **Myth check — "remember me for a year" is capped (verified 2026-08-12).** Since Chrome 104 (August 2022) `Expires` and `Max-Age` are capped at **400 days**; cookies asking for more are not rejected, their expiry is silently clamped. From Chrome 119 the cap was applied retroactively to cookies already in storage. Design the "stay signed in" affordance around a rolling renewal on each visit, not around a long absolute expiry that the browser will quietly shorten.

> **Myth check — third-party cookies are not being removed from Chrome (verified 2026-08-12).** Google reversed the phase-out: Chrome maintains user choice rather than deprecating third-party cookies, and the Privacy Sandbox plan was retired. Do not architect around a deadline that no longer exists. Equally, do not read that as safety: Safari and Firefox block third-party cookies by default already, so any auth flow that depends on a cross-site cookie has been broken for a large share of users for years, regardless of Chrome.

**Emerging, worth watching:** MDN's `Set-Cookie` reference now documents `__Http-` and `__Host-Http-` prefixes, which additionally require `HttpOnly` and so prove the cookie came from a `Set-Cookie` header rather than JavaScript. MDN's own hardening guide still recommends only `__Host-` and `__Secure-`, so treat `__Host-` as the one you ship today. Separately, **Device Bound Session Credentials** (DBSC) binds a session to a TPM-held key and short-lived cookies, so a stolen cookie is useless off-device; it reached Chrome 145 on Windows, with macOS planned. Not yet a control you can rely on, but it is the direction session security is going.

## Never store a token in localStorage

This is the highest-value rule in this document. If you take one thing, take this.

`localStorage` is readable by **any** script running on the origin — yours, your analytics vendor's, a compromised npm dependency, an injected `<script>` — and it survives tab close, browser restart, and reboot. So:

**Any single XSS bug, anywhere on the origin, at any point in the token's lifetime, becomes complete and persistent account takeover.** The attacker does not need the user present. They read the token once, POST it to their own server, and use it from their machine, at their leisure, until it expires. There is no session to close, no tab to shut, no device binding to defeat.

OWASP's Session Management cheat sheet states it directly: "Do not store authentication tokens, session IDs, JWTs, refresh tokens, or any credential in `localStorage` or `sessionStorage`. These APIs are accessible to any JavaScript executing in the origin, so a single XSS vulnerability discloses every token." The IETF OAuth 2.0 for Browser-Based Applications BCP (draft 27, July 2026) reaches the same conclusion from the threat side: "malicious JavaScript code has the same privileges as the legitimate application code", and can "steal data from origin-based storage mechanisms (e.g., localStorage, IndexedDB)" and then "impersonate the legitimate client application in a request to a resource server."

`sessionStorage` is not the fix — same origin-wide readability, merely a shorter window. Nor is IndexedDB. Nor is encrypting the token with WebCrypto and keeping the key on the same origin, which moves the problem without changing it. **A service worker is not a fix either**; the BCP is explicit that service-worker-held tokens remain reachable from XSS within the origin.

**Do this instead, in preference order:**

1. **Backend-for-Frontend (BFF).** The server holds the OAuth tokens against a cookie-based session; the browser holds only the `__Host-` session cookie above and never sees a token. The BCP calls this the pattern that "offers strong security guarantees" and "strongly recommend[s]" it "for business applications, sensitive applications, and applications that handle personal data". OWASP names the same two options — "`HttpOnly; Secure; SameSite=Strict` cookies (preferred) or a Backend-for-Frontend (BFF) pattern."
2. **In-memory only, plus silent refresh.** Keep the access token in a module-scope closure variable — never on `window`, never serialised — and re-obtain it from the backend on page load. The BCP: the frontend "SHOULD store tokens only in memory, and make a new request to the backend if no tokens exist." Yes, this means a network round trip on refresh. That round trip is the price, and it is small.
3. If you must issue a refresh token to a browser at all, the authorization server must **rotate it on every use or sender-constrain it**, cap its absolute lifetime, expire it on disuse, and never extend a rotated token past the original issuance window.

The objection is always the same — "but our tokens are short-lived." A 15-minute window is 15 minutes of full account access, renewed on every page load the victim performs, on an attacker's schedule. Short expiry is a mitigation for token *leakage in logs*. It is not a mitigation for an attacker with a script on your origin.

## Session lifetime

Two independent clocks. Ship both; teams routinely ship only the first.

- **Idle timeout** — time since the last request. Bounds the exposure of an unattended session. OWASP's ranges: **2–5 minutes for high-value applications, 15–30 minutes for low-risk ones**.
- **Absolute timeout** — time since authentication, regardless of activity. Bounds the exposure of a *stolen* session, which idle timeout does nothing about because the attacker is active. OWASP: for an application used by an office worker for a full day, "an appropriate absolute timeout range could be between 4 and 8 hours."

The design problem is that both are, from the user's side, being thrown out of your product mid-task. Mitigate with design, not by lengthening them:

- **Warn before you expire, with a live countdown and an extend button.** Silent expiry that eats a half-written form is the reason teams get pressured into 30-day sessions.
- **Preserve unsent input across re-authentication.** The form state is yours; do not make the session own it. See [[forms-inputs]].
- **Re-authenticate in place** — a modal over the current screen — rather than redirecting to `/login` and losing where the user was.
- **Never use a shorter timeout as a substitute for a missing control.** It is a blunt instrument, and every minute you shave off costs real usability.

**Rotate the session identifier.** OWASP: "The session ID must be renewed or regenerated by the web application after any privilege level change within the associated user session. The most common scenario where the session ID regeneration is mandatory is during the authentication process." This is the session-fixation defence: without it, an attacker who plants a known session ID in the victim's browser before login — via cookie injection from a sibling subdomain, HTTP response splitting, or XSS — is holding a valid authenticated session the moment the victim signs in. Rotate on login, on step-up, on role change, on any grant of new privilege. It is invisible to the honest user and completely defeats the attack.

**Logout must invalidate server-side.** Clearing the cookie in the browser deletes the user's copy of the credential, not the credential. OWASP: "the web application must take active actions to invalidate the session on both sides, client and server. The latter is the most relevant and mandatory from a security perspective." If your logout handler only sends `Set-Cookie: id=; Max-Age=0`, then anyone who captured that cookie earlier — from a shared machine, a proxy log, a backup — is still logged in. The public-computer logout, the one users are told to trust, is exactly the case this breaks.

While you are there: **give users a sessions list** — device, browser, approximate location, last active — with per-session and "sign out everywhere" revocation. It is the only way a user can act on a suspicion, and it turns an invisible backend control into a visible, reassuring one.

**Never put a session ID in a URL.** OWASP: it "might disclose the session ID (in web links and logs, web browser history and bookmarks, the Referer header or search engines), as well as facilitate other attacks, such as the manipulation of the ID or session fixation attacks."

## Step-up authentication

Re-authenticate — password, passkey, or second factor — immediately before each of these four, every time, regardless of how recently the user signed in:

1. **Password change**
2. **Email address change**
3. **2FA removal or reset** (including regenerating recovery codes)
4. **Payout, payment or withdrawal details**

These four are the account-takeover chain, and they are chained on purpose. An attacker with a live session but no credentials changes the email first, so recovery mail goes to them; then removes 2FA, so the real owner cannot get back in; then changes the password, evicting the owner entirely; then redirects the money. Each step alone looks like a normal settings edit. Step-up breaks the chain at step one, because the attacker riding a session does not have the credential.

OWASP: "it's important to require the current credentials for an account before updating sensitive account information such as the user's password or email address", plus risk-based re-authentication on suspicious activity, account recovery and critical actions.

Design notes:

- **Re-authentication, not confirmation.** A "Are you sure?" dialog stops a mis-click. It does not stop an attacker, who is sure. If the control is meant to be security, it must require something the attacker does not have.
- **Passkeys make this cheap.** `navigator.credentials.get()` with a fresh challenge is a fingerprint touch, not a retyped password — which is why sites with passkeys can afford to step up on all four flows without users revolting. passkeys.dev documents reauthentication as a first-class passkey use case.
- **A short grace window is acceptable** — a few minutes after a successful step-up — for a run of related edits. Do not let it become the session lifetime.
- **Email the account on every one of the four**, to the *old* address as well as the new, with a "this wasn't me" link that revokes all sessions. This is the last line of defence and the only one the user can operate.

## CSRF

`SameSite=Lax` is a strong default and it is **not sufficient alone**. OWASP positions SameSite as defence-in-depth, and names the gaps precisely:

- **`Lax` only blocks unsafe methods.** A top-level `GET` that changes state — `/account/delete?confirm=1`, an unsubscribe link, a legacy "logout" link — still carries the cookie. Which is why OWASP's rule is unconditional: "**Do not use GET requests for state changing operations.**" Audit every `GET` endpoint for mutation; this is a code-review item, not a header.
- **SameSite is scoped to the registrable domain, not the origin.** A cookie set on `app.example.com` is still "same-site" for a request from `anything.example.com` — including a marketing subdomain on a third-party CNAME, a stale staging host, or a subdomain someone else can take over. Same-site is not same-origin, and the gap is where subdomain takeovers get monetised.
- **Client-side CSRF** — a request forged by your own JavaScript from attacker-controlled input — is untouched by any cookie attribute.
- And, per the caniuse figure above, `Lax` is only the *default* in Chromium. Setting it explicitly is what makes it apply in Firefox and Safari.

Pair it with one of these on every state-changing request:

| Defence | When to use it | Status |
|---|---|---|
| **Framework built-in** | Always check first. OWASP's first instruction is "check if your framework has built-in CSRF protection and use it." | Preferred |
| **Synchroniser token** | Server-rendered forms, stateful sessions. Must be unique per user session, secret, and "a large random value generated by a secure method". | The primary token pattern |
| **Signed (HMAC) double-submit** | Stateless backends. HMAC over a session-dependent value (not a static user ID) plus a random anti-collision value, with a server-side secret key. | Recommended stateless option |
| **Naive double-submit** | — | **Discouraged.** OWASP now warns it is "bypassable by an attacker who can write cookies on the target domain (e.g., via a vulnerable sibling subdomain, DNS takeover, or plaintext-HTTP cookie injection on a non-`__Host-` cookie). For new code, use the Signed Double-Submit Cookie pattern above." Note that `__Host-` is what closes the injection route. |
| **Custom request header** (`X-CSRF-Token`) | AJAX and API endpoints. Forces a CORS preflight, which a cross-site attacker cannot satisfy. No server-side state. | Good, for XHR/fetch only |
| **Fetch Metadata** — reject unsafe methods when `Sec-Fetch-Site: cross-site` | Modern, near-free, applies site-wide at the edge. caniuse: ~**95% global** (Chrome 76+, Edge 79+, Firefox 90+, Safari 16.4+). | Use it, **with a fallback** |

Two hard constraints on the modern options: OWASP states that because some legacy browsers do not send `Sec-Fetch-*`, "a fallback to standard origin verification headers **is a mandatory requirement** for any Fetch Metadata implementation" — a missing header must not mean "allow". And when checking `Origin`/`Referer`, make the target-origin comparison exact: "if your site is `example.org` make sure `example.org.attacker.com` does not pass your origin check." Substring matching is how this control gets defeated.

Finally: a CSRF token is not an access token. OWASP: "They are used to verify the authenticity of requests throughout a session, using session information. A new session should generate a new token."

## Enumeration and rate limits

An attacker with a credential-stuffing list wants one thing from your login page first: which addresses have accounts. Give them nothing.

**Identical response, identical timing, identical status code** for "account exists" and "account does not exist" — on login, on registration, on password reset, and on the "resend verification" endpoint everyone forgets. Timing is the half that gets missed: OWASP shows how a quick-exit code path leaks existence, because "no such user" returns before any hashing happens while a real user waits for bcrypt. **Hash a dummy password against a fixed salt on the not-found path**, or push both paths through the same work, so the two are indistinguishable on the wire.

The copy pattern, from OWASP verbatim:

- Login: **"Login failed; Invalid user ID or password"** — the same string for wrong password, unknown user, locked account and disabled account.
- Password reset: **"If that email address is in our database, we will send you an email to reset your password."**
- Registration: **"A link to activate your account has been emailed to the address provided."**

Note what registration copy has to do: it must not confirm the address was free. "That email is already registered" is the most common enumeration oracle on the web, and it is usually written by someone trying to be helpful.

**Rate limit per account *and* per IP.** Per-account alone lets a distributed attacker spray one password across a million accounts. Per-IP alone is defeated by a rotating proxy pool. You need both, plus a global anomaly threshold for the case where neither trips.

**Lockout is a denial-of-service you are handing to strangers.** OWASP: "care must be taken to prevent it from being used to cause a denial of service by locking out other users' accounts." Anyone who knows a user's email can lock them out of their own account. Prefer:

- **Exponential backoff** rather than a hard lock — OWASP recommends starting at about one second and doubling per failed attempt. It is invisible to a human who mistyped once and ruinous to a script.
- **Keep password recovery reachable during lockout**, so a locked-out real user has a route back in.
- **Reset the counter on success**, and never lock the *only* recovery channel.
- **Do not tell the attacker they triggered it.** "Account locked" is itself an enumeration signal — it confirms the account exists. Fold it into the same generic failure string.

While on credentials, three OWASP positions worth writing down because product and compliance teams still argue about them: **no composition rules** ("There should be no password composition rules limiting the type of characters permitted"); **no mandatory periodic rotation**; and minimum length **8 characters with MFA, 15 without**, with a maximum of at least 64 so passphrases fit. And: "Allow users to paste into the username, password, and MFA fields." Blocking paste breaks password managers, which pushes users toward short memorable passwords — a security control that produces worse security, and a textbook case for [[ethical-design]] and [[accessibility]] alike. Use `autocomplete="current-password"` on sign-in and `autocomplete="new-password"` on registration and change forms; see [[forms-inputs]].

## The flows that get breached

Login is hardened. The flows around it are where takeovers actually happen, because they are built once, by whoever had capacity, and never revisited.

### Password reset

Per OWASP's Forgot Password cheat sheet, the token must be:

- **Generated with a cryptographically secure RNG** and long enough to resist brute force.
- **Single use, and expiring after an appropriate period.** OWASP declines to name a duration; 15–60 minutes is the defensible range, and shorter is fine if you make re-requesting easy. Consume the token on use, not on password submission — a token that survives a failed submit is a token an attacker can replay.
- **Delivered by email, in the query string of a URL** — and never derived from the `Host` header, which an attacker controls, so build the link from server-side configuration.
- **Rate limited per account.**

And around it:

- **Invalidate existing sessions.** "Ask the user if they want to invalidate all of their existing sessions, or invalidate the sessions automatically." A reset that leaves the attacker's session alive has achieved nothing. Default to automatic.
- **Do not auto-login after reset** — OWASP is explicit, because it "introduces additional complexity to the authentication and session handling code."
- **Send a notification email that the password was reset** (never containing the password). This is how the legitimate owner learns of an attack in progress.
- **Do not use security questions as the sole reset mechanism.** The answers are public records or guessable, and users lie inconsistently. Additional layer only.
- **Offer passkey creation here** rather than a new password. This is the highest-intent moment you will get.

### Email change

The chain-breaker. Confirm at **both** addresses:

- Send a confirmation link to the **new** address to prove the user controls it — until confirmed, the account keeps the old address.
- Send a notice to the **old** address with a revoke link that cancels the change and terminates all sessions.
- Require step-up first, per the section above.
- Do not change the address, or where recovery mail goes, until the new address is confirmed.

### 2FA enrolment and recovery codes

- **Verify a code before enabling.** Half of 2FA lockouts are a QR that was never successfully scanned.
- **Show recovery codes exactly once, at enrolment**, with copy/download/print, and require an explicit "I have saved these" acknowledgement. Store them hashed, treat each as single use, and show a remaining count.
- **Regenerating codes and disabling 2FA are step-up flows**, and both should notify the account by email.
- **Prefer app-based TOTP or a passkey over SMS.** SMS is deliverable to whoever holds the number after a SIM swap, which is the standard escalation once an attacker has the password. Offer it as a fallback if your audience needs it; do not make it the only option.
- If a user has a passkey, **a second passkey from a different provider is a better recovery story than any code**, and it is one tap.

## Copy that does not leak

Auth copy is security surface. Every error message is a decision about what to tell an attacker, and the instinct that makes good product copy — be specific, be helpful, reduce confusion — is the exact instinct that leaks. This is the one place in the product where [[ux-writing]]'s "be specific" yields to "be identical".

| Do not write | Write |
|---|---|
| "No account found with that email" | "Login failed; Invalid user ID or password" |
| "Incorrect password" | "Login failed; Invalid user ID or password" |
| "That email is already registered" | "A link to activate your account has been emailed to the address provided." |
| "We've sent a reset link to jane@example.com" | "If that email address is in our database, we will send you an email to reset your password." |
| "Account locked after 5 failed attempts" | The same generic failure string; surface the delay, not the reason. |
| "Your 2FA code is incorrect" (before password is validated) | Validate both, then fail once, generically. |

Rules:

- **One error string for the whole login form.** Field-level "this one was wrong" is an oracle.
- **Never confirm an address, phone number or username exists** in any unauthenticated response — including redirects, response sizes, HTTP status codes and timing, not only visible text.
- **Once the user is authenticated, be specific again.** Inside the account, "that email is already linked to another account" is helpful and leaks nothing an authenticated user cannot already discover.
- **Do not soften a security event.** "Your password was changed" needs to read as an alarm to someone who did not do it — include when, from where, and a one-tap revoke-everything link. This is one of the few places where a slightly alarming tone is the correct tone.
- **Say what happens next.** "If an account exists for that address, we've sent a link. It expires in 30 minutes." The vagueness is deliberate and load-bearing; the timing is not, so be precise about it, or you generate a support ticket for every reset.

## Ship checklist

- [ ] Conditional UI passkey login: `autocomplete="username webauthn"` + `mediation: 'conditional'` on page load, with `AbortController`
- [ ] Conditional Create fired immediately after each successful password sign-in
- [ ] Multiple passkeys per account, provider-labelled, deletable, with a warning on the last one
- [ ] Signal API wired: `signalAllAcceptedCredentials` on success, `signalUnknownCredential` on failure
- [ ] A working non-passkey fallback and a verified recovery channel
- [ ] `Set-Cookie: __Host-id=…; Secure; HttpOnly; SameSite=Lax; Path=/`, ≥128 bits of entropy, generic name, no `Domain`
- [ ] Zero tokens in `localStorage` / `sessionStorage` / IndexedDB — BFF, or in-memory with silent refresh
- [ ] Idle **and** absolute timeout, with a pre-expiry warning that preserves form state
- [ ] Session ID rotated on login and on every privilege change
- [ ] Logout invalidates server-side; a visible sessions list with revoke-everywhere
- [ ] CSRF token (synchroniser or signed double-submit) on every state-changing request; no `GET` mutates state
- [ ] Step-up re-auth on password change, email change, 2FA removal, payout details
- [ ] Identical response, status and timing for existent and non-existent accounts, across login / register / reset / resend
- [ ] Rate limits per account **and** per IP, exponential backoff rather than a strangers-triggerable lockout
- [ ] Reset tokens single-use and short-lived; sessions invalidated on reset; notification email sent
- [ ] Email change confirmed at the new address and revocable from the old
- [ ] Recovery codes shown once, stored hashed, single-use, with a remaining count
