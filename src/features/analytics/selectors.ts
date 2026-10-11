import type { BetView } from "@/db/types";
import { computeProfitCents, isSettled, type BetStatus } from "@/domain/pnl";
import { computeStats, type BetStats } from "@/domain/stats";

export interface EnrichedBet extends BetView {
  profitCents: number;
  settled: boolean;
  effectiveReturnCents: number;
}

export function enrichBet(bet: BetView): EnrichedBet {
  const profitCents = computeProfitCents({
    stakeCents: bet.stake_cents,
    decimalOdds: bet.odds,
    status: bet.status as BetStatus,
    returnCents: bet.return_cents,
  });
  const settled = isSettled(bet.status as BetStatus);
  return {
    ...bet,
    profitCents,
    settled,
    effectiveReturnCents: profitCents + (settled ? bet.stake_cents : 0),
  };
}

export function enrichAll(bets: readonly BetView[]): EnrichedBet[] {
  return bets.map(enrichBet);
}

export function statsFor(bets: readonly EnrichedBet[]): BetStats {
  return computeStats(
    bets.map((b) => ({
      stakeCents: b.stake_cents,
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
    existing.stakedCents += bet.stake_cents;
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
