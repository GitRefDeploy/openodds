/**
 * The preview fixture: a realistic history, for reviewing the dense screens.
 *
 * Run it by loading the dev server with `?seed` on the app URL — see
 * `src/main.tsx`. It writes through the app's **own** `Repo`, migrations and
 * browser adapter, so the rows it creates are the rows the app would have
 * created: the only thing shared by this file and the app is `src/db`, which
 * means a schema change cannot leave a fixture behind describing the old one.
 * (The end-to-end suite makes the same argument for driving the real import
 * screen rather than writing SQL — this is the version of it that can run in a
 * browser.) It lives under `src/` rather than in a script directory so that
 * `npm run typecheck` covers it: it is written against the same `NewBet`,
 * `BetStatus` and `TransactionType` the app writes, and a fixture that has
 * quietly stopped compiling is a fixture describing yesterday's app.
 *
 * It exists because every screen reviewed up to now was a zero state. A Bets
 * table with rows in it, a closing-line edge inline beside a price, a two-leg
 * position and a cumulative profit curve cannot be judged from an empty one.
 *
 * It clears the tables it owns before writing, so running it twice gives the
 * same history rather than two of them. That is not hypothetical: an earlier
 * version appended, and an interrupted second run left four bets duplicated at
 * the oldest end of the table — which read, on the Bets screen, as four bets
 * that had been recorded twice. A fixture that can silently become wrong is
 * worse than no fixture, because everything reviewed against it is suspect.
 *
 * Kept honest by deriving rather than restating: settlement comes from
 * `computeReturnCents` and the class traits, so a bonus bet here pays what the
 * app's own rule says a bonus bet pays.
 */
import { openDatabase, Repo } from "@/db";
import { migrate, seedDefaults } from "@/db/schema";
import { traitsFor, type BetClass } from "@/domain/betClass";
import type { TransactionType } from "@/domain/bankroll";
import { computeReturnCents, type BetStatus } from "@/domain/pnl";
import { BOOK_PRESETS } from "@/domain/taxonomy";

/**
 * The tables this fixture owns. Bookmakers and sports are left alone: the app
 * seeds those itself and Settings refers to them by id.
 */
const OWNED_TABLES = [
  "bet_promos",
  "bet_legs",
  "bets",
  "promos",
  "transactions",
] as const;

