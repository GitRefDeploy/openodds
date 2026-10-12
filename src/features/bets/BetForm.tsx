import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAppData } from "@/app/DataProvider";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import {
  BET_CLASS_GROUP_LABELS,
  BET_CLASS_LABELS,
  classesInGroup,
  normaliseBetClass,
  traitsFor,
  type BetClass,
} from "@/domain/betClass";
import { formatMoney, toCents } from "@/domain/money";
import { combineLegOdds, formatOdds, parseOdds } from "@/domain/odds";
import { BET_STATUSES, BET_STATUS_LABELS, computeReturnCents } from "@/domain/pnl";
import { suggestPromoValueCents } from "@/domain/promo";
import { BET_TYPES, BET_TYPE_LABELS, type BetType, type BetView, type NewBet } from "@/db/types";
import { todayISO } from "@/lib/utils";

interface LegDraft {
  selection: string;
  market: string;
  odds: string;
}

interface PromoDraft {
  promoId: number;
  appliedValueCents: number;
}

export function BetForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing: BetView | null;
}) {
  const { repo, books, sports, promos, oddsFormat, currency, refresh } = useAppData();

  const [bookId, setBookId] = useState(0);
  const [sportId, setSportId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [betType, setBetType] = useState<BetType>("single");
  const [betClass, setBetClass] = useState<BetClass>("normal");
  const [stake, setStake] = useState("");
  const [odds, setOdds] = useState("");
  const [clv, setClv] = useState("");
  const [status, setStatus] = useState<string>("pending");
  const [returnAmount, setReturnAmount] = useState("");
  const [placedAt, setPlacedAt] = useState(todayISO());
  const [settledAt, setSettledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [legs, setLegs] = useState<LegDraft[]>([]);
  const [promoLinks, setPromoLinks] = useState<PromoDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // The class to fall back to if the Bonus Bet box is unticked, so ticking it
  // does not silently discard a choice like Arbitrage.
  const [classBeforeBonus, setClassBeforeBonus] = useState<BetClass>("normal");

  const activeSports = useMemo(
    () => sports.filter((s) => s.enabled === 1),
    [sports],
  );

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (!editing) {
      setBookId(books[0]?.id ?? 0);
      setSportId(activeSports[0]?.id ?? null);
      setDescription("");
      setBetType("single");
      setBetClass("normal");
      setClassBeforeBonus("normal");
      setStake("");
      setOdds("");
      setClv("");
      setStatus("pending");
      setReturnAmount("");
      setPlacedAt(todayISO());
      setSettledAt("");
      setNotes("");
      setLegs([]);
      setPromoLinks([]);
      return;
    }
    setBookId(editing.book_id);
    setSportId(editing.sport_id);
    setDescription(editing.description);
    setBetType(editing.bet_type);
    // Normalised on the way in: a bet stored before migration 5 still says
    // `profit_boost`, and the select must show Odds Boost rather than nothing.
    setBetClass(normaliseBetClass(editing.bet_class ?? "normal"));
    setClassBeforeBonus("normal");
    setStake((editing.stake_cents / 100).toFixed(2));
    setOdds(formatOdds(editing.odds, "decimal"));
    setClv(editing.clv ? formatOdds(editing.clv, "decimal") : "");
    setStatus(editing.status);
    setReturnAmount(
      editing.return_cents ? (editing.return_cents / 100).toFixed(2) : "",
    );
    setPlacedAt((editing.placed_at ?? todayISO()).slice(0, 10));
    setSettledAt(editing.settled_at ? editing.settled_at.slice(0, 10) : "");
    setNotes(editing.notes);
    (async () => {
      const [legRows, promoRows] = await Promise.all([
        repo.listLegs(editing.id),
        repo.listBetPromos(editing.id),
      ]);
      setLegs(
        legRows.map((l) => ({
          selection: l.selection,
          market: l.market,
          odds: formatOdds(l.odds, "decimal"),
        })),
      );
      setPromoLinks(
        promoRows.map((p) => ({
          promoId: p.promo_id,
          appliedValueCents: p.applied_value_cents,
        })),
      );
    })();
  }, [open, editing, books, activeSports, repo]);

  const isMulti = betType === "multi" || betType === "same_game_multi";

  const combinedOdds = useMemo(() => {
    if (!isMulti) return null;
    const parsed = legs
      .map((l) => parseOdds(l.odds, oddsFormat))
      .filter((n) => Number.isFinite(n) && n > 1);
    if (parsed.length !== legs.length || parsed.length === 0) return null;
    return combineLegOdds(parsed);
  }, [isMulti, legs, oddsFormat]);

  const stakeCents = toCents(stake);
  const effectiveOdds = isMulti && combinedOdds ? combinedOdds : parseOdds(odds, oddsFormat);
  const traits = traitsFor(betClass);
  const isBonusBet = betClass === "bonus_bet";

  /**
   * What a win would actually pay. This is the number that makes the bonus bet
   * rule visible before saving: the same stake at the same price pays less when
   * the stake is not returned.
   */
  const potentialPayoutCents = useMemo(() => {
    if (stakeCents <= 0 || !(effectiveOdds > 1)) return null;
    return computeReturnCents({
      stakeCents,
      decimalOdds: effectiveOdds,
      status: "won",
      stakeReturned: traits.stakeReturned,
    });
  }, [stakeCents, effectiveOdds, traits.stakeReturned]);

  function toggleBonusBet() {
    if (isBonusBet) {
      setBetClass(classBeforeBonus === "bonus_bet" ? "normal" : classBeforeBonus);
    } else {
      setClassBeforeBonus(betClass);
      setBetClass("bonus_bet");
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!bookId) next.bookId = "Choose a bookmaker";
    if (!description.trim()) next.description = "Describe the bet";
    if (stakeCents <= 0) next.stake = "Stake must be greater than zero";
    if (isMulti) {
      if (legs.length < 2) next.legs = "A multi needs at least two legs";
      else if (!combinedOdds) next.legs = "Every leg needs a valid price";
    } else if (!(effectiveOdds > 1)) {
      next.odds = "Enter a valid price";
    }
    if (clv.trim() && !(parseOdds(clv, oddsFormat) > 1)) {
      next.clv = "Closing price must be greater than 1";
    }
    if (status === "cashout" && toCents(returnAmount) <= 0) {
      next.returnAmount = "Enter the amount returned";
    }
    if (!placedAt) next.placedAt = "Choose a date";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setBusy(true);
    const input: NewBet = {
      bookId,
      sportId,
      description: description.trim(),
      betType,
      betClass,
      stakeCents,
      odds: effectiveOdds,
      clv: clv.trim() ? parseOdds(clv, oddsFormat) : null,
      status: status as NewBet["status"],
      returnCents: status === "cashout" ? toCents(returnAmount) : 0,
      placedAt,
      settledAt: settledAt || null,
      notes,
      legs: isMulti
        ? legs.map((l) => ({
            selection: l.selection,
            market: l.market,
            odds: parseOdds(l.odds, oddsFormat),
          }))
        : [],
      promos: promoLinks,
    };
    if (editing) await repo.updateBet(editing.id, input);
    else await repo.createBet(input);
    await refresh();
    setBusy(false);
    onClose();
  }

  function togglePromo(promoId: number) {
    setPromoLinks((prev) => {
      const existing = prev.find((p) => p.promoId === promoId);
      if (existing) return prev.filter((p) => p.promoId !== promoId);
      const promo = promos.find((p) => p.id === promoId);
      const suggested = promo
        ? suggestPromoValueCents(
            { type: promo.type, valueType: promo.value_type, value: promo.value },
            { stakeCents, decimalOdds: effectiveOdds > 1 ? effectiveOdds : 2 },
          )
        : 0;
      return [...prev, { promoId, appliedValueCents: suggested }];
    });
  }

  return (
    <Modal
      open={open}
      wide
      title={editing ? "Edit bet" : "New bet"}
      onClose={onClose}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Bookmaker">
          <Select
            value={bookId}
            onChange={(e) => setBookId(Number(e.target.value))}
          >
            <option value={0}>Select…</option>
            {books
              .filter((b) => b.archived === 0 || b.id === editing?.book_id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </Select>
          {errors.bookId && <ErrorText>{errors.bookId}</ErrorText>}
        </Field>

        <Field label="Sport">
          <Select
            value={sportId ?? ""}
            onChange={(e) =>
              setSportId(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">Unassigned</option>
            {activeSports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Description" className="md:col-span-2">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Randwick R5 — #3 Win"
          />
          {errors.description && <ErrorText>{errors.description}</ErrorText>}
        </Field>

        <Field label="Format" hint="The shape of the bet.">
          <Select
            value={betType}
            onChange={(e) => setBetType(e.target.value as BetType)}
          >
            {BET_TYPES.map((t) => (
              <option key={t} value={t}>
                {BET_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Bet type" hint="How it was placed. Used to group bets on the dashboard.">
          <Select
            value={betClass}
            onChange={(e) => setBetClass(e.target.value as BetClass)}
          >
            {(["strategy", "promo"] as const).map((group) => (
              <optgroup key={group} label={BET_CLASS_GROUP_LABELS[group]}>
                {classesInGroup(group).map((c) => (
                  <option key={c} value={c}>
                    {BET_CLASS_LABELS[c]}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <div className="md:col-span-2 rounded-lg border border-line p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={isBonusBet}
              onChange={toggleBonusBet}
            />
            Bonus Bet
          </label>
          {isBonusBet ? (
            <p className="mt-1 text-xs text-faint">
              Not your money, and the stake is never returned — a{" "}
              {formatMoney(stakeCents || 0, currency)} bonus bet at 2.40 pays
              about {formatMoney(Math.round((stakeCents || 0) * 1.4), currency)}{" "}
              where cash would pay{" "}
              {formatMoney(Math.round((stakeCents || 0) * 2.4), currency)}. A
              loss costs you nothing.
            </p>
          ) : traits.freeStake ? (
            <p className="mt-1 text-xs text-faint">
              {BET_CLASS_LABELS[betClass]} — not your money, so it is left out of
              the amount staked. The stake is still returned if it wins.
            </p>
          ) : (
            <p className="mt-1 text-xs text-faint">
              Tick this when the stake came from the bookmaker rather than your
              bankroll.
            </p>
          )}
        </div>

        <Field label="Stake" hint={traits.freeStake ? "Not counted as cash at risk." : undefined}>
          <Input
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
          {errors.stake && <ErrorText>{errors.stake}</ErrorText>}
        </Field>

        {!isMulti && (
          <Field label="Odds">
            <Input
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              placeholder={oddsFormat === "american" ? "+150" : "2.50"}
            />
            {errors.odds && <ErrorText>{errors.odds}</ErrorText>}
          </Field>
        )}

        <Field
          label="CLV"
          hint="The closing price at the off. Leave blank if you do not know it."
        >
          <Input
            value={clv}
            onChange={(e) => setClv(e.target.value)}
            placeholder={oddsFormat === "american" ? "+150" : "2.50"}
          />
          {errors.clv && <ErrorText>{errors.clv}</ErrorText>}
        </Field>

        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {BET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BET_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        {status === "cashout" && (
          <Field label="Amount returned">
            <Input
              value={returnAmount}
              onChange={(e) => setReturnAmount(e.target.value)}
              placeholder="0.00"
            />
            {errors.returnAmount && (
              <ErrorText>{errors.returnAmount}</ErrorText>
            )}
          </Field>
        )}

        <Field label="Placed">
          <Input
            type="date"
            value={placedAt}
            onChange={(e) => setPlacedAt(e.target.value)}
          />
          {errors.placedAt && <ErrorText>{errors.placedAt}</ErrorText>}
        </Field>

        <Field label="Settled">
          <Input
            type="date"
            value={settledAt}
            onChange={(e) => setSettledAt(e.target.value)}
          />
        </Field>

        {potentialPayoutCents !== null && (
          <p className="md:col-span-2 text-xs text-muted">
            Pays{" "}
            <span className="font-medium text-ink">
              {formatMoney(potentialPayoutCents, currency)}
            </span>{" "}
            if it wins
            {traits.freeStake ? ", none of which was staked by you" : ""}.
          </p>
        )}
      </div>

      {isMulti && (
        <div className="mt-5 rounded-lg border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Legs</h3>
            <div className="flex items-center gap-3">
              {combinedOdds && (
                <span className="text-xs text-muted">
                  Combined: {formatOdds(combinedOdds, oddsFormat)}
                </span>
              )}
              <Button
                size="sm"
                onClick={() =>
                  setLegs((prev) => [
                    ...prev,
                    { selection: "", market: "", odds: "" },
                  ])
                }
              >
                Add leg
              </Button>
            </div>
          </div>
          {legs.length === 0 && (
            <p className="text-xs text-faint">
              Add at least two legs for a multi.
            </p>
          )}
          <div className="space-y-2">
            {legs.map((leg, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Selection"
                  value={leg.selection}
                  onChange={(e) =>
                    setLegs((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, selection: e.target.value } : l,
                      ),
                    )
                  }
                />
                <Input
                  placeholder="Market"
                  value={leg.market}
                  onChange={(e) =>
                    setLegs((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, market: e.target.value } : l,
                      ),
                    )
                  }
                />
                <Input
                  className="w-24"
                  placeholder="Odds"
                  value={leg.odds}
                  onChange={(e) =>
                    setLegs((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, odds: e.target.value } : l,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setLegs((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
          {errors.legs && <ErrorText>{errors.legs}</ErrorText>}
        </div>
      )}

      <div className="mt-5 rounded-lg border border-line p-3">
        <h3 className="mb-2 text-sm font-semibold text-ink">
          Promos applied
        </h3>
        {promos.length === 0 ? (
          <p className="text-xs text-faint">
            No promos defined yet. Add them from the Promos page.
          </p>
        ) : (
          <div className="space-y-2">
            {promos.map((promo) => {
              const link = promoLinks.find((p) => p.promoId === promo.id);
              return (
                <div
                  key={promo.id}
                  className="flex items-center gap-3 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    className="accent-[var(--accent)]"
                    checked={!!link}
                    onChange={() => togglePromo(promo.id)}
                  />
                  <span className="flex-1">{promo.name}</span>
                  {link && (
                    <Input
                      className="w-28"
                      value={(link.appliedValueCents / 100).toFixed(2)}
                      onChange={(e) =>
                        setPromoLinks((prev) =>
                          prev.map((p) =>
                            p.promoId === promo.id
                              ? { ...p, appliedValueCents: toCents(e.target.value) }
                              : p,
                          ),
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
            <p className="text-xs text-faint">
              Promo value is the dollar benefit you got — adjust it to the true
              amount.
            </p>
          </div>
        )}
      </div>

      <Field label="Notes" className="mt-5">
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add bet"}
        </Button>
      </div>
    </Modal>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return <span className="text-xs text-negative">{children}</span>;
}
