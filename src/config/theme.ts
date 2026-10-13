/**
 * Light, dark, or whatever the operating system says.
 *
 * The preference lives in the database and the *decision* is made here, as a
 * pure function, so it can be tested without a browser and so the pre-paint
 * script in `index.html` and the React provider cannot disagree about what the
 * stored value means.
 */
export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "dark",
  "light",
];

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: "System",
  dark: "Dark",
  light: "Light",
};

/**
 * A copy of the preference for the pre-paint script.
 *
 * Not the source of truth — the database is — but it is readable synchronously,
 * which is what stops the app painting in one theme and correcting itself a
 * frame later.
 */
export const THEME_STORAGE_KEY = "openodds.theme";

export function isThemePreference(
  value: string | null | undefined,
): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

/**
 * What the preference means right now.
 *
 * "system" is a live answer, not a one-off: a preference of system follows the OS
 * even when it changes while the app is open, which is why this takes the
 * current OS answer as an argument rather than reading it itself.
 */
export function resolveTheme(
  preference: string | null | undefined,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "dark" || preference === "light") return preference;
  return systemPrefersDark ? "dark" : "light";
}

export function systemPrefersDark(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  );
}

/** Write the resolved theme onto the document, where the tokens are read from. */
export function applyTheme(
  theme: ResolvedTheme,
  target: HTMLElement,
): void {
  target.dataset.theme = theme;
  target.style.colorScheme = theme;
}

export function cacheThemePreference(preference: ThemePreference): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // A full or unavailable store costs a first-paint flash, nothing more.
  }
}

export function readCachedThemePreference(): ThemePreference | null {
  try {
    const value = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}
