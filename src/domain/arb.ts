import type { Cents } from "./money";

/**
 * The margin on a completed arbitrage, expressed as a percentage.
 *
 * Worked from the figures on a real two-leg arb: $69.62 and $40.66 staked,
 * both legs returning about $111.81. The stakes are 98.63% of what the bet
 * pays out, so the margin is the remaining 1.37%.
 *
 * Note this measures the margin against the *payout*, not against the amount
 * staked. Those differ, and the payout is the one that reproduces the figure
 * recorded in a real bet log.
 *
 * The worst leg sets the result. Only one leg of an arb wins, so the return is
 * whatever that leg pays, and the guaranteed amount is the smallest payout on
 * offer. Averaging the legs would flatter an unbalanced arb — a leg paying $178
 * does nothing for you if the one that actually wins pays $175.
 */
export function arbitragePercent(
  stakeCents: readonly Cents[],
  payoutCents: readonly Cents[],
): number {
  const staked = stakeCents.reduce((sum, cents) => sum + cents, 0);
  if (staked <= 0 || payoutCents.length === 0) return 0;

  const guaranteed = Math.min(...payoutCents);
  if (guaranteed <= 0) return 0;

  return (1 - staked / guaranteed) * 100;
}
