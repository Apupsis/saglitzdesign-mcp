// The launcher is the file users actually execute — `bin` in package.json points
// at it, so every `npx saglitzdesign-mcp` goes through here. It is also the one
// file no other test would notice breaking: the rest of the suite imports
// `dist/index.js` directly and would stay green while the published entry point
// was dead. So exercise it the way a client does — spawn it, speak MCP to it.

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(root, "dist", "bin.js");

/** Run the launcher, feed it `stdin`, resolve with what it wrote. */
function run(stdin: string, timeoutMs = 20_000): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`launcher did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    child.stdin.end(stdin);
  });
}

describe("launcher", () => {
  it("is what package.json publishes as the executable", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.bin["saglitzdesign-mcp"]).toBe("dist/bin.js");
  });

  it("starts the server and answers an MCP initialize", async () => {
    const init = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    const { out } = await run(init + "\n");
    const reply = out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .find((m) => m.id === 1);
    expect(reply?.result?.serverInfo?.name).toBe("saglitzdesign");
  });

  it("names its transport at startup, so a hosted deployment is not read as serving", async () => {
    const { err } = await run("");
    // "running" alone reads as "serving" in a container log while the process
    // sits on stdin forever. The transport has to be in the line itself.
    expect(err).toContain("stdio");
  });

  it("keeps stdout clean for the protocol — diagnostics go to stderr", async () => {
    const { out, err } = await run("");
    expect(out.trim()).toBe("");
    expect(err).toContain("SaglitzDesign");
  });
});
