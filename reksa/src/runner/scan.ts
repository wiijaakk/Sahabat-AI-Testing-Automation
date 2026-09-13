import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { SahabatDriver } from "../framework/driver.ts";
import { HARVEST_FILE } from "../framework/cases.ts";
import { firstPage, openPersistentContext } from "../framework/profile.ts";

const context = await openPersistentContext();
const page = await firstPage(context);
const sahabat = await SahabatDriver.create(page, "scan");

try {
  await sahabat.gotoDashboard();
  await sahabat.dismissIfPresent("Skip");
  await sahabat.scan();
  const nodes = sahabat.lastHarvest();
  fs.mkdirSync(path.dirname(HARVEST_FILE), { recursive: true });
  fs.writeFileSync(
    HARVEST_FILE,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        url: page.url(),
        nodes,
      },
      null,
      2,
    ) + "\n",
  );
  const png = await page.screenshot({ type: "png", scale: "css" });
  await sahabat.artifacts.saveShot("scan", "screen", png, true, `${nodes.length} controls`);
  await sahabat.end(true);
} catch (err) {
  await sahabat.end(false, String(err));
  throw err;
} finally {
  await sahabat.close();
  await context.close();
}
