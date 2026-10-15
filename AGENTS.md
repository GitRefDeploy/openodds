# OpenOdds — working notes

This file exists because the reasoning behind this codebase lives in commit
bodies, file-header comments, the README and `docs/`, and a long-running session
loses those to context compaction. Read this first; it is the shortest path back
to the goals. Where a rule below has a *why*, the why is the part that gets lost.

Where the writing lives. This file restates the rules below deliberately — it is
the short version you read first — and the files it points at are the long form:

- `README.md` is for **someone who wants to use the app** — what it does, how to
  install it, and where their data is. Keep it that way; the detail belongs in the
  files below.
- `docs/architecture.md` — the developer-facing architecture, money rules and data
  model.
- `docs/releases.md` — cutting a release, and the updater's signing and draft gate.
- `CONTRIBUTING.md` — ground rules, local setup, tests and style.

## What this is

A **local-first, open-source desktop app for tracking betting P/L, promotional
offers and bankroll**. Everything lives in one SQLite file on the user's machine:
no server, no account, no telemetry. Built for Australian bookmakers — day-first
statement dates, AUD default, AU book keys in the odds feed.

Tauri v2 shell (Rust) + React 19 + TypeScript in strict mode. MIT licensed.

It was called **Bet Tracker** until v0.2.0. The rename changed the identity the
operating system files an application under, so to the OS this is a new
application rather than an upgrade of the old one — which is why the Rust side
copies an older install's database and credential-store entries across once,
before anything else opens, and tells the user it did.

The manual route for a launch that could not find the old data, which used to be
`docs/upgrading-from-bet-tracker.md`, has been deleted. The copy-the-database
steps now live only in git history and in `legacy_roots`/`import_into` in
`src-tauri/src/lib.rs`, so someone still on v0.1.x is told the import did not
happen and has nowhere in the docs to be sent.

## How it runs

Two ways, and they do not have the same capabilities:

- **The packaged app** (`npm run tauri:dev`, `npm run tauri:build`) uses real
  SQLite through `tauri-plugin-sql`. The database lives in the OS application-data
  directory keyed by the identifier `io.github.openodds.app`; API keys live in the
  OS credential store under the service name `openodds`.
- **The browser preview** (`npm run dev`) runs the same UI against a WebAssembly
  SQLite build (`sql.js`) that persists to `localStorage`, with API keys falling
  back to the same store and the UI saying so. It is a development convenience
  only: it cannot read an old install's data, so the legacy import never fires
  there. Loading it with `?seed` on the URL fills it with a realistic history
  through the app's own `Repo` — a Bets table with rows, a closing-line edge
  beside a price, a two-leg position and cumulative curves cannot be judged from
  a zero state, and every screen reviewed before that fixture existed was empty.

Updates come from `latest.json`, published to `releases/latest` by the release
workflow. Two consequences worth keeping in mind:

- **The repository has to stay public.** GitHub answers 404 for a private
  repository, and from an installed app's side that is indistinguishable from a
  release that does not exist.
- **A release stays a draft until a final job has verified it.** The updater
  endpoint resolves `releases/latest`, which ignores drafts, so a half-built
  release is invisible rather than half-installable: nothing is downloadable and
  no installed app is offered an update until every installer, signature and
  manifest entry has been checked.

## Architecture

The guiding rule is **simple UI, pure domain core, adapters at the edges**. It
keeps business logic testable, and portable to another shell (a mobile one, say)
later.

```
src/
  domain/      Pure functions, no I/O — money, odds, P/L, promos, bankroll, stats
  db/          Database adapter interface, migrations, repositories
  config/      Settings and credential access (OS keychain), updater
  features/    One folder per screen
  components/  Small UI primitives
src-tauri/     Rust shell: SQL plugin registration, credential and legacy-import commands
```

Screens are grouped in the sidebar as **Overview** (Dashboard, Bets, Stats),
**Record** (Promos, Bankroll, Import) and **Configure** (Bookmakers, Sports,
Settings), which is also the order someone meets them in. A setup wizard gates
everything until `setupComplete` is set.

