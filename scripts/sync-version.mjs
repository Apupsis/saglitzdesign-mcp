#!/usr/bin/env node
// Propagates package.json's version into server.json (the MCP Registry manifest),
// which carries it in two places. Run automatically by `npm version` — see the
// "version" lifecycle script in package.json — so a release can never ship a
// registry card pointing at a stale version.
//
// The server itself reads package.json at runtime, so there is no third copy.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const serverPath = join(root, "server.json");

const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));
if (!version) {
  console.error("sync-version: package.json has no version");
  process.exit(1);
}

const raw = readFileSync(serverPath, "utf8");
const manifest = JSON.parse(raw);
const before = [manifest.version, ...(manifest.packages ?? []).map((p) => p.version)];

manifest.version = version;
for (const p of manifest.packages ?? []) p.version = version;

const next = JSON.stringify(manifest, null, 2) + "\n";
if (next !== raw) {
  writeFileSync(serverPath, next);
  console.log(`sync-version: server.json ${before.join("/")} → ${version}`);
} else {
  console.log(`sync-version: server.json already at ${version}`);
}
