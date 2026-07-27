import { describe, it, expect } from "vitest";
import { importTokens, importTokensReport } from "../dist/importtokens.js";
import { generateTokens, DEFAULT_SPACING, DEFAULT_RADII, DEFAULT_FONT_SIZES, DEFAULT_FONT_FAMILIES } from "../dist/tokens.js";

// The importer's whole promise is that it reads *named* tokens and never
// guesses a role from a bare value. Most of these tests exist to hold that line.

const SHADCN = `
:root {
  --background: #ffffff;
  --foreground: #0a0a0a;
  --primary: #4f46e5;
  --primary-foreground: #fafafa;
  --muted: #f4f4f5;
  --muted-foreground: #71717a;
  --border: #e4e4e7;
  --radius: 0.5rem;
}
`;

const TAILWIND_V4 = `
@theme {
  --color-primary: #4f46e5;
  --color-surface: #ffffff;
  --spacing-4: 16px;
  --spacing-6: 24px;
  --text-base: 1rem;
  --text-2xl: 24px;
  --radius-md: 10px;
  --font-sans: Inter, system-ui, sans-serif;
}
`;

const DTCG = JSON.stringify({
  color: {
    brand: { 500: { $type: "color", $value: "#4f46e5" } },
    primary: { $type: "color", $value: "{color.brand.500}" },
    surface: { $type: "color", $value: "#ffffff" },
    ghost: { $type: "color", $value: "{color.does.not.exist}" },
  },
  radius: { md: { $type: "dimension", $value: "10px" } },
});

describe("input detection and refusal", () => {
  it("detects CSS custom properties", () => {
    expect(importTokens(SHADCN).format).toBe("css");
  });

  it("detects DTCG JSON", () => {
    expect(importTokens(DTCG).format).toBe("dtcg");
  });

  it("detects a plain JSON theme object", () => {
    const json = JSON.stringify({ colors: { primary: "#4f46e5", surface: "#ffffff" } });
    const r = importTokens(json);
    expect(r.format).toBe("json");
    expect(r.colors.primary).toBe("#4f46e5");
  });

  it("refuses a JavaScript config instead of half-parsing it", () => {
    const js = `module.exports = { theme: { extend: { colors: { primary: "#4f46e5" } } } }`;
    const r = importTokens(js);
    expect(r.format).toBe("unsupported");
    expect(r.problems.join(" ")).toMatch(/cannot be read safely|custom properties|DTCG/i);
    expect(Object.keys(r.colors)).toHaveLength(0);
  });

  it("says so when there is nothing named to read", () => {
    const r = importTokens(".btn { color: #4f46e5; border-radius: 8px }");
    expect(Object.keys(r.colors)).toHaveLength(0);
    expect(r.problems.join(" ")).toMatch(/no named tokens/i);
  });
});

describe("the never-guess rule", () => {
  it("does NOT import a bare hex from inside a rule as a role", () => {
    const mixed = `
      :root { --color-primary: #4f46e5 }
      .btn { color: #ff0000; background: #00ff00 }
    `;
    const r = importTokens(mixed);
    expect(r.colors).toEqual({ primary: "#4f46e5" });
    expect(Object.values(r.colors)).not.toContain("#ff0000");
  });

  it("points unnamed values at the tool that does count them", () => {
    expect(importTokensReport(".btn { color: #4f46e5 }")).toMatch(/audit_design_system/);
  });
});

describe("normalisation", () => {
  it("strips the --color- prefix and keeps the role", () => {
    const r = importTokens(TAILWIND_V4);
    expect(r.colors.primary).toBe("#4f46e5");
    expect(r.colors.surface).toBe("#ffffff");
  });

  it("classifies lengths by their name, not their unit", () => {
    const r = importTokens(TAILWIND_V4);
    expect(r.spacing).toContain(16);
    expect(r.spacing).toContain(24);
    expect(r.radii.md).toBe(10);
    expect(r.fontSizes.base).toBe(16);   // 1rem
    expect(r.fontSizes["2xl"]).toBe(24);
  });

  it("keeps font stacks as families", () => {
    expect(importTokens(TAILWIND_V4).fontFamilies.sans).toMatch(/Inter/);
  });

  it("converts rgb() and hsl() to hex", () => {
    const r = importTokens(":root{--color-a:rgb(79,70,229);--color-b:hsl(0,0%,100%)}");
    expect(r.colors.a).toBe("#4f46e5");
    expect(r.colors.b).toBe("#ffffff");
  });

  it("reads shadcn's foreground convention without inventing meaning", () => {
    const r = importTokens(SHADCN);
    expect(r.colors.background).toBe("#ffffff");
    expect(r.colors.foreground).toBe("#0a0a0a");
    expect(r.colors["primary-foreground"]).toBe("#fafafa");
    expect(r.radii.default ?? r.radii.radius).toBe(8); // 0.5rem
  });
});

