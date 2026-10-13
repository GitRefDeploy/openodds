import fs from "node:fs";
import {
  companions,
  configHome,
  currentDatabase,
  currentDir,
  previousDatabase,
  previousDir,
} from "./data-root.mjs";

/**
 * Turn the install the first spec just used into the one the rename left behind.
 *
 * The rename changed the identity the operating system files an app under, so an
 * install that has not been updated yet keeps its database in a directory named
 * after the old identifier. That is exactly the state this reproduces: the
 * database recorded through the app's own screens is moved to where the previous
 * identity kept it, and the new identity's directory is removed, so the next
 * launch has nothing of its own and has to find it.
 *
 * The database is moved rather than copied so that "the bets are still there" can
 * only be true because the import ran: there is no other copy left to read.
 */
if (!fs.existsSync(currentDatabase)) {
  throw new Error(
    `no database at ${currentDatabase} — the seeding spec has to have run first`,
  );
}

fs.mkdirSync(previousDir, { recursive: true });
const moved = [];
for (const suffix of ["", ...companions]) {
  const from = `${currentDatabase}${suffix}`;
  if (!fs.existsSync(from)) continue;
  fs.renameSync(from, `${previousDatabase}${suffix}`);
  moved.push(`openodds.db${suffix}`);
}
fs.rmSync(currentDir, { recursive: true, force: true });

console.log(`moved ${moved.join(", ")} to ${previousDir}`);
console.log(`removed ${currentDir}`);
console.log(`the app now has to import from ${previousDatabase}`);
console.log(`config root for this run: ${configHome}`);
