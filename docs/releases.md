# Releasing OpenOdds

Releases are produced by GitHub Actions on a `v*` tag. Pushing a tag like
`v0.2.0` runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which builds
installers for Windows x64, Windows x86 (32-bit) and Linux x64, opens a **draft**
GitHub Release, and publishes the signed `latest.json` updater manifest that
installed apps poll. A final job then checks that every installer, its signature
and every manifest entry really landed, so a release that only half-published
fails loudly instead of looking green.

## A release stays a draft until it has been verified

The release stays a **draft** until the final job has passed, and it is that job
which publishes it — the checks are a gate, not a report. The updater endpoint
resolves `releases/latest`, which ignores drafts, so this ordering is exactly what
keeps a half-built release invisible: nothing is downloadable, and no installed
app is offered an update, until every check has passed. If a check fails, the
release stays a draft for you to inspect and the run is red.

That job reads the release with **write** access rather than read, which looks
like more privilege than it needs. It is not optional: GitHub's release API hides
*draft* releases from read-only tokens, so a read-only check cannot see the draft
it is supposed to verify and reports "release not found" on every release.

The checks themselves live in [`scripts/verify-release.sh`](../scripts/verify-release.sh),
which is the same script that can be pointed at a staged draft by hand — that is
how they were tested, and it is why they are not a block of YAML inlined in the
workflow.

## The repository has to stay readable without credentials

The manifest is fetched by an installed app, which has no GitHub account, and
GitHub answers **404** for a private repository — indistinguishable, from the
app's side, from a release that does not exist. An installed copy reports that as
"the feed answered 404".

Settings → Updates deliberately offers only **Check for updates** and the version
it is running: a Settings screen is read far more often than a feed breaks, and a
token field for a case almost nobody hits is noise on it. The two things that can
tell that failure apart — a probe that reports exactly what the app's own request
received, and a read-only token field for a feed that cannot be made public — still
exist, unrendered, in
[`src/features/settings/UpdateDiagnostics.tsx`](../src/features/settings/UpdateDiagnostics.tsx),
which says how to put them back in one line. `src/config/updater.test.ts` covers
the probe directly, so that path is still tested.

## The version has to go up

The updater only installs a manifest whose version is greater than the running
build, so a release that reuses an already-installed version is ignored —
deliberately, and not reported as an error. Bump `package.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` together. All three.

## Setting up releases in a fork

Two things are needed:

1. **The updater endpoint** is already configured to
   `https://github.com/GitRefDeploy/openodds/releases/latest/download/latest.json`
   in [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json). If you fork this
   project, change it to your own owner and repository name. The URL is written in
   two places — there, and `src/config/updater.ts`, where the UI names the feed —
   and `src/config/updater.test.ts` asserts they agree. Keep it that way, because
   a screen reporting on a different URL than the one being fetched sends someone
   looking in the wrong place.
2. **The signing secrets.** Generate a keypair once:

   ```bash
   npm run tauri signer generate -w ~/.tauri/openodds-updater.key
   ```

   - Put the **public** key (the `.pub` file contents) into
     `plugins.updater.pubkey` in `tauri.conf.json`. It is safe to commit.
   - Add the **private** key as the `TAURI_SIGNING_PRIVATE_KEY` repository
     secret, and its password (if you set one) as
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never commit the private key.

The updater is optional: if you leave the endpoint pointing at a repository that
does not publish a manifest, update checks simply report that none is available.
Nothing else in the app depends on it.

> **Local builds need no signing key.** Signed updater artifacts are enabled only
> in CI, via
> [`src-tauri/tauri.updater.conf.json`](../src-tauri/tauri.updater.conf.json),
> which the workflow merges in with `--config`. This is deliberate: enabling it in
> the base config makes a plain `npm run tauri:build` fail without a key, which
> forces every contributor to own one.

## Two behaviours to keep intact

If you change anything about the release workflow, these are easy to regress:

- the workflow must still run `npm test` and `npm run typecheck` before building;
- the updater manifest (`latest.json`) must still be published, which requires
  `uploadUpdaterJson: true` on the `tauri-action` step.