describe("DTCG", () => {
  it("flattens nested groups into roles", () => {
    const r = importTokens(DTCG);
    expect(r.colors["brand-500"]).toBe("#4f46e5");
    expect(r.radii.md).toBe(10);
  });

  it("resolves an alias one level", () => {
    expect(importTokens(DTCG).colors.primary).toBe("#4f46e5");
  });

  it("reports an unresolvable alias rather than dropping it silently", () => {
    const r = importTokens(DTCG);
    expect(r.problems.join(" ")).toMatch(/color\.does\.not\.exist/);
    expect(r.colors.ghost).toBeUndefined();
  });
});

describe("round trip", () => {
  it("survives emit → import unchanged", () => {
    const spec = {
      name: "Acme",
      colors: { primary: "#4f46e5", onPrimary: "#ffffff", surface: "#0a0a0b", textPrimary: "#f5f5f5" },
      spacing: DEFAULT_SPACING,
      radii: DEFAULT_RADII,
      fontSizes: DEFAULT_FONT_SIZES,
      fontFamilies: DEFAULT_FONT_FAMILIES,
    };
    const css = generateTokens(spec, "css");
    const back = importTokens(css);
    for (const [role, hex] of Object.entries(spec.colors)) {
      expect(back.colors[role.toLowerCase()] ?? back.colors[role], role).toBe(hex.toLowerCase());
    }
    expect(back.radii.md).toBe(DEFAULT_RADII.md);
    expect(back.fontSizes.base).toBe(DEFAULT_FONT_SIZES.base);
  });
});

describe("coverage report", () => {
  it("names the semantic roles the source is missing", () => {
    const r = importTokens(":root{--color-primary:#4f46e5}");
    expect(r.missingRoles).toContain("surface");
    expect(r.missingRoles.length).toBeGreaterThan(2);
  });

  it("labels which scales were defaulted, so a default is never mistaken for yours", () => {
    const report = importTokensReport(":root{--color-primary:#4f46e5}");
    expect(report).toMatch(/default/i);
    expect(report).toMatch(/spacing/i);
  });

  it("checks contrast on the imported pairs and points at the fix", () => {
    const report = importTokensReport(":root{--color-background:#ffffff;--color-textPrimary:#aaaaaa}");
    expect(report).toMatch(/2\.3\d:1/);
    expect(report).toMatch(/fix_contrast/);
  });

  it("re-emits in the requested format", () => {
    expect(importTokensReport(SHADCN, "swiftui")).toMatch(/Tokens\.swift|import SwiftUI/);
  });
});

describe("text vs surface classification", () => {
  // shadcn names text roles `muted-foreground` / `primary-foreground`, which
  // begin with words that also name surfaces. Getting this backwards invents a
  // meaningless pair and hides the most common real failure in the ecosystem.
  const SHADCN_MUTED = `:root{
    --background:#ffffff; --foreground:#0a0a0a;
    --muted:#f4f4f5; --muted-foreground:#a1a1aa;
  }`;

  it("treats *-foreground as text, never as a surface", () => {
    const report = importTokensReport(SHADCN_MUTED);
    const rows = report.split("\n").filter((l) => l.startsWith("| `"));
    for (const row of rows) {
      const surface = row.split("|")[2] ?? "";
      expect(surface, `surface column got a text role: ${row}`).not.toMatch(/foreground/);
    }
  });

  it("finds the muted-text failures it used to miss, worst first", () => {
    const report = importTokensReport(SHADCN_MUTED);
    // Both pairs are real and both fail; the muted surface is the worse of the two.
    expect(report).toMatch(/`muted-foreground` \| `muted` \| 2\.33:1 \| ❌/);
    expect(report).toMatch(/`muted-foreground` \| `background` \| 2\.56:1 \| ❌/);
    expect(report).toMatch(/2 pair\(s\) fall below 4\.5:1/);
    // The repair offered is for the worst pair, not merely the first one found.
    expect(report).toMatch(/fix_contrast\(foreground: "#a1a1aa", background: "#f4f4f5"\)/);
  });
});
