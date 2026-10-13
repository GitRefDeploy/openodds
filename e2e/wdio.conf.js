import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configHome, dataHome } from "./data-root.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The application under test, and the driver that launches it.
 *
 * Release rather than debug because the Linux job in CI already builds one to
 * prove the app compiles; asking for a second, debug build to test it would
 * double the wait for no extra coverage.
 */
const application =
  process.env.OPENODDS_BINARY ??
  path.resolve(here, "../src-tauri/target/release/openodds");

const DRIVER_PORT = 4444;

let driver;

/** Do not hand over to the driver before it is listening. */
function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`tauri-driver never listened on ${port}`));
        } else {
          setTimeout(attempt, 250);
        }
      });
    };
    attempt();
  });
}

export const config = {
  hostname: "127.0.0.1",
  port: DRIVER_PORT,
  specs: ["./test/specs/**/*.spec.js"],
  maxInstances: 1,
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { ui: "bdd", timeout: 120000 },

  capabilities: [
    {
      browserName: "wry",
      // WebdriverIO 9 negotiates BiDi, which the WebKitWebDriver shipped with
      // Ubuntu 22.04 rejects — the session simply never starts without this.
      "wdio:enforceWebDriverClassic": true,
      "tauri:options": { application },
    },
  ],

  beforeSession() {
    driver = spawn("tauri-driver", [], {
      stdio: "inherit",
      env: {
        ...process.env,
        // The app is launched by the driver, so this is what gives the suite a
        // data root of its own rather than the real one.
        XDG_CONFIG_HOME: configHome,
        XDG_DATA_HOME: dataHome,
      },
    });
    return waitForPort(DRIVER_PORT);
  },

  afterSession() {
    driver?.kill();
  },
};
