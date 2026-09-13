import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

export const PROFILE_DIR = path.join(process.cwd(), "storage", "chrome-profile");

export const VIEWPORT = { width: 1440, height: 900 };

export function profileExists(): boolean {
  return fs.existsSync(path.join(PROFILE_DIR, "Default")) || fs.existsSync(path.join(PROFILE_DIR, "Local State"));
}

export async function openPersistentContext(): Promise<BrowserContext> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  // same Chrome profile as login, so Flutter's IndexedDB session survives
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    args: ["--disable-dev-shm-usage"],
  });
}

export async function firstPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? (await context.newPage());
}
