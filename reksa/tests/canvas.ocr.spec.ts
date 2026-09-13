import { test, expect, chromium } from "@playwright/test";
import { findPhrase, readShot, stopOcrWorker } from "../src/framework/ocr.ts";
import { VIEWPORT } from "../src/framework/profile.ts";
import { waitForFlutterPaint } from "../src/framework/wait-flutter.ts";

test("ocr can read New Chat off the flutter canvas", async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.goto("https://chat.sahabat-ai.com/dashboard", { waitUntil: "domcontentloaded" });
  await waitForFlutterPaint(page);
  const png = await page.screenshot({ type: "png", scale: "css" });
  const ocr = await readShot(png);
  await browser.close();
  await stopOcrWorker();

  const hit = findPhrase(ocr, "New Chat") ?? findPhrase(ocr, "Login") ?? findPhrase(ocr, "Library");
  expect(hit, `no New Chat/Login/Library in: ${ocr.text}`).toBeTruthy();
});
