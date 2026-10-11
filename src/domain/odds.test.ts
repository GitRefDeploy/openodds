import { describe, expect, it } from "vitest";
import {
  combineLegOdds,
  decimalToAmerican,
  decimalToFractional,
  formatOdds,
  impliedProbability,
  parseOdds,
} from "./odds";

describe("decimalToFractional", () => {
  it("maps common prices to fractions", () => {
    expect(decimalToFractional(2)).toBe("1/1");
    expect(decimalToFractional(1.5)).toBe("1/2");
    expect(decimalToFractional(1.25)).toBe("1/4");
    expect(decimalToFractional(3.5)).toBe("5/2");
    expect(decimalToFractional(6)).toBe("5/1");
  });
});

describe("decimalToAmerican", () => {
  it("produces plus prices for underdogs", () => {
    expect(decimalToAmerican(2)).toBe(100);
    expect(decimalToAmerican(3)).toBe(200);
  });

  it("produces minus prices for favourites", () => {
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(decimalToAmerican(1.25)).toBe(-400);
  });
});

describe("formatOdds", () => {
  it("formats by requested convention", () => {
    expect(formatOdds(2.5, "decimal")).toBe("2.50");
    expect(formatOdds(2.5, "fractional")).toBe("3/2");
    expect(formatOdds(2.5, "american")).toBe("+150");
    expect(formatOdds(1.5, "american")).toBe("-200");
  });

  it("renders a dash for invalid prices", () => {
    expect(formatOdds(1, "decimal")).toBe("-");
    expect(formatOdds(NaN, "decimal")).toBe("-");
  });
});

describe("parseOdds", () => {
  it("parses decimal", () => {
    expect(parseOdds("2.50")).toBeCloseTo(2.5, 10);
  });

  it("parses fractional regardless of format", () => {
    expect(parseOdds("5/2")).toBeCloseTo(3.5, 10);
  });

  it("parses american", () => {
    expect(parseOdds("+150")).toBeCloseTo(2.5, 10);
    expect(parseOdds("-200")).toBeCloseTo(1.5, 10);
  });

  it("returns NaN for junk", () => {
    expect(Number.isNaN(parseOdds(""))).toBe(true);
    expect(Number.isNaN(parseOdds("n/a"))).toBe(true);
  });
});

describe("impliedProbability", () => {
  it("inverts the decimal price", () => {
    expect(impliedProbability(2)).toBeCloseTo(0.5, 10);
    expect(impliedProbability(4)).toBeCloseTo(0.25, 10);
    expect(impliedProbability(1)).toBe(0);
  });
});

describe("combineLegOdds", () => {
  it("multiplies leg prices", () => {
    expect(combineLegOdds([2, 1.5, 3])).toBeCloseTo(9, 10);
  });
});
