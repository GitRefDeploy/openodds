import { describe, expect, it } from "vitest";
import {
  cashStakeCents,
  computeProfitCents,
  computeReturnCents,
  isSettled,
  type SettlementInput,
} from "./pnl";

const base = { stakeCents: 10000, decimalOdds: 2.5 } as const;

function settle(overrides: Partial<SettlementInput>): SettlementInput {
  return { ...base, status: "pending", ...overrides };
}

describe("computeReturnCents", () => {
  it("returns stake x odds for a win", () => {
    expect(computeReturnCents(settle({ status: "won" }))).toBe(25000);
  });

  it("returns nothing for a loss", () => {
    expect(computeReturnCents(settle({ status: "lost" }))).toBe(0);
  });

  it("returns the stake for a void bet", () => {
    expect(computeReturnCents(settle({ status: "void" }))).toBe(10000);
  });

  it("splits a half win: half at odds, half returned", () => {
    // 5000 * 2.5 = 12500, plus 5000 returned = 17500
    expect(computeReturnCents(settle({ status: "half_won" }))).toBe(17500);
  });

  it("returns half the stake for a half loss", () => {
    expect(computeReturnCents(settle({ status: "half_lost" }))).toBe(5000);
  });

  it("uses the recorded return for a cashout", () => {
    expect(
      computeReturnCents(settle({ status: "cashout", returnCents: 8000 })),
    ).toBe(8000);
  });

  it("returns nothing while pending", () => {
    expect(computeReturnCents(settle({ status: "pending" }))).toBe(0);
  });
});

describe("computeProfitCents", () => {
  it("computes profit net of stake for a win", () => {
    expect(computeProfitCents(settle({ status: "won" }))).toBe(15000);
  });

  it("loses the whole stake on a loss", () => {
    expect(computeProfitCents(settle({ status: "lost" }))).toBe(-10000);
  });

  it("is exactly zero for a void bet", () => {
    expect(computeProfitCents(settle({ status: "void" }))).toBe(0);
  });

  it("is negative on a cashout below stake", () => {
    expect(
      computeProfitCents(settle({ status: "cashout", returnCents: 4000 })),
    ).toBe(-6000);
  });

  it("excludes pending bets from realised profit", () => {
    expect(computeProfitCents(settle({ status: "pending" }))).toBe(0);
  });

  it("handles half won/lost exactly", () => {
    expect(computeProfitCents(settle({ status: "half_won" }))).toBe(7500);
    expect(computeProfitCents(settle({ status: "half_lost" }))).toBe(-5000);
  });
});

describe("isSettled", () => {
  it("treats only pending as unsettled", () => {
    expect(isSettled("pending")).toBe(false);
    expect(isSettled("won")).toBe(true);
    expect(isSettled("void")).toBe(true);
  });
});

describe("bonus bets, where the stake is never returned", () => {
  // These three come from a real bet log, so they are a regression guard on the
  // whole point of the feature: a $25 bonus bet at 2.40 pays $35, not the $60
  // that $25 of cash would have paid.
  it("reproduces the payouts recorded in a real bet log", () => {
    const payoutAt = (odds: number) =>
      computeReturnCents({
        stakeCents: 2500,
        decimalOdds: odds,
        status: "won",
        stakeReturned: false,
      });

    expect(payoutAt(2.4)).toBe(3500);
    expect(payoutAt(2.45)).toBe(3625);
    expect(payoutAt(2.6)).toBe(4000);
  });

  it("still pays stake x odds for the same bet with cash", () => {
    expect(
      computeReturnCents({ stakeCents: 2500, decimalOdds: 2.4, status: "won" }),
    ).toBe(6000);
  });

  it("costs nothing at all when it loses", () => {
    expect(
      computeProfitCents({
        stakeCents: 2500,
        decimalOdds: 2.4,
        status: "lost",
        stakeReturned: false,
        freeStake: true,
      }),
    ).toBe(0);
  });

  it("credits the full payout as profit, since none of it was the punter's", () => {
    expect(
      computeProfitCents({
        stakeCents: 2500,
        decimalOdds: 2.4,
        status: "won",
        stakeReturned: false,
        freeStake: true,
      }),
    ).toBe(3500);
  });

  it("hands back nothing for a void, because there was never cash to return", () => {
    expect(
      computeReturnCents({
        stakeCents: 2500,
        decimalOdds: 2.4,
        status: "void",
        stakeReturned: false,
      }),
    ).toBe(0);
  });

  it("pays only the winning half of a half win", () => {
    expect(
      computeReturnCents({
        stakeCents: 10000,
        decimalOdds: 2.5,
        status: "half_won",
        stakeReturned: false,
      }),
    ).toBe(7500);
  });

  it("returns nothing for a half loss", () => {
    expect(
      computeReturnCents({
        stakeCents: 10000,
        decimalOdds: 2.5,
        status: "half_lost",
        stakeReturned: false,
      }),
    ).toBe(0);
  });

  it("treats a cashout as real money regardless of what funded the bet", () => {
    expect(
      computeReturnCents({
        stakeCents: 2500,
        decimalOdds: 2.4,
        status: "cashout",
        returnCents: 1800,
        stakeReturned: false,
      }),
    ).toBe(1800);
  });
});

describe("site credit, a free stake that is still returned", () => {
  it("pays like cash while risking none of the punter's money", () => {
    const input = {
      stakeCents: 5000,
      decimalOdds: 2,
      status: "won",
      freeStake: true,
    } as const;
    expect(computeReturnCents(input)).toBe(10000);
    expect(computeProfitCents(input)).toBe(10000);
  });
});

describe("cashStakeCents", () => {
  it("counts a normal stake in full", () => {
    expect(cashStakeCents({ stakeCents: 10000 })).toBe(10000);
  });

  it("excludes a stake that came from a credit", () => {
    expect(cashStakeCents({ stakeCents: 10000, freeStake: true })).toBe(0);
  });
});
