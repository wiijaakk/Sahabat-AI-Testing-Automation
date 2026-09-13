import type { Page } from "@playwright/test";
import { loadVocab, vocabByName } from "../../vocab/screens.ts";
import { ArtifactSink } from "./artifacts.ts";
import { drawBox } from "./draw-box.ts";
import { shotHash } from "./hash.ts";
import { composerActionButton, matchEntry, type Viewport } from "./harvest.ts";
import { findPhrase, readShot, stopOcrWorker, type OcrPage } from "./ocr.ts";
import {
  buildReplyShot,
  classifyReply,
  replyTimeoutReason,
  type ReplyPhase,
  type ReplyShot,
} from "./reply.ts";
import type { BBox, HarvestNode, IndexedHit } from "./types.ts";
import { locateWithGemini } from "./vision.ts";
import { waitForFlutterPaint } from "./wait-flutter.ts";

const BASE = process.env.SAHABAT_BASE_URL ?? "https://chat.sahabat-ai.com";
const REPLY_MS = 60_000;
const REPLY_IDLE_MS = 800;

export class SahabatDriver {
  private hits = new Map<string, IndexedHit>();
  private harvest: HarvestNode[] = [];
  private lastUrl = "";
  private lastHash = "";
  private stale = true;
  private semanticsOn = false;
  /** Screen right before Enter, so a fast reply still counts as a change. */
  private preSend: ReplyShot | null = null;

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
    this.semanticsOn = false;
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

  private viewport(): Viewport {
    return this.page.viewportSize() ?? { width: 1440, height: 900 };
  }

  private isStale(url: string, hash: string): boolean {
    if (this.stale) return true;
    if (url !== this.lastUrl) return true;
    if (hash !== this.lastHash) return true;
    return false;
  }

  /** Flutter keeps the tree empty until you click the 1px placeholder. */
  async enableSemantics() {
    if (this.semanticsOn) {
      const n = await this.page.locator("flt-semantics").count();
      if (n > 0) return;
      this.semanticsOn = false;
    }
    await this.page.evaluate(() => {
      const el = document.querySelector("flt-semantics-placeholder") as HTMLElement | null;
      if (!el) return;
      el.focus();
      el.click();
    });
    try {
      await this.page.waitForSelector("flt-semantics[role], flt-semantics textarea", { timeout: 8000 });
      this.semanticsOn = true;
    } catch {
      this.semanticsOn = false;
    }
  }

