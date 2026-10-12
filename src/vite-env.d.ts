/// <reference types="vite/client" />

/**
 * The `version` field of `package.json`, injected by Vite at build time (see
 * `vite.config.ts`). Used only where the app cannot ask the Rust side — the
 * browser preview — so a version label is never a hand-typed literal.
 */
declare const __APP_VERSION__: string;
