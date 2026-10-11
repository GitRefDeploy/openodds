import { describe, expect, it } from "vitest";
import { MIN_POSITION_LEGS, summarisePosition, type PositionLegInput } from "./position";

const cash = (stakeCents: number, odds: number): PositionLegInput => ({
  stakeCents,
  odds,
  stakeReturned: true,
  freeStake: false,
});

const bonus = (stakeCents: number, odds: number): PositionLegInput => ({
  stakeCents,
  odds,
  stakeReturned: false,
  freeStake: true,
});

describe("summarisePosition", () => {
  it("reproduces the margin on a real two-leg arbitrage", () => {
    // $69.62 at 1.61 and $40.66 at 2.75, each returning about $111.81.
    const totals = summarisePosition([cash(6962, 1.61), cash(4066, 2.75)]);
    expect(totals.cashStakedCents).toBe(11028);
    expect(totals.guaranteedPayoutCents).toBe(11182);
    expect(totals.marginPercent).toBeCloseTo(1.37, 1);
  });

  it("keeps a free leg out of the money that is at risk", () => {
    // $50 of real money at 1.90 against a $50 bonus bet at 2.00. Only the $50
    // of cash was ever at risk, and the bonus leg pays $50 of profit.
    const totals = summarisePosition([cash(5000, 1.9), bonus(5000, 2)]);
    expect(totals.cashStakedCents).toBe(5000);
    expect(totals.guaranteedPayoutCents).toBe(5000);
  });

  it("reports the guaranteed amount as the worst leg, not the best", () => {
    const totals = summarisePosition([cash(10000, 1.78), cash(7000, 2.5)]);
    // 100 * 1.78 = 178 and 70 * 2.50 = 175, so 175 is what is guaranteed.
    expect(totals.guaranteedPayoutCents).toBe(17500);
    expect(totals.marginPercent).toBeCloseTo(2.857, 2);
  });

  it("goes negative when the legs cannot cover what was staked", () => {
    const totals = summarisePosition([cash(10000, 1.5), cash(10000, 1.5)]);
    expect(totals.marginPercent).toBeCloseTo(-33.33, 1);
  });

  it("treats a single leg as no position at all", () => {
    expect(summarisePosition([cash(10000, 2)]).marginPercent).toBe(0);
    expect(summarisePosition([]).marginPercent).toBe(0);
    expect(MIN_POSITION_LEGS).toBe(2);
  });

  it("ignores a leg with no price rather than inventing a payout", () => {
    const totals = summarisePosition([cash(10000, 0), cash(5000, 2)]);
    expect(totals.guaranteedPayoutCents).toBe(0);
    expect(totals.marginPercent).toBe(0);
  });
});
