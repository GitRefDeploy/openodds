# Bet Tracker

A local-first, open-source desktop app for tracking **betting profit and loss,
promotional offers and bankroll**. Everything lives in a SQLite file on your
machine — there is no server, no account, no sync and no telemetry.

Built with [Tauri v2](https://v2.tauri.app/) + React + TypeScript, it targets
Windows and Linux desktop from a single codebase, with a mobile port possible
later.

## Features

- **Bets** — single, multi and same-game-multi. Decimal, fractional or American
  odds entry; win/loss/void/cashout/half-win/half-loss settlement.
- **Promos** — bonus bets, free bets, odds boosts, cashback and deposit matches.
  Promo value is tracked **separately from organic profit**, so you can see how
  much of your edge is promotional.
- **Bankroll** — deposits, withdrawals and adjustments, with a running balance
  and bankroll curve. Bet stakes and returns are derived from the bets table, so
  they are never double-counted.
- **Analytics** — net profit, turnover, ROI, strike rate, cumulative P/L and
  breakdowns by sport and by bookmaker.
- **Sports taxonomy** — thoroughbred, harness and greyhound racing, soccer, AFL,
  NRL, cricket, tennis and more. Enable what you use, add your own.
- **Optional integrations** — free-tier odds/form APIs are supported, but
  **entirely optional**. The app is fully usable with manual entry only.

## Screens

| Screen | What it does |
| --- | --- |
| Dashboard | Net profit, turnover, ROI, strike rate, promo vs organic split, charts |
| Bets | Filterable/sortable ledger of every bet |
| Promos | Promo library with per-promo value delivered |
| Bankroll | Cash movements, balance and bankroll curve |
| Bookmakers | Your books and exchanges (nothing pre-configured) |
| Sports | Enable/disable codes, add custom sports |
| Settings | Currency, odds format, API keys, data export |

## Getting started

### Prerequisites

- **Node.js 20+**
- **Rust** (stable) and the platform build tools for Tauri — see the
  [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/).

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
npm test               # domain unit tests (Vitest)
npm run typecheck      # TypeScript
```

## Architecture

The guiding rule is **thin UI, pure domain core, adapters at the edges**. That
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

Key decisions:

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

- No secrets are committed. There are no API keys in the repository.
- API keys you enter are stored in the **OS credential store** (Windows
  Credential Manager / Linux Secret Service), never in the repo or a config file.
- Your betting data never leaves your machine. The only outbound requests are to
  integrations you explicitly configure — and only when you trigger them.

## Releasing

Pushing a tag like `v0.2.0` runs [`.github/workflows/release.yml`](.github/workflows/release.yml),
which builds Windows and Linux installers, opens a **draft** GitHub Release, and
publishes the signed `latest.json` updater manifest that installed apps poll.

Before the first release, do two things:

1. **Point the updater at your repository.** Update the `endpoints` URL in
   [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) to
   `https://github.com/<your-owner>/<your-repo>/releases/latest/download/latest.json`.
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
