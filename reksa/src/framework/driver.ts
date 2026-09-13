import type { Page } from "@playwright/test";
import { vocab, vocabByName } from "../../vocab/screens.ts";
import { ArtifactSink } from "./artifacts.ts";
import { drawBox } from "./draw-box.ts";
import { shotHash } from "./hash.ts";
import { findPhrase, readShot, stopOcrWorker, type OcrPage } from "./ocr.ts";
import type { BBox, IndexedHit } from "./types.ts";
import { locateWithGemini } from "./vision.ts";
import { waitForFlutterPaint } from "./wait-flutter.ts";

const BASE = process.env.SAHABAT_BASE_URL ?? "https://chat.sahabat-ai.com";

export class SahabatDriver {
  private hits = new Map<string, IndexedHit>();
  private lastUrl = "";
  private lastHash = "";
  private stale = true;

  private constructor(
    readonly page: Page,
    readonly artifacts: ArtifactSink,
  ) {}

  static async create(page: Page, testName: string): Promise<SahabatDriver> {
    return new SahabatDriver(page, new ArtifactSink(testName));
  }

  async close() {
    await stopOcrWorker();
  }

  markStale() {
    this.stale = true;
  }

  async gotoDashboard() {
    await this.page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await this.waitForFlutter();
    this.stale = true;
  }

  async waitUntilLoggedIn(timeoutMs = 5 * 60 * 1000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      this.stale = true;
      const hits = await this.scan();
      const inApp =
        hits.has("Library") &&
        (hits.has("AIStorage") || hits.has("Go Pro") || hits.has("Search chats"));
      if (inApp) {
        await this.checkpoint("logged-in-dashboard");
        return;
      }
      await this.page.waitForTimeout(2500);
    }
    const png = await this.grabPng();
    await this.artifacts.saveShot(
      "login",
      "timeout",
      png,
      false,
      "dashboard never showed Library + AIStorage",
    );
    throw new Error("Login timed out. Finish login in the Chrome window until Library is visible.");
  }

  async waitForFlutter() {
    await waitForFlutterPaint(this.page);
  }

  private async grabPng(): Promise<Buffer> {
    return this.page.screenshot({ type: "png", scale: "css" });
  }

  private isStale(url: string, hash: string): boolean {
    if (this.stale) return true;
    if (url !== this.lastUrl) return true;
    if (hash !== this.lastHash) return true;
    return false;
  }

  async scan(png?: Buffer): Promise<Map<string, IndexedHit>> {
    await this.waitForFlutter();
    const shot = png ?? (await this.grabPng());
    const url = this.page.url();
    const hash = shotHash(shot);
    if (!this.isStale(url, hash) && this.hits.size > 0) return this.hits;

    const ocr = await readShot(shot);
    const next = new Map<string, IndexedHit>();
    for (const entry of vocab) {
      const box = boxForEntry(ocr, entry.text);
      if (!box) continue;
      next.set(entry.name, { name: entry.name, bbox: box, via: "ocr", text: entry.text[0] });
    }

    this.hits = next;
    this.lastUrl = url;
    this.lastHash = hash;
    this.stale = false;
    return this.hits;
  }

  async tap(name: string) {
    const entry = vocabByName(name);
    let hit = (await this.scan()).get(entry.name);

    if (!hit) {
      const shot = await this.grabPng();
      const size = this.page.viewportSize() ?? { width: 1440, height: 900 };
      try {
        const visionHits = await locateWithGemini(shot, [entry.name], size.width, size.height);
        const v = visionHits.find((h) => h.name.toLowerCase() === entry.name.toLowerCase());
        if (v) {
          hit = { name: entry.name, bbox: v.bbox, via: "vision" };
          this.hits.set(entry.name, hit);
        }
      } catch (err) {
        const png = await this.grabPng();
        await this.artifacts.saveShot("tap-fail", name, png, false, String(err));
        this.artifacts.finish("failed", String(err));
        throw err;
      }
    }

    if (!hit) {
      const png = await this.grabPng();
      await this.artifacts.saveShot("tap-fail", name, png, false, `could not find "${name}" on screen`);
      this.artifacts.finish("failed", `could not find "${name}"`);
      throw new Error(`tap("${name}"): not on this screen (OCR miss, vision miss or no key)`);
    }

    const x = hit.bbox.x + hit.bbox.width / 2;
    const y = hit.bbox.y + hit.bbox.height / 2;
    await this.page.mouse.click(x, y);
    this.stale = true;

    if (entry.expectUrl) {
      await this.page.waitForURL(entry.expectUrl, { timeout: 20_000 });
      await this.waitForFlutter();
    } else {
      await this.page.waitForTimeout(800);
    }
  }

  async see(name: string) {
    await this.waitForFlutter();
    const entry = vocabByName(name);
    const png = await this.grabPng();
    const ocr = await readShot(png);
    const box = boxForEntry(ocr, entry.text);
    const marked = box ? drawBox(png, box, true) : png;
    await this.artifacts.saveShot("see", name, marked, Boolean(box), box ? undefined : "not found");
    this.stale = true;
    await this.scan(png);
    if (!box) {
      this.artifacts.finish("failed", `see("${name}") failed`);
      throw new Error(`see("${name}"): OCR did not find it`);
    }
  }

  async checkpoint(name: string) {
    const png = await this.grabPng();
    await this.artifacts.saveShot("checkpoint", name, png, true);
  }

  async end(ok: boolean, error?: string) {
    const png = await this.grabPng();
    await this.artifacts.saveShot("end", ok ? "passed" : "failed", png, ok, error);
    this.artifacts.finish(ok ? "passed" : "failed", error);
  }
}

function boxForEntry(ocr: OcrPage, texts: string[]): BBox | null {
  for (const t of texts) {
    const box = findPhrase(ocr, t);
    if (box) return box;
  }
  return null;
}
