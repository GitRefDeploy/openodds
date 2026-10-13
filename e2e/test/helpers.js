/**
 * Wait until the whole page says something, then carry on.
 *
 * Everything in this app is rendered after a database read, so a query that runs
 * as soon as the session exists is a race against the first render. Waiting for
 * the text itself — rather than for an element to appear and then reading it — is
 * what keeps these specs from failing on a slow machine and passing on a fast one.
 */
export async function waitForText(needle, timeout = 30000) {
  await browser.waitUntil(
    async () => (await $("body").getText()).includes(needle),
    {
      timeout,
      interval: 250,
      timeoutMsg: `the app never showed "${needle}"`,
    },
  );
}

export async function bodyText() {
  return $("body").getText();
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
