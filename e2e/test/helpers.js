/**
 * Helpers shared by the specs.
 *
 * Everything in this app is rendered after a database read, so a query that runs
 * as soon as the session exists is a race against the first render; every wait
 * here is on the text itself rather than on an element appearing and then being
 * read. And every one of them reports the whole screen when it gives up, because
 * the only place these specs fail is a CI run nobody can look at.
 */

const SCREEN_LIMIT = 2000;

async function screen() {
  return $("body").getText();
}

async function waitFor(matches, timeoutMs, description) {
  let text = "";
  try {
    await browser.waitUntil(
      async () => {
        text = await screen();
        return matches(text);
      },
      { timeout: timeoutMs, interval: 250, timeoutMsg: description },
    );
  } catch (error) {
    throw new Error(
      `${error.message}\nthe screen said:\n${text.slice(0, SCREEN_LIMIT)}`,
      { cause: error },
    );
  }
  return text;
}

export async function waitForText(needle, timeout = 30000) {
  return waitFor(
    (text) => text.includes(needle),
    timeout,
    `the app never showed "${needle}"`,
  );
}

export async function bodyText() {
  return screen();
}

/**
 * The page's text as the DOM holds it, rather than as the element-text command
 * reports it.
 *
 * WebKit leaves out anything inside a `truncate` span — this app's way of writing
 * a label that may be clipped — and the bet's description is exactly that kind of
 * label, so "the bet is on the screen" cannot be asked with `getText()`. The
 * first run of this suite proved it the hard way: the row was in the DOM, the
 * screen text simply did not mention it.
 */
export async function domText(selector = "body") {
  return browser.execute(
    (sel) => document.querySelector(sel)?.textContent ?? "",
    selector,
  );
}

/** Wait for something the element-text command would not report. */
export async function waitForDomText(needle, timeout = 30000) {
  let text = "";
  try {
    await browser.waitUntil(
      async () => {
        text = await domText();
        return text.includes(needle);
      },
      {
        timeout,
        interval: 250,
        timeoutMsg: `the page never contained "${needle}"`,
      },
    );
  } catch (error) {
    throw new Error(
      `${error.message}\nthe page held:\n${text.slice(0, SCREEN_LIMIT)}`,
      { cause: error },
    );
  }
  return text;
}

/**
 * Put text into a field the way React will notice.
 *
 * WebdriverIO's own `setValue` types the text through the WebDriver, and on
 * WebKitWebDriver that left the app's change handler unrun: the field held the
 * statement while the screen went on showing nothing. Setting the value through
 * the native setter and dispatching the event React listens for runs the same
 * handler the keyboard would — what is under test here is the import behind that
 * handler, not keystroke handling.
 */
export async function setField(selector, text) {
  await browser.execute(
    (sel, value) => {
      const field = document.querySelector(sel);
      if (!field) throw new Error(`no field matching ${sel}`);
      const prototype =
        field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    },
    selector,
    text,
  );
}

/**
 * Sidebar buttons by their exact label. XPath rather than the text selector
 * because several buttons in this app start with the same word — the sidebar's
 * "Import" and the import screen's "Import 1 bet" are both on screen at once.
 */
export async function clickNav(label) {
  await $(`//nav//button[normalize-space()="${label}"]`).click();
}

export async function clickButton(label) {
  await $(`//button[normalize-space()="${label}"]`).click();
}

/**
 * What the sidebar contains that it should not, and where it ends.
 *
 * The sidebar is a fixed-width column and the theme control at its foot was
 * measured 11px past its right edge — painted underneath the main pane, so the
 * end of "Light" was simply not on screen. No unit test can catch that: jsdom
 * has no layout engine, so nothing in a DOM-only test can tell you a box is too
 * wide. This asks the real engine, which is the only place the answer exists.
 */
export async function sidebarGeometry() {
  return browser.execute(() => {
    const sidebar = document.querySelector("aside");
    if (!sidebar) throw new Error("no sidebar on the page");

    const bounds = sidebar.getBoundingClientRect();
    const escapees = [];

    for (const element of sidebar.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      // A collapsed element has no box to judge, and zero-width boxes overlap
      // their neighbours' edges by rounding alone.
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > bounds.right + 0.5 || rect.left < bounds.left - 0.5) {
        const name = element.getAttribute("class")?.split(/\s+/)[0];
        escapees.push(
          `${element.tagName.toLowerCase()}${name ? `.${name}` : ""} spans ` +
            `${rect.left.toFixed(1)}..${rect.right.toFixed(1)}, ` +
            `but the sidebar is ${bounds.left.toFixed(1)}..${bounds.right.toFixed(1)}`,
        );
      }
    }

    return {
      width: bounds.width,
      right: bounds.right,
      escapees,
    };
  });
}
