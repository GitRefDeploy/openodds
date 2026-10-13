/**
 * @vitest-environment jsdom
 */
/**
 * The chart settings, checked where they were once duplicated.
 *
 * A real browser is the only place a tick label can be seen — these tests cannot
 * prove an axis has one tick per day. What they can hold is the arrangement that
 * makes it true: the date axis is configured once, both charts build their axes
 * from it, and no screen is allowed to draw its own again. That last one is the
 * failure this file exists for: the duplicate-date fix was written into the
 * dashboard's chart and not the bankroll one, because each page had its own copy
 * of the axis to change.
 *
 * The element tree is inspected rather than rendered. `ResponsiveContainer`
 * measures its box with a ResizeObserver and jsdom has no layout, so a rendered
 * chart here is a zero-sized nothing whose emptiness would make every assertion
 * below pass vacuously.
 *
 * The first version of `charts.tsx` wrapped each axis in a component of its own,
 * which recharts cannot see — it finds its parts by scanning the chart's *direct*
 * children — and every chart silently lost its axes, grid and tooltip. Nothing in
 * this file caught that; a browser did. So the direct-child assertions below are
 * deliberate: they are the part of this arrangement that a wrapper would break,
 * and they are written against the chart rather than against the wrapper.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { describe, expect, it } from "vitest";
import { CategoryBarChart, TimeSeriesChart } from "./charts";

/**
 * The props these tests read back, described rather than borrowed from recharts:
 * an element handed to `isValidElement` carries no prop types at all, and
 * claiming to know recharts' own would only invite the assertions to drift from
 * what they actually check.
 */
interface ChartProps {
  children?: ReactNode;
  data?: unknown;
  fill?: string;
  formatter?: (value: number) => [string, string];
  type?: unknown;
  dataKey?: unknown;
  width?: unknown;
  stroke?: unknown;
  strokeDasharray?: unknown;
  allowDuplicatedCategory?: unknown;
}

type ChartElement = ReactElement<ChartProps>;

function asElement(child: ReactNode): ChartElement | null {
  return isValidElement(child) ? (child as ChartElement) : null;
}

/** What the chart itself is given, which is all recharts reads. */
function directChildren(element: ChartElement): ChartElement[] {
  const children = element.props.children;
  const list = Array.isArray(children) ? children.flat(2) : [children];
  return list
    .map(asElement)
    .filter((child): child is ChartElement => child !== null);
}

/** Every element of a given type anywhere below `node`, without rendering it. */
function findAll(node: ReactNode, type: unknown): ChartElement[] {
  const found: ChartElement[] = [];
  const walk = (child: ReactNode): void => {
    if (Array.isArray(child)) {
      for (const one of child) walk(one);
      return;
    }
    const element = asElement(child);
    if (!element) return;
    if (element.type === type) found.push(element);
    walk(element.props.children as ReactNode);
  };
  walk(node);
  return found;
}

function withType(children: ChartElement[], type: unknown): ChartProps {
  const found = children.filter((child) => child.type === type);
  expect(found, `no ${String(type)} among the chart's own children`).toHaveLength(1);
  return found[0].props;
}

const format = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const chart = TimeSeriesChart({
  points: [
    { date: "2026-03-01", cents: 123456 },
    // Two bets settled on one day: the axis has to survive a repeated date, and
    // the series has to keep both points.
    { date: "2026-03-01", cents: -500 },
    { date: "2026-03-04", cents: 9900 },
  ],
  color: "var(--positive)",
  gradientId: "plFill",
  seriesLabel: "Profit",
  format,
});

