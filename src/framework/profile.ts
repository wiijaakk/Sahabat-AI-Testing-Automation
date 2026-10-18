import fs from "node:fs";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

export const PROFILE_DIR = path.join(process.cwd(), "storage", "chrome-profile");

export const VIEWPORT = { width: 1440, height: 900 };

/** Device pixels per CSS px for the headed Chrome. Logic stays in CSS px; only evidence PNGs get sharper. */
export const SHOT_DPR = Math.max(1, Number(process.env.SAHABAT_SHOT_DPR ?? 1) || 1);

export function profileExists(): boolean {
  return fs.existsSync(path.join(PROFILE_DIR, "Default")) || fs.existsSync(path.join(PROFILE_DIR, "Local State"));
}

export async function openPersistentContext(): Promise<BrowserContext> {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  // same Chrome profile as login, so Flutter's IndexedDB session survives
  return chromium.launchPersistentContext(PROFILE_DIR, {
    channel: process.env.SAHABAT_BROWSER_CHANNEL ?? "chrome",
    headless: false,
    viewport: VIEWPORT,
    deviceScaleFactor: SHOT_DPR,
    args: [
      "--disable-dev-shm-usage",
      `--force-device-scale-factor=${SHOT_DPR}`,
      "--high-dpi-support=1",
      "--window-position=0,0",
    ],
  });
}

export async function firstPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? (await context.newPage());
}
