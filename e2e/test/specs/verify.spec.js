import { bodyText, clickNav, waitForText } from "../helpers.js";

/**
 * Second run: this install has no database of its own, and the only copy of one
 * is in the directory named after the identity the app had before the rename.
 *
 * Between the two specs the test moves the database there and deletes the copy
 * this identity had, so the bet can only be on screen because the import found
 * it, copied it in, and the app opened the copy. The two things asserted are the
 * two a user would notice: that the app says what it did, and that their bets are
 * where they left them.
 */
describe("after an update from the previous identity", () => {
  it("says it brought the earlier data across", async () => {
    await waitForText("Brought your data across");

    const text = await bodyText();
    if (!text.includes("bets, bookmakers and settings were copied")) {
      throw new Error(`the notice did not explain what came across:\n${text}`);
    }
  });

  it("shows the bet the earlier copy was holding", async () => {
    await clickNav("Bets");
    await waitForText("Flemington R3 #4");
  });
});
