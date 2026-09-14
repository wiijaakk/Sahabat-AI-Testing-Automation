import "dotenv/config";
import { makeRunId } from "../framework/artifacts.ts";
import { loadCase } from "../framework/cases.ts";
import { SahabatDriver } from "../framework/driver.ts";
import { firstPage, openPersistentContext } from "../framework/profile.ts";
import { runSteps } from "../framework/run-steps.ts";

const id = process.argv[2] || process.env.SAHABAT_CASE_ID;
if (!id) {
  console.error("usage: tsx src/runner/run-case.ts <case-id>");
  process.exit(2);
}

if (!process.env.SAHABAT_RUN_ID) {
  process.env.SAHABAT_RUN_ID = makeRunId(id);
}

const testCase = loadCase(id);
const context = await openPersistentContext();
const page = await firstPage(context);
const sahabat = await SahabatDriver.create(page, testCase.title);

try {
  await runSteps(sahabat, testCase.steps);
  await sahabat.end(true);
} catch (err) {
  try {
    await sahabat.end(false, String(err));
  } catch {
    // already failed taking the last shot
  }
  throw err;
} finally {
  await sahabat.close();
  await context.close();
}
