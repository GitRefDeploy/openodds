/**
 * The one interface every database adapter implements.
 *
 * SQL is written with `$1, $2, ...` placeholders because that is what
 * `tauri-plugin-sql` requires for SQLite. The sql.js adapter rewrites them to
 * `?` internally so the same SQL runs in the browser preview and tests.
 */
export interface Database {
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  /**
   * Run an INSERT and return the id of the row it wrote.
   *
   * One statement, using `RETURNING id`, rather than an INSERT followed by
   * `SELECT last_insert_rowid()`. That pair reads connection-scoped state, and
   * both of this app's adapters break it: the sql.js one calls `export()` to
   * persist, which resets the rowid state between the two calls — so the read
   * returns 0 and the caller links its child rows to nothing — and
   * `tauri-plugin-sql` hands out pooled connections, so the second call can land
   * on a different connection from the first.
   *
   * `sql` must be an INSERT without a RETURNING clause of its own.
   */
  insert(sql: string, params?: readonly unknown[]): Promise<number>;
  close(): Promise<void>;
  /**
   * Run several statements as one unit, if the adapter can promise that.
   *
   * Optional because that promise is not free: `BEGIN`/`COMMIT` is only sound
   * on a single connection, and `tauri-plugin-sql` hands out pooled ones, so the
   * packaged adapter leaves this out rather than risk a transaction that opens
   * on one connection and commits on another. Callers must therefore be
   * idempotent (see `Repo.importBets`), so a batch interrupted half way can
   * simply be run again.
   */
  transaction?<T>(run: () => Promise<T>): Promise<T>;
}

/**
 * Rewrite `$N` placeholders into positional `?` for engines (sql.js) that do
 * not understand them, keeping parameter order correct and supporting reuse.
 */
export function toPositional(
  sql: string,
  params: readonly unknown[] = [],
): { sql: string; params: unknown[] } {
  const ordered: unknown[] = [];
  const rewritten = sql.replace(/\$(\d+)/g, (_match, n: string) => {
    ordered.push(params[Number(n) - 1]);
    return "?";
  });
  return { sql: rewritten, params: ordered };
}
