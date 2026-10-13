import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The palette's contrast floor, checked against the palette itself.
 *
 * A colour system does not fail in one dramatic change; it fails one "just
 * slightly dimmer" tweak at a time. This app had exactly that happen: `faint`
 * was being used for the 11–12px captions on every screen while sitting at
 * 3.01:1 in dark and 2.67:1 in light — below AA in both themes, on every surface
 * it could land on — and `line` drew input borders at 1.19:1, where a control's
 * edge is barely visible as an edge.
 *
 * So the numbers live here rather than in a comment, and they are read from
 * `src/index.css` rather than duplicated, because a copy of a palette is a
 * palette that is wrong the first time someone changes the real one.
 *
 * Two rules:
 *
 * - Text clears 4.5:1 against every surface it can be drawn on. 4.5 rather than
 *   3:1 because the small text in this app is genuinely small — 11px uppercase
 *   labels and 12px captions — and WCAG's 3:1 allowance starts at 18.66px bold.
 * - Anything you can operate clears 3:1 against both the surface behind it and
 *   the fill inside it. That is the `edge` token's whole job, and it is why
 *   `edge` and `line` are separate: `line` is decoration and may be a whisper.
 */

const css = readFileSync(new URL("../../src/index.css", import.meta.url), "utf8");

/** The body of a rule block, found by its selector. */
function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`No ${selector} block in src/index.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) {
    throw new Error(`Unterminated ${selector} block in src/index.css`);
  }
  return css.slice(open + 1, close);
}

function tokens(source: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of source.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    found[match[1]] = match[2];
  }
  return found;
}

const THEMES = {
  dark: tokens(block(":root {")),
  light: tokens(block('[data-theme="light"]')),
} as const;

type ThemeName = keyof typeof THEMES;

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Surfaces text is actually drawn on, in this app. */
const SURFACES = ["canvas", "panel", "raised", "hover", "neutral-soft"] as const;

/**
 * Every pairing the code renders, named for the place it appears so a failure
 * says where to look. Add a row when a new pairing is introduced; the point of
 * the list is that it is exhaustive over what is on screen.
 */
const TEXT_PAIRS: { fg: string; bg: string; where: string }[] = [
  ...SURFACES.flatMap((bg) => [
    { fg: "ink", bg, where: `body text on ${bg}` },
    { fg: "muted", bg, where: `secondary text on ${bg} (PageHeader, labels, empty states)` },
    { fg: "faint", bg, where: `captions and hints on ${bg} (KpiTile sub, MetaLine, field hints)` },
  ]),
  { fg: "accent", bg: "panel", where: "accent text and active nav icon on a panel" },
  { fg: "accent", bg: "canvas", where: "accent text on the page" },
  { fg: "accent-ink", bg: "accent", where: "primary button label, active segment label" },
  { fg: "positive", bg: "panel", where: "profit figures" },
  { fg: "negative", bg: "panel", where: "loss figures" },
  { fg: "warning", bg: "panel", where: "warning text" },
  { fg: "info", bg: "panel", where: "informational text" },
  { fg: "promo", bg: "panel", where: "promo-funded figures" },
  { fg: "positive", bg: "positive-soft", where: "positive Badge" },
  { fg: "negative", bg: "negative-soft", where: "negative Badge and danger Button" },
  { fg: "warning", bg: "warning-soft", where: "warning Badge" },
  { fg: "info", bg: "info-soft", where: "info Badge" },
  { fg: "promo", bg: "promo-soft", where: "promo Badge" },
  { fg: "muted", bg: "neutral-soft", where: "neutral Badge" },
];

/** Boundaries of operable controls, and the decoration they are distinct from. */
const EDGE_PAIRS: { fg: string; bg: string; where: string }[] = [
  { fg: "edge", bg: "panel", where: "Input/Select/Button border on a panel" },
  { fg: "edge", bg: "raised", where: "Input border against its own fill" },
  { fg: "edge", bg: "canvas", where: "control border on the page" },
];

const TEXT_MIN = 4.5;
const EDGE_MIN = 3;

function read(theme: ThemeName, name: string): string {
  const value = THEMES[theme][name];
  if (!value) throw new Error(`No --${name} token in the ${theme} theme`);
  return value;
}

describe("colour tokens", () => {
  it("defines the same tokens in both themes, so neither can be half-applied", () => {
    expect(Object.keys(THEMES.light).sort()).toEqual(
      Object.keys(THEMES.dark).sort(),
    );
  });

  it("is not vacuous: the tokens and surfaces above all resolved", () => {
    for (const theme of Object.keys(THEMES) as ThemeName[]) {
      expect(read(theme, "faint")).toMatch(/^#[0-9a-f]{6}$/i);
      expect(read(theme, "edge")).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(TEXT_PAIRS.length).toBeGreaterThanOrEqual(20);
    expect(EDGE_PAIRS.length).toBeGreaterThanOrEqual(3);
  });
});

describe.each(Object.keys(THEMES) as ThemeName[])("%s theme", (theme) => {
  for (const pair of TEXT_PAIRS) {
    it(`reads ${pair.where} at ${TEXT_MIN}:1`, () => {
      expect(
        contrast(read(theme, pair.fg), read(theme, pair.bg)),
      ).toBeGreaterThanOrEqual(TEXT_MIN);
    });
  }

  for (const pair of EDGE_PAIRS) {
    it(`edges ${pair.where} at ${EDGE_MIN}:1`, () => {
      expect(
        contrast(read(theme, pair.fg), read(theme, pair.bg)),
      ).toBeGreaterThanOrEqual(EDGE_MIN);
    });
  }

  /**
   * The two grey tiers have to stay two tiers.
   *
   * Clearing the AA floor pulled `faint` up towards `muted` in dark and down
   * towards it in light, and in light it landed exactly on the old `muted`
   * value — which would have quietly collapsed a three-level text hierarchy
   * (ink / muted / faint) into two. Moving `muted` at the same time is what
   * keeps them apart, so this is the assertion that stops a future tweak
   * re-collapsing them.
   */
  it("keeps `muted` a visible step above `faint`", () => {
    const gap =
      contrast(read(theme, "muted"), read(theme, "panel")) /
      contrast(read(theme, "faint"), read(theme, "panel"));
    expect(gap).toBeGreaterThanOrEqual(1.2);
  });

  /**
   * And `edge` has to stay stronger than the decoration it is distinguished
   * from. If `line` ever reached `edge`, the two tokens would be the same token
   * under two names.
   */
  it("keeps `edge` meaningfully stronger than `line`", () => {
    const line = contrast(read(theme, "line"), read(theme, "panel"));
    const edge = contrast(read(theme, "edge"), read(theme, "panel"));
    expect(edge).toBeGreaterThan(line * 1.3);
  });
});
