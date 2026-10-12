import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * The primitives every screen is built from.
 *
 * Colours here are semantic tokens (`bg-panel`, `text-muted`, `border-line`)
 * rather than palette steps, which is what lets one set of components serve both
 * themes: nothing below picks a shade of grey, so nothing below has to know
 * which theme is on.
 */

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm",
        variant === "primary" &&
          "bg-accent text-accent-ink hover:bg-accent-strong",
        variant === "default" &&
          "border border-line bg-raised text-ink hover:bg-hover",
        variant === "ghost" &&
          "bg-transparent text-muted hover:bg-hover hover:text-ink",
        variant === "danger" &&
          "border border-line bg-negative-soft text-negative hover:border-negative",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-line bg-panel p-4", className)}
      {...props}
    />
  );
}

/** A card that is mostly a heading and a number, which is most of the app. */
export function KpiTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <Card className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      <span
        className={cn(
          "text-3xl leading-none font-semibold tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </span>
      {sub ? <span className="text-xs text-faint">{sub}</span> : null}
    </Card>
  );
}

/**
 * The strip of figures that belongs above a table.
 *
 * Hairline dividers rather than cards and gaps: this sits directly on top of a
 * dense table and reviewing a record means reading it several times a session,
 * so it has to be legible as a row of numbers you glance along rather than as
 * four separate objects to look at.
 */
export function SummaryStrip({
  className,
  children,
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-xl border border-line bg-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SummaryCell({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="min-w-0 bg-panel px-3.5 py-2.5">
      <span className="block text-[11px] font-medium tracking-wide text-faint uppercase">
        {label}
      </span>
      <span
        className={cn(
          "mt-1 block text-lg leading-none font-semibold tabular-nums",
          tone === "neutral" && "text-ink",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </span>
      {sub ? (
        <span className="mt-1 block truncate text-xs text-faint">{sub}</span>
      ) : null}
    </div>
  );
}

/** One muted metadata line under a table row's main text. */
export function MetaLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-faint",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A middot between metadata items, so the line reads as one sentence. */
export function Dot() {
  return (
    <span aria-hidden="true" className="text-line">
      ·
    </span>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning" | "info" | "promo";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "neutral" && "bg-neutral-soft text-muted",
        tone === "positive" && "bg-positive-soft text-positive",
        tone === "negative" && "bg-negative-soft text-negative",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "info" && "bg-info-soft text-info",
        // Promo-funded bets get their own colour so they read as a distinct
        // category at a glance rather than as ordinary strategy bets.
        tone === "promo" && "bg-promo-soft text-promo",
      )}
    >
      {children}
    </span>
  );
}

/** Kept as the one-number stat used inside dashboards and detail cards. */
export function Stat({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  sub?: string;
}) {
  return <KpiTile label={label} value={value} sub={sub} tone={tone} />;
}

/**
 * A small set of mutually exclusive views — All / Open / Settled, and the like.
 * Distinct from tabs, which change page rather than narrow one.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-line bg-raised p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-accent-ink"
                : "text-muted hover:bg-hover hover:text-ink",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="ml-1.5 tabular-nums opacity-70">
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** A single toggleable filter, for the narrowing that is not either/or. */
export function FilterChip({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-accent bg-accent/15 text-ink"
          : "border-line text-muted hover:border-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "mt-10 w-full rounded-xl border border-line bg-panel p-5 shadow-2xl",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-panel/50 p-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </header>
  );
}
