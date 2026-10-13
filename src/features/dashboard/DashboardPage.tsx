import { useMemo } from "react";
import { useAppData } from "@/app/DataProvider";
import { CategoryBarChart, TimeSeriesChart } from "@/components/ui/charts";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  Stat,
} from "@/components/ui/primitives";
import { formatMoney, formatSignedMoney } from "@/domain/money";
import {
  byBook,
  bySport,
  cumulative,
  enrichAll,
  promoSplit,
  statsFor,
  type GroupTotal,
} from "@/features/analytics/selectors";
import {
  ONBOARDING_DISMISSED_KEY,
  checklistProgress,
  isChecklistHidden,
  type OnboardingTarget,
} from "./onboarding";

type DashboardTarget = OnboardingTarget | "import";

/**
 * The dashboard, which has to make sense before there is anything in it.
 *
 * A fresh install used to show one line of grey text, which reads as broken
 * rather than empty. So the layout is the same whether or not there is data:
 * the tiles show what they would show, the figures that genuinely are zero show
 * zero, and the two figures that have no meaning yet — ROI and strike rate —
 * show a dash rather than a confident 0.0%, because a rate with no bets behind
 * it is undefined, not excellent.
 *
 * What fills the space instead is the checklist, and it is built from real
 * state: no bookmaker is a missing step however the user feels about it. It
 * carries no sample or demo rows — invented numbers on a P/L screen are worse
 * than an empty one.
 */
