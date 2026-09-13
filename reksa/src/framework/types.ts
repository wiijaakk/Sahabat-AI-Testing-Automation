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
  /** If set, tap() waits for this URL glob after clicking. */
  expectUrl?: string;
};

export type EvidenceKind = "see" | "see-fail" | "tap-fail" | "end" | "checkpoint" | "login";

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
