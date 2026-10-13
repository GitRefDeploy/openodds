/**
 * The mark exists twice, and this is the check that keeps the two copies one
 * drawing.
 *
 * `src/components/ui/Logo.tsx` draws it in `currentColor` for the sidebar, where
 * it can follow the theme; `src/assets/logo.svg` bakes the same shape in colour
 * for the favicon and the icons `tauri icon` generates from it. Both files carry
 * a comment telling the next person to change one when they change the other,
 * which is a comment — and a comment is exactly what the person editing one
 * number does not read. Changing the component alone is invisible in the app and
 * wrong in the taskbar, which is the kind of split nobody notices.
 *
 * So the geometry is compared, not described: the SVG is read off disk at 1024
 * units, the component is actually rendered to markup at 32, and the numbers are
 * asserted to be the same drawing scaled by 32. The colour the SVG bakes in is
 * checked against the palette in `src/index.css` for the same reason — a baked
 * value cannot inherit a theme, so it can only be kept in step by a test.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

const COMPONENT_UNITS = 32;
const FILE_UNITS = 1024;

const componentMarkup = renderToStaticMarkup(<Logo className="size-8" />);
const file = readFileSync(
  new URL("../../assets/logo.svg", import.meta.url),
  "utf8",
);
const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

interface Ring {
  cx: number;
  cy: number;
  r: number;
  strokeWidth: number;
  opacity: number;
}

/** Every `<circle>` in a piece of markup, as numbers. */
function rings(markup: string): Ring[] {
  return [...markup.matchAll(/<circle\b([^>]*?)\/?>/g)].map((match) => {
    const attributes = match[1];
    const attribute = (name: string): number | null => {
      const found = attributes.match(
        new RegExp(`(?:^|\\s)${name}="([^"]*)"`),
      );
      return found ? Number(found[1]) : null;
    };
    const required = (name: string): number => {
      const value = attribute(name);
      if (value === null) throw new Error(`A ring has no ${name}`);
      return value;
    };
    return {
      cx: required("cx"),
      cy: required("cy"),
      r: required("r"),
      strokeWidth: required("stroke-width"),
      opacity: attribute("opacity") ?? 1,
    };
  });
}

const componentRings = rings(componentMarkup);
const fileRings = rings(file);

/** The value of a `--token` in one of the two theme blocks of index.css. */
function token(selector: string, name: string): string {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const found = body.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!found) throw new Error(`No --${name} in ${selector}`);
  return found[1];
}

describe("the mark at both scales", () => {
  it("is non-vacuous: the component rendered and the file and palette were read", () => {
    expect(componentMarkup).toContain("<svg");
    expect(componentRings).toHaveLength(2);
    expect(fileRings).toHaveLength(2);
    expect(file).toContain('viewBox="0 0 1024 1024"');
    expect(componentMarkup).toContain(`viewBox="0 0 ${COMPONENT_UNITS} ${COMPONENT_UNITS}"`);
    expect(token(":root {", "accent")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("draws the same two rings, scaled by 32", () => {
    for (const [index, ring] of componentRings.entries()) {
      const scaled = fileRings[index];
      for (const key of ["cx", "cy", "r", "strokeWidth"] as const) {
        expect(
          scaled[key] / FILE_UNITS,
          `ring ${index} ${key}: the component and src/assets/logo.svg disagree`,
        ).toBeCloseTo(ring[key] / COMPONENT_UNITS, 6);
      }
      expect(
        scaled.opacity,
        `ring ${index} opacity: one copy is quieter than the other`,
      ).toBeCloseTo(ring.opacity, 6);
    }
  });

  it("puts the second ring up and to the right of the first", () => {
    // The mark is a profit line as much as a name: two rings stacked the other
    // way round, or side by side, is a different logo that happens to have the
    // same number of circles in it.
    const [behind, front] = componentRings;
    expect(front.cx).toBeGreaterThan(behind.cx);
    expect(front.cy).toBeLessThan(behind.cy);
    expect(front.opacity).toBe(1);
    expect(behind.opacity).toBeLessThan(1);
  });

  it("keeps the two rings apart, strokes included", () => {
    /**
     * The claim this backs is in both files' comments: the rings never touch, and
     * at 16px they are close enough to need the tile behind them — which is why
     * the mark has a minimum size and why the standalone file bakes the tile in.
     * If a change to the radii or the stroke made them overlap, the comment would
     * quietly become false and the 16px render a blob.
     */
    const [first, second] = componentRings;
    const centres = Math.hypot(second.cx - first.cx, second.cy - first.cy);
    const clearance =
      centres - (first.r + second.r) - (first.strokeWidth + second.strokeWidth) / 2;
    expect(clearance).toBeGreaterThan(0);
    // At 16px that clearance is a fraction of a pixel, so the favicon depends on
    // the tile's contrast rather than on the gap.
    expect((clearance / COMPONENT_UNITS) * 16).toBeLessThan(1.5);
  });

  it("bakes the palette's accent into the standalone file", () => {
    const accent = token(":root {", "accent").toLowerCase();
    const accentInk = token(":root {", "accent-ink").toLowerCase();
    expect(file.toLowerCase()).toContain(`fill="${accent}"`);
    expect(file.toLowerCase()).toContain(`stroke="${accentInk}"`);
  });
});
