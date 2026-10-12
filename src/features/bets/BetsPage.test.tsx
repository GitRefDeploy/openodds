// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { BetView, Book } from "@/db/types";
import { BetsPage } from "./BetsPage";

/**
 * The grouping flow as the user drives it: tick rows on the Bets page, press
 * Group as position, and see the margin the group locks in. Everything below
 * the component — the repo and the margin maths — is mocked here, because those
 * are covered against a real database in `src/db/grouping.test.ts`. What this
 * file exists to protect is the wiring between them, which had no coverage at
 * all and could break silently.
 */

const mocks = vi.hoisted(() => ({
  groupBetsAsPosition: vi.fn(),
  clearPosition: vi.fn(),
  refresh: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

const BOOK: Book = {
  id: 1,
  name: "Sportsbet",
  kind: "bookmaker",
  currency: "AUD",
  commission_rate: 0,
  color: "#6366f1",
  archived: 0,
  created_at: "2026-01-01",
};

function betView(overrides: Partial<BetView> = {}): BetView {
  return {
    id: 1,
    book_id: 1,
    sport_id: null,
    event_id: null,
    position_id: null,
    description: "Test bet",
    bet_type: "single",
    bet_class: "normal",
    stake_cents: 10000,
    odds: 2,
    clv: null,
    status: "won",
    return_cents: 0,
    placed_at: "2026-01-01",
    settled_at: "2026-01-02",
    notes: "",
    created_at: "2026-01-01",
    book_name: "Sportsbet",
    currency: "AUD",
    sport_name: null,
    sport_slug: null,
    sport_kind: null,
    promo_value_cents: 0,
    // Entered by hand, so there is no statement row behind it.
    import_ref: null,
    ...overrides,
  };
}

function appData(bets: BetView[]): AppData {
  return {
    repo: {
      groupBetsAsPosition: mocks.groupBetsAsPosition,
      clearPosition: mocks.clearPosition,
      deleteBet: vi.fn(),
    } as unknown as AppData["repo"],
    settings: {},
    books: [BOOK],
    sports: [],
    promos: [],
    bets,
    transactions: [],
    currency: "AUD",
    oddsFormat: "decimal",
    refresh: mocks.refresh,
    saveSetting: vi.fn(),
  };
}

/**
 * The two legs of an unbalanced $170 arb. The legs would pay $178 and $175, so
 * only $175 is guaranteed and the margin is 2.86% — averaging the legs, or
 * taking the better one, would report a flattering number instead.
 */
const ARB_LEGS = [
  betView({ id: 1, description: "Leg A", stake_cents: 10000, odds: 1.78 }),
  betView({ id: 2, description: "Leg B", stake_cents: 7000, odds: 2.5 }),
];

function selectRow(index: number) {
  fireEvent.click(screen.getAllByLabelText("Select bet")[index]);
}

/**
 * The figure shown in the summary cell with this label.
 *
 * Matched on the cell that carries a figure, because the page heading shares
 * its word with one of the labels.
 */
function summaryValue(label: string): string {
  const cell = screen
    .getAllByText(label)
    .map((node) => node.parentElement)
    .find((parent) => parent?.querySelector("span.text-lg"));
  return cell?.querySelector("span.text-lg")?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.data = appData(ARB_LEGS);
});

describe("the density toggle", () => {
  const density = (label: "Compact" | "Comfortable") =>
    fireEvent.click(screen.getByRole("button", { name: label }));

  it("starts compact, with the repeated detail folded away", () => {
    render(<BetsPage />);

    // Rows open one line each: the book and sport repeat down the column, so
    // they are the first thing density gives up.
    expect(within(screen.getByRole("table")).queryByText("Sportsbet")).toBeNull();
  });

  it("brings the book and sport back when asked for Comfortable", () => {
    render(<BetsPage />);

    density("Comfortable");
    expect(
      within(screen.getByRole("table")).getAllByText("Sportsbet"),
    ).toHaveLength(ARB_LEGS.length);

    density("Compact");
    expect(within(screen.getByRole("table")).queryByText("Sportsbet")).toBeNull();
  });

  it("shows what a pending bet pays only at Comfortable", () => {
    mocks.data = appData([betView({ id: 3, status: "pending", odds: 2.5 })]);
    render(<BetsPage />);

    // $100 on 2.50 pays $250. A dash alone says only that it has not settled.
    expect(screen.queryByText(/pays/)).toBeNull();

    density("Comfortable");
    expect(screen.getByText("pays $250.00")).toBeTruthy();
  });

  it("keeps the closing-line edge in both densities", () => {
    mocks.data = appData([betView({ id: 4, odds: 2.1, clv: 2.0 })]);
    render(<BetsPage />);

    // A figure the row is judged on, so density never hides it.
    expect(screen.getByText("+5.0% CLV")).toBeTruthy();

    density("Comfortable");
    expect(screen.getByText("+5.0% CLV")).toBeTruthy();
  });
});

describe("the table's hierarchy", () => {
  /**
   * jsdom applies no stylesheet, so the alignment is read off the class the
   * column helper puts on the cell rather than from computed style — which is
   * the thing that has to agree between the heading and the figures under it.
   */
  const alignment = (role: "columnheader" | "cell", name: string) => {
    const table = screen.getByRole("table");
    const nodes = within(table).getAllByRole(role);
    const node = nodes.find((n) => n.textContent?.trim() === name);
    return node?.className.includes("text-right") ? "right" : "left";
  };

  it("right-aligns each figure under a right-aligned heading", () => {
    render(<BetsPage />);

    for (const heading of ["Odds", "Stake", "Profit"]) {
      expect(alignment("columnheader", heading)).toBe("right");
    }
    // The figures themselves, so a heading can never drift away from them.
    expect(alignment("cell", "$100.00")).toBe("right");
  });

  it("leaves the reading order columns left-aligned", () => {
    render(<BetsPage />);

    for (const heading of ["Date", "Bet", "Status"]) {
      expect(alignment("columnheader", heading)).toBe("left");
    }
  });
});

describe("grouping bets from the Bets page", () => {
  it("shows no action bar until something is selected", () => {
    render(<BetsPage />);

    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Group as position" }),
    ).toBeNull();
  });

  it("links the selected bets and clears the selection", async () => {
    mocks.groupBetsAsPosition.mockResolvedValue(7);
    render(<BetsPage />);

    selectRow(0);
    selectRow(1);

    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Group as position" }));

    await waitFor(() =>
      expect(mocks.groupBetsAsPosition).toHaveBeenCalledWith([1, 2]),
    );
    expect(mocks.refresh).toHaveBeenCalled();

    // The selection is spent, so the bar goes away again.
    await waitFor(() => expect(screen.queryByText("2 selected")).toBeNull());
  });

  it("will not group a single bet", () => {
    render(<BetsPage />);

    selectRow(0);

    const group = screen.getByRole("button", {
      name: "Group as position",
    }) as HTMLButtonElement;
    expect(group.disabled).toBe(true);
    expect(mocks.groupBetsAsPosition).not.toHaveBeenCalled();
  });

  it("shows the margin each leg is part of", () => {
    mocks.data = appData(
      ARB_LEGS.map((betView_) => ({ ...betView_, position_id: 7 })),
    );
    render(<BetsPage />);

    // Both legs report the group's margin, not their own standalone profit.
    expect(screen.getAllByText("Position 2.86%")).toHaveLength(2);
  });

  it("leaves an ungrouped bet out of any position", () => {
    render(<BetsPage />);

    // Scoped to the position marker on purpose: the summary strip above the
    // table has percentages of its own, and those are not a position.
    expect(screen.queryByText(/^Position /)).toBeNull();
  });

  it("breaks the position up from one of its legs", async () => {
    mocks.data = appData(
      ARB_LEGS.map((betView_) => ({ ...betView_, position_id: 7 })),
    );
    render(<BetsPage />);

    selectRow(0);
    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));

    await waitFor(() => expect(mocks.clearPosition).toHaveBeenCalledWith(7));
    expect(mocks.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("2 selected")).toBeNull());
  });
});

