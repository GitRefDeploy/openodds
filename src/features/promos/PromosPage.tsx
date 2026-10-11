import { useEffect, useState, type ReactNode } from "react";
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
  Textarea,
} from "@/components/ui/primitives";
import { formatMoney } from "@/domain/money";
import { PROMO_TYPES, PROMO_TYPE_LABELS } from "@/domain/promo";
import { promoSchema, type PromoForm as PromoFormValues } from "@/lib/validation";

interface Usage {
  promo_id: number;
  count: number;
  total_value_cents: number;
}

export function PromosPage() {
  const { repo, promos, books, currency, refresh } = useAppData();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<Usage[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PromoFormValues>({
    resolver: zodResolver(promoSchema),
    defaultValues: {
      name: "",
      type: "bonus_bet",
      valueType: "percent",
      value: "100",
      minOdds: "",
      bookId: "",
      notes: "",
    },
  });

  useEffect(() => {
    repo.promoUsage().then(setUsage);
  }, [repo, promos]);

  async function onSubmit(values: PromoFormValues) {
    await repo.createPromo({
      name: values.name.trim(),
      type: values.type as (typeof PROMO_TYPES)[number],
      valueType: values.valueType as "percent" | "fixed",
      value: Number(values.value),
      minOdds: values.minOdds ? Number(values.minOdds) : 0,
      bookId: values.bookId ? Number(values.bookId) : null,
      notes: values.notes,
    });
    await refresh();
    reset();
    setOpen(false);
  }

  const usageFor = (id: number) => usage.find((u) => u.promo_id === id);

  return (
    <>
      <PageHeader
        title="Promos"
        description="Bonus bets, odds boosts, cashback and other offers — tracked separately from organic profit."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            New promo
          </Button>
        }
      />

      {promos.length === 0 ? (
        <EmptyState
          title="No promos yet"
          description="Define the promos you use, then attach them to bets to see how much value they actually delivered."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              New promo
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {promos.map((promo) => {
            const u = usageFor(promo.id);
            return (
              <Card key={promo.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-100">{promo.name}</p>
                    <p className="text-xs text-slate-500">
                      {promo.book_id
                        ? books.find((b) => b.id === promo.book_id)?.name
                        : "Any bookmaker"}
                    </p>
                  </div>
                  <Badge tone="info">{PROMO_TYPE_LABELS[promo.type]}</Badge>
                </div>
                <p className="text-sm text-slate-300">
                  {promo.value_type === "percent"
                    ? `${promo.value}%`
                    : formatMoney(promo.value, currency)}
                  {promo.min_odds > 0 && (
                    <span className="ml-2 text-xs text-slate-500">
                      min odds {promo.min_odds.toFixed(2)}
                    </span>
                  )}
                </p>
                <div className="mt-auto flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
                  <span className="text-slate-400">
                    Used on {u?.count ?? 0} bets
                  </span>
                  <span className="text-emerald-400">
                    {formatMoney(u?.total_value_cents ?? 0, currency)} value
                  </span>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!confirm(`Delete promo "${promo.name}"?`)) return;
                      await repo.deletePromo(promo.id);
                      await refresh();
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} title="New promo" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name">
            <Input {...register("name")} placeholder="e.g. 20% odds boost" />
            {errors.name && <Error>{errors.name.message}</Error>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select {...register("type")}>
                {PROMO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PROMO_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Value type">
              <Select {...register("valueType")}>
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </Select>
            </Field>
            <Field label="Value">
              <Input {...register("value")} placeholder="100" />
              {errors.value && <Error>{errors.value.message}</Error>}
            </Field>
            <Field label="Minimum odds">
              <Input {...register("minOdds")} placeholder="optional" />
            </Field>
          </div>
          <Field label="Restricted to bookmaker">
            <Select {...register("bookId")}>
              <option value="">Any bookmaker</option>
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea rows={2} {...register("notes")} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Add promo
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Error({ children }: { children?: ReactNode }) {
  return <span className="text-xs text-rose-400">{children}</span>;
}
