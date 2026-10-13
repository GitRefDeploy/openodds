import { useState } from "react";
import { useAppData } from "./DataProvider";
import { ThemeToggle } from "./ThemeProvider";
import { AppVersion } from "@/components/ui/AppVersion";
import { Button } from "@/components/ui/primitives";
import { Icon, type IconName } from "@/components/ui/icons";
import { legacyImportResult } from "@/db/legacy";
import { cn } from "@/lib/utils";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { BetsPage } from "@/features/bets/BetsPage";
import { PromosPage } from "@/features/promos/PromosPage";
import { StatsPage } from "@/features/stats/StatsPage";
import { BankrollPage } from "@/features/bankroll/BankrollPage";
import { BooksPage } from "@/features/books/BooksPage";
import { SportsPage } from "@/features/sports/SportsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SetupWizard } from "@/features/settings/SetupWizard";
import { ImportPage } from "@/features/import/ImportPage";

type Route =
  | "dashboard"
  | "bets"
  | "stats"
  | "promos"
  | "bankroll"
  | "import"
  | "books"
  | "sports"
  | "settings";

/**
 * Grouped rather than a flat list of eight: the first group is what you look at,
 * the second is what you record, and the third is what you configure — which is
 * also the order someone meets them in.
 */
const NAV_GROUPS: {
  label: string;
  items: { key: Route; label: string; icon: IconName }[];
}[] = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", icon: "dashboard" },
      { key: "bets", label: "Bets", icon: "bets" },
      { key: "stats", label: "Stats", icon: "stats" },
    ],
  },
  {
    label: "Record",
    items: [
      { key: "promos", label: "Promos", icon: "promos" },
      { key: "bankroll", label: "Bankroll", icon: "bankroll" },
      { key: "import", label: "Import", icon: "import" },
    ],
  },
  {
    label: "Configure",
    items: [
      { key: "books", label: "Bookmakers", icon: "books" },
      { key: "sports", label: "Sports", icon: "sports" },
      { key: "settings", label: "Settings", icon: "settings" },
    ],
  },
];

/**
 * Reports the one-time import of a previous installation's data.
 *
 * It is shown rather than silent because the other reading of an app that looks
 * empty is that the update ate years of bets, and it is dismissible because
 * after the first look it is only in the way. The outcome is read once, on the
 * first render: by this point the database is open, so the import has already
 * finished or already failed.
 */
function LegacyImportBanner() {
  const [outcome] = useState(() => legacyImportResult());
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || outcome.status === "none") return null;

  const failed = outcome.status === "failed";
  const keysArrived = outcome.status === "imported" && outcome.secrets.length > 0;

  return (
    <div
      className={cn(
        "mb-5 flex items-start gap-3 rounded-xl border border-line p-4",
        failed ? "bg-negative-soft" : "bg-positive-soft",
      )}
    >
      <div className={cn("flex-1 text-sm", failed ? "text-negative" : "text-ink")}>
        <p className="mb-1 font-semibold">
          {failed ? "Could not bring your earlier data across" : "Brought your data across"}
        </p>
        {outcome.status === "imported" && (
          <p>
            {outcome.database
              ? "Your bets, bookmakers and settings were copied from this machine's earlier installation, which is still on disk and untouched. "
              : "Some settings were recovered from this machine's earlier installation. "}
            {keysArrived
              ? "Your saved API key came too."
              : "Any saved API keys need entering again in Settings."}
          </p>
        )}
        {outcome.status === "failed" && (
          <p>
            Nothing was changed and the earlier installation still holds every bet.
            {" "}
            <span className="opacity-80">({outcome.reason})</span>
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
        Dismiss
      </Button>
    </div>
  );
}

export function App() {
  const { settings } = useAppData();
  const [route, setRoute] = useState<Route>("dashboard");

  if (settings.setupComplete !== "true") {
    return <SetupWizard />;
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-xs font-bold text-accent-ink">
            OO
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-ink">
              OpenOdds
            </span>
            <span className="block text-xs text-faint">Local · open source</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wider text-faint uppercase">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = route === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => setRoute(item.key)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-hover font-medium text-ink"
                          : "text-muted hover:bg-hover hover:text-ink",
                      )}
                    >
                      <Icon
                        name={item.icon}
                        className={active ? "text-accent" : "opacity-80"}
                      />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-line px-3 py-3">
          <ThemeToggle />
          <p className="px-1 pt-2 text-xs text-faint">
            <AppVersion />
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-canvas px-6 py-6">
        <LegacyImportBanner />
        {route === "dashboard" && <DashboardPage onNavigate={setRoute} />}
        {route === "bets" && <BetsPage />}
        {route === "stats" && <StatsPage onNavigate={setRoute} />}
        {route === "promos" && <PromosPage />}
        {route === "bankroll" && <BankrollPage />}
        {route === "import" && <ImportPage onNavigate={setRoute} />}
        {route === "books" && <BooksPage />}
        {route === "sports" && <SportsPage />}
        {route === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
