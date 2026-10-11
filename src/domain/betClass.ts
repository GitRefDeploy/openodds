/**
 * How a bet was placed, as opposed to `BetType`, which describes its shape
 * (single, multi, same game multi).
 *
 * These are a fixed vocabulary rather than something the user defines, because
 * the point of the field is to be *groupable* — the dashboard and stats pages
 * need every "Arbitrage" row to mean the same thing. Anything that varies per
 * offer (a specific odds boost percentage, a deposit match) belongs on a promo
 * instead.
 */
export type BetClass =
  | "normal"
  | "low_hold"
  | "arbitrage"
  | "middle"
  | "positive_ev"
  | "future"
  | "sharp_money"
  | "no_sweat"
  | "qualifying"
  | "site_credit"
  | "bonus_bet"
  | "profit_boost";

/**
 * Order matters: this is the order the dropdown presents them in, strategies
 * first and promo-funded entries second.
 */
export const BET_CLASSES: readonly BetClass[] = [
  "normal",
  "low_hold",
  "arbitrage",
  "middle",
  "positive_ev",
  "future",
  "no_sweat",
  "qualifying",
  "site_credit",
  "bonus_bet",
  "profit_boost",
  "sharp_money",
];

export const BET_CLASS_LABELS: Record<BetClass, string> = {
  normal: "Normal",
  low_hold: "Low-Hold",
  arbitrage: "Arbitrage",
  middle: "Middle",
  positive_ev: "Positive EV",
  future: "Future",
  sharp_money: "Sharp Money",
  no_sweat: "No Sweat Bet",
  qualifying: "Qualifying Bet",
  site_credit: "Site Credit",
  bonus_bet: "Bonus Bet",
  profit_boost: "Profit Boost",
};

export type BetClassGroup = "strategy" | "promo";

export const BET_CLASS_GROUP_LABELS: Record<BetClassGroup, string> = {
  strategy: "Strategy",
  promo: "Promo",
};

/**
 * What the class implies about the money.
 *
 * These are not cosmetic: they decide how much cash was actually at risk and
 * what a win returns, which is what every profit number in the app is built on.
 */
export interface BetClassTraits {
  /** The stake is not the punter's own money, so none of it is cash at risk. */
  freeStake: boolean;
  /** On a win, part of what comes back is the stake itself. */
  stakeReturned: boolean;
}

const PAID: BetClassTraits = { freeStake: false, stakeReturned: true };

export const BET_CLASS_TRAITS: Record<BetClass, BetClassTraits> = {
  normal: PAID,
  low_hold: PAID,
  arbitrage: PAID,
  middle: PAID,
  positive_ev: PAID,
  future: PAID,
  sharp_money: PAID,

  // A no sweat bet is staked with real money; the safety net is a bonus bet
  // returned on a loss, which is not cash, so the loss still costs the stake.
  no_sweat: PAID,
  // A qualifying bet is ordinary cash used to unlock an offer.
  qualifying: PAID,
  // Site credit is free money, but it behaves like cash: win and the stake
  // comes back with the winnings.
  site_credit: { freeStake: true, stakeReturned: true },
  // A bonus bet is free money and the stake is *not* returned: a $25 bonus bet
  // at 2.40 pays $35, where $25 of real money would pay $60. This is the
  // behaviour the whole feature exists for.
  bonus_bet: { freeStake: true, stakeReturned: false },
  // A profit boost is a cash bet at improved odds, so it is recorded as paid
  // and the boosted price belongs in its odds.
  profit_boost: PAID,
};

export function traitsFor(betClass: BetClass | null | undefined): BetClassTraits {
  if (!betClass) return PAID;
  return BET_CLASS_TRAITS[betClass] ?? PAID;
}

export function isFreeStake(betClass: BetClass | null | undefined): boolean {
  return traitsFor(betClass).freeStake;
}

export function groupOf(betClass: BetClass): BetClassGroup {
  return betClass === "no_sweat" ||
    betClass === "qualifying" ||
    betClass === "site_credit" ||
    betClass === "bonus_bet" ||
    betClass === "profit_boost"
    ? "promo"
    : "strategy";
}

export function classesInGroup(group: BetClassGroup): BetClass[] {
  return BET_CLASSES.filter((c) => groupOf(c) === group);
}
