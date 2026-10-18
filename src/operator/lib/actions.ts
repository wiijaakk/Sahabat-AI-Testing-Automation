import type { LucideIcon } from "lucide-react";
import {
  Camera,
  CircleX,
  Eye,
  EyeOff,
  Home,
  Hourglass,
  Keyboard,
  MousePointerClick,
  RefreshCw,
  Replace,
  TextCursorInput,
  Type,
  Upload,
} from "lucide-react";
import type { CaseStep } from "./types";

export const ACTIONS = [
  "gotoDashboard",
  "tap",
  "tapText",
  "see",
  "seeText",
  "seeAny",
  "notSeeText",
  "dismiss",
  "checkpoint",
  "type",
  "replace",
  "upload",
  "press",
  "waitReply",
  "reload",
] as const;

export type Action = (typeof ACTIONS)[number];

/** Families colour the step tile so a case reads as a rhythm of navigate / act / check / input at a glance. */
export type ActionFamily = "navigate" | "act" | "assert" | "input" | "capture" | "wait";

export const ACTION_META: Record<Action, { label: string; verb: string; hint: string; family: ActionFamily; icon: LucideIcon }> = {
  gotoDashboard: {
    label: "Open dashboard",
    verb: "Open",
    hint: "Opens chat.sahabat-ai.com in the headed Chrome profile.",
    family: "navigate",
    icon: Home,
  },
  tap: { label: "Tap", verb: "Tap", hint: "Clicks a named control from the catalog.", family: "act", icon: MousePointerClick },
  tapText: {
    label: "Tap text",
    verb: "Tap text",
    hint: "Finds this text on screen with OCR and clicks it.",
    family: "act",
    icon: MousePointerClick,
  },
  see: { label: "See", verb: "See", hint: "Asserts a catalog control is visible.", family: "assert", icon: Eye },
  seeText: { label: "See text", verb: "See text", hint: "Asserts this text is on screen.", family: "assert", icon: Eye },
  seeAny: {
    label: "See any",
    verb: "See any of",
    hint: "Passes if any option separated by | is on screen.",
    family: "assert",
    icon: Eye,
  },
  notSeeText: {
    label: "Not see text",
    verb: "Do not see",
    hint: "Asserts this text is not on screen.",
    family: "assert",
    icon: EyeOff,
  },
  dismiss: {
    label: "Dismiss if present",
    verb: "Dismiss",
    hint: "Closes this if it is showing, then continues.",
    family: "act",
    icon: CircleX,
  },
  checkpoint: {
    label: "Checkpoint",
    verb: "Checkpoint",
    hint: "Saves a named screenshot for the gallery.",
    family: "capture",
    icon: Camera,
  },
  type: { label: "Type", verb: "Type into", hint: "Types into a catalog text field.", family: "input", icon: Type },
  replace: {
    label: "Replace text",
    verb: "Replace in",
    hint: "Selects everything in a field and types over it.",
    family: "input",
    icon: Replace,
  },
  upload: {
    label: "Upload files",
    verb: "Upload via",
    hint: "Opens a catalog upload control and selects the listed files.",
    family: "input",
    icon: Upload,
  },
  press: { label: "Press key", verb: "Press", hint: "Sends a key. Enter usually sends the prompt.", family: "act", icon: Keyboard },
  waitReply: {
    label: "Wait for reply",
    verb: "Wait for reply",
    hint: "Waits up to 5 minutes for the chat to answer.",
    family: "wait",
    icon: Hourglass,
  },
  reload: {
    label: "Reload page",
    verb: "Reload",
    hint: "Reloads the current page and waits for Flutter to paint.",
    family: "navigate",
    icon: RefreshCw,
  },
};

export const FAMILY_STYLE: Record<ActionFamily, { tile: string; label: string }> = {
  navigate: { tile: "bg-soft text-muted", label: "Navigate" },
  act: { tile: "bg-brand-soft text-brand-ink", label: "Act" },
  assert: { tile: "bg-ok-soft text-ok", label: "Check" },
  input: { tile: "bg-input-soft text-input", label: "Input" },
  capture: { tile: "bg-warn-soft text-warn", label: "Capture" },
  wait: { tile: "bg-soft text-muted", label: "Wait" },
};

export const FIELD_ICON = TextCursorInput;

export function metaOf(action: string) {
  return (
    ACTION_META[action as Action] ?? {
      label: action,
      verb: action,
      hint: "",
      family: "act" as ActionFamily,
      icon: MousePointerClick,
    }
  );
}

export function needsControl(action: string) {
  return ["tap", "see", "dismiss", "type", "replace", "upload"].includes(action);
}

export function needsText(action: string) {
  return ["tapText", "seeText", "seeAny", "notSeeText", "type", "replace", "upload"].includes(action);
}

export function stepForAction(action: string, prev: CaseStep, names: string[]): CaseStep {
  if (action === "type" || action === "replace" || action === "upload") {
    return { action, target: prev.target && names.includes(prev.target) ? prev.target : names[0], text: prev.text ?? "" };
  }
  if (["tapText", "seeText", "seeAny", "notSeeText"].includes(action)) {
    return { action, text: prev.text ?? "" };
  }
  if (action === "press") return { action, key: prev.key ?? "Enter" };
  if (action === "checkpoint") return { action, target: prev.target ?? "" };
  if (needsControl(action)) {
    return { action, target: prev.target && names.includes(prev.target) ? prev.target : names[0] };
  }
  return { action };
}

export const TEMPLATE_HINT = "{{runTag}} becomes a unique 6-digit stamp per run, {{runAlpha}} the same in letters.";

/** Which case a run folder belongs to: run ids end with the case id. */
export function caseIdOfRun(runId: string, caseIds: string[]): string | undefined {
  const tail = runId.replace(/^\d{8}-\d{6}-/, "");
  return caseIds.find((id) => id === tail);
}

export function runWhen(id: string, startedAt?: string): string {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[4]}:${m[5]}`;
  }
  if (startedAt) {
    const d = new Date(startedAt);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  return id;
}

export function durationOf(startedAt?: string, finishedAt?: string): string | null {
  if (!startedAt || !finishedAt) return null;
  const s = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  if (Number.isNaN(s)) return null;
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
