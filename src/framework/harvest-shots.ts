import fs from "node:fs";
import path from "node:path";
import { HARVEST_DIR, HARVEST_FILE } from "./cases.ts";
import { cropMarked, drawBoxes } from "./draw-box.ts";
import { hintFor, type Viewport } from "./harvest.ts";
import type { HarvestDump, HarvestNode } from "./types.ts";

function cropName(id: string): string {
  const safe = id.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "") || "node";
  return `${safe}.png`;
}

/** Write the full shot, boxed overview, and a crop per unnamed control. */
export function writeHarvestBundle(opts: {
  png: Buffer;
  nodes: HarvestNode[];
  url: string;
  viewport: Viewport;
}): HarvestDump {
  fs.rmSync(HARVEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(HARVEST_DIR, "crops"), { recursive: true });
  fs.writeFileSync(path.join(HARVEST_DIR, "screen.png"), opts.png);

  const unnamed = opts.nodes.filter((n) => n.unnamed && n.role === "button");
  fs.writeFileSync(
    path.join(HARVEST_DIR, "unnamed.png"),
    drawBoxes(
      opts.png,
      unnamed.map((n) => n.bbox),
      true,
    ),
  );

  const nodes = opts.nodes.map((n) => {
    const hint = hintFor(n, opts.viewport);
    if (!(n.unnamed && n.role === "button")) return { ...n, hint };
    const file = `crops/${cropName(n.id)}`;
    fs.writeFileSync(path.join(HARVEST_DIR, file), cropMarked(opts.png, n.bbox));
    return { ...n, hint, crop: file };
  });

  const dump: HarvestDump = {
    at: new Date().toISOString(),
    url: opts.url,
    viewport: opts.viewport,
    screen: "screen.png",
    overview: "unnamed.png",
    nodes,
  };
  fs.mkdirSync(path.dirname(HARVEST_FILE), { recursive: true });
  fs.writeFileSync(HARVEST_FILE, JSON.stringify(dump, null, 2) + "\n");
  return dump;
}

export function harvestAssetPath(file: string): string {
  return path.join(HARVEST_DIR, file);
}
