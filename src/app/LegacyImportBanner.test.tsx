// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LegacyImportResult } from "@/db/legacy";
import { LegacyImportBanner } from "./LegacyImportBanner";

/**
 * The banner is the only thing that makes the import visible, and the case that
 * matters most is the quiet one: a copy that did not happen must say so, because
 * the user looking at an app they expect to hold their bets has no other way to
 * find out that it does not.
 */

const outcome = vi.hoisted(() => ({
  current: { status: "none" } as LegacyImportResult,
}));

vi.mock("@/db/legacy", () => ({ legacyImportResult: () => outcome.current }));

describe("LegacyImportBanner", () => {
  it("stays out of the way when there was nothing to import", () => {
    outcome.current = { status: "none" };
    const { container } = render(<LegacyImportBanner />);

    expect(container.firstChild).toBeNull();
  });

  it("says what came across, and can be dismissed", () => {
    outcome.current = {
      status: "imported",
      database: "/home/me/.config/io.github.bet-tracker.app/bet-tracker.db",
      secrets: ["the-odds-api", "formfav"],
    };
    const { container } = render(<LegacyImportBanner />);

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/bets, bookmakers and settings were copied/)).toBeTruthy();
    expect(screen.getByText(/saved API keys came too/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(container.firstChild).toBeNull();
  });

  it("tells the user to re-enter keys that could not be moved", () => {
    outcome.current = {
      status: "imported",
      database: "/old/bet-tracker.db",
      secrets: [],
    };
    render(<LegacyImportBanner />);

    expect(screen.getByText(/saved API keys need entering again/)).toBeTruthy();
  });

  it("reports a failed copy instead of claiming the data arrived", () => {
    outcome.current = { status: "failed", reason: "permission denied" };
    render(<LegacyImportBanner />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("still holds every bet");
    expect(alert.textContent).toContain("permission denied");
    expect(screen.queryByText(/Brought your data across/)).toBeNull();
  });
});
