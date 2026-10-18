import fs from "node:fs";
import path from "node:path";
import { drawBoxes, fillRects } from "./draw-box.ts";
import type { BBox, EvidenceKind, EvidenceStep, RunManifest } from "./types.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ACTION_TITLES: Record<string, string> = {
  login: "Save login",
  smoke: "Library smoke",
  scan: "Scan screen",
};

const TEST_TITLES: Record<string, string> = {
  "save headed login into the chrome profile": "Save login",
  "dashboard opens Library": "Library smoke",
  scan: "Scan screen",
  "dump-semantics": "Scan screen",
};

export function slug(name: string, fallback = "run"): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || fallback
  );
}

export function makeRunId(action: string, at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `${when}-${slug(action)}`;
}

export function actionFromRunId(id: string): string | undefined {
  return id.match(/^\d{8}-\d{6}-(.+)$/)?.[1];
}

export function formatRunWhen(id: string): string | undefined {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[4]}:${m[5]}`;
}

export function displayRunName(opts: {
  id: string;
  test?: string;
  kind?: string;
  caseId?: string;
}): string {
  const action = (opts.kind === "case" ? opts.caseId : opts.kind) || actionFromRunId(opts.id);
  if (action && ACTION_TITLES[action]) return ACTION_TITLES[action];
  if (opts.test && TEST_TITLES[opts.test]) return TEST_TITLES[opts.test];
  if (opts.test) return opts.test;
  if (action) return action;
  return opts.id;
}

/** SAHABAT_REDACT="x,y,w,h;x,y,w,h" in page CSS px: areas painted over in every saved screenshot (phone number, email). */
function redactRects(): BBox[] {
  const raw = process.env.SAHABAT_REDACT?.trim();
  if (!raw) return [];
  return raw
    .split(";")
    .map((part) => part.split(",").map(Number))
    .filter((n) => n.length === 4 && n.every((v) => Number.isFinite(v)))
    .map(([x, y, width, height]) => ({ x, y, width, height }));
}

function roundBox(box: BBox): BBox {
  return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
}

export class ArtifactSink {
  readonly dir: string;
  readonly manifest: RunManifest;
  private n = 0;
  /** Optional device-scale grab. When set, saved PNGs are re-taken sharper and boxes are scaled to match. */
  hdShot: (() => Promise<Buffer>) | null = null;

  constructor(testName: string) {
    const id = process.env.SAHABAT_RUN_ID ?? makeRunId(testName);
    const root = process.env.SAHABAT_RUN_DIR ?? path.join(process.cwd(), "artifacts", "runs", id);
    fs.mkdirSync(root, { recursive: true });
    this.dir = root;
    this.manifest = {
      id,
      test: testName,
      status: "running",
      startedAt: new Date().toISOString(),
      steps: [],
    };
    this.flush();
  }

  private flush() {
    fs.writeFileSync(path.join(this.dir, "manifest.json"), JSON.stringify(this.manifest, null, 2));
    // pointer so the UI can just hit /artifacts/runs/latest
    const latest = path.join(process.cwd(), "artifacts", "runs", "latest");
    fs.mkdirSync(path.dirname(latest), { recursive: true });
    fs.writeFileSync(latest, this.dir);
  }

  async saveShot(kind: EvidenceKind, name: string, png: Buffer, ok: boolean, detail?: string, box?: BBox): Promise<EvidenceStep> {
    this.n += 1;
    const file = `${String(this.n).padStart(2, "0")}-${kind}-${slug(name, "shot")}.png`;
    let k = 1;
    if (this.hdShot) {
      try {
        const hd = await this.hdShot();
        k = hd.readUInt32BE(16) / png.readUInt32BE(16);
        if (k > 1.01) {
          if (box) box = { x: box.x * k, y: box.y * k, width: box.width * k, height: box.height * k };
          png = box ? drawBoxes(hd, [box], ok, Math.round(2 * k)) : hd;
        } else {
          k = 1;
        }
      } catch {
        k = 1;
      }
    }
    const redact = redactRects();
    if (redact.length) {
      png = fillRects(
        png,
        redact.map((r) => ({ x: r.x * k, y: r.y * k, width: r.width * k, height: r.height * k })),
      );
    }
    fs.writeFileSync(path.join(this.dir, file), png);
    const step: EvidenceStep = {
      kind,
      name,
      ok,
      file,
      detail,
      box: box ? roundBox(box) : undefined,
      at: new Date().toISOString(),
    };
    this.manifest.steps.push(step);
    this.flush();
    return step;
  }

  finish(status: "passed" | "failed", error?: string) {
    this.manifest.status = status;
    this.manifest.finishedAt = new Date().toISOString();
    this.manifest.error = error;
    this.flush();
  }
}

