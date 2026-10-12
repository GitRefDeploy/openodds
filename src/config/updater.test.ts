import { afterEach, describe, expect, it } from "vitest";
import tauriConfig from "../../src-tauri/tauri.conf.json";
import {
  UPDATE_FEED_URL,
  compareVersions,
  diagnoseFeed,
  probeUpdateFeed,
  type FeedProbe,
  type GithubReleaseProbe,
} from "./updater";

/** A probe that reached the feed and found a real manifest. */
function manifestProbe(
  version: string,
  platforms = ["windows-x86_64"],
): FeedProbe {
  return {
    status: 200,
    contentType: "application/json",
    manifest: { version, platforms },
    error: null,
    github: null,
  };
}

/** A probe whose own request was refused, as a browser refuses it. */
function refusedProbe(github: GithubReleaseProbe | null): FeedProbe {
  return {
    status: null,
    contentType: null,
    manifest: null,
    error: "Failed to fetch",
    github,
  };
}

const context = { currentVersion: "0.1.0", feedUrl: UPDATE_FEED_URL };

describe("compareVersions", () => {
  it("orders dotted versions numerically rather than as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBe(1);
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });

  it("treats an unparsable version as zero instead of throwing", () => {
    expect(compareVersions("", "0.0.1")).toBe(-1);
    expect(compareVersions("banana", "0.0.0")).toBe(0);
  });
});

describe("diagnoseFeed", () => {
  // The failure that was actually reported. GitHub answers 404 for a private
  // repository, and the updater's own wording — "Could not fetch a valid
  // release JSON from the remote" — is true of a private repo, a missing
  // release, a URL serving a web page and an offline laptop alike.
  it("explains a 404 as private, missing or unpublished", () => {
    const report = diagnoseFeed(
      { status: 404, contentType: "text/html", manifest: null, error: null, github: null },
      context,
    );
    expect(report.state).toBe("missing");
    expect(report.message).toContain("404");
    expect(report.message).toContain("private");
    expect(report.message).toContain(UPDATE_FEED_URL);
  });

  it("distinguishes a refusal from a 404, because the fix differs", () => {
    const report = diagnoseFeed(
      { status: 403, contentType: null, manifest: null, error: null, github: null },
      context,
    );
    expect(report.state).toBe("refused");
    expect(report.message).toContain("token");
  });

  it("distinguishes a web page from a manifest", () => {
    const report = diagnoseFeed(
      { status: 200, contentType: "text/html", manifest: null, error: null, github: null },
      context,
    );
    expect(report.state).toBe("not-a-manifest");
    expect(report.message).toContain("text/html");
    expect(report.message).not.toContain("private");
  });

  it("reports a request that never arrived as unreachable, and says so", () => {
    const report = diagnoseFeed(refusedProbe(null), context);
    expect(report.state).toBe("unreachable");
    expect(report.message).toContain("Failed to fetch");
    expect(report.message).toContain("says nothing about the feed");
  });

  it("says there is nothing to install when the feed matches the build", () => {
    const report = diagnoseFeed(manifestProbe("0.1.0"), context);
    expect(report.state).toBe("same-version");
    expect(report.message).toContain("0.1.0");
  });

  it("names the signature or the platform when a newer version was refused", () => {
    const report = diagnoseFeed(manifestProbe("0.1.1", ["linux-x86_64"]), context);
    expect(report.state).toBe("newer-available");
    expect(report.message).toContain("signature");
    expect(report.message).toContain("linux-x86_64");
  });

  it("treats an older manifest as normal rather than as a failure", () => {
    const report = diagnoseFeed(manifestProbe("0.0.9"), context);
    expect(report.state).toBe("older");
    expect(report.message).toContain("not an error");
  });

  it("notices a manifest that advertises no platforms at all", () => {
    const report = diagnoseFeed(manifestProbe("0.1.1", []), context);
    expect(report.message).toContain("no platforms");
  });

  it("always says something substantive", () => {
    const probes: FeedProbe[] = [
      { status: 404, contentType: null, manifest: null, error: null, github: null },
      { status: 403, contentType: null, manifest: null, error: null, github: null },
      { status: 500, contentType: null, manifest: null, error: null, github: null },
      { status: 200, contentType: null, manifest: null, error: null, github: null },
      refusedProbe(null),
      manifestProbe("0.1.0"),
      manifestProbe("0.1.1"),
      manifestProbe("0.0.9"),
    ];
    for (const probe of probes) {
      expect(diagnoseFeed(probe, context).message.length).toBeGreaterThan(40);
    }
  });
});

/**
 * A browser refuses the release-asset request outright when the response has no
 * cross-origin headers, which is every 404 from a private repository. That is
 * why the diagnosis asks GitHub's API as well: without it, the whole class of
 * failure would read as "Failed to fetch" and nothing else.
 */
