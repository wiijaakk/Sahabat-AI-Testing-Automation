import { createWorker, type Worker } from "tesseract.js";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import type { BBox } from "./types.ts";

export type OcrWord = {
  text: string;
  bbox: BBox;
  confidence: number;
};

export type OcrPage = {
  text: string;
  words: OcrWord[];
};

let worker: Worker | null = null;

export async function getOcrWorker(): Promise<Worker> {
  if (worker) return worker;
  const cachePath = path.join(process.cwd(), "storage", "tessdata");
  fs.mkdirSync(cachePath, { recursive: true });
  worker = await createWorker("eng", undefined, { cachePath });
  // sparse UI labels, not a novel
  await worker.setParameters({ tessedit_pageseg_mode: "11" });
  return worker;
}

export async function stopOcrWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

export async function readShot(png: Buffer): Promise<OcrPage> {
  const w = await getOcrWorker();
  const scaled = upscale(png, 2);
  const { data } = await w.recognize(scaled.buf, undefined, { text: true, blocks: true });
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          const text = word.text?.trim();
          if (!text) continue;
          words.push({
            text,
            confidence: word.confidence ?? 0,
            bbox: {
              x: word.bbox.x0 / scaled.factor,
              y: word.bbox.y0 / scaled.factor,
              width: (word.bbox.x1 - word.bbox.x0) / scaled.factor,
              height: (word.bbox.y1 - word.bbox.y0) / scaled.factor,
            },
          });
        }
      }
    }
  }
  return { text: data.text ?? "", words };
}

function upscale(png: Buffer, factor: number): { buf: Buffer; factor: number } {
  try {
    const src = PNG.sync.read(png);
    if (src.width >= 1800) return { buf: png, factor: 1 };
    const out = new PNG({ width: src.width * factor, height: src.height * factor });
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (src.width * y + x) << 2;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const j = (out.width * (y * factor + dy) + (x * factor + dx)) << 2;
            out.data[j] = src.data[i];
            out.data[j + 1] = src.data[i + 1];
            out.data[j + 2] = src.data[i + 2];
            out.data[j + 3] = src.data[i + 3];
          }
        }
      }
    }
    return { buf: Buffer.from(PNG.sync.write(out)), factor };
  } catch {
    // some images aren't strict png; tesseract can still eat them
    return { buf: png, factor: 1 };
  }
}

export function fold(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Sliding window over OCR words so "AI Creations" can sit on two boxes. */
export function findPhrase(page: OcrPage, phrase: string): BBox | null {
  const needle = phrase.trim().split(/\s+/).filter(Boolean);
  if (needle.length === 0) return null;

  const foldedHay = fold(page.text);
  if (!foldedHay.includes(fold(phrase))) {
    // tesseract sometimes eats spaces but the words array still has them
    const joinedWords = fold(page.words.map((w) => w.text).join(""));
    if (!joinedWords.includes(fold(phrase))) return null;
  }

  for (let i = 0; i < page.words.length; i++) {
    const chunk: OcrWord[] = [];
    let built = "";
    for (let j = i; j < page.words.length && chunk.length < needle.length + 3; j++) {
      chunk.push(page.words[j]);
      built = chunk.map((w) => w.text).join(" ");
      if (fold(built) === fold(phrase) || fold(built).includes(fold(phrase))) {
        return mergeBoxes(chunk.map((w) => w.bbox));
      }
    }
  }

  const first = fold(needle[0]);
  const loose = page.words.find((w) => fold(w.text).includes(first));
  return loose ? loose.bbox : null;
}

function mergeBoxes(boxes: BBox[]): BBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.width));
  const b = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: r - x, height: b - y };
}
