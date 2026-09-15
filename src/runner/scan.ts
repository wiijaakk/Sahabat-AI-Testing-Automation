import "dotenv/config";
import { makeRunId } from "../framework/artifacts.ts";
import { SahabatDriver } from "../framework/driver.ts";
import { writeHarvestBundle } from "../framework/harvest-shots.ts";
import { firstPage, openPersistentContext } from "../framework/profile.ts";

if (!process.env.SAHABAT_RUN_ID) {
  process.env.SAHABAT_RUN_ID = makeRunId("scan");
}

const context = await openPersistentContext();
const page = await firstPage(context);
const sahabat = await SahabatDriver.create(page, "scan");

try {
  await sahabat.gotoDashboard();
  await sahabat.dismissIfPresent("Skip");
  await sahabat.scan();
  const nodes = sahabat.lastHarvest();
  const png = await page.screenshot({ type: "png", scale: "css" });
  writeHarvestBundle({
    png,
    nodes,
    url: page.url(),
    viewport: page.viewportSize() ?? { width: 1440, height: 900 },
  });
  const unnamed = nodes.filter((n) => n.unnamed).length;
  await sahabat.artifacts.saveShot(
    "scan",
    "screen",
    png,
    true,
    `${nodes.length} controls, ${unnamed} unnamed`,
  );
  await sahabat.end(true);
} catch (err) {
  await sahabat.end(false, String(err));
  throw err;
} finally {
  await sahabat.close();
  await context.close();
}
