// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AppData } from "@/app/DataProvider";
import { ThemeProvider } from "@/app/ThemeProvider";
import { ONBOARDING_DISMISSED_KEY } from "@/features/dashboard/onboarding";
import { SettingsPage } from "./SettingsPage";

/**
 * Hiding the dashboard checklist was a one-way door: the preference was written
 * and nothing in the app could write it back, so the only way to see the
 * checklist again was to clear your data. This is the control that reopens it.
 */

const mocks = vi.hoisted(() => ({
  saveSetting: vi.fn(),
  data: undefined as unknown as AppData,
}));

vi.mock("@/app/DataProvider", () => ({
  useAppData: () => mocks.data,
}));

const usage = vi.hoisted(() => ({
  source: "the-odds-api",
  value: { calls: 0, credits: 0, remaining: null as number | null },
}));

function appData(settings: Record<string, string> = {}): AppData {
  return {
    // The allowance readout asks for the ledger on mount, so the double has to
    // answer that call the way the real repo does.
    repo: {
      apiUsageThisMonth: async (source: string) =>
        source === usage.source
          ? usage.value
          : { calls: 0, credits: 0, remaining: null },
    } as unknown as AppData["repo"],
    settings,
    books: [],
    sports: [],
    promos: [],
    bets: [],
    transactions: [],
    currency: "AUD",
    oddsFormat: "decimal",
    refresh: vi.fn(),
    saveSetting: mocks.saveSetting,
  };
}

/** The theme toggle needs its provider, which needs the app data above. */
function renderSettings() {
  return render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  );
}

const checklistToggle = () =>
  screen.getByLabelText(/Show the checklist on the dashboard/) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveSetting.mockResolvedValue(undefined);
  usage.value = { calls: 0, credits: 0, remaining: null };
  mocks.data = appData();
});

describe("the allowance readout", () => {
  it("says nothing before a provider has been called", () => {
    renderSettings();

    // An empty state here would be noise on every fresh install.
    expect(screen.queryByText(/this month/)).toBeNull();
  });

  it("reports what the month has cost once something has been called", async () => {
    usage.value = { calls: 3, credits: 2, remaining: 497 };
    renderSettings();

    expect(await screen.findByText(/3 calls this month/)).toBeTruthy();
    expect(screen.getByText(/2 credits spent/)).toBeTruthy();
    expect(screen.getByText(/497 left/)).toBeTruthy();
    // Only the provider that was called says anything: the two keys are
    // accounted for separately.
    expect(screen.getAllByText(/this month/)).toHaveLength(1);
  });

  it("does not claim an allowance figure the provider never gave", async () => {
    usage.value = { calls: 1, credits: 0, remaining: null };
    renderSettings();

    // A free call reports no remaining figure, and zero would be a different
    // claim: that the allowance is gone.
    expect(await screen.findByText(/1 call this month/)).toBeTruthy();
    expect(screen.getByText(/allowance not reported/)).toBeTruthy();
  });
});

describe("bringing the setup checklist back", () => {
  it("is ticked while the checklist is showing", () => {
    renderSettings();
    expect(checklistToggle().checked).toBe(true);
  });

  it("is unticked once it has been hidden", () => {
    mocks.data = appData({ [ONBOARDING_DISMISSED_KEY]: "true" });
    renderSettings();
    expect(checklistToggle().checked).toBe(false);
  });

  it("writes the preference the dashboard reads", () => {
    mocks.data = appData({ [ONBOARDING_DISMISSED_KEY]: "true" });
    renderSettings();

    fireEvent.click(checklistToggle());

    expect(mocks.saveSetting).toHaveBeenCalledWith(
      ONBOARDING_DISMISSED_KEY,
      "false",
    );
  });

  it("hides it again from the same control", () => {
    renderSettings();

    fireEvent.click(checklistToggle());

    expect(mocks.saveSetting).toHaveBeenCalledWith(
      ONBOARDING_DISMISSED_KEY,
      "true",
    );
  });

  it("says that hiding it costs nothing", () => {
    renderSettings();
    // The checklist only ever appears while a step is outstanding, so nobody
    // should have to wonder what they are giving up by hiding it.
    expect(
      screen.getByText(/only shows it while something is still missing/i),
    ).toBeTruthy();
  });
});
