import fs from "node:fs";
import path from "node:path";
import { HARVEST_DIR, HARVEST_FILE } from "./cases.ts";
import { cropMarked, drawBoxes } from "./draw-box.ts";
import { hintFor, type Viewport } from "./harvest.ts";
import type { HarvestDump, HarvestNode, HarvestScreen } from "./types.ts";

function cropName(id: string): string {
  const safe = id.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "node";
  return `${safe}.png`;
}

function screenDir(id: string): string {
  const safe = id.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "screen";
  return safe;
}

/** Wipe the previous scan. Call once before the first screen of a full scan. */
export function resetHarvestDir() {
  fs.rmSync(HARVEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(HARVEST_DIR, { recursive: true });
}

/** Drop folders of screens that left the plan. */
export function pruneHarvestDirs(keepIds: string[]) {
  if (!fs.existsSync(HARVEST_DIR)) return;
  const keep = new Set(keepIds.map(screenDir));
  for (const name of fs.readdirSync(HARVEST_DIR)) {
    if (!keep.has(name)) fs.rmSync(path.join(HARVEST_DIR, name), { recursive: true, force: true });
  }
}

/** Drop one screen's files before rescanning it; the other screens stay. */
export function removeHarvestScreen(id: string) {
  fs.rmSync(path.join(HARVEST_DIR, screenDir(id)), { recursive: true, force: true });
  fs.mkdirSync(HARVEST_DIR, { recursive: true });
}

/** The last scan, or null when there is none or it predates screens. */
export function readHarvestIndex(): HarvestDump | null {
  if (!fs.existsSync(HARVEST_FILE)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(HARVEST_FILE, "utf8")) as Partial<HarvestDump>;
    if (!Array.isArray(raw.screens) || !raw.viewport || !raw.at) return null;
    return raw as HarvestDump;
  } catch {
    return null;
  }
}

/** Write the full shot, boxed overview, and a crop per unnamed control for one screen. */
export function writeHarvestScreen(opts: {
  id: string;
  title: string;
  page?: string;
  state?: string;
  needs?: string;
  png: Buffer;
  nodes: HarvestNode[];
  url: string;
  viewport: Viewport;
}): HarvestScreen {
  const dir = screenDir(opts.id);
  fs.mkdirSync(path.join(HARVEST_DIR, dir, "crops"), { recursive: true });
  fs.writeFileSync(path.join(HARVEST_DIR, dir, "screen.png"), opts.png);

  const unnamed = opts.nodes.filter((n) => n.unnamed && n.role === "button");
  fs.writeFileSync(
    path.join(HARVEST_DIR, dir, "unnamed.png"),
    drawBoxes(
      opts.png,
      unnamed.map((n) => n.bbox),
      true,
    ),
  );

  const nodes = opts.nodes.map((n) => {
    const hint = hintFor(n, opts.viewport);
    if (!(n.unnamed && n.role === "button")) return { ...n, hint };
    const file = `${dir}/crops/${cropName(n.id)}`;
    fs.writeFileSync(path.join(HARVEST_DIR, file), cropMarked(opts.png, n.bbox));
    return { ...n, hint, crop: file };
  });

  return {
    id: opts.id,
    title: opts.title,
    page: opts.page,
    state: opts.state,
    status: "ok",
    needs: opts.needs,
    url: opts.url,
    screen: `${dir}/screen.png`,
    overview: `${dir}/unnamed.png`,
    nodes,
  };
}

export function skippedScreen(opts: { id: string; title: string; page?: string; state?: string; needs?: string; reason: string }): HarvestScreen {
  return { id: opts.id, title: opts.title, page: opts.page, state: opts.state, status: "skipped", needs: opts.needs, reason: opts.reason, nodes: [] };
}

/** Write the index the operator reads. Safe to call after every screen so a crash still leaves a partial scan. */
export function writeHarvestIndex(dump: HarvestDump) {
  fs.mkdirSync(path.dirname(HARVEST_FILE), { recursive: true });
  fs.writeFileSync(HARVEST_FILE, JSON.stringify(dump, null, 2) + "\n");
}

export function harvestAssetPath(file: string): string {
  return path.join(HARVEST_DIR, file);
}
