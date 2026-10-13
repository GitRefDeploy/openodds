import { bodyText, clickButton, clickNav, waitForText } from "../helpers.js";

/**
 * First run: a fresh install, which is also the data the import will later have
 * to bring across.
 *
 * The bet is recorded through the app's own import screen rather than written
 * into a database file by the test. That matters: a hand-built fixture would
 * encode this test's idea of the schema, and would go on passing after the schema
 * changed under it. What is stored here is whatever the app stores.
 */

const STATEMENT = [
  "Date,Description,Stake,Odds,Result,Payout,Bookmaker",
  "10/03/2026,Flemington R3 #4,50.00,2.40,Won,120.00,TAB",
].join("\n");

describe("a fresh install", () => {
  it("greets the user and finishes its setup", async () => {
    await waitForText("Welcome to OpenOdds");
    await clickButton("Continue");
    await clickButton("Continue");
    await clickButton("Finish setup");

    // The wizard is replaced by the app itself once setup is recorded.
    await waitForText("Local · open source");
  });

  it("records a bet through the import screen", async () => {
    await clickNav("Import");
    await waitForText("Import a statement");

    await $("textarea").setValue(STATEMENT);
    await waitForText("1 to import");
    await clickButton("Import 1 bet");
    await waitForText("Imported 1 bet.");

    await clickNav("Bets");
    await waitForText("Flemington R3 #4");
  });

  it("has the bet on the record it will have to find again", async () => {
    // Read back through the UI rather than the file: this is what the second
    // spec asserts too, so the pair cannot both be satisfied by an empty app.
    const text = await bodyText();
    if (!text.includes("Flemington R3 #4")) {
      throw new Error(`the bet is not on the Bets screen:\n${text}`);
    }
  });
});
