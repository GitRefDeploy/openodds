import { multiplyCents, type Cents } from "./money";

/**
 * What an offer *did* to a bet, as opposed to how the bet was funded.
 *
 * There is deliberately no "bonus bet" or "free bet" here. Whether the stake
 * was the punter's own money is a property of the bet itself and lives in
 * `bet_class`; offering it a second time as a promo let the same bonus bet be
 * recorded both ways, excluding its stake from the amount at risk *and*
 * crediting its value again as promo value. A promo describes the extras a
 * bookmaker adds on top of an ordinary stake — a boost, a refund, a match.
 *
 * `profit_boost` is a share of the **profit** a win would make; it never moves
 * the price. A bet genuinely taken at a boosted price is a different question —
 * how the bet was placed — and is the `odds_boost` bet class. Before migration
 * 5 the two names were the other way round, which is exactly what made "30" on
 * a boost readable as a change in the odds.
 */
export type PromoType = "profit_boost" | "cashback" | "deposit_match" | "other";

export const PROMO_TYPES: readonly PromoType[] = [
  "profit_boost",
  "cashback",
  "deposit_match",
  "other",
];

export const PROMO_TYPE_LABELS: Record<PromoType, string> = {
  profit_boost: "Profit boost",
  cashback: "Cashback",
  deposit_match: "Deposit match",
  other: "Other",
};

/**
 * Read a stored type back as one of the types above.
 *
 * A row written before migration 5 still says `odds_boost`, and that name then
 * meant this profit share. Every read goes through here so such a row reads as
 * the offer it describes rather than printing a raw key.
 */
export function normalisePromoType(value: string): PromoType {
  if (value === "odds_boost") return "profit_boost";
  return (PROMO_TYPES as readonly string[]).includes(value)
    ? (value as PromoType)
    : "other";
}

/** Label for a stored type, never the raw key. */
export function promoTypeLabel(value: string): string {
  return PROMO_TYPE_LABELS[normalisePromoType(value)];
}

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
 * What the number in a promo actually means, said out loud.
 *
 * "30" on its own does not say what it is 30 per cent *of*, and the base is
 * not the same for every offer: a profit boost multiplies the **profit** a win
 * would make, while cashback and a deposit match multiply the **stake**. A
 * figure that could be read three different ways is not a figure — so the base
 * is spelled out wherever the number is entered or read back.
 */
export interface PromoValueWording {
  /** Label for the number input. */
  label: string;
  /** One sentence naming exactly what the number is measured against. */
  hint: string;
  /** A typical value, used as the input placeholder. */
  placeholder: string;
  /** Read back after "30%", e.g. "extra profit on a win". */
  percentSuffix: string;
  /** Read back after "$25.00", e.g. "extra profit on a win". */
  fixedSuffix: string;
}

export const PROMO_VALUE_WORDING: Record<PromoType, PromoValueWording> = {
  profit_boost: {
    label: "Extra profit",
    hint: "A share of the profit a win would make — not of the odds. 30 turns $100 of profit into $130; it does not turn odds of 2.00 into 2.60. A price the bookmaker really did move is an Odds Boost, which belongs on the bet itself.",
    placeholder: "30",
    percentSuffix: "extra profit on a win",
    fixedSuffix: "extra profit on a win",
  },
  cashback: {
    label: "Refund",
    hint: "A percentage of the stake. 30 returns $15 of a $50 stake.",
    placeholder: "30",
    percentSuffix: "of stake back",
    fixedSuffix: "back",
  },
  deposit_match: {
    label: "Match",
    hint: "A percentage of the deposit. 100 matches a $50 deposit with another $50.",
    placeholder: "100",
    percentSuffix: "of deposit matched",
    fixedSuffix: "deposit match",
  },
  other: {
    label: "Value",
    hint: "Whatever this offer was worth — record the amount you actually received.",
    placeholder: "0",
    percentSuffix: "",
    fixedSuffix: "value",
  },
};

/**
 * Read a saved promo's number back in words — "30% extra profit on a win".
 *
 * The amount formatter is passed in so the domain stays currency-agnostic while
 * the caller decides how to render dollars. The stored type is taken as a plain
 * string because a row can predate the current vocabulary; an unrecognised one
 * reads as an unelaborated number rather than as a raw key.
 */
export function describePromoValue(
  promo: { type: string; valueType: string; value: number },
  formatAmount: (cents: Cents) => string,
): string {
  const wording = PROMO_VALUE_WORDING[normalisePromoType(promo.type)];
  const suffix =
    promo.valueType === "percent" ? wording.percentSuffix : wording.fixedSuffix;
  const amount =
    promo.valueType === "percent"
      ? `${promo.value}%`
      : formatAmount(promo.value);
  return suffix ? `${amount} ${suffix}` : amount;
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

  switch (normalisePromoType(promo.type)) {
    case "profit_boost":
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
