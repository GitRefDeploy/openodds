# End-to-end tests

These launch the **packaged desktop app** and drive it through WebDriver. There is
one thing they exist to check, and it is the one thing no other test can: what
happens to someone who is updating from the version before the app was renamed.

The suite is two runs of the app with deliberate surgery in between:

1. **Seed** — a fresh install goes through its setup wizard and records a bet
   through its own import screen, so the data is real data the app produced
   rather than a fixture this test built to its own idea of the schema.
2. **Simulate the previous install** — the database is moved to the directory
   named after the identity the app had before the rename, and this identity's
   directory is deleted. The old identity is exactly what an install that has not
   been updated yet looks like.
3. **Verify** — the app is launched again. It has no database of its own, one is
   waiting under the old identity, and the spec asserts both halves of the
   outcome a user cares about: the app says it brought the data across, and the
   bet is on the Bets screen.

## Running it

The driver needs a real display, so on a headless machine wrap it in `xvfb-run`,
and it needs the app built first. From the repository root:

```bash
npm run tauri -- build --no-bundle     # release binary the specs drive
cargo install tauri-driver --locked    # the WebDriver intermediary
cd e2e && npm ci && xvfb-run -a npm test
```

On Linux the WebDriver itself comes from `webkit2gtk-driver`; Windows would need
a matching `msedgedriver` and is not set up here — the suite runs on Linux only.

Point `OPENODDS_BINARY` at another build if you want to test one that is not in
`src-tauri/target/release`.

## When it fails

A failing test writes the page source and a screenshot to `e2e/artifacts/`, and CI
uploads them with the run. The suite only ever runs where nobody is watching, so
"the app never showed X" without the screen it was on is a dead end.

## It does not touch your install

The app is launched with `XDG_CONFIG_HOME` and `XDG_DATA_HOME` set to a temporary
directory (`e2e/data-root.mjs`), so the whole run — setup wizard, bet, moved
database, import — happens in a sandbox. A real `~/.config/io.github.openodds.app`
is never read or written, which means running this suite cannot disturb an install
you actually use.
