import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useAppData } from "@/app/DataProvider";
import {
  Button,
  Card,
  Dot,
  EmptyState,
  Input,
  MetaLine,
  PageHeader,
  SegmentedControl,
  Select,
  SummaryCell,
  SummaryStrip,
} from "@/components/ui/primitives";
import { betClassLabel, groupOf, type BetClass } from "@/domain/betClass";
import { clvEdge, formatClvEdge } from "@/domain/clv";
import { formatMoney, formatSignedMoney } from "@/domain/money";
import { formatOdds } from "@/domain/odds";
import { BET_STATUS_LABELS, type BetStatus } from "@/domain/pnl";
import { MIN_POSITION_LEGS } from "@/domain/position";
import { BET_TYPE_LABELS, type BetView } from "@/db/types";
import {
  enrichAll,
  marginByPosition,
  statsFor,
  type EnrichedBet,
} from "@/features/analytics/selectors";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { BetForm } from "./BetForm";
import { MarketPanel } from "./MarketPanel";

const columnHelper = createColumnHelper<EnrichedBet>();

/**
 * Columns read as figures, so they are right-aligned and lined up by digit.
 * These are the column ids TanStack derives from the accessors, not the
 * headings: "stake" and "profit" are the labels, so listing those left the
 * heading over the left edge and the figures at the right one.
 */
const RIGHT_ALIGNED = new Set(["odds", "stake_cents", "profitCents"]);

/**
 * The status as a word rather than a pill.
 *
 * A badge's padding costs width in every row to say something the row's edge
 * colour has already said, so the word carries the colour and the padding goes
 * to the figures.
 */
const STATUS_TEXT: Record<BetStatus, string> = {
  pending: "text-info",
  won: "text-positive",
  half_won: "text-positive",
  lost: "text-negative",
  half_lost: "text-negative",
  void: "text-muted",
  cashout: "text-warning",
};

/** The colour of the row's edge, so a page of bets is scannable by outcome. */
const STATUS_EDGE: Record<BetStatus, string> = {
  pending: "bg-info",
  won: "bg-positive",
  half_won: "bg-positive",
  lost: "bg-negative",
  half_lost: "bg-negative",
  void: "bg-line",
  cashout: "bg-warning",
};

/**
 * Promo-funded bets share a colour so they stand out from ordinary strategy
 * bets, and arbitrage gets its own because it is the one you are judging on a
 * margin rather than on whether it won.
 */
function classTone(
  betClass: BetClass,
): "neutral" | "positive" | "info" | "promo" {
  if (groupOf(betClass) === "promo") return "promo";
  if (betClass === "arbitrage") return "info";
  if (betClass === "positive_ev" || betClass === "sharp_money") return "positive";
  return "neutral";
}

/**
 * A betting record, read the way a record is read: the totals first, then rows
 * dense enough that several fit on a screen and hierarched so the eye can find
 * the description, the price and the profit without hunting.
 *
 * The bet cell carries two lines on purpose. Book, sport, format and promo were
 * four columns of mostly-repeated text competing with the four columns that
 * actually differ between bets; folding them into one muted line moved the
 * figures much closer together.
 */
