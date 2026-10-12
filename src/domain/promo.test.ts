import { describe, expect, it } from "vitest";
import {
  PROMO_TYPES,
  PROMO_TYPE_LABELS,
  PROMO_VALUE_WORDING,
  describePromoValue,
  normalisePromoType,
  promoTypeLabel,
  suggestPromoValueCents,
  type PromoType,
} from "./promo";

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const ctx = { stakeCents: 10000, decimalOdds: 3 };

describe("suggestPromoValueCents", () => {
  it("values a profit boost by extra winnings", () => {
    // profit if win = 10000 * (3-1) = 20000; 20% boost = 4000
    expect(
      suggestPromoValueCents(
        { type: "profit_boost", valueType: "percent", value: 20 },
        ctx,
      ),
    ).toBe(4000);
  });

  it("values a row stored before the swap the same way", () => {
    // A row written before migration 5 still carries the old name at runtime
    // even though the type says otherwise, so the maths has to survive it.
    const legacy: PromoType = "odds_boost" as PromoType;
    expect(
      suggestPromoValueCents(
        { type: legacy, valueType: "percent", value: 20 },
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

describe("promo vocabulary", () => {
  // A free stake is owned by `bet_class`. Offering it here as well is exactly
  // how one bonus bet came to be counted twice: the stake was excluded from the
  // amount at risk and its value credited again as promo value.
  it("offers no type for something the bet class already owns", () => {
    const types = PROMO_TYPES as readonly string[];
    expect(types).not.toContain("bonus_bet");
    expect(types).not.toContain("free_bet");
  });

  it("labels every offered type", () => {
    for (const type of PROMO_TYPES) {
      expect(PROMO_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("lists no type twice", () => {
    expect(new Set(PROMO_TYPES).size).toBe(PROMO_TYPES.length);
  });
});

describe("promo value wording", () => {
  it("spells out what the number means for every type", () => {
    for (const type of PROMO_TYPES) {
      const wording = PROMO_VALUE_WORDING[type];
      expect(wording).toBeDefined();
      expect(wording.label).toBeTruthy();
      expect(wording.placeholder).toBeTruthy();
      // The hint has to explain the basis rather than repeat the label, or
      // "30" could still be 30% of anything.
      expect(wording.hint.length).toBeGreaterThan(20);
    }
  });

  it("names the base each percentage is taken from", () => {
    expect(PROMO_VALUE_WORDING.profit_boost.hint).toContain("profit");
    expect(PROMO_VALUE_WORDING.cashback.hint).toContain("stake");
    expect(PROMO_VALUE_WORDING.deposit_match.hint).toContain("deposit");
  });

  it("reads a profit boost as extra profit, never as a change to the odds", () => {
    const read = describePromoValue(
      { type: "profit_boost", valueType: "percent", value: 30 },
      dollars,
    );
    expect(read).toBe("30% extra profit on a win");
    // The single most likely misreading, called out and ruled out explicitly.
    expect(PROMO_VALUE_WORDING.profit_boost.hint).toContain("not of the odds");
  });

  it("reads cashback as a share of the stake", () => {
    expect(
      describePromoValue(
        { type: "cashback", valueType: "percent", value: 30 },
        dollars,
      ),
    ).toBe("30% of stake back");
  });

  it("reads a fixed amount as money, not as a percentage", () => {
    expect(
      describePromoValue(
        { type: "cashback", valueType: "fixed", value: 2500 },
        dollars,
      ),
    ).toBe("$25.00 back");
  });

  it("leaves an unknown type readable rather than blank", () => {
    expect(
      describePromoValue(
        { type: "other", valueType: "percent", value: 10 },
        dollars,
      ),
    ).toBe("10%");
  });
});

describe("the promo vocabulary after the name swap", () => {
  // "Odds boost" named this type while it measured profit, which is how "30"
  // came to be read as a change in the odds. The name now belongs to the bet
  // class that really is about the price, and the promo says Profit boost.
  it("no longer calls the profit share an odds boost", () => {
    expect(PROMO_TYPES).toContain("profit_boost");
    expect(PROMO_TYPES as readonly string[]).not.toContain("odds_boost");
    expect(PROMO_TYPE_LABELS.profit_boost).toBe("Profit boost");
  });

  it("reads a row written before the swap as a profit boost", () => {
    expect(normalisePromoType("odds_boost")).toBe("profit_boost");
    expect(promoTypeLabel("odds_boost")).toBe("Profit boost");
  });

  it("still spells out a legacy row's number in words", () => {
    expect(
      describePromoValue(
        { type: "odds_boost", valueType: "percent", value: 30 },
        dollars,
      ),
    ).toBe("30% extra profit on a win");
  });

  it("falls back to an unelaborated offer for a type it does not know", () => {
    expect(normalisePromoType("mystery_offer")).toBe("other");
    expect(promoTypeLabel("mystery_offer")).toBe("Other");
  });

  it("passes every current type through unchanged", () => {
    for (const type of PROMO_TYPES) {
      expect(normalisePromoType(type)).toBe(type);
      expect(promoTypeLabel(type)).toBe(PROMO_TYPE_LABELS[type]);
    }
  });
});
