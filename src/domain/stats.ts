import type { Cents } from "./money";

export interface StatBet {
  stakeCents: Cents;
  profitCents: Cents;
  decimalOdds: number;
  settled: boolean;
}

export interface BetStats {
  count: number;
  settledCount: number;
  totalStakedCents: Cents;
  totalProfitCents: Cents;
  /** Return on investment as a ratio (0.12 = +12%). */
  roi: number;
  /** Fraction of settled bets that returned a profit. */
  strikeRate: number;
  averageOdds: number;
  averageStakeCents: Cents;
}

export function computeStats(bets: readonly StatBet[]): BetStats {
  const settled = bets.filter((b) => b.settled);
  const totalStakedCents = settled.reduce((a, b) => a + b.stakeCents, 0);
  const totalProfitCents = settled.reduce((a, b) => a + b.profitCents, 0);
  const winners = settled.filter((b) => b.profitCents > 0).length;

  return {
    count: bets.length,
    settledCount: settled.length,
    totalStakedCents,
    totalProfitCents,
    roi: totalStakedCents === 0 ? 0 : totalProfitCents / totalStakedCents,
    strikeRate: settled.length === 0 ? 0 : winners / settled.length,
    averageOdds:
      settled.length === 0
        ? 0
        : settled.reduce((a, b) => a + b.decimalOdds, 0) / settled.length,
    averageStakeCents:
      settled.length === 0 ? 0 : Math.round(totalStakedCents / settled.length),
  };
}
