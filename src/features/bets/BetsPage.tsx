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
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import {
  BET_CLASS_LABELS,
  groupOf,
  type BetClass,
} from "@/domain/betClass";
import { formatMoney } from "@/domain/money";
import { formatOdds } from "@/domain/odds";
import { BET_STATUS_LABELS, type BetStatus } from "@/domain/pnl";
import { MIN_POSITION_LEGS } from "@/domain/position";
import { BET_TYPE_LABELS, type BetView } from "@/db/types";
import {
  enrichAll,
  marginByPosition,
  type EnrichedBet,
} from "@/features/analytics/selectors";
import { formatDate } from "@/lib/utils";
import { BetForm } from "./BetForm";

const columnHelper = createColumnHelper<EnrichedBet>();

const STATUS_TONE: Record<
  BetStatus,
  "neutral" | "positive" | "negative" | "warning" | "info"
> = {
  pending: "info",
  won: "positive",
  lost: "negative",
  void: "neutral",
  cashout: "warning",
  half_won: "positive",
  half_lost: "negative",
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

export function BetsPage() {
  const { bets, books, sports, currency, oddsFormat, repo, refresh } =
    useAppData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BetView | null>(null);
  const [search, setSearch] = useState("");
  const [bookId, setBookId] = useState("");
  const [sportId, setSportId] = useState("");
  const [status, setStatus] = useState("");
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

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        header: ({ table: t }) => (
          <input
            type="checkbox"
            className="accent-emerald-500"
            aria-label="Select all bets"
            checked={t.getIsAllPageRowsSelected()}
            onChange={t.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="accent-emerald-500"
            aria-label="Select bet"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      }),
      columnHelper.accessor((r) => r.placed_at ?? r.created_at, {
        id: "date",
        header: "Date",
        cell: (info) => (
          <span className="text-slate-400">{formatDate(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("description", {
        header: "Bet",
        cell: (info) => (
          <span className="text-slate-200">
            {info.getValue() || "—"}
            {info.row.original.bet_type !== "single" && (
              <span className="ml-2 text-xs text-slate-500">
                {BET_TYPE_LABELS[info.row.original.bet_type]}
              </span>
            )}
          </span>
        ),
      }),
      columnHelper.accessor("book_name", {
        header: "Book",
        cell: (info) => <span className="text-slate-300">{info.getValue()}</span>,
      }),
      columnHelper.accessor((r) => r.sport_name ?? "—", {
        id: "sport",
        header: "Sport",
        cell: (info) => (
          <span className="text-slate-400">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("stake_cents", {
        header: "Stake",
        cell: (info) => money(info.getValue()),
      }),
      columnHelper.accessor("odds", {
        header: "Odds",
        cell: (info) => formatOdds(info.getValue(), oddsFormat),
      }),
      columnHelper.accessor((r) => r.clv, {
        id: "clv",
        header: "CLV",
        cell: (info) =>
          info.getValue() ? (
            <span className="text-slate-400">
              {formatOdds(info.getValue() as number, oddsFormat)}
            </span>
          ) : (
            <span className="text-slate-600">—</span>
          ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <Badge tone={STATUS_TONE[info.getValue() as BetStatus]}>
            {BET_STATUS_LABELS[info.getValue() as BetStatus]}
          </Badge>
        ),
      }),
      columnHelper.accessor((r) => r.bet_class, {
        id: "betClass",
        header: "Bet type",
        cell: (info) => (
          <Badge tone={classTone(info.getValue())}>
            {BET_CLASS_LABELS[info.getValue()] ?? info.getValue()}
          </Badge>
        ),
      }),
      columnHelper.accessor((r) => r.position_id, {
        id: "position",
        header: "Position",
        cell: (info) => {
          const positionId = info.getValue();
          if (positionId === null || positionId === undefined) {
            return <span className="text-slate-600">—</span>;
          }
          const margin = margins.get(positionId);
          if (margin === undefined) {
            return <Badge tone="info">Grouped</Badge>;
          }
          return (
            <Badge tone={margin < 0 ? "negative" : "info"}>
              {margin.toFixed(2)}%
            </Badge>
          );
        },
      }),
      columnHelper.accessor((r) => r.promo_value_cents, {
        id: "promo",
        header: "Promo",
        cell: (info) =>
          info.getValue() > 0 ? (
            <span className="text-emerald-400">{money(info.getValue())}</span>
          ) : (
            <span className="text-slate-600">—</span>
          ),
      }),
      columnHelper.accessor("profitCents", {
        header: "Profit",
        cell: (info) =>
          info.row.original.settled ? (
            <span
              className={
                info.getValue() >= 0
                  ? "font-medium text-emerald-400"
                  : "font-medium text-rose-400"
              }
            >
              {formatMoney(info.getValue(), currency, { signed: true })}
            </span>
          ) : (
            <span className="text-slate-600">—</span>
          ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <div className="flex justify-end gap-1">
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
                if (
                  !confirm(`Delete "${info.row.original.description}"?`)
                )
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, oddsFormat, margins, repo, refresh],
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

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input
            placeholder="Search description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">All bookmakers</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <Select value={sportId} onChange={(e) => setSportId(e.target.value)}>
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(Object.keys(BET_STATUS_LABELS) as BetStatus[]).map((s) => (
              <option key={s} value={s}>
                {BET_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {selectedIds.length > 0 && (
        <Card className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-300">
            {selectedIds.length} selected
          </span>
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
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={bets.length === 0 ? "No bets yet" : "No bets match"}
          description={
            bets.length === 0
              ? "Record your first bet to start tracking profit and loss."
              : "Try clearing the filters above."
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
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-slate-800">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-slate-400 select-none"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {header.column.getIsSorted() === "asc" && " ↑"}
                      {header.column.getIsSorted() === "desc" && " ↓"}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="tabular-nums">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-800/60 hover:bg-slate-800/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
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

      <BetForm open={open} onClose={() => setOpen(false)} editing={editing} />
    </>
  );
}