/** Reproducible, so two runs describe the same history. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260310);

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(random() * list.length)];
}

function between(low: number, high: number): number {
  return low + Math.floor(random() * (high - low + 1));
}

/** A day in March and April 2026, as a date the app stores. */
function date(dayOffset: number): string {
  const d = new Date(Date.UTC(2026, 2, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

/** Real-shaped events, so the table reads like a statement rather than "Bet 1". */
type Event = readonly [description: string, sportSlug: string];

const RACING: readonly Event[] = [
  ["Flemington R3 #4", "thoroughbred"],
  ["Flemington R5 #1", "thoroughbred"],
  ["Randwick R7 #9", "thoroughbred"],
  ["Morphettville R2 #6", "thoroughbred"],
  ["Melton R4 #2", "harness"],
  ["Menangle R6 #8", "harness"],
  ["Sandown Park R1 #3", "greyhound"],
  ["The Meadows R8 #7", "greyhound"],
];

const TEAM: readonly Event[] = [
  ["Brisbane v Melbourne", "afl"],
  ["Geelong v Carlton", "afl"],
  ["Panthers v Broncos", "nrl"],
  ["Storm v Roosters", "nrl"],
  ["Arsenal v Chelsea", "soccer"],
  ["Melbourne City v Sydney FC", "soccer"],
  ["Australia v India, 2nd ODI", "cricket"],
  ["Heat v Sixers", "cricket"],
  ["Djokovic v Alcaraz", "tennis"],
  ["Tatum points over 26.5", "basketball"],
  ["Chiefs v Bills", "american_football"],
];

/** A deliberately varied spread of classes, so every badge on a screen appears. */
const CLASSES: readonly BetClass[] = [
  "normal",
  "normal",
  "normal",
  "normal",
  "normal",
  "normal",
  "positive_ev",
  "sharp_money",
  "odds_boost",
  "no_sweat",
  "qualifying",
  "low_hold",
  "future",
  "bonus_bet",
  "bonus_bet",
  "site_credit",
];

const STATUSES: readonly BetStatus[] = [
  "won",
  "won",
  "won",
  "lost",
  "lost",
  "lost",
  "void",
  "cashout",
  "half_won",
  "half_lost",
  "pending",
  "pending",
];

/** Cash movements, from the far past to today. */
const MOVEMENTS: readonly (readonly [TransactionType, number, number])[] = [
  ["deposit", 500000, -30],
  ["deposit", 250000, -14],
  ["withdrawal", 180000, -4],
  ["adjustment", -4500, 0],
];

/** What the fixture put in the database, for whoever ran it to check. */
export interface SeedReport {
  books: number;
  sports: number;
  promos: number;
  bets: number;
  settled: number;
  promoFunded: number;
  positionId: number | null;
  transactions: number;
}

export async function seedPreview(
  log: (line: string) => void = (line) => console.info(line),
): Promise<SeedReport> {
  const db = await openDatabase();
  await migrate(db);
  await seedDefaults(db);
  const repo = new Repo(db);

  for (const table of OWNED_TABLES) await db.execute(`DELETE FROM ${table}`);
  log("Opened the database, ran migrations, cleared the fixture's own tables.");

  // Past the setup wizard, because every screen this fixture exists to fill sits
  // behind it. The wizard writes exactly this key and value itself (see
  // `SetupWizard`), so `?seed` lands on the dashboard rather than on step one of
  // three. Settings it does not need are left as they are: the theme is a way of
  // looking at this history, not part of it.
  await repo.setSetting("setupComplete", "true");

  // The app ships these names and Settings offers them as presets, so a typo
  // here would create a second "Sportsbet" rather than fail.
  for (const name of BOOK_PRESETS) await repo.ensureBook(name, "AUD");
  const books = await repo.listBooks();
  const bookId = (name: string): number => {
    const found = books.find((b) => b.name === name)?.id;
    if (found === undefined) throw new Error(`No bookmaker ${name}`);
    return found;
  };

  const sports = await repo.listSports(true);
  const sportId = (slug: string): number | null =>
    sports.find((s) => s.slug === slug)?.id ?? null;
  log(`Bookmakers ${books.length}, active sports ${sports.length}.`);

  await repo.createPromo({
    name: "30% profit boost",
    type: "profit_boost",
    valueType: "percent",
    value: 30,
    minOdds: 2,
    bookId: bookId("Sportsbet"),
    notes: "Weekend racing boost.",
  });
  await repo.createPromo({
    name: "Deposit match $100",
    type: "deposit_match",
    valueType: "percent",
    value: 100,
    bookId: bookId("TAB"),
    notes: "New account offer.",
  });
  const promos = await repo.listPromos();
  log(`Promos ${promos.length}.`);

  /**
   * What the app's own rules would pay for this settlement. Asked rather than
   * restated: a free stake is never returned, so a $25 bonus bet at 2.40 makes
   * $35 rather than $60, and getting that wrong here would make the fixture
   * disagree with the screen it is meant to show.
   */
  const settle = (
    betClass: BetClass,
    status: BetStatus,
    stakeCents: number,
    odds: number,
  ): number =>
    computeReturnCents({
      stakeCents,
      decimalOdds: odds,
      status,
      stakeReturned: traitsFor(betClass).stakeReturned,
      // A cashout is the one settlement the app cannot derive: it is whatever
      // the bookmaker actually paid, so the fixture has to state it.
      returnCents: Math.round(stakeCents * 0.72),
    });

  const ids: number[] = [];
  let placed = 0;

  for (let i = 0; i < 26; i++) {
    const [description, slug] = pick(random() < 0.45 ? RACING : TEAM);
    const betClass = CLASSES[i % CLASSES.length];
    const status = STATUSES[(i * 5) % STATUSES.length];
    const stakeCents = between(1, 12) * 2500;
    const odds = Number((1.55 + random() * 2.9).toFixed(2));
    const settled = status !== "pending";
    // A closing price on most settled bets, so the table's inline edge appears
    // on some rows and not others — which is the case worth looking at.
    const clv =
      settled && random() < 0.7
        ? Number(
            (odds + (random() < 0.5 ? -0.12 : 0.18) * random()).toFixed(2),
          )
        : null;

    ids.push(
      await repo.createBet({
        bookId: bookId(pick(BOOK_PRESETS)),
        sportId: sportId(slug),
        description,
        betType: "single",
        betClass,
        clv,
        stakeCents,
        odds,
        status,
        returnCents: settled ? settle(betClass, status, stakeCents, odds) : 0,
        placedAt: date(placed),
        settledAt: settled ? date(placed + between(0, 2)) : null,
        notes: "",
        legs: [],
        promos:
          i === 3
            ? [{ promoId: promos[0].id, appliedValueCents: between(4, 20) * 250 }]
            : [],
      }),
    );
    placed += between(0, 2);
  }
  log(`Bets ${ids.length}.`);

  // Two multis, so the "Multi" format and its leg count appear.
  await repo.createBet({
    bookId: bookId("Sportsbet"),
    sportId: sportId("afl"),
    description: "4-leg multi",
    betType: "multi",
    betClass: "normal",
    clv: null,
    stakeCents: 5000,
    odds: 6.4,
    status: "won",
    returnCents: settle("normal", "won", 5000, 6.4),
    placedAt: date(placed),
    settledAt: date(placed + 2),
    notes: "",
    legs: [
      { selection: "Brisbane", market: "Head to head", odds: 1.85 },
      { selection: "Geelong", market: "Head to head", odds: 2.1 },
      { selection: "Over 168.5", market: "Total points", odds: 1.9 },
      { selection: "Brisbane -12.5", market: "Line", odds: 1.92 },
    ],
    promos: [],
  });
  await repo.createBet({
    bookId: bookId("Neds"),
    sportId: sportId("nrl"),
    description: "Same game multi",
    betType: "same_game_multi",
    betClass: "normal",
    clv: 3.1,
    stakeCents: 2500,
    odds: 3.25,
    status: "pending",
    returnCents: 0,
    placedAt: date(placed),
    settledAt: null,
    notes: "",
    legs: [
      { selection: "Panthers", market: "Head to head", odds: 1.7 },
      { selection: "Cleary anytime try", market: "Try scorer", odds: 1.91 },
    ],
    promos: [],
  });
  log("Two multis with legs.");

  // A genuine two-leg arbitrage, grouped as one position, so the Stats screen has
  // something to report a locked margin for.
  const arbOne = await repo.createBet({
    bookId: bookId("Betfair Exchange"),
    sportId: sportId("nrl"),
    description: "Arb leg — Storm to win",
    betType: "single",
    betClass: "arbitrage",
    clv: null,
    stakeCents: 20000,
    odds: 2.35,
    status: "won",
    returnCents: settle("arbitrage", "won", 20000, 2.35),
    placedAt: date(placed - 3),
    settledAt: date(placed),
    notes: "",
    legs: [],
    promos: [],
  });
  const arbTwo = await repo.createBet({
    bookId: bookId("Ladbrokes"),
    sportId: sportId("nrl"),
    description: "Arb leg — Roosters to win",
    betType: "single",
    betClass: "arbitrage",
    clv: null,
    stakeCents: 20000,
    odds: 2.05,
    status: "lost",
    returnCents: 0,
    placedAt: date(placed - 3),
    settledAt: date(placed),
    notes: "",
    legs: [],
    promos: [],
  });
  const positionId = await repo.groupBetsAsPosition([arbOne, arbTwo]);
  log(
    positionId === null
      ? "Position NOT created."
      : `Position #${positionId} grouped from two arb legs.`,
  );

  for (const [type, amountCents, offset] of MOVEMENTS) {
    await repo.createTransaction({
      bookId: bookId("Sportsbet"),
      type,
      amountCents,
      occurredAt: date(42 + offset),
      notes: "",
    });
  }

  const bets = await repo.allBets();
  const transactions = await repo.allTransactions();
  const report: SeedReport = {
    books: books.length,
    sports: sports.length,
    promos: promos.length,
    bets: bets.length,
    settled: bets.filter((b) => b.status !== "pending").length,
    promoFunded: bets.filter((b) => b.promo_value_cents > 0).length,
    positionId,
    transactions: transactions.length,
  };
  log(
    `Done. ${report.bets} bets (${report.settled} settled), ` +
      `${report.promoFunded} carrying promo value, ` +
      `${report.transactions} transactions.`,
  );
  return report;
}
