# Contributing

Thanks for considering a contribution. This project is intended to stay
**free to run, local-first and private by default** — please keep those
constraints in mind for any change.

## Ground rules

1. **Never commit secrets or personal data.** No API keys, no real betting
   data, no personal bookmaker lists. `.gitignore` covers the common cases, but
   check `git diff --cached` before you commit.
2. **No paid services.** Integrations must work on free tiers or be optional.
3. **No backend.** The app talks to a local SQLite file and nothing else.
4. **Every user-specific value is configurable in-app**, not hardcoded.

## Development

```bash
npm install
npm run tauri:dev   # desktop app with hot reload
npm run dev         # browser-only UI preview (sql.js backing store)
npm test            # domain unit tests
npm run typecheck
```

## Where things live

| Path | Responsibility |
| --- | --- |
| `src/domain/` | Pure, I/O-free business logic. All money/odds/P&L maths lives here. |
| `src/db/` | Schema migrations, the `Database` adapter interface, and repositories. |
| `src/features/` | One folder per screen. |
| `src/config/secrets.ts` | Credential storage adapter. |
| `src-tauri/` | Rust shell — plugin registration and credential commands. |

## Tests

Domain logic **must** be covered by unit tests in `src/domain/*.test.ts`. These
are the contract for money and P/L correctness — a change to `computeProfitCents`
without a test update will be rejected.

```bash
npm test -- --watch   # focused iteration
```

Do not weaken assertions or skip tests to make a build pass. If a test is wrong,
fix the test with an explanation; if the behaviour is wrong, fix the behaviour.

## Style

- TypeScript strict mode is on; `noUnusedLocals`/`noUnusedParameters` are errors.
- Prefer pure functions in `domain/` and keep React components presentational.
- Money is always integer cents (`Cents`); never introduce a float currency value.
- Odds are always stored as decimals.

## Submitting

- Keep pull requests focused; describe the *why*, not just the *what*.
- If you add a dependency, note why an existing one could not do the job.
- Run `npm test`, `npm run typecheck` and `npm run tauri:build` before opening a PR.

## Releases and updater signing

Releases are produced by GitHub Actions on a `v*` tag. Please do not enable
`bundle.createUpdaterArtifacts` in the base `tauri.conf.json`: it forces every
contributor to own a signing key before they can run `npm run tauri:build`.
Signed updater artifacts are enabled only in CI through
`src-tauri/tauri.updater.conf.json`, which the workflow merges in with
`--config`.

If you change anything about the release workflow, keep the two behaviours
below intact, as they are easy to regress:

- the workflow must still run `npm test` and `npm run typecheck` before building;
- the updater manifest (`latest.json`) must still be published, which requires
  `uploadUpdaterJson: true` on the `tauri-action` step.

## Windows GNU toolchain note

If you build with the `x86_64-pc-windows-gnu` Rust target (e.g. using a portable
MinGW toolchain rather than MSVC), the linker may request `libgcc_eh.a`, which
recent GCC releases fold into `libgcc.a`. Creating an empty archive named
`libgcc_eh.a` in the toolchain's library directory resolves it. MSVC-based
toolchains are unaffected.
