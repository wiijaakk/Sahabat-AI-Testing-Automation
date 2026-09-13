import type { BBox, ControlHint, HarvestNode, VocabEntry } from "./types.ts";

export type Viewport = { width: number; height: number };

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function aliases(entry: VocabEntry): string[] {
  return [entry.name, ...entry.text].map(norm).filter(Boolean);
}

function overlapY(a: HarvestNode, b: HarvestNode, pad = 0): boolean {
  const a0 = a.bbox.y;
  const a1 = a.bbox.y + a.bbox.height;
  const b0 = b.bbox.y - pad;
  const b1 = b.bbox.y + b.bbox.height + pad;
  return a0 < b1 && b0 < a1;
}

function sidebarX(viewport: Viewport): number {
  return Math.min(320, viewport.width * 0.28);
}

function isGiant(node: HarvestNode, viewport: Viewport): boolean {
  return node.bbox.width > viewport.width * 0.8 && node.bbox.height > viewport.height * 0.5;
}

/** Flutter TextField often has a textarea child and no role. Don't trust ancestors. */
export function harvestRole(role: string | null, hasDirectTextarea: boolean): string | null {
  if (role) return role;
  if (hasDirectTextarea) return "textbox";
  return null;
}

export function inHint(node: HarvestNode, hint: ControlHint, viewport: Viewport): boolean {
  const { x, y, width } = node.bbox;
  if (hint === "header") return y < Math.min(90, viewport.height * 0.12);
  if (hint === "sidebar") return x < sidebarX(viewport);
  if (hint === "footer") return y > viewport.height * 0.85;
  if (hint === "banner") return y > viewport.height * 0.7;
  if (hint === "composer") {
    return x >= sidebarX(viewport) && y > viewport.height * 0.35 && width < viewport.width * 0.85;
  }
  return true;
}

/** Most specific region for an unnamed icon. Sidebar wins over header so the collapse buttons stay together. */
export function hintFor(node: HarvestNode, viewport: Viewport): ControlHint | undefined {
  if (inHint(node, "sidebar", viewport)) return "sidebar";
  if (inHint(node, "header", viewport)) return "header";
  if (inHint(node, "footer", viewport)) return "footer";
  if (inHint(node, "banner", viewport)) return "banner";
  if (inHint(node, "composer", viewport)) return "composer";
  return undefined;
}

function center(box: BBox) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function dist(a: BBox, b: BBox): number {
  const ac = center(a);
  const bc = center(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
}

function sameRole(entry: VocabEntry, node: HarvestNode): boolean {
  if (entry.role) return node.role === entry.role;
  return node.role === "button" || node.role === "textbox";
}

/** Closest unnamed node to the box we saved when the human labeled it. */
function matchUnnamedByBox(
  entry: VocabEntry,
  nodes: HarvestNode[],
  viewport: Viewport,
): HarvestNode | null {
  const saved = entry.bbox;
  if (!saved) return null;
  let cands = nodes.filter((n) => n.unnamed && sameRole(entry, n));
  if (entry.hint) cands = cands.filter((n) => inHint(n, entry.hint!, viewport));
  if (cands.length === 0) return null;
  cands.sort((a, b) => dist(a.bbox, saved) - dist(b.bbox, saved));
  const best = cands[0];
  if (dist(best.bbox, saved) > 96) return null;
  return best;
}

function composerFields(nodes: HarvestNode[], viewport: Viewport): HarvestNode[] {
  return nodes.filter(
    (n) => n.role === "textbox" && !isGiant(n, viewport) && inHint(n, "composer", viewport),
  );
}

/** + on the left, mic/send on the right. The field is the gap, a bit above the icons. */
function composerFromIcons(nodes: HarvestNode[], viewport: Viewport): HarvestNode | null {
  const leftBound = sidebarX(viewport);
  const icons = nodes.filter(
    (n) =>
      n.role === "button" &&
      n.unnamed &&
      n.bbox.x > leftBound &&
      n.bbox.y > viewport.height * 0.4 &&
      n.bbox.width <= 48 &&
      n.bbox.height <= 48,
  );
  if (icons.length < 2) return null;
  const ordered = [...icons].sort((a, b) => a.bbox.x - b.bbox.x);
  const left = ordered[0];
  const right = ordered[ordered.length - 1];
  const iconBottom = Math.max(left.bbox.y + left.bbox.height, right.bbox.y + right.bbox.height);
  const y = Math.min(left.bbox.y, right.bbox.y) - 44;
  return {
    id: "synthetic:composer",
    role: "textbox",
    name: "",
    unnamed: true,
    bbox: {
      x: left.bbox.x,
      y,
      width: right.bbox.x + right.bbox.width - left.bbox.x,
      height: iconBottom - y,
    },
  };
}

function matchComposer(nodes: HarvestNode[], viewport: Viewport): HarvestNode | null {
  const fields = composerFields(nodes, viewport);
  if (fields.length === 1) return fields[0];
  if (fields.length > 1) {
    const ranked = [...fields].sort(
      (a, b) => b.bbox.width - a.bbox.width || b.bbox.y - a.bbox.y,
    );
    return ranked[0];
  }
  return composerFromIcons(nodes, viewport);
}

/** Rightmost unnamed button on the composer row (send / stop / mic). */
export function composerActionButton(
  nodes: HarvestNode[],
  viewport: Viewport,
): HarvestNode | null {
  const box = matchComposer(nodes, viewport);
  if (!box) return null;
  const cands = nodes.filter(
    (n) =>
      n.role === "button" &&
      n.unnamed &&
      overlapY(n, box, 48) &&
      n.bbox.x > box.bbox.x + box.bbox.width * 0.4,
  );
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.bbox.x - a.bbox.x);
  return cands[0];
}

/** Pick the one harvest node for a saved catalog entry, or null. Throws on duplicates. */
export function matchEntry(
  entry: VocabEntry,
  nodes: HarvestNode[],
  viewport: Viewport,
): HarvestNode | null {
  if (entry.unnamed) {
    const byBox = matchUnnamedByBox(entry, nodes, viewport);
    if (byBox) return byBox;
    if (entry.hint === "composer") {
      return composerActionButton(nodes, viewport);
    }
    return null;
  }

  if (entry.role === "textbox") {
    return matchComposer(nodes, viewport);
  }

  const want = aliases(entry);
  let hits = nodes.filter((n) => n.name && want.includes(norm(n.name)));
  if (entry.hint) hits = hits.filter((n) => inHint(n, entry.hint!, viewport));
  if (hits.length === 0) return null;
  if (hits.length > 1) {
    throw new Error(
      `"${entry.name}" matched ${hits.length} controls. Pin it again with a hint (header / sidebar).`,
    );
  }
  return hits[0];
}

export function nodeBbox(raw: {
  x: number;
  y: number;
  width: number;
  height: number;
}): BBox {
  return {
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
  };
}
