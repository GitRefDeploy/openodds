import { describe, expect, it } from "vitest";
import { computeBalanceCents, signedTransactionCents } from "./bankroll";

describe("signedTransactionCents", () => {
  it("adds deposits and promo credit", () => {
    expect(signedTransactionCents({ type: "deposit", amountCents: 5000 })).toBe(5000);
    expect(signedTransactionCents({ type: "promo_credit", amountCents: 500 })).toBe(500);
  });

  it("subtracts withdrawals", () => {
    expect(signedTransactionCents({ type: "withdrawal", amountCents: 5000 })).toBe(-5000);
  });

  it("preserves the sign of adjustments", () => {
    expect(signedTransactionCents({ type: "adjustment", amountCents: -250 })).toBe(-250);
    expect(signedTransactionCents({ type: "adjustment", amountCents: 250 })).toBe(250);
  });
});

describe("computeBalanceCents", () => {
  it("combines cash movements with realised betting profit", () => {
    const balance = computeBalanceCents({
      transactions: [
        { type: "deposit", amountCents: 100000 },
        { type: "withdrawal", amountCents: 20000 },
      ],
      realisedBetProfitCents: 15000,
    });
    expect(balance).toBe(95000);
  });

  it("can go negative when betting losses exceed deposits", () => {
    expect(
      computeBalanceCents({
        transactions: [{ type: "deposit", amountCents: 10000 }],
        realisedBetProfitCents: -25000,
      }),
    ).toBe(-15000);
  });
});
