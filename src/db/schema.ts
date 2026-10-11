import type { Database } from "./database";
import { DEFAULT_SPORTS } from "@/domain/taxonomy";

export interface Migration {
  version: number;
  sql: string;
}

/**
 * Migrations are applied in ascending version order and recorded in
 * `_migrations`. They are idempotent-by-version, so running them on an
 * up-to-date database is a no-op.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'other',
  enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS books (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL DEFAULT 'bookmaker',
  currency        TEXT NOT NULL DEFAULT 'AUD',
  commission_rate REAL NOT NULL DEFAULT 0,
  color           TEXT NOT NULL DEFAULT '#6366f1',
  archived        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sport_id      INTEGER REFERENCES sports(id),
  name          TEXT NOT NULL,
  starts_at     TEXT,
  external_ref  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id      INTEGER NOT NULL REFERENCES books(id),
  sport_id     INTEGER REFERENCES sports(id),
  event_id     INTEGER REFERENCES events(id),
  description  TEXT NOT NULL DEFAULT '',
  bet_type     TEXT NOT NULL DEFAULT 'single',
  stake_cents  INTEGER NOT NULL DEFAULT 0,
  odds         REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  return_cents INTEGER NOT NULL DEFAULT 0,
  placed_at    TEXT,
  settled_at   TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bets_book ON bets(book_id);
CREATE INDEX IF NOT EXISTS idx_bets_sport ON bets(sport_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);

CREATE TABLE IF NOT EXISTS bet_legs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id    INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  selection TEXT NOT NULL DEFAULT '',
  market    TEXT NOT NULL DEFAULT '',
  odds      REAL NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'other',
  value_type TEXT NOT NULL DEFAULT 'percent',
  value      REAL NOT NULL DEFAULT 0,
  min_odds   REAL NOT NULL DEFAULT 0,
  book_id    INTEGER REFERENCES books(id),
  sport_id   INTEGER REFERENCES sports(id),
  starts_at  TEXT,
  ends_at    TEXT,
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bet_promos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id             INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  promo_id           INTEGER NOT NULL REFERENCES promos(id) ON DELETE CASCADE,
  applied_value_cents INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id      INTEGER NOT NULL REFERENCES books(id),
  type         TEXT NOT NULL DEFAULT 'deposit',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  occurred_at  TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_book ON transactions(book_id);
`,
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  currency: "AUD",
  oddsFormat: "decimal",
  theme: "dark",
  setupComplete: "false",
};

async function currentVersion(db: Database): Promise<number> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  const rows = await db.select<{ version: number }>(
    `SELECT COALESCE(MAX(version), 0) AS version FROM _migrations`,
  );
  return rows[0]?.version ?? 0;
}

export async function migrate(db: Database): Promise<void> {
  const from = await currentVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;
    await db.execute(migration.sql);
    await db.execute(`INSERT INTO _migrations (version) VALUES ($1)`, [
      migration.version,
    ]);
  }
}

/** Populate generic, non-personal defaults on an empty database. */
export async function seedDefaults(db: Database): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO NOTHING`,
      [key, value],
    );
  }

  const existing = await db.select<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sports`,
  );
  if ((existing[0]?.count ?? 0) === 0) {
    for (let i = 0; i < DEFAULT_SPORTS.length; i++) {
      const s = DEFAULT_SPORTS[i];
      await db.execute(
        `INSERT INTO sports (slug, name, kind, enabled, sort_order) VALUES ($1, $2, $3, 1, $4)
         ON CONFLICT(slug) DO NOTHING`,
        [s.slug, s.name, s.kind, i],
      );
    }
  }
}
