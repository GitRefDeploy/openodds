import { arbitragePercent } from "./arb";
import type { Cents } from "./money";
import { cashStakeCents, computeReturnCents } from "./pnl";

/**
 * A position is two or more bets that offset each other — an arbitrage, a
 * middle, a bonus bet hedged against a qualifying bet. One of them wins and the
 * rest lose, so what matters is the worst case across the group, not any
 * individual leg.
 */
export const MIN_POSITION_LEGS = 2;

export interface PositionLegInput {
  stakeCents: Cents;
  odds: number;
  /** From the bet's class: whether a win hands the stake back. */
  stakeReturned: boolean;
  /** From the bet's class: whether the stake was the punter's own money. */
  freeStake: boolean;
}

export interface PositionTotals {
  /** Only the punter's own money. A free leg contributes nothing here. */
  cashStakedCents: Cents;
  /** The worst case across the legs, which is what the position guarantees. */
  guaranteedPayoutCents: Cents;
  /** Margin against the payout, so it compares with the recorded figure. */
  marginPercent: number;
}

/** What a leg pays if it turns out to be the one that wins. */
export function legPayoutCents(leg: PositionLegInput): Cents {
  return computeReturnCents({
    stakeCents: leg.stakeCents,
    decimalOdds: leg.odds,
    status: "won",
    stakeReturned: leg.stakeReturned,
  });
}

export function summarisePosition(
  legs: readonly PositionLegInput[],
): PositionTotals {
  // A lone bet is not a position, and a margin off one leg would be nonsense.
  if (legs.length < MIN_POSITION_LEGS) {
    return { cashStakedCents: 0, guaranteedPayoutCents: 0, marginPercent: 0 };
  }

  const stakes = legs.map((leg) =>
    cashStakeCents({ stakeCents: leg.stakeCents, freeStake: leg.freeStake }),
  );
  const payouts = legs.map(legPayoutCents);

  return {
    cashStakedCents: stakes.reduce((sum, cents) => sum + cents, 0),
    guaranteedPayoutCents: Math.min(...payouts),
    marginPercent: arbitragePercent(stakes, payouts),
  };
}
