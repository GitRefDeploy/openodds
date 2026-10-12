import { useEffect, useState } from "react";
import { getAppInfo } from "@/config/appInfo";

/**
 * The running version, asked for rather than typed.
 *
 * Both places that show a version used to hold the literal "v0.1.0", so they
 * were wrong the moment the project was released again — and a stale version
 * number is exactly what makes a working update check look broken.
 */
export function AppVersion({ className }: { className?: string }) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppInfo().then((info) => {
      if (!cancelled) setVersion(info.version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <span className={className}>v{version ?? "…"}</span>;
}
