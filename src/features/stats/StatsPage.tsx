import { useMemo, useState } from "react";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChip,
  PageHeader,
  SummaryCell,
  SummaryStrip,
} from "@/components/ui/primitives";
import { betClassLabel, normaliseBetClass } from "@/domain/betClass";
import { formatMoney, formatSignedMoney } from "@/domain/money";
import { formatOdds } from "@/domain/odds";
import { BET_STATUS_LABELS, type BetStatus } from "@/domain/pnl";
import {
  enrichAll,
  positionsFrom,
  type EnrichedBet,
  type PositionSummary,
} from "@/features/analytics/selectors";
import { cn } from "@/lib/utils";

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

type PositionFilter = "all" | "running" | "settled";

/**
 * A position is named after its legs when they agree, which covers arbitrage
 * and middles. A hedge pairing a bonus bet with a qualifying bet has no single
 * name, so it says so rather than picking one arbitrarily.
 */
function positionLabel(legs: readonly EnrichedBet[]): string {
  // Normalised, so a single legacy spelling among the legs still counts as the
  // legs agreeing rather than as a mixed position.
  const classes = new Set(legs.map((leg) => normaliseBetClass(leg.bet_class)));
  return classes.size === 1 ? betClassLabel(legs[0].bet_class) : "Mixed legs";
}

/**
 * The bets that offset each other, which is the one view where the question is
 * not "did it win" but "what does this guarantee".
 *
 * So the running positions come first — they are the ones still holding money —
 * and within them the best guaranteed margin leads. Each leg's payout is marked
 * where it is the worst case, because that single leg is what the position's
 * guarantee actually rests on and it is otherwise invisible.
 */
