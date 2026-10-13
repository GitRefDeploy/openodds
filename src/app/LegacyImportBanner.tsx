import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { legacyImportResult } from "@/db/legacy";
import { cn } from "@/lib/utils";

/**
 * Reports the one-time import of a previous installation's data.
 *
 * It is shown rather than silent because the other reading of an app that looks
 * empty is that the update ate years of bets, and it is dismissible because after
 * the first look it is only in the way. The outcome is read once, on the first
 * render: by this point the database is open, so the import has already finished
 * or already failed.
 */
export function LegacyImportBanner() {
  const [outcome] = useState(() => legacyImportResult());
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || outcome.status === "none") return null;

  const failed = outcome.status === "failed";
  const keysArrived = outcome.status === "imported" && outcome.secrets.length > 0;

  return (
    <div
      role={failed ? "alert" : "status"}
      className={cn(
        "mb-5 flex items-start gap-3 rounded-xl border border-line p-4",
        failed ? "bg-negative-soft" : "bg-positive-soft",
      )}
    >
      <div className={cn("flex-1 text-sm", failed ? "text-negative" : "text-ink")}>
        <p className="mb-1 font-semibold">
          {failed
            ? "Could not bring your earlier data across"
            : "Brought your data across"}
        </p>
        {outcome.status === "imported" && (
          <p>
            {outcome.database
              ? "Your bets, bookmakers and settings were copied from this machine's earlier installation, which is still on disk and untouched. "
              : "Some settings were recovered from this machine's earlier installation. "}
            {keysArrived
              ? "Your saved API keys came too."
              : "Any saved API keys need entering again in Settings."}
          </p>
        )}
        {outcome.status === "failed" && (
          <p>
            Nothing was changed and the earlier installation still holds every
            bet. <span className="opacity-80">({outcome.reason})</span>
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
        Dismiss
      </Button>
    </div>
  );
}
