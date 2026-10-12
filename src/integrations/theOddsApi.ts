/**
 * The Odds API client (v4).
 *
 * Two things shape this file. The first is the free allowance: `/sports` and
 * `/events` cost nothing, while an odds request costs **markets × regions**, so
 * a caller can always work out the price of a button before pressing it. The
 * second is that the key belongs to the user, so it is passed in rather than
 * fetched from storage here. That keeps the key out of every component, and
 * makes the parsing rules testable without a network.
 *
 * The provider offers no closing price. What it returns is a price as of
 * `last_update`, which is a current price, and it is treated as one.
 */

export const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
/** Also the name the key is stored under in the OS keychain. */
export const ODDS_API_SOURCE = "the-odds-api";

export type OddsApiErrorKind =
  | "auth"
  | "bad-request"
  | "quota"
  | "rate-limited"
  | "server"
  | "network";

/** An error already phrased for a person, tagged with what to do about it. */
export class OddsApiError extends Error {
  readonly kind: OddsApiErrorKind;

  /**
   * `cause` is kept for debugging, and is why a wrapped network failure does
   * not have to repeat the URL it was made on: that URL carries the API key.
   */
  constructor(kind: OddsApiErrorKind, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OddsApiError";
    this.kind = kind;
  }
}

/**
 * What one odds request costs, in credits.
 *
 * Markets × regions, per the provider's own arithmetic. When a `bookmakers`
 * filter is used instead of regions, every ten bookmakers counts as one region,
 * which is why the AU bookmaker group costs a single credit.
 */
export function requestCost({
  markets,
  regions,
}: {
  markets: readonly string[];
  regions: readonly string[];
}): number {
  if (markets.length === 0 || regions.length === 0) {
    throw new Error("An odds request needs at least one market and one region");
  }
  return markets.length * regions.length;
}

export interface Quota {
  /** What this request just cost, from `x-requests-last`. */
  creditsUsed: number;
  /** What the account has left, from `x-requests-remaining`. */
  creditsRemaining: number | null;
}

