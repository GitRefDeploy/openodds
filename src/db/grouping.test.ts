import { beforeEach, describe, expect, it } from "vitest";
import { Repo } from "./repo";
import { migrate, seedDefaults } from "./schema";
import { createMemoryDatabase } from "./memoryDb";
import type { NewBet } from "./types";
import {
  enrichAll,
  marginByPosition,
  positionsFrom,
  statsFor,
} from "@/features/analytics/selectors";

/**
 * The grouping feature end to end, minus the browser: real SQL, the real repo
 * and the same selectors the Bets and Stats pages call. This is what would have
 * caught the position key being written but never read back.
 */
async function freshRepo(): Promise<Repo> {
  const db = await createMemoryDatabase();
  await migrate(db);
  await seedDefaults(db);
  return new Repo(db);
}

async function firstBookId(repo: Repo): Promise<number> {
  await repo.createBook({ name: "Sportsbet" });
  const books = await repo.listBooks();
  return books[0].id;
}

function bet(bookId: number, overrides: Partial<NewBet> = {}): NewBet {
  return {
    bookId,
    sportId: null,
    description: "Test bet",
    betType: "single",
    betClass: "normal",
    stakeCents: 1000,
    odds: 2,
    clv: null,
    status: "pending",
    returnCents: 0,
    placedAt: "2026-01-01",
    settledAt: null,
    notes: "",
    legs: [],
    promos: [],
    ...overrides,
  };
}

describe("grouping bets into a position", () => {
  let repo: Repo;
  let bookId: number;

  beforeEach(async () => {
    repo = await freshRepo();
    bookId = await firstBookId(repo);
  });

  it("links the legs under one key and reports the margin they lock in", async () => {
    const a = await repo.createBet(
      bet(bookId, { description: "Leg A", stakeCents: 6962, odds: 1.61 }),
    );
    const b = await repo.createBet(
      bet(bookId, { description: "Leg B", stakeCents: 4066, odds: 2.75 }),
    );

    const positionId = await repo.groupBetsAsPosition([a, b]);
    expect(positionId).not.toBeNull();

    const stored = await repo.allBets();
    expect(stored.map((r) => r.position_id)).toEqual([positionId, positionId]);

    const enriched = enrichAll(stored);
    const positions = positionsFrom(enriched);
    expect(positions).toHaveLength(1);
    expect(positions[0].legs).toHaveLength(2);
    expect(positions[0].cashStakedCents).toBe(11028);
    // 69.62 * 1.61 = 112.09 and 40.66 * 2.75 = 111.82, so 111.82 is guaranteed.
    expect(positions[0].guaranteedPayoutCents).toBe(11182);
    expect(positions[0].marginPercent).toBeCloseTo(1.378, 2);

    // The Bets page reads the same number back for each leg's badge.
    const margins = marginByPosition(enriched);
    expect(margins.get(positionId as number)).toBeCloseTo(1.378, 2);
  });

  it("refuses to make a position out of a single bet", async () => {
    const a = await repo.createBet(bet(bookId, { description: "Lonely" }));

    expect(await repo.groupBetsAsPosition([a])).toBeNull();

    const stored = await repo.allBets();
    expect(stored[0].position_id).toBeNull();
    expect(positionsFrom(enrichAll(stored))).toEqual([]);
  });

  it("numbers separate positions apart", async () => {
    const a = await repo.createBet(bet(bookId, { description: "A" }));
    const b = await repo.createBet(bet(bookId, { description: "B" }));
    const c = await repo.createBet(bet(bookId, { description: "C" }));
    const d = await repo.createBet(bet(bookId, { description: "D" }));

    const first = await repo.groupBetsAsPosition([a, b]);
    const second = await repo.groupBetsAsPosition([c, d]);

    expect(first).not.toBe(second);
    expect(positionsFrom(enrichAll(await repo.allBets()))).toHaveLength(2);
  });

  it("breaks up a position without touching the bets themselves", async () => {
    const a = await repo.createBet(bet(bookId, { description: "Leg A" }));
    const b = await repo.createBet(bet(bookId, { description: "Leg B" }));
    const positionId = await repo.groupBetsAsPosition([a, b]);

    await repo.clearPosition(positionId as number);

    const stored = await repo.allBets();
    expect(stored).toHaveLength(2);
    expect(stored.map((r) => r.position_id)).toEqual([null, null]);
    expect(positionsFrom(enrichAll(stored))).toEqual([]);
  });

  it("keeps a free stake out of the amount at risk, through the whole stack", async () => {
    await repo.createBet(
      bet(bookId, {
        description: "Cash",
        stakeCents: 5000,
        odds: 2,
        status: "won",
      }),
    );
    await repo.createBet(
      bet(bookId, {
        description: "$25 bonus bet",
        betClass: "bonus_bet",
        stakeCents: 2500,
        odds: 2.4,
        status: "won",
      }),
    );

    const enriched = enrichAll(await repo.allBets());
    const bonus = enriched.find((b) => b.bet_class === "bonus_bet");
    expect(bonus).toBeDefined();
    expect(bonus?.cashStakeCents).toBe(0);
    // A $25 bonus bet at 2.40 pays $35 — the stake is never handed back.
    expect(bonus?.potentialPayoutCents).toBe(3500);
    expect(bonus?.profitCents).toBe(3500);

    // Turnover counts the $50 of cash only, never the notional bonus stake.
    const stats = statsFor(enriched);
    expect(stats.totalStakedCents).toBe(5000);
    // $50 profit from the cash bet plus $35 from the bonus bet.
    expect(stats.totalProfitCents).toBe(8500);
    expect(stats.roi).toBeCloseTo(1.7, 4);
  });
});
