import { describe, expect, it } from "vitest";
import { buildImportPlan, findHeaderRow, inferMapping } from "@/domain/csvImport";
import { parseCsv } from "@/domain/csv";
import { createMemoryDatabase } from "./memoryDb";
import { Repo, type ImportedBet } from "./repo";
import { migrate, seedDefaults } from "./schema";

/**
 * The import path end to end, minus the browser: the real parser, the real
 * repo and real SQLite. What this is here to prove is that importing a
 * statement twice does not double the numbers, because that is the mistake a
 * user actually makes.
 */
async function freshRepo(): Promise<Repo> {
  const db = await createMemoryDatabase();
  await migrate(db);
  await seedDefaults(db);
  return new Repo(db);
}

const STATEMENT = [
  "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
  "10/03/2026,Flemington R3 #4,50.00,2.40,Won,120.00,TAB",
  "11/03/2026,Storm v Broncos,25.00,1.90,Lost,0.00,Sportsbet",
].join("\n");

/** The same route the Import screen takes: parse, map, plan. */
function planFor(text: string, existingRefs?: Set<string>) {
  const table = parseCsv(text);
  const headerIndex = findHeaderRow(table.records);
  const { mapping } = inferMapping(table.records[headerIndex].cells);
  return buildImportPlan({
    records: table.records,
    headerIndex,
    mapping,
    sourceName: "test.csv",
    existingRefs,
  });
}

function recordsFrom(text: string, existingRefs?: Set<string>): ImportedBet[] {
  return planFor(text, existingRefs).bets.map((bet) => ({
    importRef: bet.importRef,
    bookName: bet.bookName,
    sportName: bet.sportName,
    description: bet.description,
    stakeCents: bet.stakeCents,
    odds: bet.odds,
    status: bet.status,
    returnCents: bet.returnCents,
    placedAt: bet.placedAt,
    notes: bet.notes,
  }));
}

describe("importing a statement", () => {
  it("writes the bets the plan described", async () => {
    const repo = await freshRepo();
    const outcome = await repo.importBets(recordsFrom(STATEMENT));

    expect(outcome).toEqual({
      imported: 2,
      skipped: 0,
      createdBooks: ["TAB", "Sportsbet"],
    });

    const bets = await repo.allBets();
    expect(bets).toHaveLength(2);

    const won = bets.find((bet) => bet.description === "Flemington R3 #4");
    expect(won).toMatchObject({
      book_name: "TAB",
      stake_cents: 5000,
      odds: 2.4,
      status: "won",
      return_cents: 12000,
      placed_at: "2026-03-10",
      bet_type: "single",
      bet_class: "normal",
    });
    expect(won?.notes).toContain("Imported from test.csv line 2");
    expect(won?.import_ref).toBeTruthy();

    // The bookmakers did not exist before, so they were created exactly once.
    expect((await repo.listBooks()).map((book) => book.name).sort()).toEqual([
      "Sportsbet",
      "TAB",
    ]);
  });

  it("does not double the bets when the same statement is imported again", async () => {
    const repo = await freshRepo();
    await repo.importBets(recordsFrom(STATEMENT));

    // The screen re-plans against the refs already stored, so the second run
    // is told what is already there; the repo is the second line of defence.
    const second = await repo.importBets(
      recordsFrom(STATEMENT, await repo.listImportRefs()),
    );

    expect(second).toEqual({ imported: 0, skipped: 2, createdBooks: [] });
    expect(await repo.allBets()).toHaveLength(2);
  });

  it("skips a repeat even when the plan was not told about it", async () => {
    // Belt and braces: a plan built from a stale screen must not duplicate.
    const repo = await freshRepo();
    await repo.importBets(recordsFrom(STATEMENT));
    const second = await repo.importBets(recordsFrom(STATEMENT));

    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(2);
    expect(await repo.allBets()).toHaveLength(2);
  });

  it("reuses an existing bookmaker whatever the statement's spelling", async () => {
    const repo = await freshRepo();
    await repo.createBook({ name: "TAB" });

    const outcome = await repo.importBets([
      {
        importRef: "ref-1",
        bookName: "tab",
        description: "Lowercase book",
        stakeCents: 1000,
        odds: 2,
        status: "pending",
        returnCents: 0,
        placedAt: "2026-03-10",
        notes: "",
      },
    ]);

    expect(outcome.createdBooks).toEqual([]);
    expect(await repo.listBooks()).toHaveLength(1);
    const bets = await repo.allBets();
    expect(bets[0].book_name).toBe("TAB");
  });

  it("matches a sport by name, and leaves it blank when it matches nothing", async () => {
    const repo = await freshRepo();
    const sport = (await repo.listSports())[0];

    await repo.importBets([
      {
        importRef: "ref-sport",
        bookName: "TAB",
        sportName: sport.name.toUpperCase(),
        description: "Known sport",
        stakeCents: 1000,
        odds: 2,
        status: "pending",
        returnCents: 0,
        placedAt: "2026-03-10",
        notes: "",
      },
      {
        importRef: "ref-nosport",
        bookName: "TAB",
        sportName: "Calvinball",
        description: "Unknown sport",
        stakeCents: 1000,
        odds: 2,
        status: "pending",
        returnCents: 0,
        placedAt: "2026-03-10",
        notes: "",
      },
    ]);

    const bets = await repo.allBets();
    expect(bets.find((bet) => bet.description === "Known sport")?.sport_id).toBe(
      sport.id,
    );
    expect(
      bets.find((bet) => bet.description === "Unknown sport")?.sport_id,
    ).toBeNull();
  });

  it("leaves bets entered by hand without a fingerprint", async () => {
    const repo = await freshRepo();
    const bookId = await repo.ensureBook("Ladbrokes");
    await repo.createBet({
      bookId,
      sportId: null,
      description: "Typed in by hand",
      betType: "single",
      betClass: "normal",
      stakeCents: 1000,
      odds: 2,
      clv: null,
      status: "pending",
      returnCents: 0,
      placedAt: "2026-03-10",
      settledAt: null,
      notes: "",
      legs: [],
      promos: [],
    });

    expect((await repo.allBets())[0].import_ref).toBeNull();
    expect(await repo.listImportRefs()).toEqual(new Set());
  });

  it("runs the batch as one transaction, so a failure writes nothing", async () => {
    // The adapter's own guarantee, tested where it lives: the packaged adapter
    // has no transaction, which is exactly why the import is idempotent.
    const db = await createMemoryDatabase();
    await migrate(db);
    await seedDefaults(db);

    const { transaction } = db;
    if (!transaction) throw new Error("the memory adapter must support transactions");

    await expect(
      transaction(async () => {
        await db.execute(`INSERT INTO books (name) VALUES ('Half written')`);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await db.select(`SELECT id FROM books`)).toHaveLength(0);
  });
});
