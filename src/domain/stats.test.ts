import { describe, expect, it } from "vitest";
import { computeStats } from "./stats";

describe("computeStats", () => {
  it("ignores unsettled bets in totals", () => {
    const stats = computeStats([
      { stakeCents: 10000, profitCents: 15000, decimalOdds: 2.5, settled: true },
      { stakeCents: 10000, profitCents: -10000, decimalOdds: 3, settled: true },
      { stakeCents: 5000, profitCents: 0, decimalOdds: 2, settled: false },
    ]);
    expect(stats.count).toBe(3);
    expect(stats.settledCount).toBe(2);
    expect(stats.totalStakedCents).toBe(20000);
    expect(stats.totalProfitCents).toBe(5000);
    expect(stats.roi).toBeCloseTo(0.25, 10);
    expect(stats.strikeRate).toBeCloseTo(0.5, 10);
  });

  it("does not divide by zero", () => {
    const stats = computeStats([]);
    expect(stats.roi).toBe(0);
    expect(stats.strikeRate).toBe(0);
    expect(stats.averageOdds).toBe(0);
  });
});
