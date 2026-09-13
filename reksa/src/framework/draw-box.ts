import { PNG } from "pngjs";
import type { BBox } from "./types.ts";

function parse(png: Buffer): PNG {
  return PNG.sync.read(png);
}

function put(png: PNG, x: number, y: number, r: number, g: number, b: number, a: number) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function hline(png: PNG, x0: number, x1: number, y: number, color: [number, number, number]) {
  const xStart = Math.max(0, Math.min(x0, x1));
  const xEnd = Math.min(png.width - 1, Math.max(x0, x1));
  for (let x = xStart; x <= xEnd; x++) {
    for (let t = -2; t <= 2; t++) put(png, x, y + t, color[0], color[1], color[2], 255);
  }
}

function vline(png: PNG, y0: number, y1: number, x: number, color: [number, number, number]) {
  const yStart = Math.max(0, Math.min(y0, y1));
  const yEnd = Math.min(png.height - 1, Math.max(y0, y1));
  for (let y = yStart; y <= yEnd; y++) {
    for (let t = -2; t <= 2; t++) put(png, x + t, y, color[0], color[1], color[2], 255);
  }
}

/** Draw a fat magenta box so the gallery is actually readable. */
export function drawBox(png: Buffer, box: BBox, ok: boolean): Buffer {
  const img = parse(png);
  const color: [number, number, number] = ok ? [226, 0, 116] : [180, 32, 32];
  const x0 = Math.round(box.x);
  const y0 = Math.round(box.y);
  const x1 = Math.round(box.x + box.width);
  const y1 = Math.round(box.y + box.height);
  hline(img, x0, x1, y0, color);
  hline(img, x0, x1, y1, color);
  vline(img, y0, y1, x0, color);
  vline(img, y0, y1, x1, color);
  return Buffer.from(PNG.sync.write(img));
}
