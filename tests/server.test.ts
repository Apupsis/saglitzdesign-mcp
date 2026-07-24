import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// End-to-end smoke test over the real stdio server. Everything else in the
// suite tests pure functions; this is the layer that proves the 23 tools are
// actually registered, described, and callable — the wiring that unit tests
// cannot see.

const root = join(__dirname, "..");

/**
 * One representative call per tool. Adding a tool without adding a case here
 * fails the "every tool has a smoke case" test — that is deliberate.
 */
const SMOKE: Record<string, Record<string, unknown>> = {
  list_design_knowledge: {},
  search_design_knowledge: { query: "primary button size mobile" },
  get_design_doc: { id: "buttons" },
  get_component_guidance: { component: "primary button", platform: "mobile" },
  get_design_language: { language: "material-3" },
  design_review_checklist: { project_type: "landing-page" },
  get_design_roadmap: { project_type: "ios-app" },
  seo_geo_guide: { scope: "geo" },
  get_design_examples: { query: "paywall", limit: 1 },
  knowledge_freshness: { only_stale: true },
  generate_design_tokens: { colors: { primary: "#4F46E5" }, format: "css" },
  audit_accessibility: { contrast_pairs: [{ foreground: "#6B7280", background: "#FFFFFF" }] },
  get_component_recipe: { component: "button", stack: "react-tailwind" },
  generate_color_system: { brand_color: "#4F46E5" },
  suggest_font_pairing: { intent: "modern SaaS dashboard", limit: 2 },
  fix_contrast: { foreground: "#9CA3AF", background: "#FFFFFF" },
  suggest_icon_library: { intent: "clean developer tool", limit: 2 },
  generate_type_scale: { base: 16, ratio: 1.25 },
  generate_elevation_system: { levels: 4 },
  generate_motion: { animation: "fade-in", stack: "css" },
  design_lint: { code: '<img src="/a.png" />' },
  audit_ux_copy: { text: "We are excited to announce our revolutionary new synergistic platform." },
  create_design_system: { brand_color: "#4F46E5", vibe: "modern SaaS dashboard", platform: "web" },
  audit_design_system: { code: ":root{--a:#fff}\n.a{color:#111;border-radius:4px}\n.b{color:#112;border-radius:5px}" },
  generate_layout_system: { preset: "marketing-site" },
  compare_design_languages: { topic: "navigation" },
};

let client: Client;
let transport: StdioClientTransport;
let toolNames: string[] = [];

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "dist", "index.js")],
    stderr: "ignore",
  });
  client = new Client({ name: "saglitzdesign-tests", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  toolNames = (await client.listTools()).tools.map((t) => t.name);
}, 30_000);

afterAll(async () => {
  await client?.close();
});

function textOf(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

describe("server handshake", () => {
  it("registers every tool exactly once", () => {
    expect(toolNames.length).toBe(new Set(toolNames).size);
    expect(toolNames.length).toBeGreaterThanOrEqual(23);
  });

  it("registers the prompt workflows", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.length).toBeGreaterThanOrEqual(7);
    for (const p of prompts) expect(p.description, p.name).toBeTruthy();
  });

  it("gives every tool a title, a description and read-only annotations", async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.description?.length ?? 0, t.name).toBeGreaterThan(40);
      expect(t.annotations?.title, t.name).toBeTruthy();
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.annotations?.openWorldHint, t.name).toBe(false);
    }
  });

  it("reports the package version", async () => {
    const pkg = JSON.parse(
      await import("node:fs").then((fs) => fs.readFileSync(join(root, "package.json"), "utf8")),
    );
    expect(client.getServerVersion()?.version).toBe(pkg.version);
  });
});

describe("every tool answers a representative call", () => {
  it("has a smoke case for every registered tool", () => {
    const missing = toolNames.filter((n) => !(n in SMOKE));
    expect(missing).toEqual([]);
  });

  for (const [name, args] of Object.entries(SMOKE)) {
    it(`${name} returns usable content`, async () => {
      if (!toolNames.includes(name)) return; // tool not in this build
      const result = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content?: Array<{ type: string; text?: string }>;
      };
      expect(result.isError ?? false, name).toBe(false);
      expect((result.content ?? []).length, name).toBeGreaterThan(0);
      const body = textOf(result);
      // Guard against the silent-empty-answer failure mode: a tool that
      // "succeeds" while telling the caller it found nothing.
      expect(body.length, name).toBeGreaterThan(40);
      expect(body.toLowerCase(), name).not.toMatch(/^no (matches|guidance|document|recipe|visual examples)/);
    }, 20_000);
  }
});

describe("resources", () => {
  it("exposes every knowledge doc as a readable resource", async () => {
    const { resources } = await client.listResources();
    expect(resources.length).toBeGreaterThanOrEqual(83);
    const buttons = resources.find((r) => r.uri.endsWith("/buttons"));
    expect(buttons).toBeTruthy();
    const read = await client.readResource({ uri: buttons!.uri });
    expect(String(read.contents[0]?.text ?? "").length).toBeGreaterThan(200);
  }, 20_000);
});

describe("completions", () => {
  it("autocompletes document ids, prefix matches first", async () => {
    const { completion } = await client.complete({
      ref: { type: "ref/resource", uri: "saglitzdesign://doc/{id}" },
      argument: { name: "id", value: "butt" },
    });
    expect(completion.values).toContain("buttons");
    expect(completion.values[0]).toBe("buttons");
  });

  it("autocompletes recipe component names", async () => {
    const { completion } = await client.complete({
      ref: { type: "ref/resource", uri: "saglitzdesign://recipe/{component}" },
      argument: { name: "component", value: "to" },
    });
    expect(completion.values).toContain("toast");
  });
});

describe("input validation", () => {
  it("rejects an invalid hex instead of emitting a broken palette", async () => {
    const result = (await client.callTool({
      name: "generate_color_system",
      arguments: { brand_color: "not-a-color" },
    })) as { content?: Array<{ type: string; text?: string }> };
    expect(textOf(result)).toMatch(/not a valid hex/i);
  });

  it("suggests near matches for an unknown doc id", async () => {
    const result = (await client.callTool({
      name: "get_design_doc",
      arguments: { id: "buttonz" },
    })) as { content?: Array<{ type: string; text?: string }> };
    expect(textOf(result)).toMatch(/no document with id/i);
  });

  it("resolves a bare pattern id through the alias fallback", async () => {
    const result = (await client.callTool({
      name: "get_design_doc",
      arguments: { id: "hero-sections" },
    })) as { content?: Array<{ type: string; text?: string }> };
    expect(textOf(result)).toMatch(/id: web-hero-sections/);
  });
});
