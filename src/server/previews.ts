import fs from "node:fs";
import path from "node:path";
import { HARVEST_DIR, HARVEST_FILE } from "../framework/cases.ts";
import { matchEntry } from "../framework/harvest.ts";
import type { BBox, HarvestDump, RunManifest, VocabEntry } from "../framework/types.ts";

/** Where a catalog control was last seen: one screenshot plus the box (or tap point) on it. */
export type ControlPreview = {
  src: string;
  width: number;
  height: number;
  box?: BBox;
  point?: { x: number; y: number };
  from: "run" | "scan";
  runId?: string;
  at?: string;
};

const SHOT_KINDS = new Set(["tap", "see", "type"]);

function pngSize(file: string): { width: number; height: number } | null {
  try {
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(24);
    fs.readSync(fd, head, 0, 24, 0);
    fs.closeSync(fd);
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/** Older manifests only kept the tap centre in the detail, e.g. "140,189 via a11y". */
function pointFromDetail(detail?: string): { x: number; y: number } | undefined {
  const m = detail?.match(/^(\d+),(\d+) via /);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : undefined;
}

/**
 * Newest passing run step per catalog name wins, because it shows the control the way the
 * product looks today. The last scan fills in controls no run has touched yet.
 */
export function buildPreviews(runsDir: string, entries: VocabEntry[]): Record<string, ControlPreview> {
  const names = new Set(entries.map((e) => e.name));
  const out: Record<string, ControlPreview> = {};

  const ids = fs.existsSync(runsDir)
    ? fs
        .readdirSync(runsDir)
        .filter((n) => n !== "latest")
        .sort()
        .reverse()
    : [];
  for (const id of ids) {
    const manifestPath = path.join(runsDir, id, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    let manifest: RunManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      continue;
    }
    for (const step of manifest.steps ?? []) {
      if (!step.ok || !SHOT_KINDS.has(step.kind) || !names.has(step.name) || out[step.name]) continue;
      const point = step.box ? undefined : pointFromDetail(step.detail);
      if (!step.box && !point) continue;
      const size = pngSize(path.join(runsDir, id, step.file));
      if (!size) continue;
      out[step.name] = {
        src: `/artifacts/runs/${id}/${step.file}`,
        ...size,
        box: step.box,
        point,
        from: "run",
        runId: id,
        at: step.at,
      };
    }
  }

  if (fs.existsSync(HARVEST_FILE)) {
    try {
      const harvest = JSON.parse(fs.readFileSync(HARVEST_FILE, "utf8")) as HarvestDump;
      const screen = harvest.screen ? path.join(HARVEST_DIR, harvest.screen) : "";
      const size = screen ? pngSize(screen) : null;
      if (size) {
        const viewport = harvest.viewport ?? { width: size.width, height: size.height };
        for (const entry of entries) {
          if (out[entry.name]) continue;
          // a pinned box alone is not proof: it may belong to another screen, so the scan must find the control
          let box: BBox | undefined;
          try {
            box = matchEntry(entry, harvest.nodes, viewport)?.bbox;
          } catch {
            box = undefined;
          }
          if (!box) continue;
          out[entry.name] = {
            src: `/artifacts/harvest/${harvest.screen}?t=${encodeURIComponent(harvest.at)}`,
            ...size,
            box,
            from: "scan",
            at: harvest.at,
          };
        }
      }
    } catch {
      // a half-written harvest should not break the picker
    }
  }

  return out;
}
