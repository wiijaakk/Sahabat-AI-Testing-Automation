import { test } from "../src/framework/fixtures.ts";

test("dashboard opens Library", async ({ sahabat }) => {
  await sahabat.gotoDashboard();
  await sahabat.tap("Library");
  await sahabat.see("AI Creations");
});
