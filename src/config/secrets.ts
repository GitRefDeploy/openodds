/**
 * API keys are never stored in the repository or bundled into a build.
 * In the packaged app they go to the OS credential store (Windows Credential
 * Manager / Linux Secret Service) via a Tauri command. In the browser preview
 * there is no keychain, so we fall back to localStorage and the UI warns.
 */
import { isTauriRuntime } from "./runtime";

const SERVICE = "openodds";
const BROWSER_PREFIX = "openodds.secret.";

export function secretStorageKind(): "keychain" | "browser" {
  return isTauriRuntime() ? "keychain" : "browser";
}

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

export async function saveSecret(name: string, value: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("save_secret", { service: SERVICE, account: name, value });
    return;
  }
  globalThis.localStorage?.setItem(BROWSER_PREFIX + name, value);
}

export async function getSecret(name: string): Promise<string | null> {
  if (isTauriRuntime()) {
    return invoke<string | null>("get_secret", { service: SERVICE, account: name });
  }
  return globalThis.localStorage?.getItem(BROWSER_PREFIX + name) ?? null;
}

export async function deleteSecret(name: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("delete_secret", { service: SERVICE, account: name });
    return;
  }
  globalThis.localStorage?.removeItem(BROWSER_PREFIX + name);
}

/** Only reports presence — the value is never read into the UI. */
export async function hasSecret(name: string): Promise<boolean> {
  const value = await getSecret(name);
  return !!value;
}

export interface ApiIntegration {
  name: string;
  label: string;
  description: string;
  docsUrl: string;
}

/** Free-tier data sources, all optional. None are required for the app. */
export const INTEGRATIONS: readonly ApiIntegration[] = [
  {
    name: "the-odds-api",
    label: "The Odds API",
    description:
      "Free tier: 500 credits/month. Odds and scores for AFL, NRL, soccer and AU bookmakers.",
    docsUrl: "https://the-odds-api.com/",
  },
  {
    name: "formfav",
    label: "FormFav",
    description:
      "Free plan: ~1,000 requests/day. Form and results for Australian thoroughbred, greyhound and harness racing.",
    docsUrl: "https://formfav.com/",
  },
];
