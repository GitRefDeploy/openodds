import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import {
  buildImportPlan,
  findHeaderRow,
  importRefFor,
  inferMapping,
  parseCsvDate,
  parseCsvMoney,
  parseCsvStatus,
  readCsvDate,
  type ImportPlanInput,
} from "./csvImport";

/**
 * A statement shaped like the real thing: a couple of preamble lines the app
 * has to skip, a thousands separator in a stake, a comma inside a quoted
 * description, and results written as bookmakers write them.
 */
const STATEMENT = [
  "Account: Demo Punter",
  "Period: 01/03/2026 - 31/03/2026",
  "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
  '10/03/2026,Flemington R3 #4,"1,250.00",2.40,Won,3000.00,TAB',
  '11/03/2026,"Storm v Broncos, Under 42.5",50.00,1.90,Lost,0.00,Sportsbet',
  "12/03/2026,Cash out test,100.00,3.00,Cash Out,180.00,Ladbrokes",
].join("\n");

function planOf(text: string, options: Partial<ImportPlanInput> = {}) {
  const table = parseCsv(text);
  const headerIndex = findHeaderRow(table.records);
  const { mapping } = inferMapping(table.records[headerIndex].cells);
  return buildImportPlan({
    records: table.records,
    headerIndex,
    mapping,
    ...options,
  });
}

describe("reading a money cell", () => {
  it("reads currency, separators and negatives the way statements write them", () => {
    expect(parseCsvMoney("50.00")).toBe(5000);
    expect(parseCsvMoney("$1,234.56")).toBe(123456);
    expect(parseCsvMoney("AUD 50.00")).toBe(5000);
    expect(parseCsvMoney("1 234.56")).toBe(123456);
    expect(parseCsvMoney("-50.00")).toBe(-5000);
    expect(parseCsvMoney("-$50")).toBe(-5000);
    expect(parseCsvMoney("(50.00)")).toBe(-5000);
    expect(parseCsvMoney("2500")).toBe(250000);
  });

  it("tells a decimal comma from a thousands comma", () => {
    expect(parseCsvMoney("1,50")).toBe(150);
    expect(parseCsvMoney("1,500")).toBe(150000);
    expect(parseCsvMoney("1.234,56")).toBe(123456);
    expect(parseCsvMoney("1,234,567.89")).toBe(123456789);
  });

  it("returns null for a cell that is not money, rather than zero", () => {
    // Zero and "no value" must not be confused: one is a real stake.
    expect(parseCsvMoney("")).toBeNull();
    expect(parseCsvMoney("   ")).toBeNull();
    expect(parseCsvMoney("-")).toBeNull();
    expect(parseCsvMoney("n/a")).toBeNull();
    expect(parseCsvMoney("nil")).toBeNull();
    expect(parseCsvMoney("abc")).toBeNull();
  });
});

describe("reading a date cell", () => {
  it("reads ISO dates, with or without a time", () => {
    expect(parseCsvDate("2026-03-10")).toBe("2026-03-10");
    expect(parseCsvDate("2026-03-10T14:05:00Z")).toBe("2026-03-10");
    expect(readCsvDate("2026-03-10").ambiguous).toBe(false);
  });

  it("reads day-first dates and flags the ambiguous ones", () => {
    expect(parseCsvDate("10/03/2026")).toBe("2026-03-10");
    // 03/04 could be either; the reader reads it the Australian way and says
    // out loud that it had to choose.
    expect(readCsvDate("03/04/2026")).toEqual({
      iso: "2026-04-03",
      ambiguous: true,
    });
    // Nothing ambiguous about 19/03 — 19 is not a month.
    expect(readCsvDate("19/03/2026")).toEqual({
      iso: "2026-03-19",
      ambiguous: false,
    });
  });

  it("honours a month-first file", () => {
    expect(parseCsvDate("03/04/2026", { dayFirst: false })).toBe("2026-03-04");
  });

  it("reads month names in either order", () => {
    expect(parseCsvDate("10 Mar 2026")).toBe("2026-03-10");
    expect(parseCsvDate("10-Mar-26")).toBe("2026-03-10");
    expect(parseCsvDate("Mar 10, 2026")).toBe("2026-03-10");
    expect(parseCsvDate("11 Sept 2025")).toBe("2025-09-11");
  });

  it("rejects a date that does not exist", () => {
    expect(parseCsvDate("31/02/2026")).toBeNull();
    expect(parseCsvDate("45/13/2026")).toBeNull();
    expect(parseCsvDate("not-a-date")).toBeNull();
    expect(parseCsvDate("")).toBeNull();
  });
});

