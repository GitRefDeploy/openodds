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

  // Persisting the whole database to localStorage is not free — it serialises
  // and base64-encodes every byte — so inside a transaction we do it once, at
  // the end, rather than once per statement. Otherwise importing a few hundred
  // bets would rewrite the file a few hundred times.
  let batching = false;

  const write = (sql: string, params: readonly unknown[]) => {
    const q = toPositional(sql, params);
    // With no bound parameters we must call run(sql) rather than run(sql, []):
    // an empty-but-truthy array makes sql.js prepare only the first statement,
    // which would silently drop the rest of a multi-statement migration.
    if (q.params.length > 0) {
      db.run(q.sql, q.params as never);
    } else {
      db.run(q.sql);
    }
  };

  return {
    async execute(sql, params = []) {
      write(sql, params);
      if (!batching) persist(db);
    },
    async select<T>(sql: string, params: readonly unknown[] = []) {
      const q = toPositional(sql, params);
      return toRows<T>(db, q.sql, q.params);
    },
    async insert(sql, params = []) {
      const q = toPositional(`${sql} RETURNING id`, params);
      const rows = toRows<{ id: number }>(db, q.sql, q.params);
      // `select` deliberately does not persist, so a write does that itself —
      // and it is safe to do so here only because the id has already been read.
      if (!batching) persist(db);
      return rows[0].id;
    },
    async transaction<T>(run: () => Promise<T>): Promise<T> {
      // Nested calls join the outer transaction rather than issuing a second
      // BEGIN, which SQLite rejects.
      if (batching) return run();
      write("BEGIN", []);
      batching = true;
      try {
        const result = await run();
        batching = false;
        write("COMMIT", []);
        persist(db);
        return result;
      } catch (error) {
        batching = false;
        try {
          write("ROLLBACK", []);
        } catch {
          // Nothing to roll back.
        }
        throw error;
      }
    },
    async close() {
      persist(db);
      db.close();
    },
  };
}
