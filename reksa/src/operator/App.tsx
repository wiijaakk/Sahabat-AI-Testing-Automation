import { useEffect, useMemo, useState } from "react";

type View = "catalog" | "cases" | "runs";

type BBox = { x: number; y: number; width: number; height: number };

type VocabEntry = {
  name: string;
  text: string[];
  expectPath?: string;
  role?: string;
  unnamed?: boolean;
  hint?: string;
  bbox?: BBox;
};

type HarvestNode = {
  id: string;
  role: string | null;
  name: string;
  unnamed: boolean;
  bbox: BBox;
  hint?: string;
  crop?: string;
};

type Harvest = {
  at: string;
  url: string;
  viewport?: { width: number; height: number };
  screen?: string;
  overview?: string;
  nodes: HarvestNode[];
};

type CaseStep = {
  action: string;
  target?: string;
  text?: string;
  key?: string;
};

type TestCase = { id: string; title: string; steps: CaseStep[] };

type Manifest = {
  id: string;
  test: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  steps: { kind: string; name: string; ok: boolean; file: string; detail?: string }[];
};

type RunListItem = { id: string; dir: string; name: string; when?: string; manifest: Manifest | null };

type Status = {
  profile: boolean;
  vision?: boolean;
  current: { id: string; kind: string; status: string; log: string; caseId?: string } | null;
  lastRuns: RunListItem[];
};

type RunDetail = {
  job: { log: string; status: string } | null;
  manifest: Manifest | null;
  shots: string[];
};

const ACTIONS = ["gotoDashboard", "tap", "see", "dismiss", "checkpoint", "type", "press", "waitReply"] as const;

const ACTION_META: Record<(typeof ACTIONS)[number], { label: string; hint: string }> = {
  gotoDashboard: { label: "Open dashboard", hint: "Opens chat.sahabat-ai.com in the headed Chrome profile." },
  tap: { label: "Tap", hint: "Clicks a named control from the catalog." },
  see: { label: "See", hint: "Fails the case if this control is not on screen." },
  dismiss: { label: "Dismiss if present", hint: "Closes this if it is showing, then continues." },
  checkpoint: { label: "Checkpoint", hint: "Saves a screenshot with this label." },
  type: { label: "Type", hint: "Types into a catalog field." },
  press: { label: "Press key", hint: "Sends a key. Enter usually sends the prompt." },
  waitReply: { label: "Wait for reply", hint: "Waits up to 60s for the chat to answer." },
};

function needsControl(action: string) {
  return action === "tap" || action === "see" || action === "dismiss" || action === "type";
}

function stepForAction(action: string, prev: CaseStep, names: string[]): CaseStep {
  if (action === "type") {
    return { action, target: prev.target && names.includes(prev.target) ? prev.target : names[0], text: prev.text ?? "" };
  }
  if (action === "press") return { action, key: prev.key ?? "Enter" };
  if (action === "checkpoint") return { action, target: prev.target ?? "" };
  if (needsControl(action)) {
    return { action, target: prev.target && names.includes(prev.target) ? prev.target : names[0] };
  }
  return { action };
}