  async collectHarvest(): Promise<HarvestNode[]> {
    await this.enableSemantics();
    const raw = await this.page.evaluate(() => {
      const nodes = [...document.querySelectorAll("flt-semantics")];
      return nodes
        .map((n) => {
          const el = n as HTMLElement;
          const r = el.getBoundingClientRect();
          const own = [...el.childNodes]
            .filter((c) => c.nodeType === 3)
            .map((c) => (c.textContent ?? "").trim())
            .filter(Boolean)
            .join(" ");
          const textarea = el.querySelector(":scope > textarea");
          // flutter's composer has a textarea and no role. ancestors also match querySelector("textarea").
          const role = el.getAttribute("role") || (textarea ? "textbox" : null);
          const label = (el.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim();
          const name = label || own;
          return {
            id: el.id,
            role,
            name,
            unnamed: (role === "button" || role === "textbox") && !name,
            bbox: {
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            },
          };
        })
        .filter((n) => n.bbox.width >= 8 && n.bbox.height >= 8)
        .filter(
          (n) =>
            n.role === "button" ||
            n.role === "textbox" ||
            n.role === "searchbox" ||
            n.role === "link",
        );
    });
    this.harvest = raw as HarvestNode[];
    return this.harvest;
  }

  lastHarvest(): HarvestNode[] {
    return this.harvest;
  }

  async scan(png?: Buffer): Promise<Map<string, IndexedHit>> {
    await this.waitForFlutter();
    const shot = png ?? (await this.grabPng());
    const url = this.page.url();
    const hash = shotHash(shot);
    if (!this.isStale(url, hash) && this.hits.size > 0) return this.hits;

    const next = new Map<string, IndexedHit>();
    const nodes = await this.collectHarvest();
    const view = this.viewport();
    const catalog = loadVocab();

    for (const entry of catalog) {
      if (entry.unnamed) continue;
      try {
        const hit = matchEntry(entry, nodes, view);
        if (!hit) continue;
        next.set(entry.name, {
          name: entry.name,
          bbox: hit.bbox,
          via: "a11y",
          text: hit.name || entry.text[0],
        });
      } catch {
        // duplicate names stay out of the index; tap() will throw with the real message
      }
    }

    // named stuff a11y missed (Skip overlay, OCR typos) still gets a box
    const ocr = await readShot(shot);
    for (const entry of catalog) {
      if (entry.unnamed || next.has(entry.name) || entry.role === "textbox") continue;
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

  private async locateUnnamed(entryName: string): Promise<IndexedHit | undefined> {
    const entry = vocabByName(entryName);
    const nodes = await this.collectHarvest();
    try {
      const fromTree = matchEntry(entry, nodes, this.viewport());
      if (fromTree) {
        return { name: entry.name, bbox: fromTree.bbox, via: "a11y", text: fromTree.name };
      }
    } catch (err) {
      throw err;
    }

    const shot = await this.grabPng();
    const ocr = await readShot(shot);
    const box = boxForEntry(ocr, entry.text);
    if (box) return { name: entry.name, bbox: box, via: "ocr", text: entry.text[0] };

    const size = this.viewport();
    try {
      const visionHits = await locateWithGemini(shot, [entry.name], size.width, size.height);
      const v = visionHits.find((h) => h.name.toLowerCase() === entry.name.toLowerCase());
      if (v) return { name: entry.name, bbox: v.bbox, via: "vision" };
    } catch (err) {
      throw err;
    }
    return undefined;
  }

  async tap(name: string) {
    const entry = vocabByName(name);
    let hit: IndexedHit | undefined;

    if (entry.unnamed) {
      hit = await this.locateUnnamed(name);
    } else {
      try {
        hit = (await this.scan()).get(entry.name);
      } catch (err) {
        const png = await this.grabPng();
        await this.artifacts.saveShot("tap-fail", name, png, false, String(err));
        this.artifacts.finish("failed", String(err));
        throw err;
      }
      if (!hit) {
        // one more try: match now that harvest exists, so duplicate errors surface
        try {
          const node = matchEntry(entry, this.harvest, this.viewport());
          if (node) hit = { name: entry.name, bbox: node.bbox, via: "a11y", text: node.name };
        } catch (err) {
          const png = await this.grabPng();
          await this.artifacts.saveShot("tap-fail", name, png, false, String(err));
          this.artifacts.finish("failed", String(err));
          throw err;
        }
      }
      if (!hit) hit = await this.locateUnnamed(name);
    }

    if (!hit) {
      const png = await this.grabPng();
      await this.artifacts.saveShot("tap-fail", name, png, false, `could not find "${name}" on screen`);
      this.artifacts.finish("failed", `could not find "${name}"`);
      throw new Error(`tap("${name}"): not on this screen (a11y miss, OCR miss, vision miss or no key)`);
    }

    const x = hit.bbox.x + hit.bbox.width / 2;
    const y = hit.bbox.y + hit.bbox.height / 2;
    const before = await this.grabPng();
    await this.artifacts.saveShot(
      "tap",
      name,
      drawBox(before, hit.bbox, true),
      true,
      `${Math.round(x)},${Math.round(y)} via ${hit.via}`,
    );

    await this.page.mouse.click(x, y);
    this.stale = true;

    if (entry.expectPath) {
      try {
        await this.page.waitForFunction(
          (part: string) => window.location.pathname.toLowerCase().includes(part),
          entry.expectPath,
          { timeout: 15_000 },
        );
      } catch {
        const png = await this.grabPng();
        await this.artifacts.saveShot(
          "tap-fail",
          name,
          drawBox(png, hit.bbox, false),
          false,
          `still at ${this.page.url()}, wanted ${entry.expectPath}`,
        );
        this.artifacts.finish("failed", `tap("${name}") stayed on ${this.page.url()}`);
        throw new Error(`tap("${name}"): still at ${this.page.url()}`);
      }
      await this.waitForFlutter();
    } else {
      await this.page.waitForTimeout(800);
    }
  }

  async dismissIfPresent(name: string) {
    this.stale = true;
    const hit = (await this.scan()).get(name);
    if (!hit) return;
    const x = hit.bbox.x + hit.bbox.width / 2;
    const y = hit.bbox.y + hit.bbox.height / 2;
    await this.page.mouse.click(x, y);
    this.stale = true;
    await this.page.waitForTimeout(600);
  }

  async see(name: string) {
    await this.waitForFlutter();
    const entry = vocabByName(name);
    const png = await this.grabPng();
    this.stale = true;
    await this.scan(png);

    let box: BBox | null = this.hits.get(entry.name)?.bbox ?? null;
    if (!box) {
      try {
        const node = matchEntry(entry, this.harvest, this.viewport());
        box = node?.bbox ?? null;
      } catch {
        box = null;
      }
    }
    if (!box) {
      const ocr = await readShot(png);
      box = boxForEntry(ocr, entry.text);
    }

    const marked = box ? drawBox(png, box, true) : png;
    await this.artifacts.saveShot("see", name, marked, Boolean(box), box ? undefined : "not found");
    if (!box) {
      this.artifacts.finish("failed", `see("${name}") failed`);
      throw new Error(`see("${name}"): not on this screen`);
    }
  }

  /** Click the box then type like a human. Filling the a11y textarea does not reach Flutter. */
  async type(name: string, text: string) {
    const entry = vocabByName(name);
    await this.scan();
    let hit = this.hits.get(entry.name);
    if (!hit) {
      const node = matchEntry(entry, this.harvest, this.viewport());
      if (node) hit = { name: entry.name, bbox: node.bbox, via: "a11y", text: node.name };
    }
    if (!hit) {
      const png = await this.grabPng();
      await this.artifacts.saveShot("tap-fail", name, png, false, `no "${name}" to type into`);
      this.artifacts.finish("failed", `type("${name}"): not on this screen`);
      throw new Error(`type("${name}"): not on this screen`);
    }

    const x = hit.bbox.x + hit.bbox.width / 2;
    const y = hit.bbox.y + Math.min(hit.bbox.height / 2, 24);
    const before = await this.grabPng();
    await this.artifacts.saveShot("type", name, drawBox(before, hit.bbox, true), true, text.slice(0, 80));

    await this.page.mouse.click(x, y);
    await this.page.waitForTimeout(400);
    await this.page.keyboard.type(text, { delay: 25 });
    this.stale = true;
    await this.page.waitForTimeout(300);
  }

  private async snapshotReply(): Promise<ReplyShot> {
    const png = await this.grabPng();
    const nodes = await this.collectHarvest();
    const view = this.viewport();
    const action = composerActionButton(nodes, view);
    return buildReplyShot(png, nodes, view, action?.bbox ?? null);
  }

  async press(key: string) {
    // stash before the key so waitReply can see "before → after" even on a fast reply
    this.preSend = await this.snapshotReply();
    await this.artifacts.saveShot("press", key, this.preSend.png, true);
    await this.page.keyboard.press(key);
    this.stale = true;
    await this.page.waitForTimeout(200);
  }

  async waitReply(timeoutMs = REPLY_MS) {
    const started = Date.now();
    // degraded path if someone called waitReply without press()
    const pre = this.preSend ?? (await this.snapshotReply());
    this.preSend = null;

    let lastPhase: ReplyPhase = "waiting";
    let idleSince: number | null = null;
    let lastPng = pre.png;

    while (Date.now() - started < timeoutMs) {
      await this.page.waitForTimeout(500);
      const now = await this.snapshotReply();
      lastPng = now.png;

      const notPink = !now.actionPink;
      if (notPink) {
        if (idleSince === null) idleSince = Date.now();
      } else {
        idleSince = null;
      }
      const idleMs = idleSince === null ? 0 : Date.now() - idleSince;
      const phase = classifyReply(pre, now, idleMs, REPLY_IDLE_MS);
      lastPhase = phase;

      if (phase === "done") {
        await this.artifacts.saveShot(
          "wait-reply",
          "reply",
          now.png,
          true,
          `${Date.now() - started}ms`,
        );
        this.stale = true;
        this.lastHash = shotHash(now.png);
        return;
      }
    }

    const reason = replyTimeoutReason(lastPhase);
    await this.artifacts.saveShot(
      "wait-reply-fail",
      "reply",
      lastPng,
      false,
      `${reason} after ${timeoutMs}ms`,
    );
    this.artifacts.finish("failed", `waitReply timed out: ${reason}`);
    throw new Error(`waitReply: ${reason} after ${timeoutMs}ms`);
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