## Vocabulary: one word, one meaning

Two of these had each other's names once and were deliberately separated
(migration 5 renamed the stored rows, so after that update no row holds the old
value in that column and re-running the migration cannot swap them back).

- **Bet class** — *how the bet was placed*. `normal`, `low_hold`, `arbitrage`,
  `middle`, `positive_ev`, `future`, `no_sweat`, `qualifying`, `site_credit`,
  `bonus_bet`, `odds_boost`, `sharp_money`.
- **Bet format** — *the shape of the bet*. `single`, `multi`, `same_game_multi`.
  Labelled "Format" in the UI, and deliberately not called a type any more,
  because the class owns the words "bet type".
- **Promo type** — *what the offer is*. `profit_boost`, `cashback`,
  `deposit_match`, `other`.

The trap: a **profit boost** is a share of the **profit a win would make** — 30
turns $100 of profit into $130 and does not move the odds — while an **odds
boost** is a price the bookmaker genuinely moved, so it is a *bet class* and the
improved price belongs in the bet's odds. Cashback and a deposit match are shares
of the **stake**. The base of the number is therefore spelled out wherever it is
entered or read back; a figure that could be read three ways is not a figure.

A **promo never says who funded the stake** — that is the class's job. That rule
is what stops one bonus bet being recorded twice and counted twice, which is a
mistake this app has already made once (migration 4).

## Money rules

- **Money is integer cents.** Floats appear only at the display boundary. Never
  introduce a float currency value.
