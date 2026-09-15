import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VocabEntry } from "../src/framework/types";

const catalogFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "catalog.json");

export function loadVocab(): VocabEntry[] {
  return JSON.parse(fs.readFileSync(catalogFile, "utf8")) as VocabEntry[];
}

export function saveVocab(entries: VocabEntry[]) {
  fs.writeFileSync(catalogFile, JSON.stringify(entries, null, 2) + "\n");
}

export const vocab: VocabEntry[] = loadVocab();

export function vocabByName(name: string): VocabEntry {
  const hit = loadVocab().find((v) => v.name.toLowerCase() === name.toLowerCase());
  if (!hit) {
    throw new Error(`"${name}" is not in the vocabulary. Add it in the Catalog tab.`);
  }
  return hit;
}
