import initSqlJs from "sql.js";
import { toPositional, type Database } from "./database";

/**
 * A real SQLite engine, held in memory, for tests.
 *
 * Deliberately not `openSqlJsDatabase()`: that adapter loads its WASM through a
 * Vite-only `?url` import and persists to `localStorage`, neither of which
 * exists in a Node test. This builds the same `Database` contract directly on
 * top of sql.js so migrations and repo queries run against an actual SQLite
 * rather than a hand-written stub that could drift from the real SQL rules.
 *
 * Only test files import this; it is never reachable from the app entry point.
 */
export async function createMemoryDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  return {
    async execute(sql, params = []) {
      const q = toPositional(sql, params);
      // As in the browser adapter: sql.js only runs every statement in a
      // multi-statement script when it is called with no binding array, which
      // the migrations rely on.
      if (q.params.length > 0) {
        db.run(q.sql, q.params as never);
      } else {
        db.run(q.sql);
      }
    },
    async select<T>(sql: string, params: readonly unknown[] = []) {
      const q = toPositional(sql, params);
      const stmt = db.prepare(q.sql);
      try {
        if (q.params.length) stmt.bind(q.params as never);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },
    async transaction<T>(run: () => Promise<T>): Promise<T> {
      // A real transaction, so a test can prove that a batch which fails part
      // way through leaves the database as it was.
      db.run("BEGIN");
      try {
        const result = await run();
        db.run("COMMIT");
        return result;
      } catch (error) {
        try {
          db.run("ROLLBACK");
        } catch {
          // Nothing to roll back.
        }
        throw error;
      }
    },
    async close() {
      db.close();
    },
  };
}
