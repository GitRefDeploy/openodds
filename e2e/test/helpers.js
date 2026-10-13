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
