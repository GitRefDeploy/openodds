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
  ONBOARDING_DISMISSED_KEY,
  isChecklistHidden,
} from "@/features/dashboard/onboarding";
import { ThemeToggle } from "@/app/ThemeProvider";
import { AppVersion } from "@/components/ui/AppVersion";
import { getAppInfo } from "@/config/appInfo";
import { checkAndInstallUpdate, type UpdateProgress } from "@/config/updater";

// The feed probe, the private-feed token and the "Test the feed" button used to
// live on the Updates card. They now sit unrendered in `UpdateDiagnostics.tsx`,
// which explains what they are for and how to put them back.

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
          <h2 className="mb-3 text-sm font-semibold text-ink">
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
          <div className="mt-4">
            <Field
              label="Theme"
              hint="System follows your operating system, including when it changes while the app is open."
            >
              <ThemeToggle className="max-w-sm" />
            </Field>
          </div>
          <div className="mt-4">
            <Field
              label="Setup checklist"
              hint="The dashboard only shows it while something is still missing, so hiding it loses nothing."
            >
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={!isChecklistHidden(settings)}
                  onChange={(event) =>
                    void saveSetting(
                      ONBOARDING_DISMISSED_KEY,
                      event.target.checked ? "false" : "true",
                    )
                  }
                />
                Show the checklist on the dashboard
              </label>
            </Field>
          </div>
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
            a.download = `openodds-export-${new Date()
              .toISOString()
              .slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        />

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-ink">About</h2>
          <p className="text-sm text-muted">
            OpenOdds <AppVersion /> · MIT licensed. Runs entirely on your
            machine — there is no server, no account and no telemetry. All API
            keys are optional and entered by you.
          </p>
        </Card>
      </div>
    </>
  );
}

function UpdatesCard() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppInfo().then((info) => setCurrentVersion(info.version));
  }, []);

  const label = (() => {
    if (!progress) return null;
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
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Updates</h2>
        <Badge tone="neutral">
          {currentVersion ? `Running v${currentVersion}` : "Reading version…"}
        </Badge>
      </div>

      {label ? (
        <p
          className={
            "mt-3 text-sm " +
            (progress?.state === "error" ? "text-negative" : "text-ink")
          }
        >
          {label}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
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
      </div>
    </Card>
  );
}

function IntegrationsCard() {
  const storage = secretStorageKind();
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">
          Integrations (optional)
        </h2>
        <Badge tone={storage === "keychain" ? "positive" : "warning"}>
          {storage === "keychain"
            ? "Stored in OS keychain"
            : "Browser storage (dev preview)"}
        </Badge>
      </div>
      <p className="mb-4 text-xs text-faint">
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
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">
          {integration.label}
        </p>
        {configured ? (
          <Badge tone="positive">Configured</Badge>
        ) : (
          <Badge tone="neutral">Not configured</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-faint">{integration.description}</p>
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
        className="mt-2 inline-block text-xs text-info hover:underline"
      >
        Get a key →
      </a>
      <ApiUsageReadout source={integration.name} />
    </div>
  );
}

/**
 * What the free allowance has cost so far.
 *
 * It sits under the key it belongs to, because the figure that matters when you
 * are deciding whether to press a button that spends a credit is how much of the
 * month is left. The counts are what the provider reported back, not what the
 * app expected to spend. Nothing is shown until something has been called.
 */
function ApiUsageReadout({ source }: { source: string }) {
  const { repo } = useAppData();
  const [usage, setUsage] = useState<{
    calls: number;
    credits: number;
    remaining: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    repo
      .apiUsageThisMonth(source)
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch(() => {
        // A missing ledger is not worth an error on a settings screen.
        if (!cancelled) setUsage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, source]);

  if (!usage || usage.calls === 0) return null;

  return (
    <p className="mt-2 text-xs text-faint">
      {usage.calls} {usage.calls === 1 ? "call" : "calls"} this month ·{" "}
      {usage.credits} {usage.credits === 1 ? "credit" : "credits"} spent ·{" "}
      {usage.remaining === null
        ? "allowance not reported"
        : `${usage.remaining} left`}
    </p>
  );
}

function DataCard({ onExport }: { onExport: () => void | Promise<void> }) {
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold text-ink">Your data</h2>
      <p className="mb-3 text-sm text-muted">
        Everything lives in a local SQLite file. Use the export button as a
        backup before uninstalling or moving machines.
      </p>
      <div className="flex gap-2">
        <Button variant="default" onClick={() => onExport()}>
          Export all data (JSON)
        </Button>
      </div>
      <p className="mt-3 text-xs text-faint">
        Bringing bets in from a bookmaker's CSV statement lives on the Import
        page. Nothing is uploaded; the file is read on this machine.
      </p>
    </Card>
  );
}
