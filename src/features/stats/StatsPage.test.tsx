// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { BetView } from "@/db/types";
import type { BetStatus } from "@/domain/pnl";
import { StatsPage } from "./StatsPage";

/**
 * The one screen where the question is not "did it win" but "what does this
 * guarantee", and the figures on it are derived rather than entered, so a
 * mistake in the wiring is invisible until the numbers are wrong. These tests
 * pin the arithmetic, the running-first ordering, and the worst-case marker —
 * the leg the guarantee actually rests on, which is otherwise unmarked.
 */

const mocks = vi.hoisted(() => ({
  clearPosition: vi.fn(),
  refresh: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

function betView(overrides: Partial<BetView> = {}): BetView {
  return {
    id: 1,
    book_id: 1,
    sport_id: null,
    event_id: null,
    position_id: null,
    description: "Test bet",
    bet_type: "single",
    bet_class: "arbitrage",
    stake_cents: 10000,
    odds: 1.78,
    clv: null,
    status: "pending",
    return_cents: 0,
    placed_at: "2026-03-13",
    settled_at: null,
    notes: "",
    created_at: "2026-03-13",
    book_name: "TAB",
    currency: "AUD",
    sport_name: null,
    sport_slug: null,
    sport_kind: null,
    promo_value_cents: 0,
    import_ref: null,
    ...overrides,
  };
}

/**
 * The unbalanced arb these tests are built on: $100 at 1.78 and $70 at 2.50.
 * The legs would pay $178 and $175, so only $175 is guaranteed on $170 of cash
 * — a margin of 2.86% and $5.00 locked, not the $8 the better leg would pay.
 */
const LEG_A = betView({ id: 1, description: "Via Sistina", stake_cents: 10000, odds: 1.78, position_id: 7 });
const LEG_B = betView({ id: 2, description: "Field to beat", stake_cents: 7000, odds: 2.5, position_id: 7 });

function appData(bets: BetView[]): AppData {
  return {
    repo: { clearPosition: mocks.clearPosition } as unknown as AppData["repo"],
    settings: {},
    books: [],
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

/** A leg with its outcome set. */
function settledLeg(leg: BetView, status: BetStatus): BetView {
  return { ...leg, status, settled_at: "2026-03-13" };
}

/** The figure in the summary cell with this label. */
function summaryValue(label: string): string {
  const heading = screen.getByText(label);
  return heading.parentElement?.querySelector("span.text-lg")?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  mocks.data = appData([LEG_A, LEG_B]);
});

describe("a position's guaranteed figures", () => {
  it("reports the worst leg, not the better one", () => {
    render(<StatsPage />);

    // Averaging the legs, or trusting the one that pays $178, would report a
    // flattering number that no leg actually pays.
    expect(summaryValue("Cash staked")).toBe("$170.00");
    expect(summaryValue("Guaranteed return")).toBe("$175.00");
    expect(summaryValue("Locked margin")).toBe("+$5.00");
  });

  it("marks the leg the guarantee rests on", () => {
    render(<StatsPage />);

    // Exactly one leg sets the worst case: the one paying $175, not $178.
    expect(screen.getAllByText("Worst case")).toHaveLength(1);
    expect(screen.queryByText("worst case")).toBeNull();
    // Read off the legs rather than the strip, which shows $175 of its own.
    const legs = within(screen.getByRole("table"));
    expect(legs.getByText("$175.00")).toBeTruthy();
    expect(legs.getByText("$178.00")).toBeTruthy();
  });

  it("names the margin against the payout", () => {
    render(<StatsPage />);

    expect(screen.getByText("2.86% margin")).toBeTruthy();
  });

  it("counts the position and says how many are still running", () => {
    render(<StatsPage />);

    expect(summaryValue("Positions")).toBe("1");
    expect(screen.getByText("1 still running")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
  });
});

describe("how a leg's stake is marked", () => {
  it("says when the stake was not cash", () => {
    // A bonus bet's stake was never the punter's money, so the leg says so
    // beside the figure — the same word the Bets row uses, cased the same way.
    mocks.data = appData([
      betView({
        id: 3,
        bet_class: "bonus_bet",
        stake_cents: 2500,
        odds: 2.4,
        position_id: 7,
      }),
      LEG_B,
    ]);
    render(<StatsPage />);

    expect(within(screen.getByRole("table")).getByText("Free")).toBeTruthy();
  });
});

describe("a position that has not settled", () => {
  it("shows no result rather than a signed zero", () => {
    render(<StatsPage />);

    // "+$0.00" reads as a small win. Nothing has settled, so nothing is won.
    expect(screen.queryByText("+$0.00")).toBeNull();
    expect(screen.getByText(/Realised \$0\.00/)).toBeTruthy();
  });

  it("leaves the legs' profit blank until they have run", () => {
    render(<StatsPage />);

    // A dash per leg, because a pending bet has no profit yet.
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("clears the worst-case marker once the position is settled", () => {
    // Both legs settled, so there is no longer a case to guard against.
    mocks.data = appData([
      settledLeg(LEG_A, "won"),
      settledLeg(LEG_B, "lost"),
    ]);
    render(<StatsPage />);

    expect(screen.queryByText("Worst case")).toBeNull();
    expect(screen.getByText("Settled")).toBeTruthy();
  });
});

describe("a settled position", () => {
  it("adds up what the legs actually returned", () => {
    mocks.data = appData([
      settledLeg(LEG_A, "won"),
      settledLeg(LEG_B, "lost"),
    ]);
    render(<StatsPage />);

    // $100 at 1.78 returned $178, less the $170 of cash staked: $8 of profit.
    expect(screen.getByText("Realised +$8.00")).toBeTruthy();
    expect(screen.getByText("+$78.00")).toBeTruthy();
  });

  it("shows a leg that came back level as zero rather than a signed zero", () => {
    mocks.data = appData([
      settledLeg(LEG_A, "void"),
      settledLeg(LEG_B, "lost"),
    ]);
    render(<StatsPage />);

    // A void leg returns its stake, so it neither won nor lost anything.
    expect(screen.queryByText("+$0.00")).toBeNull();
    expect(within(screen.getByRole("table")).getAllByText("$0.00")).toHaveLength(1);
  });
});

describe("narrowing the list", () => {
  const settled = [
    settledLeg(LEG_A, "won"),
    settledLeg(LEG_B, "lost"),
  ];
  const running = [
    betView({ id: 3, description: "Open A", stake_cents: 5000, odds: 2, position_id: 8 }),
    betView({ id: 4, description: "Open B", stake_cents: 5000, odds: 2.2, position_id: 8 }),
  ];

  beforeEach(() => {
    mocks.data = appData([...settled, ...running]);
  });

  it("counts each state in its own chip", () => {
    render(<StatsPage />);

    expect(screen.getByRole("button", { name: "All 2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Running 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settled 1" })).toBeTruthy();
  });

  it("can show only what is still running", () => {
    render(<StatsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Running 1" }));
    expect(screen.queryByText("Via Sistina")).toBeNull();
    expect(screen.getByText("Open A")).toBeTruthy();
  });

  it("can show only what has settled", () => {
    render(<StatsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Settled 1" }));
    expect(screen.getByText("Via Sistina")).toBeTruthy();
    expect(screen.queryByText("Open A")).toBeNull();
  });

  it("says so when a filter leaves nothing rather than showing an empty page", () => {
    mocks.data = appData(settled);
    render(<StatsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Running 0" }));
    expect(screen.getByText(/No running positions/)).toBeTruthy();
  });

  it("keeps the totals describing every position, not just the shown ones", () => {
    render(<StatsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Settled 1" }));
    // The strip is about the record, so narrowing the list does not restate it.
    expect(summaryValue("Positions")).toBe("2");
  });
});

describe("breaking a position up", () => {
  it("asks first, then ungroups and refreshes", async () => {
    render(<StatsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));

    await waitFor(() => expect(mocks.clearPosition).toHaveBeenCalledWith(7));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("does nothing when the confirmation is declined", () => {
    (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<StatsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Ungroup" }));
    expect(mocks.clearPosition).not.toHaveBeenCalled();
  });
});

describe("before any position exists", () => {
  it("explains how a position is made, and offers the way there", () => {
    const onNavigate = vi.fn();
    mocks.data = appData([betView({ position_id: null })]);
    render(<StatsPage onNavigate={onNavigate} />);

    expect(screen.getByText("No positions yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go to Bets" }));
    expect(onNavigate).toHaveBeenCalledWith("bets");
  });

  it("leaves an ungrouped bet off the screen entirely", () => {
    mocks.data = appData([betView({ description: "Loose bet", position_id: null })]);
    render(<StatsPage />);

    expect(screen.queryByText("Loose bet")).toBeNull();
  });
});
