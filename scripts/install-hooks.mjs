/**
 * Put the repository's hooks where git will look for them.
 *
 * A hook under `.git/hooks` is not version-controlled, so a check that lives
 * there is a check each person has to remember to create. The hook itself is
 * tracked, in `scripts/hooks/`, and `npm install` runs this file — through the
 * `prepare` script — to copy it into place. That is the only reason this exists:
 * the rule is enforced by CI either way, but a guard nobody installs is a guard
 * nobody has.
 *
 * Two deliberate behaviours:
 *
 * - **Nothing is overwritten that is not ours.** A hook of the same name that
 *   does not carry our marker is somebody's own work, and replacing it would be
 *   a rude way to install a nicety. It is left alone, with a line saying so.
 * - **Not being a git checkout is not an error.** `npm ci` runs this in CI,
 *   where the checkout does have a `.git`, but a tarball or a vendored copy may
 *   not: the hook is then simply not installed, and the build continues.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = join(dirname(fileURLToPath(import.meta.url)), "hooks");
const root = resolve(source, "..", "..");

/** The line every installed copy carries, so we can tell ours from someone's. */
const MARKER = "Installed by scripts/install-hooks.mjs";

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

let hooksDir;
try {
  const reported = git(["rev-parse", "--git-path", "hooks"]);
  hooksDir = isAbsolute(reported) ? reported : resolve(root, reported);
} catch {
  console.log("Not a git checkout, so no hooks to install.");
  process.exit(0);
}

let installed = 0;
let skipped = 0;

for (const name of readdirSync(source)) {
  const from = join(source, name);
  const to = join(hooksDir, name);
  const contents = readFileSync(from, "utf8");

  if (existsSync(to)) {
    const existing = readFileSync(to, "utf8");
    if (existing === contents) continue;
    if (!existing.includes(MARKER)) {
      console.log(
        `Left ${to} alone: it is not ours. Install the check by hand, or move that hook aside.`,
      );
      skipped += 1;
      continue;
    }
  }

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(to, contents);
  // git refuses to run a hook that is not executable, which on a fresh clone is
  // the difference between a guard and a file.
  chmodSync(to, 0o755);
  console.log(`Installed ${name} into ${hooksDir}.`);
  installed += 1;
}

if (installed === 0 && skipped === 0) {
  console.log("Git hooks are already current.");
}
