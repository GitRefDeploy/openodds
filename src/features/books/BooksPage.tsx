import { useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import { formatMoney } from "@/domain/money";
import { byBook, enrichAll } from "@/features/analytics/selectors";
import { bookSchema, type BookForm } from "@/lib/validation";

export function BooksPage() {
  const { repo, books, bets, currency, refresh } = useAppData();
  const [open, setOpen] = useState(false);

  const stats = useMemo(() => byBook(enrichAll(bets)), [bets]);
  const statsFor = (bookId: number) =>
    stats.find((s) => s.key === String(bookId));

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BookForm>({
    resolver: zodResolver(bookSchema),
    defaultValues: {
      name: "",
      kind: "bookmaker",
      currency,
      commissionRate: "",
    },
  });

  async function onSubmit(values: BookForm) {
    await repo.createBook({
      name: values.name.trim(),
      kind: values.kind,
      currency: values.currency,
      commissionRate: values.commissionRate ? Number(values.commissionRate) : 0,
    });
    await refresh();
    reset({ name: "", kind: "bookmaker", currency, commissionRate: "" });
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Bookmakers"
        description="The books and exchanges you bet with. Nothing is pre-configured — add only what you use."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            Add bookmaker
          </Button>
        }
      />

      {books.length === 0 ? (
        <EmptyState
          title="No bookmakers yet"
          description="Add the bookmakers you bet with. You'll pick from this list when recording a bet."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              Add bookmaker
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => {
            const s = statsFor(book.id);
            return (
              <Card key={book.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: book.color }}
                    />
                    <p className="font-medium text-ink">{book.name}</p>
                  </div>
                  {book.archived === 1 ? (
                    <Badge tone="neutral">Archived</Badge>
                  ) : (
                    <Badge tone="info">
                      {book.kind === "exchange" ? "Exchange" : "Bookmaker"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-faint">
                  {book.currency}
                  {book.commission_rate > 0 &&
                    ` · ${(book.commission_rate * 100).toFixed(0)}% commission`}
                </p>
                <div className="mt-auto flex items-center justify-between border-t border-line pt-2 text-xs">
                  <span className="text-muted">
                    {s?.count ?? 0} settled bets
                  </span>
                  <span
                    className={
                      (s?.profitCents ?? 0) >= 0
                        ? "text-positive"
                        : "text-negative"
                    }
                  >
                    {formatMoney(s?.profitCents ?? 0, currency, {
                      signed: true,
                    })}
                  </span>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await repo.updateBook(book.id, {
                        archived: book.archived === 0,
                      });
                      await refresh();
                    }}
                  >
                    {book.archived === 0 ? "Archive" : "Restore"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} title="Add bookmaker" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name">
            <Input {...register("name")} placeholder="e.g. Sportsbet" />
            {errors.name && <ErrorText>{errors.name.message}</ErrorText>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select {...register("kind")}>
                <option value="bookmaker">Bookmaker</option>
                <option value="exchange">Exchange</option>
              </Select>
            </Field>
            <Field label="Currency">
              <Input {...register("currency")} />
            </Field>
          </div>
          <Field
            label="Commission rate"
            hint="Exchanges only, as a decimal (0.05 = 5%)."
          >
            <Input {...register("commissionRate")} placeholder="0" />
            {errors.commissionRate && (
              <ErrorText>{errors.commissionRate.message}</ErrorText>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Add bookmaker
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function ErrorText({ children }: { children?: ReactNode }) {
  return <span className="text-xs text-negative">{children}</span>;
}
