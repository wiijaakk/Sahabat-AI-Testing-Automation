export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IndexedHit = {
  name: string;
  bbox: BBox;
  via: "ocr" | "vision";
  text?: string;
};

export type VocabEntry = {
  name: string;
  /** Strings we try to read off the screenshot. */
  text: string[];
  /** Path snippet to wait for after tap, e.g. mylibrary. Flutter often skips a real load event. */
  expectPath?: string;
};

export type EvidenceKind = "see" | "see-fail" | "tap" | "tap-fail" | "end" | "checkpoint" | "login";

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