describe("the betting record's summary", () => {
  it("totals the rows on screen", () => {
    render(<BetsPage />);

    // 100.00 at 1.78 and 70.00 at 2.50: 170.00 staked, 183.00 of profit.
    expect(summaryValue("Turnover")).toBe("$170.00");
    expect(summaryValue("Net profit")).toBe("+$183.00");
    expect(summaryValue("ROI")).toBe("107.6%");
  });

  it("follows the filter rather than describing the whole database", () => {
    render(<BetsPage />);

    fireEvent.change(screen.getByPlaceholderText("Search description…"), {
      target: { value: "Leg A" },
    });

    expect(summaryValue("Bets")).toBe("1");
    expect(screen.getByText("of 2 recorded")).toBeTruthy();
    expect(summaryValue("Turnover")).toBe("$100.00");
  });

  it("says a rate has no value rather than zero when nothing settled", () => {
    mocks.data = appData([
      betView({ id: 1, status: "pending", return_cents: 0 }),
    ]);
    render(<BetsPage />);

    expect(summaryValue("ROI")).toBe("—");
    expect(screen.getByText("Needs a settled bet")).toBeTruthy();
  });

  it("shows how far ahead of the closing price each bet was taken", () => {
    mocks.data = appData([
      betView({ id: 1, odds: 2.4, clv: 2.3 }),
      betView({ id: 2, odds: 2.2, clv: 2.3, description: "Behind" }),
    ]);
    render(<BetsPage />);

    expect(screen.getByText("+4.3% CLV")).toBeTruthy();
    expect(screen.getByText("-4.3% CLV")).toBeTruthy();
  });

  it("says nothing about the close when none was recorded", () => {
    render(<BetsPage />);

    // The fixtures record no CLV, which is the normal case for a fresh import.
    // Repeating "no close" down every row would be noise, so the line simply
    // is not there.
    expect(screen.queryByText(/CLV$/)).toBeNull();
  });

  it("lets the reader choose how tightly the rows pack", () => {
    render(<BetsPage />);

    const compact = screen.getByRole("button", { name: "Compact" });
    const comfortable = screen.getByRole("button", { name: "Comfortable" });
    expect(compact.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(comfortable);
    expect(comfortable.getAttribute("aria-pressed")).toBe("true");
    expect(compact.getAttribute("aria-pressed")).toBe("false");
  });
});
