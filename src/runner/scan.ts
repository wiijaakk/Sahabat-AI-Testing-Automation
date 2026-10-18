import "dotenv/config";
import { loadVocab, saveVocab } from "../../vocab/screens.ts";
import { makeRunId } from "../framework/artifacts.ts";
import { SahabatDriver } from "../framework/driver.ts";
import {
  readHarvestIndex,
  removeHarvestScreen,
  pruneHarvestDirs,
  skippedScreen,
  writeHarvestIndex,
  writeHarvestScreen,
} from "../framework/harvest-shots.ts";
import { firstPage, openPersistentContext } from "../framework/profile.ts";
import { runSteps } from "../framework/run-steps.ts";
import { addScanned, isBrowserGone, loadScanPlan, mergeScreens, renderPlan, tagCatalog } from "../framework/scan-plan.ts";
import type { HarvestDump, HarvestScreen } from "../framework/types.ts";

if (!process.env.SAHABAT_RUN_ID) {
  process.env.SAHABAT_RUN_ID = makeRunId("scan");
}

/** Optional: scan only these screen ids, e.g. `npm run scan -- library aistorage`. */
const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith("-")));

const plan = renderPlan(loadScanPlan());
const screens = plan.screens.filter((s) => only.size === 0 || only.has(s.id));
if (screens.length === 0) {
  console.error(`no screens match ${[...only].join(", ")}. Known: ${plan.screens.map((s) => s.id).join(", ")}`);
  process.exit(2);
}

const context = await openPersistentContext();
const page = await firstPage(context);
const sahabat = await SahabatDriver.create(page, "scan");
const viewport = page.viewportSize() ?? { width: 1440, height: 900 };

// Keep the last scan's screens until each one is rescanned, so a crash halfway leaves the rest intact.
const previous = readHarvestIndex()?.screens ?? [];
const scanned: HarvestScreen[] = [];
const dump: HarvestDump = { at: new Date().toISOString(), viewport, screens: previous };
const flush = () => {
  dump.screens = mergeScreens(plan, previous, scanned);
  writeHarvestIndex(dump);
};
flush();

try {
  for (const def of screens) {
    console.log(`scan: ${def.id}`);
    removeHarvestScreen(def.id);
    try {
      await sahabat.gotoDashboard();
      await sahabat.dismissIfPresent("Skip");
      await runSteps(sahabat, def.steps);
      await sahabat.waitForFlutter();
      // menus and dialogs animate in; give the tree a beat before reading it
      await page.waitForTimeout(600);
      const nodes = await sahabat.collectHarvest();
      const png = await page.screenshot({ type: "png", scale: "css" });
      const screen = writeHarvestScreen({
        id: def.id,
        title: def.title,
        page: def.page,
        state: def.state,
        needs: def.needs,
        png,
        nodes,
        url: page.url(),
        viewport,
      });
      scanned.push(screen);
      const unnamed = nodes.filter((n) => n.unnamed).length;
      await sahabat.artifacts.saveShot("scan", def.id, png, true, `${nodes.length} controls, ${unnamed} unnamed`);
    } catch (err) {
      const reason = String(err instanceof Error ? err.message : err);
      if (isBrowserGone(reason)) throw new Error(`Chrome closed while scanning ${def.id}: ${reason}`);
      console.log(`scan: skipped ${def.id}: ${reason}`);
      scanned.push(skippedScreen({ id: def.id, title: def.title, page: def.page, state: def.state, needs: def.needs, reason }));
    }
    flush();
  }

  pruneHarvestDirs(plan.screens.map((s) => s.id));
  // every labeled control this run saw goes in the catalog, then tag from what it saw;
  // screens it did not visit keep their old tags
  const tagged = tagCatalog(addScanned(loadVocab(), scanned, viewport), scanned, viewport);
  saveVocab(tagged);

  const ok = scanned.filter((s) => s.status === "ok").length;
  const skipped = scanned.filter((s) => s.status === "skipped");
  console.log(`scan: ${ok} of ${scanned.length} screens harvested`);
  for (const s of skipped) console.log(`  skipped ${s.id}${s.needs ? ` (needs: ${s.needs})` : ""}`);
  await sahabat.end(true, skipped.length ? `${skipped.length} screen(s) skipped` : undefined);
} catch (err) {
  await sahabat.end(false, String(err));
  throw err;
} finally {
  await sahabat.close();
  await context.close();
}
