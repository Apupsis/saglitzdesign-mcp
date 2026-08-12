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

/** Sanitiser library names that make a raw-HTML sink defensible. */
const SANITISER = /\b(dompurify|sanitize-html|xss|Sanitizer)\b/i;

/**
 * True only when a sanitiser name appears in something that reads as an
 * import/require statement — never anywhere in the file. A bare whole-file
 * word search is defeated by a comment ("// we already fixed xss here")
 * sitting above an unsanitised sink; requiring import syntax means the
 * sanitiser has to actually be pulled into scope to suppress the finding.
 */
function hasSanitiserImport(code: string): boolean {
  return code.split("\n").some((line) => {
    const trimmed = line.trim();
    const looksLikeImport = /^import\b/.test(trimmed) || /\brequire\s*\(/.test(trimmed);
    return looksLikeImport && SANITISER.test(line);
  });
}

/**
 * Identifier segments, split on `_`/`-` and lower→upper case transitions and
 * upper-cased, so "authToken", "auth_token" and "AUTH_TOKEN" all normalise to
 * ["AUTH", "TOKEN"] while "tokenizer" stays the single segment "TOKENIZER".
 * Matching whole segments (rather than a bare substring test) is what keeps
 * "authToken" flagged and "authorized" / "tokenizer-settings" quiet.
 */
function segmentsOf(id: string): string[] {
  return id
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.toUpperCase());
}

/**
 * True when a whole segment of `id` equals one of `words`, or an adjacent
 * pair of segments equals one of `pairs` (each given as "FIRST_SECOND", e.g.
 * "API_KEY" — so "NEXT_PUBLIC_API_KEY" fires but a lone "KEY" doesn't).
 */
function hasKeywordSegment(id: string, words: readonly string[], pairs: readonly string[] = []): boolean {
  const segs = segmentsOf(id);
  if (segs.some((s) => words.includes(s))) return true;
  for (let i = 0; i < segs.length - 1; i++) {
    if (pairs.includes(`${segs[i]}_${segs[i + 1]}`)) return true;
  }
  return false;
}

// "refresh" is deliberately absent: a bare "refreshRate" is not a credential,
// and "refreshToken" already fires on the TOKEN segment.
const CREDENTIAL_WORDS = ["TOKEN", "JWT", "AUTH", "SESSION", "CREDENTIAL"] as const;

