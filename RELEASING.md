# Releasing

A release of SaglitzDesign lands in three places, and all three have to agree:

| Where | What it is | Consequence of drift |
| --- | --- | --- |
| **npm** | the package people install | users get the old code |
| **MCP Registry** | the entry clients discover us through | the registry card describes a version nobody can install |
| **GitHub** | tag, release notes, the tree of record | nobody can tell what shipped when |

Pushing a version tag ships all three. Everything else is automated.

## The procedure

```bash
npm version patch      # or minor / major
git push && git push --tags
```

That is the whole release. `npm version` bumps `package.json`, propagates the
version into `server.json` (via the `version` lifecycle script), commits, and
tags. Pushing the tag triggers `.github/workflows/release.yml`.

**Write the CHANGELOG entry first.** The pipeline refuses to release a version
with no `## [x.y.z]` section, and the section becomes the GitHub Release notes —
so it is written once and read everywhere.

## What the pipeline checks before it publishes anything

In order, each one gating the next:

1. **`scripts/preflight-release.mjs`** — the tag, `package.json`, both version
   fields in `server.json`, and the CHANGELOG all name the same version. This
   guards the one failure with no undo: npm and the MCP Registry both refuse to
   republish a version, so a tag that runs ahead of `package.json` does not fail
   loudly — it silently re-ships the previous release under a new name.
2. **`npm run build` and the test suite** on Node 22, as CI already does on 20,
   22 and 24 for every push to `main`.
3. **`scripts/smoke-pack.mjs`** — packs the tarball, installs it into a scratch
   directory the way a user would, runs the binary by the name npm links, and
   requires real answers over the real protocol: the reported version, a
   non-empty tool/prompt/resource list, a search that returns actual knowledge,
   and a clean stdout.

That last one exists because the test suite imports `dist/` directly, so it
verifies the code but not the package. The `files` list, the `bin` mapping, the
executable bit, and whether `knowledge/` shipped at all are invisible to it —
v0.19.1 moved `bin` to a new file, and a typo there would have published
something that installs cleanly and does nothing, with a green suite throughout.

## Then it publishes

npm first (the MCP Registry validates against the published package), then the
registry, then the GitHub Release.

The registry step authenticates with **GitHub Actions OIDC**, so there is no
stored credential and no interactive device-flow login. npm uses the `NPM_TOKEN`
repository secret — a granular automation token, because interactive 2FA cannot
be satisfied from CI.

## Running the gates by hand

```bash
npm run preflight   # version consistency
npm run smoke       # pack, install elsewhere, speak MCP to it
```

To run them in the real CI environment without publishing anything, trigger the
**Release** workflow manually (Actions → Release → Run workflow) and leave the
*publish* box unchecked. Everything up to and including the smoke test runs; the
three publish steps are skipped. Worth doing after any change to the pipeline
itself — otherwise its first exercise is a real release.

`npm run smoke` is worth running after any change to `package.json`'s `files`,
`bin`, or `exports` — those are exactly the fields no test can see.

## If a release goes wrong

A published npm version cannot be replaced, only deprecated
(`npm deprecate saglitzdesign-mcp@x.y.z "…"`) and superseded by a patch. The
same is true of the MCP Registry. This is why the gates run before the publish
steps rather than after, and why the tag — not a merge — is the trigger: the
release should be a thing you decide to do, not a thing that happens.
