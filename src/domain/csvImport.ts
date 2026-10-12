import type { CsvRecord } from "./csv";
import { parseOdds } from "./odds";
import { computeReturnCents, type BetStatus } from "./pnl";

/**
 * Turning a bookmaker's CSV statement into bets.
 *
 * Everything here is pure: the same records, mapping and options always produce
 * the same plan. That is deliberate — the numbers leave this module as the
 * user's actual betting record, so the decisions (which column is the stake,
 * how a date is read, what "Settled" means) have to be inspectable and
 * testable rather than hidden inside a screen.
 *
 * The other half of that is refusing to guess silently. A row that cannot be
 * read becomes a named problem with its line number, never a dropped row: an
 * importer that quietly skips rows is worse than no importer, because the
 * totals it leaves behind look correct.
 */

/** What a column in the file is being used as. */
export type ColumnRole =
  | "ignore"
  | "date"
  | "description"
  | "stake"
  | "odds"
  | "return"
  | "status"
  | "bookmaker"
  | "sport"
  | "notes";

export const COLUMN_ROLES: readonly ColumnRole[] = [
  "ignore",
  "date",
  "description",
  "stake",
  "odds",
  "return",
  "status",
  "bookmaker",
  "sport",
  "notes",
];

export const COLUMN_ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: "Ignore",
  date: "Date",
  description: "Description",
  stake: "Stake",
  odds: "Odds",
  return: "Return / payout",
  status: "Result",
  bookmaker: "Bookmaker",
  sport: "Sport",
  notes: "Notes",
};

/**
 * Header wording, per role. These are the words Australian bookmakers actually
 * put in their exports; the app never asks the user to rename columns by hand if
 * it can recognise them.
 */
const ROLE_SYNONYMS: Record<Exclude<ColumnRole, "ignore">, readonly string[]> = {
  date: [
    "date",
    "betdate",
    "placed",
    "placedat",
    "placeddate",
    "betplaced",
    "timestamp",
    "datetime",
    "transactiondate",
    "settleddate",
    "settlementdate",
    "day",
  ],
  description: [
    "description",
    "betdescription",
    "details",
    "betdetails",
    "summary",
    "event",
    "eventname",
    "selection",
    "selectionname",
    "runner",
    "market",
    "marketname",
    "bettype",
    "bet",
    "name",
    "match",
  ],
  stake: [
    "stake",
    "totalstake",
    "betamount",
    "amount",
    "amountbet",
    "wager",
    "risk",
    "riskamount",
    "outlay",
    "invested",
    "turnover",
    "toback",
  ],
  odds: ["odds", "price", "betodds", "decimalodds", "pricedisplay", "startingprice", "sp", "brsp"],
  return: [
    "return",
    "returns",
    "returnamount",
    "payout",
    "paid",
    "winnings",
    "winamount",
    "collect",
    "collected",
    "credit",
    "resultamount",
  ],
  status: ["status", "result", "betresult", "resultstatus", "outcome", "settlement", "wonlost"],
  bookmaker: ["book", "bookmaker", "bookie", "account", "operator", "site", "platform", "brand"],
  sport: ["sport", "sportname", "category", "code"],
  notes: ["notes", "note", "comment", "comments", "reference", "ref", "betid", "betref"],
};

/** Column assignment: column index -> the role it plays. */
export type ColumnMapping = Record<number, ColumnRole>;

/**
 * Lowercase and strip anything that is not a letter or digit, so " Bet Date "
 * and "bet_date" both become "betdate" and a synonym can be written once.
 */
export function normaliseHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreRoleForHeader(header: string, role: ColumnRole): number {
  if (role === "ignore") return 0;
  const key = normaliseHeader(header);
  if (!key) return 0;
  let best = 0;
  for (const synonym of ROLE_SYNONYMS[role]) {
    if (key === synonym) best = Math.max(best, 3);
    else if (key.startsWith(synonym) || key.endsWith(synonym)) best = Math.max(best, 2);
    else if (key.includes(synonym)) best = Math.max(best, 1);
  }
  return best;
}

