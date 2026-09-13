import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TestCase } from "./types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CASES_DIR = path.join(root, "cases");
export const HARVEST_FILE = path.join(root, "artifacts", "harvest.json");

export function listCases(): TestCase[] {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CASES_DIR, f), "utf8")) as TestCase)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function casePath(id: string): string {
  const safe = id.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!safe) throw new Error("bad case id");
  return path.join(CASES_DIR, `${safe}.json`);
}

export function loadCase(id: string): TestCase {
  const file = casePath(id);
  if (!fs.existsSync(file)) throw new Error(`case "${id}" not found`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as TestCase;
}

export function saveCase(testCase: TestCase) {
  fs.mkdirSync(CASES_DIR, { recursive: true });
  const id = testCase.id.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!id) throw new Error("case needs an id");
  const next = { ...testCase, id };
  fs.writeFileSync(casePath(id), JSON.stringify(next, null, 2) + "\n");
  return next;
}

export function deleteCase(id: string) {
  const file = casePath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
