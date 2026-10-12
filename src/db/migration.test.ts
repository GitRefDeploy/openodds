import { describe, expect, it } from "vitest";
import type { Database } from "./database";
import { createMemoryDatabase } from "./memoryDb";
import { MIGRATIONS, migrate } from "./schema";

const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Apply the real migrations up to (and including) `version`, so a test can
 * stand up a database that predates the migration under examination. This is
 * the same SQL the app runs, so the "before" state is genuine rather than a
 * hand-written approximation of an old schema.
 */
async function openAt(version: number): Promise<Database> {
  const db = await createMemoryDatabase();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  for (const migration of MIGRATIONS) {
    if (migration.version > version) continue;
    await db.execute(migration.sql);
    await db.execute(`INSERT OR IGNORE INTO _migrations (version) VALUES ($1)`, [
      migration.version,
    ]);
  }
  return db;
}

async function appliedVersion(db: Database): Promise<number> {
  const rows = await db.select<{ version: number }>(
    `SELECT COALESCE(MAX(version), 0) AS version FROM _migrations`,
  );
  return rows[0]?.version ?? 0;
}

async function columnsOf(db: Database, table: string): Promise<string[]> {
  const rows = await db.select<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((row) => row.name);
}

async function indexesOn(db: Database, table: string): Promise<string[]> {
  const rows = await db.select<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = $1`,
    [table],
  );
  return rows.map((row) => row.name);
}

async function addBook(db: Database, name: string): Promise<number> {
  await db.execute(`INSERT INTO books (name) VALUES ($1)`, [name]);
  const rows = await db.select<{ id: number }>(
    `SELECT last_insert_rowid() AS id`,
  );
  return rows[0].id;
}

/** Insert a bet using only the columns that existed at schema v1. */
async function addLegacyBet(
  db: Database,
  bookId: number,
  description: string,
  stakeCents: number,
): Promise<number> {
  await db.execute(
    `INSERT INTO bets (book_id, description, bet_type, stake_cents, odds, status, return_cents, placed_at, notes)
     VALUES ($1, $2, 'single', $3, 2.0, 'won', 0, '2026-01-01', '')`,
    [bookId, description, stakeCents],
  );
  const rows = await db.select<{ id: number }>(
    `SELECT last_insert_rowid() AS id`,
  );
  return rows[0].id;
}

async function addPromo(
  db: Database,
  name: string,
  type: string,
): Promise<number> {
  await db.execute(
    `INSERT INTO promos (name, type, value_type, value) VALUES ($1, $2, 'percent', 20)`,
    [name, type],
  );
  const rows = await db.select<{ id: number }>(
    `SELECT last_insert_rowid() AS id`,
  );
  return rows[0].id;
}

async function linkPromo(
  db: Database,
  betId: number,
  promoId: number,
  valueCents: number,
): Promise<void> {
  await db.execute(
    `INSERT INTO bet_promos (bet_id, promo_id, applied_value_cents) VALUES ($1, $2, $3)`,
    [betId, promoId, valueCents],
  );
}

describe("migrations", () => {
  it("brings an empty database up to the newest version", async () => {
    const db = await createMemoryDatabase();
    await migrate(db);

    expect(await appliedVersion(db)).toBe(LATEST);

    const betColumns = await columnsOf(db, "bets");
    expect(betColumns).toContain("bet_class");
    expect(betColumns).toContain("clv");
    expect(betColumns).toContain("position_id");

    for (const table of ["settings", "books", "sports", "bets", "promos"]) {
      expect(await columnsOf(db, table)).not.toHaveLength(0);
    }
  });

  it("upgrades a v1 database in place without losing its bets", async () => {
    const db = await openAt(1);
    const bookId = await addBook(db, "Sportsbet");
    const betId = await addLegacyBet(db, bookId, "Randwick R5", 2500);

    // Before the upgrade the row cannot even name the new columns.
    expect(await columnsOf(db, "bets")).not.toContain("position_id");

    await migrate(db);

    const rows = await db.select<{
      id: number;
      description: string;
      stake_cents: number;
      bet_class: string;
      clv: number | null;
      position_id: number | null;
    }>(`SELECT id, description, stake_cents, bet_class, clv, position_id FROM bets`);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(betId);
    expect(rows[0].description).toBe("Randwick R5");
    expect(rows[0].stake_cents).toBe(2500);
    // Existing bets are ordinary paid cash bets until told otherwise.
    expect(rows[0].bet_class).toBe("normal");
    expect(rows[0].clv).toBeNull();
    expect(rows[0].position_id).toBeNull();
    expect(await appliedVersion(db)).toBe(LATEST);
  });

  it("adds an index for the position key", async () => {
    const db = await openAt(2);
    expect(await indexesOn(db, "bets")).not.toContain("idx_bets_position");
    await migrate(db);
    expect(await indexesOn(db, "bets")).toContain("idx_bets_position");
  });

  it("is idempotent, so an up-to-date database is left alone", async () => {
    const db = await openAt(1);
    const bookId = await addBook(db, "Ladbrokes");
    await addLegacyBet(db, bookId, "Cox Plate", 1000);

    await migrate(db);
    await migrate(db);

    expect(await appliedVersion(db)).toBe(LATEST);
    const bets = await db.select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM bets`,
    );
    expect(bets[0].count).toBe(1);
    const books = await db.select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM books`,
    );
    expect(books[0].count).toBe(1);
  });
});

describe("migration 4 — one path for a free stake", () => {
  it("folds a legacy bonus-bet promo into the bet class and drops the duplicate", async () => {
    const db = await openAt(3);
    const bookId = await addBook(db, "Sportsbet");
    const betId = await addLegacyBet(db, bookId, "$25 bonus bet", 2500);
    const promoId = await addPromo(db, "Bonus bet", "bonus_bet");
    await linkPromo(db, betId, promoId, 2500);

    await migrate(db);

    const bet = await db.select<{ bet_class: string }>(
      `SELECT bet_class FROM bets WHERE id = $1`,
      [betId],
    );
    // The intent — this was paid for with a bonus — now lives on the bet.
    expect(bet[0].bet_class).toBe("bonus_bet");

    const promos = await db.select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM promos`,
    );
    expect(promos[0].count).toBe(0);
    const links = await db.select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM bet_promos`,
    );
    expect(links[0].count).toBe(0);
  });

  it("removes the duplicate without re-flagging a bet that is already free", async () => {
    const db = await openAt(3);
    const bookId = await addBook(db, "Sportsbet");
    const betId = await addLegacyBet(db, bookId, "$25 bonus bet", 2500);
    await db.execute(`UPDATE bets SET bet_class = 'bonus_bet' WHERE id = $1`, [
      betId,
    ]);
    const promoId = await addPromo(db, "Bonus bet", "free_bet");
    await linkPromo(db, betId, promoId, 2500);

    await migrate(db);

    const bet = await db.select<{ bet_class: string }>(
      `SELECT bet_class FROM bets WHERE id = $1`,
      [betId],
    );
    expect(bet[0].bet_class).toBe("bonus_bet");
    const links = await db.select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM bet_promos`,
    );
    expect(links[0].count).toBe(0);
  });

  it("leaves a genuine promo, and its link, untouched", async () => {
    const db = await openAt(3);
    const bookId = await addBook(db, "Sportsbet");
    const betId = await addLegacyBet(db, bookId, "Boosted single", 5000);
    const promoId = await addPromo(db, "20% boost", "odds_boost");
    await linkPromo(db, betId, promoId, 1000);

    await migrate(db);

    const promos = await db.select<{ name: string; type: string }>(
      `SELECT name, type FROM promos`,
    );
    // The offer survives migration 4, and migration 5 — which runs in the same
    // pass — then renames its type. It is still the same one promo.
    expect(promos).toEqual([{ name: "20% boost", type: "profit_boost" }]);
    const links = await db.select<{ applied_value_cents: number }>(
      `SELECT applied_value_cents FROM bet_promos`,
    );
    expect(links).toEqual([{ applied_value_cents: 1000 }]);
    const bet = await db.select<{ bet_class: string }>(
      `SELECT bet_class FROM bets WHERE id = $1`,
      [betId],
    );
    expect(bet[0].bet_class).toBe("normal");
  });
});

