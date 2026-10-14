# Upgrading from Bet Tracker (v0.1.x)

The app was renamed in v0.2.0: Bet Tracker is now **OpenOdds**. The rename also
changed the identity your operating system files an application under — its
database directory and its credential-store entry — so to the OS this is a **new
application rather than an upgrade of the old one**. The first launch is built to
make that invisible.

## Your data comes across by itself

Once, before it opens anything, OpenOdds looks for an older installation and
copies it in: bets, bookmakers, sports, promos, bankroll and settings, plus the
optional API keys from the OS credential store. The app tells you when it has done
this.

The copy only happens when OpenOdds has no database of its own, so it can never
overwrite what you have entered since — and nothing on the old side is moved or
deleted, so the old copy keeps working exactly as it did.

## How the update reaches you

An older copy checks the same repository for releases, and GitHub redirects the
renamed repository, so its update check still resolves and now offers v0.2.0.
Accepting it installs OpenOdds alongside the old copy on Windows, and replaces the
AppImage file on Linux. The data copy above is what makes that land as an upgrade.

If you would rather not take the update in the old app, install from the
[releases page](https://github.com/GitRefDeploy/openodds/releases/latest) instead —
the outcome is the same.

## Don't keep using both

The copy happens once. Bets entered in the old copy afterwards stay there, and
OpenOdds will not look again. Check your numbers, then uninstall the old version —
they are separate applications, so removing one leaves the other alone.

The browser development preview (`npm run dev`) imports nothing, because there is
no old application data to read from a web page. That preview is a convenience for
UI work only.

## If the import did not happen

A machine where the old directory was moved, or a first launch that failed (the
app says so rather than staying silent), can be sorted out by hand. The old copy
keeps its bets in a SQLite file named after its own identity:

| OS | The old copy's database |
| --- | --- |
| Windows | `%APPDATA%\io.github.bet-tracker.app\bet-tracker.db` |
| Linux | the same file under `io.github.bet-tracker.app/` in your app config directory — `~/.config/…`, or `$XDG_CONFIG_HOME` if you set it |

Start OpenOdds once and quit it, so its own directory exists, then copy that file
into `io.github.openodds.app/` as `openodds.db`. The schema did not change, so it
opens as-is. Settings also has an export that writes everything to a JSON file, if
you would rather keep a snapshot first.

API keys are the one thing that cannot be copied by hand — they live in the OS
credential store, so they are re-entered in Settings.

## For developers

This is the only Rust that runs before anything else the app loads, which is why
`cargo test` covers it: the expensive failure modes are a database copied without
its write-ahead log, and a copy that overwrites data already here. The end-to-end
suite covers the whole path a user sees in two runs of the packaged app — see
[e2e/README.md](../e2e/README.md).