describe("a value over time", () => {
  const [areaChart] = findAll(chart, AreaChart);
  const own = directChildren(areaChart);

  it("is non-vacuous: the chart and its parts are all there", () => {
    expect(findAll(chart, AreaChart)).toHaveLength(1);
    expect(own.length).toBeGreaterThanOrEqual(5);
  });

  it("plots cents in the axis' units without dropping a repeated day", () => {
    expect(areaChart.props.data).toEqual([
      { date: "2026-03-01", value: 1234.56 },
      { date: "2026-03-01", value: -5 },
      { date: "2026-03-04", value: 99 },
    ]);
  });

  it("gives the chart its axes, grid and tooltip as its own children, where recharts looks", () => {
    // By type, one each: an axis inside a wrapper of ours is an axis recharts
    // never finds, and the chart draws without it.
    for (const part of [XAxis, YAxis, CartesianGrid, Tooltip]) {
      expect(own.filter((child) => child.type === part)).toHaveLength(1);
    }
  });

  it("draws one tick per date rather than one per point", () => {
    const axis = withType(own, XAxis);
    expect(axis.dataKey).toBe("date");
    expect(axis.allowDuplicatedCategory).toBe(false);
  });

  it("fills the area from its own gradient, named for this chart", () => {
    const area = withType(own, Area);
    expect(area.fill).toBe("url(#plFill)");
    expect(area.dataKey).toBe("value");
  });

  it("draws a hairline grid in the app's own line token", () => {
    expect(withType(own, CartesianGrid).stroke).toBe("var(--line)");
  });

  it("asks the caller for money in cents, whatever the axis is drawn in", () => {
    const tooltip = withType(own, Tooltip);
    const formatter = tooltip.formatter;
    if (!formatter) throw new Error("the tooltip has no formatter");
    // Recharts hands the formatter the number it plotted; the caller's formatter
    // speaks cents, like the rest of the app.
    expect(formatter(1234.56)).toEqual(["$1234.56", "Profit"]);
    // A loss on the axis is a negative number of the axis' units — five dollars
    // out is -5, which is -500 cents.
    expect(formatter(-5)).toEqual(["$-5.00", "Profit"]);
  });
});

describe("a total per category", () => {
  const bars = CategoryBarChart({
    rows: [
      { key: "afl", label: "AFL", cents: 250000 },
      { key: "nrl", label: "NRL", cents: -90000 },
    ],
    seriesLabel: "Profit",
    format,
  });
  const [barChart] = findAll(bars, BarChart);
  const own = directChildren(barChart);

  it("plots each total in the axis' units", () => {
    expect(barChart.props.data).toEqual([
      { label: "AFL", value: 2500 },
      { label: "NRL", value: -900 },
    ]);
  });

  it("keeps a value axis and a category axis on the chart itself", () => {
    expect(withType(own, XAxis).type).toBe("number");
    const categories = withType(own, YAxis);
    expect(categories.type).toBe("category");
    expect(categories.dataKey).toBe("label");
  });

  it("colours a loss as a direction, not as a smaller number", () => {
    const cells = findAll(bars, Cell);
    expect(cells.map((cell) => cell.props.fill)).toEqual([
      "var(--positive)",
      "var(--negative)",
    ]);
  });
});

describe("where the axes are allowed to live", () => {
  // Read through Vite rather than the filesystem: this suite runs in jsdom,
  // where `import.meta.url` is an http URL and `node:fs` cannot resolve it.
  const sources = Object.entries(
    import.meta.glob("../../**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>,
  );
  const screens = Object.entries(
    import.meta.glob("../../features/**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>,
  );
  const implementation = sources.filter(
    ([path]) => !/\.test\.tsx?$/.test(path),
  );

  it("is non-vacuous: the screens and the module itself were read", () => {
    expect(screens.length).toBeGreaterThan(15);
    // Glob keys are relative to this file, and this module is its sibling.
    expect(
      implementation.some(([path]) => path.replace(/^\.\//, "") === "charts.tsx"),
    ).toBe(true);
  });

  it("keeps every screen out of recharts, so no page can own an axis again", () => {
    const importers = screens
      .filter(([, text]) => /from\s+"recharts"/.test(text))
      .map(([path]) => path);
    expect(importers).toEqual([]);
  });

  it("states the duplicate-date setting in one place and nowhere else", () => {
    // Twice is how it went wrong: one copy was fixed, the other was not.
    const mentions = implementation
      .filter(([, text]) => text.includes("allowDuplicatedCategory"))
      .map(([path]) => path);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].replace(/^\.\//, "")).toBe("charts.tsx");
  });
});
