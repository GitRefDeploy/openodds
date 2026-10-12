import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * The checks CI runs. Typecheck already proves the types line up; what is left
 * for the linter is the class of mistake the compiler cannot see — a hook
 * called conditionally, a dependency array that has quietly gone stale, or
 * state seeded from an effect that should have been initial state.
 *
 * This is the plugin's own recommended set, which now also carries the
 * compiler-era rules. Where one of those only reports that React Compiler has
 * declined to memoise a third-party hook (TanStack Table, react-hook-form) it
 * stays a warning: that is information about the compiler, not a defect in the
 * code, and failing the build on it would only teach people to bypass the gate.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src-tauri/target/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The app's own console output is deliberate; `no-console` is not enabled
      // either way, but debugger statements are never meant to ship.
      "no-debugger": "error",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // `_`-prefixed arguments are the codebase's way of saying a signature is
      // fixed by the caller, so they are not unused-variable mistakes.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Build and maintenance scripts run in Node, which is where Buffer and
    // process come from. Without this they read as undefined globals.
    files: ["scripts/**/*.mjs", "*.mjs", "*.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
