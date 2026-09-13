import fs from "node:fs";
import path from "node:path";
import type { EvidenceKind, EvidenceStep, RunManifest } from "./types.ts";

function nowId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export class ArtifactSink {
  readonly dir: string;
  readonly manifest: RunManifest;
  private n = 0;

  constructor(testName: string) {
    const id = process.env.SAHABAT_RUN_ID ?? nowId();
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

  async saveShot(kind: EvidenceKind, name: string, png: Buffer, ok: boolean, detail?: string): Promise<EvidenceStep> {
    this.n += 1;
    const file = `${String(this.n).padStart(2, "0")}-${kind}-${slug(name)}.png`;
    fs.writeFileSync(path.join(this.dir, file), png);
    const step: EvidenceStep = {
      kind,
      name,
      ok,
      file,
      detail,
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

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "shot";
}
