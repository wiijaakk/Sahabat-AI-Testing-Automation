import { useEffect, useMemo, useRef, useState } from "react";

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

const ACTIONS = [
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

const ACTION_META: Record<(typeof ACTIONS)[number], { label: string; hint: string }> = {
  gotoDashboard: { label: "Open dashboard", hint: "Opens chat.sahabat-ai.com in the headed Chrome profile." },
  tap: { label: "Tap", hint: "Clicks a named control from the catalog." },
  tapText: { label: "Tap text", hint: "Clicks visible text, including a generated test-data name." },
  see: { label: "See", hint: "Fails the case if this control is not on screen." },
  seeText: { label: "See text", hint: "Fails the case if this visible text is not on screen." },
  seeAny: { label: "See any", hint: "Passes when one pipe-separated option is visible." },
  notSeeText: { label: "Not see text", hint: "Fails the case if this text is still visible." },
  dismiss: { label: "Dismiss if present", hint: "Closes this if it is showing, then continues." },
  checkpoint: { label: "Checkpoint", hint: "Saves a screenshot with this label." },
  type: { label: "Type", hint: "Types into a catalog field." },
  replace: { label: "Replace text", hint: "Selects the current field value and replaces it." },
  upload: { label: "Upload files", hint: "Opens a catalog upload control and selects the listed files." },
  press: { label: "Press key", hint: "Sends a key. Enter usually sends the prompt." },
  waitReply: { label: "Wait for reply", hint: "Waits up to 60s for the chat to answer." },
  reload: { label: "Reload page", hint: "Reloads the current page and waits for Flutter to paint." },
};

function needsControl(action: string) {
  return ["tap", "see", "dismiss", "type", "replace", "upload"].includes(action);
}

function needsText(action: string) {
  return ["tapText", "seeText", "seeAny", "notSeeText", "type", "replace", "upload"].includes(action);
}

function stepForAction(action: string, prev: CaseStep, names: string[]): CaseStep {
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

function ControlSelect(props: {
  entries: VocabEntry[];
  value?: string;
  /** Put text fields first for Type / Replace so the four real fields are not buried under 50 buttons. */
  preferFields?: boolean;
  onChange: (v: string) => void;
}) {
  const names = props.entries.map((e) => e.name);
  const unknown = props.value && !names.includes(props.value) ? props.value : null;
  const fields = props.entries.filter((e) => e.role === "textbox").map((e) => e.name);
  const others = props.entries.filter((e) => e.role !== "textbox").map((e) => e.name);
  const grouped = props.preferFields && fields.length > 0;
  return (
    <select value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)}>
      <option value="" disabled={names.length > 0}>
        {names.length ? "Pick a control" : "No catalog names yet"}
      </option>
      {unknown ? <option value={unknown}>{unknown} (not in catalog)</option> : null}
      {grouped ? (
        <>
          <optgroup label="Text fields">
            {fields.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
          <optgroup label="Other controls">
            {others.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
        </>
      ) : (
        names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))
      )}
    </select>
  );
}

const TEMPLATE_HINT = "{{runTag}} becomes a unique 6-digit stamp per run, {{runAlpha}} the same in letters.";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

/** Which case a run folder belongs to: run ids end with the case id. */
function caseIdOfRun(runId: string, caseIds: string[]): string | undefined {
  const tail = runId.replace(/^\d{8}-\d{6}-/, "");
  return caseIds.find((id) => id === tail);
}

