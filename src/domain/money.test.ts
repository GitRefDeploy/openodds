import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatSignedMoney,
  multiplyCents,
  sumCents,
  toCents,
  toMajor,
} from "./money";

describe("toCents", () => {
  it("parses decimal strings without float drift", () => {
    expect(toCents("10.10")).toBe(1010);
    expect(toCents("0.01")).toBe(1);
    expect(toCents("1,234.56")).toBe(123456);
    expect(toCents("$5.00")).toBe(500);
  });

  it("rounds to the nearest cent", () => {
    expect(toCents(0.005)).toBe(1);
    expect(toCents(2.344)).toBe(234);
  });

  it("treats empty and invalid input as zero", () => {
    expect(toCents("")).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("abc")).toBe(0);
  });
});

describe("toMajor", () => {
  it("converts cents back to major units", () => {
    expect(toMajor(1010)).toBeCloseTo(10.1, 10);
  });
});

describe("sumCents / multiplyCents", () => {
  it("sums integers exactly", () => {
    expect(sumCents([1010, 990, 1])).toBe(2001);
  });

  it("multiplies and rounds half away from zero", () => {
    expect(multiplyCents(10000, 0.25)).toBe(2500);
    expect(multiplyCents(-10000, 0.333)).toBe(-3330);
  });
});

describe("formatMoney", () => {
  it("formats AUD currency", () => {
    expect(formatMoney(123456, "AUD")).toContain("1,234.56");
  });

  it("can render a signed bare number", () => {
    const out = formatMoney(500, "AUD", { signed: true, showCurrency: false });
    expect(out).toBe("+5.00");
  });
});

describe("formatSignedMoney", () => {
  it("never signs a zero", () => {
    // "+$0.00" reads as a small win. A break-even book, or a position whose
    // legs have not settled, is not a win.
    expect(formatSignedMoney(0, "AUD")).toBe(formatMoney(0, "AUD"));
    expect(formatSignedMoney(0, "AUD")).not.toContain("+");
  });

  it("still signs a real gain or loss", () => {
    expect(formatSignedMoney(7000, "AUD")).toContain("+$70.00");
    expect(formatSignedMoney(-800, "AUD")).toContain("-$8.00");
  });
});