export interface MappingGuess {
  mapping: ColumnMapping;
  /** How many roles were recognised, which is how a header row is chosen. */
  recognised: number;
}

/**
 * Guess the columns, best-score-first and taking each column for one role only.
 *
 * Greedy rather than optimal on purpose: with headers as loose as real
 * statements, a wrong-but-explained guess the user can correct in one dropdown
 * beats a clever one they cannot see.
 */
export function inferMapping(header: readonly string[]): MappingGuess {
  const candidates: { role: ColumnRole; column: number; score: number }[] = [];
  for (let column = 0; column < header.length; column++) {
    for (const role of COLUMN_ROLES) {
      const score = scoreRoleForHeader(header[column] ?? "", role);
      if (score > 0) candidates.push({ role, column, score });
    }
  }

  candidates.sort(
    (a, b) => b.score - a.score || a.column - b.column || a.role.localeCompare(b.role),
  );

  const mapping: ColumnMapping = {};
  const takenRoles = new Set<ColumnRole>();
  const takenColumns = new Set<number>();
  for (const candidate of candidates) {
    if (takenRoles.has(candidate.role) || takenColumns.has(candidate.column)) continue;
    takenRoles.add(candidate.role);
    takenColumns.add(candidate.column);
    mapping[candidate.column] = candidate.role;
  }

  for (let column = 0; column < header.length; column++) {
    if (mapping[column] === undefined) mapping[column] = "ignore";
  }

  return { mapping, recognised: takenRoles.size };
}

/**
 * Find the header row.
 *
 * Statements often open with a few lines about the account and the period
 * covered ("Account: ...", "From 01/03 to 31/03") before the real header, so
 * assuming line one is the header would map nothing.
 */
export function findHeaderRow(records: readonly CsvRecord[], limit = 10): number {
  let best = 0;
  let bestScore = 0;
  for (let index = 0; index < Math.min(records.length, limit); index++) {
    const cells = records[index].cells;
    if (cells.length < 2) continue;
    const { recognised } = inferMapping(cells);
    if (recognised > bestScore) {
      bestScore = recognised;
      best = index;
    }
  }
  return best;
}

/** A data row with the role it plays, collapsed to one line. */
function cellReader(
  record: CsvRecord,
  columns: Partial<Record<ColumnRole, number>>,
): (role: ColumnRole) => string {
  return (role: ColumnRole) => {
    const column = columns[role];
    if (column === undefined) return "";
    return (record.cells[column] ?? "").replace(/\s+/g, " ").trim();
  };
}

const CURRENCY_WORDS = /[a-zA-Z]{3}/g;
const CURRENCY_SYMBOLS = /[$€£¥₹]/g;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * A thousands separator or a decimal point?
 *
 * Both "," and "." are used for both, sometimes in the same file. The rule that
 * holds up: groups of exactly three digits after a separator are thousands
 * ("1,234"), and a statement writing cents always writes two ("1,50" is 1.50).
 */
function looksLikeThousandsSeparator(value: string, separator: string): boolean {
  const parts = value.split(separator);
  if (parts.length < 2) return false;
  if (parts.length > 2) return true;
  return parts[1].length === 3 && parts[0].length > 0;
}

/**
 * Parse a money cell into integer cents, or null when it is not a number.
 *
 * Null rather than 0: "no value" and "zero" mean different things here, and
 * conflating them would import a $0 stake instead of flagging the row.
 */
