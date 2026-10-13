import { getAppInfo } from "./appInfo";
import { isTauriRuntime } from "./runtime";
import { getSecret } from "./secrets";

/**
 * Update checks talk to the signed manifest published by the release workflow
 * (`latest.json`).
 *
 * The check itself only exists inside the packaged desktop app, so it degrades
 * to a friendly message in the browser preview. The *diagnosis* does not: it is
 * an ordinary request, so it also works in the preview, which is what makes it
 * possible to see the same answer the installed app sees.
 *
 * The endpoint is written in two places — here, so the UI can name the feed it
 * is talking about, and in `src-tauri/tauri.conf.json`, which is the one the
 * updater actually fetches. `updater.test.ts` asserts they agree, because a
 * screen that confidently reports on a different URL than the one being fetched
 * would send someone looking in the wrong place.
 */
export const UPDATE_FEED_URL =
  "https://github.com/GitRefDeploy/openodds/releases/latest/download/latest.json";

/** Keychain account for a read-only token, for a feed that is not public. */
export const UPDATE_FEED_TOKEN_KEY = "update-feed-token";

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

/**
 * What GitHub said about the release behind the feed.
 *
 * Needed because a browser refuses the release *asset* request outright when the
 * response carries no cross-origin headers — which is every 404 from a private
 * repository — so the asset request alone reports "Failed to fetch" and hides
 * whether anything is there. The API host does answer, and its 404 is the same
 * distinction the updater cares about. The updater's own request goes through
 * Rust and is not subject to any of this.
 */
export interface GithubReleaseProbe {
  status: number | null;
  error: string | null;
  /** Tag of the latest published release, when there is one. */
  release: string | null;
  /** Names of the assets attached to it. */
  assets: string[];
}

/** What a direct request to the feed saw. */
export interface FeedProbe {
  /** HTTP status, or null when the request never completed. */
  status: number | null;
  contentType: string | null;
  /** The manifest, when the body really was one. */
  manifest: { version: string; platforms: string[] } | null;
  /** Set when the request itself failed: offline, or refused cross-origin. */
  error: string | null;
  /** Set only when the feed request failed and the URL is a GitHub release. */
  github: GithubReleaseProbe | null;
}

export type FeedState =
  | "unreachable"
  | "missing"
  | "refused"
  | "not-a-manifest"
  | "same-version"
  | "newer-available"
  | "older"
  | "blocked";

export interface FeedReport {
  state: FeedState;
  /** Names the cause, and the fix where there is one. */
  message: string;
}

/**
 * Compare two dotted version strings. Enough for the updater's own versioning;
 * anything unparsable counts as zero, so a strange manifest produces a verdict
 * rather than an exception.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) =>
    value
      .replace(/^v/, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

/** The asset name a feed URL points at, e.g. `latest.json`. */
function assetNameOf(feedUrl: string): string {
  return feedUrl.split("/").pop() ?? "latest.json";
}

const GITHUB_RELEASE_LINK =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/releases\/(?:latest\/download|download)\//;

/**
 * Ask GitHub about the release behind a feed URL.
 *
 * Returns null for a URL that is not a GitHub release, so a feed hosted anywhere
 * else simply gets no second opinion rather than a misleading one.
 */
async function probeGithubRelease(
  feedUrl: string,
): Promise<GithubReleaseProbe | null> {
  const match = GITHUB_RELEASE_LINK.exec(feedUrl);
  if (!match) return null;
  const [, owner, repo] = match;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" },
    );
    const body = await response.text();

    let release: string | null = null;
    let assets: string[] = [];
    try {
      const parsed = JSON.parse(body) as {
        tag_name?: unknown;
        assets?: unknown;
      };
      if (typeof parsed.tag_name === "string") release = parsed.tag_name;
      if (Array.isArray(parsed.assets)) {
        assets = parsed.assets
          .map((asset: unknown) =>
            asset !== null &&
            typeof asset === "object" &&
            typeof (asset as { name?: unknown }).name === "string"
              ? (asset as { name: string }).name
              : null,
          )
          .filter((name): name is string => name !== null);
      }
    } catch {
      // A 404 body is JSON too, but carries no release fields.
    }

    return { status: response.status, error: null, release, assets };
  } catch (error) {
    return {
      status: null,
      error: error instanceof Error ? error.message : String(error),
      release: null,
      assets: [],
    };
  }
}

