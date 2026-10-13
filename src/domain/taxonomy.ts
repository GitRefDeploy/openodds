export type SportKind = "racing" | "team" | "other";

export interface SportDefinition {
  slug: string;
  name: string;
  kind: SportKind;
}

/**
 * Generic sports taxonomy shipped with the app. Users can rename or disable
 * these and add their own — nothing here is personal data.
 *
 * Named in Title Case with no parentheticals, and the group heading carries the
 * shared word rather than each name repeating it: the "Racing" group holds
 * `Thoroughbred`, `Harness` and `Greyhound`, so `Harness racing` is on a card
 * under a heading that already says racing. The previous names mixed the two
 * conventions — `American football` beside `Soccer`, and a lowercase
 * `(thoroughbred)` inside brackets — which read as unfinished rather than as a
 * choice.
 *
 * Renaming here only reaches a *fresh* install: the name is stored per row, so
 * an existing database keeps what was seeded until the migration that follows
 * these renames. See migration 8 in `src/db/schema.ts`.
 */
export const DEFAULT_SPORTS: readonly SportDefinition[] = [
  { slug: "thoroughbred", name: "Thoroughbred", kind: "racing" },
  { slug: "harness", name: "Harness", kind: "racing" },
  { slug: "greyhound", name: "Greyhound", kind: "racing" },
  { slug: "soccer", name: "Soccer", kind: "team" },
  { slug: "afl", name: "AFL", kind: "team" },
  { slug: "nrl", name: "NRL", kind: "team" },
  { slug: "cricket", name: "Cricket", kind: "team" },
  { slug: "tennis", name: "Tennis", kind: "other" },
  { slug: "basketball", name: "Basketball", kind: "team" },
  { slug: "american_football", name: "American Football", kind: "team" },
  { slug: "other", name: "Other", kind: "other" },
];

/**
 * Group headings on the Sports page. Plural, because each holds more than one
 * code — `Team sport` read as if the group were a single sport. `Other sports`
 * rather than `Other` because there is also a sport *named* Other, and a heading
 * and a card reading the same word is a puzzle where there was meant to be a
 * label.
 */
export const SPORT_KIND_LABELS: Record<SportKind, string> = {
  racing: "Racing",
  team: "Team sports",
  other: "Other sports",
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
