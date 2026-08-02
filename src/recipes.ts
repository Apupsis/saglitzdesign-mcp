import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Production-ready component recipes: real, accessible reference code per stack,
// grounded in the SaglitzDesign specs. Served by the get_component_recipe tool.

export interface RecipeStack {
  stack: string; // e.g. "react-tailwind"
  lang: string; // fenced-code language
  code: string;
}

export interface Recipe {
  component: string;
  description: string;
  spec: string; // the design spec (states, a11y, rules)
  stacks: RecipeStack[];
}

const EXT_TO_STACK: Record<string, { stack: string; lang: string }> = {
  ".tsx": { stack: "react-tailwind", lang: "tsx" },
  ".html": { stack: "html-css", lang: "html" },
  ".swift": { stack: "swiftui", lang: "swift" },
  ".kt": { stack: "compose", lang: "kotlin" },
};

function parseSpec(raw: string): { description: string; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { description: "", body: raw.trim() };
  let description = "";
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^description:\s*(.*)$/);
    if (kv) description = kv[1].trim().replace(/^["']|["']$/g, "");
  }
  return { description, body: raw.slice(m[0].length).trim() };
}

export function loadRecipes(recipesDir: string): Recipe[] {
  if (!existsSync(recipesDir)) return [];
  const recipes: Recipe[] = [];
  for (const entry of readdirSync(recipesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(recipesDir, entry.name);
    let spec = "";
    let description = "";
    const specPath = join(dir, "spec.md");
    if (existsSync(specPath)) {
      const parsed = parseSpec(readFileSync(specPath, "utf8"));
      spec = parsed.body;
      description = parsed.description;
    }
    const stacks: RecipeStack[] = [];
    for (const f of readdirSync(dir)) {
      const meta = EXT_TO_STACK[extname(f)];
      if (!meta) continue;
      try {
        stacks.push({ stack: meta.stack, lang: meta.lang, code: readFileSync(join(dir, f), "utf8").trimEnd() });
      } catch {
        /* skip */
      }
    }
    if (stacks.length === 0 && !spec) continue;
    recipes.push({ component: entry.name, description, spec, stacks: stacks.sort((a, b) => a.stack.localeCompare(b.stack)) });
  }
  return recipes.sort((a, b) => a.component.localeCompare(b.component));
}


/**
 * The palette these recipes are written in, mapped to the semantic roles
 * generate_design_tokens emits. Normalising the library onto one accent is what
 * made this table possible: while four components used indigo and four used
 * blue, "the primary colour" had two answers and no substitution was correct.
 *
 * Only values that carry a role are listed. A neutral used for a border is left
 * alone rather than guessed at — the same rule the rest of the server follows.
 */
const HOUSE_PALETTE: Array<{ role: string; hex: string[]; tailwind: string[] }> = [
  { role: "primary",     hex: ["#4f46e5"], tailwind: ["indigo-600"] },
  { role: "primaryHover",hex: ["#4338ca"], tailwind: ["indigo-700"] },
  { role: "danger",      hex: ["#ef4444", "#dc2626"], tailwind: ["red-500", "red-600"] },
  { role: "dangerHover", hex: ["#b91c1c"], tailwind: ["red-700"] },
  { role: "background",  hex: ["#ffffff"], tailwind: [] },
  { role: "textPrimary", hex: ["#171717"], tailwind: [] },
];

/** Roles a caller may supply, in the vocabulary create_design_system produces. */
export const RECIPE_TOKEN_ROLES = HOUSE_PALETTE.map((p) => p.role);

/**
 * The neutral ramp these recipes are written in — Tailwind's, exactly.
 *
 * Neutrals resisted role substitution: `bg-neutral-900` is a surface and
 * `text-neutral-900` is text, the same value meaning two different things, and
 * guessing which would eventually repaint a dark surface with a text colour.
 *
 * Swapping the ramp step for step sidesteps the question entirely. Nothing is
 * inferred: your 300 replaces our 300, wherever it appears and whatever it is
 * being used for, which is the one substitution that cannot be wrong.
 */
/**
 * Tailwind properties that take a colour. Compound utilities like
 * `ring-offset-` are listed explicitly: matching only `ring` leaves
 * `ring-offset-neutral-950` behind, which is how a stray house grey survived
 * the first implementation.
 */
const COLOR_PROPS =
  "ring-offset|outline-offset|divide|placeholder|decoration|bg|text|border|ring|outline|from|via|to|caret|accent|shadow|fill|stroke";

/**
 * The three ramps these recipes are written in — Tailwind's neutral, indigo and
 * red, exactly.
 *
 * Role mapping was the crutch. It handled `indigo-600` because that is "the
 * primary", and left `indigo-400` behind because no role is named for the shade
 * a dark theme uses — so every dark UI built from these recipes kept our accent.
 * The same question defeats neutrals from the other side: `bg-neutral-900` is a
 * surface and `text-neutral-900` is text, one value meaning two things.
 *
 * Swapping a ramp step for step answers neither question and needs neither:
 * your 400 replaces our 400, wherever it appears and whatever it is doing. It
 * is the one substitution that cannot be wrong, and generate_color_system
 * already returns exactly these scales.
 */
const HOUSE_RAMPS: Record<"neutral" | "primary" | "danger", { tailwind: string; hex: Record<number, string> }> = {
  neutral: {
    tailwind: "neutral",
    hex: {
      50: "#fafafa", 100: "#f5f5f5", 200: "#e5e5e5", 300: "#d4d4d4", 400: "#a3a3a3",
      500: "#737373", 600: "#525252", 700: "#404040", 800: "#262626", 900: "#171717", 950: "#0a0a0a",
    },
  },
  primary: {
    tailwind: "indigo",
    hex: {
      50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8",
      500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81", 950: "#1e1b4b",
    },
  },
  danger: {
    tailwind: "red",
    hex: {
      50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171",
      500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d", 950: "#450a0a",
    },
  },
};

export type RecipeScales = Partial<Record<"neutral" | "primary" | "danger", Record<number, string>>>;

/**
 * Rewrite a recipe in the caller's colours.
 *
 * Substitution happens on the served text, never on disk: the files stay valid,
 * runnable, readable code that a person can open in the repo. Without tokens
 * the output is byte-identical to what it has always been.
 */
export function applyTokens(code: string, tokens: Record<string, string>, scales?: RecipeScales): string {
  let out = code;

  // Ramps first, and they cover most of it: a role substitution afterwards can
  // only refine what is left, never undo an unambiguous step-for-step swap.
  for (const [name, house] of Object.entries(HOUSE_RAMPS) as Array<[keyof RecipeScales, typeof HOUSE_RAMPS.neutral]>) {
    const yours = scales?.[name];
    if (!yours) continue;
    for (const [step, houseHex] of Object.entries(house.hex)) {
      const replacement = yours[Number(step)];
      if (!replacement) continue;
      out = out.replace(new RegExp(houseHex, "gi"), replacement);
      out = out.replace(
        new RegExp(`\\b(${COLOR_PROPS})-${house.tailwind}-${step}\\b`, "g"),
        (_m, prop) => `${prop}-[${replacement}]`,
      );
    }
  }

  for (const { role, hex, tailwind } of HOUSE_PALETTE) {
    const replacement = tokens[role];
    if (!replacement) continue;
    for (const h of hex) {
      out = out.replace(new RegExp(h.replace("#", "#"), "gi"), replacement);
      // #ffffff also appears written as #fff
      if (h.length === 7 && h[1] === h[2] && h[3] === h[4] && h[5] === h[6]) {
        out = out.replace(new RegExp(`#${h[1]}${h[3]}${h[5]}\\b`, "gi"), replacement);
      }
    }
    // Tailwind palette classes have no arbitrary equivalent, so the caller's
    // hex goes in as an arbitrary value — honest, and it actually renders.
    for (const t of tailwind) {
      out = out.replace(new RegExp(`\\b(${COLOR_PROPS})-${t}\\b`, "g"),
        (_m, prop) => `${prop}-[${replacement}]`);
    }
  }
  return out;
}

export function recipeText(
  r: Recipe,
  stack?: string,
  tokens?: Record<string, string>,
  scales?: RecipeScales,
): string {
  const chosen = stack ? r.stacks.filter((s) => s.stack === stack) : r.stacks;
  const themed = (tokens && Object.keys(tokens).length > 0) || (scales && Object.keys(scales).length > 0);
  const out: string[] = [`# ${r.component} — component recipe`];
  if (r.description) out.push(`\n_${r.description}_`);
  if (r.spec) out.push(`\n## Spec & rules\n${r.spec}`);
  if (chosen.length === 0) {
    out.push(`\n_No code for stack "${stack}". Available: ${r.stacks.map((s) => s.stack).join(", ") || "(none)"}._`);
  } else {
    for (const s of chosen) {
      const code = themed ? applyTokens(s.code, tokens ?? {}, scales) : s.code;
      out.push(`\n## ${s.stack}\n\`\`\`${s.lang}\n${code}\n\`\`\``);
    }
    if (themed) {
      out.push(
        "\n_Rewritten in your colours. Roles applied: " +
        (Object.keys(tokens ?? {}).filter((k) => RECIPE_TOKEN_ROLES.includes(k)).map((k) => `\`${k}\``).join(", ") || "none") +
        (scales && Object.keys(scales).length
          ? `; ${Object.keys(scales).join(", ")} ramp(s) swapped step for step`
          : "; ramps left as written — pass `scales` to swap the neutral, primary and danger ramps wholesale") +
        ". Verify the result with `audit_accessibility`._",
      );
    }
  }
  return out.join("\n");
}
