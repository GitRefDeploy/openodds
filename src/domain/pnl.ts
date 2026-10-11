import type { Cents } from "./money";

export type BetStatus =
  | "pending"
  | "won"
  | "lost"
  | "void"
  | "cashout"
  | "half_won"
  | "half_lost";

export const BET_STATUSES: readonly BetStatus[] = [
  "pending",
  "won",
  "lost",
  "void",
  "cashout",
  "half_won",
  "half_lost",
];

export const BET_STATUS_LABELS: Record<BetStatus, string> = {
  pending: "Pending",
  won: "Won",
  lost: "Lost",
  void: "Void",
  cashout: "Cashed out",
  half_won: "Half won",
  half_lost: "Half lost",
};

export interface SettlementInput {
  stakeCents: Cents;
  decimalOdds: number;
  status: BetStatus;
  /** Required for cashout: the amount actually returned. */
  returnCents?: Cents;
}

export function isSettled(status: BetStatus): boolean {
  return status !== "pending";
}

/**
 * Gross amount returned to the punter for a settled bet.
 * A pending bet returns nothing *yet* but its profit is excluded from
 * realised totals via `isSettled`.
 */
export function computeReturnCents({
  stakeCents,
  decimalOdds,
  status,
  returnCents,
}: SettlementInput): Cents {
  switch (status) {
    case "won":
      return Math.round(stakeCents * decimalOdds);
    case "half_won":
      // Half the stake lands at full odds, half is returned.
      return Math.round((stakeCents / 2) * decimalOdds) + Math.round(stakeCents / 2);
    case "half_lost":
      // Half the stake is returned, half is lost.
      return Math.round(stakeCents / 2);
    case "void":
      return stakeCents;
    case "cashout":
      return returnCents ?? 0;
    case "lost":
    case "pending":
    default:
      return 0;
  }
}

/** Realised profit in cents. Pending bets contribute 0. */
export function computeProfitCents(input: SettlementInput): Cents {
  if (!isSettled(input.status)) return 0;
  return computeReturnCents(input) - input.stakeCents;
}
