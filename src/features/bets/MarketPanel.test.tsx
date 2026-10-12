// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import type { BetView } from "@/db/types";
import { MarketPanel } from "./MarketPanel";

/**
 * The panel is where the free allowance can actually be spent, so the things
 * worth protecting are the ones with a cost or a claim attached: the two free
 * calls stay free, the paid call is priced on the button before it is pressed,
 * a fetched price is labelled against your own rather than passed off as a
 * closing price, and recording one writes both the observation and the bet's
 * closing price.
 */

const mocks = vi.hoisted(() => ({
  getSecret: vi.fn(),
  recordQuote: vi.fn(),
  adoptQuoteAsClosingPrice: vi.fn(),
  recordApiCall: vi.fn(),
  refresh: vi.fn(),
  onClose: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

vi.mock("@/config/secrets", () => ({
  getSecret: mocks.getSecret,
}));

function betView(overrides: Partial<BetView> = {}): BetView {
  return {
    id: 7,
    book_id: 1,
    sport_id: null,
    event_id: null,
    position_id: null,
    description: "Carlton to win",
    bet_type: "single",
    bet_class: "normal",
    stake_cents: 10000,
    odds: 2.1,
    clv: null,
    status: "pending",
    return_cents: 0,
    placed_at: "2026-04-10",
    settled_at: null,
    notes: "",
    created_at: "2026-04-10",
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

function appData(): AppData {
  return {
    repo: {
      recordQuote: mocks.recordQuote,
      adoptQuoteAsClosingPrice: mocks.adoptQuoteAsClosingPrice,
      recordApiCall: mocks.recordApiCall,
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

const SPORTS = [
  { key: "aussierules_afl", group: "Australian Rules", title: "AFL", active: true },
];

const EVENTS = [
  {
    id: "e1",
    sport_key: "aussierules_afl",
    commence_time: "2026-04-10T09:20:00Z",
    home_team: "Carlton",
    away_team: "Richmond",
  },
];

const ODDS = [
  {
    id: "e1",
    sport_key: "aussierules_afl",
    sport_title: "AFL",
    commence_time: "2026-04-10T09:20:00Z",
    home_team: "Carlton",
    away_team: "Richmond",
    bookmakers: [
      {
        key: "sportsbet",
        title: "Sportsbet",
        markets: [
          {
            key: "h2h",
            last_update: "2026-04-10T09:15:00Z",
            outcomes: [{ name: "Carlton", price: 2.2 }],
          },
        ],
      },
      {
        key: "tab",
        title: "TAB",
        markets: [
          {
            key: "h2h",
            last_update: "2026-04-10T09:14:00Z",
            outcomes: [{ name: "Carlton", price: 1.9 }],
          },
        ],
      },
    ],
  },
];

/** Serve the three endpoints the panel walks through. */
function stubFetch(overrides: { odds?: unknown; status?: number } = {}) {
  const fetchImpl = vi.fn(async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    const body = path.endsWith("/odds")
      ? (overrides.odds ?? ODDS)
      : path.endsWith("/events")
        ? EVENTS
        : SPORTS;
    const status = overrides.status ?? 200;
    return {
      ok: status < 400,
      status,
      headers: {
        get: (name: string) =>
          name === "x-requests-remaining"
            ? "499"
            : name === "x-requests-last"
              ? path.endsWith("/odds")
                ? "1"
                : "0"
              : null,
      },
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

/** Walk the panel to the point where prices are on screen. */
async function loadPrices() {
  fireEvent.click(screen.getByRole("button", { name: "Load sports" }));
  await screen.findByRole("option", { name: "AFL" });
  fireEvent.click(screen.getByRole("button", { name: "Load events" }));
  await screen.findByRole("option", { name: "Carlton v Richmond" });
  fireEvent.click(screen.getByRole("button", { name: /Fetch prices/ }));
  await screen.findByText("Sportsbet");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  mocks.getSecret.mockResolvedValue("a-key");
  mocks.recordQuote.mockResolvedValue(11);
  mocks.adoptQuoteAsClosingPrice.mockResolvedValue(undefined);
  mocks.recordApiCall.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.data = appData();
  stubFetch();
});

describe("without a key", () => {
  it("says so as soon as it opens, before anything is pressed", async () => {
    mocks.getSecret.mockResolvedValue(null);
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    // Telling someone after their first button press has already failed is a
    // worse way to find out.
    expect(await screen.findByText(/Settings → Integrations/)).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("says where to add one and sends nothing", async () => {
    mocks.getSecret.mockResolvedValue(null);
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Load sports" }));

    expect(await screen.findByText(/Settings → Integrations/)).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("what each call costs", () => {
  it("prices the paid call on the button before it is pressed", () => {
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    expect(screen.getByRole("button", { name: /1 credit/ })).toBeTruthy();
  });

  it("records the free lists as free and the odds call as a credit", async () => {
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    await loadPrices();

    const calls = mocks.recordApiCall.mock.calls.map(([call]) => call);
    expect(calls.map((c) => c.endpoint)).toEqual([
      "/sports",
      "/sports/aussierules_afl/events",
      "/sports/aussierules_afl/events/e1/odds",
    ]);
    // The allowance only moves on the last one.
    expect(calls.map((c) => c.creditsUsed)).toEqual([0, 0, 1]);
    expect(calls.at(-1).creditsRemaining).toBe(499);
  });

  it("explains a rejected key in words rather than a status code", async () => {
    vi.unstubAllGlobals();
    stubFetch({ status: 401 });
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Load sports" }));

    expect(
      await screen.findByText(/rejected the key. Check it in Settings/),
    ).toBeTruthy();
  });
});

describe("reading the prices", () => {
  it("shows what each book is offering", async () => {
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    await loadPrices();

    expect(screen.getByText("TAB")).toBeTruthy();
    expect(screen.getByText("1.90")).toBeTruthy();
    expect(screen.getByText("2.20")).toBeTruthy();
  });

  it("compares each price against the one taken, not against a close", async () => {
    // Taken at 2.10. A market that has shortened to 1.90 means your 2.10 was
    // the better side (+10.5%); a market that has drifted to 2.20 means it was
    // the worse one (-4.5%).
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    await loadPrices();

    expect(screen.getByText(/\+10\.5% vs your price/)).toBeTruthy();
    expect(screen.getByText(/-4\.5% vs your price/)).toBeTruthy();
    // And the screen says what these prices are, so a current price is never
    // read as the price at the off.
    expect(screen.getByText(/not the price at the off/)).toBeTruthy();
  });

  it("says nothing came back rather than showing an empty board", async () => {
    vi.unstubAllGlobals();
    stubFetch({ odds: [] });
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Load sports" }));
    await screen.findByRole("option", { name: "AFL" });
    fireEvent.click(screen.getByRole("button", { name: "Load events" }));
    await screen.findByRole("option", { name: "Carlton v Richmond" });
    fireEvent.click(screen.getByRole("button", { name: /Fetch prices/ }));

    expect(
      await screen.findByText(/No prices came back for this event/),
    ).toBeTruthy();
  });
});

describe("recording a price", () => {
  it("writes the observation and the bet's closing price, then closes", async () => {
    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);
    await loadPrices();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Record as closing price" })[0],
    );

    await waitFor(() => expect(mocks.adoptQuoteAsClosingPrice).toHaveBeenCalled());
    expect(mocks.recordQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        bet_id: 7,
        source: "the-odds-api",
        external_event_id: "e1",
        sport_key: "aussierules_afl",
        event_name: "Carlton v Richmond",
        market_key: "h2h",
        selection: "Carlton",
        book_key: "sportsbet",
        book_name: "Sportsbet",
        // The provider's own timestamp, not the moment we wrote it down.
        observed_at: "2026-04-10T09:15:00Z",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.onClose).toHaveBeenCalled();
  });

  it("says so when the write fails, instead of looking like it did nothing", async () => {
    // Precisely how this behaved when the id came back as 0: the panel stayed
    // open with no message, so the only visible symptom was a dead button.
    mocks.recordQuote.mockRejectedValue(new Error("No market quote 0"));

    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);
    await loadPrices();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Record as closing price" })[0],
    );

    expect(
      await screen.findByText(/Could not record that price: No market quote 0/),
    ).toBeTruthy();
    expect(mocks.onClose).not.toHaveBeenCalled();
  });

  it("writes it before making it the closing price", async () => {
    // The order matters: adopting an unwritten quote would have nothing to cite.
    const order: string[] = [];
    mocks.recordQuote.mockImplementation(async () => {
      order.push("quote");
      return 11;
    });
    mocks.adoptQuoteAsClosingPrice.mockImplementation(async () => {
      order.push("adopt");
    });

    render(<MarketPanel bet={betView()} onClose={mocks.onClose} />);
    await loadPrices();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Record as closing price" })[0],
    );

    await waitFor(() => expect(order).toEqual(["quote", "adopt"]));
    expect(mocks.adoptQuoteAsClosingPrice).toHaveBeenCalledWith(11);
  });
});

describe("a book the feed does not carry", () => {
  it("says so instead of quietly omitting its price", async () => {
    render(
      <MarketPanel
        bet={betView({ book_name: "Betstar" })}
        onClose={mocks.onClose}
      />,
    );

    expect(
      screen.getByText(/Betstar is not carried by this feed/),
    ).toBeTruthy();
  });
});
