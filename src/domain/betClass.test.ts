import { describe, expect, it } from "vitest";
import {
  BET_CLASSES,
  BET_CLASS_LABELS,
  BET_CLASS_TRAITS,
  classesInGroup,
  groupOf,
  isFreeStake,
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
