/**
 * Closing line value: the price you took, against the price the market settled
 * at.
 *
 * This is the one number on the Bets screen that judges a bet on its *price*
 * rather than on whether it happened to win. Taking 2.40 on something that
 * closed at 2.30 is a good bet that can still lose, and a record that only shows
 * profit cannot tell those apart — so CLV is worth showing next to every bet,
 * not buried in a column of raw odds.
 *
 * Measured as a ratio of the taken price to the closing price, which is what
 * makes it comparable across short and long prices: 2.40 against 2.30 and 12.00
 * against 11.50 are the same edge.
 */
export interface ClvEdge {
  /** Ratio: 0.04 means 4% the better side of the close. */
  edge: number;
  beat: boolean;
}

/** Null when either price is missing or not a real price. */
export function clvEdge(
  takenOdds: number,
  closingOdds: number | null | undefined,
): ClvEdge | null {
  if (!Number.isFinite(takenOdds) || !(takenOdds > 1)) return null;
  if (
    closingOdds === null ||
    closingOdds === undefined ||
    !Number.isFinite(closingOdds) ||
    !(closingOdds > 1)
  ) {
    return null;
  }
  const edge = takenOdds / closingOdds - 1;
  return { edge, beat: edge > 0 };
}

/** "+4.3%" ahead of the close, "-4.3%" behind it. */
export function formatClvEdge(edge: number): string {
  const percent = (edge * 100).toFixed(1);
  return edge > 0 ? `+${percent}%` : `${percent}%`;
}

/** Phrased for the row, where the sign alone is not enough to be read at speed. */
export function describeClv(edge: ClvEdge | null): string {
  if (!edge) return "—";
  if (edge.edge === 0) return "Matched the close";
  return `${edge.beat ? "Beat" : "Behind"} the close by ${formatClvEdge(edge.edge)}`;
}
