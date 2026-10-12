import { describe, expect, it } from "vitest";
import type { BetView } from "@/db/types";
import {
  byBook,
  bySport,
  cumulative,
  enrichAll,
  enrichBet,
  marginByPosition,
  positionsFrom,
  promoSplit,
  statsFor,
} from "./selectors";

/**
 * Everything the screens show is computed here first, so this file is where the
 * money semantics are pinned rather than re-tested per screen. The rules worth
 * protecting are the ones that are easy to get subtly wrong and hard to notice
 * on screen: a bonus bet risks no cash and never gets its stake back, free
 * stakes stay out of the turnover an ROI divides by, and a position guarantees
 * its *worst* leg rather than an average across them.
 *
 * No DOM is needed — these are pure functions over the enriched bet shape.
 */

function betView(overrides: Partial<BetView> = {}): BetView {
  return {
    id: 1,
    book_id: 1,
    sport_id: null,
    event_id: null,
    position_id: null,
    description: "Test bet",
    bet_type: "single",
    bet_class: "normal",
    stake_cents: 5000,
    odds: 2.4,
    clv: null,
    status: "won",
    return_cents: 0,
    placed_at: "2026-03-10",
    settled_at: "2026-03-10",
    notes: "",
    created_at: "2026-03-10",
    book_name: "Sportsbet",
    currency: "AUD",
    sport_name: null,
    sport_slug: null,
    sport_kind: null,
    promo_value_cents: 0,
    import_ref: null,
    ...overrides,
  };
}

/** The unbalanced $170 arb the Bets page and the Stats page both show. */
function arbLegs(positionId = 7): BetView[] {
  return [
    betView({ id: 1, description: "Leg A", stake_cents: 10000, odds: 1.78, position_id: positionId }),
    betView({ id: 2, description: "Leg B", stake_cents: 7000, odds: 2.5, position_id: positionId }),
  ];
}

describe("what a bet is worth", () => {
  it("pays a bonus bet its profit and never the stake it never had", () => {
    const bet = enrichBet(
      betView({ stake_cents: 2500, odds: 2.4, bet_class: "bonus_bet" }),
    );

    // $25 of cash at 2.40 pays $60. A bonus bet pays $35, because the stake
    // was never cash and so cannot come back as cash.
    expect(bet.potentialPayoutCents).toBe(3500);
    expect(bet.profitCents).toBe(3500);
    // Nothing of the punter's was at risk.
    expect(bet.cashStakeCents).toBe(0);
    expect(bet.freeStake).toBe(true);
  });

  it("treats site credit as free money that still hands its stake back", () => {
    const bet = enrichBet(
      betView({ stake_cents: 2500, odds: 2, bet_class: "site_credit" }),
    );

    // Free money, but it behaves like cash on a win: $25 at 2.00 returns $50.
    expect(bet.cashStakeCents).toBe(0);
    expect(bet.profitCents).toBe(5000);
    expect(bet.potentialPayoutCents).toBe(5000);
  });

  it("takes an ordinary bet's profit off the stake it risked", () => {
    const bet = enrichBet(betView({ stake_cents: 5000, odds: 2.4 }));

    // $50 at 2.40 returns $120, so $70 of profit on $50 at risk.
    expect(bet.profitCents).toBe(7000);
    expect(bet.cashStakeCents).toBe(5000);
    // The return the bankroll actually receives, stake included.
    expect(bet.effectiveReturnCents).toBe(12000);
    expect(bet.settled).toBe(true);
  });

  it("gives a pending bet no profit and no return yet", () => {
    const bet = enrichBet(betView({ status: "pending" }));

    expect(bet.settled).toBe(false);
    expect(bet.profitCents).toBe(0);
    // Nothing has come back, so the bankroll must not move.
    expect(bet.effectiveReturnCents).toBe(0);
    // But what it would pay is already known, which is what the row shows.
    expect(bet.potentialPayoutCents).toBe(12000);
  });

  it("counts a bonus bet's loss as costing nothing", () => {
    const bet = enrichBet(
      betView({ stake_cents: 2500, odds: 2.4, bet_class: "bonus_bet", status: "lost" }),
    );

    // Losing a free stake costs no cash.
    expect(bet.profitCents).toBe(0);
    expect(bet.effectiveReturnCents).toBe(0);
  });
});

describe("grouping bets into a position", () => {
  it("guarantees the worst leg rather than an average across them", () => {
    const [position] = positionsFrom(enrichAll(arbLegs()));

    // The legs would pay $178 and $175, so only $175 is guaranteed. Averaging
    // them would report a flattering number no leg actually pays.
    expect(position.guaranteedPayoutCents).toBe(17500);
    expect(position.cashStakedCents).toBe(17000);
    // (1 - 17000/17500) * 100, measured against the payout like a recorded arb.
    expect(position.marginPercent).toBeCloseTo(2.857, 3);
  });

  it("reports realised profit from only the legs that have settled", () => {
    const bets = arbLegs();
    bets[0] = { ...bets[0], status: "won" };
    bets[1] = { ...bets[1], status: "pending" };
    const [position] = positionsFrom(enrichAll(bets));

    // Leg A won 10000 at 1.78 for 7800 of profit; leg B has not run.
    expect(position.realisedProfitCents).toBe(7800);
    // One leg still running, so the position is not settled.
    expect(position.settled).toBe(false);
  });

  it("only calls a position settled once every leg has", () => {
    const bets = arbLegs();
    bets[0] = { ...bets[0], status: "won" };
    bets[1] = { ...bets[1], status: "lost" };
    const [position] = positionsFrom(enrichAll(bets));

    expect(position.settled).toBe(true);
    // 7800 won on leg A against the 7000 lost on leg B.
    expect(position.realisedProfitCents).toBe(800);
  });

  it("ignores bets that are not in a position at all", () => {
    const positions = positionsFrom(
      enrichAll([...arbLegs(), betView({ id: 3, position_id: null })]),
    );

    expect(positions).toHaveLength(1);
    expect(positions[0].legs).toHaveLength(2);
  });

  it("surfaces a position's margin against each of its legs", () => {
    const margins = marginByPosition(enrichAll(arbLegs()));

    // The margin is what a leg is judged on, so it must reach the Bet row.
    expect(margins.get(7)).toBeCloseTo(2.857, 3);
    expect(margins.size).toBe(1);
  });

  it("does not call one grouped bet a position", () => {
    const [position] = positionsFrom(
      enrichAll([betView({ position_id: 7, status: "won" })]),
    );

    // A margin off a single leg would be nonsense, so it reports none.
    expect(position.marginPercent).toBe(0);
    expect(position.guaranteedPayoutCents).toBe(0);
  });
});

