# Bet Tracker

A local, open-source desktop app for tracking **betting profit and loss,
promotional offers and bankroll**. Everythings stored in a SQLite file on your
machine, there is no server, no account, no sync (potentially between devices in the future) and no telemetry.

Built with [Tauri v2](https://v2.tauri.app/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)

## Features

- **Bets** - Single, multi and same-game-multi, each tagged with a **bet type**
  (Normal, Low-Hold, Arbitrage, Middle, Positive EV, Future, Sharp Money, No
  Sweat Bet, Qualifying Bet, Site Credit, Bonus Bet, Odds Boost) so bets can
  be grouped and compared later. Decimal, fractional or American odds entry;
  win/loss/void/cashout/half-win/half-loss settlement, and an optional closing
  price (CLV) per bet.
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
- **Sports categorisation** - Thoroughbred, harness and greyhound racing, soccer, AFL,
  NRL, cricket, tennis and more to be added. Enable what you use, add your own.
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
```

## Architecture

The guiding rule is **simple UI, pure domain core, adapters at the edges**. That
keeps business logic testable and portable to another shell (e.g. mobile) later.

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

The release is created as a **draft**: review the assets, then publish it. The
updater endpoint resolves `releases/latest`, which ignores drafts, so installed
apps will not see a new version until you publish.

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

- CSV import from bookmaker statements
- Enriching events from free-tier odds/form APIs (The Odds API, FormFav)
- General gambling tracking (pokies/table sessions)

## License

[MIT](LICENSE)
