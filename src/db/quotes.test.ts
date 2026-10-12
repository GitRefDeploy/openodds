import { beforeEach, describe, expect, it } from "vitest";
import { Repo } from "./repo";
import { migrate, seedDefaults } from "./schema";
import { createMemoryDatabase } from "./memoryDb";
import type { NewBet, NewMarketQuote } from "./types";
import { clvEdge } from "@/domain/clv";
import { ODDS_API_SOURCE } from "@/integrations/theOddsApi";

/**
 * Quote storage against real SQL, the way `grouping.test.ts` covers positions.
 *
 * The point of storing a price as a timestamped observation is that the app can
 * still answer "what did the market show, and when" after the numbers have
 * changed — so the two claims worth protecting are that `observed_at` survives
 * as the moment the price was true (rather than the moment this app wrote it
 * down), and that adopting a quote writes the bet's closing price so the
 * existing CLV maths picks it up with no new code.
 */

async function freshRepo(): Promise<Repo> {
  const db = await createMemoryDatabase();
  await migrate(db);
  await seedDefaults(db);
  return new Repo(db);
}

function bet(bookId: number, overrides: Partial<NewBet> = {}): NewBet {
  return {
    bookId,
    sportId: null,
    description: "Frenzied",
    betType: "single",
    betClass: "normal",
    stakeCents: 10000,
    odds: 1.78,
    clv: null,
    status: "pending",
    returnCents: 0,
    placedAt: "2026-04-10",
    settledAt: null,
    notes: "",
    legs: [],
    promos: [],
    ...overrides,
  };
}

function quote(
  betId: number | null,
  overrides: Partial<NewMarketQuote> = {},
): NewMarketQuote {
  return {
    bet_id: betId,
    source: ODDS_API_SOURCE,
    external_event_id: "abc123",
    sport_key: "aussierules_afl",
    event_name: "Carlton v Richmond",
    market_key: "h2h",
    selection: "Carlton",
    price: 1.85,
    book_key: "sportsbet",
    book_name: "Sportsbet",
    observed_at: "2026-04-10T09:15:00Z",
    ...overrides,
  };
}

describe("recording what the market showed", () => {
  let repo: Repo;
  let bookId: number;
  let betId: number;

  beforeEach(async () => {
    repo = await freshRepo();
    await repo.createBook({ name: "Sportsbet" });
    bookId = (await repo.listBooks())[0].id;
    betId = await repo.createBet(bet(bookId));
  });

  it("keeps when the price was true, not just when it was written down", async () => {
    await repo.recordQuote(quote(betId));

    const [stored] = await repo.quotesForBet(betId);
    expect(stored.observed_at).toBe("2026-04-10T09:15:00Z");
    // Set by the database, and never the same claim as the line above.
    expect(stored.recorded_at).toBeTruthy();
  });

  it("returns the most recent price first", async () => {
    await repo.recordQuote(
      quote(betId, { price: 1.78, observed_at: "2026-04-09T09:00:00Z" }),
    );
    await repo.recordQuote(
      quote(betId, { price: 1.85, observed_at: "2026-04-10T09:15:00Z" }),
    );
    await repo.recordQuote(
      quote(betId, { price: 1.9, observed_at: "2026-04-10T08:00:00Z" }),
    );

    const prices = (await repo.quotesForBet(betId)).map((q) => q.price);
    expect(prices).toEqual([1.85, 1.9, 1.78]);
  });

  it("keeps each bookmaker's price as its own observation", async () => {
    await repo.recordQuote(quote(betId, { book_key: "sportsbet", price: 1.85 }));
    await repo.recordQuote(
      quote(betId, { book_key: "tab", book_name: "TAB", price: 1.8 }),
    );

    const quotes = await repo.quotesForBet(betId);
    expect(quotes.map((q) => q.book_name).sort()).toEqual(["Sportsbet", "TAB"]);
  });

  it("has nothing to show for a bet nobody has priced", async () => {
    expect(await repo.quotesForBet(betId)).toEqual([]);
  });
});

