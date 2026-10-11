export type OddsFormat = "decimal" | "fractional" | "american";

/** Implied probability of a decimal price (0..1). */
export function impliedProbability(decimalOdds: number): number {
  if (!(decimalOdds > 1)) return 0;
  return 1 / decimalOdds;
}

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Best rational approximation of (decimal-1) with denominator <= max. */
export function decimalToFractional(
  decimalOdds: number,
  maxDenominator = 100,
): string {
  const target = decimalOdds - 1;
  if (target < 0) return "0/1";
  if (target === 0) return "0/1";

  let bestN = 0;
  let bestD = 1;
  let bestErr = Infinity;
  for (let d = 1; d <= maxDenominator; d++) {
    const n = Math.round(target * d);
    const err = Math.abs(target - n / d);
    if (err < bestErr - 1e-12) {
      bestErr = err;
      bestN = n;
      bestD = d;
    }
  }
  const g = gcd(bestN, bestD) || 1;
  return `${bestN / g}/${bestD / g}`;
}

export function decimalToAmerican(decimalOdds: number): number {
  if (decimalOdds >= 2) return Math.round((decimalOdds - 1) * 100);
  return Math.round(-100 / (decimalOdds - 1));
}

export function formatOdds(
  decimalOdds: number,
  format: OddsFormat = "decimal",
): string {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return "-";
  switch (format) {
    case "fractional":
      return decimalToFractional(decimalOdds);
    case "american": {
      const a = decimalToAmerican(decimalOdds);
      return a > 0 ? `+${a}` : `${a}`;
    }
    default:
      return decimalOdds.toFixed(2);
  }
}

/** Parse a price entered in any supported format into a decimal price. */
export function parseOdds(input: string, format: OddsFormat = "decimal"): number {
  const s = input.trim();
  if (!s) return NaN;

  // Fractional "5/2" is unambiguous regardless of selected format.
  if (s.includes("/")) {
    const [n, d] = s.split("/").map((x) => Number(x.trim()));
    if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) return n / d + 1;
    return NaN;
  }

  if (s.startsWith("+") || s.startsWith("-")) {
    const a = Number(s);
    if (!Number.isFinite(a)) return NaN;
    return a > 0 ? a / 100 + 1 : 100 / -a + 1;
  }

  const num = Number(s);
  if (!Number.isFinite(num)) return NaN;
  if (format === "american") {
    return num > 0 ? num / 100 + 1 : 100 / -num + 1;
  }
  return num;
}

/** Combined decimal price of a multi/parlay: product of leg prices. */
export function combineLegOdds(legOdds: readonly number[]): number {
  return legOdds.reduce((acc, o) => acc * o, 1);
}
