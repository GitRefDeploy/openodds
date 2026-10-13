/**
 * The OpenOdds mark: two rings climbing to the right — the two O's of the name,
 * on the diagonal a profit line takes. Behind one ring the other, so the pair
 * reads as a shape that is going up rather than as two circles.
 *
 * Drawn inline in `currentColor` rather than loaded as an image, for two
 * reasons. The app runs in two themes with two different accent greens, and an
 * `<img>` cannot see a CSS custom property — a baked file would be the wrong
 * green in one of them. And the sidebar already draws its own 32px accent tile;
 * this supplies only the rings that sit on it, so the tile keeps the radius,
 * colour and hover behaviour it always had.
 *
 * Sized to fill its container: the artwork carries its own inset (2.6 to 29 of
 * the 32-unit box), so rendering it at the tile's full 32px reproduces the
 * drawing exactly rather than shrinking it twice.
 *
 * The lower ring is drawn at 0.55 opacity, which is what puts the pair on a
 * diagonal instead of flat: on one accent tile two rings of one colour read as a
 * single object, and the quieter ring is the one further behind.
 *
 * **32px is the floor for this mark, not a habit.** At 16 the two strokes close
 * the gap between the rings and it becomes one blob, so it is never used at
 * favicon size — which is why `src/assets/logo.svg` bakes the accent tile in
 * behind the rings: the tile's darker surround is what keeps them apart in a
 * browser tab. Change one, change the other: 32 units here and 1024 there are one
 * mark at two scales.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="9.8"
        cy="21.6"
        r="5.6"
        stroke="currentColor"
        strokeWidth="3.2"
        opacity="0.55"
      />
      <circle
        cx="21.8"
        cy="10.8"
        r="5.6"
        stroke="currentColor"
        strokeWidth="3.2"
      />
    </svg>
  );
}
