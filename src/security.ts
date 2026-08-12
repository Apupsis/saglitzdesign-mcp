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

const SECRET_WORD = /(SECRET|PRIVATE|TOKEN|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY)/i;
const CREDENTIAL_KEY = /(token|jwt|auth|session|credential|refresh)/i;

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

    if (/postMessage\s*\([^)]*,\s*["'`]\*["'`]\s*\)/.test(line)) {
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
    const wo = /\bwindow\.open\s*\(/.exec(line);
    if (wo) {
      const args = line.slice(wo.index + wo[0].length);
      if (!/noopener/i.test(args)) {
        push(at, "warning", "window-open-without-noopener",
          `window.open() grants the new window a window.opener reference back to this page by default.`,
          `Pass "noopener" in the third argument: window.open(url, target, "noopener").`,
          "frontend-attack-surface");
      }
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
