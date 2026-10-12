// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyTheme,
  cacheThemePreference,
  isThemePreference,
  readCachedThemePreference,
  resolveTheme,
} from "./theme";

describe("resolveTheme", () => {
  it("takes an explicit preference over the system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the system when asked to, in both directions", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("treats anything it does not recognise as system", () => {
    // A database written by an older build, or edited by hand, must not leave
    // the app with no theme at all.
    expect(resolveTheme(undefined, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("solarized", true)).toBe("dark");
  });

  it("recognises only the three real preferences", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("DARK")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("writes the theme where the tokens are read from", () => {
    applyTheme("light", document.documentElement);
    expect(document.documentElement.dataset.theme).toBe("light");
    // Tells the browser which way round native controls should be, too.
    expect(document.documentElement.style.colorScheme).toBe("light");

    applyTheme("dark", document.documentElement);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});

describe("the cached preference", () => {
  it("round-trips, so the pre-paint script agrees with the provider", () => {
    cacheThemePreference("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(readCachedThemePreference()).toBe("light");
  });

  it("ignores a junk value rather than trusting it", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(readCachedThemePreference()).toBeNull();
  });
});
