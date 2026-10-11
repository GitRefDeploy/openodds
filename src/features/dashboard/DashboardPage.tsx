import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppData } from "@/app/DataProvider";
import { Card, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { formatMoney, toMajor } from "@/domain/money";
import {
  byBook,
  bySport,
  cumulative,
  enrichAll,
  promoSplit,
  statsFor,
  type GroupTotal,
} from "@/features/analytics/selectors";

export function DashboardPage() {
  const { bets, currency } = useAppData();

  const enriched = useMemo(() => enrichAll(bets), [bets]);
  const stats = useMemo(() => statsFor(enriched), [enriched]);
  const curve = useMemo(() => cumulative(enriched), [enriched]);
  const sports = useMemo(() => bySport(enriched), [enriched]);
  const books = useMemo(() => byBook(enriched), [enriched]);
  const promo = useMemo(() => promoSplit(enriched), [enriched]);

  const money = (cents: number) => formatMoney(cents, currency);
  const signed = (cents: number) =>
    formatMoney(cents, currency, { signed: true });

  if (stats.settledCount === 0 && stats.count === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Profit and loss, promos and bankroll at a glance."
        />
        <EmptyState
          title="No bets recorded yet"
          description="Add your first bet from the Bets page and this dashboard will fill in automatically."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Profit and loss, promos and bankroll at a glance."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Net profit"
          value={signed(stats.totalProfitCents)}
          tone={stats.totalProfitCents >= 0 ? "positive" : "negative"}
          sub={`${stats.settledCount} settled bets`}
        />
        <Stat
          label="Turnover"
          value={money(stats.totalStakedCents)}
          sub={`Avg stake ${money(stats.averageStakeCents)}`}
        />
        <Stat
          label="ROI"
          value={`${(stats.roi * 100).toFixed(1)}%`}
          tone={stats.roi >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="Strike rate"
          value={`${(stats.strikeRate * 100).toFixed(1)}%`}
          sub={`Avg odds ${stats.averageOdds.toFixed(2)}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Stat
          label="From promos"
          value={money(promo.promoValueCents)}
          tone="positive"
          sub={`${promo.promoBetCount} bets with a promo`}
        />
        <Stat
          label="Organic profit"
          value={signed(promo.organicProfitCents)}
          tone={promo.organicProfitCents >= 0 ? "positive" : "negative"}
          sub="Excludes promo value"
        />
        <Stat
          label="Pending"
          value={String(stats.count - stats.settledCount)}
          sub="Unsettled bets"
        />
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          Cumulative profit
        </h2>
        {curve.length === 0 ? (
          <p className="text-sm text-slate-500">
            No settled bets to chart yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={curve.map((p) => ({
              date: p.date,
              profit: toMajor(p.cumulativeCents),
            }))}>
              <defs>
                <linearGradient id="plFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} width={64} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [money(Math.round(value * 100)), "Profit"]}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="#10b981"
                fill="url(#plFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownChart
          title="Profit by sport"
          groups={sports}
          currency={currency}
        />
        <BreakdownChart
          title="Profit by bookmaker"
          groups={books}
          currency={currency}
        />
      </div>
    </>
  );
}

function BreakdownChart({
  title,
  groups,
  currency,
}: {
  title: string;
  groups: GroupTotal[];
  currency: string;
}) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-200">{title}</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing settled yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={groups.map((g) => ({
              label: g.label,
              profit: toMajor(g.profitCents),
            }))}
            layout="vertical"
            margin={{ left: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis type="number" stroke="#64748b" fontSize={11} />
            <YAxis
              type="category"
              dataKey="label"
              stroke="#94a3b8"
              fontSize={11}
              width={110}
            />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [
                formatMoney(Math.round(value * 100), currency, {
                  signed: true,
                }),
                "Profit",
              ]}
            />
            <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
              {groups.map((g) => (
                <Cell
                  key={g.key}
                  fill={g.profitCents >= 0 ? "#10b981" : "#f43f5e"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
