import type { Database } from "./database";
import type {
  BetLeg,
  BetRow,
  BetType,
  BetView,
  Book,
  BookKind,
  NewBet,
  Promo,
  Sport,
  Transaction,
  TransactionView,
} from "./types";
import type { PromoType, PromoValueType } from "@/domain/promo";
import type { TransactionType } from "@/domain/bankroll";
import type { BetStatus } from "@/domain/pnl";

export interface BetFilter {
  bookId?: number;
  sportId?: number;
  status?: BetStatus | "all";
  from?: string;
  to?: string;
  search?: string;
}

/** Build a WHERE clause with correctly numbered placeholders. */
function where(parts: Array<[string, unknown]>): {
  sql: string;
  params: unknown[];
} {
  const params: unknown[] = [];
  const clauses = parts
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([fragment, value]) => {
      params.push(value);
      return fragment.replace("?", `$${params.length}`);
    });
  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

const BET_VIEW_SELECT = `
SELECT b.*,
       bk.name  AS book_name,
       bk.currency AS currency,
       s.name   AS sport_name,
       s.slug   AS sport_slug,
       s.kind   AS sport_kind,
       COALESCE((
         SELECT SUM(bp.applied_value_cents) FROM bet_promos bp WHERE bp.bet_id = b.id
       ), 0) AS promo_value_cents
FROM bets b
JOIN books bk ON bk.id = b.book_id
LEFT JOIN sports s ON s.id = b.sport_id
`;

export class Repo {
  constructor(private readonly db: Database) {}