describe("reading a result cell", () => {
  it("understands the words bookmakers use", () => {
    expect(parseCsvStatus("Won")).toBe("won");
    expect(parseCsvStatus("LOST")).toBe("lost");
    expect(parseCsvStatus("L")).toBe("lost");
    expect(parseCsvStatus("Void (refund)")).toBe("void");
    expect(parseCsvStatus("Cash Out")).toBe("cashout");
    expect(parseCsvStatus("Half Won")).toBe("half_won");
    expect(parseCsvStatus("Dead Heat")).toBe("half_lost");
    expect(parseCsvStatus("Pending")).toBe("pending");
    expect(parseCsvStatus("Won on 12/03")).toBe("won");
  });

  it("refuses to guess when the word says nothing about the outcome", () => {
    // "Settled" only says when, not whether — importing it as pending would
    // silently move every number in the app.
    expect(parseCsvStatus("Settled")).toBeNull();
    expect(parseCsvStatus("Processed")).toBeNull();
    expect(parseCsvStatus("")).toBeNull();
  });
});

describe("recognising the columns", () => {
  it("maps a plain statement header", () => {
    const { mapping, recognised } = inferMapping([
      "Bet Date",
      "Bet Description",
      "Stake",
      "Odds",
      "Result",
      "Payout",
      "Bookmaker",
    ]);
    expect(recognised).toBe(7);
    expect(mapping).toEqual({
      0: "date",
      1: "description",
      2: "stake",
      3: "odds",
      4: "status",
      5: "return",
      6: "bookmaker",
    });
  });

  it("gives each column one role", () => {
    const { mapping } = inferMapping(["Date", "Amount", "Amount Returned"]);
    const roles = Object.values(mapping);
    expect(roles).toContain("date");
    expect(new Set(roles).size).toBe(roles.length);
  });

  it("finds the header below a preamble", () => {
    const table = parseCsv(STATEMENT);
    expect(table.records[0].cells[0]).toBe("Account: Demo Punter");
    expect(findHeaderRow(table.records)).toBe(2);
    expect(table.records[2].cells).toContain("Stake");
  });
});

