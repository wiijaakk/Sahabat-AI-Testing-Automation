import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Banner } from "./components/ui";
import { json, jsonBody } from "./lib/api";
import { useTheme } from "./lib/theme";
import type { RunDetail, Status, View } from "./lib/types";
import { CatalogView } from "./views/CatalogView";
import { CasesView } from "./views/CasesView";
import { RunsView } from "./views/RunsView";

export function App() {
  const [view, setView] = useState<View>("cases");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [catalogCount, setCatalogCount] = useState<number | undefined>(undefined);
  const [theme, setTheme] = useTheme();
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

  async function loadCatalogCount() {
    const data = await json<{ entries: unknown[] }>("/api/catalog");
    setCatalogCount(data.entries.length);
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
    loadCaseIds().catch(() => {});
    loadCatalogCount().catch(() => {});
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
    if (view !== "catalog") loadCatalogCount().catch(() => {});
  }, [view]);

  async function post(path: string, kind: string, opts: { stay?: boolean; body?: unknown } = {}) {
    setError(null);
    setBusy(kind);
    try {
      const data = await json<{ id: string }>(path, opts.body === undefined ? { method: "POST" } : jsonBody(opts.body));
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
  const noProfileTitle = needsLogin ? "Sign in to Sahabat-AI first so there is a Chrome profile to run in." : undefined;
  const runCase = (id: string) => post(`/api/run-case/${id}`, "case");
  const current = status?.current ?? null;

  async function deleteRun(id: string) {
    try {
      await json(`/api/runs/${id}`, { method: "DELETE" });
      // land on the run below the deleted one, else the one above
      const runs = status?.lastRuns ?? [];
      const at = runs.findIndex((r) => r.id === id);
      const next = runs[at + 1] ?? runs[at - 1] ?? null;
      setDetail(null);
      setSelected(next?.id ?? null);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }
  const currentLabel = current ? (current.kind === "case" && current.caseId ? current.caseId : current.kind) : null;

  function openCurrent() {
    if (!current) return;
    setSelected(current.id);
    setView("runs");
  }

  return (
    <div className="grid min-h-full grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-0 lg:h-screen">
        <Sidebar
          view={view}
          onView={setView}
          counts={{ catalog: catalogCount, cases: caseIds.length || undefined, runs: status?.lastRuns.length }}
          loaded={status !== null}
          profile={profile}
          running={running}
          busy={busy}
          current={current}
          currentLabel={currentLabel}
          onLogin={() => post("/api/login", "login")}
          onOpenCurrent={openCurrent}
          theme={theme}
          onTheme={setTheme}
        />
      </div>

      <main className="min-w-0 px-5 py-5 md:px-7 md:py-6 pb-16">
        <div className="grid gap-3 mb-4 empty:mb-0">
          {error ? (
            <Banner tone="bad" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          ) : null}
          {needsLogin && view !== "runs" ? (
            <Banner
              tone="warn"
              action={
                <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => post("/api/login", "login")}>
                  Sign in
                </button>
              }
            >
              Not signed in yet. Sign in once in the Chrome window that opens; the profile is kept for every run after that.
            </Banner>
          ) : null}
        </div>

        {view === "catalog" ? (
          <CatalogView
            running={running}
            busy={busy}
            vision={Boolean(status?.vision)}
            onScan={(screens) => post("/api/scan", "scan", { stay: true, body: screens?.length ? { screens } : {} })}
            onError={setError}
            onCountChange={setCatalogCount}
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
            onDelete={deleteRun}
          />
        ) : null}
      </main>
    </div>
  );
}
