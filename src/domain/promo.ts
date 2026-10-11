import { multiplyCents, type Cents } from "./money";

export type PromoType =
  | "bonus_bet"
  | "free_bet"
  | "odds_boost"
  | "cashback"
  | "deposit_match"
  | "other";

export const PROMO_TYPES: readonly PromoType[] = [
  "bonus_bet",
  "free_bet",
  "odds_boost",
  "cashback",
  "deposit_match",
  "other",
];

export const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  bonus_bet: "Bonus bet",
  free_bet: "Free bet",
  odds_boost: "Odds boost",
  cashback: "Cashback",
  deposit_match: "Deposit match",
  other: "Other",
};

export type PromoValueType = "percent" | "fixed";

export interface PromoDefinition {
  type: PromoType;
  valueType: PromoValueType;
  /** Percent (e.g. 20 = 20%) or fixed cents depending on valueType. */
  value: number;
}

export interface PromoContext {
  stakeCents: Cents;
  decimalOdds: number;
}

/**
 * Suggest the dollar benefit a promo delivers on a single bet.
 *
 * This is deliberately a *suggestion* the user can override — real bookmaker
 * terms vary too much to model exhaustively, and it is better to record the
 * true observed value than to pretend the app knows every T&C.
 */
export function suggestPromoValueCents(
  promo: PromoDefinition,
  ctx: PromoContext,
): Cents {
  const { stakeCents, decimalOdds } = ctx;
  const profitIfWin = multiplyCents(stakeCents, Math.max(0, decimalOdds - 1));

  switch (promo.type) {
    case "bonus_bet":
    case "free_bet":
      // A free stake of equivalent size.
      return promo.valueType === "fixed" ? promo.value : stakeCents;
    case "odds_boost":
      // Extra winnings created by the boost.
      if (promo.valueType === "percent") {
        return multiplyCents(profitIfWin, promo.value / 100);
      }
      return promo.value;
    case "cashback":
      if (promo.valueType === "percent") {
        return multiplyCents(stakeCents, promo.value / 100);
      }
      return promo.value;
    case "deposit_match":
      if (promo.valueType === "percent") {
        return multiplyCents(stakeCents, promo.value / 100);
      }
      return promo.value;
    default:
      return promo.valueType === "fixed" ? promo.value : 0;
  }
}
