import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Field,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { getSecret } from "@/config/secrets";
import { clvEdge, formatClvEdge } from "@/domain/clv";
import { formatOdds } from "@/domain/odds";
import {
  ODDS_API_SOURCE,
  OddsApiError,
  createOddsApi,
  matchBookKey,
  requestCost,
  type EventOption,
  type MarketBook,
  type MarketEvent,
  type MarketOutcome,
  type SportOption,
} from "@/integrations/theOddsApi";
import type { BetView } from "@/db/types";

/** The market this revision reads. More markets later; one keeps it honest. */
const MARKETS = ["h2h"] as const;
const REGIONS = ["au"] as const;

/**
 * What the market is showing for one bet, and a way to record it.
 *
 * The prices here are *current* prices, not closing prices: the provider has no
 * closing-line endpoint, and the last price it saw before an event is dropped
 * from its feed about fifteen minutes after the off. So a fetched price is
 * labelled against the price you took — "vs your price" — and only writing it to
 * the bet's closing price is an explicit, separate action, because that number
 * has to mean the price at the off or the CLV figure lies.
 *
 * The two free calls (`/sports`, `/events`) are separate buttons from the one
 * that costs a credit, and the button says what it will cost before you press
 * it.
 */
export function MarketPanel({
  bet,
  onClose,
}: {
  bet: BetView;
  onClose: () => void;
}) {
  const { repo, refresh, oddsFormat } = useAppData();

  const [sports, setSports] = useState<SportOption[] | null>(null);
  const [sportKey, setSportKey] = useState("");
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [markets, setMarkets] = useState<MarketEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);

  const event = events?.find((e) => e.id === eventId) ?? null;
  const cost = requestCost({ markets: MARKETS, regions: REGIONS });

  // Say a key is needed when the panel opens, rather than after the first
  // button press has already failed. Read asynchronously and never held in
  // state, so the key itself never reaches a render.
  useEffect(() => {
    let cancelled = false;
    getSecret(ODDS_API_SOURCE).then((key) => {
      if (!cancelled && !key) setNeedsKey(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Run one call with the key the user stored, and account for what it cost.
   * The key is read here and never held in state, so it cannot end up rendered.
   */
  async function call<T>(
    endpoint: string,
    run: (
      api: ReturnType<typeof createOddsApi>,
    ) => Promise<{ quota: { creditsUsed: number; creditsRemaining: number | null } } & T>,
  ): Promise<T | null> {
    setError(null);
    const key = await getSecret(ODDS_API_SOURCE);
    if (!key) {
      setNeedsKey(true);
      return null;
    }
    setNeedsKey(false);
    try {
      const api = createOddsApi({ apiKey: key });
      const result = await run(api);
      await repo.recordApiCall({
        source: ODDS_API_SOURCE,
        endpoint,
        creditsUsed: result.quota.creditsUsed,
        creditsRemaining: result.quota.creditsRemaining,
      });
      return result;
    } catch (cause) {
      setError(
        cause instanceof OddsApiError
          ? cause.message
          : "Something went wrong talking to The Odds API.",
      );
      return null;
    }
  }

  async function loadSports() {
    setBusy(true);
    const result = await call("/sports", (api) => api.listSports());
    setBusy(false);
    if (!result) return;
    setSports(result.sports);
    if (!sportKey && result.sports.length > 0) {
      // The AFL is the case this was built for, but any active sport will do.
      const preferred =
        result.sports.find((s) => s.key === "aussierules_afl") ??
        result.sports.find((s) => s.active) ??
        result.sports[0];
      setSportKey(preferred.key);
    }
  }

  async function loadEvents() {
    if (!sportKey) return;
    setBusy(true);
    const result = await call(`/sports/${sportKey}/events`, (api) =>
      api.listEvents(sportKey),
    );
    setBusy(false);
    if (!result) return;
    setEvents(result.events);
    setEventId(result.events[0]?.id ?? "");
    setMarkets(null);
  }

  async function loadPrices() {
    if (!sportKey || !eventId) return;
    setBusy(true);
    const result = await call(
      `/sports/${sportKey}/events/${eventId}/odds`,
      (api) =>
        api.eventOdds({
          sportKey,
          eventId,
          markets: MARKETS,
          regions: REGIONS,
        }),
    );
    setBusy(false);
    if (!result) return;
    setMarkets(result.events);
  }

  /** One price, whichever book offered it. */
  interface PricedOffer {
    book: MarketBook;
    marketKey: string;
    outcome: MarketOutcome;
  }

  /**
   * The fetched prices as an odds board: one row per selection, each book's
   * price along it. Grouped this way because that is the question being asked —
   * what is this selection paying, and where.
   */
  const board = useMemo(() => {
    const bySelection = new Map<string, PricedOffer[]>();
    for (const marketEvent of markets ?? []) {
      for (const book of marketEvent.books) {
        for (const market of book.markets) {
          for (const outcome of market.outcomes) {
            const offers = bySelection.get(outcome.name) ?? [];
            offers.push({ book, marketKey: market.key, outcome });
            bySelection.set(outcome.name, offers);
          }
        }
      }
    }
    const betBookKey = matchBookKey(bet.book_name);
    return [...bySelection.entries()].map(([selection, offers]) => ({
      selection,
      offers: [...offers].sort((a, b) => {
        // The book you actually used leads, since it is the comparison that
        // matters; then the better price.
        const aYours = a.book.key === betBookKey ? 1 : 0;
        const bYours = b.book.key === betBookKey ? 1 : 0;
        return bYours - aYours || b.outcome.price - a.outcome.price;
      }),
    }));
  }, [markets, bet.book_name]);

  async function recordAsClosingPrice(offer: PricedOffer) {
    if (!event) return;
    setSaving(true);
    setError(null);
    try {
      const quoteId = await repo.recordQuote({
        bet_id: bet.id,
        source: ODDS_API_SOURCE,
        external_event_id: event.id,
        sport_key: sportKey,
        event_name: event.name,
        market_key: offer.marketKey,
        selection: offer.outcome.name,
        price: offer.outcome.price,
        book_key: offer.book.key,
        book_name: offer.book.title,
        // When the provider last saw the price, which is not when we wrote it
        // down. The fallback is honest about the difference rather than hiding
        // it.
        observed_at: observedAt(offer),
      });
      await repo.adoptQuoteAsClosingPrice(quoteId);
      await refresh();
      onClose();
    } catch (cause) {
      // A write that fails has to say so. Left uncaught, the panel simply stays
      // open and the button looks like it did nothing — which is precisely how
      // this shipped the first time, and cost a round of live debugging.
      setError(
        cause instanceof Error
          ? `Could not record that price: ${cause.message}`
          : "Could not record that price.",
      );
    } finally {
      setSaving(false);
    }
  }

  function observedAt(offer: PricedOffer): string {
    const stamped = markets
      ?.flatMap((m) => m.books)
      .find((b) => b.key === offer.book.key)
      ?.markets.find((m) => m.key === offer.marketKey)?.lastUpdate;
    return stamped ?? new Date().toISOString();
  }

  const betBookKey = matchBookKey(bet.book_name);

  return (
    <Modal open wide title="Market prices" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            Your price{" "}
            <span className="text-ink tabular-nums">
              {formatOdds(bet.odds, oddsFormat)}
            </span>
          </span>
          <span className="text-faint">·</span>
          <span>{bet.description || "—"}</span>
          {betBookKey ? null : (
            <>
              <span className="text-faint">·</span>
              <span className="text-warning">
                {bet.book_name} is not carried by this feed, so its price cannot
                be compared.
              </span>
            </>
          )}
        </div>

        {needsKey ? (
          <p className="rounded-lg border border-line bg-raised p-3 text-sm text-muted">
            Add your The Odds API key under{" "}
            <span className="text-ink">Settings → Integrations</span> first. The
            free tier covers 500 requests a month, and nothing is sent anywhere
            but that one provider.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-negative/40 bg-negative-soft p-3 text-sm text-negative">
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field
            label="Sport"
            hint={
              sports
                ? undefined
                : "Loading the sport list costs nothing — it is a free call."
            }
          >
            <div className="flex gap-2">
              <Select
                value={sportKey}
                onChange={(e) => {
                  setSportKey(e.target.value);
                  setEvents(null);
                  setMarkets(null);
                }}
                disabled={!sports}
              >
                {!sports ? <option value="">Not loaded yet</option> : null}
                {(sports ?? []).map((sport) => (
                  <option key={sport.key} value={sport.key}>
                    {sport.title}
                  </option>
                ))}
              </Select>
              <Button variant="default" size="sm" onClick={loadSports} disabled={busy}>
                Load sports
              </Button>
            </div>
          </Field>

          <Field
            label="Event"
            hint={
              events
                ? `${events.length} upcoming`
                : "Events are a free call too."
            }
          >
            <div className="flex gap-2">
              <Select
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  setMarkets(null);
                }}
                disabled={!events || events.length === 0}
              >
                {!events ? <option value="">Load a sport first</option> : null}
                {events?.length === 0 ? (
                  <option value="">No upcoming events</option>
                ) : null}
                {(events ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
              <Button
                variant="default"
                size="sm"
                onClick={loadEvents}
                disabled={busy || !sportKey}
              >
                Load events
              </Button>
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-xs text-faint">
            Prices are what the books are showing now, not the price at the off.
          </p>
          <Button
            variant="primary"
            onClick={loadPrices}
            disabled={busy || !sportKey || !eventId || saving}
          >
            {busy ? "Fetching…" : `Fetch prices — ${cost} credit`}
          </Button>
        </div>

        {markets && board.length === 0 ? (
          <p className="text-sm text-faint">
            No prices came back for this event yet.
          </p>
        ) : null}

        {board.map(({ selection, offers }) => (
          <div key={selection} className="rounded-lg border border-line">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-sm font-medium text-ink">{selection}</span>
              {offers.some((o) => o.book.key === betBookKey) ? (
                <Badge tone="info">{bet.book_name} price available</Badge>
              ) : null}
            </div>
            <ul className="divide-y divide-line">
              {offers.map((offer) => {
                const edge = clvEdge(bet.odds, offer.outcome.price);
                return (
                  <li
                    key={`${offer.book.key}-${offer.marketKey}-${offer.outcome.name}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate text-muted">
                      {offer.book.title}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-ink">
                        {formatOdds(offer.outcome.price, oddsFormat)}
                      </span>
                      {edge ? (
                        <span
                          className={
                            edge.beat
                              ? "text-xs text-positive"
                              : "text-xs text-negative"
                          }
                          title="Your price against the market right now"
                        >
                          {formatClvEdge(edge.edge)} vs your price
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => recordAsClosingPrice(offer)}
                      >
                        Record as closing price
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
