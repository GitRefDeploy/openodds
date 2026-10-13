import Database from "@tauri-apps/plugin-sql";
import type { Database as Adapter } from "./database";
import { importLegacyIdentity } from "./legacy";

/** The database file, relative to the app-config directory. */
export const DATABASE_FILE = "openodds.db";

/**
 * Production adapter. Backed by `tauri-plugin-sql` (sqlx/SQLite), which takes
 * `$1, $2, ...` placeholders — matching the SQL used across the app.
 */
export async function openTauriDatabase(): Promise<Adapter> {
  // Before the load, not after: `Database.load` creates the file if it is not
  // there, and the imported copy has to be in place before that happens.
  await importLegacyIdentity(DATABASE_FILE);

  const db = await Database.load(`sqlite:${DATABASE_FILE}`);

  // Deliberately no `transaction`: the plugin executes against a connection
  // pool, so a BEGIN and a later COMMIT need not land on the same connection
  // and the app could report a rollback it never performed. Bulk work is made
  // re-runnable instead — an interrupted import can simply be run again.
  return {
    async execute(sql, params = []) {
      await db.execute(sql, params as unknown[]);
    },
    async select<T>(sql: string, params: readonly unknown[] = []) {
      return (await db.select<T[]>(sql, params as unknown[])) as T[];
    },
    async insert(sql, params = []) {
      // RETURNING rather than last_insert_rowid(): the pool means the rowid
      // could otherwise be read from a different connection than the insert ran
      // on, and the id would come back as 0.
      const rows = await db.select<{ id: number }[]>(`${sql} RETURNING id`, params as unknown[]);
      return rows[0].id;
    },
    async close() {
      await db.close();
    },
  };
}

export function isTauriRuntime(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)
  );
}