function ControlSelect(props: { names: string[]; value?: string; onChange: (v: string) => void }) {
  const options =
    props.value && !props.names.includes(props.value) ? [props.value, ...props.names] : props.names;
  return (
    <select value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)}>
      <option value="" disabled={options.length > 0}>
        {options.length ? "Pick a control" : "No catalog names yet"}
      </option>
      {options.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export function App() {
  const [view, setView] = useState<View>("cases");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);

  async function refresh() {
    const data = await json<Status>("/api/status");
    setStatus(data);
    // don't yank the user back to the newest run every poll
    setSelected((prev) => prev ?? data.lastRuns[0]?.id ?? null);
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selected) return;
    fetch(`/api/runs/${selected}`)
      .then((r) => r.json())
      .then(setDetail)
      .catch((err) => setError(String(err)));
  }, [selected, status?.current?.status, status?.lastRuns.length]);

  async function post(path: string, kind: string) {
    setError(null);
    setBusy(kind);
    try {
      const data = await json<{ id: string }>(path, { method: "POST" });
      setSelected(data.id);
      setView("runs");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const running = status?.current?.status === "running";

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <h1>Sahabat sanity</h1>
          <p>reksa / operator</p>
        </div>
        <nav className="nav">
          <button className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>
            Catalog
          </button>
          <button className={view === "cases" ? "active" : ""} onClick={() => setView("cases")}>
            Cases
          </button>
          <button className={view === "runs" ? "active" : ""} onClick={() => setView("runs")}>
            Runs
          </button>
        </nav>
        <div className="side-actions">
          <button disabled={running || busy !== null} onClick={() => post("/api/login", "login")}>
            {busy === "login" ? "Opening Chrome…" : "Save login"}
          </button>
          <button
            className="secondary"
            disabled={running || busy !== null}
            onClick={() => post("/api/run", "smoke")}
          >
            {busy === "smoke" ? "Starting…" : "Run library smoke"}
          </button>
        </div>
        <div className="side-meta">
          <div>
            Chrome profile:{" "}
            <b className={status?.profile ? "ok" : "bad"}>{status?.profile ? "found" : "missing"}</b>
          </div>
          <div>
            Current: <b>{status?.current ? `${status.current.kind} · ${status.current.status}` : "idle"}</b>
          </div>
          {error ? <div className="bad">{error}</div> : null}
        </div>
      </aside>

      <main className="main">
        {view === "catalog" ? (
          <CatalogView
            running={running}
            busy={busy}
            vision={Boolean(status?.vision)}
            onScan={() => post("/api/scan", "scan")}
            onError={setError}
          />
        ) : null}
        {view === "cases" ? (
          <CasesView
            running={running}
            busy={busy}
            onRun={(id) => post(`/api/run-case/${id}`, "case")}
            onError={setError}
          />
        ) : null}
        {view === "runs" ? (
          <RunsView
            runs={status?.lastRuns ?? []}
            selected={selected}
            onSelect={setSelected}
            detail={detail}
          />
        ) : null}
      </main>
    </div>
  );
}

const HINTS = ["header", "sidebar", "banner", "composer", "footer"];

function harvestSrc(harvest: Harvest, file?: string): string | null {
  if (!file) return null;
  if (file.startsWith("/")) return `${file}?t=${encodeURIComponent(harvest.at)}`;
  return `/artifacts/harvest/${file}?t=${encodeURIComponent(harvest.at)}`;
}

function boxCenterDist(a: BBox, b: BBox): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function labeledAs(node: HarvestNode, entries: VocabEntry[]): VocabEntry | undefined {
  return entries.find((e) => e.unnamed && e.bbox && boxCenterDist(e.bbox, node.bbox) < 40);
}

