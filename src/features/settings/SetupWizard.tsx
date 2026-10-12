import { useState } from "react";
import { useAppData } from "@/app/DataProvider";
import { Button, Card, Field, Input, Select } from "@/components/ui/primitives";
import { BOOK_PRESETS } from "@/domain/taxonomy";
import type { OddsFormat } from "@/domain/odds";

const CURRENCIES = ["AUD", "NZD", "USD", "GBP", "EUR"];

export function SetupWizard() {
  const { saveSetting, repo, refresh, settings } = useAppData();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState(settings.currency || "AUD");
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>(
    (settings.oddsFormat as OddsFormat) || "decimal",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function finish() {
    setBusy(true);
    await saveSetting("currency", currency);
    await saveSetting("oddsFormat", oddsFormat);
    for (const name of selected) {
      await repo.createBook({ name, currency });
    }
    await saveSetting("setupComplete", "true");
    await refresh();
    setBusy(false);
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="w-full max-w-xl">
        <div className="mb-1 text-xs uppercase tracking-wide text-positive">
          Step {step + 1} of 3
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold text-ink">
              Welcome to Bet Tracker
            </h1>
            <p className="text-sm text-muted">
              A local-first tracker for betting profit and loss, promos and
              bankroll. Everything is stored on this machine — nothing is sent
              anywhere. You can change all of this later in Settings.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold text-ink">
              Preferences
            </h1>
            <Field label="Currency">
              <Select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Odds format"
              hint="Odds are stored as decimals internally; this only changes display."
            >
              <Select
                value={oddsFormat}
                onChange={(e) => setOddsFormat(e.target.value as OddsFormat)}
              >
                <option value="decimal">Decimal (2.50)</option>
                <option value="fractional">Fractional (3/2)</option>
                <option value="american">American (+150)</option>
              </Select>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold text-ink">
              Your bookmakers
            </h1>
            <p className="text-sm text-muted">
              Pick any you use, or add your own later. These are just labels —
              the app ships with none selected.
            </p>
            <div className="flex flex-wrap gap-2">
              {BOOK_PRESETS.map((name) => {
                const active = selected.includes(name);
                return (
                  <button
                    key={name}
                    onClick={() =>
                      setSelected((prev) =>
                        active
                          ? prev.filter((n) => n !== name)
                          : [...prev, name],
                      )
                    }
                    className={
                      "rounded-full border px-3 py-1.5 text-sm transition-colors " +
                      (active
                        ? "border-accent bg-positive-soft text-positive"
                        : "border-line text-ink hover:border-line")
                    }
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <Field label="Or type one">
              <div className="flex gap-2">
                <Input
                  placeholder="Custom bookmaker"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !selected.includes(value)) {
                        setSelected((prev) => [...prev, value]);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                />
              </div>
            </Field>
            {selected.length > 0 && (
              <p className="text-xs text-faint">
                Adding: {selected.join(", ")}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < 2 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" onClick={finish} disabled={busy}>
              {busy ? "Setting up…" : "Finish setup"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