/** The whole stored row, so a migration can be held to touching only its field. */
async function promoRow(
  db: Database,
  id: number,
): Promise<Record<string, unknown>> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM promos WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function betRow(
  db: Database,
  id: number,
): Promise<Record<string, unknown>> {
  const rows = await db.select<Record<string, unknown>>(
    `SELECT * FROM bets WHERE id = $1`,
    [id],
  );
  return rows[0];
}

describe("migration 5 — one word per concept", () => {
  it("swaps the two names and leaves every other column alone", async () => {
    const db = await openAt(4);
    const bookId = await addBook(db, "Sportsbet");
    const betId = await addLegacyBet(db, bookId, "Boosted single", 5000);
    await db.execute(
      `UPDATE bets SET bet_class = 'profit_boost', clv = 2.1, position_id = 7 WHERE id = $1`,
      [betId],
    );
    const promoId = await addPromo(db, "30% profit boost", "odds_boost");
    await linkPromo(db, betId, promoId, 1500);

    const promoBefore = await promoRow(db, promoId);
    const betBefore = await betRow(db, betId);
    expect(promoBefore.type).toBe("odds_boost");
    expect(betBefore.bet_class).toBe("profit_boost");

    await migrate(db);

    // Only the name changed: the same row with one field different.
    expect(await promoRow(db, promoId)).toEqual({
      ...promoBefore,
      type: "profit_boost",
    });
    expect(await betRow(db, betId)).toEqual({
      ...betBefore,
      bet_class: "odds_boost",
      // The import fingerprint arrived later; a bet entered by hand has none.
      import_ref: null,
    });

    // The link between them, and the value it carries, is untouched.
    const links = await db.select<{
      bet_id: number;
      promo_id: number;
      applied_value_cents: number;
    }>(`SELECT bet_id, promo_id, applied_value_cents FROM bet_promos`);
    expect(links).toEqual([
      { bet_id: betId, promo_id: promoId, applied_value_cents: 1500 },
    ]);
    expect(await appliedVersion(db)).toBe(LATEST);
  });

  it("cannot swap back when it is run again", async () => {
    const db = await openAt(4);
    const bookId = await addBook(db, "TAB");
    const betId = await addLegacyBet(db, bookId, "Boosted multi", 1000);
    await db.execute(`UPDATE bets SET bet_class = 'profit_boost' WHERE id = $1`, [
      betId,
    ]);
    const promoId = await addPromo(db, "Boost", "odds_boost");

    await migrate(db);
    await migrate(db);

    expect((await promoRow(db, promoId)).type).toBe("profit_boost");
    expect((await betRow(db, betId)).bet_class).toBe("odds_boost");
  });

  it("leaves a name it does not recognise exactly as it found it", async () => {
    const db = await openAt(4);
    const bookId = await addBook(db, "Neds");
    const betId = await addLegacyBet(db, bookId, "Something else", 1000);
    await db.execute(`UPDATE bets SET bet_class = 'mystery_class' WHERE id = $1`, [
      betId,
    ]);
    const promoId = await addPromo(db, "Mystery offer", "mystery_offer");

    await migrate(db);

    expect((await promoRow(db, promoId)).type).toBe("mystery_offer");
    expect((await betRow(db, betId)).bet_class).toBe("mystery_class");
  });
});