/**
 * Ask the feed what it says, without going through the updater.
 *
 * Deliberately the plainest possible request: the point is to find out what is
 * true of the URL, so layering the updater's own machinery on top would hide the
 * answer behind the very error being investigated.
 */
export async function probeUpdateFeed(
  feedUrl: string = UPDATE_FEED_URL,
  token?: string | null,
): Promise<FeedProbe> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(feedUrl, { headers, cache: "no-store" });
    const body = await response.text();

    let manifest: FeedProbe["manifest"] = null;
    try {
      const parsed = JSON.parse(body) as {
        version?: unknown;
        platforms?: unknown;
      };
      if (
        typeof parsed.version === "string" &&
        parsed.platforms !== null &&
        typeof parsed.platforms === "object"
      ) {
        manifest = {
          version: parsed.version,
          platforms: Object.keys(parsed.platforms as Record<string, unknown>),
        };
      }
    } catch {
      // Not JSON. `manifest` stays null and the diagnosis says so.
    }

    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      manifest,
      error: null,
      github: null,
    };
  } catch (error) {
    return {
      status: null,
      contentType: null,
      manifest: null,
      error: error instanceof Error ? error.message : String(error),
      github: await probeGithubRelease(feedUrl),
    };
  }
}

/**
 * Turn a probe into the plainest true sentence available about the feed.
 *
 * An earlier version of this screen passed the updater's own error straight
 * through, which said only "Could not fetch a valid release JSON from the
 * remote" — true of a private repository, a missing release, a URL serving a web
 * page and an offline laptop alike, and therefore useless for telling them apart.
 */
export function diagnoseFeed(
  probe: FeedProbe,
  context: { currentVersion: string; feedUrl: string },
): FeedReport {
  const { currentVersion, feedUrl } = context;
  const expectedAsset = assetNameOf(feedUrl);

  if (probe.error) {
    const github = probe.github;
    if (github) {
      if (github.status === 404) {
        return {
          state: "missing",
          message: `GitHub reports no published release for ${feedUrl} — its API answered 404, which is what a private repository looks like to an app with no credentials, and also what a repository whose release is still a draft looks like. Making the repository public, or supplying a token below, is the fix.`,
        };
      }
      if (github.status === 401 || github.status === 403) {
        return {
          state: "refused",
          message: `GitHub refused the request for ${feedUrl} (HTTP ${github.status}). A read-only token below is the fix if the repository is private.`,
        };
      }
      if (github.status !== null && github.status >= 200 && github.status < 300) {
        if (!github.assets.includes(expectedAsset)) {
          const carries = github.assets.length
            ? `it carries: ${github.assets.join(", ")}`
            : "it carries no assets at all";
          const release = github.release ? ` (${github.release})` : "";
          return {
            state: "missing",
            message: `The latest published release${release} is public but has no ${expectedAsset} attached — ${carries}. Installed apps have nothing to read.`,
          };
        }
        const release = github.release
          ? `Release ${github.release}`
          : "The latest release";
        const blockedNote =
          "This check could not read the manifest itself, because a browser refuses that cross-origin request — a restriction the updater is not subject to.";

        // The release tag is a good stand-in for the manifest's version: the
        // API's "latest" excludes drafts and prereleases exactly as the
        // updater's own endpoint does, so the verdict can still be exact.
        const releaseVersion = github.release?.replace(/^v/, "") ?? null;
        if (releaseVersion) {
          const releaseComparison = compareVersions(
            releaseVersion,
            currentVersion,
          );
          if (releaseComparison <= 0) {
            return {
              state: "same-version",
              message: `${release} is published with ${expectedAsset} attached, and ${releaseVersion} is not newer than the ${currentVersion} you are running, so there is nothing to install. ${blockedNote}`,
            };
          }
          return {
            state: "newer-available",
            message: `${release} is published, newer than ${currentVersion}, and carries ${expectedAsset}. ${blockedNote} If updating still fails, the cause is the signature or the manifest entry for this machine's platform rather than the feed.`,
          };
        }

        return {
          state: "blocked",
          message: `${release} is published publicly and does carry ${expectedAsset}, so the updater itself can read it. ${blockedNote} If updating still fails, look at the signature or at the manifest entry for this machine rather than at the feed.`,
        };
      }
      if (github.error) {
        return {
          state: "unreachable",
          message: `Could not reach ${feedUrl} (${github.error}), and GitHub's API could not be reached either. Nothing here says anything about the feed itself; check this machine's connection first.`,
        };
      }
    }

    return {
      state: "unreachable",
      message: `Could not reach ${feedUrl} (${probe.error}). The request never arrived, so this says nothing about the feed itself. If the same URL opens in a browser, the request was blocked rather than missing.`,
    };
  }

  if (probe.status === 404) {
    return {
      state: "missing",
      message: `The feed at ${feedUrl} answered 404. GitHub answers 404 for a repository that is private, so an installed app with no credentials can never read it — and it answers 404 for a release that does not exist or is still a draft. Making the repository public, or supplying a token below, is the fix.`,
    };
  }

  if (probe.status === 401 || probe.status === 403) {
    return {
      state: "refused",
      message: `The feed at ${feedUrl} answered HTTP ${probe.status}: the URL exists but refused this request. If the repository is private, add a read-only token below.`,
    };
  }

  if (probe.status === null || probe.status < 200 || probe.status >= 300) {
    return {
      state: "unreachable",
      message: `The feed at ${feedUrl} answered HTTP ${probe.status}, which is not a manifest response. Something else is answering for that URL.`,
    };
  }

  if (!probe.manifest) {
    const contentType = probe.contentType
      ? ` (content type ${probe.contentType})`
      : "";
    return {
      state: "not-a-manifest",
      message: `The feed at ${feedUrl} answered HTTP ${probe.status} but the body is not an updater manifest${contentType}. A URL that serves a web page — an error page, or a release page rather than the release asset — looks exactly like this.`,
    };
  }

  const { version, platforms } = probe.manifest;
  const platformNote = platforms.length
    ? ` It advertises: ${platforms.join(", ")}.`
    : " It advertises no platforms at all.";
  const comparison = compareVersions(version, currentVersion);

  if (comparison === 0) {
    return {
      state: "same-version",
      message: `The feed is reachable and reports version ${version}, which is the version you are running, so there is nothing to install.${platformNote}`,
    };
  }

  if (comparison > 0) {
    return {
      state: "newer-available",
      message: `The feed offers version ${version} and you are running ${currentVersion}, so an update should have installed. When the manifest itself is fine but the updater still refuses, the usual causes are a signature that does not match the public key this build was compiled with, or no entry for this machine's platform.${platformNote}`,
    };
  }

  return {
    state: "older",
    message: `The feed reports version ${version}, which is older than the ${currentVersion} you are running. An older manifest is ignored by design, so this is not an error: the newer release has probably not been published yet.${platformNote}`,
  };
}

