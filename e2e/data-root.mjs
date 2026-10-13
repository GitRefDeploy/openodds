import os from "node:os";
import path from "node:path";

/**
 * The per-user directories the app under test will use.
 *
 * The app is launched by the WebDriver with `XDG_CONFIG_HOME` and
 * `XDG_DATA_HOME` pointing here, which is how Tauri resolves its application
 * directories on Linux. That keeps the suite off whoever is running it: it never
 * reads or writes the real `~/.config/io.github.openodds.app`, so there is no way
 * for a test run to disturb an install someone actually uses.
 *
 * The names below are the two identities involved: the app's own, and the one it
 * had before the rename, which is where the data being imported has to be found.
 */
const root =
  process.env.OPENODDS_E2E_DATA_ROOT ??
  path.join(os.tmpdir(), "openodds-e2e-data");

export const dataRoot = root;
export const configHome = path.join(root, "config");
export const dataHome = path.join(root, "data");

/** Mirrors how the app derives its own directory from the identifier. */
export const currentDir = path.join(configHome, "io.github.openodds.app");
export const previousDir = path.join(configHome, "io.github.bet-tracker.app");

export const currentDatabase = path.join(currentDir, "openodds.db");
export const previousDatabase = path.join(previousDir, "bet-tracker.db");

/** SQLite keeps recent writes in these, and both have to move with the file. */
export const companions = ["-wal", "-shm"];
