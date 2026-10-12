import { useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { delimiterLabel, parseCsv, type CsvTable } from "@/domain/csv";
import {
  COLUMN_ROLES,
  COLUMN_ROLE_LABELS,
  buildImportPlan,
  findHeaderRow,
  inferMapping,
  type ColumnMapping,
  type ColumnRole,
  type ImportPlan,
} from "@/domain/csvImport";
import { formatMoney } from "@/domain/money";
import { BET_STATUS_LABELS } from "@/domain/pnl";
import { formatOdds } from "@/domain/odds";
import type { ImportOutcome } from "@/db/repo";
import { formatDate } from "@/lib/utils";

/** How many planned bets to show before just saying how many there are. */
const PREVIEW_ROWS = 8;

interface Prepared {
  table: CsvTable;
  headerIndex: number;
  mapping: ColumnMapping;
}

/**
 * Import a bookmaker's CSV statement.
 *
 * Deliberately three steps with the middle one on screen: which column is the
 * stake, how a date is read and what "Settled" means are all decisions that
 * change the numbers, so the screen shows what it is about to do and what it
 * refuses to do before anything is written.
 */
export function ImportPage({ onNavigate }: { onNavigate?: (route: "bets") => void }) {
  const { repo, refresh, books, currency, oddsFormat } = useAppData();

  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dayFirst, setDayFirst] = useState(true);
  const [bookName, setBookName] = useState("");
  const [description, setDescription] = useState("Imported bet");
  const [existingRefs, setExistingRefs] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The fingerprints already in the database, so a statement that has been
  // imported once can be recognised rather than duplicating every bet.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const refs = await repo.listImportRefs();
      if (!cancelled) setExistingRefs(refs);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const prepare = (body: string, name: string) => {
    setOutcome(null);
    setFailure(null);
    setText(body);
    setFileName(name);
    const table = parseCsv(body);
    const headerIndex = table.records.length > 0 ? findHeaderRow(table.records) : -1;
    const header = headerIndex >= 0 ? table.records[headerIndex].cells : [];
    // A statement has columns. One line of prose is not a statement, and
    // pretending to read it would offer a plan with nothing in it.
    if (header.length < 2) {
      setPrepared(null);
      return;
    }
    const { mapping: guessed } = inferMapping(header);
    setPrepared({ table, headerIndex, mapping: guessed });
    setMapping(guessed);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    prepare(await file.text(), file.name);
  };

  const plan: ImportPlan | null = useMemo(() => {
    if (!prepared) return null;
    return buildImportPlan({
      records: prepared.table.records,
      headerIndex: prepared.headerIndex,
      mapping,
      dayFirst,
      defaultBookName: bookName || null,
      defaultDescription: description,
      existingRefs,
      sourceName: fileName || "pasted text",
    });
  }, [prepared, mapping, dayFirst, bookName, description, existingRefs, fileName]);

  const problemsByReason = useMemo(() => {
    if (!plan) return [];
    const grouped = new Map<string, number[]>();
    for (const problem of plan.problems) {
      grouped.set(problem.reason, [...(grouped.get(problem.reason) ?? []), problem.line]);
    }
    return [...grouped.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [plan]);

  const ready = plan?.bets.filter((bet) => !bet.alreadyImported) ?? [];
  const already = plan ? plan.bets.length - ready.length : 0;
  const warned = plan?.bets.filter((bet) => bet.warnings.length > 0) ?? [];

  const setRole = (column: number, role: ColumnRole) => {
    setMapping((previous) => {
      const next: ColumnMapping = { ...previous };
      // A role belongs to one column: choosing it here takes it away from
      // wherever it was, which is what "the stake column" means.
      if (role !== "ignore") {
        for (const [key, value] of Object.entries(next)) {
          if (value === role && Number(key) !== column) next[Number(key)] = "ignore";
        }
      }
      next[column] = role;
      return next;
    });
  };

  const runImport = async () => {
    if (!plan || ready.length === 0) return;
    setBusy(true);
    setFailure(null);
    try {
      const result = await repo.importBets(
        plan.bets.map((bet) => ({
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
        })),
      );
      setOutcome(result);
      setExistingRefs(await repo.listImportRefs());
      await refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Import a statement"
        description="Bring bets in from a bookmaker's CSV export. The file is read here on your machine and never uploaded."
      />

      <div className="space-y-4">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-ink">1. Choose a file</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.txt,.tsv,text/csv,text/plain"
              className="hidden"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
            <Button variant="primary" onClick={() => fileInput.current?.click()}>
              Choose a CSV file
            </Button>
            {fileName ? (
              <span className="text-sm text-muted">
                {fileName} · {prepared?.table.records.length ?? 0} lines ·{" "}
                {prepared ? delimiterLabel(prepared.table.delimiter) : "unknown"} separated
              </span>
            ) : (
              <span className="text-sm text-faint">Or paste the contents below</span>
            )}
          </div>

          <div className="mt-4">
            <Field
              label="Paste a statement"
              hint="Nothing leaves this machine. Rows that cannot be read are listed, never dropped."
            >
              <Textarea
                rows={5}
                value={text}
                placeholder={"Date,Description,Stake,Odds,Result,Payout,Bookmaker\n10/03/2026,Flemington R3 #4,50.00,2.40,Won,120.00,TAB"}
                onChange={(event) => prepare(event.target.value, "")}
              />
            </Field>
          </div>
        </Card>

        {prepared && plan ? (
          <>
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">
                2. Check the columns
              </h2>
              <div className="space-y-2">
                {plan.header.map((heading, column) => (
                  <div
                    key={`${heading}-${column}`}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <span className="min-w-40 flex-1 truncate text-sm text-ink">
                      {heading || <span className="text-faint">(unnamed)</span>}
                    </span>
                    <Select
                      aria-label={`Column ${column + 1}`}
                      className="max-w-56"
                      value={mapping[column] ?? "ignore"}
                      onChange={(event) =>
                        setRole(column, event.target.value as ColumnRole)
                      }
                    >
                      {COLUMN_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {COLUMN_ROLE_LABELS[role]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field
                  label="Dates in this file"
                  hint="03/04/2026 means different days in different countries."
                >
                  <Select
                    value={dayFirst ? "day" : "month"}
                    onChange={(event) => setDayFirst(event.target.value === "day")}
                  >
                    <option value="day">Day first (3 April)</option>
                    <option value="month">Month first (4 March)</option>
                  </Select>
                </Field>

                {plan.columns.bookmaker === undefined ? (
                  <Field label="Bookmaker for every bet">
                    <Select
                      value={bookName}
                      onChange={(event) => setBookName(event.target.value)}
                    >
                      <option value="">Choose a bookmaker…</option>
                      {books.map((book) => (
                        <option key={book.id} value={book.name}>
                          {book.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}

                {plan.columns.description === undefined ? (
                  <Field
                    label="Description for every bet"
                    hint="The file has no description column, so every imported bet gets this one."
                  >
                    <Input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />
                  </Field>
                ) : null}
              </div>
            </Card>

            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink">3. What will happen</h2>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="positive">{ready.length} to import</Badge>
                {already > 0 ? <Badge tone="info">{already} already here</Badge> : null}
                {plan.problems.length > 0 ? (
                  <Badge tone="warning">{plan.problems.length} left out</Badge>
                ) : null}
                {warned.length > 0 ? (
                  <Badge tone="warning">{warned.length} worth a look</Badge>
                ) : null}
                {plan.books.length > 0 ? (
                  <span className="text-xs text-muted">
                    Bookmakers: {plan.books.join(", ")}
                  </span>
                ) : null}
              </div>

              {plan.notes.length > 0 ? (
                <ul className="mb-3 space-y-1 text-xs text-muted">
                  {plan.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              ) : null}

              {problemsByReason.length > 0 ? (
                <div className="mb-4 rounded-lg border border-line bg-raised p-3">
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">
                    Lines that will be left out
                  </p>
                  <ul className="space-y-1.5 text-xs">
                    {problemsByReason.map(([reason, lines]) => (
                      <li key={reason} className="flex flex-wrap gap-2">
                        <span className="font-medium text-negative">
                          {lines.length} line{lines.length === 1 ? "" : "s"}
                        </span>
                        <span className="text-ink">{reason}</span>
                        <span className="tabular-nums text-faint">
                          (line{lines.length === 1 ? "" : "s"} {summariseLines(lines)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {plan.bets.length > 0 ? (
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-faint">
                      <tr>
                        <th className="py-1.5 pr-3 font-medium">Line</th>
                        <th className="py-1.5 pr-3 font-medium">Date</th>
                        <th className="py-1.5 pr-3 font-medium">Description</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Stake</th>
                        <th className="py-1.5 pr-3 text-right font-medium">Odds</th>
                        <th className="py-1.5 pr-3 font-medium">Result</th>
                        <th className="py-1.5 font-medium">Bookmaker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.bets.slice(0, PREVIEW_ROWS).map((bet) => (
                        <tr key={bet.importRef} className="border-t border-line">
                          <td className="py-1.5 pr-3 tabular-nums text-faint">
                            {bet.line}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap text-muted">
                            {formatDate(bet.placedAt)}
                          </td>
                          <td className="py-1.5 pr-3 text-ink">
                            {bet.description}
                            {bet.alreadyImported ? (
                              <span className="ml-2 text-faint">already imported</span>
                            ) : null}
                            {bet.warnings.length > 0 ? (
                              <span
                                className="ml-2 text-warning"
                                title={bet.warnings.join("; ")}
                              >
                                {bet.warnings.length} note
                                {bet.warnings.length === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-ink">
                            {formatMoney(bet.stakeCents, currency)}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted">
                            {formatOdds(bet.odds, oddsFormat)}
                          </td>
                          <td className="py-1.5 pr-3 text-muted">
                            {BET_STATUS_LABELS[bet.status]}
                          </td>
                          <td className="py-1.5 text-muted">{bet.bookName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.bets.length > PREVIEW_ROWS ? (
                    <p className="mt-2 text-xs text-faint">
                      Showing the first {PREVIEW_ROWS} of {plan.bets.length} bets.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  disabled={busy || ready.length === 0}
                  onClick={() => void runImport()}
                >
                  {busy
                    ? "Importing…"
                    : ready.length === 0
                      ? "Nothing new to import"
                      : `Import ${ready.length} bet${ready.length === 1 ? "" : "s"}`}
                </Button>
                {plan.problems.length > 0 ? (
                  <span className="text-xs text-muted">
                    The {plan.problems.length} line
                    {plan.problems.length === 1 ? "" : "s"} above will not be imported.
                  </span>
                ) : null}
              </div>

              {failure ? (
                <p className="mt-3 rounded-lg border border-line bg-negative-soft p-3 text-sm text-negative">
                  Import failed: {failure}
                </p>
              ) : null}

              {outcome ? (
                <div className="mt-3 rounded-lg border border-line bg-raised p-3 text-sm">
                  <p className="text-ink">
                    Imported {outcome.imported} bet
                    {outcome.imported === 1 ? "" : "s"}
                    {outcome.skipped > 0
                      ? `, skipped ${outcome.skipped} already here`
                      : ""}
                    .
                  </p>
                  {outcome.createdBooks.length > 0 ? (
                    <p className="mt-1 text-xs text-muted">
                      Added as bookmakers: {outcome.createdBooks.join(", ")}.
                    </p>
                  ) : null}
                  {onNavigate ? (
                    <div className="mt-2">
                      <Button size="sm" onClick={() => onNavigate("bets")}>
                        See them on the Bets page
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </>
        ) : text.trim() ? (
          <Card>
            <p className="text-sm text-muted">
              That is not something I can read as a statement — there is no row with
              more than one value in it.
            </p>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/** "3–9" for a short run, "3, 9, 14" when they are scattered. */
function summariseLines(lines: readonly number[]): string {
  const sorted = [...lines].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  if (sorted.length <= 5 && sorted[sorted.length - 1] - sorted[0] === sorted.length - 1) {
    return `${sorted[0]}–${sorted[sorted.length - 1]}`;
  }
  if (sorted.length <= 5) return sorted.join(", ");
  return `${sorted.slice(0, 5).join(", ")}…`;
}
