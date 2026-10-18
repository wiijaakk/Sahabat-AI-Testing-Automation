export type View = "catalog" | "cases" | "runs";

export type BBox = { x: number; y: number; width: number; height: number };

export type VocabEntry = {
  name: string;
  text: string[];
  expectPath?: string;
  role?: string;
  unnamed?: boolean;
  hint?: string;
  bbox?: BBox;
  /** Scan plan screen ids this control was seen or pinned on. */
  screens?: string[];
  source?: "scan";
};

export type HarvestNode = {
  id: string;
  role: string | null;
  name: string;
  unnamed: boolean;
  bbox: BBox;
  hint?: string;
  crop?: string;
};

export type HarvestScreen = {
  id: string;
  title: string;
  page?: string;
  state?: string;
  status: "ok" | "skipped";
  reason?: string;
  needs?: string;
  url?: string;
  screen?: string;
  overview?: string;
  nodes: HarvestNode[];
};

export type Harvest = {
  at: string;
  viewport?: { width: number; height: number };
  screens: HarvestScreen[];
};

export type ScanScreenDef = { id: string; page: string; state?: string; title: string; needs?: string; steps: CaseStep[] };
export type ScanPlan = { fixtures: Record<string, string>; screens: ScanScreenDef[] };

export type CaseStep = {
  action: string;
  target?: string;
  text?: string;
  key?: string;
};

export type TestCase = { id: string; title: string; steps: CaseStep[] };

export type ManifestStep = { kind: string; name: string; ok: boolean; file: string; detail?: string; box?: BBox; at?: string };

export type Manifest = {
  id: string;
  test: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  steps: ManifestStep[];
};

export type RunListItem = { id: string; dir: string; name: string; when?: string; manifest: Manifest | null };

export type CurrentJob = { id: string; kind: string; status: string; log: string; caseId?: string };

export type Status = {
  profile: boolean;
  vision?: boolean;
  current: CurrentJob | null;
  lastRuns: RunListItem[];
};

export type RunDetail = {
  job: { log: string; status: string } | null;
  manifest: Manifest | null;
  shots: string[];
};

/** Where a catalog control was last seen, from a run screenshot or the last scan. */
export type ControlPreview = {
  src: string;
  width: number;
  height: number;
  box?: BBox;
  point?: { x: number; y: number };
  from: "run" | "scan";
  runId?: string;
  at?: string;
  screen?: string;
};
