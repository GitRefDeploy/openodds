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
  {
    version: 2,
    // `bet_type` records the shape of a bet (single, multi) and is labelled
    // "Format" in the UI. `bet_class` is the separate question of how the bet
    // was placed — arbitrage, bonus bet, and so on. `clv` is the closing price
    // at the off, which is what lets a bet be judged against the market.
    sql: `
ALTER TABLE bets ADD COLUMN bet_class TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE bets ADD COLUMN clv REAL;
`,
  },
  {
    version: 3,
    // Positions are a shared key rather than a table of their own: a position
    // is exactly the bets carrying its number, so the two cannot drift apart
    // and deleting the last leg deletes the position with it.
    sql: `
ALTER TABLE bets ADD COLUMN position_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_bets_position ON bets(position_id);
`,
  },
  {
    version: 4,
    // "Bonus bet" and "Free bet" used to exist as promo types as well as bet
    // classes, so one bonus bet could be recorded both ways: its stake was
    // excluded from the amount at risk *and* its value was credited again as
    // promo value. The bet class owns that now, so fold the old promo rows back
    // into the class they described and drop them.
    sql: `
UPDATE bets SET bet_class = 'bonus_bet'
  WHERE bet_class NOT IN ('bonus_bet', 'site_credit')
    AND id IN (
      SELECT bp.bet_id FROM bet_promos bp
      JOIN promos p ON p.id = bp.promo_id
      WHERE p.type IN ('bonus_bet', 'free_bet')
    );

DELETE FROM bet_promos
  WHERE promo_id IN (
    SELECT id FROM promos WHERE type IN ('bonus_bet', 'free_bet')
  );

DELETE FROM promos WHERE type IN ('bonus_bet', 'free_bet');
`,
  },
  {
    version: 5,
    // Two vocabularies had ended up with each other's names. The promo type
    // measured a share of the *profit* a win would make but was called
    // `odds_boost`; the bet class meant "taken at a genuinely boosted price"
    // but was called `profit_boost`. So "30" on the promo read as a change in
    // the odds, and "Profit Boost" on the bet read as a promo. They swap, one
    // statement per table, so each word means one thing: a promo type of
    // `profit_boost` is a share of profit, and a bet class of `odds_boost` is a
    // bet whose price really moved.
    //
    // These are renames, not toggles — after the update no row holds the old
    // value in that column — so running the migration twice cannot swap back.
    sql: `
UPDATE promos SET type = 'profit_boost' WHERE type = 'odds_boost';
UPDATE bets SET bet_class = 'odds_boost' WHERE bet_class = 'profit_boost';
`,
  },
  {
    version: 6,
    // A bet imported from a statement carries the fingerprint of the row it
    // came from, which is what stops a re-imported statement from doubling
    // every bet. Partial index (WHERE import_ref IS NOT NULL) because bets
    // entered by hand have no reference and any number of NULLs must be
    // allowed.
    sql: `
ALTER TABLE bets ADD COLUMN import_ref TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bets_import_ref
  ON bets(import_ref) WHERE import_ref IS NOT NULL;
`,
  },
  {
    version: 7,
    // Quotes go with the bet they describe. The cascade above is documentation
    // rather than machinery: SQLite defaults foreign keys off, which is why
    // deleteBet unlinks them by hand.

    // A market price is stored as an observation with the time it was seen,
    // never as a number on a bet. That distinction is what keeps a later
    // revision cheap: capturing the price at the off writes the same row shape
    // at a different moment, so "the closing price" stays a question about
    // which observation you mean rather than a second kind of record.
    //
    // bets.clv is deliberately untouched. It remains the effective closing
    // price that the Bets and Stats screens already read, and a quote only
    // populates it when the user says to.
    sql: `
CREATE TABLE IF NOT EXISTS market_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id INTEGER REFERENCES bets(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_event_id TEXT,
  sport_key TEXT,
  event_name TEXT,
  market_key TEXT NOT NULL DEFAULT 'h2h',
  selection TEXT NOT NULL,
  price REAL NOT NULL,
  book_key TEXT,
  book_name TEXT,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_market_quotes_bet ON market_quotes(bet_id);

CREATE TABLE IF NOT EXISTS odds_api_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_remaining INTEGER,
  called_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`,
  },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  currency: "AUD",
  oddsFormat: "decimal",
  // A fresh install follows the machine rather than assuming dark, since a
  // bright room and a dark one want different answers. An existing database
  // keeps whatever it already stored.
  theme: "system",
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
