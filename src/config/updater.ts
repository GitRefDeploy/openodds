/**
 * Update checks talk to the signed manifest published by the release workflow
 * (`latest.json`) at the endpoint configured in `tauri.conf.json`.
 *
 * The updater only exists inside the packaged desktop app, so this degrades to
 * a friendly message in the browser preview rather than throwing.
 */
export type UpdateState =
  | "unavailable"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface UpdateProgress {
  state: UpdateState;
  version?: string;
  percent?: number;
  message?: string;
}

function inTauriRuntime(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)
  );
}

/**
 * Check for, download and install an update, reporting progress as it goes.
 * Relaunches the app once the update has been installed.
 */
export async function checkAndInstallUpdate(
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  if (!inTauriRuntime()) {
    onProgress({
      state: "unavailable",
      message: "Update checks only run in the installed desktop app.",
    });
    return;
  }

  try {
    onProgress({ state: "checking" });
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      onProgress({ state: "up-to-date" });
      return;
    }

    onProgress({ state: "available", version: update.version });

    let downloaded = 0;
    let total = 0;
    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          onProgress({ state: "downloading", version: update.version, percent: 0 });
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          onProgress({
            state: "downloading",
            version: update.version,
            percent: total > 0 ? Math.round((downloaded / total) * 100) : undefined,
          });
          break;
        case "Finished":
          onProgress({ state: "ready", version: update.version });
          break;
      }
    });

    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (error) {
    onProgress({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
