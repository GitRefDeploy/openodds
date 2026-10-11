import { migrate, seedDefaults } from "./schema";
import { Repo } from "./repo";
import type { Database } from "./database";

/**
 * Production uses the Tauri SQL plugin; the browser dev preview uses sql.js.
 * Imports are dynamic so the packaged bundle never pulls in the WASM adapter
 * and the browser bundle never pulls in the Tauri plugin.
 */
export async function openDatabase(): Promise<Database> {
  const inTauri =
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>);

  if (inTauri) {
    const { openTauriDatabase } = await import("./tauri");
    return openTauriDatabase();
  }
  const { openSqlJsDatabase } = await import("./sqljs");
  return openSqlJsDatabase();
}

export async function initRepo(): Promise<Repo> {
  const db = await openDatabase();
  await migrate(db);
  await seedDefaults(db);
  return new Repo(db);
}

export type { Database } from "./database";
export { Repo } from "./repo";
