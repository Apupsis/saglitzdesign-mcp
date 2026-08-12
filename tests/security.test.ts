import { describe, it, expect } from "vitest";
import { securitySourceRules, securityConfigRules, extractHeaders } from "../dist/security.js";

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

  it("flags other credential-shaped localStorage keys", () => {
    expect(ids(`localStorage.setItem("auth_token", val)`)).toContain("token-in-localstorage");
    expect(ids(`localStorage.setItem("jwt", val)`)).toContain("token-in-localstorage");
    expect(ids(`localStorage.setItem("refreshToken", val)`)).toContain("token-in-localstorage");
    expect(ids(`localStorage.setItem("sessionId", val)`)).toContain("token-in-localstorage");
  });

  it("flags a secret-named public env var", () => {
    expect(ids(`const k = process.env.NEXT_PUBLIC_STRIPE_SECRET_KEY`)).toContain("public-env-secret");
  });

  it("flags NEXT_PUBLIC_API_KEY as a secret-named public env var", () => {
    expect(ids(`const k = process.env.NEXT_PUBLIC_API_KEY`)).toContain("public-env-secret");
  });

  it("flags dangerouslySetInnerHTML with no sanitiser in the file", () => {
    expect(ids(`<div dangerouslySetInnerHTML={{ __html: body }} />`)).toContain("dangerous-html");
  });

  it("flags Svelte {@html} with no sanitiser in the file, in realistic markup", () => {
    expect(ids(`<div>{@html body}</div>`)).toContain("dangerous-html");
  });

  it("flags dangerouslySetInnerHTML even when a comment merely mentions a sanitiser by name", () => {
    const code = `// we already fixed xss here\n<div dangerouslySetInnerHTML={{ __html: body }} />`;
    expect(ids(code)).toContain("dangerous-html");
  });

  it("flags a cross-origin iframe without sandbox", () => {
    expect(ids(`<iframe src="https://other.example/embed"></iframe>`)).toContain("iframe-no-sandbox");
  });

  it("flags postMessage to a wildcard origin", () => {
    expect(ids(`win.postMessage(payload, "*")`)).toContain("postmessage-wildcard-origin");
  });

  it("flags postMessage to a wildcard origin even with a transfer list argument", () => {
    expect(ids(`win.postMessage(data, "*", [port])`)).toContain("postmessage-wildcard-origin");
  });

  it("flags window.open without noopener even when a trailing comment mentions noopener", () => {
    expect(ids(`window.open(url, "_blank"); // TODO ensure noopener elsewhere`)).toContain("window-open-without-noopener");
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

  it("accepts public env vars whose name merely contains a secret word as a substring", () => {
    expect(ids(`const a = process.env.NEXT_PUBLIC_TOKENIZER_URL`)).not.toContain("public-env-secret");
    expect(ids(`const a = process.env.NEXT_PUBLIC_PRIVATEBETA_URL`)).not.toContain("public-env-secret");
    expect(ids(`const a = process.env.NEXT_PUBLIC_PASSWDLESS_FLAG`)).not.toContain("public-env-secret");
    expect(ids(`const a = process.env.NEXT_PUBLIC_TOKENGATE_ENABLED`)).not.toContain("public-env-secret");
  });

  it("accepts localStorage for a non-credential key", () => {
    expect(ids(`localStorage.setItem("theme", "dark")`)).not.toContain("token-in-localstorage");
  });

  it("accepts localStorage keys whose name merely contains a credential word as a substring", () => {
    expect(ids(`localStorage.setItem("tokenizer-settings", val)`)).not.toContain("token-in-localstorage");
    expect(ids(`localStorage.setItem("authorized-theme", val)`)).not.toContain("token-in-localstorage");
    expect(ids(`localStorage.setItem("credentialsPolicy", "same-origin")`)).not.toContain("token-in-localstorage");
    expect(ids(`localStorage.setItem("refreshRate", "60")`)).not.toContain("token-in-localstorage");
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
