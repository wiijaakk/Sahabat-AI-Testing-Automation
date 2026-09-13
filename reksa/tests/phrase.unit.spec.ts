import { test, expect } from "@playwright/test";
import { findPhrase, type OcrPage } from "../src/framework/ocr.ts";

function page(words: { text: string; x: number; y: number }[]): OcrPage {
  return {
    text: words.map((w) => w.text).join(" "),
    words: words.map((w) => ({
      text: w.text,
      confidence: 90,
      bbox: { x: w.x, y: w.y, width: 70, height: 18 },
    })),
  };
}

test("Library box is the sidebar row, not the whole menu", () => {
  const ocr = page([
    { text: "New", x: 20, y: 80 },
    { text: "Chat", x: 70, y: 80 },
    { text: "Library", x: 20, y: 130 },
    { text: "Help", x: 20, y: 180 },
    { text: "Center", x: 70, y: 180 },
  ]);
  const box = findPhrase(ocr, "Library");
  expect(box?.y).toBe(130);
  expect(box?.height).toBe(18);
});

test("AI Creations stays two words", () => {
  const ocr = page([
    { text: "AI", x: 200, y: 40 },
    { text: "Creations", x: 230, y: 40 },
    { text: "Your", x: 400, y: 40 },
    { text: "Uploads", x: 450, y: 40 },
  ]);
  const box = findPhrase(ocr, "AI Creations");
  expect(box?.x).toBe(200);
  expect(box?.width).toBe(100);
});
