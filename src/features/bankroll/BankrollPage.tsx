import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  Textarea,
} from "@/components/ui/primitives";
import {
  computeBalanceCents,
  signedTransactionCents,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
  type TransactionType,
} from "@/domain/bankroll";
import { formatMoney, toCents, toMajor } from "@/domain/money";
import { enrichAll } from "@/features/analytics/selectors";
import { formatDate, todayISO } from "@/lib/utils";

export function BankrollPage() {
  const { repo, transactions, bets, books, currency, refresh } = useAppData();
  const [open, setOpen] = useState(false);

  const [bookId, setBookId] = useState<number>(0);
  const [type, setType] = useState<TransactionType>("deposit");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [notes, setNotes] = useState("");

  const enriched = useMemo(() => enrichAll(bets), [bets]);
  const realisedProfit = useMemo(
    () =>
      enriched
        .filter((b) => b.settled)
        .reduce((acc, b) => acc + b.profitCents, 0),
    [enriched],
  );

  const balance = computeBalanceCents({
    transactions: transactions.map((t) => ({
      type: t.type,
      amountCents: t.amount_cents,
    })),
    realisedBetProfitCents: realisedProfit,
  });

  const totalDeposited = transactions
    .filter((t) => t.type === "deposit")
    .reduce((a, t) => a + t.amount_cents, 0);
  const totalWithdrawn = transactions
    .filter((t) => t.type === "withdrawal")
    .reduce((a, t) => a + t.amount_cents, 0);

  const curve = useMemo(() => {
    const events: { date: string; delta: number }[] = [];
    for (const t of transactions) {
      events.push({
        date: (t.occurred_at ?? t.created_at).slice(0, 10),
        delta: signedTransactionCents({ type: t.type, amountCents: t.amount_cents }),
      });
    }
    for (const b of enriched) {
      if (!b.settled) continue;
      events.push({
        date: (b.settled_at ?? b.placed_at ?? b.created_at).slice(0, 10),
        delta: b.profitCents,
      });
    }
    events.sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return events.map((e) => {
      running += e.delta;
      return { date: e.date, balance: toMajor(running) };
    });
  }, [transactions, enriched]);

  const money = (cents: number) => formatMoney(cents, currency);

  async function addTransaction() {
    if (!bookId) return;
    const amountCents = toCents(amount);
    if (amountCents <= 0) return;
    await repo.createTransaction({
      bookId,
      type,
      amountCents,
      occurredAt,
      notes,
    });
    await refresh();
    setAmount("");
    setNotes("");
    setOpen(false);
  }

  const activeBooks = books.filter((b) => b.archived === 0);

  return (
    <>
      <PageHeader
        title="Bankroll"
        description="Cash in and out. Bet stakes and returns are derived from the Bets page, so they are never double-counted here."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setBookId(activeBooks[0]?.id ?? 0);
              setOpen(true);
            }}
            disabled={activeBooks.length === 0}
          >
            Add transaction
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat
          label="Current balance"
          value={money(balance)}
          tone={balance >= 0 ? "positive" : "negative"}
          sub="Deposits − withdrawals + realised P/L"
        />
        <Stat label="Total deposited" value={money(totalDeposited)} />
        <Stat label="Total withdrawn" value={money(totalWithdrawn)} />
      </div>

      {activeBooks.length === 0 && (
        <Card className="mt-4 text-sm text-slate-400">
          Add a bookmaker first — cash movements are recorded against a book.
        </Card>
      )}

      <Card className="mt-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">
          Bankroll over time
        </h2>
        {curve.length === 0 ? (
          <p className="text-sm text-slate-500">
            No transactions or settled bets yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={curve}>
              <defs>
                <linearGradient id="bankFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} width={64} />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: number) => [
                  money(Math.round(value * 100)),
                  "Balance",
                ]}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#38bdf8"
                fill="url(#bankFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="mt-4 p-0">
        {transactions.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No transactions recorded yet.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 text-left font-medium">Date</th>
                <th className="px-3 py-2.5 text-left font-medium">Book</th>
                <th className="px-3 py-2.5 text-left font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {transactions.map((t) => {
                const signed = signedTransactionCents({
                  type: t.type,
                  amountCents: t.amount_cents,
                });
                return (
                  <tr key={t.id} className="border-b border-slate-800/60">
                    <td className="px-3 py-2.5 text-slate-400">
                      {formatDate(t.occurred_at ?? t.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">{t.book_name}</td>
                    <td className="px-3 py-2.5">
                      <Badge
                        tone={t.type === "withdrawal" ? "warning" : "info"}
                      >
                        {TRANSACTION_TYPE_LABELS[t.type]}
                      </Badge>
                    </td>
                    <td
                      className={
                        "px-3 py-2.5 text-right font-medium " +
                        (signed >= 0 ? "text-emerald-400" : "text-rose-400")
                      }
                    >
                      {formatMoney(signed, currency, { signed: true })}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await repo.deleteTransaction(t.id);
                          await refresh();
                        }}
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={open}
        title="Add transaction"
        onClose={() => setOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bookmaker">
              <Select
                value={bookId}
                onChange={(e) => setBookId(Number(e.target.value))}
              >
                {activeBooks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as TransactionType)}
              >
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TRANSACTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={addTransaction}>
              Add transaction
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
