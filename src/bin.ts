#!/usr/bin/env node
//
// Launcher. Its only job is to fail *legibly* on a Node that cannot run us.
//
// `dist/index.js` uses top-level await, which older runtimes cannot even parse,
// so the user gets "SyntaxError: Unexpected reserved word" pointing at a file
// they did not write — with nothing to suggest their Node version is the cause.
// A check inside that file could never run: the parse fails before the first
// statement executes. Hence a separate entry point, written in syntax old
// enough to parse anywhere, that checks first and only then loads the server.
//
// Two thresholds, because they answer different questions. SUPPORTED is what we
// test and declare in `engines`. HARD_MIN is where the server genuinely stops
// working. Between them it runs fine in practice, and refusing to start would
// break setups that work today — so that range warns rather than exits. A guard
// added to improve the error message must not become a new source of breakage.
//
// Keep this file boring. No top-level await, no optional chaining, no modern
// syntax of any kind — every construct here has to parse on the very runtimes
// we are trying to produce a good error message for.

var SUPPORTED_MAJOR = 20;
var HARD_MIN_MAJOR = 18;

var running = process.versions.node;
var major = parseInt(running.split(".")[0], 10);

if (isFinite(major) && major < HARD_MIN_MAJOR) {
  process.stderr.write(
    "SaglitzDesign needs Node " + SUPPORTED_MAJOR + " or newer — this is Node " + running + ".\n" +
    "\n" +
    "Either update Node (https://nodejs.org), or point your MCP client at a newer one:\n" +
    '  "command": "/path/to/node-' + SUPPORTED_MAJOR + '/bin/node",\n' +
    '  "args": ["/path/to/saglitzdesign-mcp/dist/index.js"]\n',
  );
  process.exit(1);
}

if (isFinite(major) && major < SUPPORTED_MAJOR) {
  process.stderr.write(
    "SaglitzDesign: Node " + running + " is below the supported floor (Node " + SUPPORTED_MAJOR + "). " +
    "Starting anyway — it works in testing, but is not covered by CI. Update Node if anything misbehaves.\n",
  );
}

import("./index.js").catch(function (err) {
  process.stderr.write(
    "SaglitzDesign failed to start: " + (err && err.message ? err.message : String(err)) + "\n" +
    "\n" +
    "This server speaks MCP over stdio only. It runs as a child process of an MCP\n" +
    "client (Claude Desktop, Claude Code, Cursor…) — it has no HTTP endpoint and\n" +
    "cannot be hosted remotely. See the README for client configuration.\n",
  );
  process.exit(1);
});
