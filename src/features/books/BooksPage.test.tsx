// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { BetView, Book } from "@/db/types";
import { BooksPage } from "./BooksPage";

/**
 * Each card reports what that book has produced, and a book with nothing
 * settled is the case worth pinning: it must read as "nothing yet" rather than
 * as a gain of zero, and the bet behind it must be counted once, not once per
 * grouping the underlying selector produces.
 */

const mocks = vi.hoisted(() => ({
  createBook: vi.fn(),
  updateBook: vi.fn(),
  refresh: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    name: "Sportsbet",
    kind: "bookmaker",
    currency: "AUD",
    commission_rate: 0,
    color: "#6366f1",
    archived: 0,
    created_at: "2026-01-01",
    ...overrides,
  };
}

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
    sport_name: null,
    sport_slug: null,
    sport_kind: null,
    promo_value_cents: 0,
    import_ref: null,
    ...overrides,
  };
}

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    repo: {
      createBook: mocks.createBook,
      updateBook: mocks.updateBook,
    } as unknown as AppData["repo"],
    settings: {},
    books: [book()],
    sports: [],
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

describe("a bookmaker with nothing settled", () => {
  it("says zero bets rather than counting nothing as a bet", () => {
    render(<BooksPage />);

    expect(screen.getByText("0 settled bets")).toBeTruthy();
  });

  it("shows no result and no gain colour", () => {
    render(<BooksPage />);

    // Neither "+$0.00" nor green: nothing has happened at this book yet.
    expect(screen.queryByText("+$0.00")).toBeNull();
    expect(screen.getByText("$0.00")).toBeTruthy();
  });
});

describe("a bookmaker with bets behind it", () => {
  it("counts one bet as one bet", () => {
    mocks.data = appData({ bets: [betView()] });
    render(<BooksPage />);

    expect(screen.getByText("1 settled bet")).toBeTruthy();
  });

  it("reports the profit that book produced", () => {
    mocks.data = appData({ bets: [betView()] });
    render(<BooksPage />);

    // $50 at 2.40 is $70 of profit.
    expect(screen.getByText("+$70.00")).toBeTruthy();
  });

  it("leaves bets at other books out of this book's card", () => {
    mocks.data = appData({
      books: [book({ id: 1, name: "Sportsbet" }), book({ id: 2, name: "TAB" })],
      bets: [betView({ book_id: 1, book_name: "Sportsbet" })],
    });
    render(<BooksPage />);

    expect(screen.getByText("+$70.00")).toBeTruthy();
    expect(screen.getByText("1 settled bet")).toBeTruthy();
    expect(screen.getByText("0 settled bets")).toBeTruthy();
  });

  it("does not count a bet that has not settled", () => {
    mocks.data = appData({
      bets: [betView({ status: "pending", return_cents: 0 })],
    });
    render(<BooksPage />);

    expect(screen.getByText("0 settled bets")).toBeTruthy();
  });
});

describe("keeping the bookmaker list tidy", () => {
  it("archives a book and restores it", async () => {
    render(<BooksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() =>
      expect(mocks.updateBook).toHaveBeenCalledWith(1, { archived: true }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("offers to restore one that is archived, and marks it", () => {
    mocks.data = appData({ books: [book({ archived: 1 })] });
    render(<BooksPage />);

    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.getByText("Archived")).toBeTruthy();
  });

  it("shows an exchange as an exchange, with its commission", () => {
    mocks.data = appData({
      books: [book({ kind: "exchange", commission_rate: 0.05 })],
    });
    render(<BooksPage />);

    expect(screen.getByText("Exchange")).toBeTruthy();
    expect(screen.getByText(/5% commission/)).toBeTruthy();
  });
});

describe("adding a bookmaker", () => {
  it("trims what was typed and writes it", async () => {
    render(<BooksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add bookmaker" }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Sportsbet"), {
      target: { value: "  TAB  " },
    });
    const form = document.querySelector("form");
    fireEvent.click(
      form!.querySelector('button[type="submit"]') as HTMLButtonElement,
    );

    await waitFor(() =>
      expect(mocks.createBook).toHaveBeenCalledWith(
        expect.objectContaining({ name: "TAB", kind: "bookmaker" }),
      ),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("refuses an empty name before it reaches the database", async () => {
    render(<BooksPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add bookmaker" }));
    const form = document.querySelector("form");
    fireEvent.click(
      form!.querySelector('button[type="submit"]') as HTMLButtonElement,
    );

    // The schema says why, rather than "invalid input".
    await waitFor(() =>
      expect(screen.getByText("Give the bookmaker a name")).toBeTruthy(),
    );
    expect(mocks.createBook).not.toHaveBeenCalled();
  });
});
