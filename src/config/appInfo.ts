import { isTauriRuntime } from "./runtime";

export interface AppInfo {
  version: string;
  name: string;
}

/**
 * The version the app is actually running.
 *
 * Inside the packaged app this asks the Rust side, which reports the version
 * Cargo compiled the binary with — the same number the updater compares a
 * manifest against, which is why it is the right one to show. The browser
 * preview has no Rust to ask, so it falls back to the version in `package.json`
 * injected at build time.
 *
 * Either way the UI never holds a hand-typed version. Both places that displayed
 * one previously said "v0.1.0" as a literal, so they were wrong as soon as the
 * project was released again — and a wrong version number is exactly the sort of
 * thing that makes an update check look broken when it is not.
 */
export async function getAppInfo(): Promise<AppInfo> {
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<AppInfo>("app_info");
    } catch {
      // Fall through to the build-time value rather than failing a whole page
      // over a version label.
    }
  }
  return { version: __APP_VERSION__, name: "Bet Tracker" };
}
