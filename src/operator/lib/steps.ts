import type { LucideIcon } from "lucide-react";
import { Camera, Eye, EyeOff, Flag, Hourglass, Keyboard, LogIn, MousePointerClick, ScanSearch, Type } from "lucide-react";
import type { ManifestStep } from "./types";

/** A run step said as a sentence: verb, what it acted on, and a plain note about how it went. */
export type StepWords = { verb: string; target?: string; note?: string; icon: LucideIcon };

const VIA: Record<string, string> = {
  a11y: "the accessibility tree",
  ocr: "reading the screen",
  vision: "Gemini vision",
  pinned: "its pinned position",
};

function via(detail?: string): string | undefined {
  const m = detail?.match(/via (\w+)/);
  return m ? (VIA[m[1]] ?? m[1]) : undefined;
}

function tapNote(detail?: string): string | undefined {
  if (!detail) return undefined;
  const m = detail.match(/^(\d+),(\d+) via (\w+)/);
  if (m) return `Found with ${VIA[m[3]] ?? m[3]}, clicked at ${m[1]}, ${m[2]}`;
  const how = via(detail);
  return how ? `Found with ${how}` : detail;
}

export function describeStep(step: ManifestStep): StepWords {
  const d = step.detail;
  switch (step.kind) {
    case "tap":
      return { verb: "Tap", target: step.name, note: tapNote(d), icon: MousePointerClick };
    case "tap-fail":
      return {
        verb: d === "text not found" ? "Tap text" : "Tap",
        target: step.name,
        note: d === "text not found" ? "This text is not on the screen" : d,
        icon: MousePointerClick,
      };
    case "see":
    case "see-fail": {
      const negative = step.name.startsWith("not ");
      const target = negative ? step.name.slice(4) : step.name;
      const found = d?.match(/^found "(.*)" via (\w+)$/);
      const note = found
        ? `Found “${found[1]}” with ${VIA[found[2]] ?? found[2]}`
        : d === "not found"
          ? "Not on the screen"
          : d === "not visible"
            ? "Not on the screen, as expected"
            : d?.startsWith("still visible")
              ? `Still on the screen (${via(d) ?? "seen"})`
              : d;
      return { verb: negative ? "Do not see" : "See", target, note, icon: negative ? EyeOff : Eye };
    }
    case "type":
      return { verb: "Type into", target: step.name, note: d ? `“${d}”` : undefined, icon: Type };
    case "press":
      return { verb: "Press", target: step.name, icon: Keyboard };
    case "wait-reply": {
      const ms = Number(d?.replace(/ms$/, ""));
      return { verb: "Reply arrived", note: Number.isFinite(ms) ? `after ${(ms / 1000).toFixed(1)}s` : d, icon: Hourglass };
    }
    case "wait-reply-fail":
      return { verb: "No reply", note: d, icon: Hourglass };
    case "checkpoint":
      return { verb: "Checkpoint", target: step.name, icon: Camera };
    case "end":
      return { verb: step.ok ? "Run passed" : "Run failed", note: d, icon: Flag };
    case "login":
      return { verb: "Login", target: step.name, note: d, icon: LogIn };
    case "scan":
      return { verb: "Scan", target: step.name, note: d, icon: ScanSearch };
    default:
      return { verb: step.kind, target: step.name, note: d, icon: MousePointerClick };
  }
}

/** Seconds since the run started, for the timeline gutter. */
export function offsetOf(startedAt: string | undefined, at: string | undefined): string | null {
  if (!startedAt || !at) return null;
  const s = Math.round((new Date(at).getTime() - new Date(startedAt).getTime()) / 1000);
  if (!Number.isFinite(s) || s < 0) return null;
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
