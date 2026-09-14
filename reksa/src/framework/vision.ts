import { GoogleGenerativeAI } from "@google/generative-ai";
import type { BBox, ControlHint } from "./types.ts";

export type VisionHit = {
  name: string;
  bbox: BBox;
};

function getClient(): GoogleGenerativeAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}

/** Ask Gemini for boxes in CSS pixels. Only used when OCR misses. */
export async function locateWithGemini(
  png: Buffer,
  names: string[],
  width: number,
  height: number,
): Promise<VisionHit[]> {
  const client = getClient();
  if (!client) {
    throw new Error("OCR missed and GEMINI_API_KEY is empty. Set it in reksa/.env");
  }
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });
  const prompt = `You are locating UI controls on a Flutter web app screenshot.
Return JSON only: {"hits":[{"name":string,"x":number,"y":number,"width":number,"height":number}]}
Coordinates are CSS pixels. Image size is ${width}x${height}.
Only find these names if they are actually visible: ${JSON.stringify(names)}
x,y is the top-left of the clickable box.`;

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: "image/png",
        data: png.toString("base64"),
      },
    },
  ]);
  const raw = result.response.text().trim();
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) return [];
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
    hits?: { name: string; x: number; y: number; width: number; height: number }[];
  };
  return (parsed.hits ?? []).map((h) => ({
    name: h.name,
    bbox: { x: h.x, y: h.y, width: h.width, height: h.height },
  }));
}

export type UnnamedGuess = {
  id: string;
  name: string;
  hint?: ControlHint;
  description?: string;
};

const HINTS: ControlHint[] = ["header", "sidebar", "banner", "composer", "footer"];

export function parseGuesses(raw: string): UnnamedGuess[] {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) return [];
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
    guesses?: { id?: string; name?: string; hint?: string; description?: string }[];
  };
  return (parsed.guesses ?? [])
    .filter((g) => g.id && g.name)
    .map((g) => ({
      id: String(g.id),
      name: String(g.name).trim(),
      hint: HINTS.includes(g.hint as ControlHint) ? (g.hint as ControlHint) : undefined,
      description: g.description ? String(g.description).trim() : undefined,
    }));
}

/** Name unlabeled icons from crops. The human still has to pin them. */
export async function guessUnnamedIcons(
  items: { id: string; png: Buffer; hint?: ControlHint; role?: string | null }[],
): Promise<UnnamedGuess[]> {
  if (items.length === 0) return [];
  const client = getClient();
  if (!client) {
    throw new Error("GEMINI_API_KEY is empty. Set it in reksa/.env");
  }
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text: `You are naming unlabeled Flutter web UI controls on chat.sahabat-ai.com.
Each image is a crop. The magenta box is the clickable control.
Return JSON only: {"guesses":[{"id":string,"name":string,"hint":"header"|"sidebar"|"banner"|"composer"|"footer"|null,"description":string}]}
name is a short catalog id the test will tap: send, mic, attach, collapse-sidebar, close.
Keep names lowercase with hyphens. Do not invent a control that is not in the box.`,
    },
  ];
  for (const item of items) {
    parts.push({
      text: `id=${item.id} role=${item.role ?? "button"} regionGuess=${item.hint ?? "unknown"}`,
    });
    parts.push({
      inlineData: { mimeType: "image/png", data: item.png.toString("base64") },
    });
  }
  const result = await model.generateContent(parts);
  return parseGuesses(result.response.text().trim());
}
