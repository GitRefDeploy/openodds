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

function appData(settings: Record<string, string> = {}): AppData {
  return {
    repo: {} as unknown as AppData["repo"],
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
  mocks.data = appData();
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
