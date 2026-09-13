import { test as base, type Browser } from "@playwright/test";
import { SahabatDriver } from "./driver.ts";
import { firstPage, openPersistentContext } from "./profile.ts";

type Fixtures = {
  sahabat: SahabatDriver;
};

export const test = base.extend<Fixtures>({
  browser: async ({}, use) => {
    // persistent context launches its own chrome. don't also boot the default one.
    await use(null as unknown as Browser);
  },
  context: async ({}, use) => {
    const context = await openPersistentContext();
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    const page = await firstPage(context);
    await use(page);
  },
  sahabat: async ({ page }, use, testInfo) => {
    const driver = await SahabatDriver.create(page, testInfo.title);
    await use(driver);
    try {
      const passed = testInfo.status === "passed";
      const last = driver.artifacts.manifest.steps.at(-1);
      if (last?.kind !== "end") {
        await driver.end(passed, passed ? undefined : testInfo.error?.message);
      } else if (!passed) {
        driver.artifacts.finish("failed", testInfo.error?.message);
      }
    } catch {
      // last shot failed, don't hide the original test error
    } finally {
      await driver.close();
    }
  },
});

export { expect } from "@playwright/test";
