# Bet Tracker

A local, open-source desktop app for tracking **betting profit and loss,
promotional offers and bankroll**. Everything is stored in a SQLite file on your
machine: no server, no account, no telemetry. There is no sync between devices
today, though the data model leaves room for it.

Built with [Tauri v2](https://v2.tauri.app/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)

## Features

- **A dashboard that works before it has data** - A fresh install shows the layout
  it will always show, with real zeros, rather than one line of grey text that
  reads as broken. The two figures that have no meaning yet — ROI and strike rate
  — show a dash instead of a confident `0.0%`, because a rate with no bets behind
  it is undefined, not excellent. It then asks for the four things that have to
  exist first (a bookmaker, a bet, a deposit, an offer) and ticks each one when
  the app can *see* it, not when you say so. There are no sample or demo rows:
  invented numbers on a profit-and-loss screen are worse than an empty one. Hide
  the checklist once you have outgrown it, and it stays hidden — with a switch in
  Settings → Preferences to bring it back, because hiding something should not be
  a one-way door.
- **Bets** - Single, multi and same-game-multi, each tagged with a **bet type**
  (Normal, Low-Hold, Arbitrage, Middle, Positive EV, Future, Sharp Money, No
  Sweat Bet, Qualifying Bet, Site Credit, Bonus Bet, Odds Boost) so bets can
  be grouped and compared later. Decimal, fractional or American odds entry;
  win/loss/void/cashout/half-win/half-loss settlement, and an optional closing
  price (CLV) per bet.
- **The record reads like a record** - Bets and positions are presented the way a
  record is read, not as a form. A strip of totals across the top describes the
  rows you are actually looking at — filter to one bookmaker and the turnover,
  ROI and strike rate follow the filter rather than reporting the whole database.
  Below it, four columns of mostly-repeated text (book, sport, format, promo)
  fold into one muted line under the bet, and a **Compact / Comfortable** control
  chooses how much of it stays: Compact is genuinely one line per bet, with the
  closing-line edge inline beside the price, and Comfortable opens the metadata
  and what a pending bet pays. Figures are right-aligned and line up by digit,
  the outcome is a coloured row edge and a word instead of a badge in every row,
  and a closing-line edge appears **only where a closing price exists** —
  "no close", repeated down every row of an imported statement, is noise.
- **Bonus bets are worth what they are actually worth** - A bonus bet is not
  your money and its stake is never returned, so a $25 bonus bet at 2.40 pays
  **$35** where $25 of cash would pay $60, and losing one costs nothing. Free
  stakes stay out of turnover and ROI while the profit they earn still counts.
- **Promos** - Profit boosts, cashback and deposit matches. Promo value is
  tracked **separately from organic profit**, so you can see how much of your
  edge is promotional. A promo never says who funded the stake — that is the bet
  type's job — so a bonus bet cannot be recorded twice and counted twice. The
  percentage always names its base: a **profit boost** is a share of the
  **profit a win would make** (30 turns $100 of profit into $130, it does not
  move the odds), while cashback and a deposit match are shares of the
  **stake**. A price the bookmaker genuinely did move is not a promo at all —
  that is the **Odds Boost** bet type, and the improved price belongs in the
  bet's odds.
- **Bankroll** - Deposits, withdrawals and adjustments, with a running balance
  and bankroll curve. Bet stakes and returns are derived from the bets table, so
  they are never double-counted.
- **Analytics** - Net profit, turnover, ROI, strike rate, cumulative P/L and
  breakdowns by sport and by bookmaker.
- **Positions** - Two or more bets that offset each other (an arbitrage, a
  middle, a bonus bet hedged against a qualifying bet) can be grouped, and the
  app reports the margin the group guarantees rather than two unrelated bets.
  The Stats screen lists them with the leg that *sets* the guarantee marked as
  the worst case, because an average across the legs would report a flattering
  number that no leg actually pays. It shows the cash staked (free stakes
  excluded), the guaranteed return and the locked margin, and keeps the
  positions still running distinguishable from settled ones.
- **CSV import from bookmaker statements** - Drop in the CSV a bookmaker exports
  and the app recognises the columns, saying what each one is being read as
  before anything is written. Rows it cannot read are **listed with their line
  numbers and a reason** — never dropped, because a silently skipped row leaves
  totals that look right. Importing the same statement twice does not double
  every bet: each row carries a fingerprint of its own contents, so a re-import
  is recognised and skipped.
- **Light and dark themes** - Every colour comes from one set of semantic tokens
  (`canvas`, `panel`, `ink`, `muted`, `positive`, `negative`, …), so the theme
  cannot be applied to half the app. Follow the operating system or pin it;
  "System" is live, so a machine that switches at sunset takes the app with it.
  Profit and loss keep their own colours, deliberately *not* blue and pink — on an
  exchange those mean back and lay, which is a different question.
- **Sports categorisation** - Thoroughbred, harness and greyhound racing, soccer, AFL,
  NRL, cricket, tennis and more to be added. Enable what you use, add your own.
- **Market prices from a real bookmaker feed** (optional) — Add a free The Odds
  API key and any bet's row gains a **Market** panel: pick a sport, pick the
  event, and see what every AU book is showing for *h2h*, with your own price
  compared against the market's. A price can then be recorded against the bet as
  its closing price, which is how CLV can come from the feed rather than from
  your memory. Two things are deliberate here. The prices are labelled as what
  the books are showing **now** — the feed has no closing-line endpoint, and it
  drops a market about fifteen minutes after the off, so a current price is not
  dressed up as a closing one. And every price is stored as a **timestamped
  observation** rather than as a number on the bet, so capturing the price at the
  off later is a matter of writing the same row at a different moment.
- **The free allowance is visible and accounted for** — `/sports` and `/events`
  cost nothing; an odds request costs one credit per market per region, so a
  single market across every Australian book is one credit out of the 500 the
  free tier gives each month. Settings shows what the month has cost and what the
  provider last reported as remaining, and nothing is fetched unless you press a
  button that names its price first.
- **Optional integrations** — Free & paid odds/form APIs are supported, but
  **entirely optional**. The app is fully usable with manual entry only.


## Getting started

### Download and install

Prebuilt installers are on the
[releases page](https://github.com/GitRefDeploy/bet-tracker/releases/latest)

| Operating System | Download |
| --- | --- |
| Windows 64-bit (almost everyone) | `Bet.Tracker_*_x64-setup.exe` |
| Windows 32-bit | `Bet.Tracker_*_x86-setup.exe` |
| Also Windows (Preference)| `Bet.Tracker_*_x64_en-US.msi` |
| Debian, Ubuntu, Mint | `Bet.Tracker_*_amd64.deb` |
| Any other Linux OS | `Bet.Tracker_*_amd64.AppImage` |

An AppImage needs its executable bit set before it will run:

```bash
chmod +x Bet.Tracker*.AppImage
./Bet.Tracker*.AppImage
```

> **These builds are not code-signed.** Windows will likely show a SmartScreen warning
> about an unknown publisher — choose **More info → Run anyway**.

### Prerequisites

- **Node.js 20+**
- **Rust** (stable) and the platform build tools for Tauri — see the
  [Tauri documentation](https://v2.tauri.app/start/prerequisites/).

### Develop

```bash
npm install
npm run tauri:dev      # full desktop app with hot reload
# or, for UI-only work in a browser:
npm run dev
```

> `npm run dev` runs the UI in a browser using a WebAssembly SQLite build
> (`sql.js`) that persists to `localStorage`. It is a development convenience
> only — the packaged app always uses real SQLite via Tauri.

### Build

```bash
npm run tauri:build    # produces installers/bundles for the current OS
```

On Windows this produces MSI and NSIS installers. On Linux, AppImage and `.deb`.

### Test

```bash
npm test               # unit, database and UI tests (Vitest)
npm run typecheck      # TypeScript
npm run lint           # ESLint, also run in CI
```

## Architecture

The guiding rule is **simple UI, pure domain core, adapters at the edges**. That
keeps business logic testable and portable to another shell (e.g. mobile) later.

Two rules in the data layer exist because they were broken once:

- **A new row's id comes from its own statement.** Use `db.insert(...)`, which
  appends `RETURNING id`, rather than an INSERT followed by
  `SELECT last_insert_rowid()`. That pair reads connection-scoped state, and
  both adapters break it: `sql.js` persists by calling `export()`, which resets
  the rowid state between the two calls, and `tauri-plugin-sql` hands out pooled
  connections, so the read can land on a different one. Either way the id comes
  back as `0` and whatever links to it links to nothing.
- **Nothing depends on transaction support.** It is optional on the `Database`
  interface because pooled connections cannot promise that a `BEGIN` and a
  `COMMIT` land together. Bulk work is written to be re-runnable instead.

```
src/
  domain/      Pure functions, no I/O — money, odds, P/L, promos, bankroll, stats
  db/          Database adapter interface, migrations, repositories
  config/      Settings and credential access (OS keychain)
  features/    One folder per screen
  components/  Small UI primitives
src-tauri/     Rust shell: SQL plugin registration + credential commands
```

- **Money is stored as integer cents.** Floats only appear at the display
  boundary, which removes rounding drift.
- **Odds are stored as decimals** regardless of the display format you choose.
- **Promo and organic profit are separated** rather than blended.
- **SQL is written with `$1`-style placeholders** (what `tauri-plugin-sql`
  requires). The browser adapter rewrites them to `?` internally.

## Data model

`settings`, `sports`, `books`, `events`, `bets`, `bet_legs`, `promos`,
`bet_promos`, `transactions` — see [`src/db/schema.ts`](src/db/schema.ts).

Migrations are plain SQL in ascending version order and are applied at startup.

`bets.import_ref` holds the fingerprint of the statement row a bet came from and
is unique when set, which is what makes re-importing a statement idempotent.
Bets entered by hand leave it NULL, and the index is partial so any number of
them can.

Dates in a statement are read **day-first** (`03/04/2026` is 3 April), because
that is how Australian bookmakers write them. When both parts could be a month
the Import screen says which reading it used and offers the other one — a date
silently read the wrong way round would move bets by months.

## Security and privacy

- No secrets are committed.
- API keys you enter are stored in the **OS credential store** (Windows
  Credential Manager / Linux Secret Service), never in the repo or a config file.
- Your betting data never leaves your machine. The only outbound requests are to
  integrations you explicitly configure — and only when you trigger them.

## Releasing

Pushing a tag like `v0.2.0` runs [`.github/workflows/release.yml`](.github/workflows/release.yml),
which builds installers for Windows x64, Windows x86 (32-bit) and Linux x64,
opens a **draft** GitHub Release, and publishes the signed `latest.json` updater
manifest that installed apps poll. A final job then checks that every installer,
its signature and every manifest entry really landed, so a release that only
half-published fails loudly instead of looking green.

The release stays a **draft** until that final job has passed, and it is the job
that publishes it — the checks are a gate, not a report. The updater endpoint
resolves `releases/latest`, which ignores drafts, so this ordering is exactly
what keeps a half-built release invisible: nothing is downloadable, and no
installed app is offered an update, until every check has passed. If a check
fails, the release stays a draft for you to inspect and the run is red.

That job reads the release with write access rather than read, which looks like
more privilege than it needs. It is not optional: GitHub's release API hides
**draft** releases from read-only tokens, so a read-only check cannot see the
draft it is supposed to verify and reports "release not found" on every release.

**The repository has to be readable without credentials.** The manifest is
fetched by an installed app, which has no GitHub account, and GitHub answers
**404** for a private repository — indistinguishable, from the app's side, from a
release that does not exist. An installed copy reports that as "the feed answered
404". Settings → Updates has a **Test the feed** button that shows exactly what
the app sees, and a field for a read-only token when the feed has to stay
private.

**The version has to go up.** The updater only installs a manifest whose version
is greater than the running build, so a release that reuses an already-installed
version is ignored — deliberately, and not reported as an error. Bump
`package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` together.

Two things are needed for releases:

1. **The updater endpoint is already configured** to
   `https://github.com/GitRefDeploy/bet-tracker/releases/latest/download/latest.json`
   in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json). If you fork this
   project, change it to your own owner and repository name.
2. **Add the signing secrets.** Generate a keypair once:

   ```bash
   npm run tauri signer generate -w ~/.tauri/bet-tracker-updater.key
   ```

   - Put the **public** key (the `.pub` file contents) into
     `plugins.updater.pubkey` in `tauri.conf.json`. It is safe to commit.
   - Add the **private** key as the `TAURI_SIGNING_PRIVATE_KEY` repository
     secret, and its password (if you set one) as
     `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Never commit the private key.

The updater is optional: if you leave the endpoint pointing at a repository that
does not publish a manifest, update checks simply report that none is available.
Nothing else in the app depends on it.

> **Local builds need no signing key.** Signed updater artifacts are enabled
> only in CI, via [`src-tauri/tauri.updater.conf.json`](src-tauri/tauri.updater.conf.json),
> which the workflow merges in with `--config`. This is deliberate: enabling it
> in the base config makes a plain `npm run tauri:build` fail without a key.

When you bump the version, update it in all three places: `package.json`,
`src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## Roadmap

- FormFav for racing form and results (the free tier is form data; per-bookmaker
  racing prices are a paid plan, so racing closing prices stay manual)
- Capturing the market price at the off automatically, so a closing price can
  come from the feed instead of being typed or picked
- General gambling tracking (pokies/table sessions)

## License

[MIT](LICENSE)
