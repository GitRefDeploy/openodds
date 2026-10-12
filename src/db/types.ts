import type { BetClass } from "@/domain/betClass";
import type { BetStatus } from "@/domain/pnl";
import type { PromoType, PromoValueType } from "@/domain/promo";
import type { TransactionType } from "@/domain/bankroll";
import type { SportKind } from "@/domain/taxonomy";

export type BookKind = "bookmaker" | "exchange";

export interface Book {
  id: number;
  name: string;
  kind: BookKind;
  currency: string;
  commission_rate: number;
  color: string;
  archived: number;
  created_at: string;
}

export interface Sport {
  id: number;
  slug: string;
  name: string;
  kind: SportKind;
  enabled: number;
  sort_order: number;
}

export interface BetRow {
  id: number;
  book_id: number;
  sport_id: number | null;
  event_id: number | null;
  /**
   * Shared with the other legs of the same position, or null. Not a foreign
   * key: there is no positions table, the group *is* the bets holding the key.
   */
  position_id: number | null;
  description: string;
  bet_type: BetType;
  bet_class: BetClass;
  stake_cents: number;
  odds: number;
  /** Closing price at the off, or null when it was never recorded. */
  clv: number | null;
  status: BetStatus;
  return_cents: number;
  placed_at: string | null;
  settled_at: string | null;
  notes: string;
  created_at: string;
  /**
   * Fingerprint of the statement row this bet came from, or null for a bet
   * entered by hand. Unique when set, which is what makes re-importing a
   * statement a no-op instead of a doubling.
   */
  import_ref: string | null;
}

/**
 * The shape of a bet, shown as "Format" in the UI.
 *
 * Deliberately not called a type in user-facing text any more, because
 * `BetClass` now owns the "Bet type" label.
 */
export type BetType = "single" | "multi" | "same_game_multi";

export const BET_TYPES: readonly BetType[] = ["single", "multi", "same_game_multi"];

export const BET_TYPE_LABELS: Record<BetType, string> = {
  single: "Single",
  multi: "Multi",
  same_game_multi: "Same game multi",
};

/** A bet joined with its book/sport labels and aggregated promo value. */
export interface BetView extends BetRow {
  book_name: string;
  currency: string;
  sport_name: string | null;
  sport_slug: string | null;
  sport_kind: SportKind | null;
  promo_value_cents: number;
}

export interface BetLeg {
  id: number;
  bet_id: number;
  selection: string;
  market: string;
  odds: number;
  position: number;
}

export interface Promo {
  id: number;
  name: string;
  type: PromoType;
  value_type: PromoValueType;
  value: number;
  min_odds: number;
  book_id: number | null;
  sport_id: number | null;
  starts_at: string | null;
  ends_at: string | null;
  notes: string;
  created_at: string;
}

export interface Transaction {
  id: number;
  book_id: number;
  type: TransactionType;
  amount_cents: number;
  occurred_at: string | null;
  notes: string;
  created_at: string;
}

export interface TransactionView extends Transaction {
  book_name: string;
  currency: string;
}

export interface NewLeg {
  selection: string;
  market: string;
  odds: number;
}

/**
 * A price for one selection, as it was seen at one moment.
 *
 * `observed_at` is when the price was true and `recorded_at` is when this app
 * wrote it down. They differ for a fetched price (the provider saw it first) and
 * are the same for one typed in by hand. Keeping them apart is what lets a
 * later revision ask "what was the price at the off" without changing the shape
 * of what is stored.
 */
export interface MarketQuote {
  id: number;
  bet_id: number | null;
  source: string;
  external_event_id: string | null;
  sport_key: string | null;
  event_name: string | null;
  market_key: string;
  selection: string;
  price: number;
  book_key: string | null;
  book_name: string | null;
  observed_at: string;
  recorded_at: string;
}

/** Everything a quote needs except the id and when we wrote it. */
export type NewMarketQuote = Omit<MarketQuote, "id" | "recorded_at">;

/** One call to a data provider, so the free allowance is accounted for. */
export interface OddsApiCall {
  id: number;
  source: string;
  endpoint: string;
  credits_used: number;
  credits_remaining: number | null;
  called_at: string;
}

export interface NewBet {
  bookId: number;
  sportId: number | null;
  description: string;
  betType: BetType;
  betClass: BetClass;
  stakeCents: number;
  odds: number;
  clv: number | null;
  status: BetStatus;
  returnCents: number;
  placedAt: string | null;
  settledAt: string | null;
  notes: string;
  legs: NewLeg[];
  promos: { promoId: number; appliedValueCents: number }[];
}
