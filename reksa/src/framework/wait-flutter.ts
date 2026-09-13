import type { Page } from "@playwright/test";

/** Flutter's custom elements show up before Skia actually paints. */
export async function waitForFlutterPaint(page: Page) {
  await page.waitForSelector("flutter-view, flt-glass-pane", { timeout: 60_000 });
  await page.waitForFunction(() => {
    const glass = document.querySelector("flt-glass-pane");
    const canvas = glass?.shadowRoot?.querySelector("canvas") as HTMLCanvasElement | null;
    return !!canvas && canvas.width > 100;
  });
  await page.waitForTimeout(2000);
}
