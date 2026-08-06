#!/usr/bin/env node
//
// Print one version's CHANGELOG section, for use as GitHub Release notes.
//
// The changelog is written once, carefully, at release time. Re-typing it into
// a release body invites the two to disagree, and the release body is the one
// most people actually read.
//
// Usage: node scripts/changelog-section.mjs [version]   (defaults to package.json)

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version =
  process.argv[2]?.replace(/^v/, "") ?? JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const start = new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\].*$`, "m");
const match = changelog.match(start);

if (!match) {
  console.error(`changelog-section: no "## [${version}]" section in CHANGELOG.md`);
  process.exit(1);
}

const after = changelog.slice(match.index + match[0].length);
const body = after.split(/^## \[/m)[0].trim();

if (!body) {
  console.error(`changelog-section: the section for ${version} is empty`);
  process.exit(1);
}

console.log(body);