function UnnamedPanel(props: {
  harvest: Harvest;
  entries: VocabEntry[];
  vision: boolean;
  onPin: (node: HarvestNode, name: string, hint?: string) => void;
  onError: (s: string) => void;
}) {
  const unnamed = props.harvest.nodes.filter((n) => n.unnamed && n.role === "button");
  const [selected, setSelected] = useState<string | null>(unnamed[0]?.id ?? null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hintDraft, setHintDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const n of unnamed) if (n.hint) init[n.id] = n.hint;
    return init;
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [guessing, setGuessing] = useState<string | null>(null);

  const vw = props.harvest.viewport?.width ?? 1440;
  const vh = props.harvest.viewport?.height ?? 900;
  const screen = harvestSrc(props.harvest, props.harvest.screen);
  const hasCrops = unnamed.some((n) => n.crop);

  async function guess(nodeId?: string) {
    setGuessing(nodeId ?? "all");
    try {
      const data = await json<{ guesses: { id: string; name: string; hint?: string; description?: string }[] }>(
        "/api/vision/guess-unnamed",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nodeId ? { nodeId } : {}),
        },
      );
      setDraft((prev) => {
        const next = { ...prev };
        for (const g of data.guesses) next[g.id] = g.name;
        return next;
      });
      setHintDraft((prev) => {
        const next = { ...prev };
        for (const g of data.guesses) if (g.hint) next[g.id] = g.hint;
        return next;
      });
      setNotes((prev) => {
        const next = { ...prev };
        for (const g of data.guesses) if (g.description) next[g.id] = g.description;
        return next;
      });
    } catch (err) {
      props.onError(String(err));
    } finally {
      setGuessing(null);
    }
  }

  if (unnamed.length === 0) return null;

  return (
    <section className="card unnamed-panel">
      <div className="row" style={{ marginBottom: 10, justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Unnamed icons</h3>
        <span className="row">
          <button
            className="btn secondary"
            disabled={!props.vision || guessing !== null || !hasCrops}
            onClick={() => guess()}
          >
            {guessing === "all" ? "Looking…" : "Ask Gemini"}
          </button>
        </span>
      </div>
      <p className="tiny" style={{ marginTop: 0 }}>
        {hasCrops
          ? "Click a box on the shot, name it, pin it. Gemini can guess from the crop if a key is set."
          : "Scan again to get a screenshot of each unnamed control."}
        {!props.vision ? " GEMINI_API_KEY is empty, so guesses are off." : ""}
      </p>
      {screen ? (
        <div className="overlay-shot">
          <img src={screen} alt="current screen" />
          {unnamed.map((n, i) => (
            <button
              key={n.id}
              type="button"
              className={n.id === selected ? "hotspot active" : "hotspot"}
              style={{
                left: `${(n.bbox.x / vw) * 100}%`,
                top: `${(n.bbox.y / vh) * 100}%`,
                width: `${(n.bbox.width / vw) * 100}%`,
                height: `${(n.bbox.height / vh) * 100}%`,
              }}
              onClick={() => setSelected(n.id)}
              title={`#${i + 1}`}
            >
              <b>{i + 1}</b>
            </button>
          ))}
        </div>
      ) : null}
      <div className="unnamed-grid">
        {unnamed.map((n, i) => {
          const crop = harvestSrc(props.harvest, n.crop);
          const saved = labeledAs(n, props.entries);
          const focused = n.id === selected;
          return (
            <article
              key={n.id}
              className={focused ? "unnamed-card active" : "unnamed-card"}
              onClick={() => setSelected(n.id)}
            >
              {crop ? <img src={crop} alt={`unnamed ${i + 1}`} /> : <div className="crop-missing">no crop</div>}
              <div className="unnamed-meta">
                <div>
                  #{i + 1} {n.role ?? "?"} · {n.hint ?? "?"} · {Math.round(n.bbox.x)},{Math.round(n.bbox.y)}
                </div>
                {notes[n.id] ? <div className="tiny">{notes[n.id]}</div> : null}
                {saved ? (
                  <div className="tiny ok">Saved as {saved.name}</div>
                ) : (
                  <>
                    <input
                      placeholder="name it"
                      value={draft[n.id] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [n.id]: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <select
                      value={hintDraft[n.id] ?? ""}
                      onChange={(e) => setHintDraft({ ...hintDraft, [n.id]: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">hint</option>
                      {HINTS.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <span className="row">
                      <button
                        className="ghost"
                        disabled={guessing !== null || !props.vision || !n.crop}
                        onClick={(e) => {
                          e.stopPropagation();
                          guess(n.id);
                        }}
                      >
                        {guessing === n.id ? "…" : "Guess"}
                      </button>
                      <button
                        className="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onPin(n, draft[n.id] ?? "", hintDraft[n.id] || n.hint);
                        }}
                      >
                        Pin
                      </button>
                    </span>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CatalogView(props: {
  running: boolean;
  busy: string | null;
  vision: boolean;
  onScan: () => void;
  onError: (s: string) => void;
}) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");

  async function load() {
    const cat = await json<{ entries: VocabEntry[] }>("/api/catalog");
    setEntries(cat.entries);
    const h = await json<{ harvest: Harvest | null }>("/api/harvest");
    setHarvest(h.harvest);
  }

  useEffect(() => {
    load().catch((err) => props.onError(String(err)));
    const t = setInterval(() => {
      load().catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [props.busy]);

  async function save(next: VocabEntry[]) {
    const data = await json<{ entries: VocabEntry[] }>("/api/catalog", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: next }),
    });
    setEntries(data.entries);
  }

  function pin(node: HarvestNode, name = node.name, hint = node.hint) {
    const n = name.trim();
    if (!n) return;
    const entry: VocabEntry = {
      name: n,
      text: node.name ? [node.name] : [n],
      role: node.role === "textbox" ? "textbox" : "button",
      unnamed: node.unnamed || !node.name,
      hint: hint || undefined,
      bbox: node.unnamed ? node.bbox : undefined,
    };
    const rest = entries.filter((e) => e.name.toLowerCase() !== n.toLowerCase());
    save([...rest, entry]).catch((err) => props.onError(String(err)));
  }

  function remove(name: string) {
    save(entries.filter((e) => e.name !== name)).catch((err) => props.onError(String(err)));
  }

  function addManual() {
    const name = newName.trim();
    if (!name) return;
    const text = newAliases
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    pin(
      {
        id: "manual",
        role: "button",
        name: text[0] ?? name,
        unnamed: false,
        bbox: { x: 0, y: 0, width: 0, height: 0 },
      },
      name,
    );
    setNewName("");
    setNewAliases("");
  }

  const savedNames = useMemo(() => new Set(entries.map((e) => e.name.toLowerCase())), [entries]);
  const named = (harvest?.nodes ?? []).filter((n) => !n.unnamed);

  return (
    <>
      <h2>Catalog</h2>
      <p className="lede">
        Named controls pin as-is. Unnamed icons need a screenshot first so you can tell send from mic.
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" disabled={props.running || props.busy !== null} onClick={props.onScan}>
          {props.busy === "scan" ? "Scanning…" : "Scan screen"}
        </button>
        <span className="tiny">
          {harvest ? `${harvest.nodes.length} controls · ${harvest.url}` : "No harvest yet"}
        </span>
      </div>
      {harvest ? (
        <UnnamedPanel
          key={harvest.at}
          harvest={harvest}
          entries={entries}
          vision={props.vision}
          onPin={(node, name, hint) => pin(node, name, hint)}
          onError={props.onError}
        />
      ) : null}
      <div className="split" style={{ marginTop: 16 }}>
        <section className="card">
          <h3>Named on this screen</h3>
          <ul className="list">
            {named.map((n) => {
              const already = savedNames.has(n.name.toLowerCase());
              return (
                <li key={n.id}>
                  <div>
                    <div>{n.name}</div>
                    <div className="tiny">
                      {n.role ?? "?"} · {n.hint ?? "?"} · {Math.round(n.bbox.x)},{Math.round(n.bbox.y)}
                    </div>
                  </div>
                  <button className="ghost" disabled={Boolean(already)} onClick={() => pin(n)}>
                    {already ? "Saved" : "Pin"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card">
          <h3>Saved</h3>
          <ul className="list">
            {entries.map((e) => (
              <li key={e.name}>
                <div>
                  <div>
                    {e.name} {e.unnamed ? <span className="badge">icon</span> : null}
                    {e.hint ? <span className="tiny"> · {e.hint}</span> : null}
                  </div>
                  <div className="tiny">{e.text.join(", ")}</div>
                </div>
                <button className="ghost danger" onClick={() => remove(e.name)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="form-grid">
            <input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input
              placeholder="Aliases, comma separated"
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
            />
            <button className="btn secondary" onClick={addManual}>
              Add predefined
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function CasesView(props: {
  running: boolean;
  busy: string | null;
  onRun: (id: string) => void;
  onError: (s: string) => void;
}) {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [catalog, setCatalog] = useState<VocabEntry[]>([]);
  const [current, setCurrent] = useState<TestCase | null>(null);
  const [newId, setNewId] = useState("");

  async function load() {
    const data = await json<{ cases: TestCase[] }>("/api/cases");
    setCases(data.cases);
    setCurrent((prev) => {
      if (prev) return data.cases.find((c) => c.id === prev.id) ?? data.cases[0] ?? null;
      return data.cases[0] ?? null;
    });
    const cat = await json<{ entries: VocabEntry[] }>("/api/catalog");
    setCatalog(cat.entries);
  }

  useEffect(() => {
    load().catch((err) => props.onError(String(err)));
  }, []);

  async function persist(next: TestCase) {
    const saved = await json<{ case: TestCase }>(`/api/cases/${next.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setCurrent(saved.case);
    setCases((all) => {
      const rest = all.filter((c) => c.id !== saved.case.id);
      return [...rest, saved.case].sort((a, b) => a.id.localeCompare(b.id));
    });
  }

  function patch(partial: Partial<TestCase>) {
    if (!current) return;
    setCurrent({ ...current, ...partial });
  }

  async function saveAndRun() {
    if (!current) return;
    await persist(current);
    props.onRun(current.id);
  }

  function setStep(i: number, step: CaseStep) {
    if (!current) return;
    const steps = current.steps.slice();
    steps[i] = step;
    patch({ steps });
  }

  function addStep() {
    if (!current) return;
    patch({ steps: [...current.steps, { action: "tap", target: catalog[0]?.name }] });
  }

  function removeStep(i: number) {
    if (!current) return;
    patch({ steps: current.steps.filter((_, idx) => idx !== i) });
  }

  function move(i: number, dir: -1 | 1) {
    if (!current) return;
    const j = i + dir;
    if (j < 0 || j >= current.steps.length) return;
    const steps = current.steps.slice();
    [steps[i], steps[j]] = [steps[j], steps[i]];
    patch({ steps });
  }

  async function createCase() {
    const id = newId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!id) return;
    const next: TestCase = { id, title: id, steps: [{ action: "gotoDashboard" }] };
    await persist(next);
    setNewId("");
  }

  const names = catalog.map((e) => e.name);

  return (
    <>
      <h2>Cases</h2>
      <p className="lede">Pick actions and catalog names. Run uses the headed Chrome profile.</p>
      <div className="split cases-split">
        <section className="card">
          <h3>Saved cases</h3>
          <ul className="list">
            {cases.map((c) => (
              <li
                key={c.id}
                className={c.id === current?.id ? "item active" : "item"}
                style={{ cursor: "pointer" }}
                onClick={() => setCurrent(c)}
              >
                <div>
                  <div>{c.title}</div>
                  <div className="tiny">
                    {c.id} · {c.steps.length} steps
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="form-grid">
            <input placeholder="new-case-id" value={newId} onChange={(e) => setNewId(e.target.value)} />
            <button className="btn secondary" onClick={() => createCase().catch((err) => props.onError(String(err)))}>
              New case
            </button>
          </div>
        </section>
        <section className="card case-editor">
          {current ? (
            <>
              <div className="editor-head">
                <label className="editor-title">
                  <span>Case title</span>
                  <input value={current.title} onChange={(e) => patch({ title: e.target.value })} />
                  <span className="tiny">
                    {current.id} · {current.steps.length} {current.steps.length === 1 ? "step" : "steps"}
                  </span>
                </label>
                <div className="editor-actions">
                  <button
                    className="btn secondary"
                    onClick={() => persist(current).catch((err) => props.onError(String(err)))}
                  >
                    Save
                  </button>
                  <button
                    className="btn"
                    disabled={props.running || props.busy !== null}
                    onClick={() => saveAndRun().catch((err) => props.onError(String(err)))}
                  >
                    {props.busy === "case" ? "Starting…" : "Run this case"}
                  </button>
                </div>
              </div>
              {names.length === 0 && current.steps.some((s) => needsControl(s.action)) ? (
                <p className="tiny editor-note">
                  Catalog is empty. Pin names on Catalog so Tap, See, Dismiss, and Type can pick a control.
                </p>
              ) : null}
              <div className="steps">
                {current.steps.map((step, i) => {
                  const meta = ACTION_META[step.action as (typeof ACTIONS)[number]] ?? {
                    label: step.action,
                    hint: "",
                  };
                  const payload =
                    step.action === "type" || needsControl(step.action) ? (
                      <label className="field">
                        <span>{step.action === "type" ? "Field" : "Control"}</span>
                        <ControlSelect
                          names={names}
                          value={step.target}
                          onChange={(v) => setStep(i, { ...step, target: v })}
                        />
                      </label>
                    ) : step.action === "press" ? (
                      <label className="field">
                        <span>Key</span>
                        <input
                          value={step.key ?? "Enter"}
                          placeholder="Enter"
                          onChange={(e) => setStep(i, { ...step, key: e.target.value })}
                        />
                      </label>
                    ) : step.action === "checkpoint" ? (
                      <label className="field">
                        <span>Screenshot name</span>
                        <input
                          value={step.target ?? ""}
                          placeholder="after-send"
                          onChange={(e) => setStep(i, { ...step, target: e.target.value })}
                        />
                      </label>
                    ) : null;
                  return (
                    <div className="step-card" key={i}>
                      <span className="step-num">{i + 1}</span>
                      <div className="step-body">
                        <div className={payload ? "step-row" : "step-row solo"}>
                          <label className="field">
                            <span>Action</span>
                            <select
                              className="action-select"
                              value={step.action}
                              title={meta.hint}
                              onChange={(e) => setStep(i, stepForAction(e.target.value, step, names))}
                            >
                              {ACTIONS.map((a) => (
                                <option key={a} value={a}>
                                  {ACTION_META[a].label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {payload}
                        </div>
                        {step.action === "type" ? (
                          <label className="field">
                            <span>Text</span>
                            <textarea
                              rows={2}
                              value={step.text ?? ""}
                              placeholder="What to type"
                              onChange={(e) => setStep(i, { ...step, text: e.target.value })}
                            />
                          </label>
                        ) : null}
                        {meta.hint ? <p className="tiny step-hint">{meta.hint}</p> : null}
                      </div>
                      <div className="step-tools">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Move down"
                          disabled={i === current.steps.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          aria-label="Remove step"
                          disabled={current.steps.length === 1}
                          onClick={() => removeStep(i)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="btn ghost-add" type="button" onClick={addStep}>
                Add step
              </button>
            </>
          ) : (
            <p className="tiny">Make a case first.</p>
          )}
        </section>
      </div>
    </>
  );
}

function runWhen(run: RunListItem): string {
  const m = run.id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (m) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[4]}:${m[5]}`;
  }
  if (run.manifest?.startedAt) {
    const d = new Date(run.manifest.startedAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString();
    }
  }
  return run.id;
}

function RunsView(props: {
  runs: RunListItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  detail: RunDetail | null;
}) {
  return (
    <>
      <h2>Runs</h2>
      <p className="lede">Evidence after the headed Chrome job finishes. Nothing is live-streamed.</p>
      <div className="split">
        <section className="card">
          <h3>History</h3>
          <ul className="list">
            {props.runs.map((run) => (
              <li key={run.id}>
                <button
                  className="ghost"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: run.id === props.selected ? "var(--pink-dim)" : "white",
                    borderColor: run.id === props.selected ? "var(--pink)" : undefined,
                  }}
                  onClick={() => props.onSelect(run.id)}
                >
                  <div>{run.name || run.manifest?.test || run.id}</div>
                  <div className="tiny">
                    {run.when || runWhen(run)}
                    {run.manifest ? ` · ${run.manifest.status}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Evidence</h3>
          {!props.detail?.manifest && !props.detail?.shots?.length ? (
            <p className="tiny">No shots yet. Save login or run a case.</p>
          ) : (
            <>
              {props.detail?.manifest?.error ? <p className="bad">{props.detail.manifest.error}</p> : null}
              <div className="gallery">
                {(props.detail?.manifest?.steps ?? []).map((step) => (
                  <figure className="shot" key={step.file}>
                    <img src={`/artifacts/runs/${props.detail?.manifest?.id}/${step.file}`} alt={step.name} />
                    <figcaption>
                      <span>
                        {step.kind} · {step.name}
                      </span>
                      <b className={step.ok ? "ok" : "bad"}>{step.ok ? "ok" : "fail"}</b>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {props.detail?.job?.log ? <pre className="log">{props.detail.job.log}</pre> : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
