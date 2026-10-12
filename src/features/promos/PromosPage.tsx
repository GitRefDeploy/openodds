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
import { formatMoney, toCents } from "@/domain/money";
import {
  PROMO_TYPES,
  PROMO_TYPE_LABELS,
  PROMO_VALUE_WORDING,
  describePromoValue,
  normalisePromoType,
  promoTypeLabel,
  type PromoType,
} from "@/domain/promo";
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
    watch,
    formState: { errors },
  } = useForm<PromoFormValues>({
    resolver: zodResolver(promoSchema),
    defaultValues: {
      name: "",
      type: "profit_boost",
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

  // The number field means something different for each kind of offer, so its
  // label and hint follow the selected type instead of staying generic. A bare
  // "Value" box is what let 30 be read as 30% of anything.
  const selectedType = normalisePromoType(
    (watch("type") ?? "profit_boost") as PromoType,
  );
  const valueWording = PROMO_VALUE_WORDING[selectedType];

  async function onSubmit(values: PromoFormValues) {
    await repo.createPromo({
      name: values.name.trim(),
      type: values.type as (typeof PROMO_TYPES)[number],
      valueType: values.valueType as "percent" | "fixed",
      // A percentage is stored as entered; a fixed amount is typed in dollars
      // and stored in cents like every other money value in the app.
      value:
        values.valueType === "fixed"
          ? toCents(values.value)
          : Number(values.value),
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
        description="Profit boosts, cashback, deposit matches and other offers — tracked separately from organic profit."
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
                    <p className="font-medium text-ink">{promo.name}</p>
                    <p className="text-xs text-faint">
                      {promo.book_id
                        ? books.find((b) => b.id === promo.book_id)?.name
                        : "Any bookmaker"}
                    </p>
                  </div>
                  <Badge tone="info">{promoTypeLabel(promo.type)}</Badge>
                </div>
                <p className="text-sm text-ink">
                  {describePromoValue(
                    {
                      type: promo.type,
                      valueType: promo.value_type,
                      value: promo.value,
                    },
                    (cents) => formatMoney(cents, currency),
                  )}
                  {promo.min_odds > 0 && (
                    <span className="ml-2 text-xs text-faint">
                      min odds {promo.min_odds.toFixed(2)}
                    </span>
                  )}
                </p>
                <div className="mt-auto flex items-center justify-between border-t border-line pt-2 text-xs">
                  <span className="text-muted">
                    Used on {u?.count ?? 0} bets
                  </span>
                  <span className="text-positive">
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
            <Input {...register("name")} placeholder="e.g. 30% profit boost" />
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
            <Field label="Value is">
              <Select {...register("valueType")}>
                <option value="percent">A percentage</option>
                <option value="fixed">A fixed amount</option>
              </Select>
            </Field>
            <Field label={valueWording.label} hint={valueWording.hint}>
              <Input
                {...register("value")}
                placeholder={valueWording.placeholder}
                inputMode="decimal"
              />
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
  return <span className="text-xs text-negative">{children}</span>;
}
