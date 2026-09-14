import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { cropBox, cropMarked } from "../src/framework/draw-box.ts";

function paint(w: number, h: number, fill: [number, number, number], dot?: { x: number; y: number }): Buffer {
  const img = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      const on = dot && x === dot.x && y === dot.y;
      img.data[i] = on ? 0 : fill[0];
      img.data[i + 1] = on ? 255 : fill[1];
      img.data[i + 2] = on ? 0 : fill[2];
      img.data[i + 3] = 255;
    }
  }
  return Buffer.from(PNG.sync.write(img));
}

function pixel(buf: Buffer, x: number, y: number) {
  const img = PNG.sync.read(buf);
  const i = (img.width * y + x) << 2;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

test("cropBox keeps the green pixel in the cut", () => {
  const src = paint(20, 20, [10, 10, 10], { x: 8, y: 9 });
  const cut = cropBox(src, { x: 6, y: 7, width: 4, height: 4 }, 0);
  expect(cut.origin).toEqual({ x: 6, y: 7 });
  expect(pixel(cut.png, 2, 2)).toEqual([0, 255, 0]);
});

test("cropMarked is bigger than the raw box because of pad", () => {
  const src = paint(200, 200, [30, 30, 30]);
  const marked = cropMarked(src, { x: 80, y: 80, width: 20, height: 20 }, 40);
  const img = PNG.sync.read(marked);
  expect(img.width).toBe(100);
  expect(img.height).toBe(100);
});
