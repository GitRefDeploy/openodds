import { describe, expect, it } from "vitest";
import { arbitragePercent } from "./arb";

describe("arbitragePercent", () => {
  it("matches the percentage recorded on a real two-leg arb", () => {
    // $69.62 at 1.61 and $40.66 at 2.75, each returning about $111.81.
    expect(arbitragePercent([6962, 4066], [11209, 11181])).toBeCloseTo(1.37, 2);
  });

  it("is zero when the legs merely break even", () => {
    expect(arbitragePercent([10000, 10000], [20000, 20000])).toBe(0);
  });

  it("is negative when the bookmaker's margin is against you", () => {
    // $200 staked for a guaranteed $190 back is a losing position.
    expect(arbitragePercent([10000, 10000], [19000, 19000])).toBeCloseTo(-5.263, 3);
  });

  it("uses the worst leg when the returns are unbalanced", () => {
    // $170 staked for a guaranteed $175 is 2.86%, even though the other leg
    // would have paid $178. The good leg is not the one you get to keep.
    expect(arbitragePercent([10000, 7000], [17800, 17500])).toBeCloseTo(2.857, 3);
  });

  it("ignores an empty group or a group with no stake", () => {
    expect(arbitragePercent([], [])).toBe(0);
    expect(arbitragePercent([0, 0], [100, 100])).toBe(0);
  });

  it("ignores a group whose payout is zero", () => {
    expect(arbitragePercent([5000], [0])).toBe(0);
  });
});
