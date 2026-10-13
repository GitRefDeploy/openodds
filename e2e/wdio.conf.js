import { spawn } from "node:child_process";
import fs from "node:fs";
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

  /**
   * Keep what the app was showing when a test failed.
   *
   * This suite only ever runs where nobody can watch it, so a failure that says
   * "the app never showed X" is a dead end: the screen is the only place the
   * answer is, and the session is gone by the time anyone reads the log. The page
   * source and a screenshot go into `e2e/artifacts/`, which CI uploads.
   */
  async afterTest(test, _context, { error }) {
    if (!error) return;

    const directory = path.resolve(here, "artifacts");
    const name = test.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(
        path.join(directory, `${name}.html`),
        await browser.getPageSource(),
      );
      await browser.saveScreenshot(path.join(directory, `${name}.png`));
      console.log(`saved ${name}.html and ${name}.png to ${directory}`);
    } catch (artifactsError) {
      console.log(`could not save artifacts: ${artifactsError.message}`);
    }
  },
};