export function StatsPage({
  onNavigate,
}: {
  onNavigate?: (route: "bets") => void;
}) {
  const { bets, currency, oddsFormat, repo, refresh } = useAppData();
  const [filter, setFilter] = useState<PositionFilter>("all");

  const positions = useMemo(() => positionsFrom(enrichAll(bets)), [bets]);

  const running = positions.filter((position) => !position.settled);
  const shown = useMemo(() => {
    const chosen =
      filter === "running"
        ? running
        : filter === "settled"
          ? positions.filter((position) => position.settled)
          : positions;
    // Money still at risk first, then the widest guarantee.
    return [...chosen].sort(
      (a, b) =>
        Number(a.settled) - Number(b.settled) ||
        b.marginPercent - a.marginPercent,
    );
  }, [positions, running, filter]);

  const cashStakedCents = positions.reduce(
    (sum, p) => sum + p.cashStakedCents,
    0,
  );
  const guaranteedPayoutCents = positions.reduce(
    (sum, p) => sum + p.guaranteedPayoutCents,
    0,
  );
  const lockedCents = guaranteedPayoutCents - cashStakedCents;

  const money = (cents: number) => formatMoney(cents, currency);
  const signed = (cents: number) => formatSignedMoney(cents, currency);

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
          action={
            onNavigate ? (
              <Button variant="default" onClick={() => onNavigate("bets")}>
                Go to Bets
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <SummaryStrip className="mb-3 grid-cols-2 lg:grid-cols-4">
            <SummaryCell
              label="Positions"
              value={String(positions.length)}
              sub={`${running.length} still running`}
            />
            <SummaryCell
              label="Cash staked"
              value={money(cashStakedCents)}
              sub="Free stakes excluded"
            />
            <SummaryCell
              label="Guaranteed return"
              value={money(guaranteedPayoutCents)}
              sub="Worst case across legs"
            />
            <SummaryCell
              label="Locked margin"
              value={signed(lockedCents)}
              tone={lockedCents >= 0 ? "positive" : "negative"}
              sub="If every position settles as planned"
            />
          </SummaryStrip>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                active={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All {positions.length}
              </FilterChip>
              <FilterChip
                active={filter === "running"}
                onClick={() => setFilter("running")}
              >
                Running {running.length}
              </FilterChip>
              <FilterChip
                active={filter === "settled"}
                onClick={() => setFilter("settled")}
              >
                Settled {positions.length - running.length}
              </FilterChip>
            </div>
            <span className="text-xs text-faint">
              Running first, then the widest guarantee
            </span>
          </div>

          {shown.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                No {filter} positions.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {shown.map((position) => (
                <PositionCard
                  key={position.id}
                  position={position}
                  currency={currency}
                  oddsFormat={oddsFormat}
                  onUngroup={async () => {
                    if (!confirm("Break up this position? The bets stay.")) return;
                    await repo.clearPosition(position.id);
                    await refresh();
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function PositionCard({
  position,
  currency,
  oddsFormat,
  onUngroup,
}: {
  position: PositionSummary;
  currency: string;
  oddsFormat: "decimal" | "fractional" | "american";
  onUngroup: () => void | Promise<void>;
}) {
  const money = (cents: number) => formatMoney(cents, currency);
  const signed = (cents: number) => formatSignedMoney(cents, currency);
  const marginTone = position.marginPercent >= 0 ? "positive" : "negative";

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "h-5 w-0.5 shrink-0 rounded-full",
              position.settled ? "bg-line" : "bg-info",
            )}
          />
          <span className="font-medium text-ink">
            {position.legs.length}-leg {positionLabel(position.legs)}
          </span>
          <Badge tone={marginTone}>
            {position.marginPercent.toFixed(2)}% margin
          </Badge>
          <Badge tone={position.settled ? "neutral" : "info"}>
            {position.settled ? "Settled" : "Running"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-muted">
            Staked{" "}
            <span className="text-ink tabular-nums">
              {money(position.cashStakedCents)}
            </span>
          </span>
          <span className="text-muted">
            Guaranteed{" "}
            <span className="text-ink tabular-nums">
              {money(position.guaranteedPayoutCents)}
            </span>
          </span>
          <span
            className={cn(
              "font-medium tabular-nums",
              position.realisedProfitCents >= 0
                ? "text-positive"
                : "text-negative",
            )}
          >
            Realised {signed(position.realisedProfitCents)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="opacity-60 transition-opacity hover:opacity-100"
            onClick={onUngroup}
          >
            Ungroup
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-faint">
              <th className="px-4 py-1.5 font-medium">Bet</th>
              <th className="py-1.5 pr-3 font-medium">Book</th>
              <th className="py-1.5 pr-3 text-right font-medium">Odds</th>
              <th className="py-1.5 pr-3 text-right font-medium">Stake</th>
              <th className="py-1.5 pr-3 text-right font-medium">
                Pays if it wins
              </th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="px-4 py-1.5 text-right font-medium">Profit</th>
            </tr>
          </thead>
          <tbody>
            {position.legs.map((leg) => {
              // The leg the guarantee rests on: the one that pays least.
              const worstCase =
                leg.potentialPayoutCents === position.guaranteedPayoutCents;
              return (
                <tr key={leg.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-1.5 text-ink">
                    {leg.description || "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-muted">{leg.book_name}</td>
                  <td className="py-1.5 pr-3 text-right text-ink">
                    {formatOdds(leg.odds, oddsFormat)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-ink">
                    {money(leg.stake_cents)}
                    {leg.freeStake ? (
                      <span className="ml-1 text-promo">free</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <span
                      className={cn(
                        worstCase ? "font-medium text-ink" : "text-muted",
                      )}
                    >
                      {money(leg.potentialPayoutCents)}
                    </span>
                    {worstCase && !position.settled ? (
                      <span className="ml-1.5 text-[11px] text-faint">
                        worst case
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge tone={STATUS_TONE[leg.status]}>
                      {BET_STATUS_LABELS[leg.status]}
                    </Badge>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-1.5 text-right",
                      leg.settled
                        ? leg.profitCents >= 0
                          ? "text-positive"
                          : "text-negative"
                        : "text-faint",
                    )}
                  >
                    {leg.settled ? signed(leg.profitCents) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
