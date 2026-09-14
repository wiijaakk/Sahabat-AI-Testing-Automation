import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { displayRunName, formatRunWhen, makeRunId } from "../framework/artifacts.ts";
import { deleteCase, HARVEST_FILE, listCases, loadCase, saveCase } from "../framework/cases.ts";
import { profileExists } from "../framework/profile.ts";
import type { HarvestDump, VocabEntry } from "../framework/types.ts";
import { harvestAssetPath } from "../framework/harvest-shots.ts";
import { guessUnnamedIcons } from "../framework/vision.ts";
import { loadVocab, saveVocab } from "../../vocab/screens.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runsDir = path.join(root, "artifacts", "runs");
const port = Number(process.env.OPERATOR_PORT ?? 8787);

type JobKind = "login" | "smoke" | "scan" | "case";

type Job = {
  id: string;
  kind: JobKind;
  caseId?: string;
  status: "running" | "passed" | "failed";
  startedAt: string;
  finishedAt?: string;
  log: string;
  runDir: string;
};

const jobs = new Map<string, Job>();
let current: Job | null = null;

function listRuns() {
  if (!fs.existsSync(runsDir)) return [];
  const ids = fs.readdirSync(runsDir).filter((n) => n !== "latest");
  return ids
    .map((id) => {
      const dir = path.join(runsDir, id);
      const manifestPath = path.join(dir, "manifest.json");
      const job = jobs.get(id);
      const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
        : null;
      return {
        id,
        dir,
        name: displayRunName({
          id,
          test: manifest?.test,
          kind: job?.kind,
          caseId: job?.caseId,
        }),
        when: formatRunWhen(id) ?? manifest?.startedAt ?? "",
        manifest,
      };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

function spawnJob(kind: JobKind, args: string[], caseId?: string): Job {
  if (current?.status === "running") {
    throw new Error("A run is already in progress");
  }
  const id = makeRunId(caseId ?? kind);
  const runDir = path.join(runsDir, id);
  fs.mkdirSync(runDir, { recursive: true });

  const job: Job = {
    id,
    kind,
    caseId,
    status: "running",
    startedAt: new Date().toISOString(),
    log: "",
    runDir,
  };
  jobs.set(id, job);
  current = job;

  const child = spawn("npx", args, {
    cwd: root,
    env: {
      ...process.env,
      SAHABAT_RUN_ID: id,
      SAHABAT_RUN_DIR: runDir,
      SAHABAT_CASE_ID: caseId ?? "",
    },
  });

  const append = (buf: Buffer) => {
    job.log += buf.toString();
    fs.writeFileSync(path.join(runDir, "playwright.log"), job.log);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("close", (code) => {
    job.status = code === 0 ? "passed" : "failed";
    job.finishedAt = new Date().toISOString();
    if (current?.id === job.id) current = job;
  });

  return job;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/artifacts", express.static(path.join(root, "artifacts")));

app.get("/api/status", (_req, res) => {
  res.json({
    profile: profileExists(),
    vision: Boolean(process.env.GEMINI_API_KEY),
    current,
    lastRuns: listRuns().slice(0, 10),
  });
});

app.get("/api/runs", (_req, res) => {
  res.json({ runs: listRuns() });
});

app.get("/api/runs/:id", (req, res) => {
  const dir = path.join(runsDir, req.params.id);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: "run not found" });
      return;
    }
    res.json({ job, manifest: null, shots: [] });
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const shots = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((file) => `/artifacts/runs/${req.params.id}/${file}`);
  res.json({ job: jobs.get(req.params.id) ?? null, manifest, shots });
});

app.get("/api/catalog", (_req, res) => {
  res.json({ entries: loadVocab() });
});

app.put("/api/catalog", (req, res) => {
  const entries = req.body?.entries as VocabEntry[] | undefined;
  if (!Array.isArray(entries)) {
    res.status(400).json({ error: "entries array required" });
    return;
  }
  for (const e of entries) {
    if (!e?.name || !Array.isArray(e.text)) {
      res.status(400).json({ error: "each entry needs name + text[]" });
      return;
    }
  }
  saveVocab(entries);
  res.json({ entries: loadVocab() });
});

app.get("/api/harvest", (_req, res) => {
  if (!fs.existsSync(HARVEST_FILE)) {
    res.json({ harvest: null });
    return;
  }
  res.json({ harvest: JSON.parse(fs.readFileSync(HARVEST_FILE, "utf8")) });
});

app.post("/api/vision/guess-unnamed", async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      res.status(400).json({ error: "GEMINI_API_KEY is empty. Set it in reksa/.env" });
      return;
    }
    if (!fs.existsSync(HARVEST_FILE)) {
      res.status(404).json({ error: "Scan the screen first." });
      return;
    }
    const harvest = JSON.parse(fs.readFileSync(HARVEST_FILE, "utf8")) as HarvestDump;
    const nodeId = typeof req.body?.nodeId === "string" ? req.body.nodeId : "";
    let targets = harvest.nodes.filter((n) => n.unnamed && n.crop);
    if (nodeId) targets = targets.filter((n) => n.id === nodeId);
    if (targets.length === 0) {
      res.status(400).json({ error: "No unnamed crops to guess. Scan again." });
      return;
    }
    const items = [];
    for (const n of targets) {
      const file = harvestAssetPath(n.crop!);
      if (!fs.existsSync(file)) continue;
      items.push({
        id: n.id,
        png: fs.readFileSync(file),
        hint: n.hint,
        role: n.role,
      });
    }
    if (items.length === 0) {
      res.status(400).json({ error: "Crop files missing. Scan again." });
      return;
    }
    const guesses = await guessUnnamedIcons(items);
    res.json({ guesses });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/cases", (_req, res) => {
  res.json({ cases: listCases() });
});