export function DashboardPage({
  onNavigate,
}: {
  onNavigate?: (route: DashboardTarget) => void;
}) {
  const { bets, books, promos, transactions, settings, currency, saveSetting } =
    useAppData();

  const enriched = useMemo(() => enrichAll(bets), [bets]);
  const stats = useMemo(() => statsFor(enriched), [enriched]);
  const curve = useMemo(() => cumulative(enriched), [enriched]);
  const sports = useMemo(() => bySport(enriched), [enriched]);
  const bookTotals = useMemo(() => byBook(enriched), [enriched]);
  const promo = useMemo(() => promoSplit(enriched), [enriched]);

  const checklist = useMemo(
    () =>
      checklistProgress({
        bookCount: books.length,
        betCount: bets.length,
        depositCount: transactions.filter((tx) => tx.type === "deposit").length,
        promoCount: promos.length,
      }),
    [books.length, bets.length, transactions, promos.length],
  );

  const money = (cents: number) => formatMoney(cents, currency);
  // A zero profit is not "+$0.00": the sign belongs on a gain or a loss, and
  // the empty dashboard is exactly where there are no gains yet.
  const signed = (cents: number) => formatSignedMoney(cents, currency);

  const hasSettled = stats.settledCount > 0;
  const pending = stats.count - stats.settledCount;
  // Nothing to plan once every step is done, hidden or not.
  const showChecklist = !isChecklistHidden(settings) && checklist.remaining > 0;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          stats.count === 0
            ? "Profit and loss, promos and bankroll at a glance. Nothing is recorded yet, so everything here reads zero."
            : "Profit and loss, promos and bankroll at a glance."
        }
      />

      {showChecklist ? (
        <ChecklistCard
          progress={checklist}
          onNavigate={onNavigate}
          onDismiss={() => void saveSetting(ONBOARDING_DISMISSED_KEY, "true")}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Net profit"
          value={signed(stats.totalProfitCents)}
          tone={
            hasSettled
              ? stats.totalProfitCents >= 0
                ? "positive"
                : "negative"
              : "neutral"
          }
          sub={
            hasSettled
              ? `${stats.settledCount} settled bet${stats.settledCount === 1 ? "" : "s"}`
              : "Nothing settled yet"
          }
        />
        <Stat
          label="Turnover"
          value={money(stats.totalStakedCents)}
          sub={
            hasSettled
              ? `Avg stake ${money(stats.averageStakeCents)}`
              : "Cash at risk so far"
          }
        />
        <Stat
          label="ROI"
          value={hasSettled ? `${(stats.roi * 100).toFixed(1)}%` : "—"}
          tone={
            hasSettled ? (stats.roi >= 0 ? "positive" : "negative") : "neutral"
          }
          sub={hasSettled ? "On cash staked" : "Needs a settled bet"}
        />
        <Stat
          label="Strike rate"
          value={hasSettled ? `${(stats.strikeRate * 100).toFixed(1)}%` : "—"}
          sub={
            hasSettled && stats.averageOdds > 0
              ? `Avg odds ${stats.averageOdds.toFixed(2)}`
              : "Needs a settled bet"
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Stat
          label="From promos"
          value={money(promo.promoValueCents)}
          tone={promo.promoValueCents > 0 ? "positive" : "neutral"}
          sub={
            promo.promoBetCount > 0
              ? `${promo.promoBetCount} bet${promo.promoBetCount === 1 ? "" : "s"} with a promo`
              : "No promo value banked yet"
          }
        />
        <Stat
          label="Organic profit"
          value={signed(promo.organicProfitCents)}
          tone={
            hasSettled
              ? promo.organicProfitCents >= 0
                ? "positive"
                : "negative"
              : "neutral"
          }
          sub="Excludes promo value"
        />
        <Stat
          label="Pending"
          value={String(pending)}
          tone={pending > 0 ? "neutral" : "neutral"}
          sub={pending === 1 ? "1 unsettled bet" : `${pending} unsettled bets`}
        />
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Cumulative profit
        </h2>
        {curve.length === 0 ? (
          <ChartPlaceholder
            message="Your running profit is drawn here from the moment your first bet settles."
            action={
              onNavigate
                ? {
                    label: "Review your bets",
                    onClick: () => onNavigate("bets"),
                  }
                : undefined
            }
          />
        ) : (
          <TimeSeriesChart
            points={curve.map((p) => ({
              date: p.date,
              cents: p.cumulativeCents,
            }))}
            color="var(--positive)"
            gradientId="plFill"
            seriesLabel="Profit"
            height={260}
            fillOpacity={0.5}
            format={money}
          />
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownChart
          title="Profit by sport"
          emptyMessage="Enable the sports you bet on, then this splits your profit by code."
          groups={sports}
          currency={currency}
        />
        <BreakdownChart
          title="Profit by bookmaker"
          emptyMessage="Each bookmaker you record gets its own total, so you can see where you actually win."
          groups={bookTotals}
          currency={currency}
        />
      </div>
    </>
  );
}

/**
 * The four things that have to exist before the app has anything to say.
 * Derived from real state, so a step cannot be ticked while its thing is
 * missing, and nothing here is invented.
 */
function ChecklistCard({
  progress,
  onNavigate,
  onDismiss,
}: {
  progress: ReturnType<typeof checklistProgress>;
  onNavigate?: (route: DashboardTarget) => void;
  onDismiss: () => void;
}) {
  const percent = Math.round((progress.completed / progress.total) * 100);

  return (
    <Card className="mb-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Get set up</h2>
          <p className="mt-0.5 text-xs text-muted">
            {progress.completed} of {progress.total} done.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={progress.remaining === 0 ? "positive" : "info"}>
            {progress.remaining === 0
              ? "All done"
              : `${progress.remaining} to go`}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Hide
          </Button>
        </div>
      </div>

      <div
        className="mb-4 h-1 overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuenow={progress.completed}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-label="Setup progress"
      >
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="space-y-3">
        {progress.steps.map((step) => (
          <li key={step.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={
                step.done
                  ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink"
                  : "mt-0.5 size-5 shrink-0 rounded-full border border-line"
              }
            >
              {step.done ? "✓" : ""}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={
                  step.done
                    ? "text-sm text-muted line-through"
                    : "text-sm font-medium text-ink"
                }
              >
                {step.title}
              </p>
              {step.done ? null : (
                <p className="mt-0.5 text-xs text-muted">{step.description}</p>
              )}
            </div>
            {step.done ? (
              <span className="text-xs text-faint">Done</span>
            ) : onNavigate ? (
              <Button size="sm" onClick={() => onNavigate(step.route)}>
                {step.action}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {onNavigate ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-muted">
            Already have a history with a bookmaker?
          </span>
          <Button size="sm" variant="ghost" onClick={() => onNavigate("import")}>
            Import a statement
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * An empty chart that still looks like a chart's home: it says what will appear
 * there and gives the one action that would produce it.
 */
function ChartPlaceholder({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-raised/40 px-6 py-6 text-center">
      <p className="max-w-md text-xs text-muted">{message}</p>
      {action ? (
        <Button size="sm" variant="ghost" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A total per category, in a card with its own empty state. The bars themselves
 * are `CategoryBarChart`, with the axes every other chart shares; this supplies
 * the heading, and what to say when there is nothing to draw yet.
 */
function BreakdownChart({
  title,
  groups,
  emptyMessage,
  currency,
}: {
  title: string;
  groups: GroupTotal[];
  emptyMessage: string;
  currency: string;
}) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {groups.length === 0 ? (
        <ChartPlaceholder message={emptyMessage} />
      ) : (
        <CategoryBarChart
          rows={groups.map((group) => ({
            key: group.key,
            label: group.label,
            cents: group.profitCents,
          }))}
          seriesLabel="Profit"
          format={(cents) => formatSignedMoney(cents, currency)}
        />
      )}
    </Card>
  );
}
