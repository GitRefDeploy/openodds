// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { BetView, Book } from "@/db/types";
import { DashboardPage } from "./DashboardPage";

/**
 * The dashboard is the first thing anyone sees, and on a fresh install there is
 * nothing in it. These tests pin the two halves of that: the layout stays the
 * same shape with real zeros rather than a bare "no data" line, and the two
 * figures that have no meaning yet say so instead of claiming 0.0%.
 */

/**
 * jsdom has no ResizeObserver, and recharts' ResponsiveContainer needs one to
 * measure the box it draws in. A no-op observer leaves the chart at zero size,
 * which is enough here: these tests are about the figures beside the charts and
 * about what the screen says when there is nothing to chart, not about pixels.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const mocks = vi.hoisted(() => ({
  saveSetting: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

function book(name: string): Book {
  return {
    id: 1,
    name,
    kind: "bookmaker",
    currency: "AUD",
    commission_rate: 0,
    color: "#6366f1",
    archived: 0,
    created_at: "2026-01-01",
  };
}

function betView(overrides: Partial<BetView> = {}): BetView {
  return {
    id: 1,
    book_id: 1,
    sport_id: null,
    event_id: null,
    position_id: null,
    description: "Flemington R3 #4",
    bet_type: "single",
    bet_class: "normal",
    stake_cents: 5000,
    odds: 2.4,
    clv: null,
    status: "won",
    return_cents: 12000,
    placed_at: "2026-03-10",
    settled_at: "2026-03-10",
    notes: "",
    created_at: "2026-03-10",
    import_ref: null,
    book_name: "Sportsbet",
    currency: "AUD",
    sport_name: null,
    sport_slug: null,
    sport_kind: null,
    promo_value_cents: 0,
    ...overrides,
  };
}

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    repo: {} as unknown as AppData["repo"],
    settings: {},
    books: [],
    sports: [],
    promos: [],
    bets: [],
    transactions: [],
    currency: "AUD",
    oddsFormat: "decimal",
    refresh: vi.fn(),
    saveSetting: mocks.saveSetting,
    ...overrides,
  };
}

/** The value shown in the tile with this label. */
function tile(label: string): string {
  const heading = screen.getByText(label);
  return heading.parentElement?.querySelector("span.text-3xl")?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveSetting.mockResolvedValue(undefined);
  mocks.data = appData();
});

describe("the dashboard before anything is recorded", () => {
  it("keeps the layout and shows real zeros", () => {
    render(<DashboardPage />);

    expect(tile("Net profit")).toBe("$0.00");
    expect(tile("Turnover")).toBe("$0.00");
    expect(tile("From promos")).toBe("$0.00");
    expect(tile("Pending")).toBe("0");
    // Not "+$0.00": a sign belongs on a gain or a loss.
    expect(screen.queryByText("+$0.00")).toBeNull();
  });

  it("says a rate with no bets behind it has no value", () => {
    render(<DashboardPage />);

    // 0.0% would be a confident claim about nothing.
    expect(tile("ROI")).toBe("—");
    expect(tile("Strike rate")).toBe("—");
    expect(screen.getAllByText("Needs a settled bet")).toHaveLength(2);
  });

  it("explains the zeroes and asks for the first four things", () => {
    render(<DashboardPage />);

    expect(screen.getByText(/Nothing is recorded yet/)).toBeTruthy();
    expect(screen.getByText("Get set up")).toBeTruthy();
    expect(screen.getByText(/0 of 4 done/)).toBeTruthy();
    expect(screen.getByText("4 to go")).toBeTruthy();
  });

  it("ticks a step from real state, not from being asked", () => {
    // A bookmaker exists, so that step is done before the user does anything.
    mocks.data = appData({ books: [book("Sportsbet")] });
    render(<DashboardPage />);

    expect(screen.getByText(/1 of 4 done/)).toBeTruthy();
    expect(screen.getByText("3 to go")).toBeTruthy();
  });

  it("takes a step somewhere that can actually do it", () => {
    const onNavigate = vi.fn();
    render(<DashboardPage onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Record a bet" }));
    expect(onNavigate).toHaveBeenCalledWith("bets");

    fireEvent.click(screen.getByRole("button", { name: "Import a statement" }));
    expect(onNavigate).toHaveBeenCalledWith("import");
  });

  it("can be dismissed, and remembers", () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(mocks.saveSetting).toHaveBeenCalledWith("onboardingDismissed", "true");
  });

  it("stays dismissed once the preference says so", () => {
    mocks.data = appData({ settings: { onboardingDismissed: "true" } });
    render(<DashboardPage />);
    expect(screen.queryByText("Get set up")).toBeNull();
  });

  it("comes back when Settings writes the preference off", () => {
    // The other half of the same door: the value the restore control writes
    // has to bring the checklist back, not just stop it being hidden.
    mocks.data = appData({ settings: { onboardingDismissed: "false" } });
    render(<DashboardPage />);
    expect(screen.getByText("Get set up")).toBeTruthy();
  });
});

describe("the dashboard once bets are settled", () => {
  it("replaces the placeholders with the real figures", () => {
    mocks.data = appData({
      books: [book("Sportsbet")],
      bets: [betView()],
    });
    render(<DashboardPage />);

    // 50.00 at 2.40 returns 120.00, so 70.00 of profit on 50.00 staked.
    expect(tile("Net profit")).toBe("+$70.00");
    expect(tile("Turnover")).toBe("$50.00");
    expect(tile("ROI")).toBe("140.0%");
    expect(tile("Strike rate")).toBe("100.0%");
    expect(screen.queryByText("Needs a settled bet")).toBeNull();
    expect(screen.getByText(/2 of 4 done/)).toBeTruthy();
  });

  it("keeps promo value out of organic profit", () => {
    mocks.data = appData({
      books: [book("Sportsbet")],
      bets: [betView({ promo_value_cents: 2000 })],
    });
    render(<DashboardPage />);

    expect(tile("From promos")).toBe("$20.00");
    expect(tile("Organic profit")).toBe("+$50.00");
  });

  it("counts an unsettled bet as pending rather than as a loss", () => {
    mocks.data = appData({
      books: [book("Sportsbet")],
      bets: [betView({ status: "pending", return_cents: 0 })],
    });
    render(<DashboardPage />);

    expect(tile("Pending")).toBe("1");
    expect(tile("Net profit")).toBe("$0.00");
    // Nothing settled, so the rate is still undefined.
    expect(tile("ROI")).toBe("—");
    // A bookmaker and a bet exist, so two steps are done whatever its outcome.
    expect(screen.getByText(/2 of 4 done/)).toBeTruthy();
  });
});
