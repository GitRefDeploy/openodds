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
  description: string;
  bet_type: BetType;
  stake_cents: number;
  odds: number;
  status: BetStatus;
  return_cents: number;
  placed_at: string | null;
  settled_at: string | null;
  notes: string;
  created_at: string;
}

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

export interface NewBet {
  bookId: number;
  sportId: number | null;
  description: string;
  betType: BetType;
  stakeCents: number;
  odds: number;
  status: BetStatus;
  returnCents: number;
  placedAt: string | null;
  settledAt: string | null;
  notes: string;
  legs: NewLeg[];
  promos: { promoId: number; appliedValueCents: number }[];
}