  // ---------------------------------------------------------------- settings
  async getSettings(): Promise<Record<string, string>> {
    const rows = await this.db.select<{ key: string; value: string }>(
      `SELECT key, value FROM settings`,
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  // ------------------------------------------------------------------ sports
  async listSports(onlyEnabled = false): Promise<Sport[]> {
    return this.db.select<Sport>(
      `SELECT * FROM sports ${onlyEnabled ? "WHERE enabled = 1" : ""} ORDER BY sort_order, name`,
    );
  }

  async setSportEnabled(id: number, enabled: boolean): Promise<void> {
    await this.db.execute(`UPDATE sports SET enabled = $1 WHERE id = $2`, [
      enabled ? 1 : 0,
      id,
    ]);
  }

  async createSport(input: {
    slug: string;
    name: string;
    kind: string;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO sports (slug, name, kind, enabled, sort_order)
       VALUES ($1, $2, $3, 1, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM sports))`,
      [input.slug, input.name, input.kind],
    );
  }

  // ------------------------------------------------------------------- books
  async listBooks(includeArchived = false): Promise<Book[]> {
    return this.db.select<Book>(
      `SELECT * FROM books ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY name`,
    );
  }

  async createBook(input: {
    name: string;
    kind?: BookKind;
    currency?: string;
    commissionRate?: number;
    color?: string;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO books (name, kind, currency, commission_rate, color)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.name,
        input.kind ?? "bookmaker",
        input.currency ?? "AUD",
        input.commissionRate ?? 0,
        input.color ?? "#6366f1",
      ],
    );
  }

  async updateBook(
    id: number,
    input: Partial<{
      name: string;
      kind: BookKind;
      currency: string;
      commissionRate: number;
      color: string;
      archived: boolean;
    }>,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (input.name !== undefined) push("name", input.name);
    if (input.kind !== undefined) push("kind", input.kind);
    if (input.currency !== undefined) push("currency", input.currency);
    if (input.commissionRate !== undefined)
      push("commission_rate", input.commissionRate);
    if (input.color !== undefined) push("color", input.color);
    if (input.archived !== undefined) push("archived", input.archived ? 1 : 0);
    if (!sets.length) return;
    params.push(id);
    await this.db.execute(
      `UPDATE books SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params,
    );
  }

  // -------------------------------------------------------------------- bets
  async listBets(filter: BetFilter = {}): Promise<BetView[]> {
    const { sql, params } = where([
      ["b.book_id = ?", filter.bookId],
      ["b.sport_id = ?", filter.sportId],
      [
        "b.status = ?",
        filter.status && filter.status !== "all" ? filter.status : undefined,
      ],
      ["COALESCE(b.placed_at, b.created_at) >= ?", filter.from],
      ["COALESCE(b.placed_at, b.created_at) <= ?", filter.to],
      ["b.description LIKE ?", filter.search ? `%${filter.search}%` : undefined],
    ]);
    return this.db.select<BetView>(
      `${BET_VIEW_SELECT} ${sql} ORDER BY COALESCE(b.placed_at, b.created_at) DESC, b.id DESC`,
      params,
    );
  }

  async getBet(id: number): Promise<BetView | undefined> {
    const rows = await this.db.select<BetView>(
      `${BET_VIEW_SELECT} WHERE b.id = $1`,
      [id],
    );
    return rows[0];
  }

  async listLegs(betId: number): Promise<BetLeg[]> {
    return this.db.select<BetLeg>(
      `SELECT * FROM bet_legs WHERE bet_id = $1 ORDER BY position, id`,
      [betId],
    );
  }

  async listBetPromos(
    betId: number,
  ): Promise<{ promo_id: number; applied_value_cents: number }[]> {
    return this.db.select(
      `SELECT promo_id, applied_value_cents FROM bet_promos WHERE bet_id = $1`,
      [betId],
    );
  }

  private async writeBet(betId: number | null, input: NewBet): Promise<number> {
    let id = betId ?? 0;
    if (betId === null) {
      await this.db.execute(
        `INSERT INTO bets
           (book_id, sport_id, description, bet_type, bet_class, clv,
            stake_cents, odds, status, return_cents, placed_at, settled_at,
            notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          input.bookId,
          input.sportId,
          input.description,
          input.betType,
          input.betClass,
          input.clv,
          input.stakeCents,
          input.odds,
          input.status,
          input.returnCents,
          input.placedAt,
          input.settledAt,
          input.notes,
        ],
      );
      const rows = await this.db.select<{ id: number }>(
        `SELECT last_insert_rowid() AS id`,
      );
      id = rows[0].id;
    } else {
      await this.db.execute(
        `UPDATE bets SET book_id = $1, sport_id = $2, description = $3,
           bet_type = $4, bet_class = $5, clv = $6, stake_cents = $7,
           odds = $8, status = $9, return_cents = $10, placed_at = $11,
           settled_at = $12, notes = $13
         WHERE id = $14`,
        [
          input.bookId,
          input.sportId,
          input.description,
          input.betType,
          input.betClass,
          input.clv,
          input.stakeCents,
          input.odds,
          input.status,
          input.returnCents,
          input.placedAt,
          input.settledAt,
          input.notes,
          id,
        ],
      );
      await this.db.execute(`DELETE FROM bet_legs WHERE bet_id = $1`, [id]);
      await this.db.execute(`DELETE FROM bet_promos WHERE bet_id = $1`, [id]);
    }

    for (let i = 0; i < input.legs.length; i++) {
      const leg = input.legs[i];
      await this.db.execute(
        `INSERT INTO bet_legs (bet_id, selection, market, odds, position)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, leg.selection, leg.market, leg.odds, i],
      );
    }
    for (const p of input.promos) {
      await this.db.execute(
        `INSERT INTO bet_promos (bet_id, promo_id, applied_value_cents)
         VALUES ($1, $2, $3)`,
        [id, p.promoId, p.appliedValueCents],
      );
    }
    return id;
  }

  async createBet(input: NewBet): Promise<number> {
    return this.writeBet(null, input);
  }

  async updateBet(id: number, input: NewBet): Promise<number> {
    return this.writeBet(id, input);
  }

  async deleteBet(id: number): Promise<void> {
    await this.db.execute(`DELETE FROM bet_legs WHERE bet_id = $1`, [id]);
    await this.db.execute(`DELETE FROM bet_promos WHERE bet_id = $1`, [id]);
    await this.db.execute(`DELETE FROM bets WHERE id = $1`, [id]);
  }

