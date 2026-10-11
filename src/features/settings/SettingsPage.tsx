import { useEffect, useState } from "react";
import { useAppData } from "@/app/DataProvider";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
} from "@/components/ui/primitives";
import {
  INTEGRATIONS,
  deleteSecret,
  hasSecret,
  saveSecret,
  secretStorageKind,
} from "@/config/secrets";
import type { OddsFormat } from "@/domain/odds";
import {
  checkAndInstallUpdate,
  type UpdateProgress,
} from "@/config/updater";

const CURRENCIES = ["AUD", "NZD", "USD", "GBP", "EUR"];

export function SettingsPage() {
  const { settings, saveSetting, repo, currency } = useAppData();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Preferences, optional data sources and your local data."
      />

      <div className="space-y-4">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            Preferences
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Display currency">
              <Select
                value={settings.currency ?? currency}
                onChange={(e) => saveSetting("currency", e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Odds format">
              <Select
                value={settings.oddsFormat ?? "decimal"}
                onChange={(e) =>
                  saveSetting("oddsFormat", e.target.value as OddsFormat)
                }
              >
                <option value="decimal">Decimal (2.50)</option>
                <option value="fractional">Fractional (3/2)</option>
                <option value="american">American (+150)</option>
              </Select>
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Odds are always stored as decimals internally. Changing this only
            affects how they are displayed and entered.
          </p>
        </Card>

        <UpdatesCard />

        <IntegrationsCard />

        <DataCard
          onExport={async () => {
            const data = await repo.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bet-tracker-export-${new Date()
              .toISOString()
              .slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-200">About</h2>
          <p className="text-sm text-slate-400">
            Bet Tracker v0.1.0 · MIT licensed. Runs entirely on your machine —
            there is no server, no account and no telemetry. All API keys are
            optional and entered by you.
          </p>
        </Card>
      </div>
    </>
  );
}

function UpdatesCard() {
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const label = (() => {
    if (!progress) return "You are running v0.1.0.";
    switch (progress.state) {
      case "checking":
        return "Checking for updates…";
      case "up-to-date":
        return "You are up to date.";
      case "available":
        return `Version ${progress.version} is available.`;
      case "downloading":
        return `Downloading ${progress.version ?? ""}${
          progress.percent !== undefined ? ` — ${progress.percent}%` : "…"
        }`;
      case "ready":
        return "Update installed. Restarting…";
      case "unavailable":
        return progress.message ?? "Updates are unavailable here.";
      case "error":
        return `Update failed: ${progress.message}`;
    }
  })();

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold text-slate-200">Updates</h2>
      <p className="mb-3 text-sm text-slate-400">{label}</p>
      <Button
        variant="default"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await checkAndInstallUpdate(setProgress);
          setBusy(false);
        }}
      >
        Check for updates
      </Button>
    </Card>
  );
}

function IntegrationsCard() {
  const storage = secretStorageKind();
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">
          Integrations (optional)
        </h2>
        <Badge tone={storage === "keychain" ? "positive" : "warning"}>
          {storage === "keychain"
            ? "Stored in OS keychain"
            : "Browser storage (dev preview)"}
        </Badge>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        The app works fully without these. Add a key only if you want to pull
        data automatically. Keys never leave this machine and are never written
        into the repository.
      </p>
      <div className="space-y-4">
        {INTEGRATIONS.map((integration) => (
          <IntegrationRow key={integration.name} integration={integration} />
        ))}
      </div>
    </Card>
  );
}

function IntegrationRow({
  integration,
}: {
  integration: (typeof INTEGRATIONS)[number];
}) {
  const [configured, setConfigured] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    hasSecret(integration.name).then(setConfigured);
  }, [integration.name]);

  return (
    <div className="rounded-lg border border-slate-800 p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-200">
          {integration.label}
        </p>
        {configured ? (
          <Badge tone="positive">Configured</Badge>
        ) : (
          <Badge tone="neutral">Not configured</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{integration.description}</p>
      <div className="mt-2 flex gap-2">
        <Input
          type="password"
          value={value}
          placeholder={configured ? "••••••••" : "Paste API key"}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="default"
          disabled={!value.trim()}
          onClick={async () => {
            await saveSecret(integration.name, value.trim());
            setValue("");
            setConfigured(true);
          }}
        >
          Save
        </Button>
        {configured && (
          <Button
            variant="ghost"
            onClick={async () => {
              await deleteSecret(integration.name);
              setConfigured(false);
            }}
          >
            Remove
          </Button>
        )}
      </div>
      <a
        href={integration.docsUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-xs text-sky-400 hover:underline"
      >
        Get a key →
      </a>
    </div>
  );
}

function DataCard({ onExport }: { onExport: () => void | Promise<void> }) {
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold text-slate-200">Your data</h2>
      <p className="mb-3 text-sm text-slate-400">
        Everything lives in a local SQLite file. Use the export button as a
        backup before uninstalling or moving machines.
      </p>
      <div className="flex gap-2">
        <Button variant="default" onClick={() => onExport()}>
          Export all data (JSON)
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        CSV import from bookmaker statements is planned for a future release.
      </p>
    </Card>
  );
}
