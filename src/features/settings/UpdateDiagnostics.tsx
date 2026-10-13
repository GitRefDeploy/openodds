import { useEffect, useState } from "react";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { getAppInfo } from "@/config/appInfo";
import { deleteSecret, hasSecret, saveSecret } from "@/config/secrets";
import { UPDATE_FEED_TOKEN_KEY, inspectUpdateFeed } from "@/config/updater";

/**
 * The update feed diagnostic — deliberately not rendered.
 *
 * Nothing imports this module, so it costs nothing at runtime (a bundler drops
 * a module no one reaches) while keeping the two things that can explain a feed
 * that has stopped working. An installed copy fetches its manifest with no
 * credentials, and GitHub answers **404** for a private or renamed repository —
 * which, from the app's side, is indistinguishable from a release that does not
 * exist. Without this, that failure looks like "no updates available" forever
 * and there is no way to tell the two apart.
 *
 * It was removed from the Updates card because the card is read far more often
 * than the feed breaks, and a token field for a case almost nobody hits is noise
 * on a settings screen. The capability is kept, the interface is not.
 *
 * **To bring it back**, render `<UpdateDiagnostics />` inside `UpdatesCard` in
 * `SettingsPage.tsx`, under the "Check for updates" button. It is self-contained:
 * it reads the running version itself and owns its own state.
 *
 * `src/config/updater.test.ts` still covers `inspectUpdateFeed` and
 * `probeUpdateFeed` directly, so this is tested code rather than a museum piece.
 */
export function UpdateDiagnostics() {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    getAppInfo().then((info) => setCurrentVersion(info.version));
  }, []);

  return (
    <>
      <div className="mt-3">
        {/* Runs in the browser preview too, which is what makes it possible to
            see the same answer the installed app would get. */}
        <Button
          variant="ghost"
          disabled={testing || currentVersion === null}
          onClick={async () => {
            setTesting(true);
            setReport(null);
            const result = await inspectUpdateFeed(currentVersion ?? "0.0.0");
            setReport(result.message);
            setTesting(false);
          }}
        >
          {testing ? "Testing…" : "Test the feed"}
        </Button>
      </div>

      {report ? (
        <p className="mt-3 rounded-lg border border-line bg-raised p-3 text-xs leading-relaxed text-ink">
          {report}
        </p>
      ) : null}

      <FeedTokenRow />
    </>
  );
}

/**
 * A read-only token, for the case where the feed cannot be made public.
 *
 * Kept apart from the integrations list because it is not a data source: it
 * exists only so the updater can prove it is allowed to read a manifest, and it
 * is only ever sent when one has been stored.
 */
function FeedTokenRow() {
  const [configured, setConfigured] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    hasSecret(UPDATE_FEED_TOKEN_KEY).then(setConfigured);
  }, []);

  return (
    <div className="mt-4 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Private feed token</p>
        {configured ? (
          <Badge tone="positive">Configured</Badge>
        ) : (
          <Badge tone="neutral">Not configured</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-faint">
        Only needed if the release repository is not public. Public feeds need no
        token, and none is sent unless one is stored here. Stored in the OS
        keychain, never in the repository.
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          type="password"
          value={value}
          placeholder={configured ? "••••••••" : "Paste a read-only token"}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="default"
          disabled={!value.trim()}
          onClick={async () => {
            await saveSecret(UPDATE_FEED_TOKEN_KEY, value.trim());
            setValue("");
            setConfigured(true);
          }}
        >
          Save
        </Button>
        {configured && (
          <Button
            variant="ghost"
            onClick={async () => {
              await deleteSecret(UPDATE_FEED_TOKEN_KEY);
              setConfigured(false);
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
