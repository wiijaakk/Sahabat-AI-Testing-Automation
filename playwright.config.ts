import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: path.join(root, "tests"),
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["json", { outputFile: path.join(root, "artifacts", "playwright.json") }]],
  use: {
    baseURL: process.env.SAHABAT_BASE_URL ?? "https://chat.sahabat-ai.com",
    viewport: { width: 1440, height: 900 },
    // Flutter canvas is unhappy in headless. Keep this headed unless we
    // later prove otherwise.
    headless: false,
    trace: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /login\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "smoke",
      testMatch: /smoke\..*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "canvas",
      testMatch: /canvas\..*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "unit",
      testMatch: /.*\.unit\.spec\.ts/,
    },
  ],
});
