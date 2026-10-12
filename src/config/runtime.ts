/**
 * Where the app is running.
 *
 * Three modules need this answer — credential storage, the updater and the
 * version lookup — and each one used to carry its own copy of the same check.
 * One helper means the packaged app and the browser preview cannot disagree
 * about which of them they are.
 */
export function isTauriRuntime(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>)
  );
}
