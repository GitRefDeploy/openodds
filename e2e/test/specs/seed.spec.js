import { expect } from "@wdio/globals";
import {
  clickButton,
  clickNav,
  setField,
  sidebarGeometry,
  waitForDomText,
  waitForText,
} from "../helpers.js";

/**
 * First run: a fresh install, which is also the data the import will later have
 * to bring across.
 *
 * The bet is recorded through the app's own import screen rather than written
 * into a database file by the test. That matters: a hand-built fixture would
 * encode this test's idea of the schema, and would go on passing after the schema
 * changed under it. What is stored here is whatever the app stores.
 *
 * The description is deliberately unlike anything else on any screen — the import
 * box's own placeholder shows "Flemington R3 #4", so asserting on that would pass
 * on an app that never imported anything.
 */

const DESCRIPTION = "E2E seeded bet";

const STATEMENT = [
  "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
  `10/03/2026,${DESCRIPTION},50.00,2.40,Won,120.00,TAB`,
].join("\n");

describe("a fresh install", () => {
  it("greets the user and finishes its setup", async () => {
    await waitForText("Welcome to OpenOdds");
    await clickButton("Continue");
    await clickButton("Continue");
    await clickButton("Finish setup");

    // The wizard is replaced by the app itself once setup is recorded.
    await waitForText("Always free");
  });

  it("keeps everything in the sidebar inside the sidebar", async () => {
    // The theme control sits in a fixed-width column and overflows it unless it
    // is rendered without its icons: three buttons carrying an icon, a gap and a
    // label each need ~240px, and the column offers 216. jsdom cannot see this —
    // there is no layout in it — so the assertion lives here, in a real engine.
    const { width, escapees } = await sidebarGeometry();

    expect(
      escapees.join("\n"),
      `the sidebar is ${width}px wide and something inside it did not fit`,
    ).toBe("");
  });

  it("records a bet through the import screen", async () => {
    await clickNav("Import");
    await waitForText("Import a statement");

    await setField("textarea[placeholder^='Date,Description']", STATEMENT);
    await waitForText("1 to import");

    await clickButton("Import 1 bet");
    await waitForText("Imported 1 bet.");

    // The row is found in the DOM rather than in the element text, because the
    // description is drawn in a label that WebKit's text command leaves out.
    await clickNav("Bets");
    await waitForDomText(DESCRIPTION);
  });
});
