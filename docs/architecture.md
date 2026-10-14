# How OpenOdds is put together

This is the developer-facing description of the code. For how to build, run and
test it, see [CONTRIBUTING.md](../CONTRIBUTING.md); for the working notes and the
reasoning behind individual decisions, see [AGENTS.md](../AGENTS.md).

## The guiding rule

**Simple UI, pure domain core, adapters at the edges.** Business logic lives in
plain functions with no I/O, so it is testable on its own and could be driven by
another shell later.

```
src/
  domain/      Pure functions, no I/O — money, odds, P/L, promos, bankroll, stats
  db/          Database adapter interface, migrations, repositories
  config/      Settings and credential access (OS keychain), updater
  features/    One folder per screen
  components/  Small UI primitives
src-tauri/     Rust shell: SQL plugin registration, credential and legacy-import commands
```

The same UI runs two ways, and they do not have the same capabilities:

- **The packaged app** uses real SQLite through `tauri-plugin-sql`. The database
  lives in the OS application-data directory keyed by the identifier
  `io.github.openodds.app`; API keys live in the OS credential store under the
  service name `openodds`.
- **The browser preview** (`npm run dev`) runs against a WebAssembly SQLite build
  (`sql.js`) that persists to `localStorage`, with API keys falling back to the
  same store and the UI saying so. It cannot read an old install's data, so the
  legacy import never fires there.

## Data-layer rules that exist because they were broken once

- **A new row's id comes from its own statement.** Use `db.insert(...)`, which
  appends `RETURNING id`, rather than an INSERT followed by
  `SELECT last_insert_rowid()`. That pair reads connection-scoped state and both
  adapters break it: `sql.js` persists by calling `export()`, which resets the
  rowid state between the two calls, and `tauri-plugin-sql` hands out pooled
  connections, so the read can land on a different one. Either way the id comes
  back as `0`, and whatever references it references nothing.
- **Nothing depends on transaction support.** It is optional on the `Database`
  interface because pooled connections cannot promise that a `BEGIN` and a
  `COMMIT` land together. Bulk work is written to be **re-runnable** instead,
  which is how `importBets` survives being interrupted half way.
- **SQL uses `$1, $2, …` placeholders** (what `tauri-plugin-sql` requires). The
  `sql.js` adapter rewrites them to `?` internally.
- **Migrations are plain SQL in ascending version order**, applied at startup and
  recorded in `_migrations`. A new migration needs a test that upgrades a database
  from the previous version **with rows already in it** and shows those rows
  surviving.
- **Corrections to seeded data ship as guarded migrations, not as edits to the
  taxonomy.** A sport's name is stored on its row rather than looked up by slug,
  so changing `DEFAULT_SPORTS` reaches a fresh install and nobody else. Migration
  8 is the pattern to copy: each statement is guarded by the exact string it
  replaces, so a value the user renamed themselves is left alone.

## Money and odds

- **Money is integer cents.** Floats appear only at the display boundary. Never
  introduce a float currency value.
- **Odds are always stored as decimals**, whatever display format is chosen.
- **ROI divides by `cashStakeCents`, never by the recorded stake.** A free stake
  risks nothing and must not inflate the denominator: free stakes stay out of
  turnover while the profit they earn still counts.
- A bet's class implies two things about the money, in `src/domain/betClass.ts`:
  `freeStake` (the stake was not the punter's own cash) and `stakeReturned` (a win
  hands the stake back along with the profit). A **bonus bet** is free with the
  stake never returned, so a $25 bonus bet at 2.40 pays **$35** where $25 of cash
  would pay $60; **site credit** is free but the stake is returned, so it behaves
  like cash.
- **Promo value is reported separately from organic profit**, and a promo never
  says who funded the stake — that is the class's job, which is what stops one
  bonus bet being recorded twice and counted twice. A promo's value is stored with
  the bet in `bet_promos.applied_value_cents`.
- **A market price is a timestamped observation**, not a number on a bet.
  `market_quotes.observed_at` is when the price was true and `recorded_at` is when
  this app wrote it down; they differ for a fetched price and are equal for a
  typed one. `bets.clv` stays the effective closing price the screens read, and a
  fetched price only populates it when the user says so — that number has to mean
  the price at the off, or the CLV figure lies.

## Data model

`settings`, `sports`, `books`, `events`, `bets`, `bet_legs`, `promos`,
`bet_promos`, `transactions` — see [`src/db/schema.ts`](../src/db/schema.ts).

`bets.import_ref` holds the fingerprint of the statement row a bet came from and
is unique when set, which is what makes re-importing a statement idempotent. Bets
entered by hand leave it NULL, and the index is partial so any number of them can.

A **position** is a shared `position_id` on the bets rather than a table of its
own: the group *is* the bets holding the key, so the two cannot drift apart and
removing the last leg removes the position with it. `MIN_POSITION_LEGS` is 2.

Dates in a statement are read **day-first** (`03/04/2026` is 3 April), because
that is how Australian bookmakers write them. When both parts could be a month,
the Import screen says which reading it used and offers the other one — a date
silently read the wrong way round would move bets by months.

## What the tests cannot see

Two blind spots that have already let real bugs ship, so treat them as known
hazards rather than hypotheticals:

- **Chart tests hold the arrangement, not the pixels.** They assert that no file
  under `src/features` imports recharts, and that the duplicate-date setting is
  mentioned in exactly one place. But a chart can render axes with no data at all
  and still pass — the breakdown bars did exactly that until a browser was pointed
  at it.
- **jsdom has no layout engine.** No unit test here can tell that a box is 11px
  too wide and painted under the main pane. Anything about fit, overflow or
  overlapping labels belongs to the end-to-end suite, which measures the real
  window. See [e2e/README.md](../e2e/README.md).

Also deliberate, and not a bug to "fix": **recharts' entry animation is disabled
for the bars** (the axes, grid and tooltip still animate in). Each bar is drawn
inside an animation, and a window that never delivers a frame leaves the rectangle
zero-sized, so it renders as nothing.
