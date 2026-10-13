import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTEGRATIONS } from "@/config/secrets";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const ACCOUNTS = INTEGRATIONS.map((integration) => integration.name);

/**
 * A fresh module per test: the outcome is remembered so the UI can read it after
 * the fact, which is exactly the state that would otherwise leak across tests.
 */
async function loadLegacy() {
  vi.resetModules();
  return import("./legacy");
}

function enterTauri() {
  (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

describe("importLegacyIdentity", () => {
  beforeEach(() => {
    invoke.mockReset();
    enterTauri();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("asks for the old database, the current keychain service and every integration", async () => {
    invoke.mockResolvedValue({
      database: "/home/me/.config/io.github.bet-tracker.app/bet-tracker.db",
      secrets: ["the-odds-api"],
    });
    const { importLegacyIdentity } = await loadLegacy();

    const result = await importLegacyIdentity("openodds.db");

    expect(invoke).toHaveBeenCalledWith("import_legacy_identity", {
      file: "openodds.db",
      service: "openodds",
      accounts: ACCOUNTS,
    });
    expect(result).toEqual({
      status: "imported",
      database: "/home/me/.config/io.github.bet-tracker.app/bet-tracker.db",
      secrets: ["the-odds-api"],
    });
  });

  it("keeps the outcome readable afterwards, for the banner that reports it", async () => {
    invoke.mockResolvedValue({ database: "/old/bet-tracker.db", secrets: [] });
    const { importLegacyIdentity, legacyImportResult } = await loadLegacy();

    expect(legacyImportResult()).toEqual({ status: "none" });
    await importLegacyIdentity("openodds.db");

    expect(legacyImportResult()).toEqual({
      status: "imported",
      database: "/old/bet-tracker.db",
      secrets: [],
    });
  });

  it("reports nothing to do on a machine that never had the old version", async () => {
    invoke.mockResolvedValue({ database: null, secrets: [] });
    const { importLegacyIdentity } = await loadLegacy();

    expect(await importLegacyIdentity("openodds.db")).toEqual({ status: "none" });
  });

  it("reports a failure instead of throwing, so the app still opens", async () => {
    invoke.mockRejectedValue(new Error("no such file"));
    const { importLegacyIdentity } = await loadLegacy();

    expect(await importLegacyIdentity("openodds.db")).toEqual({
      status: "failed",
      reason: "no such file",
    });
  });

  it("describes a non-Error rejection too", async () => {
    invoke.mockRejectedValue("permission denied");
    const { importLegacyIdentity } = await loadLegacy();

    expect(await importLegacyIdentity("openodds.db")).toEqual({
      status: "failed",
      reason: "permission denied",
    });
  });

  it("does nothing in the browser preview, where there is no old install", async () => {
    delete (globalThis as Record<string, unknown>).__TAURI_INTERNALS__;
    const { importLegacyIdentity } = await loadLegacy();

    expect(await importLegacyIdentity("openodds.db")).toEqual({ status: "none" });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks only once, so a double mount cannot copy the same file twice", async () => {
    invoke.mockResolvedValue({ database: "/old/bet-tracker.db", secrets: [] });
    const { importLegacyIdentity } = await loadLegacy();

    await Promise.all([
      importLegacyIdentity("openodds.db"),
      importLegacyIdentity("openodds.db"),
    ]);
    await importLegacyIdentity("openodds.db");

    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
