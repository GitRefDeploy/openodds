import type { Cents } from "./money";

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "adjustment"
  | "promo_credit";

export const TRANSACTION_TYPES: readonly TransactionType[] = [
  "deposit",
  "withdrawal",
  "adjustment",
  "promo_credit",
];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  adjustment: "Adjustment",
  promo_credit: "Promo credit",
};

export interface CashTransaction {
  type: TransactionType;
  /** Always stored positive; direction is derived from `type`. */
  amountCents: Cents;
}

/** Convert a cash transaction into its signed contribution to the balance. */
export function signedTransactionCents(tx: CashTransaction): Cents {
  switch (tx.type) {
    case "deposit":
    case "promo_credit":
      return Math.abs(tx.amountCents);
    case "withdrawal":
      return -Math.abs(tx.amountCents);
    case "adjustment":
      // Adjustments may be entered as a signed correction.
      return tx.amountCents;
  }
}

/**
 * Account balance = cash in/out + realised betting profit.
 *
 * We deliberately do NOT store bet stakes/returns as cash transactions: they
 * are derived from the bets table. That keeps a single source of truth and
 * prevents double counting.
 */
export function computeBalanceCents(params: {
  transactions: readonly CashTransaction[];
  realisedBetProfitCents: Cents;
}): Cents {
  const cash = params.transactions.reduce(
    (acc, tx) => acc + signedTransactionCents(tx),
    0,
  );
  return cash + params.realisedBetProfitCents;
}