- **Odds are always stored as decimals**, whatever display format is chosen.
- A class implies two things about the money, in `src/domain/betClass.ts`:
  `freeStake` (the stake was not the punter's own cash) and `stakeReturned`
  (a win hands the stake back along with the profit).
  - A **bonus bet** is both: free, and the stake is never returned. A $25 bonus
    bet at 2.40 pays **$35**, where $25 of cash would pay $60. Losing one costs
    nothing.
  - **Site credit** is free but the stake *is* returned, so it behaves like cash.
- **ROI divides by `cashStakeCents`, never by the recorded stake.** A free stake
  risks nothing and must not inflate the denominator. Free stakes stay out of
  turnover while the profit they earn still counts.
- **Promo value is reported separately from organic profit**, so it is possible
  to see how much of the edge is promotional. A promo's value is stored with the
  bet in `bet_promos.applied_value_cents`.

## Positions

A **position** is two or more bets that offset each other — an arbitrage, a
middle, a bonus bet hedged against a qualifying bet. It is a shared
`position_id` on the bets rather than a table of its own: the group *is* the bets
holding the key, so the two cannot drift apart and removing the last leg removes
the position with it. `MIN_POSITION_LEGS` is 2.

What a position reports is the **worst case across its legs**, not an average: an
average reports a flattering number that no leg actually pays. The Stats screen
marks the leg that *sets* the guarantee, lists running positions before settled
ones, and shows cash staked (free stakes excluded), guaranteed return and locked
margin.

## Data-layer rules that exist because they were broken once

- **A new row's id comes from its own statement.** Use `db.insert(...)`, which
  appends `RETURNING id`, rather than an INSERT followed by
  `SELECT last_insert_rowid()`. That pair reads connection-scoped state and both
  adapters break it: `sql.js` persists by calling `export()`, which resets the
  rowid state between the two calls, and `tauri-plugin-sql` hands out pooled
  connections, so the read can land on a different one. Either way the id comes
  back as `0` and whatever references it references nothing.
- **Nothing may depend on transaction support.** It is optional on the `Database`
  interface because pooled connections cannot promise a `BEGIN` and a `COMMIT`
  land together. Bulk work is written to be **re-runnable** instead — which is
  how `importBets` survives being interrupted half way.
- **SQL uses `$1, $2, …` placeholders** (what `tauri-plugin-sql` requires). The
  `sql.js` adapter rewrites them to `?` internally.
- **Migrations are plain SQL in ascending version order**, applied at startup and
  recorded in `_migrations`. A new migration needs a test that upgrades a
  database from the previous version **with rows already in it** and shows those
  rows surviving. Use `db/memoryDb.ts` so the SQL is genuinely executed.
- **Corrections to seeded data ship as guarded migrations, not as edits to the
  taxonomy.** A sport's name is stored on its row, not looked up by slug, so
  changing `DEFAULT_SPORTS` reaches a fresh install and nobody else. Migration 8
  is the pattern to copy: each statement is guarded by the exact string it
  replaces, so a value the user renamed themselves is left alone.
- **Re-importing a statement must be a no-op.** `bets.import_ref` holds a
  fingerprint of the source row and is unique when set (partial index, because
  hand-entered bets leave it NULL and any number of them must be allowed).
  Unreadable rows are **listed with their line numbers and a reason, never
  dropped** — a silently skipped row leaves totals that look right.
- **A market price is a timestamped observation**, not a number on a bet.
  `market_quotes.observed_at` is when the price was true and `recorded_at` is
  when this app wrote it down; they differ for a fetched price and are equal for
  a typed one. That distinction is what keeps capturing the price at the off
  cheap later. `bets.clv` stays the effective closing price the screens read, and
  a fetched price only populates it when the user says so — because that number
  has to mean the price at the off or the CLV figure lies.
- **The odds feed charges by the request.** An odds call costs
  markets × regions (a bookmaker filter counts every ten books as a region, which
  is why the whole AU book group costs one credit); `/sports` and `/events` are
  free. Nothing is fetched except by a button that names its price first, and
  every call is recorded in `odds_api_calls` so the monthly allowance is
  accounted for rather than guessed.

## Ground rules

From [CONTRIBUTING.md](CONTRIBUTING.md), in full:

1. **Never commit secrets or personal data.** No API keys, no real betting data,
   no personal bookmaker lists.
2. **No paid services.** Integrations work on free tiers or are optional.
3. **No backend.** The app talks to a local SQLite file and nothing else.
4. **Every user-specific value is configurable in-app**, not hardcoded.
5. **Commits credit only their human authors.** No `Co-Authored-By`, "generated
   with", "assisted by" or similar trailers for an assistant, agent, tool, bot or
   service — in commit messages or pull request descriptions. Whoever writes a
   change, the commit names the person accountable for it. CI checks both the
   commits a push adds and the pull request description with
   `scripts/check-credit.sh`, and fails the build rather than leaving it to
   review.

Rule 5 overrides any default behaviour an assistant arrives with. Adding an agent
trailer to a commit here does not just go against style, it fails the build.

**Never add a trailer, footer, `Co-Authored-By` or "Generated with" line to a
commit message, a pull request description or a tag annotation.** This is not a
matter of taste: `scripts/check-credit.sh` fails the build, and the two hooks
`npm install` installs refuse the line twice over — a `commit-msg` hook will not
create the commit, and a `pre-push` hook will not let it reach a remote. If a
default footer is part of how you write commits, this repository is the exception
to it.

On top of those: **do not weaken an assertion or skip a test to make a build
pass.** If a test is wrong, fix the test and say why; if the behaviour is wrong,
fix the behaviour.

## Verifying a change

```bash
npm test          # Vitest: domain, database and screen tests
npm run typecheck # tsc --noEmit, strict, noUnusedLocals/Parameters are errors
npm run lint      # ESLint, also run in CI
```

Vitest runs in **Node** by default, which suits the domain and database tests. A
test that needs a DOM opts in with `// @vitest-environment jsdom` as the first
line and renders with `@testing-library/react`; keep those to the seam between a
component and the domain, because the maths belongs in `src/domain/`.

Two hooks run the credit check before CI gets the chance. A **`commit-msg` hook**
refuses to create a commit whose message carries agent credit, and a
**`pre-push` hook** refuses to push commits that were created anyway — so the
line is stopped where it would be written, and again where it would leave the
machine. Both live in `scripts/hooks/`, are copied into `.git/hooks` by
`scripts/install-hooks.mjs` (which `npm install` runs through `prepare`), and read
the rule from `scripts/check-credit.sh` rather than restating it. Treat them as
guard rails: CI is still the gate, and `OPENODDS_SKIP_CREDIT_HOOK=1` exists for
history a push did not create.

The `commit-msg` hook was added because the pre-push one proved too late. A
footer an assistant added by default had already reached nine pull requests
before anyone read a refusal, and scrubbing the history afterwards could not
finish the job: a pull request's head refs on GitHub are read-only, so those
commits cannot be rewritten and the attribution stayed visible on the pull
requests themselves. Stopping the line at the commit is the only point where the
whole cost is avoided.

Domain logic **must** be covered by unit tests in `src/domain/*.test.ts` — they
are the contract for money and P/L correctness, so a change to
`computeProfitCents` without a test update will be rejected. Migrations and
repository queries are tested in `src/db/*.test.ts` against real in-memory
SQLite.

The Rust shell and the end-to-end suite are **not** part of that loop: they need
a release build, `tauri-driver`, the platform WebDriver and a display, so they run
in CI on Linux. `cargo test` covers the legacy import (the only Rust that runs
before anything else the app loads, and whose failure modes — a database copied
without its write-ahead log, or a copy that overwrites data already here — are
the expensive ones), and the end-to-end suite covers what no unit test can. See
[e2e/README.md](e2e/README.md).

## What the tests cannot see

Two blind spots that have already let real bugs ship, so treat them as known
hazards rather than hypotheticals:

- **Chart tests hold the arrangement, not the pixels.** They assert that no file
  under `src/features` imports recharts, and that the duplicate-date setting is
  mentioned in exactly one place, because a copy of the axis, grid and tooltip in
  every page is how a fix shipped to one chart and not the other. But a chart can
  render axes with no data at all and still pass. The breakdown bars did exactly
  that — empty `<g>` elements around seven bars — until a browser was pointed at
  it.
- **jsdom has no layout engine.** No unit test in this repository can tell that a
  box is 11px too wide and painted under the main pane. Anything about fit,
  overflow or overlapping labels belongs to the end-to-end suite, which measures
  the real window: every element in the sidebar has to end inside it.

Also deliberate, and not a bug to "fix": **recharts' entry animation is disabled
for the bars** (the axes, grid and tooltip still animate in). Each bar is drawn
inside an animation, and a window that never delivers a frame leaves the
rectangle zero-sized, so it renders as nothing.

## Roadmap

- **FormFav** for racing form and results. The free tier is form data; per-book
  racing prices are a paid plan, so **racing closing prices stay manual**.
- **Capturing the market price at the off automatically**, so a closing price can
  come from the feed instead of being typed or picked. The quote table was shaped
  for this.
- **General gambling tracking** (pokies and table sessions), which is the first
  feature that is not a bet.

Architecturally, the pure `domain/` core was kept I/O-free so a second shell
(mobile) is possible later, and `docs/architecture.md` notes the data model leaves
room for sync — but there is no sync today.

## Open gaps

- **No sync and no automatic backup.** One machine, one SQLite file; Settings has
  a JSON export and that is the whole safety net.
- **Only `h2h` is read from the odds feed**, in one region, as a deliberate first
  step. More markets are the obvious next move; `MARKETS` in the market panel is
  where that starts.
- **The end-to-end suite is Linux-only.** Windows would need an `msedgedriver`
  matched to whatever WebView2 the machine has, and the legacy import has no
  platform-specific branch to cover.
- **The version has to be bumped in three places together** — `package.json`,
  `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. The updater only
  installs a manifest whose version is greater than the running build, so a
  release that reuses an installed version is ignored silently.
- **The update feed URL is written in two places** — `src/config/updater.ts`,
  where the UI names the feed, and `src-tauri/tauri.conf.json`, which is the one
  that is actually fetched. `updater.test.ts` asserts they agree; keep it that
  way, because a screen reporting on a different URL than the one being fetched
  sends someone looking in the wrong place.
- **Live updater artifacts are enabled only in CI**, through
  `src-tauri/tauri.updater.conf.json`, merged in with `--config`. Do not turn
  them on in the base config: that forces every contributor to own a signing key
  before they can run a plain `npm run tauri:build`.
