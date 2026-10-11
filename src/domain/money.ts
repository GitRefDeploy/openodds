/**
 * Money is stored as integer minor units (cents) everywhere in the app.
 * Floats are only ever used at the display boundary. This avoids the
 * accumulated rounding drift you get from storing dollars as `number`.
 */
export type Cents = number;

/** Parse a user-entered money string/number into integer cents. */
export function toCents(value: number | string | null | undefined): Cents {
  if (value === null || value === undefined || value === "") return 0;
  const raw =
    typeof value === "string" ? value.replace(/[^0-9.\-]/g, "") : String(value);
  const num = Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/** Cents -> major units. Display only; never do arithmetic on the result. */
export function toMajor(cents: Cents): number {
  return cents / 100;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

/** Multiply cents by a factor, rounding half away from zero. */
export function multiplyCents(cents: Cents, factor: number): Cents {
  const result = cents * factor;
  return Math.sign(result) * Math.round(Math.abs(result));
}

export interface FormatMoneyOptions {
  /** Prefix positive values with "+". Default false. */
  signed?: boolean;
  /** Set false to render a bare number. Default true. */
  showCurrency?: boolean;
}

export function formatMoney(
  cents: Cents,
  currency = "AUD",
  opts: FormatMoneyOptions = {},
): string {
  const formatter = new Intl.NumberFormat("en-AU", {
    style: opts.showCurrency === false ? "decimal" : "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: opts.signed ? "always" : "auto",
  });
  return formatter.format(cents / 100);
}
