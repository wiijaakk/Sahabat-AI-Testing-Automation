import { test } from "../src/framework/fixtures.ts";

test.setTimeout(6 * 60 * 1000);

test("save headed login into the chrome profile", async ({ sahabat }) => {
  await sahabat.gotoDashboard();
  await sahabat.waitUntilLoggedIn();
});
