import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { toPositional } from "./database";

/**
 * Why `Database.insert` uses `RETURNING id` instead of an INSERT followed by
 * `SELECT last_insert_rowid()`.
 *
 * That pair looks harmless and passes against the in-memory test adapter, which
 * is exactly how it survived into production and broke the browser preview: the
 * sql.js adapter persists by calling `export()`, and exporting resets the
 * connection's rowid state, so the read afterwards returns 0. Everything that
 * linked a child row to a parent then linked it to nothing — a multi-leg bet's
 * legs, a bookmaker created during an import, a closing price against its bet.
 *
 * This reproduces the persistence cycle directly, because the in-memory adapter
 * used by every other test does not have one.
 */

/** One insert, with the browser adapter's persist-then-read cycle around it. */
async function withPersistCycle(): Promise<{ afterExport: number; maxId: number }> {
  const SQL = await initSqlJs();
  const live = new SQL.Database();
  live.run(
    `CREATE TABLE probe (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)`,
  );

  const run = (sql: string, params: unknown[] = []) => {
    const q = toPositional(sql, params);
    if (q.params.length) live.run(q.sql, q.params as never);
    else live.run(q.sql);
  };

  run(`INSERT INTO probe (v) VALUES ($1)`, ["a"]);
  // What `persist()` does, and what resets the rowid state.
  const persisted = live.export();
  const reopened = new SQL.Database(persisted);

  const readRowid = (db: InstanceType<typeof SQL.Database>): number => {
    const stmt = db.prepare(`SELECT last_insert_rowid() AS id`);
    try {
      stmt.step();
      return (stmt.getAsObject() as { id: number }).id;
    } finally {
      stmt.free();
    }
  };

  const maxId = (() => {
    const stmt = reopened.prepare(`SELECT MAX(id) AS id FROM probe`);
    try {
      stmt.step();
      return (stmt.getAsObject() as { id: number }).id;
    } finally {
      stmt.free();
    }
  })();

  const afterExport = readRowid(reopened);
  live.close();
  reopened.close();
  return { afterExport, maxId };
}

describe("reading the id of a row you just inserted", () => {
  it("is not something the connection can be asked after a persist", async () => {
    const { afterExport, maxId } = await withPersistCycle();

    // The row is there, with a real id...
    expect(maxId).toBe(1);
    // ...and the connection has no memory of having written it.
    expect(afterExport).toBe(0);
  });

  it("comes back reliably from RETURNING, in the same statement", async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(`CREATE TABLE probe (id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT)`);

    const insertReturning = (value: string): number => {
      const q = toPositional(`INSERT INTO probe (v) VALUES ($1) RETURNING id`, [
        value,
      ]);
      const stmt = db.prepare(q.sql);
      try {
        stmt.bind(q.params as never);
        stmt.step();
        return (stmt.getAsObject() as { id: number }).id;
      } finally {
        stmt.free();
      }
    };

    const first = insertReturning("a");
    // Exporting between the two inserts is what used to break the second id.
    db.export();
    const second = insertReturning("b");

    expect(first).toBe(1);
    expect(second).toBe(2);
    db.close();
  });
});
