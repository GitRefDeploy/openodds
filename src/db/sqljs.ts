import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { toPositional, type Database } from "./database";

const STORAGE_KEY = "bet-tracker.db";

function loadPersisted(): Uint8Array | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

function persist(db: SqlJsDatabase): void {
  try {
    const data = db.export();
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      binary += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    globalThis.localStorage?.setItem(STORAGE_KEY, btoa(binary));
  } catch {
    // Persistence is best-effort in the browser preview.
  }
}

function toRows<T>(db: SqlJsDatabase, sql: string, params: unknown[]): T[] {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params as never);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

/** Browser-only adapter. Used by `npm run dev` and never in packaged builds. */
export async function openSqlJsDatabase(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const db = new SQL.Database(loadPersisted());

  return {
    async execute(sql, params = []) {
      const q = toPositional(sql, params);
      // With no bound parameters we must call run(sql) rather than run(sql, []):
      // an empty-but-truthy array makes sql.js prepare only the first statement,
      // which would silently drop the rest of a multi-statement migration.
      if (q.params.length > 0) {
        db.run(q.sql, q.params as never);
      } else {
        db.run(q.sql);
      }
      persist(db);
    },
    async select<T>(sql: string, params: readonly unknown[] = []) {
      const q = toPositional(sql, params);
      return toRows<T>(db, q.sql, q.params);
    },
    async close() {
      persist(db);
      db.close();
    },
  };
}