app.get("/api/cases/:id", (req, res) => {
  try {
    res.json({ case: loadCase(req.params.id) });
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

app.put("/api/cases/:id", (req, res) => {
  try {
    const body = req.body as { title?: string; steps?: unknown };
    const next = saveCase({
      id: req.params.id,
      title: body.title ?? req.params.id,
      steps: Array.isArray(body.steps) ? body.steps : [],
    });
    res.json({ case: next });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.delete("/api/cases/:id", (req, res) => {
  deleteCase(req.params.id);
  res.json({ ok: true });
});

app.post("/api/login", (_req, res) => {
  try {
    const job = spawnJob("login", ["playwright", "test", "tests/login.setup.ts", "--headed", "--project=setup"]);
    res.json(job);
  } catch (err) {
    res.status(409).json({ error: String(err) });
  }
});

app.post("/api/run", (_req, res) => {
  try {
    if (!profileExists()) {
      res.status(400).json({ error: "No Chrome profile yet. Click Save login first." });
      return;
    }
    const job = spawnJob("smoke", [
      "playwright",
      "test",
      "tests/smoke.library.spec.ts",
      "--headed",
      "--project=smoke",
    ]);
    res.json(job);
  } catch (err) {
    res.status(409).json({ error: String(err) });
  }
});

app.post("/api/scan", (_req, res) => {
  try {
    const job = spawnJob("scan", ["tsx", "src/runner/scan.ts"]);
    res.json(job);
  } catch (err) {
    res.status(409).json({ error: String(err) });
  }
});

app.post("/api/run-case/:id", (req, res) => {
  try {
    if (!profileExists()) {
      res.status(400).json({ error: "No Chrome profile yet. Click Save login first." });
      return;
    }
    loadCase(req.params.id);
    const job = spawnJob("case", ["tsx", "src/runner/run-case.ts", req.params.id], req.params.id);
    res.json(job);
  } catch (err) {
    const msg = String(err);
    res.status(msg.includes("already") ? 409 : 404).json({ error: msg });
  }
});

app.listen(port, () => {
  console.log(`operator server http://127.0.0.1:${port}`);
});
