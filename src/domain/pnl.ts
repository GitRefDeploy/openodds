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
  /**
   * Whether winning hands the stake back along with the profit.
   *
   * False for bonus bets: a $25 bonus bet at 2.40 pays $35, where $25 of real
   * money would pay $60. The stake never existed as cash, so it cannot come
   * back as cash.
   */
  stakeReturned?: boolean;
  /**
   * The stake came from a credit rather than the punter's own money. It is
   * therefore excluded from cash at risk, though it can still be returned.
   */
  freeStake?: boolean;
}

export function isSettled(status: BetStatus): boolean {
  return status !== "pending";
}

/**
 * Gross amount returned to the punter for a settled bet.
 * A pending bet returns nothing *yet* but its profit is excluded from
 * realised totals via `isSettled`.
 */
/**
 * The stake that is the punter's own cash.
 *
 * This is the amount an ROI figure should divide by. A bonus bet risks
 * nothing, so it must not inflate the denominator.
 */
export function cashStakeCents({
  stakeCents,
  freeStake,
}: {
  stakeCents: Cents;
  freeStake?: boolean;
}): Cents {
  return freeStake ? 0 : stakeCents;
}

export function computeReturnCents({
  stakeCents,
  decimalOdds,
  status,
  returnCents,
  stakeReturned = true,
}: SettlementInput): Cents {
  // A win pays either stake x odds, or just the profit when the stake is never
  // handed back. Every other case below builds on this distinction.
  const winReturn = (stake: number): Cents =>
    stakeReturned
      ? Math.round(stake * decimalOdds)
      : Math.round(stake * (decimalOdds - 1));

  switch (status) {
    case "won":
      return winReturn(stakeCents);
    case "half_won":
      // Half the stake lands at full odds, half is void. When the stake is
      // never returned there is no cash to give back for the void half, so only
      // the winning half pays.
      return stakeReturned
        ? Math.round((stakeCents / 2) * decimalOdds) + Math.round(stakeCents / 2)
        : winReturn(stakeCents / 2);
    case "half_lost":
      // Half the stake is returned, half is lost. A free stake that is never
      // returned has nothing to give back.
      return stakeReturned ? Math.round(stakeCents / 2) : 0;
    case "void":
      // Same reasoning: a voided bonus bet returns the bonus, not cash.
      return stakeReturned ? stakeCents : 0;
    case "cashout":
      // A cashout is real money whatever funded the bet.
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
  return computeReturnCents(input) - cashStakeCents(input);
}
