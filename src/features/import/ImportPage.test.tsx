// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import { ImportPage } from "./ImportPage";

/**
 * The Import screen's job is to show its working before it writes anything:
 * how many bets it read, which lines it will leave out and why. These tests pin
 * that down, plus the two controls that change what the numbers mean — the
 * column roles and the date order.
 */

const mocks = vi.hoisted(() => ({
  importBets: vi.fn(),
  listImportRefs: vi.fn(),
  refresh: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

function appData(): AppData {
  return {
    repo: {
      importBets: mocks.importBets,
      listImportRefs: mocks.listImportRefs,
    } as unknown as AppData["repo"],
    settings: {},
    books: [],
    sports: [],
    promos: [],
    bets: [],
    transactions: [],
    currency: "AUD",
    oddsFormat: "decimal",
    refresh: mocks.refresh,
    saveSetting: vi.fn(),
  };
}

const STATEMENT = [
  "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
  "10/03/2026,Flemington R3 #4,50.00,2.40,Won,120.00,TAB",
  "11/03/2026,Broken row,abc,1.90,Lost,0.00,Sportsbet",
].join("\n");

function paste(text: string) {
  const box = screen.getByLabelText(/Paste a statement/);
  fireEvent.change(box, { target: { value: text } });
  return box;
}

/**
 * Choose a file the way the picker does.
 *
 * jsdom's `File` does not implement `text()`, which is the one method the
 * handler uses, so the stub supplies the two things it reads: the name and the
 * contents. `files` is read-only on the element, so it is defined rather than
 * set.
 */
function chooseFile(contents: string) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = {
    name: "statement.csv",
    text: async () => contents,
  } as unknown as File;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listImportRefs.mockResolvedValue(new Set<string>());
  mocks.importBets.mockResolvedValue({
    imported: 1,
    skipped: 0,
    createdBooks: ["TAB"],
  });
  mocks.refresh.mockResolvedValue(undefined);
  mocks.data = appData();
});

describe("the import screen", () => {
  it("says what it read and what it will leave out", async () => {
    render(<ImportPage />);
    await waitFor(() => expect(mocks.listImportRefs).toHaveBeenCalled());
    paste(STATEMENT);

    expect(await screen.findByText("1 to import")).toBeTruthy();
    expect(screen.getByText("1 left out")).toBeTruthy();
    // The reason names the line, so it can be found in the file.
    expect(screen.getByText(/Stake "abc" is not a number/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import 1 bet" })).toBeTruthy();
  });

  it("shows the columns it recognised, and lets one be reassigned", async () => {
    render(<ImportPage />);
    paste(STATEMENT);

    const stake = await screen.findByLabelText("Column 3");
    expect((stake as HTMLSelectElement).value).toBe("stake");

    // Telling it the date column is not a date leaves every row placeless, and
    // the screen says so rather than importing bets with no date.
    fireEvent.change(screen.getByLabelText("Column 1"), {
      target: { value: "ignore" },
    });

    await waitFor(() =>
      expect(screen.getByText(/No date column was recognised/)).toBeTruthy(),
    );
    expect(screen.getByText("0 to import")).toBeTruthy();
    expect(screen.getByText("2 left out")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Nothing new to import" }),
    ).toBeTruthy();
  });

  it("works the price back from the payout when the column is missing", async () => {
    render(<ImportPage />);
    paste(
      [
        "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
        "10/03/2026,Paid out,50.00,2.40,Won,120.00,TAB",
        "11/03/2026,Nothing paid,50.00,1.90,Lost,0.00,TAB",
      ].join("\n"),
    );

    fireEvent.change(screen.getByLabelText("Column 4"), {
      target: { value: "ignore" },
    });

    // The won row pays 120.00 on a 50.00 stake, so it is 2.40; the lost row has
    // no payout to work from and is named as a problem instead.
    expect(await screen.findByText(/worked back from the payout/)).toBeTruthy();
    expect(screen.getByText("1 to import")).toBeTruthy();
    expect(
      screen.getByText(/No price on this line, and the return does not imply one/),
    ).toBeTruthy();
  });

  it("reads ambiguous dates day-first, and switches on request", async () => {
    render(<ImportPage />);
    paste(STATEMENT);
    expect(await screen.findByText("10 Mar 2026")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Dates in this file/), {
      target: { value: "month" },
    });

    // Day-first reads it as 10 March; month-first as 3 October.
    expect(await screen.findByText("03 Oct 2026")).toBeTruthy();
    expect(screen.queryByText("10 Mar 2026")).toBeNull();
  });

  it("hands the whole plan to the repo, and says what came back", async () => {
    render(<ImportPage />);
    paste(STATEMENT);
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 bet" }));

    await waitFor(() => expect(mocks.importBets).toHaveBeenCalledTimes(1));
    const [records] = mocks.importBets.mock.calls[0] as [
      { importRef: string; description: string; stakeCents: number }[],
    ];
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      description: "Flemington R3 #4",
      stakeCents: 5000,
    });
    expect(records[0].importRef).toContain("2026-03-10");

    expect(await screen.findByText("Imported 1 bet.")).toBeTruthy();
    expect(screen.getByText(/Added as bookmakers: TAB/)).toBeTruthy();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("recognises a statement that has already been imported", async () => {
    // Import it once, and keep the fingerprint the screen sent.
    const first = render(<ImportPage />);
    paste(STATEMENT);
    fireEvent.click(await screen.findByRole("button", { name: "Import 1 bet" }));
    await waitFor(() => expect(mocks.importBets).toHaveBeenCalled());
    const [records] = mocks.importBets.mock.calls[0] as [{ importRef: string }[]];
    first.unmount();

    // Now the same statement, with that fingerprint already in the database.
    mocks.listImportRefs.mockResolvedValue(new Set([records[0].importRef]));
    render(<ImportPage />);
    paste(STATEMENT);

    expect(await screen.findByText("0 to import")).toBeTruthy();
    expect(await screen.findByText("1 already here")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Nothing new to import" }),
    ).toBeTruthy();
  });

  it("says so when there is nothing readable in the box", async () => {
    render(<ImportPage />);
    paste("just one long line of prose");
    expect(
      await screen.findByText(/not something I can read as a statement/),
    ).toBeTruthy();
  });

  it("counts a one-line file in the singular", async () => {
    render(<ImportPage />);
    await waitFor(() => expect(mocks.listImportRefs).toHaveBeenCalled());

    // A file of one row has to read as one line rather than "1 lines".
    chooseFile("Date,Description,Stake,Odds,Result,Payout,Bookmaker");

    expect(
      await screen.findByText(/statement\.csv · 1 line · comma separated/),
    ).toBeTruthy();
  });

  it("counts the file's rows rather than the bets in it", async () => {
    render(<ImportPage />);
    await waitFor(() => expect(mocks.listImportRefs).toHaveBeenCalled());

    // Two bets under a header is three rows, and the label beside the file name
    // describes the file. Reporting the two bets here would send someone
    // looking for a third row that was never missing.
    chooseFile(STATEMENT);

    expect(
      await screen.findByText(/statement\.csv · 3 lines · comma separated/),
    ).toBeTruthy();
  });
});
