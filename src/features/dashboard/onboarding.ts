/**
 * What to do first.
 *
 * A fresh install has nothing in it, and a dashboard of zeros with no
 * explanation reads as broken rather than empty. These are the four things that
 * actually need to exist before the app can show anything meaningful, each
 * derived from real state rather than ticked off by hand — so a step cannot be
 * "done" while the thing it asks for is still missing.
 *
 * Kept out of `domain/`: this is screen furniture, not betting arithmetic.
 */

export type OnboardingTarget = "bets" | "books" | "bankroll" | "promos";

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  route: OnboardingTarget;
  action: string;
}

export interface OnboardingInput {
  bookCount: number;
  betCount: number;
  depositCount: number;
  promoCount: number;
}

export function buildChecklist(input: OnboardingInput): OnboardingStep[] {
  return [
    {
      key: "book",
      title: "Add a bookmaker",
      description:
        "Every bet belongs to one. The app starts with no account in it, so this is the first thing to add.",
      done: input.bookCount > 0,
      route: "books",
      action: "Add a bookmaker",
    },
    {
      key: "bet",
      title: "Record a bet",
      description:
        "Type one in, or import a statement from your bookmaker and let the app read the file for you.",
      done: input.betCount > 0,
      route: "bets",
      action: "Record a bet",
    },
    {
      key: "bankroll",
      title: "Set your bankroll",
      description:
        "Record what you have deposited, so your balance has something to be measured against.",
      done: input.depositCount > 0,
      route: "bankroll",
      action: "Record a deposit",
    },
    {
      key: "promo",
      title: "Track an offer",
      description:
        "Promo value is kept separate from organic profit, so you can see how much of your edge is promotional.",
      done: input.promoCount > 0,
      route: "promos",
      action: "Add a promo",
    },
  ];
}

export interface ChecklistProgress {
  steps: OnboardingStep[];
  completed: number;
  total: number;
  remaining: number;
}

export function checklistProgress(input: OnboardingInput): ChecklistProgress {
  const steps = buildChecklist(input);
  const completed = steps.filter((step) => step.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    remaining: steps.length - completed,
  };
}