describe("the totals a summary strip is built from", () => {
  it("keeps free stakes out of the turnover ROI divides by", () => {
    const stats = statsFor(
      enrichAll([
        betView({ id: 1, stake_cents: 10000, odds: 2 }),
        betView({ id: 2, stake_cents: 2500, odds: 2.4, bet_class: "bonus_bet" }),
      ]),
    );

    // Only the $100 of cash was at risk, even though $125 was staked.
    expect(stats.totalStakedCents).toBe(10000);
    // Both the $100 profit and the $35 the bonus bet earned still count.
    expect(stats.totalProfitCents).toBe(13500);
    expect(stats.roi).toBeCloseTo(1.35, 6);
  });

  it("counts only settled bets in the money and every bet in the count", () => {
    const stats = statsFor(
      enrichAll([
        betView({ id: 1, status: "won", stake_cents: 5000, odds: 2 }),
        betView({ id: 2, status: "pending", stake_cents: 5000, odds: 2 }),
      ]),
    );

    expect(stats.count).toBe(2);
    expect(stats.settledCount).toBe(1);
    expect(stats.totalStakedCents).toBe(5000);
    // The strike rate describes what has actually finished.
    expect(stats.strikeRate).toBe(1);
  });

  it("does not claim a strike rate from bets that have not run", () => {
    const stats = statsFor(
      enrichAll([betView({ status: "pending", stake_cents: 5000 })]),
    );

    expect(stats.strikeRate).toBe(0);
    expect(stats.roi).toBe(0);
    expect(stats.averageOdds).toBe(0);
  });
});

describe("breakdowns", () => {
  it("leaves unsettled bets out of a bookmaker's totals", () => {
    const groups = byBook(
      enrichAll([
        betView({ id: 1, status: "won", stake_cents: 5000, odds: 2 }),
        betView({ id: 2, status: "pending", stake_cents: 9000, odds: 2 }),
      ]),
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
    expect(groups[0].stakedCents).toBe(5000);
    expect(groups[0].profitCents).toBe(5000);
    expect(groups[0].roi).toBeCloseTo(1, 6);
  });

  it("puts the best result first rather than in insertion order", () => {
    const groups = byBook(
      enrichAll([
        betView({ id: 1, book_id: 1, book_name: "TAB", status: "lost" }),
        betView({ id: 2, book_id: 2, book_name: "Sportsbet", status: "won" }),
      ]),
    );

    expect(groups.map((g) => g.label)).toEqual(["Sportsbet", "TAB"]);
  });

  it("names the bets with no sport rather than dropping them", () => {
    const groups = bySport(
      enrichAll([
        betView({ id: 1, sport_slug: "horse_racing", sport_name: "Horse racing" }),
        betView({ id: 2, sport_slug: null, sport_name: null }),
      ]),
    );

    const labels = groups.map((g) => g.label).sort();
    expect(labels).toEqual(["Horse racing", "Unassigned"]);
  });
});

describe("the cumulative curve", () => {
  it("runs the total forward in date order, whatever order it was given", () => {
    const points = cumulative(
      enrichAll([
        betView({ id: 1, placed_at: "2026-03-10", status: "won", stake_cents: 5000, odds: 2.4 }),
        betView({ id: 2, placed_at: "2026-01-05", status: "lost", stake_cents: 5000, odds: 2 }),
      ]),
    );

    expect(points.map((p) => p.date)).toEqual(["2026-01-05", "2026-03-10"]);
    expect(points.map((p) => p.cumulativeCents)).toEqual([-5000, 2000]);
  });

  it("has nothing to draw before a bet settles", () => {
    const points = cumulative(enrichAll([betView({ status: "pending" })]));

    expect(points).toEqual([]);
  });
});

describe("the promo split", () => {
  it("separates what the offers earned from what the punter did", () => {
    const split = promoSplit(
      enrichAll([
        betView({ id: 1, stake_cents: 5000, odds: 2.4, promo_value_cents: 2000 }),
        betView({ id: 2, stake_cents: 5000, odds: 2.4 }),
      ]),
    );

    expect(split.promoValueCents).toBe(2000);
    expect(split.totalProfitCents).toBe(14000);
    // The remainder, so the two halves always add back to the total.
    expect(split.organicProfitCents).toBe(12000);
    expect(split.promoBetCount).toBe(1);
  });

  it("ignores a promo on a bet that has not settled", () => {
    const split = promoSplit(
      enrichAll([betView({ status: "pending", promo_value_cents: 2000 })]),
    );

    expect(split.promoValueCents).toBe(0);
    expect(split.promoBetCount).toBe(0);
  });
});
