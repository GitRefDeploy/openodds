import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import {
  THEME_PREFERENCE_LABELS,
  THEME_PREFERENCES,
  applyTheme,
  cacheThemePreference,
  isThemePreference,
  resolveTheme,
  systemPrefersDark,
  type ResolvedTheme,
  type ThemePreference,
} from "@/config/theme";
import { cn } from "@/lib/utils";
import { useAppData } from "./DataProvider";

interface ThemeValue {
  /** What the user chose, which may be "system". */
  preference: ThemePreference;
  /** What that means right now, after asking the OS. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}

const THEME_ICONS: Record<ThemePreference, IconName> = {
  system: "system",
  dark: "dark",
  light: "light",
};

/**
 * Keeps the document's theme in step with the stored preference.
 *
 * "System" has to mean *live* system: a machine that switches to light at sunset
 * should take the app with it rather than waiting for a restart. That is why the
 * media query is watched rather than read once.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, saveSetting } = useAppData();
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const preference: ThemePreference = isThemePreference(settings.theme)
    ? settings.theme
    : "system";
  const theme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(theme, document.documentElement);
    // Cached for the pre-paint script in index.html, which cannot wait for the
    // database to load before choosing a colour scheme.
    cacheThemePreference(preference);
  }, [theme, preference]);

  const value = useMemo<ThemeValue>(
    () => ({
      preference,
      theme,
      setPreference: (next: ThemePreference) => {
        void saveSetting("theme", next);
      },
    }),
    [preference, theme, saveSetting],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function ThemeToggle({
  className,
  variant = "full",
}: {
  className?: string;
  /**
   * `full` shows an icon beside each label; `compact` drops the icon and tightens
   * the padding so the control fits a narrow column.
   *
   * The sidebar needs the compact one, and not because of taste. Three buttons
   * carrying an icon, a gap and a label each measure 73–76px, and flex items will
   * not shrink below their own content, so the row wanted ~240px inside the
   * sidebar's 216px content box — and, since the overflow was visible on both
   * the group and the footer, the extra painted *outside* the sidebar and under
   * the main pane. The labels are what make the control usable; the icons were
   * the ~45px that could go. The group's `aria-label` and each button's
   * `aria-pressed` already say everything the icons did, and Settings keeps the
   * full control where there is room for it.
   */
  variant?: "full" | "compact";
}) {
  const { preference, setPreference } = useTheme();
  const compact = variant === "compact";

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={cn(
        "flex items-center gap-1 rounded-lg border border-edge bg-raised p-1",
        compact && "w-full gap-0.5",
        className,
      )}
    >
      {THEME_PREFERENCES.map((option) => {
        const active = preference === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => setPreference(option)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-md text-xs transition-colors",
              compact ? "gap-1 px-1.5 py-1" : "gap-1.5 px-2 py-1",
              active
                ? "bg-accent text-accent-ink"
                : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {!compact && <Icon name={THEME_ICONS[option]} size={14} />}
            {THEME_PREFERENCE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
