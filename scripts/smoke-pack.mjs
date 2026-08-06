#!/usr/bin/env node
//
// Install the packed tarball the way a user would, then speak MCP to it.
//
// The test suite imports `dist/` directly, so it verifies the code and not the
// package. Everything between the two is untested by construction: the `files`
// list, the `bin` mapping, the executable bit, whether `knowledge/` shipped,
// whether the entry point resolves its own paths from inside `node_modules`.
// v0.19.1 moved `bin` to a new file — a typo there would have shipped a package
// that installs cleanly and does nothing, with a green suite the whole way.
//
// So: pack it, install it somewhere else, run the binary by the name npm links,
// and require real answers over the real protocol.
//
// Usage: node scripts/smoke-pack.mjs

import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const failures = [];
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Drive the installed binary over stdio and collect its JSON-RPC replies. */
function talk(bin, cwd, requests, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`the installed server did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", () => {
      clearTimeout(timer);
      const messages = out
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return { __unparsed: l };
          }
        });
      resolve({ messages, stderr: err, stdout: out });
    });
    child.stdin.end(requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
  });
}

let workdir;
let tarball;

try {
  console.log(`smoke-pack — ${pkg.name}@${pkg.version}`);

  console.log("\nPacking…");
  tarball = run("npm", ["pack", "--silent"], root).trim().split("\n").pop();
  check(Boolean(tarball), "npm pack produced a tarball", tarball);

  workdir = mkdtempSync(join(tmpdir(), "saglitzdesign-smoke-"));
  writeFileSync(join(workdir, "package.json"), JSON.stringify({ name: "smoke", private: true }, null, 2));

  console.log("\nInstalling as a user would…");
  run("npm", ["install", "--silent", "--no-audit", "--no-fund", join(root, tarball)], workdir);

  const binName = Object.keys(pkg.bin)[0];
  const bin = join(workdir, "node_modules", ".bin", binName);
  check(true, `installed and linked as ${binName}`);

  console.log("\nSpeaking MCP to the installed binary…");
  const { messages, stderr, stdout } = await talk(bin, workdir, [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "prompts/list" },
    { jsonrpc: "2.0", id: 4, method: "resources/list" },
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "search_design_knowledge", arguments: { query: "button states" } },
    },
  ]);

  const reply = (id) => messages.find((m) => m.id === id);

  const init = reply(1);
  check(Boolean(init?.result), "initialize answered");
  // The server reports its version from its own package.json. A mismatch here
  // means the tarball is not the tree we just built.
  check(
    init?.result?.serverInfo?.version === pkg.version,
    "the installed server reports the version we packed",
    `got ${init?.result?.serverInfo?.version ?? "nothing"}, expected ${pkg.version}`,
  );

  const tools = reply(2)?.result?.tools ?? [];
  check(tools.length > 0, "tools/list is not empty", `${tools.length} tools`);

  const prompts = reply(3)?.result?.prompts ?? [];
  check(prompts.length > 0, "prompts/list is not empty", `${prompts.length} prompts`);

  const resources = reply(4)?.result?.resources ?? [];
  check(resources.length > 0, "resources/list is not empty", `${resources.length} resources`);

  // The knowledge base is data, not code — `files` decides whether it ships at
  // all, and a server with no documents still starts and answers happily.
  const search = reply(5);
  const text = search?.result?.content?.[0]?.text ?? "";
  check(!search?.error && text.length > 200, "a real search returns real content from the shipped knowledge base");

  // stdout is the protocol channel. Anything else on it corrupts the stream,
  // and the symptom in a client is an unexplained disconnect.
  check(
    !messages.some((m) => m.__unparsed),
    "stdout carries only JSON-RPC",
    messages.find((m) => m.__unparsed)?.__unparsed?.slice(0, 60) ?? "",
  );
  check(stdout.length > 0 && stderr.includes("stdio"), "startup diagnostics go to stderr and name the transport");
} catch (err) {
  console.error(`\nsmoke-pack failed: ${err.message}`);
  failures.push(err.message);
} finally {
  if (workdir) rmSync(workdir, { recursive: true, force: true });
  if (tarball) rmSync(join(root, tarball), { force: true });
}

if (failures.length) {
  console.error(`\nsmoke-pack — ${failures.length} failure(s). This package is not fit to publish.`);
  process.exit(1);
}
console.log("\nsmoke-pack — ok. The packed tarball installs and serves.");
