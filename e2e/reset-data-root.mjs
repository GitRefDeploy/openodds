import fs from "node:fs";
import { dataRoot } from "./data-root.mjs";

/**
 * Start from nothing, so the first launch is a first launch.
 *
 * This deletes the sandbox root the app is pointed at and nothing else — that is
 * a temporary directory by default, and the whole point of pointing the app there
 * is that a test run cannot touch a real install.
 */
fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(dataRoot, { recursive: true });
console.log(`cleared ${dataRoot}`);
