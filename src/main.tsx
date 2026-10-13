import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { DataProvider } from "./app/DataProvider";
import { ThemeProvider } from "./app/ThemeProvider";
import "./index.css";

function rootElement(): HTMLElement {
  const found = document.getElementById("root");
  if (!found) throw new Error("Missing #root element");
  return found;
}

/**
 * The preview fixture, for reviewing the dense screens, behind `?seed` on the
 * dev server's URL.
 *
 * It runs here, in the app's own document, before the app opens the database —
 * and that placement is the point. The browser adapter keeps the whole database
 * in memory and writes all of it back on every statement, so seeding it from a
 * second document (the obvious way: a little page of its own) made two copies of
 * one `localStorage` key, last writer wins, while the app went on believing its
 * stale in-memory copy. Seeding here means one document, one copy, no reload and
 * no sequence to remember.
 *
 * `import.meta.env.DEV` and the dynamic import are both deliberate: the fixture
 * is page-side tooling, and in a packaged build this whole function is dead code
 * that the bundler drops.
 */
async function seedIfRequested(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has("seed")) return;

  // Drop the parameter before seeding. The fixture is idempotent, but leaving it
  // on the URL would rewrite the whole history every time the page is reloaded,
  // which is exactly when someone is reading the screen it just filled.
  params.delete("seed");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + (query ? `?${query}` : "") + window.location.hash,
  );

  const { seedPreview } = await import("./dev/seedPreview");
  await seedPreview();
}

async function start(): Promise<void> {
  try {
    await seedIfRequested();
  } catch (error) {
    // A failed fixture must not take the app down with it: the screens are still
    // worth reading, and the console line says why this one is empty.
    console.error("Seeding the preview database failed:", error);
  }

  createRoot(rootElement()).render(
    <StrictMode>
      <DataProvider>
        {/* Inside DataProvider: the stored preference lives in the database. */}
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </DataProvider>
    </StrictMode>,
  );
}

void start();
