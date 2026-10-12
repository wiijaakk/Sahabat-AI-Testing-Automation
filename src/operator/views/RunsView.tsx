import { ChevronDown, CircleAlert, ExternalLink, History, Images, LoaderCircle, Play } from "lucide-react";
import { useState } from "react";
import { Chip, EmptyState, PageHeader, SectionTitle, StatTile, StatusChip, Summary } from "../components/ui";
import { caseIdOfRun, durationOf, runWhen } from "../lib/actions";
import type { RunDetail, RunListItem } from "../lib/types";

function runStatusOf(run: RunListItem, currentId: string | null, running: boolean): string {
  if (run.manifest?.status === "running" || (running && run.id === currentId)) return "running";
  return run.manifest?.status ?? "no manifest";
}

export function RunsView(props: {
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
  const status = manifest?.status ?? (isLive ? "running" : (detail?.job?.status ?? null));
  const firstFail = steps.find((s) => !s.ok);
  const firstFailIndex = firstFail ? steps.indexOf(firstFail) : -1;
  const caseId = props.selected ? caseIdOfRun(props.selected, props.caseIds) : undefined;
  const selectedRun = props.runs.find((r) => r.id === props.selected);
  const log = detail?.job?.log ?? "";
  const duration = durationOf(manifest?.startedAt, manifest?.finishedAt);
  const okCount = steps.filter((s) => s.ok).length;

  function jump(file: string) {
    document.getElementById(`shot-${file}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <PageHeader
        title="Runs"
        lede="Every tap, check and checkpoint saves a screenshot. The open run keeps refreshing while Chrome is still working."
        summary={
          <Summary
            items={[
              `${props.runs.length} runs kept`,
              props.runs.filter((r) => r.manifest?.status === "passed").length > 0 &&
                { text: `${props.runs.filter((r) => r.manifest?.status === "passed").length} passed`, tone: "ok" },
              props.runs.filter((r) => r.manifest?.status === "failed").length > 0 &&
                { text: `${props.runs.filter((r) => r.manifest?.status === "failed").length} failed`, tone: "bad" },
              props.running && { text: "One in progress", tone: "running" },
            ]}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] items-start">
        <section className="card p-3.5 lg:sticky lg:top-6">
          <SectionTitle>History</SectionTitle>
          {props.runs.length === 0 ? (
            <EmptyState compact icon={History} title="No runs yet" body="Save login or run a case and the evidence shows up here." />
          ) : null}
          <ul className="grid gap-1 m-0 p-0 list-none max-h-[calc(100vh-200px)] overflow-auto scrollbar-thin pr-0.5">
            {props.runs.map((run) => {
              const st = runStatusOf(run, props.currentId, props.running);
              const active = run.id === props.selected;
              const stepsCount = run.manifest?.steps?.length ?? 0;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(run.id)}
                    className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
                      active ? "border-brand bg-brand-soft" : "border-transparent hover:bg-soft"
                    }`}
                  >
                    <span className={`dot mt-[7px] ${st === "passed" ? "bg-ok" : st === "failed" ? "bg-danger" : st === "running" ? "bg-brand pulse-soft" : "bg-line-strong"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] leading-snug ${active ? "font-semibold" : "font-medium"}`}>
                        {run.name || run.manifest?.test || run.id}
                      </span>
                      <span className="block text-[11px] text-muted mt-0.5 tabular-nums">
                        {run.when || runWhen(run.id, run.manifest?.startedAt)}
                        {stepsCount ? ` · ${stepsCount} shots` : ""}
                      </span>
                    </span>
                    <StatusChip status={st} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-4 md:p-5 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <h3 className="text-[16px] font-bold tracking-[-0.01em] m-0 truncate">{selectedRun?.name ?? manifest?.test ?? "Evidence"}</h3>
              <div className="text-[12px] text-muted mt-0.5 tabular-nums">
                {selectedRun?.when ? `${selectedRun.when} · ` : ""}
                <span>{props.selected ?? ""}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {status ? <StatusChip status={status} /> : null}
              {caseId ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!props.canRun}
                  title={props.canRun ? `Run ${caseId} again` : "Wait for the current run, or save login first."}
                  onClick={() => props.onRun(caseId)}
                >
                  <Play className="size-4" />
                  Run again
                </button>
              ) : null}
            </div>
          </div>

          {!props.selected ? (
            <EmptyState icon={Images} title="Pick a run" body="Choose a run on the left to see its screenshots and log." />
          ) : !manifest && steps.length === 0 ? (
            isLive ? (
              <EmptyState
                icon={LoaderCircle}
                title="Chrome is starting"
                body="The first screenshot shows up here in a few seconds. The page keeps refreshing on its own."
              />
            ) : (
              <EmptyState icon={CircleAlert} title="No evidence for this run" body="It never wrote a manifest, so there are no shots. Check the log below." />
            )
          ) : null}

          {manifest || steps.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <StatTile
                label="Result"
                value={status ?? "—"}
                tone={status === "passed" ? "ok" : status === "failed" ? "bad" : status === "running" ? "brand" : "neutral"}
                sub={isLive ? "still working" : manifest?.finishedAt ? "finished" : ""}
              />
              <StatTile label="Duration" value={duration ?? (isLive ? "…" : "—")} sub={manifest?.startedAt ? new Date(manifest.startedAt).toLocaleTimeString() : ""} />
              <StatTile label="Steps" value={`${okCount} / ${steps.length}`} sub="passed / total" />
              <StatTile
                label="Failed at"
                value={firstFail ? `#${firstFailIndex + 1}` : "—"}
                tone={firstFail ? "bad" : "neutral"}
                sub={firstFail ? `${firstFail.kind} · ${firstFail.name}` : "no failures"}
              />
            </div>
          ) : null}

          {manifest?.error ? (
            <div className="flex items-center gap-3 px-3.5 py-2.5 mb-4 rounded-xl border border-danger-line bg-danger-soft text-danger text-[13px]">
              <CircleAlert className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{manifest.error}</span>
              {firstFail ? (
                <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={() => jump(firstFail.file)}>
                  Jump to failing step
                </button>
              ) : null}
            </div>
          ) : null}

          {steps.length > 0 ? (
            <ol className="flex flex-wrap items-center gap-1.5 m-0 mb-4 p-0 list-none" aria-label="Steps">
              {steps.map((step, i) => (
                <li key={step.file} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className={`chip ${step.ok ? "chip-neutral hover:border-line-strong" : "chip-bad"} h-7 pl-1 cursor-pointer`}
                    title={`${step.kind} · ${step.name}${step.detail ? ` · ${step.detail}` : ""}`}
                    onClick={() => jump(step.file)}
                  >
                    <b className={`size-5 rounded-full grid place-items-center text-[10px] ${step.ok ? "bg-ok-soft text-ok" : "bg-danger text-white"}`}>{i + 1}</b>
                    {step.kind}
                  </button>
                  {i < steps.length - 1 || isLive ? <span className="w-2 h-px bg-line-strong" /> : null}
                </li>
              ))}
              {isLive ? (
                <li>
                  <span className="chip chip-running pulse-soft h-7">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    working…
                  </span>
                </li>
              ) : null}
            </ol>
          ) : null}

          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
            {steps.map((step, i) => (
              <figure
                key={step.file}
                id={`shot-${step.file}`}
                className={`m-0 rounded-2xl overflow-hidden border bg-paper scroll-mt-4 fade-in ${
                  step.ok ? "border-line" : "border-danger ring-4 ring-danger-soft"
                }`}
              >
                <figcaption className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line text-[12.5px]">
                  <span className="min-w-0 flex items-center gap-2">
                    <b className={`size-5 shrink-0 rounded-full grid place-items-center text-[10px] ${step.ok ? "bg-ok-soft text-ok" : "bg-danger text-white"}`}>{i + 1}</b>
                    <span className="truncate">
                      <span className="font-semibold">{step.kind}</span> · {step.name}
                      {step.detail ? <span className="text-muted"> · {step.detail}</span> : null}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <Chip tone={step.ok ? "ok" : "bad"}>{step.ok ? "ok" : "fail"}</Chip>
                    <a
                      className="icon-btn"
                      href={`/artifacts/runs/${manifest?.id}/${step.file}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Open full size"
                      aria-label="Open full size"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </span>
                </figcaption>
                <a href={`/artifacts/runs/${manifest?.id}/${step.file}`} target="_blank" rel="noreferrer" className="block bg-soft">
                  <img src={`/artifacts/runs/${manifest?.id}/${step.file}`} alt={step.name} loading="lazy" className="block w-full" />
                </a>
              </figure>
            ))}
          </div>

          {log ? (
            <details
              className="log mt-4 rounded-xl border border-line bg-canvas"
              open={showLog || (!manifest && !isLive)}
              onToggle={(e) => setShowLog((e.target as HTMLDetailsElement).open)}
            >
              <summary className="flex items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-muted cursor-pointer select-none">
                <ChevronDown className="size-4 transition-transform [details[open]>summary>&]:rotate-180" />
                Process log
              </summary>
              <pre className="m-0 px-3 pb-3 max-h-[260px] overflow-auto scrollbar-thin font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-ink/80">
                {log}
              </pre>
            </details>
          ) : null}
        </section>
      </div>
    </>
  );
}
