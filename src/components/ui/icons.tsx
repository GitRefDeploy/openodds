import type { ReactNode } from "react";

/**
 * A small inline icon set.
 *
 * Deliberately not a dependency: the app needs a dozen glyphs, and drawing them
 * here keeps the bundle honest and the shapes consistent (one stroke width, one
 * grid, one colour source). Icons take `currentColor`, so they inherit whatever
 * the surrounding text is — which is what makes them work in both themes.
 */
export type IconName =
  | "dashboard"
  | "bets"
  | "stats"
  | "promos"
  | "bankroll"
  | "books"
  | "sports"
  | "settings"
  | "system"
  | "dark"
  | "light";

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  bets: (
    <>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </>
  ),
  stats: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>
  ),
  promos: (
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
  ),
  bankroll: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M16.5 14.5h.01" />
    </>
  ),
  books: (
    <>
      <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5z" />
      <path d="M8 7h8" />
    </>
  ),
  sports: (
    <>
      <path d="M8 3h8v6a4 4 0 01-8 0z" />
      <path d="M8 4H5v2a3 3 0 003 3" />
      <path d="M16 4h3v2a3 3 0 01-3 3" />
      <path d="M12 13v4" />
      <path d="M9 21h6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h9" />
      <path d="M19 6h1" />
      <path d="M4 12h3" />
      <path d="M13 12h7" />
      <path d="M4 18h11" />
      <path d="M21 18h-1" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </>
  ),
  dark: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />,
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M5 5l1.5 1.5" />
      <path d="M17.5 17.5L19 19" />
      <path d="M19 5l-1.5 1.5" />
      <path d="M6.5 17.5L5 19" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
