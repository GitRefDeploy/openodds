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
5. **Commits credit only their human authors.** No `Co-Authored-By`, "generated
   with", "assisted by" or similar trailers for an assistant, agent, tool, bot or
   service — in commit messages or pull request descriptions. Whoever writes a
   change, the commit names the person accountable for it. Credit for anything
   else is added deliberately by the maintainer, never by default. CI checks both
   the commits a push adds and the pull request description, and fails the build
   rather than leaving it to review.

## Development

```bash
npm install
npm run tauri:dev   # desktop app with hot reload
npm run dev         # browser-only UI preview (sql.js backing store)
npm test            # domain unit tests
npm run typecheck
npm run lint
scripts/check-credit.sh commits HEAD   # the rule above, over a whole history
```

The end-to-end suite drives the packaged desktop app and needs a build and a
WebDriver first — see [e2e/README.md](e2e/README.md). It checks the one thing no
other test can: what an install updating from before the rename sees. CI runs it
on Linux.

`npm install` also installs a **`pre-push` hook**, from `scripts/hooks/` through
`scripts/install-hooks.mjs`. It runs the same credit check as CI, against the
commits a push would add, and refuses the push when one of them carries agent
credit — so the rule is caught before it leaves the machine rather than only
afterwards. Pushing history you did not write, which the rule cannot be blamed
for, is what `OPENODDS_SKIP_CREDIT_HOOK=1 git push` is for; CI reads the same
commits either way.

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

Migrations and repository queries are covered in `src/db/*.test.ts`, which run
against a **real in-memory SQLite** (`src/db/memoryDb.ts`) rather than a stub, so
the SQL is genuinely executed. A new migration needs a test that upgrades a
database from the previous version *with rows already in it* and shows those
rows surviving.

Behaviour that only exists in a screen — selection, wiring, what a table renders
— is covered with a jsdom test: put `// @vitest-environment jsdom` on the first
line and render the component with `@testing-library/react`. Keep these to the
seam between the component and the domain; the maths itself belongs in
`src/domain/`.

The money rules a bet's class implies live in `src/domain/betClass.ts`: whether
the stake was the punter's own cash, and whether a win gives it back. A bonus
bet is neither, which is why it pays `stake x (odds - 1)` and why ROI must divide
by `cashStakeCents` rather than the recorded stake.

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
