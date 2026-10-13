import { isTauriRuntime } from "@/config/runtime";
import { INTEGRATIONS, SECRET_SERVICE } from "@/config/secrets";

/**
 * What happened the one time this install looked for an older one's data.
 *
 * `none` is the ordinary answer — a fresh install, or one that has already
 * imported. `failed` is kept separate from `none` on purpose: a copy that did not
 * happen has to be visible, because the alternative is a user staring at an
 * empty app they believe still holds years of bets.
 */
export type LegacyImportResult =
  | { status: "none" }
  | { status: "imported"; database: string | null; secrets: string[] }
  | { status: "failed"; reason: string };

let result: LegacyImportResult = { status: "none" };
let inFlight: Promise<LegacyImportResult> | null = null;

/** The outcome so far, for the UI to report. Never triggers the import itself. */
export function legacyImportResult(): LegacyImportResult {
  return result;
}

/**
 * Copy the previous identity's database into place and move its API keys to the
 * service this version uses.
 *
 * Called by the Tauri adapter immediately before it opens the database, which is
 * the only moment the copy can land: the plugin creates the file on load, so
 * after that there is something to overwrite and the old bets are stranded.
 *
 * The Rust side does the work because the data lives outside the webview — in
 * the OS application-data directory and the OS credential store — and it is
 * idempotent, so being called more than once costs nothing. The promise is
 * memoised anyway: React's StrictMode mounts effects twice in development, and
 * two concurrent copies of the same file into the same path is exactly the kind
 * of thing that is fine right up until it is not.
 */
export async function importLegacyIdentity(file: string): Promise<LegacyImportResult> {
  if (!isTauriRuntime()) return result;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const imported = await invoke<{
        database: string | null;
        secrets: string[];
      }>("import_legacy_identity", {
        file,
        service: SECRET_SERVICE,
        accounts: INTEGRATIONS.map((integration) => integration.name),
      });

      result =
        imported.database || imported.secrets.length > 0
          ? {
              status: "imported",
              database: imported.database,
              secrets: imported.secrets,
            }
          : { status: "none" };
    } catch (error) {
      result = {
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    return result;
  })();

  return inFlight;
}
