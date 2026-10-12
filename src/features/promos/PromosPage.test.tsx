// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
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

function appData(): AppData {
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
  };
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

describe("the promo value field", () => {
  it("starts on an odds boost and says the number is a share of the profit", async () => {
    await openForm();

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
