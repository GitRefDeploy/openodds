// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { BetView, Book, TransactionView } from "@/db/types";
import { BankrollPage } from "./BankrollPage";

/**
 * The balance is the one number on this screen that can be quietly wrong, and
 * it is assembled from two sources: cash movements the user entered, and
 * betting profit the app derived. These tests pin that assembly — including
 * the part that is easy to double-count — and the entry path that feeds it.
 */

/** recharts measures its box with a ResizeObserver jsdom does not have. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const mocks = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
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

function transaction(overrides: Partial<TransactionView> = {}): TransactionView {
  return {
    id: 1,
    book_id: 1,
    type: "deposit",
    amount_cents: 10000,
    occurred_at: "2026-03-01",
    notes: "",
    created_at: "2026-03-01",
    book_name: "Sportsbet",
    currency: "AUD",
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
      createTransaction: mocks.createTransaction,
      deleteTransaction: mocks.deleteTransaction,
    } as unknown as AppData["repo"],
    settings: {},
    books: [BOOK],
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

/** The figure in the Stat card with this label. */
function stat(label: string): string {
  const heading = screen.getByText(label);
  return heading.parentElement?.querySelector("span.text-3xl, span.text-lg")?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue(undefined);
  mocks.data = appData();
});

describe("what the balance is made of", () => {
  it("adds deposits and subtracts withdrawals", () => {
    mocks.data = appData({
      transactions: [
        transaction({ id: 1, type: "deposit", amount_cents: 10000 }),
        transaction({ id: 2, type: "withdrawal", amount_cents: 4000 }),
      ],
    });
    render(<BankrollPage />);

    expect(stat("Current balance")).toBe("$60.00");
    expect(stat("Total deposited")).toBe("$100.00");
    expect(stat("Total withdrawn")).toBe("$40.00");
  });

  it("counts realised betting profit without calling it a deposit", () => {
    mocks.data = appData({
      transactions: [transaction({ amount_cents: 10000 })],
      // $50 at 2.40 returns $120: $70 of realised profit.
      bets: [betView()],
    });
    render(<BankrollPage />);

    expect(stat("Current balance")).toBe("$170.00");
    // The win is not cash the user paid in, so deposited stays put. Stakes and
    // returns are derived from the bets table, which is what stops a bet being
    // counted twice once it is also recorded as a movement.
    expect(stat("Total deposited")).toBe("$100.00");
  });

  it("leaves a bet that has not settled out of the balance", () => {
    mocks.data = appData({
      transactions: [transaction({ amount_cents: 10000 })],
      bets: [betView({ status: "pending", return_cents: 0 })],
    });
    render(<BankrollPage />);

    // Nothing has come back yet, so nothing has moved.
    expect(stat("Current balance")).toBe("$100.00");
  });
});

describe("recording a movement", () => {
  it("writes the cents the user typed and refreshes", async () => {
    render(<BankrollPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "25.50" },
    });
    // The header button opens the modal; the one inside it writes the row.
    const buttons = screen.getAllByRole("button", { name: "Add transaction" });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(mocks.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 2550, bookId: 1, type: "deposit" }),
      ),
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("refuses an amount it cannot read rather than writing a zero", () => {
    render(<BankrollPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "abc" },
    });
    const buttons = screen.getAllByRole("button", { name: "Add transaction" });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(mocks.createTransaction).not.toHaveBeenCalled();
  });

  it("asks for a bookmaker first when there is nowhere to record it", () => {
    mocks.data = appData({ books: [] });
    render(<BankrollPage />);

    const add = screen.getByRole("button", {
      name: "Add transaction",
    }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(
      screen.getByText(/Add a bookmaker first/),
    ).toBeTruthy();
  });
});

describe("the ledger", () => {
  it("says what is missing instead of drawing an empty chart", () => {
    render(<BankrollPage />);

    expect(screen.getByText(/No transactions or settled bets yet/)).toBeTruthy();
    expect(screen.getByText("No transactions recorded yet.")).toBeTruthy();
  });

  it("shows a movement with its direction and deletes it on request", async () => {
    mocks.data = appData({
      transactions: [
        transaction({ id: 1, type: "withdrawal", amount_cents: 4000 }),
      ],
    });
    render(<BankrollPage />);

    // The stored amount is always positive; the type is what makes it negative.
    // Read from the ledger, since the same figure can appear in the chart's
    // own rendered markup.
    const ledger = within(screen.getByRole("table"));
    expect(ledger.getByText("-$40.00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "✕" }));
    await waitFor(() => expect(mocks.deleteTransaction).toHaveBeenCalledWith(1));
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