export function App() {
  const [view, setView] = useState<View>("cases");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  async function loadDetail(id: string) {
    try {
      const data = await json<RunDetail>(`/api/runs/${id}`);
      // ignore a late answer for a run the user has already moved away from
      if (selectedRef.current === id) setDetail(data);
    } catch (err) {
      setError(String(err));
    }
  }

  async function refresh() {
    const data = await json<Status>("/api/status");
    setStatus(data);
    // don't yank the user back to the newest run every poll
    setSelected((prev) => prev ?? data.lastRuns[0]?.id ?? null);
    // evidence is flushed step by step, so keep the open run fresh while it runs
    const open = selectedRef.current;
    if (open && data.current?.id === open && data.current.status === "running") {
      await loadDetail(open);
    }
  }

  async function loadCaseIds() {
    const data = await json<{ cases: { id: string }[] }>("/api/cases");
    setCaseIds(data.cases.map((c) => c.id));
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
    loadCaseIds().catch(() => {});
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected);
  }, [selected, status?.current?.status, status?.lastRuns.length]);

  useEffect(() => {
    if (view === "cases" || view === "runs") loadCaseIds().catch(() => {});
  }, [view]);

  async function post(path: string, kind: string, opts: { stay?: boolean } = {}) {
    setError(null);
    setBusy(kind);
    try {
      const data = await json<{ id: string }>(path, { method: "POST" });
      setSelected(data.id);
      if (!opts.stay) setView("runs");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const running = status?.current?.status === "running";
  const profile = Boolean(status?.profile);
  const needsLogin = status !== null && !profile;
  const noProfileTitle = needsLogin ? "Save login first so there is a Chrome profile to run in." : undefined;
  const runCase = (id: string) => post(`/api/run-case/${id}`, "case");
  const current = status?.current ?? null;
  const currentLabel = current
    ? current.kind === "case" && current.caseId
      ? current.caseId
      : current.kind
    : null;

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
            {busy === "login" ? "Opening Chrome…" : profile ? "Save login again" : "Save login"}
          </button>
          <button
            className="secondary"
            disabled={running || busy !== null || needsLogin}
            title={noProfileTitle}
            onClick={() => post("/api/run", "smoke")}
          >
            {busy === "smoke" ? "Starting…" : "Run library smoke"}
          </button>
        </div>
        <div className="side-meta">
          <div>
            Chrome profile:{" "}
            <b className={profile ? "ok" : "bad"}>{status ? (profile ? "found" : "missing") : "…"}</b>
          </div>
          {running && current ? (
            <div>
              Running: <b className="pulse">{currentLabel}</b>
            </div>
          ) : current ? (
            <div>
              Last job:{" "}
              <b>
                {currentLabel} ·{" "}
                <span className={current.status === "passed" ? "ok" : "bad"}>{current.status}</span>
              </b>
            </div>
          ) : (
            <div>
              Idle · <b>no job yet</b>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {error ? (
          <div className="banner bad" role="alert">
            <span>{error}</span>
            <button type="button" className="ghost" onClick={() => setError(null)} aria-label="Dismiss error">
              ×
            </button>
          </div>
        ) : null}
        {needsLogin && view !== "runs" ? (
          <div className="banner warn">
            <span>No Chrome profile yet. Click <b>Save login</b> and finish signing in, then come back here.</span>
          </div>
        ) : null}
        {view === "catalog" ? (
          <CatalogView
            running={running}
            busy={busy}
            vision={Boolean(status?.vision)}
            onScan={() => post("/api/scan", "scan", { stay: true })}
            onError={setError}
            scanJob={current && current.kind === "scan" ? current : null}
          />
        ) : null}
        {view === "cases" ? (
          <CasesView
            running={running}
            busy={busy}
            canRun={!needsLogin}
            noRunTitle={noProfileTitle}
            runs={status?.lastRuns ?? []}
            onRun={runCase}
            onCasesChanged={() => loadCaseIds().catch(() => {})}
            onError={setError}
          />
        ) : null}
        {view === "runs" ? (
          <RunsView
            runs={status?.lastRuns ?? []}
            selected={selected}
            onSelect={setSelected}
            detail={detail}
            running={running}
            currentId={current?.id ?? null}
            caseIds={caseIds}
            canRun={!needsLogin && !running && busy === null}
            onRun={runCase}
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
  scanJob: { status: string } | null;
}) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [filter, setFilter] = useState("");

  async function load() {
    const cat = await json<{ entries: VocabEntry[] }>("/api/catalog");
    setEntries(cat.entries);
    const h = await json<{ harvest: Harvest | null }>("/api/harvest");
    setHarvest(h.harvest);
    const c = await json<{ cases: TestCase[] }>("/api/cases");
    setCases(c.cases);
  }

  /** How many cases reference a control, so Remove can warn instead of silently breaking them. */
  function usedIn(name: string): string[] {
    const n = name.toLowerCase();
    return cases.filter((c) => c.steps.some((s) => (s.target ?? "").toLowerCase() === n)).map((c) => c.id);
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
    const users = usedIn(name);
    const msg =
      users.length > 0
        ? `"${name}" is used by ${users.length} case${users.length === 1 ? "" : "s"} (${users.slice(0, 4).join(", ")}${users.length > 4 ? ", …" : ""}). Those steps will fail. Remove anyway?`
        : `Remove "${name}" from the catalog?`;
    if (!window.confirm(msg)) return;
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
  const scanning = props.busy === "scan" || (props.running && props.scanJob?.status === "running");
  const q = filter.trim().toLowerCase();
  const shown = q
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.text.some((t) => t.toLowerCase().includes(q)) ||
          (e.hint ?? "").includes(q),
      )
    : entries;

  return (
    <>
      <h2>Catalog</h2>
      <p className="lede">
        Named controls pin as-is. Unnamed icons need a screenshot first so you can tell send from mic.
      </p>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn" disabled={props.running || props.busy !== null} onClick={props.onScan}>
          {scanning ? "Scanning…" : "Scan screen"}
        </button>
        <span className="tiny">
          {scanning
            ? "Chrome is opening the dashboard and reading the screen. This takes about 20 seconds."
            : harvest
              ? `${harvest.nodes.length} controls · ${harvest.url} · scanned ${new Date(harvest.at).toLocaleString()}`
              : "No harvest yet. Scan to see what is on the dashboard right now."}
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
          {named.length === 0 ? (
            <p className="tiny">
              {harvest ? "Nothing with a label on this screen." : "Scan the screen to list the controls Flutter exposes."}
            </p>
          ) : null}
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
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>
              Saved <span className="tiny">({shown.length === entries.length ? entries.length : `${shown.length} of ${entries.length}`})</span>
            </h3>
            <input
              className="filter"
              placeholder="Filter by name or alias"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <form
            className="form-grid add-form"
            onSubmit={(e) => {
              e.preventDefault();
              addManual();
            }}
          >
            <input placeholder="New control name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input
              placeholder="Text as shown on screen, comma separated aliases"
              value={newAliases}
              onChange={(e) => setNewAliases(e.target.value)}
            />
            <button className="btn secondary" type="submit" disabled={!newName.trim()}>
              Add by text
            </button>
          </form>
          <ul className="list">
            {shown.map((e) => {
              const users = usedIn(e.name);
              return (
                <li key={e.name}>
                  <div>
                    <div>
                      {e.name} {e.unnamed ? <span className="badge">icon</span> : null}
                      {e.role === "textbox" ? <span className="badge">field</span> : null}
                      {e.hint ? <span className="tiny"> · {e.hint}</span> : null}
                    </div>
                    <div className="tiny">
                      {e.text.join(", ")}
                      {users.length > 0 ? ` · used in ${users.length} case${users.length === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                  <button className="ghost danger" onClick={() => remove(e.name)}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && q ? <p className="tiny">Nothing matches “{filter}”.</p> : null}
        </section>
      </div>
    </>
  );
}

function sameCase(a: TestCase | null, b: TestCase | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function CasesView(props: {
  running: boolean;
  busy: string | null;
  canRun: boolean;
  noRunTitle?: string;
  runs: RunListItem[];
  onRun: (id: string) => void;
  onCasesChanged: () => void;
  onError: (s: string) => void;
}) {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [catalog, setCatalog] = useState<VocabEntry[]>([]);
  const [current, setCurrent] = useState<TestCase | null>(null);
  /** What is on disk for the open case, so we can tell if the editor is dirty. */
  const [saved, setSaved] = useState<TestCase | null>(null);
  const [newId, setNewId] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    const data = await json<{ cases: TestCase[] }>("/api/cases");
    setCases(data.cases);
    const first = data.cases[0] ?? null;
    setCurrent((prev) => {
      if (prev) return data.cases.find((c) => c.id === prev.id) ?? first;
      return first;
    });
    setSaved((prev) => {
      if (prev) return data.cases.find((c) => c.id === prev.id) ?? first;
      return first;
    });
    const cat = await json<{ entries: VocabEntry[] }>("/api/catalog");
    setCatalog(cat.entries);
  }

  useEffect(() => {
    load().catch((err) => props.onError(String(err)));
  }, []);

  const dirty = current !== null && !sameCase(current, saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function showFlash(text: string) {
    setFlash(text);
    window.setTimeout(() => setFlash((f) => (f === text ? null : f)), 1800);
  }

  async function persist(next: TestCase): Promise<TestCase> {
    const res = await json<{ case: TestCase }>(`/api/cases/${next.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setCurrent(res.case);
    setSaved(res.case);
    setCases((all) => {
      const rest = all.filter((c) => c.id !== res.case.id);
      return [...rest, res.case].sort((a, b) => a.id.localeCompare(b.id));
    });
    props.onCasesChanged();
    return res.case;
  }

  async function save() {
    if (!current) return;
    await persist(current);
    showFlash("Saved");
  }

  function open(c: TestCase) {
    if (c.id === current?.id) return;
    if (dirty && !window.confirm(`Discard unsaved changes to "${current?.title}"?`)) return;
    setCurrent(c);
    setSaved(c);
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

  function addStep(at?: number) {
    if (!current) return;
    const fresh: CaseStep = { action: "tap", target: catalog[0]?.name };
    const steps = current.steps.slice();
    steps.splice(at ?? steps.length, 0, fresh);
    patch({ steps });
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

  function cleanId(raw: string) {
    return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
  }

  async function createCase() {
    const id = cleanId(newId);
    if (!id) return;
    if (cases.some((c) => c.id === id)) {
      props.onError(`A case called "${id}" already exists. Open it from the list or pick another id.`);
      return;
    }
    if (dirty && !window.confirm(`Discard unsaved changes to "${current?.title}"?`)) return;
    const next: TestCase = { id, title: id, steps: [{ action: "gotoDashboard" }, { action: "dismiss", target: "Skip" }] };
    await persist(next);
    setNewId("");
  }

  async function duplicateCase() {
    if (!current) return;
    let id = `${current.id}-copy`;
    let n = 2;
    while (cases.some((c) => c.id === id)) id = `${current.id}-copy-${n++}`;
    const next: TestCase = { ...current, id, title: `${current.title} (copy)` };
    await persist(next);
    showFlash(`Duplicated as ${id}`);
  }

  async function deleteCase() {
    if (!current) return;
    if (!window.confirm(`Delete case "${current.title}" (${current.id})? The JSON file is removed.`)) return;
    await json(`/api/cases/${current.id}`, { method: "DELETE" });
    const rest = cases.filter((c) => c.id !== current.id);
    setCases(rest);
    setCurrent(rest[0] ?? null);
    setSaved(rest[0] ?? null);
    props.onCasesChanged();
  }

  /** Newest run folder for a case, so the list can show pass/fail at a glance. */
  function lastRunOf(id: string): RunListItem | undefined {
    return props.runs.find((r) => r.id.replace(/^\d{8}-\d{6}-/, "") === id);
  }

  const names = catalog.map((e) => e.name);
  const newIdPreview = cleanId(newId);

  return (
    <>
      <h2>Cases</h2>
      <p className="lede">Pick actions and catalog names. Run uses the headed Chrome profile.</p>
      <div className="split cases-split">
        <section className="card">
          <h3>Saved cases</h3>
          <form
            className="form-grid"
            style={{ marginTop: 0, marginBottom: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              createCase().catch((err) => props.onError(String(err)));
            }}
          >
            <input placeholder="new-case-id" value={newId} onChange={(e) => setNewId(e.target.value)} />
            {newId && newIdPreview !== newId.trim() ? (
              <span className="tiny">Will be saved as {newIdPreview || "…"}</span>
            ) : null}
            <button className="btn secondary" type="submit" disabled={!newIdPreview}>
              New case
            </button>
          </form>
          <ul className="list">
            {cases.map((c) => {
              const last = lastRunOf(c.id);
              const st = last?.manifest?.status;
              return (
                <li
                  key={c.id}
                  className={c.id === current?.id ? "item active" : "item"}
                  style={{ cursor: "pointer" }}
                  onClick={() => open(c)}
                >
                  <div>
                    <div>
                      {c.title}
                      {c.id === current?.id && dirty ? <span className="badge warn-badge">unsaved</span> : null}
                    </div>
                    <div className="tiny">
                      {c.id} · {c.steps.length} steps
                    </div>
                  </div>
                  {st ? (
                    <span className={`chip ${st}`} title={`Last run ${last?.when ?? ""}`}>
                      {st}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
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
                    {dirty ? <b className="bad"> · unsaved changes</b> : flash ? <b className="ok"> · {flash}</b> : null}
                  </span>
                </label>
                <div className="editor-actions">
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => duplicateCase().catch((err) => props.onError(String(err)))}
                  >
                    Duplicate
                  </button>
                  <button
                    className="ghost danger"
                    type="button"
                    onClick={() => deleteCase().catch((err) => props.onError(String(err)))}
                  >
                    Delete
                  </button>
                  <button
                    className={dirty ? "btn" : "btn secondary"}
                    onClick={() => save().catch((err) => props.onError(String(err)))}
                  >
                    {dirty ? "Save changes" : "Save"}
                  </button>
                  <button
                    className="btn"
                    disabled={props.running || props.busy !== null || !props.canRun}
                    title={props.noRunTitle}
                    onClick={() => saveAndRun().catch((err) => props.onError(String(err)))}
                  >
                    {props.busy === "case" ? "Starting…" : props.running ? "A run is in progress" : dirty ? "Save & run" : "Run this case"}
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
                  const isField = ["type", "replace"].includes(step.action);
                  const missing = needsControl(step.action) && step.target && !names.includes(step.target);
                  const payload =
                    needsControl(step.action) ? (
                      <label className="field">
                        <span>
                          {isField ? "Field" : "Control"}
                          {missing ? <b className="bad"> · not in catalog</b> : null}
                        </span>
                        <ControlSelect
                          entries={catalog}
                          preferFields={isField}
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
                        {needsText(step.action) ? (
                          <label className="field">
                            <span>{step.action === "upload" ? "File paths" : "Text"}</span>
                            <textarea
                              rows={2}
                              value={step.text ?? ""}
                              placeholder={step.action === "seeAny" ? "Option one | Option two" : step.action === "upload" ? "test-data/file.txt" : "Text"}
                              onChange={(e) => setStep(i, { ...step, text: e.target.value })}
                            />
                          </label>
                        ) : null}
                        {meta.hint ? (
                          <p className="tiny step-hint">
                            {meta.hint}
                            {needsText(step.action) && step.action !== "upload" ? ` ${TEMPLATE_HINT}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="step-tools">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Move up"
                          title="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Move down"
                          title="Move down"
                          disabled={i === current.steps.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Insert step below"
                          title="Insert step below"
                          onClick={() => addStep(i + 1)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          aria-label="Remove step"
                          title="Remove step"
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
              <button className="btn ghost-add" type="button" onClick={() => addStep()}>
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

function runStatusOf(run: RunListItem, currentId: string | null, running: boolean): string {
  if (run.manifest?.status === "running" || (running && run.id === currentId)) return "running";
  return run.manifest?.status ?? "no manifest";
}

function RunsView(props: {
  runs: RunListItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  detail: RunDetail | null;
  running: boolean;
  currentId: string | null;
  caseIds: string[];
  canRun: boolean;
  onRun: (id: string) => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const detail = props.detail;
  const manifest = detail?.manifest ?? null;
  const steps = manifest?.steps ?? [];
  const isLive = props.running && props.selected === props.currentId;
  const status = manifest?.status ?? (isLive ? "running" : detail?.job?.status ?? null);
  const firstFail = steps.find((s) => !s.ok);
  const caseId = props.selected ? caseIdOfRun(props.selected, props.caseIds) : undefined;
  const selectedRun = props.runs.find((r) => r.id === props.selected);
  const log = detail?.job?.log ?? "";

  function jump(file: string) {
    document.getElementById(`shot-${file}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <h2>Runs</h2>
      <p className="lede">
        Every tap, check and checkpoint saves a screenshot. The open run refreshes while Chrome is still working.
      </p>
      <div className="split runs-split">
        <section className="card">
          <h3>History</h3>
          {props.runs.length === 0 ? <p className="tiny">No runs yet. Save login or run a case.</p> : null}
          <ul className="list">
            {props.runs.map((run) => {
              const st = runStatusOf(run, props.currentId, props.running);
              return (
                <li key={run.id} className={run.id === props.selected ? "item active run-item" : "item run-item"}>
                  <button type="button" className="run-pick" onClick={() => props.onSelect(run.id)}>
                    <div>{run.name || run.manifest?.test || run.id}</div>
                    <div className="tiny">{run.when || runWhen(run)}</div>
                  </button>
                  <span className={`chip ${st}`}>{st}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card evidence">
          <div className="evidence-head">
            <div>
              <h3 style={{ margin: 0 }}>{selectedRun?.name ?? manifest?.test ?? "Evidence"}</h3>
              <div className="tiny">
                {selectedRun?.when ? `${selectedRun.when} · ` : ""}
                {steps.length} shot{steps.length === 1 ? "" : "s"}
                {manifest?.finishedAt && manifest.startedAt
                  ? ` · ${Math.round((new Date(manifest.finishedAt).getTime() - new Date(manifest.startedAt).getTime()) / 1000)}s`
                  : ""}
              </div>
            </div>
            <div className="row">
              {status ? <span className={`chip ${status}`}>{status}</span> : null}
              {caseId ? (
                <button
                  type="button"
                  className="btn"
                  disabled={!props.canRun}
                  title={props.canRun ? `Run ${caseId} again` : "Wait for the current run, or save login first."}
                  onClick={() => props.onRun(caseId)}
                >
                  Run again
                </button>
              ) : null}
            </div>
          </div>

          {!props.selected ? (
            <p className="tiny">Pick a run on the left.</p>
          ) : !manifest && steps.length === 0 ? (
            <p className="tiny">
              {isLive
                ? "Chrome is starting. The first screenshot shows up here in a few seconds."
                : "This run never wrote a manifest, so there are no shots. Check the log below."}
            </p>
          ) : null}

          {manifest?.error ? (
            <p className="banner bad" style={{ margin: "12px 0" }}>
              <span>{manifest.error}</span>
              {firstFail ? (
                <button type="button" className="ghost" onClick={() => jump(firstFail.file)}>
                  Jump to failing step
                </button>
              ) : null}
            </p>
          ) : null}

          {steps.length > 0 ? (
            <ol className="step-strip" aria-label="Steps">
              {steps.map((step, i) => (
                <li key={step.file}>
                  <button
                    type="button"
                    className={step.ok ? "step-pill ok" : "step-pill fail"}
                    title={`${step.kind} · ${step.name}${step.detail ? ` · ${step.detail}` : ""}`}
                    onClick={() => jump(step.file)}
                  >
                    <b>{i + 1}</b> {step.kind}
                  </button>
                </li>
              ))}
              {isLive ? (
                <li>
                  <span className="step-pill running pulse">working…</span>
                </li>
              ) : null}
            </ol>
          ) : null}

          <div className="gallery">
            {steps.map((step, i) => (
              <figure className={step.ok ? "shot" : "shot failed"} key={step.file} id={`shot-${step.file}`}>
                <figcaption>
                  <span>
                    <b className="step-idx">{i + 1}</b> {step.kind} · {step.name}
                    {step.detail ? <span className="tiny"> · {step.detail}</span> : null}
                  </span>
                  <b className={step.ok ? "ok" : "bad"}>{step.ok ? "ok" : "fail"}</b>
                </figcaption>
                <a href={`/artifacts/runs/${manifest?.id}/${step.file}`} target="_blank" rel="noreferrer">
                  <img src={`/artifacts/runs/${manifest?.id}/${step.file}`} alt={step.name} loading="lazy" />
                </a>
              </figure>
            ))}
          </div>

          {log ? (
            <details className="log-wrap" open={showLog || (!manifest && !isLive)} onToggle={(e) => setShowLog((e.target as HTMLDetailsElement).open)}>
              <summary className="tiny">Process log</summary>
              <pre className="log">{log}</pre>
            </details>
          ) : null}
        </section>
      </div>
    </>
  );
}
