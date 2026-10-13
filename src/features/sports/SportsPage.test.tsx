// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { BetView, Sport } from "@/db/types";
import { SportsPage } from "./SportsPage";

/**
 * The list is the app's own vocabulary, so the two things worth pinning are
 * that a hidden code stays on the page marked as hidden (rather than vanishing,
 * which would make it impossible to bring back), and that a sport added by hand
 * gets the slug its bets will be grouped by.
 */

const mocks = vi.hoisted(() => ({
  createSport: vi.fn(),
  setSportEnabled: vi.fn(),
  refresh: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

function sport(overrides: Partial<Sport> = {}): Sport {
  return {
    id: 1,
    slug: "horse_racing",
    name: "Horse racing",
    kind: "racing",
    enabled: 1,
    sort_order: 0,
    ...overrides,
  };
}

function betView(overrides: Partial<BetView> = {}): BetView {
  return {
    id: 1,
    book_id: 1,
    sport_id: 1,
    event_id: null,
    position_id: null,
    description: "Test bet",
    bet_type: "single",
    bet_class: "normal",
    stake_cents: 5000,
    odds: 2.4,
    clv: null,
    status: "won",
    return_cents: 0,
    placed_at: "2026-03-01",
    settled_at: "2026-03-02",
    notes: "",
    created_at: "2026-03-01",
    book_name: "Sportsbet",
    currency: "AUD",
    sport_name: "Horse racing",
    sport_slug: "horse_racing",
    sport_kind: "racing",
    promo_value_cents: 0,
    import_ref: null,
    ...overrides,
  };
}

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    repo: {
      createSport: mocks.createSport,
      setSportEnabled: mocks.setSportEnabled,
    } as unknown as AppData["repo"],
    settings: {},
    books: [],
    sports: [sport()],
    promos: [],
    bets: [],
    transactions: [],
    currency: "AUD",
    oddsFormat: "decimal",
    refresh: mocks.refresh,
    saveSetting: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.data = appData();
});

describe("the list itself", () => {
  it("groups the codes under the kinds the app reads them in", () => {
    mocks.data = appData({
      sports: [
        sport({ id: 1, slug: "horse_racing", name: "Horse racing", kind: "racing" }),
        sport({ id: 2, slug: "soccer", name: "Soccer", kind: "team" }),
      ],
    });
    render(<SportsPage />);

    expect(screen.getByText("Racing")).toBeTruthy();
    expect(screen.getByText("Team sports")).toBeTruthy();
  });

  it("leaves out a group with nothing in it rather than showing an empty heading", () => {
    render(<SportsPage />);

    expect(screen.getByText("Racing")).toBeTruthy();
    expect(screen.queryByText("Team sports")).toBeNull();
  });

  it("shows a hidden code as hidden instead of removing it", () => {
    mocks.data = appData({ sports: [sport({ enabled: 0 })] });
    render(<SportsPage />);

    // It has to stay visible: an invisible row is one you cannot enable again.
    expect(screen.getByText("Horse racing")).toBeTruthy();
    expect(screen.getByText("Hidden")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable" })).toBeTruthy();
  });

  it("says a code has nothing behind it rather than showing a zero", () => {
    render(<SportsPage />);

    expect(screen.getByText("No settled bets")).toBeTruthy();
  });

  it("reports what a code has actually produced", () => {
    mocks.data = appData({ bets: [betView()] });
    render(<SportsPage />);

    // $50 at 2.40 is $70 of profit on one settled bet, and one bet is "bet".
    expect(screen.getByText(/1 bet · \+70.00 AUD/)).toBeTruthy();
  });
});

describe("turning a code on and off", () => {
  it("hides one that is on", async () => {
    render(<SportsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(mocks.setSportEnabled).toHaveBeenCalledWith(1, false));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("brings back one that is off", async () => {
    mocks.data = appData({ sports: [sport({ enabled: 0 })] });
    render(<SportsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Enable" }));
    await waitFor(() => expect(mocks.setSportEnabled).toHaveBeenCalledWith(1, true));
  });
});

describe("adding one of your own", () => {
  it("derives the slug its bets will be grouped by", async () => {
    render(<SportsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add sport" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Darts"), {
      target: { value: "Table Tennis" },
    });
    const buttons = screen.getAllByRole("button", { name: "Add sport" });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(mocks.createSport).toHaveBeenCalledWith({
        slug: "table_tennis",
        name: "Table Tennis",
        kind: "team",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("trims the name it stores", async () => {
    render(<SportsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add sport" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Darts"), {
      target: { value: "  Darts  " },
    });
    const buttons = screen.getAllByRole("button", { name: "Add sport" });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(mocks.createSport).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Darts", slug: "darts" }),
      ),
    );
  });

  it("refuses a blank name rather than creating an unnamed code", () => {
    render(<SportsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add sport" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Darts"), {
      target: { value: "   " },
    });
    const buttons = screen.getAllByRole("button", { name: "Add sport" });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(mocks.createSport).not.toHaveBeenCalled();
  });
});