describe("diagnoseFeed when this app's own request was refused", () => {
  const api = (overrides: Partial<GithubReleaseProbe>): GithubReleaseProbe => ({
    status: 200,
    error: null,
    release: "v0.1.0",
    assets: ["latest.json"],
    ...overrides,
  });

  it("uses GitHub's 404 to name a private or unpublished release", () => {
    const report = diagnoseFeed(
      refusedProbe(api({ status: 404, assets: [], release: null })),
      context,
    );
    expect(report.state).toBe("missing");
    expect(report.message).toContain("no published release");
    expect(report.message).toContain("private");
  });

  it("distinguishes a refusal reported by the API", () => {
    const report = diagnoseFeed(refusedProbe(api({ status: 403 })), context);
    expect(report.state).toBe("refused");
    expect(report.message).toContain("read-only token");
  });

  it("notices a public release that is missing the manifest asset", () => {
    const report = diagnoseFeed(
      refusedProbe(api({ assets: ["Bet.Tracker_0.1.0_x64-setup.exe"] })),
      context,
    );
    expect(report.state).toBe("missing");
    expect(report.message).toContain("latest.json");
    expect(report.message).toContain("v0.1.0");
    expect(report.message).toContain("Bet.Tracker_0.1.0_x64-setup.exe");
  });

  it("says the release is empty when it carries no assets", () => {
    const report = diagnoseFeed(refusedProbe(api({ assets: [] })), context);
    expect(report.message).toContain("no assets at all");
  });

  it("still gives an exact verdict when the release is public and complete", () => {
    const report = diagnoseFeed(refusedProbe(api({})), context);
    expect(report.state).toBe("same-version");
    expect(report.message).toContain("v0.1.0");
    expect(report.message).toContain("nothing to install");
    expect(report.message).toContain("cross-origin");
  });

  it("points at the signature when a newer release exists but was not installed", () => {
    const report = diagnoseFeed(refusedProbe(api({ release: "v0.1.1" })), context);
    expect(report.state).toBe("newer-available");
    expect(report.message).toContain("signature");
  });

  it("admits it cannot compare versions when the release has no tag", () => {
    const report = diagnoseFeed(refusedProbe(api({ release: null })), context);
    expect(report.state).toBe("blocked");
    expect(report.message).toContain("latest release");
  });

  it("falls back to plain wording when GitHub cannot be asked either", () => {
    const report = diagnoseFeed(
      refusedProbe(api({ status: null, error: "offline", assets: [], release: null })),
      context,
    );
    expect(report.state).toBe("unreachable");
    expect(report.message).toContain("connection");
  });
});

describe("probeUpdateFeed", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(
    handler: (url: string) => Promise<Response> | Response,
  ): string[] {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return handler(url);
    }) as unknown as typeof fetch;
    return calls;
  }

  it("reads the manifest when the feed answers", async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({
          version: "0.2.0",
          platforms: { "windows-x86_64": { url: "x", signature: "y" } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const probe = await probeUpdateFeed(UPDATE_FEED_URL);
    expect(probe.status).toBe(200);
    expect(probe.manifest).toEqual({
      version: "0.2.0",
      platforms: ["windows-x86_64"],
    });
    expect(probe.github).toBeNull();
  });

  it("treats a non-manifest body as no manifest rather than as a crash", async () => {
    stubFetch(
      () => new Response("<html>not found</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const probe = await probeUpdateFeed(UPDATE_FEED_URL);
    expect(probe.manifest).toBeNull();
    expect(probe.contentType).toBe("text/html");
  });

  it("asks GitHub about the release when the asset request is refused", async () => {
    const calls = stubFetch((url) => {
      if (url.includes("api.github.com")) {
        return new Response(
          JSON.stringify({
            tag_name: "v0.1.0",
            assets: [{ name: "latest.json" }, { name: "setup.exe" }],
          }),
          { status: 200 },
        );
      }
      throw new TypeError("Failed to fetch");
    });

    const probe = await probeUpdateFeed(UPDATE_FEED_URL);

    expect(probe.error).toBe("Failed to fetch");
    expect(probe.github).toEqual({
      status: 200,
      error: null,
      release: "v0.1.0",
      assets: ["latest.json", "setup.exe"],
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(
      "https://api.github.com/repos/GitRefDeploy/bet-tracker/releases/latest",
    );
  });

  it("does not invent a GitHub opinion for a feed hosted elsewhere", async () => {
    const calls = stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const probe = await probeUpdateFeed("https://example.com/feed/latest.json");

    expect(probe.github).toBeNull();
    expect(calls).toEqual(["https://example.com/feed/latest.json"]);
  });

  it("sends the token only when there is one", async () => {
    const seen: Record<string, string> = {};
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      Object.assign(seen, (init?.headers ?? {}) as Record<string, string>);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await probeUpdateFeed(UPDATE_FEED_URL);
    expect(seen.Authorization).toBeUndefined();

    await probeUpdateFeed(UPDATE_FEED_URL, "token-value");
    expect(seen.Authorization).toBe("Bearer token-value");
  });
});

describe("the configured feed", () => {
  // The Updates card names this URL while the updater fetches the one in
  // tauri.conf.json. If the two drift, the screen would confidently report on a
  // feed nobody is using, which is worse than reporting nothing.
  it("matches the endpoint the updater actually fetches", () => {
    expect(tauriConfig.plugins.updater.endpoints).toContain(UPDATE_FEED_URL);
  });
});
