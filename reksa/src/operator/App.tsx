import { useEffect, useMemo, useState } from "react";

type View = "catalog" | "cases" | "runs";

type VocabEntry = {
  name: string;
  text: string[];
  expectPath?: string;
  role?: string;
  unnamed?: boolean;
  hint?: string;
};

type HarvestNode = {
  id: string;
  role: string | null;
  name: string;
  unnamed: boolean;
  bbox: { x: number; y: number; width: number; height: number };
};

type Harvest = { at: string; url: string; nodes: HarvestNode[] };

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

type RunListItem = { id: string; dir: string; manifest: Manifest | null };

type Status = {
  profile: boolean;
  current: { id: string; kind: string; status: string; log: string; caseId?: string } | null;
  lastRuns: RunListItem[];
};

type RunDetail = {
  job: { log: string; status: string } | null;
  manifest: Manifest | null;
  shots: string[];
};

const ACTIONS = ["gotoDashboard", "tap", "see", "dismiss", "checkpoint", "type", "press", "waitReply"];

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
    if (!selected && data.lastRuns[0]) setSelected(data.lastRuns[0].id);
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

function CatalogView(props: {
  running: boolean;
  busy: string | null;
  onScan: () => void;
  onError: (s: string) => void;
}) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [pinDraft, setPinDraft] = useState<Record<string, string>>({});

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

  function pin(node: HarvestNode, name = node.name) {
    const n = name.trim();
    if (!n) return;
    if (entries.some((e) => e.name.toLowerCase() === n.toLowerCase())) return;
    const entry: VocabEntry = {
      name: n,
      text: node.name ? [node.name] : [n],
      role: node.role ?? "button",
      unnamed: node.unnamed || !node.name,
    };
    save([...entries, entry]).catch((err) => props.onError(String(err)));
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

  return (
    <>
      <h2>Catalog</h2>
      <p className="lede">
        Saved names are what cases can tap. Scan the current screen to collect Flutter semantics,
        then pin the ones you actually want.
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" disabled={props.running || props.busy !== null} onClick={props.onScan}>
          {props.busy === "scan" ? "Scanning…" : "Scan screen"}
        </button>
        <span className="tiny">
          {harvest ? `${harvest.nodes.length} controls · ${harvest.url}` : "No harvest yet"}
        </span>
      </div>
      <div className="split">
        <section className="card">
          <h3>On this screen</h3>
          <ul className="list">
            {(harvest?.nodes ?? []).map((n) => {
              const label = n.name || "(unnamed)";
              const already = n.name && savedNames.has(n.name.toLowerCase());
              return (
                <li key={n.id}>
                  <div>
                    <div>
                      {label} {n.unnamed ? <span className="badge">no name</span> : null}
                    </div>
                    <div className="tiny">
                      {n.role ?? "?"} · {Math.round(n.bbox.x)},{Math.round(n.bbox.y)}
                    </div>
                  </div>
                  {n.unnamed ? (
                    <span className="row">
                      <input
                        placeholder="name it"
                        value={pinDraft[n.id] ?? ""}
                        onChange={(e) => setPinDraft({ ...pinDraft, [n.id]: e.target.value })}
                        style={{ width: 90 }}
                      />
                      <button className="ghost" onClick={() => pin(n, pinDraft[n.id])}>
                        Pin
                      </button>
                    </span>
                  ) : (
                    <button className="ghost" disabled={Boolean(already)} onClick={() => pin(n)}>
                      {already ? "Saved" : "Pin"}
                    </button>
                  )}
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
      <div className="split">
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
        <section className="card">
          {current ? (
            <>
              <div className="row" style={{ marginBottom: 12 }}>
                <input value={current.title} onChange={(e) => patch({ title: e.target.value })} />
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
                  Run this case
                </button>
              </div>
              <div className="steps">
                {current.steps.map((step, i) => (
                  <div className="step" key={i}>
                    <span className="tiny">{i + 1}</span>
                    <select
                      value={step.action}
                      onChange={(e) => setStep(i, { ...step, action: e.target.value })}
                    >
                      {ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    {step.action === "type" ? (
                      <span className="row">
                        <select
                          value={step.target ?? ""}
                          onChange={(e) => setStep(i, { ...step, target: e.target.value })}
                        >
                          {names.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <input
                          value={step.text ?? ""}
                          placeholder="prompt"
                          onChange={(e) => setStep(i, { ...step, text: e.target.value })}
                        />
                      </span>
                    ) : step.action === "press" ? (
                      <input
                        value={step.key ?? "Enter"}
                        onChange={(e) => setStep(i, { ...step, key: e.target.value })}
                      />
                    ) : step.action === "checkpoint" ? (
                      <input
                        value={step.target ?? ""}
                        placeholder="label"
                        onChange={(e) => setStep(i, { ...step, target: e.target.value })}
                      />
                    ) : ["tap", "see", "dismiss"].includes(step.action) ? (
                      <select
                        value={step.target ?? ""}
                        onChange={(e) => setStep(i, { ...step, target: e.target.value })}
                      >
                        {names.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="tiny">{step.action === "waitReply" ? "max 60s" : "—"}</span>
                    )}
                    <span className="row">
                      <button className="ghost" onClick={() => move(i, -1)}>
                        up
                      </button>
                      <button className="ghost" onClick={() => move(i, 1)}>
                        down
                      </button>
                      <button className="ghost danger" onClick={() => removeStep(i)}>
                        x
                      </button>
                    </span>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn secondary" onClick={addStep}>
                  Add step
                </button>
              </div>
            </>
          ) : (
            <p className="tiny">Make a case first.</p>
          )}
        </section>
      </div>
    </>
  );
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
                  className={run.id === props.selected ? "ghost" : "ghost"}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: run.id === props.selected ? "var(--pink-dim)" : "white",
                    borderColor: run.id === props.selected ? "var(--pink)" : undefined,
                  }}
                  onClick={() => props.onSelect(run.id)}
                >
                  {run.id}
                  {run.manifest ? ` · ${run.manifest.status}` : ""}
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
