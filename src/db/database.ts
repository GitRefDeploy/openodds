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
  close(): Promise<void>;
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
