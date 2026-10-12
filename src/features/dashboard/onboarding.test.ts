import { describe, expect, it } from "vitest";
import {
  ONBOARDING_DISMISSED_KEY,
  buildChecklist,
  checklistProgress,
  isChecklistHidden,
  type OnboardingInput,
} from "./onboarding";

const NOTHING: OnboardingInput = {
  bookCount: 0,
  betCount: 0,
  depositCount: 0,
  promoCount: 0,
};

describe("the onboarding checklist", () => {
  it("asks for everything on a fresh install", () => {
    const progress = checklistProgress(NOTHING);
    expect(progress.total).toBe(4);
    expect(progress.completed).toBe(0);
    expect(progress.remaining).toBe(4);
    expect(progress.steps.map((step) => step.key)).toEqual([
      "book",
      "bet",
      "bankroll",
      "promo",
    ]);
    expect(progress.steps.every((step) => !step.done)).toBe(true);
  });

  it("ticks a step only when its own thing exists", () => {
    // One bet in the database does not mean a bookmaker, a deposit or a promo.
    const progress = checklistProgress({ ...NOTHING, betCount: 3 });
    const byKey = Object.fromEntries(
      progress.steps.map((step) => [step.key, step.done]),
    );
    expect(byKey).toEqual({
      book: false,
      bet: true,
      bankroll: false,
      promo: false,
    });
    expect(progress.completed).toBe(1);
    expect(progress.remaining).toBe(3);
  });

  it("finishes when there is nothing left to ask for", () => {
    const progress = checklistProgress({
      bookCount: 2,
      betCount: 40,
      depositCount: 1,
      promoCount: 3,
    });
    expect(progress.remaining).toBe(0);
    expect(progress.completed).toBe(4);
  });

  it("sends each step somewhere that can actually do it", () => {
    const routes = buildChecklist(NOTHING).map((step) => step.route);
    expect(new Set(routes).size).toBe(4);
    expect(routes).toContain("books");
    expect(routes).toContain("bets");
    expect(routes).toContain("bankroll");
    expect(routes).toContain("promos");
  });
});

describe("hiding the checklist", () => {
  it("is shown on a fresh install", () => {
    expect(isChecklistHidden({})).toBe(false);
  });

  it("is hidden only by the stored preference", () => {
    expect(isChecklistHidden({ [ONBOARDING_DISMISSED_KEY]: "true" })).toBe(true);
    // Anything else means "not hidden" — including the value the restore
    // control writes, so showing it again works without a delete.
    expect(isChecklistHidden({ [ONBOARDING_DISMISSED_KEY]: "false" })).toBe(false);
    expect(isChecklistHidden({ otherSetting: "true" })).toBe(false);
  });

  it("names the key the dashboard and settings both write", () => {
    // Renaming the constant without a migration would silently un-hide the
    // checklist for everyone who had hidden it.
    expect(ONBOARDING_DISMISSED_KEY).toBe("onboardingDismissed");
  });
});
