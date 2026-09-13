import type { VocabEntry } from "../src/framework/types";

/** Names we own. The scanner only looks for these, never Flutter's rotating ids. */
export const vocab: VocabEntry[] = [
  { name: "Library", text: ["Library"], expectUrl: "**/mylibrary**" },
  { name: "AI Creations", text: ["AI Creations", "Al Creations"] },
  { name: "Your Uploads", text: ["Your Uploads"] },
  { name: "New Chat", text: ["New Chat"] },
  { name: "AIStorage", text: ["AIStorage", "AiStorage", "AI Storage"] },
  { name: "Help Center", text: ["Help Center"] },
  { name: "Search chats", text: ["Search chats"] },
  { name: "Go Pro", text: ["Go Pro"] },
  { name: "Create New", text: ["Create New"] },
];

export function vocabByName(name: string): VocabEntry {
  const hit = vocab.find((v) => v.name.toLowerCase() === name.toLowerCase());
  if (!hit) {
    throw new Error(`"${name}" is not in the vocabulary. Add it in vocab/screens.ts`);
  }
  return hit;
}