  // ------------------------------------------------------------------ promos
  async listPromos(): Promise<Promo[]> {
    return this.db.select<Promo>(`SELECT * FROM promos ORDER BY created_at DESC`);
  }

  async createPromo(input: {
    name: string;
    type: PromoType;
    valueType: PromoValueType;
    value: number;
    minOdds?: number;
    bookId?: number | null;
    sportId?: number | null;
    startsAt?: string | null;
    endsAt?: string | null;
    notes?: string;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO promos (name, type, value_type, value, min_odds, book_id, sport_id, starts_at, ends_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.name,
        input.type,
        input.valueType,
        input.value,
        input.minOdds ?? 0,
        input.bookId ?? null,
        input.sportId ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.notes ?? "",
      ],
    );
  }

  /** Per-promo usage: how many bets used it and the total value delivered. */
  async promoUsage(): Promise<
    { promo_id: number; count: number; total_value_cents: number }[]
  > {
    return this.db.select(
      `SELECT bp.promo_id AS promo_id,
              COUNT(*) AS count,
              COALESCE(SUM(bp.applied_value_cents), 0) AS total_value_cents
       FROM bet_promos bp
       GROUP BY bp.promo_id`,
    );
  }

  async deletePromo(id: number): Promise<void> {
    await this.db.execute(`DELETE FROM bet_promos WHERE promo_id = $1`, [id]);
    await this.db.execute(`DELETE FROM promos WHERE id = $1`, [id]);
  }

  // ------------------------------------------------------------ transactions
  async listTransactions(bookId?: number): Promise<TransactionView[]> {
    const { sql, params } = where([["t.book_id = ?", bookId]]);
    return this.db.select<TransactionView>(
      `SELECT t.*, bk.name AS book_name, bk.currency AS currency
       FROM transactions t
       JOIN books bk ON bk.id = t.book_id
       ${sql}
       ORDER BY COALESCE(t.occurred_at, t.created_at) DESC, t.id DESC`,
      params,
    );
  }

  async createTransaction(input: {
    bookId: number;
    type: TransactionType;
    amountCents: number;
    occurredAt: string | null;
    notes?: string;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO transactions (book_id, type, amount_cents, occurred_at, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.bookId,
        input.type,
        input.amountCents,
        input.occurredAt,
        input.notes ?? "",
      ],
    );
  }

  async deleteTransaction(id: number): Promise<void> {
    await this.db.execute(`DELETE FROM transactions WHERE id = $1`, [id]);
  }

  // ----------------------------------------------------------- bulk helpers
  async allBets(): Promise<BetView[]> {
    return this.db.select<BetView>(
      `${BET_VIEW_SELECT} ORDER BY COALESCE(b.placed_at, b.created_at) DESC`,
    );
  }

  async allTransactions(): Promise<TransactionView[]> {
    return this.listTransactions();
  }

  /** Full JSON export of the local database (fixed table allow-list). */
  async exportAll(): Promise<Record<string, unknown[]>> {
    const tables = [
      "settings",
      "sports",
      "books",
      "events",
      "bets",
      "bet_legs",
      "promos",
      "bet_promos",
      "transactions",
    ];
    const out: Record<string, unknown[]> = {};
    for (const table of tables) {
      out[table] = await this.allRows(table);
    }
    return out;
  }

  async allRows<T>(table: string): Promise<T[]> {
    // Only used by the JSON export with a fixed allow-list of table names.
    const allowed = new Set([
      "sports",
      "books",
      "events",
      "bets",
      "bet_legs",
      "promos",
      "bet_promos",
      "transactions",
      "settings",
    ]);
    if (!allowed.has(table)) throw new Error(`Refusing to export ${table}`);
    return this.db.select<T>(`SELECT * FROM ${table}`);
  }
}

export type { BetRow, BetType, Book, Sport, Promo, Transaction };