describe("building the import", () => {
  it("turns a statement into bets", () => {
    const plan = planOf(STATEMENT);

    expect(plan.problems).toEqual([]);
    expect(plan.bets).toHaveLength(3);
    expect(plan.books).toEqual(["TAB", "Sportsbet", "Ladbrokes"]);
    expect(plan.statusSource).toBe("column");

    const [first, second, third] = plan.bets;
    expect(first).toMatchObject({
      line: 4,
      bookName: "TAB",
      description: "Flemington R3 #4",
      stakeCents: 125000,
      odds: 2.4,
      status: "won",
      returnCents: 300000,
      placedAt: "2026-03-10",
    });
    expect(first.notes).toContain("statement line 4");

    // The comma inside the quoted description survived, and a lost bet
    // returns nothing.
    expect(second).toMatchObject({
      description: "Storm v Broncos, Under 42.5",
      stakeCents: 5000,
      status: "lost",
      returnCents: 0,
    });

    // A cashout returns what the statement says, not stake x odds.
    expect(third).toMatchObject({ status: "cashout", returnCents: 18000 });
  });

  it("skips the preamble and says so", () => {
    const plan = planOf(STATEMENT);
    expect(plan.headerLine).toBe(3);
    expect(plan.notes.join(" ")).toContain("preamble");
    expect(plan.notes.join(" ")).toContain("day-first");
  });

  it("reads a month-first file the other way", () => {
    const plan = planOf(STATEMENT, { dayFirst: false });
    expect(plan.bets[0].placedAt).toBe("2026-10-03");
    expect(plan.notes.join(" ")).toContain("month-first");
  });

  it("names every row it will not import, with its line number", () => {
    const text = [
      "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
      "not-a-date,Thing,50,2.00,Won,100.00,TAB",
      "10/03/2026,Thing,abc,2.00,Won,100.00,TAB",
      "10/03/2026,Thing,0,2.00,Won,0.00,TAB",
      "10/03/2026,Thing,-50,2.00,Lost,0.00,TAB",
      "10/03/2026,Thing,50,2.00,Settled,100.00,TAB",
      "10/03/2026,Thing,50,2.00,Won,100.00,",
      "10/03/2026,,50,2.00,Won,100.00,TAB",
    ].join("\n");

    const plan = planOf(text);

    expect(plan.bets).toEqual([]);
    expect(plan.problems.map((p) => [p.line, p.reason])).toEqual([
      [2, '"not-a-date" is not a date I understand'],
      [3, 'Stake "abc" is not a number'],
      [4, "Stake is zero"],
      [5, "Stake is negative (50.00) — a profit-and-loss column is not a stake"],
      [6, 'Result "Settled" is not one I understand — I cannot tell whether this bet won'],
      [7, "No bookmaker on this line"],
      [8, "No description on this line"],
    ]);
  });

  it("derives the result from the payout when there is no result column", () => {
    const text = [
      "Date,Description,Stake,Odds,Payout,Bookmaker",
      "10/03/2026,Won thing,50,2.00,100.00,TAB",
      "11/03/2026,Lost thing,50,2.00,0.00,TAB",
    ].join("\n");

    const plan = planOf(text);
    expect(plan.statusSource).toBe("derived");
    expect(plan.bets.map((b) => b.status)).toEqual(["won", "lost"]);
    expect(plan.bets.map((b) => b.returnCents)).toEqual([10000, 0]);
    expect(plan.notes.join(" ")).toContain("the payout decided it");
  });

  it("works a missing price back from the payout", () => {
    const text = [
      "Date,Description,Stake,Payout,Bookmaker,Result",
      "10/03/2026,No price,50,120.00,TAB,Won",
    ].join("\n");

    const plan = planOf(text);
    expect(plan.bets[0].odds).toBe(2.4);
    expect(plan.notes.join(" ")).toContain("worked back from the payout");
  });

  it("imports as pending, and says so, when the file has no results", () => {
    const text = [
      "Date,Description,Stake,Odds,Bookmaker",
      "10/03/2026,Open bet,50,2.00,TAB",
    ].join("\n");

    const plan = planOf(text);
    expect(plan.statusSource).toBe("none");
    expect(plan.bets[0].status).toBe("pending");
    expect(plan.notes.join(" ")).toContain("imports as pending");
  });

  it("flags a payout that disagrees with stake x odds", () => {
    const text = [
      "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
      "10/03/2026,Odd payout,50,2.00,Won,40.00,TAB",
    ].join("\n");

    const plan = planOf(text);
    expect(plan.bets[0].warnings).toEqual([
      "Statement returned 40.00 where stake × odds gives 100.00",
    ]);
  });

  it("uses the whole-file bookmaker when the file names none", () => {
    const text = [
      "Date,Description,Stake,Odds,Result",
      "10/03/2026,Bare file,50,2.00,Won",
    ].join("\n");

    const plan = planOf(text, { defaultBookName: "TAB" });
    expect(plan.bets[0].bookName).toBe("TAB");
    expect(plan.notes.join(" ")).toContain("every bet is placed with TAB");
  });

  it("names what it cannot do when there is no date column", () => {
    const text = [
      "Description,Stake,Odds,Result",
      "Some bet,50,2.00,Won",
    ].join("\n");

    const plan = planOf(text, { defaultDescription: "Imported bet" });
    expect(plan.bets).toEqual([]);
    expect(plan.problems).toEqual([
      { line: 2, reason: "No date on this line" },
    ]);
    expect(plan.notes.join(" ")).toContain("No date column");
  });
});

describe("import identity", () => {
  it("is the same for the same row, so a re-import cannot double a bet", () => {
    const first = planOf(STATEMENT);
    const refs = new Set(first.bets.map((b) => b.importRef));
    expect(refs.size).toBe(3);

    const again = planOf(STATEMENT, { existingRefs: refs });
    expect(again.bets.map((b) => b.alreadyImported)).toEqual([true, true, true]);
    expect(again.bets.map((b) => b.importRef)).toEqual(
      first.bets.map((b) => b.importRef),
    );
  });

  it("separates rows that are genuinely identical", () => {
    const text = [
      "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
      "10/03/2026,Same again,10,2.00,Won,20.00,TAB",
      "10/03/2026,Same again,10,2.00,Won,20.00,TAB",
    ].join("\n");

    const plan = planOf(text);
    expect(plan.bets).toHaveLength(2);
    expect(plan.bets[0].importRef).not.toBe(plan.bets[1].importRef);
    expect(plan.bets[1].importRef.endsWith("#2")).toBe(true);

    // And a re-import of that same file still lines up.
    const refs = new Set(plan.bets.map((b) => b.importRef));
    expect(planOf(text, { existingRefs: refs }).bets.map((b) => b.alreadyImported)).toEqual([
      true,
      true,
    ]);
  });

  it("ignores a difference that is only whitespace or case", () => {
    const base = {
      bookName: "TAB",
      placedAt: "2026-03-10",
      stakeCents: 5000,
      odds: 2,
      status: "won" as const,
      description: "Same Again",
    };
    expect(importRefFor(base)).toBe(
      importRefFor({ ...base, bookName: "tab", description: "same   again" }),
    );
  });
});
