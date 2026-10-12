import { describe, expect, it } from "vitest";
import { delimiterLabel, detectDelimiter, parseCsv } from "./csv";

const lines = (...rows: string[]) => rows.join("\n");

describe("the CSV reader", () => {
  it("splits plain rows", () => {
    const table = parseCsv(lines("a,b,c", "1,2,3"));
    expect(table.delimiter).toBe(",");
    expect(table.records.map((r) => r.cells)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    const table = parseCsv(lines("a,b", '"Flemington, R3",2'));
    expect(table.records[1].cells).toEqual(["Flemington, R3", "2"]);
  });

  it("reads a quote escaped by doubling", () => {
    // The doubled quotes are inside the field; the comma after the closing
    // quote is a real separator.
    const table = parseCsv(lines("a,b", '"He said ""go""", then ran'));
    expect(table.records[1].cells).toEqual(['He said "go"', ' then ran']);
  });

  it("keeps a newline inside a quoted field, and counts the lines it took", () => {
    const table = parseCsv(
      lines("a,b", '"first line', 'second line",2', "after,3"),
    );
    expect(table.records[1].cells[0]).toBe("first line\nsecond line");
    // The record after a two-line field starts on line 4 of the file, and the
    // UI points users at exactly that number.
    expect(table.records[1].line).toBe(2);
    expect(table.records[2]).toEqual({ line: 4, cells: ["after", "3"] });
  });

  it("handles CRLF endings", () => {
    const table = parseCsv("a,b\r\n1,2\r\n");
    expect(table.records.map((r) => r.cells)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(table.records[1].line).toBe(2);
  });

  it("strips a UTF-8 BOM so the first header still matches", () => {
    const table = parseCsv("\uFEFFdate,stake");
    expect(table.records[0].cells).toEqual(["date", "stake"]);
  });

  it("ignores blank lines and a trailing newline", () => {
    const table = parseCsv(lines("a,b", "", "1,2", ""));
    expect(table.records.map((r) => r.cells)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps an empty field", () => {
    const table = parseCsv(lines("a,b,c", "1,,3"));
    expect(table.records[1].cells).toEqual(["1", "", "3"]);
  });

  it("returns no records for empty input", () => {
    expect(parseCsv("").records).toEqual([]);
  });

  it("detects a semicolon file", () => {
    const table = parseCsv(lines("date;stake;odds", "10/03/2026;50,00;2,40"));
    expect(table.delimiter).toBe(";");
    expect(table.records[1].cells).toEqual(["10/03/2026", "50,00", "2,40"]);
  });

  it("detects a tab file even when descriptions contain commas", () => {
    // A comma count would prefer "," here; the consistent split is the tab.
    const table = parseCsv(
      lines(
        "date\tdescription\tstake",
        "10/03/2026\tFlemington, R3, #4\t50.00",
        "11/03/2026\tStorm v Broncos, Under 42.5\t25.00",
      ),
    );
    expect(table.delimiter).toBe("\t");
    expect(table.records[1].cells[1]).toBe("Flemington, R3, #4");
  });

  it("prefers the delimiter that gives every row the same width", () => {
    // Semicolons separate the fields; the commas are inside quoted prose.
    const text = lines(
      "date;note;stake",
      '10/03/2026;"won, then, again";50',
      '11/03/2026;"lost, again";25',
    );
    expect(detectDelimiter(text)).toBe(";");
  });

  it("falls back to a comma when nothing splits", () => {
    expect(detectDelimiter("just one column")).toBe(",");
    expect(detectDelimiter("")).toBe(",");
  });

  it("names the delimiters it detected", () => {
    expect(delimiterLabel(",")).toBe("comma");
    expect(delimiterLabel(";")).toBe("semicolon");
    expect(delimiterLabel("\t")).toBe("tab");
    expect(delimiterLabel("|")).toBe("pipe");
  });

  it("accepts an explicit delimiter, overriding detection", () => {
    const table = parseCsv(lines("a|b", "1|2"), { delimiter: "|" });
    expect(table.records[0].cells).toEqual(["a", "b"]);
  });

  it("does not invent a record for a lone apostrophe field", () => {
    const table = parseCsv(lines("a", "'"));
    expect(table.records[1].cells).toEqual(["'"]);
  });
});
