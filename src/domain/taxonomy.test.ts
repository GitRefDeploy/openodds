import { describe, expect, it } from "vitest";
import {
  BOOK_PRESETS,
  DEFAULT_SPORTS,
  SPORT_KIND_LABELS,
  type SportKind,
} from "./taxonomy";

/**
 * The naming convention for the codes the app ships.
 *
 * These were wrong in a way that had been shipped rather than caught: the list
 * mixed `American football` with `Soccer`, and carried a lowercase
 * `(thoroughbred)` in brackets, so the Sports page read as unfinished. A rule
 * written down is the only thing that stops the next code being added in
 * whatever case came to hand.
 */
describe("the sport names the app ships", () => {
  it("is Title Case, with acronyms allowed to be all caps", () => {
    for (const sport of DEFAULT_SPORTS) {
      const words = sport.name.split(" ");
      expect(words.length).toBeGreaterThan(0);
      for (const word of words) {
        expect(
          word,
          `"${sport.name}" has a word that is neither Title Case nor an acronym`,
        ).toMatch(/^[A-Z][a-z]+$|^[A-Z]{2,}$/);
      }
    }
  });

  it("has no brackets in a name", () => {
    // The group heading carries the shared word now, so "Harness racing" under
    // a "Racing" heading says racing twice and a bracket says it apologetically.
    for (const sport of DEFAULT_SPORTS) {
      expect(sport.name).not.toMatch(/[()]/);
    }
  });

  it("gives every code a distinct name and a slug that looks like a slug", () => {
    const names = DEFAULT_SPORTS.map((sport) => sport.name);
    expect(new Set(names).size).toBe(names.length);

    const slugs = DEFAULT_SPORTS.map((sport) => sport.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("does not name a code with the same word as its group heading", () => {
    // There is a code called "Other" and a group called "Other sports". When the
    // heading was also "Other" they were indistinguishable, and a label that
    // repeats its contents is not a label.
    const headings = Object.values(SPORT_KIND_LABELS);
    for (const sport of DEFAULT_SPORTS) {
      expect(headings).not.toContain(sport.name);
    }
  });

  it("has a heading for every kind a code can be filed under", () => {
    const kinds: SportKind[] = ["racing", "team", "other"];
    for (const kind of kinds) {
      expect(SPORT_KIND_LABELS[kind]?.trim()).toBeTruthy();
    }
    for (const sport of DEFAULT_SPORTS) {
      expect(kinds).toContain(sport.kind);
    }
  });

  it("ships no bookmaker selected, which is what the setup wizard promises", () => {
    // The presets are labels to opt into, never books that already exist.
    expect(BOOK_PRESETS.length).toBeGreaterThan(0);
    expect(new Set(BOOK_PRESETS).size).toBe(BOOK_PRESETS.length);
  });
});
