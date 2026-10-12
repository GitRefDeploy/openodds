// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.data = appData(ARB_LEGS);
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
    expect(screen.getAllByText("2.86%")).toHaveLength(2);
  });

  it("leaves an ungrouped bet out of any position", () => {
    render(<BetsPage />);

    expect(screen.queryByText(/%$/)).toBeNull();
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
