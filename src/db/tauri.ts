import Database from "@tauri-apps/plugin-sql";
import type { Database as Adapter } from "./database";

/**
 * Production adapter. Backed by `tauri-plugin-sql` (sqlx/SQLite), which takes
 * `$1, $2, ...` placeholders — matching the SQL used across the app.
 */
export async function openTauriDatabase(): Promise<Adapter> {
  const db = await Database.load("sqlite:bet-tracker.db");

  return {
    async execute(sql, params = []) {
      await db.execute(sql, params as unknown[]);
    },
    async select<T>(sql: string, params: readonly unknown[] = []) {
      return (await db.select<T[]>(sql, params as unknown[])) as T[];
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
