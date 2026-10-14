// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { Promo } from "@/db/types";
import { PromosPage } from "./PromosPage";

/**
 * The promo value field is the one place a number can be read three ways. These
 * tests pin down what it says it means, and that a fixed amount typed in
 * dollars is stored in cents like every other money value in the app — typing
 * "25" used to save $0.25.
 */

const mocks = vi.hoisted(() => ({
  createPromo: vi.fn(),
  promoUsage: vi.fn(),
  refresh: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

function appData(overrides: Partial<AppData> = {}): AppData {
  return {
    repo: {
      createPromo: mocks.createPromo,
      promoUsage: mocks.promoUsage,
      deletePromo: vi.fn(),
    } as unknown as AppData["repo"],
    settings: {},
    books: [],
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

function promo(overrides: Partial<Promo> = {}): Promo {
  return {
    id: 1,
    name: "30% profit boost",
    type: "profit_boost",
    value_type: "percent",
    value: 30,
    min_odds: 2,
    book_id: null,
    sport_id: null,
    starts_at: null,
    ends_at: null,
    notes: "",
    created_at: "2026-03-01",
    ...overrides,
  };
}

/** One promo in the list, with however many bets have used it. */
async function renderWithUsage(count: number): Promise<void> {
  mocks.data = appData({ promos: [promo()] });
  mocks.promoUsage.mockResolvedValue([
    { promo_id: 1, count, total_value_cents: count * 2750 },
  ]);
  render(<PromosPage />);
}

async function openForm() {
  render(<PromosPage />);
  // The header button and the empty-state button both say "New promo".
  fireEvent.click(screen.getAllByRole("button", { name: "New promo" })[0]);
  await screen.findByRole("button", { name: "Add promo" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPromo.mockResolvedValue(undefined);
  mocks.promoUsage.mockResolvedValue([]);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.data = appData();
});

describe("what a promo says it has been used on", () => {
  it("counts a single bet in the singular", async () => {
    await renderWithUsage(1);

    // "Used on 1 bets" is the kind of thing a reader sees before anything else
    // on the card, so the count and the word have to agree.
    expect(await screen.findByText("Used on 1 bet")).toBeTruthy();
    expect(screen.queryByText("Used on 1 bets")).toBeNull();
  });

  it("still pluralises once more than one bet has used it", async () => {
    await renderWithUsage(4);

    expect(await screen.findByText("Used on 4 bets")).toBeTruthy();
  });
});

describe("the promo value field", () => {
  it("starts on a profit boost and says the number is a share of the profit", async () => {
    await openForm();

    // The form opens on the profit boost, and names it as such: the default
    // must not be a type name that no longer matches what the number means.
    const type = screen.getByLabelText(/Type/) as HTMLSelectElement;
    expect(type.value).toBe("profit_boost");
    expect(type.options[type.selectedIndex].text).toBe("Profit boost");

    // Labelled by what it means, not by a bare "Value" that could be anything.
    expect(screen.getByLabelText(/Extra profit/)).toBeTruthy();
    expect(screen.getByText(/not of the odds/)).toBeTruthy();
  });

  it("re-labels the number when the offer changes", async () => {
    await openForm();

    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: "cashback" },
    });

    expect(screen.getByLabelText(/Refund/)).toBeTruthy();
    expect(screen.queryByLabelText(/Extra profit/)).toBeNull();
    expect(screen.getByText(/percentage of the stake/)).toBeTruthy();
  });

  it("stores a fixed amount typed in dollars as cents", async () => {
    await openForm();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "Cashback offer" },
    });
    fireEvent.change(screen.getByLabelText(/Value is/), {
      target: { value: "fixed" },
    });
    fireEvent.change(screen.getByLabelText(/Extra profit/), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add promo" }));

    await waitFor(() => expect(mocks.createPromo).toHaveBeenCalledTimes(1));
    const input = mocks.createPromo.mock.calls[0][0];
    expect(input.valueType).toBe("fixed");
    expect(input.value).toBe(2500);
  });

  it("stores a percentage as the number that was typed", async () => {
    await openForm();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "Profit boost" },
    });
    fireEvent.change(screen.getByLabelText(/Extra profit/), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add promo" }));

    await waitFor(() => expect(mocks.createPromo).toHaveBeenCalledTimes(1));
    const input = mocks.createPromo.mock.calls[0][0];
    expect(input.valueType).toBe("percent");
    expect(input.value).toBe(30);
  });
});