async function addBetWithRef(db: Database, ref: string | null): Promise<void> {
  const bookId = await addBook(db, `Book ${Math.random()}`);
  await db.execute(
    `INSERT INTO bets (book_id, description, stake_cents, odds, status, import_ref)
     VALUES ($1, 'Imported', 1000, 2.0, 'won', $2)`,
    [bookId, ref],
  );
}

describe("the import fingerprint", () => {
  it("adds the column and its index to an existing database", async () => {
    const db = await openAt(5);
    expect(await columnsOf(db, "bets")).not.toContain("import_ref");

    await migrate(db);

    expect(await columnsOf(db, "bets")).toContain("import_ref");
    expect(await indexesOn(db, "bets")).toContain("idx_bets_import_ref");
  });

  it("allows any number of bets entered by hand", async () => {
    // The index is partial on purpose: NULL is every hand-entered bet, and a
    // plain UNIQUE would let only one of them exist.
    const db = await openAt(5);
    await migrate(db);

    await addBetWithRef(db, null);
    await addBetWithRef(db, null);

    const rows = await db.select(`SELECT id FROM bets`);
    expect(rows).toHaveLength(2);
  });

  it("refuses the same statement row twice", async () => {
    const db = await openAt(5);
    await migrate(db);

    await addBetWithRef(db, "TAB|2026-03-10|5000|2.4000|won|flemington r3 #4");

    await expect(
      addBetWithRef(db, "TAB|2026-03-10|5000|2.4000|won|flemington r3 #4"),
    ).rejects.toThrow();
  });
});
describe("market quotes", () => {
  it("adds the quote and ledger tables to an existing database", async () => {
    const db = await openAt(6);

    await migrate(db);

    expect(await columnsOf(db, "market_quotes")).toEqual([
      "id",
      "bet_id",
      "source",
      "external_event_id",
      "sport_key",
      "event_name",
      "market_key",
      "selection",
      "price",
      "book_key",
      "book_name",
      "observed_at",
      "recorded_at",
    ]);
    expect(await indexesOn(db, "market_quotes")).toContain(
      "idx_market_quotes_bet",
    );
    expect(await columnsOf(db, "odds_api_calls")).toContain(
      "credits_remaining",
    );
    expect(await appliedVersion(db)).toBe(LATEST);
  });

  it("leaves the bets it already had exactly as they were", async () => {
    // A quote is provenance. It is never a reason to touch a bet on upgrade,
    // which is what keeps a closing price that was typed by hand intact.
    const db = await openAt(6);
    const bookId = await addBook(db, "Sportsbet");
    const betId = await addLegacyBet(db, bookId, "Flemington R3", 5000);
    const before = await betRow(db, betId);

    await migrate(db);

    expect(await betRow(db, betId)).toEqual(before);
  });

  it("can be run twice without complaint", async () => {
    const db = await openAt(6);
    await migrate(db);
    await migrate(db);

    expect(await appliedVersion(db)).toBe(LATEST);
  });
});
