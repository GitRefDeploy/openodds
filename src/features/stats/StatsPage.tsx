import { useMemo } from "react";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui/primitives";
import { BET_CLASS_LABELS } from "@/domain/betClass";
import { formatMoney } from "@/domain/money";
import { formatOdds } from "@/domain/odds";
import { BET_STATUS_LABELS, type BetStatus } from "@/domain/pnl";
import {
  enrichAll,
  positionsFrom,
  type EnrichedBet,
} from "@/features/analytics/selectors";

const STATUS_TONE: Record<
  BetStatus,
  "neutral" | "positive" | "negative" | "warning" | "info"
> = {
  pending: "info",
  won: "positive",
  lost: "negative",
  void: "neutral",
  cashout: "warning",
  half_won: "positive",
  half_lost: "negative",
};

/**
 * A position is named after its legs when they agree, which covers arbitrage
 * and middles. A hedge pairing a bonus bet with a qualifying bet has no single
 * name, so it says so rather than picking one arbitrarily.
 */
function positionLabel(legs: readonly EnrichedBet[]): string {
  const classes = new Set(legs.map((leg) => leg.bet_class));
  return classes.size === 1 ? BET_CLASS_LABELS[legs[0].bet_class] : "Mixed legs";
}

export function StatsPage() {
  const { bets, currency, oddsFormat, repo, refresh } = useAppData();

  const positions = useMemo(() => positionsFrom(enrichAll(bets)), [bets]);

  const cashStakedCents = positions.reduce(
    (sum, p) => sum + p.cashStakedCents,
    0,
  );
  const guaranteedPayoutCents = positions.reduce(
    (sum, p) => sum + p.guaranteedPayoutCents,
    0,
  );
  const stillRunning = positions.filter((p) => !p.settled).length;
  const lockedCents = guaranteedPayoutCents - cashStakedCents;

  return (
    <>
      <PageHeader
        title="Stats"
        description="Bets that offset each other, and the margin they guarantee."
      />

      {positions.length === 0 ? (
        <EmptyState
          title="No positions yet"
          description="Select two or more bets on the Bets page and group them as a position. That is how an arbitrage, a middle or a hedge is recorded, and it is what lets the app show a combined margin instead of two unrelated bets."
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Positions"
              value={String(positions.length)}
              sub={`${stillRunning} still running`}
            />
            <Stat
              label="Cash staked"
              value={formatMoney(cashStakedCents, currency)}
              sub="Free stakes excluded"
            />
            <Stat
              label="Guaranteed return"
              value={formatMoney(guaranteedPayoutCents, currency)}
              sub="Worst case across legs"
            />
            <Stat
              label="Locked margin"
              value={formatMoney(lockedCents, currency, { signed: true })}
              tone={lockedCents >= 0 ? "positive" : "negative"}
              sub="If every position settles as planned"
            />
          </div>

          <div className="space-y-3">
            {positions.map((position) => (
              <Card key={position.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-100">
                      {position.legs.length}-leg{" "}
                      {positionLabel(position.legs)}
                    </span>
                    <Badge tone={position.marginPercent >= 0 ? "info" : "negative"}>
                      {position.marginPercent.toFixed(2)}%
                    </Badge>
                    {position.settled && <Badge tone="neutral">Settled</Badge>}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-400">
                      Staked{" "}
                      <span className="text-slate-200">
                        {formatMoney(position.cashStakedCents, currency)}
                      </span>
                    </span>
                    <span className="text-slate-400">
                      Guaranteed{" "}
                      <span className="text-slate-200">
                        {formatMoney(position.guaranteedPayoutCents, currency)}
                      </span>
                    </span>
                    <span
                      className={
                        position.realisedProfitCents >= 0
                          ? "font-medium text-emerald-400"
                          : "font-medium text-rose-400"
                      }
                    >
                      Realised{" "}
                      {formatMoney(position.realisedProfitCents, currency, {
                        signed: true,
                      })}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Break up this position? The bets stay."))
                          return;
                        await repo.clearPosition(position.id);
                        await refresh();
                      }}
                    >
                      Ungroup
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-left text-slate-400">
                        <th className="py-1.5 pr-3 font-medium">Bet</th>
                        <th className="py-1.5 pr-3 font-medium">Book</th>
                        <th className="py-1.5 pr-3 font-medium">Odds</th>
                        <th className="py-1.5 pr-3 font-medium">Stake</th>
                        <th className="py-1.5 pr-3 font-medium">Pays if it wins</th>
                        <th className="py-1.5 pr-3 font-medium">Status</th>
                        <th className="py-1.5 font-medium">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {position.legs.map((leg) => (
                        <tr key={leg.id} className="border-b border-slate-800/60">
                          <td className="py-1.5 pr-3 text-slate-200">
                            {leg.description || "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-400">
                            {leg.book_name}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-300 tabular-nums">
                            {formatOdds(leg.odds, oddsFormat)}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-300 tabular-nums">
                            {formatMoney(leg.stake_cents, currency)}
                            {leg.freeStake && (
                              <span className="ml-1 text-violet-300">free</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-300 tabular-nums">
                            {formatMoney(leg.potentialPayoutCents, currency)}
                          </td>
                          <td className="py-1.5 pr-3">
                            <Badge tone={STATUS_TONE[leg.status]}>
                              {BET_STATUS_LABELS[leg.status]}
                            </Badge>
                          </td>
                          <td className="py-1.5 tabular-nums">
                            {leg.settled ? (
                              <span
                                className={
                                  leg.profitCents >= 0
                                    ? "text-emerald-400"
                                    : "text-rose-400"
                                }
                              >
                                {formatMoney(leg.profitCents, currency, {
                                  signed: true,
                                })}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
