/**
 * The charts, and the one place their axes are configured.
 *
 * This file exists because of a bug that only shipped to one chart. Both curves
 * on the app are drawn from one point per event, so a day with two settled bets
 * put the same date on the axis twice — and the dashboard's chart was fixed while
 * the bankroll one was not, because each page carried its own copy of the axis,
 * the grid and the tooltip. A copy is not obviously wrong: it looks like an axis.
 * So the settings are stated once, here, and no screen imports recharts at all;
 * `charts.test.tsx` fails if one starts to again.
 *
 * What is shared is **props, not elements**, and that is not a style choice.
 * Recharts finds the parts of a chart by scanning its *direct* children and
 * matching them on component name (`findAllByType` in its own source), so an
 * axis, a grid or a tooltip wrapped in a component of ours is invisible to it:
 * the first version of this file wrapped them, and every chart silently lost all
 * three. The elements below stay direct children of their chart; only the
 * settings they are given come from one place.
 *
 * Which chart to reach for: `TimeSeriesChart` for a value over dates (both
 * curves), `CategoryBarChart` for a total per category (profit by sport, by
 * bookmaker). Both take their numbers in **cents**, like every other money figure
 * in the app, and a formatter that turns cents into the string a person reads —
 * the conversion from cents to the number on the axis happens here, once, rather
 * than in each caller, where the two copies would eventually disagree.
 */
import type { CSSProperties } from "react";
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
import { toMajor } from "@/domain/money";

/**
 * The date axis.
 *
 * `allowDuplicatedCategory: false` is the whole reason this object exists. The
 * curves are built from one point per settled bet, so a day with two bets put the
 * same label on the axis twice; telling recharts not to allow repeated categories
 * makes the domain the distinct dates and draws the points that share one at that
 * date's position — nothing is dropped from the curve or the tooltip to make the
 * labels agree. Stated once, because the last time it was stated per chart, one
 * chart went without.
 */
const DATE_AXIS = {
  dataKey: "date",
  stroke: "var(--muted)",
  fontSize: 11,
  allowDuplicatedCategory: false,
} as const;

/** The numeric axis, whichever way round the chart draws it. */
const VALUE_AXIS = { stroke: "var(--muted)", fontSize: 11 } as const;

/** Category names down the side of a bar chart. */
const CATEGORY_AXIS = {
  type: "category",
  stroke: "var(--muted)",
  fontSize: 11,
} as const;

/** The grid, in the same token as every other hairline in the app. */
const CHART_GRID = { strokeDasharray: "3 3", stroke: "var(--line)" } as const;

/**
 * The tooltip's own chrome, which was written out three times before this file
 * existed — and with three chances to drift from the raised surface and hairline
 * border the rest of the app draws.
 */
const TOOLTIP_STYLE: CSSProperties = {
  background: "var(--raised)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 12,
};

/**
 * Tooltip props for one series, with the money conversion in one place.
 *
 * Recharts hands the formatter the number it plotted, which is in the axis'
 * units; `format` speaks cents, like the rest of the app, so the conversion
 * happens here rather than in every caller's formatter.
 */
function tooltipProps(
  seriesLabel: string,
  format: (cents: number) => string,
): { contentStyle: CSSProperties; formatter: (value: number) => [string, string] } {
  return {
    contentStyle: TOOLTIP_STYLE,
    formatter: (value: number) => [format(Math.round(value * 100)), seriesLabel],
  };
}

export interface TimePoint {
  /** The day this point belongs to, as the app stores it. */
  date: string;
  /** The value that day, in cents. */
  cents: number;
}

/** A value over time, as an area: the dashboard's profit and the bankroll curve. */
export function TimeSeriesChart({
  points,
  color,
  gradientId,
  seriesLabel,
  format,
  height = 240,
  fillOpacity = 0.4,
}: {
  points: readonly TimePoint[];
  /** A CSS colour token, so the chart follows the theme like everything else. */
  color: string;
  /**
   * An `id` for this chart's gradient. Must be unique on the page: two charts
   * with one id share whichever the browser resolved last.
   */
  gradientId: string;
  seriesLabel: string;
  format: (cents: number) => string;
  height?: number;
  fillOpacity?: number;
}) {
  const data = points.map((point) => ({
    date: point.date,
    value: toMajor(point.cents),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...CHART_GRID} />
        <XAxis {...DATE_AXIS} />
        <YAxis {...VALUE_AXIS} width={64} />
        <Tooltip {...tooltipProps(seriesLabel, format)} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface BarTotal {
  key: string;
  label: string;
  /** The total for this category, in cents. */
  cents: number;
}

/**
 * One horizontal bar per category, green to the right of zero and red to the
 * left of it, so a losing sport reads as a direction rather than as a smaller
 * number.
 */
export function CategoryBarChart({
  rows,
  seriesLabel,
  format,
  height = 240,
  labelWidth = 110,
}: {
  rows: readonly BarTotal[];
  seriesLabel: string;
  format: (cents: number) => string;
  height?: number;
  labelWidth?: number;
}) {
  const data = rows.map((row) => ({
    label: row.label,
    value: toMajor(row.cents),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid {...CHART_GRID} />
        <XAxis type="number" {...VALUE_AXIS} />
        <YAxis dataKey="label" {...CATEGORY_AXIS} width={labelWidth} />
        <Tooltip {...tooltipProps(seriesLabel, format)} />
        {/**
         * No grow-in on the bars, and not for taste. Recharts draws each bar
         * inside an animation, and until a frame is delivered the rectangle has
         * no size — which renders as nothing at all. In a window that never
         * composites (the browser preview this was checked in, an occluded
         * window, a screenshot harness) that is what every bar does: seven empty
         * groups and a chart with axes, a grid and no data. A bar that exists on
         * the first frame is worth more than the transition it costs.
         */}
        <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell
              key={row.key}
              fill={row.cents >= 0 ? "var(--positive)" : "var(--negative)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