/** Read the allowance headers, tolerating their absence. */
export function quotaFromHeaders(headers: {
  get(name: string): string | null;
}): Quota {
  const read = (name: string): number | null => {
    const value = headers.get(name);
    if (value === null || value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    creditsUsed: read("x-requests-last") ?? 0,
    creditsRemaining: read("x-requests-remaining"),
  };
}

export interface SportOption {
  key: string;
  group: string;
  title: string;
  active: boolean;
}

export interface EventOption {
  id: string;
  sportKey: string;
  commenceTime: string;
  /** "Home v Away", the way the event is titled in the list. */
  name: string;
  homeTeam: string;
  awayTeam: string;
}

export interface MarketOutcome {
  name: string;
  price: number;
  point?: number;
}

export interface MarketBook {
  key: string;
  title: string;
  markets: {
    key: string;
    lastUpdate: string | null;
    outcomes: MarketOutcome[];
  }[];
}

export interface MarketEvent {
  id: string;
  sportKey: string;
  sportTitle: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  books: MarketBook[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Read a payload into the shapes the app uses.
 *
 * Deliberately permissive about what it drops: a bookmaker with no markets and
 * a market with no priced outcomes are both normal in a response (a suspended
 * market is removed after about fifteen minutes), and a list containing one
 * unusable book is not a reason to discard the event.
 */
export function parseOddsPayload(raw: unknown): MarketEvent[] {
  const list = Array.isArray(raw) ? raw : raw === null ? [] : [raw];
  const events: MarketEvent[] = [];

  for (const entry of list) {
    const event = asRecord(entry);
    if (!event) continue;
    const id = asString(event.id);
    if (!id) continue;

    const books: MarketBook[] = [];
    for (const rawBook of Array.isArray(event.bookmakers) ? event.bookmakers : []) {
      const book = asRecord(rawBook);
      const key = asString(book?.key);
      if (!book || !key) continue;

      const markets = [];
      for (const rawMarket of Array.isArray(book.markets) ? book.markets : []) {
        const market = asRecord(rawMarket);
        const marketKey = asString(market?.key);
        if (!market || !marketKey) continue;

        const outcomes: MarketOutcome[] = [];
        for (const rawOutcome of Array.isArray(market.outcomes)
          ? market.outcomes
          : []) {
          const outcome = asRecord(rawOutcome);
          const price = outcome?.price;
          const name = asString(outcome?.name);
          // A price that is not a real price is not a price.
          if (!outcome || !name || typeof price !== "number") continue;
          if (!Number.isFinite(price) || price <= 1) continue;
          outcomes.push({
            name,
            price,
            ...(typeof outcome.point === "number"
              ? { point: outcome.point }
              : {}),
          });
        }
        if (outcomes.length === 0) continue;

        markets.push({
          key: marketKey,
          lastUpdate: market.last_update ? asString(market.last_update) : null,
          outcomes,
        });
      }

      if (markets.length === 0) continue;
      books.push({ key, title: asString(book.title, key), markets });
    }

    events.push({
      id,
      sportKey: asString(event.sport_key),
      sportTitle: asString(event.sport_title),
      commenceTime: asString(event.commence_time),
      homeTeam: asString(event.home_team),
      awayTeam: asString(event.away_team),
      books,
    });
  }

  return events;
}

/** The sports list is an array of flat objects rather than events. */
export function parseSportsPayload(raw: unknown): SportOption[] {
  const list = Array.isArray(raw) ? raw : [];
  const sports: SportOption[] = [];
  for (const entry of list) {
    const sport = asRecord(entry);
    const key = asString(sport?.key);
    if (!sport || !key) continue;
    sports.push({
      key,
      group: asString(sport.group),
      title: asString(sport.title, key),
      active: sport.active === true,
    });
  }
  return sports;
}

export function parseEventsPayload(raw: unknown): EventOption[] {
  const list = Array.isArray(raw) ? raw : [];
  const events: EventOption[] = [];
  for (const entry of list) {
    const event = asRecord(entry);
    const id = asString(event?.id);
    if (!event || !id) continue;
    const homeTeam = asString(event.home_team);
    const awayTeam = asString(event.away_team);
    events.push({
      id,
      sportKey: asString(event.sport_key),
      commenceTime: asString(event.commence_time),
      name: [homeTeam, awayTeam].filter(Boolean).join(" v "),
      homeTeam,
      awayTeam,
    });
  }
  return events;
}

/**
 * The bookmaker key the provider uses for a book the user named themselves.
 *
 * The names come from the user ("TAB", "Betfair", "Sportsbet") and the keys
 * come from the provider (`tab`, `betfair_ex_au`, `sportsbet`), so this is a
 * translation table rather than string equality. Null when there is no known
 * counterpart, which is the honest answer for a book the feed does not carry.
 */
const AU_BOOK_KEYS: Record<string, string> = {
  sportsbet: "sportsbet",
  tab: "tab",
  tabtouch: "tabtouch",
  pointsbet: "pointsbetau",
  neds: "neds",
  ladbrokes: "ladbrokes_au",
  betfair: "betfair_ex_au",
  betfairexchange: "betfair_ex_au",
  unibet: "unibet",
  betr: "betr_au",
  playup: "playup",
  dabble: "dabble_au",
  betright: "betright",
  bet365: "bet365_au",
};

export function matchBookKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const normalised = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return AU_BOOK_KEYS[normalised] ?? null;
}

/** What a request cost, read from the URL the failure came back on. */
function endpointOf(url: string): string {
  try {
    const path = new URL(url).pathname.replace(`${new URL(ODDS_API_BASE).pathname}`, "");
    return path || "/";
  } catch {
    return url;
  }
}

function messageFromBody(body: string): string | null {
  try {
    const parsed = asRecord(JSON.parse(body));
    const message = parsed ? asString(parsed.message) : "";
    return message || null;
  } catch {
    return null;
  }
}

/** Turn a status code into something worth reading, and say what to do. */
export function oddsApiError(status: number, body: string): OddsApiError {
  const detail = messageFromBody(body);
  switch (status) {
    case 401:
    case 403:
      return new OddsApiError(
        "auth",
        "The Odds API rejected the key. Check it in Settings — it is the key from your own account.",
      );
    case 422:
      return new OddsApiError(
        "bad-request",
        detail ?? "The Odds API did not recognise that sport or market.",
      );
    case 429:
      return new OddsApiError(
        "quota",
        "The monthly allowance for this key is used up. It resets on the first of the month.",
      );
    default:
      return status >= 500
        ? new OddsApiError(
            "server",
            detail ?? "The Odds API is having trouble. Try again shortly.",
          )
        : new OddsApiError(
            "bad-request",
            detail ?? `The Odds API returned ${status}.`,
          );
  }
}

export interface OddsApi {
  listSports(): Promise<{ sports: SportOption[]; quota: Quota }>;
  listEvents(
    sportKey: string,
  ): Promise<{ events: EventOption[]; quota: Quota }>;
  eventOdds(params: {
    sportKey: string;
    eventId: string;
    markets?: readonly string[];
    regions?: readonly string[];
  }): Promise<{ events: MarketEvent[]; quota: Quota; endpoint: string }>;
}

/**
 * The client. The key is required, so there is no state in which this exists
 * without one and falls back to reading a secret itself.
 */
export function createOddsApi({
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 12_000,
}: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): OddsApi {
  if (!apiKey.trim()) {
    throw new OddsApiError("auth", "No The Odds API key has been set.");
  }

  async function get(
    path: string,
    params: Record<string, string> = {},
  ): Promise<{ json: unknown; quota: Quota; endpoint: string }> {
    const url = new URL(`${ODDS_API_BASE}${path}`);
    url.searchParams.set("apiKey", apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        // A price is only useful if it is current.
        cache: "no-store",
      });
    } catch (cause) {
      // The URL is not in the message: it carries the key. It is kept as the
      // cause instead, where a bug report can still find it.
      throw new OddsApiError(
        "network",
        `Could not reach The Odds API (${endpointOf(url.toString())}). Check your connection.`,
        cause,
      );
    }

    const quota = quotaFromHeaders(response.headers);
    const body = await response.text();
    if (!response.ok) throw oddsApiError(response.status, body);

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new OddsApiError("server", "The Odds API returned a response this app could not read.");
    }
    return { json, quota, endpoint: endpointOf(url.toString()) };
  }

  return {
    async listSports() {
      const { json, quota } = await get("/sports");
      return { sports: parseSportsPayload(json), quota };
    },

    async listEvents(sportKey) {
      const { json, quota } = await get(`/sports/${sportKey}/events`, {
        dateFormat: "iso",
      });
      return { events: parseEventsPayload(json), quota };
    },

    async eventOdds({
      sportKey,
      eventId,
      markets = ["h2h"],
      regions = ["au"],
    }) {
      const { json, quota, endpoint } = await get(
        `/sports/${sportKey}/events/${eventId}/odds`,
        {
          regions: regions.join(","),
          markets: markets.join(","),
          oddsFormat: "decimal",
          dateFormat: "iso",
        },
      );
      return { events: parseOddsPayload(json), quota, endpoint };
    },
  };
}
