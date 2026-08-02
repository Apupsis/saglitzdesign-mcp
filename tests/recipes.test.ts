import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { loadRecipes, recipeText } from "../dist/recipes.js";
import { auditDesignSystem } from "../dist/dsaudit.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const recipes = loadRecipes(join(root, "recipes"));

describe("loadRecipes", () => {
  it("loads the component recipes", () => {
    expect(recipes.length).toBeGreaterThanOrEqual(9);
  });
  it("each recipe has a spec and at least one stack", () => {
    for (const r of recipes) {
      expect(r.spec.length, r.component).toBeGreaterThan(0);
      expect(r.stacks.length, r.component).toBeGreaterThan(0);
    }
  });
  it("stacks come from the known set", () => {
    const allowed = new Set(["react-tailwind", "html-css", "swiftui", "compose"]);
    for (const r of recipes) {
      for (const s of r.stacks) expect(allowed.has(s.stack), `${r.component}: ${s.stack}`).toBe(true);
    }
  });
  it("includes the core components", () => {
    const names = new Set(recipes.map((r) => r.component));
    for (const c of ["button", "input", "modal", "toast", "card"]) expect(names.has(c), c).toBe(true);
  });
});

describe("recipeText", () => {
  it("renders spec + a specific stack as fenced code", () => {
    const button = recipes.find((r) => r.component === "button")!;
    const out = recipeText(button, "react-tailwind");
    expect(out).toContain("## react-tailwind");
    expect(out).toContain("```tsx");
  });
  it("notes when a stack is unavailable", () => {
    const r = recipes[0];
    const out = recipeText(r, "nonexistent-stack");
    expect(out).toContain("No code for stack");
  });
});

describe("the recipe library passes our own auditor", () => {
  // Dogfooding, and a real guard. Before this test the library scored 54/100:
  // four components used indigo as the accent and four used blue, so building
  // a UI from these recipes produced an indigo button beside a blue tab. A
  // project that ships audit_design_system cannot ship that.
  const webSource = () => {
    const dir = join(root, "recipes");
    return readdirSync(dir)
      .flatMap((c) => ["react-tailwind.tsx", "html-css.html"].map((f) => join(dir, c, f)))
      .filter((p) => existsSync(p))
      .map((p) => readFileSync(p, "utf8"))
      .join("\n");
  };

  it("scores as one coherent system", () => {
    const audit = auditDesignSystem(webSource());
    expect(audit.score).toBeGreaterThanOrEqual(85);
  });

  it("uses one accent colour across every component", () => {
    // The specific failure this test exists for.
    expect(webSource()).not.toMatch(/\b(bg|text|border|ring)-blue-\d{2,3}\b/);
  });

  it("keeps radii and elevation inside their budgets", () => {
    const audit = auditDesignSystem(webSource());
    for (const id of ["radius", "shadow", "spacing", "type"]) {
      const d = audit.dimensions.find((x) => x.id === id)!;
      expect(d.status, `${d.label}: ${d.unique} distinct`).toBe("ok");
    }
  });
});

describe("recipes in your colours", () => {
  const button = () => loadRecipes(join(root, "recipes")).find((r) => r.component === "button")!;
  const BRAND = { primary: "#0F62FE", primaryHover: "#0043CE", danger: "#DA1E28", dangerHover: "#A2191F" };

  it("returns the recipe unchanged when no tokens are given", () => {
    const b = button();
    expect(recipeText(b, "react-tailwind", {})).toBe(recipeText(b, "react-tailwind"));
    expect(recipeText(b, "react-tailwind")).toMatch(/indigo-600/);
  });

  it("replaces every house colour with the caller's", () => {
    const out = recipeText(button(), "react-tailwind", BRAND);
    expect(out).not.toMatch(/indigo-\d{3}|red-[567]00/);
    expect(out).toMatch(/bg-\[#0F62FE\]/);
    expect(out).toMatch(/hover:bg-\[#0043CE\]/);
    expect(out).toMatch(/bg-\[#DA1E28\]/);
  });

  it("substitutes hex in the CSS recipe too, including the #fff shorthand", () => {
    const out = recipeText(button(), "html-css", { primary: "#0F62FE", background: "#FAFAFA" });
    expect(out).not.toMatch(/#4f46e5/i);
    expect(out).toMatch(/#0F62FE/);
  });

  it("says which roles it applied, and that neutrals were left alone", () => {
    const out = recipeText(button(), "react-tailwind", BRAND);
    expect(out).toMatch(/Rewritten in your colours/);
    expect(out).toMatch(/`primary`/);
    expect(out).toMatch(/not guessed at/);
  });

  it("ignores a role it does not know rather than failing", () => {
    const out = recipeText(button(), "react-tailwind", { ...BRAND, teaGreen: "#0f0" });
    expect(out).toMatch(/bg-\[#0F62FE\]/);
    expect(out).not.toMatch(/#0f0/);
  });

  it("leaves the recipe files on disk untouched", () => {
    const before = readFileSync(join(root, "recipes", "button", "react-tailwind.tsx"), "utf8");
    recipeText(button(), "react-tailwind", BRAND);
    expect(readFileSync(join(root, "recipes", "button", "react-tailwind.tsx"), "utf8")).toBe(before);
  });
});
