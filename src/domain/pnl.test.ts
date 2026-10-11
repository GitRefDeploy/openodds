import { describe, expect, it } from "vitest";
import {
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
