import { describe, expect, it } from "vitest";
import {
  BET_CLASSES,
  BET_CLASS_LABELS,
  BET_CLASS_TRAITS,
  betClassLabel,
  classesInGroup,
  groupOf,
  isFreeStake,
  normaliseBetClass,
  traitsFor,
} from "./betClass";

describe("bet classes", () => {
  it("labels every class", () => {
    for (const betClass of BET_CLASSES) {
      expect(BET_CLASS_LABELS[betClass]).toBeTruthy();
    }
  });

  it("lists no class twice", () => {
    expect(new Set(BET_CLASSES).size).toBe(BET_CLASSES.length);
  });

  it("defines traits for every class", () => {
    for (const betClass of BET_CLASSES) {
      expect(BET_CLASS_TRAITS[betClass]).toBeDefined();
    }
  });

  // The two money traits are what stop a bonus bet from being counted as cash
  // at risk, so pin them down explicitly.
  it("treats only a bonus bet and site credit as free stakes", () => {
    expect(BET_CLASSES.filter(isFreeStake)).toEqual(["site_credit", "bonus_bet"]);
  });

  it("treats only a bonus bet as never returning the stake", () => {
    const notReturned = BET_CLASSES.filter(
      (betClass) => !BET_CLASS_TRAITS[betClass].stakeReturned,
    );
    expect(notReturned).toEqual(["bonus_bet"]);
  });

  it("falls back to an ordinary paid cash bet when the class is missing", () => {
    expect(traitsFor(undefined)).toEqual({ freeStake: false, stakeReturned: true });
    expect(traitsFor(null)).toEqual({ freeStake: false, stakeReturned: true });
  });

  it("splits the vocabulary into strategies and promos", () => {
    const strategies = classesInGroup("strategy");
    const promos = classesInGroup("promo");
    expect(strategies.length + promos.length).toBe(BET_CLASSES.length);
    expect(strategies).toContain("arbitrage");
    expect(promos).toContain("bonus_bet");
    expect(groupOf("normal")).toBe("strategy");
    expect(groupOf("bonus_bet")).toBe("promo");
  });
});

describe("the boosted-price class after the name swap", () => {
  // `profit_boost` used to be this class's name, while the promo type called
  // `odds_boost` was the one that actually measured profit. Both readings were
  // therefore available for the same word. The names swap in migration 5 so
  // that "Odds Boost" means the price moved and "Profit boost" means it did not.
  it("calls the class that holds a boosted price Odds Boost", () => {
    expect(BET_CLASS_LABELS.odds_boost).toBe("Odds Boost");
    expect(BET_CLASSES as readonly string[]).not.toContain("profit_boost");
  });

  it("keeps a boosted price a paid cash bet whose stake comes back", () => {
    expect(BET_CLASS_TRAITS.odds_boost).toEqual({
      freeStake: false,
      stakeReturned: true,
    });
    expect(groupOf("odds_boost")).toBe("promo");
    expect(classesInGroup("promo")).toContain("odds_boost");
  });

  it("reads a class stored before the swap as an odds boost", () => {
    expect(normaliseBetClass("profit_boost")).toBe("odds_boost");
    expect(betClassLabel("profit_boost")).toBe("Odds Boost");
    // The money rules follow the normalised class, not the raw stored value.
    expect(traitsFor("profit_boost")).toEqual(traitsFor("odds_boost"));
    expect(groupOf("profit_boost")).toBe("promo");
  });

  it("falls back to an ordinary paid bet for a class it does not know", () => {
    expect(normaliseBetClass("mystery_class")).toBe("normal");
    expect(betClassLabel("mystery_class")).toBe("Normal");
    expect(traitsFor("mystery_class")).toEqual({
      freeStake: false,
      stakeReturned: true,
    });
  });

  it("labels every stored class without ever printing the raw key", () => {
    for (const betClass of BET_CLASSES) {
      expect(betClassLabel(betClass)).toBe(BET_CLASS_LABELS[betClass]);
      expect(betClassLabel(betClass)).not.toContain("_");
    }
  });
});
