import { useState } from "react";
import { useAppData } from "./DataProvider";
import { cn } from "@/lib/utils";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { BetsPage } from "@/features/bets/BetsPage";
import { PromosPage } from "@/features/promos/PromosPage";
import { BankrollPage } from "@/features/bankroll/BankrollPage";
import { BooksPage } from "@/features/books/BooksPage";
import { SportsPage } from "@/features/sports/SportsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SetupWizard } from "@/features/settings/SetupWizard";

type Route =
  | "dashboard"
  | "bets"
  | "promos"
  | "bankroll"
  | "books"
  | "sports"
  | "settings";

const NAV: { key: Route; label: string; icon: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: "▦" },
  { key: "bets", label: "Bets", icon: "◧" },
  { key: "promos", label: "Promos", icon: "★" },
  { key: "bankroll", label: "Bankroll", icon: "◈" },
  { key: "books", label: "Bookmakers", icon: "◉" },
  { key: "sports", label: "Sports", icon: "◐" },
  { key: "settings", label: "Settings", icon: "⚙" },
];

export function App() {
  const { settings } = useAppData();
  const [route, setRoute] = useState<Route>("dashboard");

  if (settings.setupComplete !== "true") {
    return <SetupWizard />;
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-950/80">
        <div className="px-4 py-5">
          <p className="text-sm font-semibold tracking-tight text-slate-100">
            Bet Tracker
          </p>
          <p className="text-xs text-slate-500">Local · open source</p>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => setRoute(item.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                route === item.key
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
              )}
            >
              <span aria-hidden className="w-4 text-center opacity-70">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-4 py-4 text-xs text-slate-600">
          v0.1.0
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {route === "dashboard" && <DashboardPage />}
        {route === "bets" && <BetsPage />}
        {route === "promos" && <PromosPage />}
        {route === "bankroll" && <BankrollPage />}
        {route === "books" && <BooksPage />}
        {route === "sports" && <SportsPage />}
        {route === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