/** Probe the feed and report, for a caller that is not diagnosing a failure. */
export async function inspectUpdateFeed(
  currentVersion: string,
): Promise<FeedReport> {
  const token = await readFeedToken();
  const probe = await probeUpdateFeed(UPDATE_FEED_URL, token);
  return diagnoseFeed(probe, { currentVersion, feedUrl: UPDATE_FEED_URL });
}

async function readFeedToken(): Promise<string | null> {
  try {
    return await getSecret(UPDATE_FEED_TOKEN_KEY);
  } catch {
    // A keychain that cannot be read is not a reason to lose the whole check.
    return null;
  }
}

/**
 * The plugin's own error, with the probe's finding attached to it. The raw
 * message is kept because it is occasionally the only evidence of a cause this
 * app cannot see, but it is never the whole answer on its own.
 */
async function explainFailure(failure: string): Promise<string> {
  const { version } = await getAppInfo();
  const report = await inspectUpdateFeed(version);
  return `${report.message} The updater reported: “${failure}”.`;
}

/**
 * Check for, download and install an update, reporting progress as it goes.
 * Relaunches the app once the update has been installed.
 */
export async function checkAndInstallUpdate(
  onProgress: (progress: UpdateProgress) => void,
): Promise<void> {
  if (!isTauriRuntime()) {
    onProgress({
      state: "unavailable",
      message:
        "Update checks only run in the installed desktop app. The feed itself can still be tested below.",
    });
    return;
  }

  try {
    onProgress({ state: "checking" });
    const token = await readFeedToken();
    const { check } = await import("@tauri-apps/plugin-updater");
    // Only sent when a token has actually been stored. An Authorization header
    // on a public feed buys nothing, and sending one blindly would make a
    // misconfigured feed look like an authentication problem.
    const update = await check(
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );

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
    const failure = error instanceof Error ? error.message : String(error);
    onProgress({ state: "error", message: await explainFailure(failure) });
  }
}
