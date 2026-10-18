export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IndexedHit = {
  name: string;
  bbox: BBox;
  via: "a11y" | "ocr" | "vision" | "pinned";
  text?: string;
};

export type ControlRole = "button" | "textbox" | "group";
export type ControlHint = "header" | "sidebar" | "banner" | "composer" | "footer";

export type VocabEntry = {
  name: string;
  /** Aliases. a11y matches these to the node name. OCR uses them when the node has no name. */
  text: string[];
  /** Path snippet to wait for after tap, e.g. mylibrary. Flutter often skips a real load event. */
  expectPath?: string;
  role?: ControlRole;
  /** Icon with no accessible name. Scan will not match it by label. */
  unnamed?: boolean;
  /** Breaks ties when two Logins are on screen. */
  hint?: ControlHint;
  /** Last scan box. Lets us re-find unnamed icons without calling vision every tap. */
  bbox?: BBox;
  /** Scan plan screen ids where this control was seen or pinned, e.g. ["library", "library-your-uploads"]. */
  screens?: string[];
  /** "scan" when a scan added it from a labeled control; absent when a human added it. */
  source?: "scan";
};

export type HarvestNode = {
  id: string;
  role: string | null;
  name: string;
  unnamed: boolean;
  bbox: BBox;
  /** Region guess from the box. Only on the harvest dump, not live tree. */
  hint?: ControlHint;
  /** Crop file under artifacts/harvest/, unnamed controls only. */
  crop?: string;
};

/** One screen from the scan plan, harvested or skipped. Files are relative to artifacts/harvest/. */
export type HarvestScreen = {
  id: string;
  title: string;
  /** Page and state from the scan plan, so the UI can group states under one page tab. */
  page?: string;
  state?: string;
  status: "ok" | "skipped";
  /** Why the scan could not reach this screen (a tap that missed, usually a missing fixture). */
  reason?: string;
  /** Account state the screen needs, copied from the plan so the UI can say what to set up. */
  needs?: string;
  url?: string;
  screen?: string;
  overview?: string;
  nodes: HarvestNode[];
};

export type HarvestDump = {
  at: string;
  viewport: { width: number; height: number };
  screens: HarvestScreen[];
};

export type CaseAction =
  | "gotoDashboard"
  | "tap"
  | "tapText"
  | "see"
  | "seeText"
  | "seeAny"
  | "notSeeText"
  | "dismiss"
  | "checkpoint"
  | "type"
  | "replace"
  | "upload"
  | "press"
  | "waitReply"
  | "reload";

export type CaseStep = {
  action: CaseAction;
  target?: string;
  text?: string;
  key?: string;
};

export type TestCase = {
  id: string;
  title: string;
  steps: CaseStep[];
};

export type EvidenceKind =
  | "see"
  | "see-fail"
  | "tap"
  | "tap-fail"
  | "type"
  | "press"
  | "wait-reply"
  | "wait-reply-fail"
  | "end"
  | "checkpoint"
  | "login"
  | "scan";

export type EvidenceStep = {
  kind: EvidenceKind;
  name: string;
  ok: boolean;
  file: string;
  detail?: string;
  /** Where the control was found on this screenshot, in screenshot px. Lets the UI crop a preview. */
  box?: BBox;
  at: string;
};

export type RunManifest = {
  id: string;
  test: string;
  status: "running" | "passed" | "failed";
  startedAt: string;
  finishedAt?: string;
  error?: string;
  steps: EvidenceStep[];
};
