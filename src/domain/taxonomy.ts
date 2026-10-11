export type SportKind = "racing" | "team" | "other";

export interface SportDefinition {
  slug: string;
  name: string;
  kind: SportKind;
}

/**
 * Generic sports taxonomy shipped with the app. Users can rename or disable
 * these and add their own — nothing here is personal data.
 */
export const DEFAULT_SPORTS: readonly SportDefinition[] = [
  { slug: "thoroughbred", name: "Horse racing (thoroughbred)", kind: "racing" },
  { slug: "harness", name: "Harness racing", kind: "racing" },
  { slug: "greyhound", name: "Greyhound racing", kind: "racing" },
  { slug: "soccer", name: "Soccer", kind: "team" },
  { slug: "afl", name: "AFL", kind: "team" },
  { slug: "nrl", name: "NRL", kind: "team" },
  { slug: "cricket", name: "Cricket", kind: "team" },
  { slug: "tennis", name: "Tennis", kind: "other" },
  { slug: "basketball", name: "Basketball", kind: "team" },
  { slug: "american_football", name: "American football", kind: "team" },
  { slug: "other", name: "Other", kind: "other" },
];

export const SPORT_KIND_LABELS: Record<SportKind, string> = {
  racing: "Racing",
  team: "Team sport",
  other: "Other",
};

/**
 * Optional bookmaker presets. The app ships with none enabled; a user opts in
 * from Settings. No bookmaker is hard-wired into the app.
 */
export const BOOK_PRESETS: readonly string[] = [
  "Sportsbet",
  "TAB",
  "Ladbrokes",
  "Neds",
  "PointsBet",
  "Bet365",
  "Betfair Exchange",
];
