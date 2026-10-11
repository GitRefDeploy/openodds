import type { BetView } from "@/db/types";
import { traitsFor } from "@/domain/betClass";
import {
  cashStakeCents,
  computeProfitCents,
  isSettled,
  type BetStatus,
} from "@/domain/pnl";
import { legPayoutCents, summarisePosition } from "@/domain/position";
import { computeStats, type BetStats } from "@/domain/stats";

export interface EnrichedBet extends BetView {
  profitCents: number;
  settled: boolean;
  effectiveReturnCents: number;
  /** The part of the stake that was the punter's own cash. */
  cashStakeCents: number;
  /** True when the stake came from a credit, so nothing of theirs was risked. */
  freeStake: boolean;
  /** What this bet pays if it is the one that wins. */
  potentialPayoutCents: number;
}

export function enrichBet(bet: BetView): EnrichedBet {
  const traits = traitsFor(bet.bet_class);
  const settlement = {
    stakeCents: bet.stake_cents,
    decimalOdds: bet.odds,
    status: bet.status as BetStatus,
    returnCents: bet.return_cents,
    stakeReturned: traits.stakeReturned,
    freeStake: traits.freeStake,
  };
  const profitCents = computeProfitCents(settlement);
  const settled = isSettled(bet.status as BetStatus);
  const cashStake = cashStakeCents(settlement);
  return {
    ...bet,
    profitCents,
    settled,
    cashStakeCents: cashStake,
    freeStake: traits.freeStake,
    potentialPayoutCents: legPayoutCents({
      stakeCents: bet.stake_cents,
      odds: bet.odds,
      stakeReturned: traits.stakeReturned,
      freeStake: traits.freeStake,
    }),
    // What actually came back: the profit, plus whatever cash stake was
    // returned alongside it. A bonus bet has no cash stake to add back.
    effectiveReturnCents: profitCents + (settled ? cashStake : 0),
  };
}

export interface PositionSummary {
  id: number;
  legs: EnrichedBet[];
  cashStakedCents: number;
  guaranteedPayoutCents: number;
  marginPercent: number;
  /** Profit already banked from the legs that have settled. */
  realisedProfitCents: number;
  settled: boolean;
}

/** Group the bets that share a position key into one summary each. */
export function positionsFrom(
  bets: readonly EnrichedBet[],
): PositionSummary[] {
  const groups = new Map<number, EnrichedBet[]>();
  for (const bet of bets) {
    if (bet.position_id === null || bet.position_id === undefined) continue;
    const legs = groups.get(bet.position_id) ?? [];
    legs.push(bet);
    groups.set(bet.position_id, legs);
  }

  return [...groups.entries()]
    .map(([id, legs]) => {
      const totals = summarisePosition(
        legs.map((leg) => {
          const traits = traitsFor(leg.bet_class);
          return {
            stakeCents: leg.stake_cents,
            odds: leg.odds,
            stakeReturned: traits.stakeReturned,
            freeStake: traits.freeStake,
          };
        }),
      );
      return {
        id,
        legs,
        ...totals,
        realisedProfitCents: legs.reduce(
          (sum, leg) => sum + (leg.settled ? leg.profitCents : 0),
          0,
        ),
        settled: legs.every((leg) => leg.settled),
      };
    })
    .sort((a, b) => b.id - a.id);
}

export function enrichAll(bets: readonly BetView[]): EnrichedBet[] {
  return bets.map(enrichBet);
}

/** Margin for each position key, for showing against an individual bet. */
export function marginByPosition(
  bets: readonly EnrichedBet[],
): Map<number, number> {
  return new Map(
    positionsFrom(bets).map((position) => [position.id, position.marginPercent]),
  );
}

export function statsFor(bets: readonly EnrichedBet[]): BetStats {
  return computeStats(
    bets.map((b) => ({
      stakeCents: b.cashStakeCents,
      profitCents: b.profitCents,
      decimalOdds: b.odds,
      settled: b.settled,
    })),
  );
}

export interface GroupTotal {
  key: string;
  label: string;
  color?: string;
  stakedCents: number;
  profitCents: number;
  count: number;
  roi: number;
}

function groupBy(
  bets: readonly EnrichedBet[],
  keyOf: (b: EnrichedBet) => { key: string; label: string; color?: string },
): GroupTotal[] {
  const map = new Map<string, GroupTotal>();
  for (const bet of bets) {
    if (!bet.settled) continue;
    const { key, label, color } = keyOf(bet);
    const existing = map.get(key) ?? {
      key,
      label,
      color,
      stakedCents: 0,
      profitCents: 0,
      count: 0,
      roi: 0,
    };
    // Cash only. Counting a bonus bet's notional stake here would inflate the
    // amount at risk and flatter every ROI figure built on it.
    existing.stakedCents += bet.cashStakeCents;
    existing.profitCents += bet.profitCents;
    existing.count += 1;
    map.set(key, existing);
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.roi = g.stakedCents === 0 ? 0 : g.profitCents / g.stakedCents;
  }
  return groups.sort((a, b) => b.profitCents - a.profitCents);
}

export function bySport(bets: readonly EnrichedBet[]): GroupTotal[] {
  return groupBy(bets, (b) => ({
    key: b.sport_slug ?? "unassigned",
    label: b.sport_name ?? "Unassigned",
  }));
}

export function byBook(bets: readonly EnrichedBet[]): GroupTotal[] {
  return groupBy(bets, (b) => ({ key: String(b.book_id), label: b.book_name }));
}

export function byMonth(bets: readonly EnrichedBet[]): GroupTotal[] {
  return groupBy(bets, (b) => {
    const iso = b.placed_at ?? b.created_at;
    const month = iso.slice(0, 7);
    return { key: month, label: month };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

export interface CumulativePoint {
  date: string;
  profitCents: number;
  cumulativeCents: number;
}

export function cumulative(bets: readonly EnrichedBet[]): CumulativePoint[] {
  const settled = bets
    .filter((b) => b.settled)
    .map((b) => ({
      date: (b.placed_at ?? b.created_at).slice(0, 10),
      profitCents: b.profitCents,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let running = 0;
  return settled.map((point) => {
    running += point.profitCents;
    return { ...point, cumulativeCents: running };
  });
}

export interface PromoSplit {
  promoValueCents: number;
  organicProfitCents: number;
  totalProfitCents: number;
  promoBetCount: number;
}

/** Split realised profit into promo-derived and organic. */
export function promoSplit(bets: readonly EnrichedBet[]): PromoSplit {
  let promoValueCents = 0;
  let totalProfitCents = 0;
  let promoBetCount = 0;
  for (const bet of bets) {
    if (!bet.settled) continue;
    totalProfitCents += bet.profitCents;
    if (bet.promo_value_cents > 0) {
      promoValueCents += bet.promo_value_cents;
      promoBetCount += 1;
    }
  }
  return {
    promoValueCents,
    organicProfitCents: totalProfitCents - promoValueCents,
    totalProfitCents,
    promoBetCount,
  };
}
