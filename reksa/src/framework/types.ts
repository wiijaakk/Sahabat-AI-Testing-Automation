export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IndexedHit = {
  name: string;
  bbox: BBox;
  via: "a11y" | "ocr" | "vision";
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

export type HarvestDump = {
  at: string;
  url: string;
  viewport: { width: number; height: number };
  screen?: string;
  overview?: string;
  nodes: HarvestNode[];
};

export type CaseAction =
  | "gotoDashboard"
  | "tap"
  | "see"
  | "dismiss"
  | "checkpoint"
  | "type"
  | "press"
  | "waitReply";

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
