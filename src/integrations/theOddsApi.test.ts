import { describe, expect, it, vi } from "vitest";
import {
  createOddsApi,
  matchBookKey,
  OddsApiError,
  oddsApiError,
  parseEventsPayload,
  parseOddsPayload,
  parseSportsPayload,
  quotaFromHeaders,
  requestCost,
} from "./theOddsApi";

/**
 * The cost of a request has to be knowable before the button is pressed, and a
 * payload has to be read defensively, because the provider drops markets as
 * they close. Both are decided entirely in these functions, so they are tested
 * here rather than through the screen that uses them.
 *
 * One rule gets its own test: the key must never appear in an error message.
 * The messages are shown in the UI and end up in bug reports.
 */

function headers(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return { get: (name: string) => map.get(name) ?? null };
}

function jsonResponse(body: unknown, entries: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: headers(entries),
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("what a request costs", () => {
  it("is one credit per market per region", () => {
    expect(requestCost({ markets: ["h2h"], regions: ["au"] })).toBe(1);
    expect(requestCost({ markets: ["h2h", "spreads", "totals"], regions: ["au"] })).toBe(3);
    expect(requestCost({ markets: ["h2h"], regions: ["au", "uk", "us"] })).toBe(3);
    expect(requestCost({ markets: ["h2h", "spreads", "totals"], regions: ["au", "uk", "us"] })).toBe(9);
  });

  it("refuses to guess when half the request is missing", () => {
    // Zero here would let the UI promise a free request it cannot make.
    expect(() => requestCost({ markets: [], regions: ["au"] })).toThrow();
    expect(() => requestCost({ markets: ["h2h"], regions: [] })).toThrow();
  });
});

describe("the allowance headers", () => {
  it("reads what the provider reported", () => {
    const quota = quotaFromHeaders(
      headers({
        "x-requests-remaining": "487",
        "x-requests-used": "13",
        "x-requests-last": "1",
      }),
    );
    expect(quota).toEqual({ creditsUsed: 1, creditsRemaining: 487 });
  });

  it("reports no figure rather than zero when a header is absent", () => {
    // Zero would read as "allowance gone", which is a different claim.
    const quota = quotaFromHeaders(headers({}));
    expect(quota.creditsRemaining).toBeNull();
    expect(quota.creditsUsed).toBe(0);
  });

  it("ignores a header it cannot read as a number", () => {
    const quota = quotaFromHeaders(headers({ "x-requests-remaining": "n/a" }));
    expect(quota.creditsRemaining).toBeNull();
  });
});

describe("reading an odds payload", () => {
  const payload = [
    {
      id: "abc123",
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
              outcomes: [
                { name: "Carlton", price: 1.78 },
                { name: "Richmond", price: 2.1 },
              ],
            },
          ],
        },
        // A book with no markets is normal in a live response.
        { key: "tab", title: "TAB", markets: [] },
        // A market with no priced outcomes is normal too: it has been suspended.
        {
          key: "neds",
          title: "Neds",
          markets: [{ key: "h2h", last_update: null, outcomes: [] }],
        },
      ],
    },
  ];

  it("keeps the events, books and prices it can read", () => {
    const [event] = parseOddsPayload(payload);

    expect(event.id).toBe("abc123");
    expect(event.sportKey).toBe("aussierules_afl");
    expect(event.homeTeam).toBe("Carlton");
    expect(event.books).toHaveLength(1);
    expect(event.books[0].key).toBe("sportsbet");
    expect(event.books[0].markets[0].outcomes).toEqual([
      { name: "Carlton", price: 1.78 },
      { name: "Richmond", price: 2.1 },
    ]);
    expect(event.books[0].markets[0].lastUpdate).toBe("2026-04-10T09:15:00Z");
  });

  it("drops books and markets with nothing priced in them", () => {
    const [event] = parseOddsPayload(payload);

    expect(event.books.map((b) => b.key)).toEqual(["sportsbet"]);
  });

  it("will not treat something that is not a price as one", () => {
    const [event] = parseOddsPayload([
      {
        id: "x",
        bookmakers: [
          {
            key: "tab",
            title: "TAB",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Good", price: 2.5 },
                  { name: "Zero", price: 0 },
                  { name: "One", price: 1 },
                  { name: "Missing", price: null },
                  { name: "String", price: "2.5" },
                  { price: 3 },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(event.books[0].markets[0].outcomes).toEqual([
      { name: "Good", price: 2.5 },
    ]);
  });

  it("keeps a handicap point where the market has one", () => {
    const [event] = parseOddsPayload([
      {
        id: "x",
        bookmakers: [
          {
            key: "tab",
            title: "TAB",
            markets: [
              {
                key: "spreads",
                outcomes: [{ name: "Carlton", price: 1.9, point: -6.5 }],
              },
            ],
          },
        ],
      },
    ]);

    expect(event.books[0].markets[0].outcomes[0].point).toBe(-6.5);
  });

  it("accepts a single event as readily as a list", () => {
    expect(parseOddsPayload({ id: "solo" })).toHaveLength(1);
  });

  it("drops an entry with no id, since a quote could never be linked to it", () => {
    expect(parseOddsPayload([{ sport_key: "afl" }, null, "nonsense"])).toEqual([]);
  });

  it("reads nothing into a payload that is not there", () => {
    expect(parseOddsPayload(null)).toEqual([]);
    expect(parseOddsPayload(undefined)).toEqual([]);
  });
});

describe("reading the sports and events lists", () => {
  it("reads the sports the provider says it carries", () => {
    const sports = parseSportsPayload([
      { key: "aussierules_afl", group: "Australian Rules", title: "AFL", active: true },
      { key: "soccer_aus_aleague", group: "Soccer", title: "A-League", active: false },
      { group: "No key" },
    ]);

    expect(sports).toEqual([
      { key: "aussierules_afl", group: "Australian Rules", title: "AFL", active: true },
      { key: "soccer_aus_aleague", group: "Soccer", title: "A-League", active: false },
    ]);
  });

  it("titles an event the way it will be listed", () => {
    const events = parseEventsPayload([
      {
        id: "e1",
        sport_key: "aussierules_afl",
        commence_time: "2026-04-10T09:20:00Z",
        home_team: "Carlton",
        away_team: "Richmond",
      },
    ]);

    expect(events[0].name).toBe("Carlton v Richmond");
    expect(events[0].commenceTime).toBe("2026-04-10T09:20:00Z");
  });
});

describe("matching a book the user named to the provider's key", () => {
  it("translates the names people actually type", () => {
    expect(matchBookKey("Sportsbet")).toBe("sportsbet");
    expect(matchBookKey("TAB")).toBe("tab");
    expect(matchBookKey("PointsBet")).toBe("pointsbetau");
    expect(matchBookKey("Betfair Exchange")).toBe("betfair_ex_au");
    expect(matchBookKey("ladbrokes")).toBe("ladbrokes_au");
  });

  it("says so rather than guessing at a book the feed does not carry", () => {
    // Null is the honest answer: there is no price to compare with.
    expect(matchBookKey("Betstar")).toBeNull();
    expect(matchBookKey("")).toBeNull();
    expect(matchBookKey(null)).toBeNull();
  });
});

describe("turning a status code into something worth reading", () => {
  it("tells the difference between a bad key and a spent allowance", () => {
    expect(oddsApiError(401, "").kind).toBe("auth");
    expect(oddsApiError(403, "").kind).toBe("auth");
    expect(oddsApiError(429, "").kind).toBe("quota");
    expect(oddsApiError(500, "").kind).toBe("server");
    expect(oddsApiError(400, "").kind).toBe("bad-request");
  });

  it("passes on what the provider said when it explained itself", () => {
    const error = oddsApiError(422, JSON.stringify({ message: "Unknown sport" }));
    expect(error.message).toContain("Unknown sport");
  });

  it("does not choke on a body that is not JSON", () => {
    expect(oddsApiError(500, "<html>oops</html>").kind).toBe("server");
  });
});

describe("the client", () => {
  const KEY = "test-key-do-not-leak";

  it("refuses to exist without a key", () => {
    expect(() => createOddsApi({ apiKey: "   " })).toThrow(OddsApiError);
  });

  it("asks for AU prices in decimal and reads the answer", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL) =>
      jsonResponse(
        [
          {
            id: "e1",
            sport_key: "aussierules_afl",
            commence_time: "2026-04-10T09:20:00Z",
            bookmakers: [
              {
                key: "sportsbet",
                title: "Sportsbet",
                markets: [
                  {
                    key: "h2h",
                    last_update: "2026-04-10T09:15:00Z",
                    outcomes: [{ name: "Carlton", price: 1.78 }],
                  },
                ],
              },
            ],
          },
        ],
        { "x-requests-remaining": "499", "x-requests-last": "1" },
      ),
    );

    const api = createOddsApi({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await api.eventOdds({
      sportKey: "aussierules_afl",
      eventId: "e1",
    });

    const called = new URL(fetchImpl.mock.calls[0][0]);
    expect(called.pathname).toBe("/v4/sports/aussierules_afl/events/e1/odds");
    expect(called.searchParams.get("regions")).toBe("au");
    expect(called.searchParams.get("markets")).toBe("h2h");
    expect(called.searchParams.get("oddsFormat")).toBe("decimal");
    expect(called.searchParams.get("apiKey")).toBe(KEY);

    expect(result.events[0].books[0].markets[0].outcomes[0].price).toBe(1.78);
    expect(result.quota).toEqual({ creditsUsed: 1, creditsRemaining: 499 });
    expect(result.endpoint).toBe("/sports/aussierules_afl/events/e1/odds");
  });

  it("does not spend credits on the free lists", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL) =>
      jsonResponse([], { "x-requests-last": "0", "x-requests-remaining": "500" }),
    );
    const api = createOddsApi({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch });

    const sports = await api.listSports();
    const events = await api.listEvents("aussierules_afl");

    // The provider charges nothing for these, so the ledger must record zero.
    expect(sports.quota.creditsUsed).toBe(0);
    expect(events.quota.creditsUsed).toBe(0);
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe("/v4/sports");
    expect(new URL(fetchImpl.mock.calls[1][0]).pathname).toBe(
      "/v4/sports/aussierules_afl/events",
    );
  });

  it("raises a bad key as an auth error, without repeating the key", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      headers: headers({}),
      text: async () => JSON.stringify({ message: "Invalid apiKey" }),
    })) as unknown as typeof fetch;

    const api = createOddsApi({ apiKey: KEY, fetchImpl });
    await expect(api.listSports()).rejects.toMatchObject({ kind: "auth" });
    await expect(api.listSports()).rejects.not.toThrow(KEY);
  });

  it("says the allowance is used up rather than that the request was wrong", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 429,
      headers: headers({ "x-requests-remaining": "0" }),
      text: async () => "quota exceeded",
    })) as unknown as typeof fetch;

    const api = createOddsApi({ apiKey: KEY, fetchImpl });
    await expect(api.listEvents("aussierules_afl")).rejects.toMatchObject({
      kind: "quota",
    });
  });

  it("reports a dropped connection as a network problem, not as a bad key", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const api = createOddsApi({ apiKey: KEY, fetchImpl });
    const failure = api.listSports();
    await expect(failure).rejects.toMatchObject({ kind: "network" });
    // The URL carries the key, so it must not be in the message.
    await expect(failure).rejects.not.toThrow(KEY);
  });

  it("will not pretend to understand a response it cannot parse", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: headers({}),
      text: async () => "not json",
    })) as unknown as typeof fetch;

    const api = createOddsApi({ apiKey: KEY, fetchImpl });
    await expect(api.listSports()).rejects.toMatchObject({ kind: "server" });
  });
});