const SECRET_WORDS = ["SECRET", "PRIVATE", "TOKEN", "PASSWORD", "PASSWD"] as const;
const SECRET_PAIRS = ["API_KEY", "ACCESS_KEY"] as const;

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

    if (name === "a" && /target\s*=\s*["']?_blank/i.test(tag.attrs)) {
      const rel = attr(tag, "rel") ?? "";
      if (!/\bnoopener\b/i.test(rel)) {
        // Modern browsers (95.58%, caniuse mdn-html_elements_a_implicit_noopener)
        // already imply noopener for target="_blank" on an anchor, so this is
        // a defense-in-depth nudge, not a live defect — info, not error. The
        // real risk sits with window.open(), which still grants window.opener
        // by default; see window-open-without-noopener below.
        push(tag.index, "info", "blank-without-noopener",
          `target="_blank" without an explicit rel="noopener" relies on the browser's implicit default rather than stating the intent.`,
          `Add rel="noopener noreferrer" for defense-in-depth and clarity.`,
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

    // Fires only for markup files: JSX onClick={fn} is not an inline handler,
    // and flagging it would be exactly the false positive this module refuses
    // to ship. `on[a-z]+="..."` (a quoted string, not a JSX expression) is the
    // only shape that is actually an inline handler.
    if (MARKUP_FILE.test(filename ?? "") && /\bon[a-z]+\s*=\s*["']/i.test(tag.attrs)) {
      push(tag.index, "warning", "inline-event-handler",
        `Inline event handler blocks a strict Content-Security-Policy — it cannot be allowed without 'unsafe-inline'.`,
        `Attach the handler with addEventListener from a script file.`,
        "web-security-headers");
    }

    if (/\bdangerouslySetInnerHTML\b/.test(tag.attrs) && !hasSanitiserImport(code)) {
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

    // `\b` before a literal `{` never matches at the start of a tag body
    // (`<div>{@html …}` has no word char before the brace), which silently
    // disabled this branch for real Svelte markup. The brace itself is
    // already an unambiguous boundary, so only the trailing `\b` (which
    // keeps "{@htmlFoo}" from matching) is needed on that side.
    if ((/\bv-html\b/.test(line) || /\{@html\b/.test(line)) && !hasSanitiserImport(code)) {
      push(at, "warning", "dangerous-html",
        `Raw HTML binding with no sanitiser imported in this file renders untrusted markup as live HTML.`,
        `Sanitise the value first (DOMPurify), or bind it as text.`,
        "frontend-attack-surface");
    }

    const ls = /localStorage\.setItem\(\s*["'`]([^"'`]+)/.exec(line);
    if (ls && hasKeywordSegment(ls[1], CREDENTIAL_WORDS)) {
      push(at, "error", "token-in-localstorage",
        `"${ls[1]}" is stored in localStorage, which any script on this origin can read — one XSS becomes lasting account takeover.`,
        `Keep the session in an HttpOnly, Secure, SameSite cookie, or hold the token in memory with a silent refresh.`,
        "auth-and-session-ux");
    }

    const env = /\b(?:NEXT_PUBLIC|VITE|PUBLIC|REACT_APP)_([A-Z0-9_]+)/.exec(line);
    if (env && hasKeywordSegment(env[1], SECRET_WORDS, SECRET_PAIRS)) {
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

    // The origin is postMessage's second argument. Requiring the quoted "*"
    // to be immediately followed by the closing paren missed calls with a
    // third `transfer` argument (`postMessage(data, "*", [port])`), which is
    // a real, common part of the API — so the boundary here is "more args
    // follow" (a comma) or "the call ends" (the paren), not just the paren.
    if (/postMessage\s*\(\s*[^,]*,\s*["'`]\*["'`]\s*(?:,|\))/.test(line)) {
      push(at, "warning", "postmessage-wildcard-origin",
        `postMessage with a "*" target origin delivers the payload to whatever document currently occupies that frame.`,
        `Pass the exact origin you intend, and check event.origin on the receiving side.`,
        "frontend-attack-surface");
    }

    // window.open() grants the new window a window.opener reference back to
    // this page by default — unlike target="_blank" on an anchor, which
    // browsers now imply noopener for (95.58% support, caniuse
    // mdn-html_elements_a_implicit_noopener), so that case is not re-flagged
    // here at the same severity.
    //
    // Capture only the argument list between the call's own parens, not the
    // rest of the line: scanning to end-of-line let a trailing `// TODO
    // ensure noopener elsewhere` comment satisfy the check without a real
    // "noopener" ever reaching the call.
    const wo = /\bwindow\.open\s*\(([^)]*)\)/.exec(line);
    if (wo && !/noopener/i.test(wo[1])) {
      push(at, "warning", "window-open-without-noopener",
        `window.open() grants the new window a window.opener reference back to this page by default.`,
        `Pass "noopener" in the third argument: window.open(url, target, "noopener").`,
        "frontend-attack-surface");
    }
  }

  // One finding per rule per line — dangerous-html can otherwise fire twice
  // for one defect (once from the tag loop's dangerouslySetInnerHTML check,
  // once from the line loop's v-html/{@html} check on the same `.vue` line).
  const seen = new Set<string>();
  const deduped = out.filter((f) => {
    const key = `${f.rule}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.sort((a, b) => a.line - b.line);
}

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
 * `X: …` to end of line (_headers), and `.set('X', v)` (middleware/proxy).
 */
export function extractHeaders(files: Array<{ path: string; source: string }>): Map<string, HeaderHit> {
  const found = new Map<string, HeaderHit>();

  for (const file of files) {
    for (const header of HEADER_NAMES) {
      // Hyphens need no escaping in a regex — nothing else in `header` is a
      // metacharacter either, so it is used as written.
      const nameRe = new RegExp(header, "gi");
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
          // Strip an outer wrapping quote pair (netlify.toml's `X = "…"`),
          // but only when the leading and trailing characters are a matching
          // quote — never a bare trailing-quote strip. A `_headers`-style
          // value ends in plain text that can itself close with a CSP
          // keyword like 'unsafe-inline', and stripping "any trailing quote"
          // was chewing off that keyword's own closing quote, silently
          // corrupting the last source expression in every directive list.
          const raw = colon[1].trim();
          const wrapped = /^(["'`])([\s\S]*)\1,?$/.exec(raw);
          value = wrapped ? wrapped[2] : raw;
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
