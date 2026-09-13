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
  sahabat: async ({ page }, use, info) => {
    const driver = await SahabatDriver.create(page, info.title);
    try {
      await use(driver);
      if (driver.artifacts.manifest.status === "running") {
        await driver.end(true);
      }
    } catch (err) {
      try {
        await driver.end(false, String(err));
      } catch {
        // already failed taking the last shot, don't hide the real error
      }
      throw err;
    } finally {
      await driver.close();
    }
  },
});

export { expect } from "@playwright/test";
