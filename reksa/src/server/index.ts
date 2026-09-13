import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { profileExists } from "../framework/profile.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const runsDir = path.join(root, "artifacts", "runs");
const port = Number(process.env.OPERATOR_PORT ?? 8787);

type Job = {
  id: string;
  kind: "login" | "smoke";
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
      if (!fs.existsSync(manifestPath)) {
        return { id, dir, manifest: null as null };
      }
      return { id, dir, manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")) };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function runPlaywright(kind: "login" | "smoke"): Job {
  if (current?.status === "running") {
    throw new Error("A run is already in progress");
  }
  const id = stamp();
  const runDir = path.join(runsDir, id);
  fs.mkdirSync(runDir, { recursive: true });

  const job: Job = {
    id,
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
    log: "",
    runDir,
  };
  jobs.set(id, job);
  current = job;

  const args =
    kind === "login"
      ? ["playwright", "test", "tests/login.setup.ts", "--headed", "--project=setup"]
      : ["playwright", "test", "tests/smoke.library.spec.ts", "--headed", "--project=smoke"];

  const child = spawn("npx", args, {
    cwd: root,
    env: {
      ...process.env,
      SAHABAT_RUN_ID: id,
      SAHABAT_RUN_DIR: runDir,
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
app.use(express.json());
app.use("/artifacts", express.static(path.join(root, "artifacts")));

app.get("/api/status", (_req, res) => {
  res.json({
    profile: profileExists(),
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

app.post("/api/login", (_req, res) => {
  try {
    const job = runPlaywright("login");
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
    const job = runPlaywright("smoke");
    res.json(job);
  } catch (err) {
    res.status(409).json({ error: String(err) });
  }
});

app.listen(port, () => {
  console.log(`operator server http://127.0.0.1:${port}`);
});