describe("making one observation the closing price", () => {
  let repo: Repo;
  let betId: number;

  beforeEach(async () => {
    repo = await freshRepo();
    await repo.createBook({ name: "Sportsbet" });
    const bookId = (await repo.listBooks())[0].id;
    betId = await repo.createBet(bet(bookId, { odds: 2.1 }));
  });

  it("writes the bet's closing price, so the CLV maths reads it unchanged", async () => {
    const quoteId = await repo.recordQuote(quote(betId, { price: 2.0 }));

    await repo.adoptQuoteAsClosingPrice(quoteId);

    const stored = await repo.getBet(betId);
    expect(stored?.clv).toBe(2.0);
    // The edge every screen already computes, off the stored column.
    expect(clvEdge(stored!.odds, stored!.clv)?.beat).toBe(true);
  });

  it("replaces an earlier closing price rather than accumulating them", async () => {
    const first = await repo.recordQuote(quote(betId, { price: 2.0 }));
    const second = await repo.recordQuote(
      quote(betId, { price: 1.95, observed_at: "2026-04-10T09:30:00Z" }),
    );

    await repo.adoptQuoteAsClosingPrice(first);
    await repo.adoptQuoteAsClosingPrice(second);

    // One column, one figure: the bet still has exactly one closing price.
    expect((await repo.getBet(betId))?.clv).toBe(1.95);
    // And the observation it did not choose is kept as provenance.
    expect(await repo.quotesForBet(betId)).toHaveLength(2);
  });

  it("refuses a quote that belongs to no bet instead of doing nothing", async () => {
    const orphan = await repo.recordQuote(quote(null));

    // Silently succeeding would look like it had recorded something.
    await expect(repo.adoptQuoteAsClosingPrice(orphan)).rejects.toThrow();
  });

  it("refuses a quote that does not exist", async () => {
    await expect(repo.adoptQuoteAsClosingPrice(9999)).rejects.toThrow();
  });
});

describe("what a bet takes with it", () => {
  it("takes its quotes when it is deleted", async () => {
    // Held directly: once the bet is gone there is no bet id left to ask the
    // repo about, so the leftovers have to be looked for in the table.
    const db = await createMemoryDatabase();
    await migrate(db);
    await seedDefaults(db);
    const repo = new Repo(db);
    await repo.createBook({ name: "Sportsbet" });
    const bookId = (await repo.listBooks())[0].id;
    const betId = await repo.createBet(bet(bookId));
    await repo.recordQuote(quote(betId));

    await repo.deleteBet(betId);

    expect(await db.select(`SELECT id FROM market_quotes`)).toEqual([]);
  });
});

describe("accounting for the free allowance", () => {
  let repo: Repo;

  beforeEach(async () => {
    repo = await freshRepo();
  });

  it("starts with nothing spent and no figure from the provider", async () => {
    const usage = await repo.apiUsageThisMonth(ODDS_API_SOURCE);
    expect(usage).toEqual({ calls: 0, credits: 0, remaining: null });
  });

  it("adds up what this month has cost", async () => {
    await repo.recordApiCall({
      source: ODDS_API_SOURCE,
      endpoint: "/sports",
      creditsUsed: 0,
      creditsRemaining: 500,
    });
    await repo.recordApiCall({
      source: ODDS_API_SOURCE,
      endpoint: "/sports/aussierules_afl/events/e1/odds",
      creditsUsed: 1,
      creditsRemaining: 499,
    });

    // The free list is counted as a call but costs nothing, which is the honest
    // distinction: the request happened, the allowance did not move.
    expect(await repo.apiUsageThisMonth(ODDS_API_SOURCE)).toEqual({
      calls: 2,
      credits: 1,
      remaining: 499,
    });
  });

  it("reports the last figure the provider gave, not the lowest", async () => {
    await repo.recordApiCall({
      source: ODDS_API_SOURCE,
      endpoint: "/sports",
      creditsUsed: 1,
      creditsRemaining: 499,
    });
    await repo.recordApiCall({
      source: ODDS_API_SOURCE,
      endpoint: "/sports",
      creditsUsed: 1,
      creditsRemaining: null,
    });

    // A call that reported nothing does not erase what the previous one said.
    expect((await repo.apiUsageThisMonth(ODDS_API_SOURCE)).remaining).toBe(499);
  });

  it("does not count another provider's calls against this one", async () => {
    await repo.recordApiCall({
      source: "formfav",
      endpoint: "/form",
      creditsUsed: 5,
      creditsRemaining: null,
    });

    expect(await repo.apiUsageThisMonth(ODDS_API_SOURCE)).toEqual({
      calls: 0,
      credits: 0,
      remaining: null,
    });
  });

  it("lists the most recent calls first", async () => {
    for (const endpoint of ["/sports", "/events", "/odds"]) {
      await repo.recordApiCall({
        source: ODDS_API_SOURCE,
        endpoint,
        creditsUsed: 1,
        creditsRemaining: 400,
      });
    }

    const recent = await repo.recentApiCalls(ODDS_API_SOURCE);
    expect(recent.map((c) => c.endpoint)).toEqual([
      "/odds",
      "/events",
      "/sports",
    ]);
  });
});