export function parseCsvMoney(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let value = raw.trim();
  if (!value) return null;
  // Accounting writes a negative in parentheses.
  let sign = 1;
  if (value.startsWith("(") && value.endsWith(")")) {
    sign = -1;
    value = value.slice(1, -1);
  }
  value = value
    .replace(CURRENCY_SYMBOLS, "")
    .replace(CURRENCY_WORDS, "")
    .replace(/[\s\u00a0']/g, "");
  if (value.startsWith("-")) {
    sign = -1;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  value = value.replace(/[+-]/g, "");
  if (!value || value === "." || value === ",") return null;

  const hasDot = value.includes(".");
  const hasComma = value.includes(",");
  let normalised: string;
  if (hasDot && hasComma) {
    // Whichever comes last is the decimal separator.
    normalised =
      value.lastIndexOf(",") > value.lastIndexOf(".")
        ? value.replace(/\./g, "").replace(/,/g, ".")
        : value.replace(/,/g, "");
  } else if (hasComma) {
    normalised = looksLikeThousandsSeparator(value, ",")
      ? value.replace(/,/g, "")
      : value.replace(",", ".");
  } else if (hasDot) {
    normalised = looksLikeThousandsSeparator(value, ".")
      ? value.replace(/\./g, "")
      : value;
  } else {
    normalised = value;
  }

  const amount = Number(normalised);
  if (!Number.isFinite(amount)) return null;
  return sign * Math.round(amount * 100);
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function expandYear(year: number): number {
  if (year >= 100) return year;
  // Statements are recent history; 26 is 2026, 84 is 1984.
  return year <= 68 ? 2000 + year : 1900 + year;
}

/** Build an ISO date, rejecting impossible days like 31 February. */
function isoOf(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export interface CsvDateReading {
  /** ISO `YYYY-MM-DD`, or null when the cell is not a date. */
  iso: string | null;
  /**
   * True when the day and month could have been read either way — 03/04/2026
   * is 3 April here and 4 March in the US, and only the file's owner can say
   * which is meant.
   */
  ambiguous: boolean;
}

const DATE_FORMATS = [
  /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/,
  /^(\d{1,2})[\s./-]+([A-Za-z]{3,})[\s.,/-]+(\d{2,4})/,
  /^([A-Za-z]{3,})[\s.,/-]+(\d{1,2})(?:st|nd|rd|th)?[\s,/-]+(\d{2,4})/,
  /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/,
];

export function readCsvDate(
  raw: string | null | undefined,
  options: { dayFirst?: boolean } = {},
): CsvDateReading {
  const dayFirst = options.dayFirst ?? true;
  const value = (raw ?? "").trim();
  if (!value) return { iso: null, ambiguous: false };

  const isoMatch = DATE_FORMATS[0].exec(value);
  if (isoMatch) {
    return { iso: isoOf(+isoMatch[1], +isoMatch[2], +isoMatch[3]), ambiguous: false };
  }

  const dayMonthName = DATE_FORMATS[1].exec(value);
  if (dayMonthName) {
    const month =
      MONTHS[dayMonthName[2].slice(0, 4).toLowerCase()] ??
      MONTHS[dayMonthName[2].slice(0, 3).toLowerCase()];
    if (month) {
      return {
        iso: isoOf(expandYear(+dayMonthName[3]), month, +dayMonthName[1]),
        ambiguous: false,
      };
    }
  }

  const monthNameDay = DATE_FORMATS[2].exec(value);
  if (monthNameDay) {
    const month =
      MONTHS[monthNameDay[1].slice(0, 4).toLowerCase()] ??
      MONTHS[monthNameDay[1].slice(0, 3).toLowerCase()];
    if (month) {
      return {
        iso: isoOf(expandYear(+monthNameDay[3]), month, +monthNameDay[2]),
        ambiguous: false,
      };
    }
  }

  const numeric = DATE_FORMATS[3].exec(value);
  if (numeric) {
    const first = +numeric[1];
    const second = +numeric[2];
    const year = expandYear(+numeric[3]);
    if (numeric[1].length === 4) {
      return { iso: isoOf(first, second, +numeric[3]), ambiguous: false };
    }
    // A component that cannot be a month settles it; 19/03 is unambiguous.
    if (first > 12 && second <= 12) {
      return { iso: isoOf(year, second, first), ambiguous: false };
    }
    if (second > 12 && first <= 12) {
      return { iso: isoOf(year, first, second), ambiguous: false };
    }
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    return { iso: isoOf(year, month, day), ambiguous: true };
  }

  return { iso: null, ambiguous: false };
}

export function parseCsvDate(
  raw: string | null | undefined,
  options: { dayFirst?: boolean } = {},
): string | null {
  return readCsvDate(raw, options).iso;
}

const STATUS_WORDS: Record<string, BetStatus> = {
  won: "won",
  win: "won",
  w: "won",
  winning: "won",
  collected: "won",
  paid: "won",
  lost: "lost",
  loss: "lost",
  l: "lost",
  lose: "lost",
  losing: "lost",
  unpaid: "lost",
  void: "void",
  voided: "void",
  push: "void",
  refund: "void",
  refunded: "void",
  cancelled: "void",
  canceled: "void",
  abandoned: "void",
  cashout: "cashout",
  cashedout: "cashout",
  cashed: "cashout",
  halfwon: "half_won",
  halfwin: "half_won",
  halflost: "half_lost",
  halfloss: "half_lost",
  deadheat: "half_lost",
  pending: "pending",
  open: "pending",
  unsettled: "pending",
  placed: "pending",
  active: "pending",
  notsettled: "pending",
};

/** Read a result cell, or null when the word is not one this app understands. */
export function parseCsvStatus(raw: string | null | undefined): BetStatus | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;
  const key = value.replace(/[^a-z0-9]/g, "");
  // "Won on 12/03" and similar: try the whole cell first, then its first word.
  if (STATUS_WORDS[key]) return STATUS_WORDS[key];
  const words = value.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length > 1) {
    const joined = words.join("");
    if (STATUS_WORDS[joined]) return STATUS_WORDS[joined];
    if (STATUS_WORDS[words[0]]) return STATUS_WORDS[words[0]];
    const twoWords = `${words[0]}${words[1]}`;
    if (STATUS_WORDS[twoWords]) return STATUS_WORDS[twoWords];
  }
  return null;
}

/**
 * A stable fingerprint for one imported row.
 *
 * Re-importing the same statement — the single most likely mistake — must not
 * double every bet, so the bets table carries this and refuses a repeat. It is
 * built from the bet's own contents rather than the file, because a
 * re-downloaded statement is a different file name and the same rows.
 *
 * `occurrence` disambiguates rows that are genuinely identical (two $10 bets on
 * the same selection on the same day): the first stays as-is and the second is
 * suffixed, so a repeat import still lines up row for row.
 */
export function importRefFor(
  bet: {
    bookName: string;
    placedAt: string;
    stakeCents: number;
    odds: number;
    status: BetStatus;
    description: string;
  },
  occurrence = 1,
): string {
  const description = bet.description.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
  const base = [
    normaliseHeader(bet.bookName),
    bet.placedAt,
    bet.stakeCents,
    bet.odds.toFixed(4),
    bet.status,
    description,
  ].join("|");
  return occurrence > 1 ? `${base}#${occurrence}` : base;
}

export interface PlannedBet {
  /** Line in the source file, so the UI can point at the row. */
  line: number;
  importRef: string;
  alreadyImported: boolean;
  bookName: string;
  sportName: string | null;
  description: string;
  stakeCents: number;
  odds: number;
  status: BetStatus;
  returnCents: number;
  placedAt: string;
  notes: string;
  /** Things worth knowing about this row that did not stop it importing. */
  warnings: string[];
}

export interface ImportProblem {
  line: number;
  reason: string;
}

export interface ImportPlan {
  bets: PlannedBet[];
  problems: ImportProblem[];
  /** Distinct bookmakers named by the file, in the order they appear. */
  books: string[];
  /** Whether a result column was found, and whether results were derived. */
  statusSource: "column" | "derived" | "none";
  notes: string[];
  header: string[];
  headerLine: number;
  columns: Partial<Record<ColumnRole, number>>;
  ambiguousDates: boolean;
}

export interface ImportPlanInput {
  records: readonly CsvRecord[];
  headerIndex: number;
  mapping: Readonly<ColumnMapping>;
  /** Read 03/04 as 3 April (Australia) or 4 March (US). Default day-first. */
  dayFirst?: boolean;
  /** Used when the file names no bookmaker, or a row leaves it blank. */
  defaultBookName?: string | null;
  /** Used when the file has no description column. */
  defaultDescription?: string;
  /** Fingerprints already in the database. */
  existingRefs?: ReadonlySet<string>;
  /** Shown in each imported bet's notes, so the source is never lost. */
  sourceName?: string;
}

/**
 * Build the whole import: what will be created, and every row that will not be
 * and why.
 */
export function buildImportPlan(input: ImportPlanInput): ImportPlan {
  const { records, headerIndex, mapping } = input;
  const dayFirst = input.dayFirst ?? true;

  const columns: Partial<Record<ColumnRole, number>> = {};
  for (const [column, role] of Object.entries(mapping)) {
    if (role === "ignore") continue;
    if (columns[role] === undefined) columns[role] = Number(column);
  }

  const headerRecord = records[headerIndex];
  const header = headerRecord ? headerRecord.cells : [];
  const notes: string[] = [];
  const problems: ImportProblem[] = [];
  const bets: PlannedBet[] = [];
  const books: string[] = [];
  const existing = input.existingRefs ?? new Set<string>();
  const occurrences = new Map<string, number>();

  let ambiguousDates = false;
  let derivedStatuses = 0;
  let derivedOdds = 0;

  if (headerIndex > 0) {
    notes.push(
      `${headerIndex} line${headerIndex === 1 ? "" : "s"} above the header were treated as a preamble and ignored.`,
    );
  }
  if (columns.date === undefined) {
    notes.push("No date column was recognised, so no row could be read.");
  }
  if (columns.description === undefined) {
    notes.push(
      input.defaultDescription
        ? `No description column, so every bet is described as "${input.defaultDescription}".`
        : "No description column was recognised; choose one, or bets will have no description.",
    );
  }
  if (columns.bookmaker === undefined && input.defaultBookName) {
    notes.push(`No bookmaker column, so every bet is placed with ${input.defaultBookName}.`);
  }

  const rows = records.slice(headerIndex + 1);

  for (const record of rows) {
    const cell = cellReader(record, columns);
    const line = record.line;

    // A row of nothing but empty cells is padding, not data.
    if (record.cells.every((value) => value.trim() === "")) continue;

    const dateReading = readCsvDate(cell("date"), { dayFirst });
    if (dateReading.ambiguous) ambiguousDates = true;
    if (!dateReading.iso) {
      const raw = cell("date");
      problems.push({
        line,
        reason: raw
          ? `"${raw}" is not a date I understand`
          : "No date on this line",
      });
      continue;
    }

    const stakeCents = parseCsvMoney(cell("stake"));
    if (stakeCents === null) {
      const raw = cell("stake");
      problems.push({
        line,
        reason: raw ? `Stake "${raw}" is not a number` : "No stake on this line",
      });
      continue;
    }
    if (stakeCents === 0) {
      problems.push({ line, reason: "Stake is zero" });
      continue;
    }
    if (stakeCents < 0) {
      problems.push({
        line,
        reason: `Stake is negative (${(Math.abs(stakeCents) / 100).toFixed(2)}) — a profit-and-loss column is not a stake`,
      });
      continue;
    }

    const statusText = cell("status");
    const returnText = cell("return");
    const returnCents = parseCsvMoney(returnText);
    const warnings: string[] = [];
    if (returnText && returnCents === null) {
      warnings.push(`Return "${returnText}" is not a number and was ignored`);
    }

    let status: BetStatus;
    if (statusText) {
      const parsed = parseCsvStatus(statusText);
      if (!parsed) {
        problems.push({
          line,
          reason: `Result "${statusText}" is not one I understand — I cannot tell whether this bet won`,
        });
        continue;
      }
      status = parsed;
    } else if (columns.return !== undefined && returnCents !== null) {
      // A statement that only publishes payouts still says which bets won.
      status = returnCents > 0 ? "won" : "lost";
      derivedStatuses++;
    } else {
      status = "pending";
    }

    let odds = parseOdds(cell("odds"));
    if (!Number.isFinite(odds) || odds <= 1) {
      // A settled winning bet's payout implies its price exactly, which is
      // enough for statements that never print odds.
      if (status === "won" && returnCents !== null && returnCents > 0) {
        odds = Number((returnCents / stakeCents).toFixed(4));
        derivedOdds++;
      }
      if (!Number.isFinite(odds) || odds <= 1) {
        const raw = cell("odds");
        problems.push({
          line,
          reason: raw
            ? `Price "${raw}" is not a price above 1`
            : "No price on this line, and the return does not imply one",
        });
        continue;
      }
    }

    const bookName = cell("bookmaker") || input.defaultBookName || "";
    if (!bookName) {
      problems.push({ line, reason: "No bookmaker on this line" });
      continue;
    }

    const description =
      cell("description") || input.defaultDescription?.trim() || "";
    if (!description) {
      problems.push({ line, reason: "No description on this line" });
      continue;
    }

    const computed = computeReturnCents({ stakeCents, decimalOdds: odds, status });
    const finalReturn = status === "cashout" && returnCents !== null ? returnCents : computed;
    if (
      status !== "cashout" &&
      returnCents !== null &&
      returnCents !== computed
    ) {
      // Visible rather than silent: a disagreement means the statement recorded
      // something the app's arithmetic does not (a partial, a dead heat, a
      // bonus-bet payout), and the user should see it before importing.
      warnings.push(
        `Statement returned ${(returnCents / 100).toFixed(2)} where stake × odds gives ${(computed / 100).toFixed(2)}`,
      );
    }

    const sportName = cell("sport") || null;
    const notesCell = cell("notes");
    const source = input.sourceName ?? "statement";
    const provenance = `Imported from ${source} line ${line}`;
    const betNotes = [notesCell, provenance].filter(Boolean).join(" · ");

    // Identity is the bet's own contents, so re-importing the same statement
    // lines up row for row rather than duplicating every bet.
    const identity = {
      bookName,
      placedAt: dateReading.iso,
      stakeCents,
      odds,
      status,
      description,
    };
    const baseRef = importRefFor(identity);
    const occurrence = (occurrences.get(baseRef) ?? 0) + 1;
    occurrences.set(baseRef, occurrence);
    const importRef = importRefFor(identity, occurrence);

    if (!books.includes(bookName)) books.push(bookName);

    bets.push({
      line,
      importRef,
      alreadyImported: existing.has(importRef),
      bookName,
      sportName,
      description,
      stakeCents,
      odds,
      status,
      returnCents: finalReturn,
      placedAt: dateReading.iso,
      notes: betNotes,
      warnings,
    });
  }

  const statusSource: ImportPlan["statusSource"] =
    columns.status !== undefined ? "column" : derivedStatuses > 0 ? "derived" : "none";
  if (statusSource === "derived") {
    notes.push(
      `${derivedStatuses} row${derivedStatuses === 1 ? "" : "s"} had no result column, so the payout decided it: anything paid counts as won, nothing paid as lost.`,
    );
  }
  if (statusSource === "none") {
    notes.push(
      "No result column was found, so every bet imports as pending. Settle them on the Bets page.",
    );
  }
  if (derivedOdds > 0) {
    notes.push(
      `${derivedOdds} winning row${derivedOdds === 1 ? "" : "s"} had no price, so it was worked back from the payout.`,
    );
  }
  if (ambiguousDates) {
    notes.push(
      `Dates like 03/04/2026 were read ${dayFirst ? "day-first (3 April)" : "month-first (4 March)"}. Change that if the file means the other one.`,
    );
  }

  return {
    bets,
    problems,
    books,
    statusSource,
    notes,
    header,
    headerLine: headerRecord ? headerRecord.line : 0,
    columns,
    ambiguousDates,
  };
}
