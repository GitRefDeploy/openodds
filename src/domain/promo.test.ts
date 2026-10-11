import { describe, expect, it } from "vitest";
import { suggestPromoValueCents } from "./promo";

const ctx = { stakeCents: 10000, decimalOdds: 3 };

describe("suggestPromoValueCents", () => {
  it("values a bonus bet at the equivalent free stake", () => {
    expect(
      suggestPromoValueCents(
        { type: "bonus_bet", valueType: "percent", value: 100 },
        ctx,
      ),
    ).toBe(10000);
  });

  it("values an odds boost by extra winnings", () => {
    // profit if win = 10000 * (3-1) = 20000; 20% boost = 4000
    expect(
      suggestPromoValueCents(
        { type: "odds_boost", valueType: "percent", value: 20 },
        ctx,
      ),
    ).toBe(4000);
  });

  it("values cashback as a percent of stake", () => {
    expect(
      suggestPromoValueCents(
        { type: "cashback", valueType: "percent", value: 50 },
        ctx,
      ),
    ).toBe(5000);
  });

  it("honours fixed values", () => {
    expect(
      suggestPromoValueCents(
        { type: "cashback", valueType: "fixed", value: 2500 },
        ctx,
      ),
    ).toBe(2500);
  });
});
