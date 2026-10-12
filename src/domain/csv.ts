/**
 * A CSV reader, written here rather than pulled in.
 *
 * Statement exports are the one place an outsider's file format decides whether
 * the app works, so the reader has to be predictable about the cases that
 * actually appear: quoted fields containing the delimiter, quotes escaped by
 * doubling, embedded newlines inside a quoted field, CRLF endings, a UTF-8 BOM
 * (Excel writes one and it would otherwise become part of the first header
 * name), and a different delimiter per bookmaker.
 *
 * This module only knows about *syntax*. What the columns mean is the import
 * module's job, which is why nothing here mentions bets.
 */

/** Delimiters worth guessing between, in order of preference on a tie. */
const DELIMITERS = [",", ";", "\t", "|"] as const;

export interface CsvRecord {
  /**
   * 1-based line number in the source file where this record begins.
   *
   * Records, not lines: a quoted field can span several lines, so this is the
   * only number that lets the UI say "line 42" and mean the row the user sees
   * in a text editor.
   */
  line: number;
  cells: string[];
}

export interface CsvTable {
  delimiter: string;
  records: CsvRecord[];
}

/**
 * Split the text into records under a known delimiter.
 *
 * A state machine rather than a `split(",")`: the whole point is that a cell
 * may contain the delimiter, a newline, or an escaped quote, and only the
 * quote state distinguishes those from the end of a field.
 */
function scan(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  let i = 0;

  const endField = () => {
    cells.push(field);
    field = "";
  };

  const endRecord = () => {
    endField();
    // A blank line is not a record. Neither is the empty tail after a final
    // newline, and neither is a single empty cell, which is how all of those
    // look once parsed.
    if (!(cells.length === 1 && cells[0].trim() === "")) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      // Newlines inside a field are kept as "\n" whatever the file used, so
      // downstream code never has to think about CRLF again.
      if (ch === "\r") {
        field += "\n";
        line++;
        i += text[i + 1] === "\n" ? 2 : 1;
        continue;
      }
      if (ch === "\n") {
        field += "\n";
        line++;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
      i++;
      continue;
    }

    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      i++;
      endRecord();
      line++;
      recordLine = line;
      continue;
    }

    field += ch;
    i++;
  }

  // A file whose last line has no terminator still has one last record.
  if (field !== "" || cells.length > 0) endRecord();

  return records;
}

/**
 * Pick the delimiter the file is most likely written with.
 *
 * Counting delimiters per line and preferring the split that gives the most
 * consistent field count: a comma-separated file with commas inside quoted
 * descriptions would otherwise beat a semicolon-separated file on raw count
 * while producing ragged rows.
 */
export function detectDelimiter(text: string): string {
  let best = DELIMITERS[0] as string;
  let bestScore = 0;

  for (const [index, delimiter] of DELIMITERS.entries()) {
    const counts = scan(text, delimiter)
      .slice(0, 50)
      .map((record) => record.cells.length)
      .filter((count) => count > 1);
    if (counts.length === 0) continue;

    const frequency = new Map<number, number>();
    for (const count of counts) {
      frequency.set(count, (frequency.get(count) ?? 0) + 1);
    }
    let mode = 0;
    let hits = 0;
    for (const [count, times] of frequency) {
      if (times > hits || (times === hits && count > mode)) {
        hits = times;
        mode = count;
      }
    }

    // Consistency first, then width, then this order of preference.
    const score = hits * 1000 + mode * 10 - index;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

export function parseCsv(
  text: string,
  options: { delimiter?: string } = {},
): CsvTable {
  // Excel writes a BOM before the first header name; left in place it makes
  // "date" match nothing and the first column look unrecognisable.
  const body = text.replace(/^\uFEFF/, "");
  const delimiter = options.delimiter ?? detectDelimiter(body);
  return { delimiter, records: scan(body, delimiter) };
}

/** The readable name for a delimiter, for the UI to show what was detected. */
export function delimiterLabel(delimiter: string): string {
  switch (delimiter) {
    case ",":
      return "comma";
    case ";":
      return "semicolon";
    case "\t":
      return "tab";
    case "|":
      return "pipe";
    default:
      return delimiter;
  }
}
