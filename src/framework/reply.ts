import { PNG } from "pngjs";
import { shotHash } from "./hash.ts";
import type { Viewport } from "./harvest.ts";
import type { BBox, HarvestNode } from "./types.ts";

export type ReplyPhase = "home" | "generating" | "waiting" | "done";

export type ReplyShot = {
  png: Buffer;
  nodes: HarvestNode[];
  viewport: Viewport;
  /** Hash of the transcript crop at this moment. */
  transcriptHash: string;
  /** True when the right composer icon is brand pink (send or stop). */
  actionPink: boolean;
};

const HOME_MARKERS = ["create image", "how can i help you today"];

/** Main chat pane: skip sidebar, header chrome, and the composer strip. */
export function transcriptBox(viewport: Viewport): BBox {
  const left = Math.min(320, viewport.width * 0.28);
  const top = Math.min(90, viewport.height * 0.12);
  const bottom = viewport.height * 0.72;
  return {
    x: left,
    y: top,
    width: Math.max(1, viewport.width - left - 16),
    height: Math.max(1, bottom - top),
  };
}

function parsePng(png: Buffer): PNG {
  return PNG.sync.read(png);
}

function cropHash(png: Buffer, box: BBox): string {
  const img = parsePng(png);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(img.height, Math.ceil(box.y + box.height));
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const out = new PNG({ width, height });
  PNG.bitblt(img, out, x0, y0, width, height, 0, 0);
  return shotHash(Buffer.from(PNG.sync.write(out)));
}

/**
 * Send and stop share the brand pink fill. Mic is gray.
 * Sample the middle of the icon and check for high-R / low-G.
 */
export function isPinkAction(png: Buffer, bbox: BBox): boolean {
  const img = parsePng(png);
  const cx = Math.round(bbox.x + bbox.width / 2);
  const cy = Math.round(bbox.y + bbox.height / 2);
  // a few pixels around the center so we don't hit the white arrow glyph
  let pink = 0;
  let total = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = (img.width * y + x) << 2;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      total += 1;
      // sahabat pink sits around (226, 0, 116)-ish; mic is near gray
      if (isBrandPink(r, g, b)) pink += 1;
    }
  }
  if (total === 0) return false;
  return pink / total >= 0.35;
}

/** sahabat pink sits around (226, 0, 116)-ish; mic is near gray */
function isBrandPink(r: number, g: number, b: number): boolean {
  return r > 160 && g < 90 && b > 60 && r > g + 60;
}

/**
 * Send/stop by pixels alone: in a project chat the action button often has no a11y node.
 * Stop is a ~10px pink square, send a ~30px pink circle, mic has no pink.
 */
export function composerStripPink(png: Buffer): boolean {
  const img = parsePng(png);
  const x0 = Math.round(img.width * 0.28);
  const y0 = Math.round(img.height * 0.8);
  let n = 0;
  let minX = Infinity;
  let maxX = -1;
  let minY = Infinity;
  let maxY = -1;
  for (let y = y0; y < img.height; y++) {
    for (let x = x0; x < img.width; x++) {
      const i = (img.width * y + x) << 2;
      if (!isBrandPink(img.data[i], img.data[i + 1], img.data[i + 2])) continue;
      n += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (n < 40) return false;
  // a wide pink bar is a CTA like Create New, not the round icon
  return maxX - minX <= 60 && maxY - minY <= 60;
}

/** New Chat hero still showing chips / greeting. */
export function looksEmptyHome(nodes: HarvestNode[]): boolean {
  return nodes.some((n) => {
    const name = n.name.toLowerCase().replace(/\s+/g, " ").trim();
    return HOME_MARKERS.some((m) => name.includes(m));
  });
}

export function buildReplyShot(
  png: Buffer,
  nodes: HarvestNode[],
  viewport: Viewport,
  actionBbox: BBox | null,
): ReplyShot {
  return {
    png,
    nodes,
    viewport,
    transcriptHash: cropHash(png, transcriptBox(viewport)),
    actionPink: (actionBbox ? isPinkAction(png, actionBbox) : false) || composerStripPink(png),
  };
}

const DEFAULT_IDLE_MS = 800;

/**
 * Decide where we are in the send → reply cycle.
 * idleMs is how long the current "not pink" frame has been true.
 */
export function classifyReply(
  pre: ReplyShot,
  now: ReplyShot,
  idleMs: number,
  idleNeedMs = DEFAULT_IDLE_MS,
): ReplyPhase {
  const onHome = looksEmptyHome(now.nodes);
  if (onHome) return "home";

  if (now.actionPink) return "generating";

  const leftHome = looksEmptyHome(pre.nodes) && !onHome;
  const transcriptMoved = now.transcriptHash !== pre.transcriptHash;
  if (!leftHome && !transcriptMoved) return "waiting";

  if (idleMs >= idleNeedMs) return "done";
  return "waiting";
}

export function replyTimeoutReason(last: ReplyPhase): string {
  if (last === "home") return "still on home (prompt never left composer)";
  if (last === "generating") return "still generating (composer action still pink)";
  if (last === "waiting") return "transcript never moved / never settled";
  return "reply wait failed";
}
