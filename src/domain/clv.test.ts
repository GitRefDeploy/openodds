import { describe, expect, it } from "vitest";
import { clvEdge, describeClv, formatClvEdge } from "./clv";

describe("closing line value", () => {
  it("measures the taken price against the close", () => {
    expect(clvEdge(2.4, 2.3)?.edge).toBeCloseTo(0.043478, 5);
    expect(clvEdge(2.2, 2.3)?.edge).toBeCloseTo(-0.043478, 5);
    expect(clvEdge(2.5, 2.5)?.edge).toBe(0);
  });

  it("treats the same edge on a long price as the same edge", () => {
    // 2.40 v 2.30 and 12.00 v 11.50 are both a 4.3% edge, which is what makes
    // the number comparable across favourites and outsiders.
    expect(clvEdge(2.4, 2.3)?.edge).toBeCloseTo(clvEdge(12, 11.5)!.edge, 5);
  });

  it("knows which side of the close a price was on", () => {
    expect(clvEdge(2.4, 2.3)?.beat).toBe(true);
    expect(clvEdge(2.2, 2.3)?.beat).toBe(false);
    // Landing exactly on the close is not beating it.
    expect(clvEdge(2.5, 2.5)?.beat).toBe(false);
  });

  it("returns nothing rather than a number when a price is missing", () => {
    // No closing price was recorded — that is the common case, and it must not
    // read as either a good or a bad price.
    expect(clvEdge(2.4, null)).toBeNull();
    expect(clvEdge(2.4, undefined)).toBeNull();
    expect(clvEdge(2.4, 0)).toBeNull();
    expect(clvEdge(2.4, 1)).toBeNull();
    expect(clvEdge(2.4, Number.NaN)).toBeNull();
    // A bet with no real price of its own has nothing to compare.
    expect(clvEdge(0, 2.3)).toBeNull();
  });

  it("signs the percentage only when it is an edge", () => {
    expect(formatClvEdge(0.043478)).toBe("+4.3%");
    expect(formatClvEdge(-0.043478)).toBe("-4.3%");
    expect(formatClvEdge(0)).toBe("0.0%");
  });

  it("says which side of the close the bet was taken on", () => {
    expect(describeClv(clvEdge(2.4, 2.3))).toBe("Beat the close by +4.3%");
    expect(describeClv(clvEdge(2.2, 2.3))).toBe("Behind the close by -4.3%");
    expect(describeClv(clvEdge(2.5, 2.5))).toBe("Matched the close");
    expect(describeClv(null)).toBe("—");
  });
});
