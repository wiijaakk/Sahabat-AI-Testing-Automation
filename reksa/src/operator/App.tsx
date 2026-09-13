import { useEffect, useState } from "react";

type Manifest = {
  id: string;
  test: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  steps: { kind: string; name: string; ok: boolean; file: string; detail?: string }[];
};

type RunListItem = {
  id: string;
  dir: string;
  manifest: Manifest | null;
};

type Status = {
  profile: boolean;
  current: { id: string; kind: string; status: string; log: string } | null;
  lastRuns: RunListItem[];
};

type RunDetail = {
  job: { log: string; status: string } | null;
  manifest: Manifest | null;
  shots: string[];
};

export function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"login" | "smoke" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);

  async function refresh() {
    const res = await fetch("/api/status");
    const data = (await res.json()) as Status;
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

  async function post(path: string, kind: "login" | "smoke") {
    setError(null);
    setBusy(kind);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      setSelected(data.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  const running = status?.current?.status === "running";

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>Sahabat sanity</h1>
          <p>
            Headed Chrome against chat.sahabat-ai.com. Login once, run the Library smoke, then
            look at the evidence shots. Nothing is live-streamed; wait for the run to finish.
          </p>
        </div>
        <span className="badge">reksa / v1 smoke</span>
      </header>

      <div className="row">
        <aside className="card">
          <h2>Run</h2>
          <div className="actions">
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
          <div className="meta">
            <div>
              Chrome profile:{" "}
              <b className={status?.profile ? "ok" : "bad"}>
                {status?.profile ? "found" : "missing"}
              </b>
            </div>
            <div>
              Current: <b>{status?.current ? `${status.current.kind} · ${status.current.status}` : "idle"}</b>
            </div>
            {error ? <div className="bad">{error}</div> : null}
          </div>

          <h2 style={{ marginTop: 22 }}>Runs</h2>
          <ul className="runs">
            {(status?.lastRuns ?? []).map((run) => (
              <li key={run.id}>
                <button className={run.id === selected ? "active" : ""} onClick={() => setSelected(run.id)}>
                  {run.id}
                  {run.manifest ? ` · ${run.manifest.status}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="card">
          <h2>Evidence</h2>
          {!detail?.manifest && !detail?.shots?.length ? (
            <p className="meta">No shots yet. Save login or run the smoke.</p>
          ) : (
            <>
              {detail?.manifest?.error ? <p className="bad">{detail.manifest.error}</p> : null}
              <div className="gallery">
                {(detail?.manifest?.steps ?? []).map((step) => (
                  <figure className="shot" key={step.file}>
                    <img src={`/artifacts/runs/${detail?.manifest?.id}/${step.file}`} alt={step.name} />
                    <figcaption>
                      <span>
                        {step.kind} · {step.name}
                      </span>
                      <b className={step.ok ? "ok" : "bad"}>{step.ok ? "ok" : "fail"}</b>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {detail?.job?.log ? <pre className="log">{detail.job.log}</pre> : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
