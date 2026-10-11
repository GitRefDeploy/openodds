import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { initRepo } from "@/db";
import type { Repo } from "@/db/repo";
import type { BetView, Book, Promo, Sport, TransactionView } from "@/db/types";
import type { OddsFormat } from "@/domain/odds";

export interface AppData {
  repo: Repo;
  settings: Record<string, string>;
  books: Book[];
  sports: Sport[];
  promos: Promo[];
  bets: BetView[];
  transactions: TransactionView[];
  currency: string;
  oddsFormat: OddsFormat;
  refresh: () => Promise<void>;
  saveSetting: (key: string, value: string) => Promise<void>;
}

const DataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useAppData must be used inside <DataProvider>");
  return ctx;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [books, setBooks] = useState<Book[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [bets, setBets] = useState<BetView[]>([]);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);

  const loadAll = useCallback(async (r: Repo) => {
    const [s, bk, sp, pr, bt, tx] = await Promise.all([
      r.getSettings(),
      r.listBooks(true),
      r.listSports(),
      r.listPromos(),
      r.allBets(),
      r.allTransactions(),
    ]);
    setSettings(s);
    setBooks(bk);
    setSports(sp);
    setPromos(pr);
    setBets(bt);
    setTransactions(tx);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await initRepo();
        if (cancelled) return;
        setRepo(r);
        await loadAll(r);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const refresh = useCallback(async () => {
    if (repo) await loadAll(repo);
  }, [repo, loadAll]);

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      if (!repo) return;
      await repo.setSetting(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [repo],
  );

  const value = useMemo<AppData | null>(() => {
    if (!repo) return null;
    return {
      repo,
      settings,
      books,
      sports,
      promos,
      bets,
      transactions,
      currency: settings.currency || "AUD",
      oddsFormat: (settings.oddsFormat as OddsFormat) || "decimal",
      refresh,
      saveSetting,
    };
  }, [repo, settings, books, sports, promos, bets, transactions, refresh, saveSetting]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-rose-800 bg-rose-950/40 p-5 text-sm text-rose-200">
          <p className="mb-1 font-semibold">Could not open the database</p>
          <p className="text-rose-300/90">{error}</p>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Opening database…
      </div>
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
