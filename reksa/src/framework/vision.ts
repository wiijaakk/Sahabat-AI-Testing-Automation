import { GoogleGenerativeAI } from "@google/generative-ai";
import type { BBox } from "./types.ts";

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