export function BetsPage() {
  const { bets, books, sports, currency, oddsFormat, repo, refresh } =
    useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BetView | null>(null);
  // The bet whose market prices are being looked at, if any.
  const [marketFor, setMarketFor] = useState<BetView | null>(null);
  const [search, setSearch] = useState("");
  const [bookId, setBookId] = useState("");
  const [sportId, setSportId] = useState("");
  const [status, setStatus] = useState("");
  const [density, setDensity] = useState<"compact" | "comfortable">("compact");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const allEnriched = useMemo(() => enrichAll(bets), [bets]);

  // Margins come from every leg of a position, including legs the filters are
  // hiding, so a narrowed view still reports the true number.
  const margins = useMemo(() => marginByPosition(allEnriched), [allEnriched]);

  const rows = useMemo(
    () =>
      allEnriched.filter((b) => {
        if (bookId && String(b.book_id) !== bookId) return false;
        if (sportId && String(b.sport_id ?? "") !== sportId) return false;
        if (status && b.status !== status) return false;
        if (
          search &&
          !b.description.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [allEnriched, bookId, sportId, status, search],
  );

  const money = (cents: number) => formatMoney(cents, currency);
  // A zero profit is not "+$0.00": the sign belongs on a gain or a loss.
  const signed = (cents: number) => formatSignedMoney(cents, currency);

  /**
   * The record as currently filtered, so the totals always describe the rows
   * underneath them rather than the whole database.
   */
  const summary = useMemo(() => statsFor(rows), [rows]);
  const filtered = rows.length !== bets.length;
  // Compact means one line per bet, not just tighter padding: the book, sport,
  // format and promo all repeat down the column, so collapsing them is where
  // the rows actually come from. The class and the position margin stay,
  // because those are the two things a row cannot be read without.
  const compact = density === "compact";
  const rowPadding = compact ? "py-1.5" : "py-2.5";

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table: t }) => (
          <input
            type="checkbox"
            className="accent-[var(--accent)]"
            aria-label="Select all bets"
            checked={t.getIsAllPageRowsSelected()}
            onChange={t.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "h-5 w-0.5 shrink-0 rounded-full",
                STATUS_EDGE[row.original.status as BetStatus],
              )}
            />
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              aria-label="Select bet"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
            />
          </div>
        ),
      }),
      columnHelper.accessor((r) => r.placed_at ?? r.created_at, {
        id: "date",
        header: "Date",
        cell: (info) => (
          <span className="whitespace-nowrap text-muted">
            {formatDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor("description", {
        header: "Bet",
        cell: (info) => {
          const bet = info.row.original;
          const margin =
            bet.position_id === null || bet.position_id === undefined
              ? undefined
              : margins.get(bet.position_id);
          return (
            <div className="min-w-0 max-w-md">
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium text-ink">
                  {bet.description || "—"}
                </span>
                {bet.bet_class !== "normal" ? (
                  <span
                    className={cn(
                      "shrink-0 text-[11px] font-medium",
                      classTone(bet.bet_class) === "promo" && "text-promo",
                      classTone(bet.bet_class) === "info" && "text-info",
                      classTone(bet.bet_class) === "positive" &&
                        "text-positive",
                    )}
                  >
                    {betClassLabel(bet.bet_class)}
                  </span>
                ) : null}
                {margin !== undefined ? (
                  <span className="shrink-0 text-[11px] text-info">
                    Position {margin.toFixed(2)}%
                  </span>
                ) : bet.position_id !== null &&
                  bet.position_id !== undefined ? (
                  <span className="shrink-0 text-[11px] text-info">Grouped</span>
                ) : null}
              </div>
              {/* One muted line instead of four columns of mostly-repeated
                  text, and the first thing to go when the reader asks for
                  density. */}
              {compact ? null : (
                <MetaLine>
                  <span className="truncate">{bet.book_name}</span>
                  {bet.sport_name ? (
                    <>
                      <Dot />
                      <span className="truncate">{bet.sport_name}</span>
                    </>
                  ) : null}
                  {bet.bet_type !== "single" ? (
                    <>
                      <Dot />
                      <span>{BET_TYPE_LABELS[bet.bet_type]}</span>
                    </>
                  ) : null}
                  {bet.promo_value_cents > 0 ? (
                    <>
                      <Dot />
                      {/* Named before its figure, like "Position 2.86%" on the
                          Stats screen: the word leads, so it is capitalised,
                          rather than trailing the number in lower case. */}
                      <span className="text-positive">
                        Promo {money(bet.promo_value_cents)}
                      </span>
                    </>
                  ) : null}
                </MetaLine>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("odds", {
        header: "Odds",
        cell: (info) => {
          const edge = clvEdge(info.getValue(), info.row.original.clv);
          const title = edge
            ? `Closed at ${formatOdds(info.row.original.clv as number, oddsFormat)}`
            : "No closing price recorded";
          return (
            <div className="text-right whitespace-nowrap">
              <span
                className="text-ink tabular-nums"
                title={compact ? undefined : title}
              >
                {formatOdds(info.getValue(), oddsFormat)}
              </span>
              {/* Only where there is one: "no close" repeated down every row is
                  noise, and it is the common case for an imported statement.
                  It sits beside the price when the reader asked for density
                  rather than under it, because it is a figure, not prose. */}
              {edge ? (
                <span
                  title={title}
                  className={cn(
                    "text-[11px] tabular-nums",
                    compact ? "ml-1.5" : "block",
                    edge.beat ? "text-positive" : "text-negative",
                  )}
                >
                  {formatClvEdge(edge.edge)} CLV
                </span>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("stake_cents", {
        header: "Stake",
        cell: (info) => (
          <div className="text-right">
            <div className="text-ink tabular-nums">{money(info.getValue())}</div>
            {/* Capitalised: it is a label beside the class name that explains
                why this stake is not cash at risk, not a sentence fragment. */}
            {info.row.original.freeStake ? (
              <div className="text-[11px] text-promo">Free stake</div>
            ) : null}
          </div>
        ),
      }),
      columnHelper.accessor("profitCents", {
        header: "Profit",
        cell: (info) => {
          const bet = info.row.original;
          // A pending bet has no profit yet, so the column shows what it would
          // pay instead of an uninformative dash — a second line that density
          // gives up, since the status column already says it is not settled.
          if (!bet.settled) {
            return (
              <div
                className="text-right whitespace-nowrap"
                title={compact ? `Pays ${money(bet.potentialPayoutCents)} if it wins` : undefined}
              >
                <div className="text-faint">—</div>
                {compact ? null : (
                  <div className="text-[11px] text-faint tabular-nums">
                    pays {money(bet.potentialPayoutCents)}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div
              className={cn(
                "text-right font-medium tabular-nums",
                info.getValue() >= 0 ? "text-positive" : "text-negative",
              )}
            >
              {signed(info.getValue())}
            </div>
          );
        },
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => {
          const status = info.getValue() as BetStatus;
          // The word stays at every density: an outcome is not decoration.
          return (
            <span
              className={cn(
                "text-[11px] font-medium tracking-wide whitespace-nowrap uppercase",
                STATUS_TEXT[status],
              )}
            >
              {BET_STATUS_LABELS[status]}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <div className="flex justify-end gap-1 opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              title="What the market is showing, and record a closing price"
              onClick={() => setMarketFor(info.row.original)}
            >
              Market
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(info.row.original);
                setOpen(true);
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!confirm(`Delete "${info.row.original.description}"?`))
                  return;
                await repo.deleteBet(info.row.original.id);
                await refresh();
              }}
            >
              ✕
            </Button>
          </div>
        ),
      }),
    ],
    // `compact` belongs here: the cells decide their own second line from it, and
    // leaving it out meant the toggle only changed the row's padding while the
    // memoised cells kept rendering at their first-render density.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, oddsFormat, margins, repo, refresh, compact],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    // Key rows on the bet id so a selection survives sorting and filtering.
    getRowId: (row) => String(row.id),
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedIds = selectedRows.map((row) => row.original.id);
  const selectedStakedCents = selectedRows.reduce(
    (sum, row) => sum + row.original.cashStakeCents,
    0,
  );
  const selectedPotentialCents = selectedRows.reduce(
    (sum, row) => sum + row.original.potentialPayoutCents,
    0,
  );
  const selectedPositions = [
    ...new Set(
      selectedRows
        .map((row) => row.original.position_id)
        .filter((id): id is number => id !== null && id !== undefined),
    ),
  ];

  async function groupSelected() {
    await repo.groupBetsAsPosition(selectedIds);
    setRowSelection({});
    await refresh();
  }

  async function ungroupSelected() {
    for (const positionId of selectedPositions) {
      await repo.clearPosition(positionId);
    }
    setRowSelection({});
    await refresh();
  }

  function clearFilters() {
    setSearch("");
    setBookId("");
    setSportId("");
    setStatus("");
  }

  const filtersActive =
    search !== "" || bookId !== "" || sportId !== "" || status !== "";

  return (
    <>
      <PageHeader
        title="Bets"
        description="Every bet you have recorded, filterable and sortable."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New bet
          </Button>
        }
      />

      <Card className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-56 min-w-40 flex-1"
            placeholder="Search description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            className="w-auto max-w-44"
            value={bookId}
            onChange={(e) => setBookId(e.target.value)}
          >
            <option value="">All bookmakers</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-auto max-w-44"
            value={sportId}
            onChange={(e) => setSportId(e.target.value)}
          >
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-auto max-w-44"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {(Object.keys(BET_STATUS_LABELS) as BetStatus[]).map((s) => (
              <option key={s} value={s}>
                {BET_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          ) : null}
          <div className="ml-auto">
            <SegmentedControl
              label="Row density"
              value={density}
              onChange={setDensity}
              options={[
                { value: "compact", label: "Compact" },
                { value: "comfortable", label: "Comfortable" },
              ]}
            />
          </div>
        </div>
      </Card>

      {rows.length > 0 ? (
        <SummaryStrip className="mb-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCell
            label="Bets"
            value={String(summary.count)}
            sub={
              filtered
                ? `of ${bets.length} recorded`
                : `${summary.settledCount} settled`
            }
          />
          <SummaryCell
            label="Turnover"
            value={money(summary.totalStakedCents)}
            sub="Cash at risk, settled only"
          />
          <SummaryCell
            label="Net profit"
            value={summary.settledCount === 0 ? money(0) : signed(summary.totalProfitCents)}
            tone={
              summary.settledCount === 0
                ? "neutral"
                : summary.totalProfitCents >= 0
                  ? "positive"
                  : "negative"
            }
            sub={
              summary.settledCount === 0
                ? "Nothing settled yet"
                : `${(
                    (summary.totalProfitCents /
                      (summary.totalStakedCents || 1)) *
                    100
                  ).toFixed(1)}% on turnover`
            }
          />
          <SummaryCell
            label="ROI"
            value={
              summary.settledCount === 0
                ? "—"
                : `${(summary.roi * 100).toFixed(1)}%`
            }
            tone={
              summary.settledCount === 0
                ? "neutral"
                : summary.roi >= 0
                  ? "positive"
                  : "negative"
            }
            sub={
              summary.settledCount === 0
                ? "Needs a settled bet"
                : `Strike rate ${(summary.strikeRate * 100).toFixed(0)}%`
            }
          />
          <SummaryCell
            label="Pending"
            value={String(summary.count - summary.settledCount)}
            sub={`Avg odds ${
              summary.averageOdds > 0 ? summary.averageOdds.toFixed(2) : "—"
            }`}
          />
        </SummaryStrip>
      ) : null}

      {selectedIds.length > 0 ? (
        <Card className="mb-3 flex flex-wrap items-center justify-between gap-3 py-2.5">
          <span className="text-sm text-ink">
            {selectedIds.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted">
              Staked{" "}
              <span className="text-ink tabular-nums">
                {money(selectedStakedCents)}
              </span>
            </span>
            <span className="text-muted">
              Pays{" "}
              <span className="text-ink tabular-nums">
                {money(selectedPotentialCents)}
              </span>
            </span>
            {selectedStakedCents > 0 ? (
              <span className="text-muted">
                Margin{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    selectedPotentialCents - selectedStakedCents >= 0
                      ? "text-positive"
                      : "text-negative",
                  )}
                >
                  {(
                    ((selectedPotentialCents - selectedStakedCents) /
                      selectedStakedCents) *
                    100
                  ).toFixed(2)}
                  %
                </span>
              </span>
            ) : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={selectedIds.length < MIN_POSITION_LEGS}
                onClick={groupSelected}
              >
                Group as position
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={selectedPositions.length === 0}
                onClick={ungroupSelected}
              >
                Ungroup
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={bets.length === 0 ? "No bets yet" : "No bets match"}
          description={
            bets.length === 0
              ? "Record your first bet to start tracking profit and loss."
              : "Nothing matches these filters. Widen them, or clear them and start again."
          }
          action={
            bets.length === 0 ? (
              <Button
                variant="primary"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                New bet
              </Button>
            ) : (
              <Button variant="default" onClick={clearFilters}>
                Clear filters
              </Button>
            )
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : undefined
                        }
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "sticky top-0 z-10 cursor-pointer border-b border-line bg-panel px-2.5 py-2 text-xs font-medium tracking-wide whitespace-nowrap text-muted uppercase select-none hover:text-ink",
                          RIGHT_ALIGNED.has(header.column.id)
                            ? "text-right"
                            : "text-left",
                        )}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sorted ? (
                          <span className="ml-1 text-accent" aria-hidden="true">
                            {sorted === "asc" ? "↑" : "↓"}
                          </span>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="tabular-nums">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-line last:border-b-0 hover:bg-hover"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-2.5 align-middle",
                        rowPadding,
                        RIGHT_ALIGNED.has(cell.column.id) ? "text-right" : "",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Mounted only while it is open, and keyed to the bet it is editing, so
          each field starts from that bet rather than from a reset effect. */}
      {open ? (
        <BetForm
          key={editing ? `bet-${editing.id}` : "new-bet"}
          editing={editing}
          onClose={() => setOpen(false)}
        />
      ) : null}

      {marketFor ? (
        <MarketPanel
          bet={marketFor}
          onClose={() => setMarketFor(null)}
        />
      ) : null}
    </>
  );
}
