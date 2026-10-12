import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, History, Images, LoaderCircle, Maximize2, Play, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { EmptyState, PageHeader, SectionTitle, StatusIcon, Summary } from "../components/ui";
import { caseIdOfRun, durationOf, runWhen } from "../lib/actions";
import { describeStep, offsetOf } from "../lib/steps";
import type { ManifestStep, RunDetail, RunListItem } from "../lib/types";

/** A manifest left at "running" by a crash or a closed browser is stopped, not still going. */
function runStatusOf(run: RunListItem, currentId: string | null, running: boolean): string {
  if (running && run.id === currentId) return "running";
  if (run.manifest?.status === "running") return "stopped";
  return run.manifest?.status ?? "no manifest";
}

/** "Tap" + bold target, so the row reads like the case step that produced it. */
function StepSentence(props: { step: ManifestStep; className?: string }) {
  const words = describeStep(props.step);
  return (
    <span className={props.className}>
      {words.verb}
      {words.target ? <b className="font-semibold"> {words.target}</b> : null}
    </span>
  );
}

function Lightbox(props: {
  steps: ManifestStep[];
  index: number;
  runId: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const step = props.steps[props.index];
  const words = describeStep(step);
  const src = `/artifacts/runs/${props.runId}/${step.file}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
      if (e.key === "ArrowLeft" && props.index > 0) props.onIndex(props.index - 1);
      if (e.key === "ArrowRight" && props.index < props.steps.length - 1) props.onIndex(props.index + 1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [props.index, props.steps.length]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Step ${props.index + 1} screenshot`}
      className="fixed inset-0 z-50 flex flex-col bg-[rgba(10,9,14,0.97)] backdrop-blur-sm text-white fade-in"
      onClick={props.onClose}
    >
      <div className="flex items-start gap-4 px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-white/60">
            Step {props.index + 1} of {props.steps.length}
          </div>
          <div className="text-[15px] leading-snug">
            <StepSentence step={step} />
            {words.note ? <span className={step.ok ? "text-white/70" : "text-[#ff8f87]"}> · {words.note}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="size-9 grid place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30"
            aria-label="Previous step"
            disabled={props.index === 0}
            onClick={() => props.onIndex(props.index - 1)}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            className="size-9 grid place-items-center rounded-lg hover:bg-white/10 disabled:opacity-30"
            aria-label="Next step"
            disabled={props.index === props.steps.length - 1}
            onClick={() => props.onIndex(props.index + 1)}
          >
            <ChevronRight className="size-5" />
          </button>
          <a className="size-9 grid place-items-center rounded-lg hover:bg-white/10" href={src} target="_blank" rel="noreferrer" aria-label="Open the image in a new tab">
            <ExternalLink className="size-4" />
          </a>
          <button type="button" className="size-9 grid place-items-center rounded-lg hover:bg-white/10" aria-label="Close" onClick={props.onClose}>
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 px-5 pb-5 grid place-items-center">
        <img
          src={src}
          alt={`${words.verb} ${words.target ?? ""}`}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
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
  /** Null until the user toggles the log, so each run starts from its own default. */
  const [showLog, setShowLog] = useState<boolean | null>(null);
  /** The step the user opened. Null means follow the default: the failing step, else the newest. */
  const [picked, setPicked] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const detail = props.detail;
  const manifest = detail?.manifest ?? null;
  const steps = manifest?.steps ?? [];
  const isLive = props.running && props.selected === props.currentId;
  const status = isLive ? "running" : manifest?.status === "running" ? "stopped" : (manifest?.status ?? detail?.job?.status ?? null);
  const firstFailIndex = steps.findIndex((s) => !s.ok);
  const caseId = props.selected ? caseIdOfRun(props.selected, props.caseIds) : undefined;
  const selectedRun = props.runs.find((r) => r.id === props.selected);
  const log = detail?.job?.log ?? "";
  const duration = durationOf(manifest?.startedAt, manifest?.finishedAt);

  useEffect(() => {
    setPicked(null);
    setZoom(false);
    setShowLog(null);
  }, [props.selected]);

  const activeIndex = useMemo(() => {
    const byPick = picked ? steps.findIndex((s) => s.file === picked) : -1;
    if (byPick >= 0) return byPick;
    if (firstFailIndex >= 0) return firstFailIndex;
    return steps.length - 1;
  }, [picked, steps, firstFailIndex]);
  const active = activeIndex >= 0 ? steps[activeIndex] : null;
  const activeWords = active ? describeStep(active) : null;

  function open(i: number) {
    const step = steps[i];
    if (!step) return;
    setPicked(step.file);
    document.getElementById(`step-${step.file}`)?.scrollIntoView({ block: "nearest" });
  }

  // ←/→ walk the steps while nothing else has focus
  useEffect(() => {
    if (zoom) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        if (activeIndex > 0) {
          e.preventDefault();
          open(activeIndex - 1);
        }
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        if (activeIndex < steps.length - 1) {
          e.preventDefault();
          open(activeIndex + 1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, steps, zoom]);

  const passedRuns = props.runs.filter((r) => r.manifest?.status === "passed").length;
  const failedRuns = props.runs.filter((r) => r.manifest?.status === "failed").length;

  return (
    <>
      <PageHeader
        title="Runs"
        lede="Every tap, check and checkpoint saves a screenshot. Pick a step to see what Chrome saw at that moment."
        summary={
          <Summary
            items={[
              `${props.runs.length} runs kept`,
              passedRuns > 0 && { text: `${passedRuns} passed`, tone: "ok" },
              failedRuns > 0 && { text: `${failedRuns} failed`, tone: "bad" },
              props.running && { text: "One in progress", tone: "running" },
            ]}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] items-start">
        <section className="card p-3 lg:sticky lg:top-6">
          <SectionTitle className="px-1">History</SectionTitle>
          {props.runs.length === 0 ? (
            <EmptyState compact icon={History} title="No runs yet" body="Sign in or run a case and the evidence shows up here." />
          ) : null}
          <ul className="grid gap-0.5 m-0 p-0 list-none max-h-[calc(100vh-200px)] overflow-auto scrollbar-thin pr-0.5">
            {props.runs.map((run) => {
              const st = runStatusOf(run, props.currentId, props.running);
              const selected = run.id === props.selected;
              const stepsCount = run.manifest?.steps?.length ?? 0;
              const took = durationOf(run.manifest?.startedAt, run.manifest?.finishedAt);
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => props.onSelect(run.id)}
                    aria-current={selected ? "true" : undefined}
                    className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${
                      selected ? "bg-brand-soft" : "hover:bg-soft"
                    }`}
                  >
                    <span className="mt-px">
                      <StatusIcon status={st} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] leading-snug ${selected ? "font-semibold text-ink" : "font-medium"}`}>
                        {run.name || run.manifest?.test || run.id}
                      </span>
                      <span className="block text-[11.5px] text-muted mt-0.5 tabular-nums">
                        {run.when || runWhen(run.id, run.manifest?.startedAt)}
                        {took ? ` · ${took}` : ""}
                        {stepsCount ? ` · ${stepsCount} steps` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-4 border-b border-line">
            <div className="min-w-0 flex-1">
              <h3 className="text-[17px] font-bold tracking-[-0.01em] leading-snug m-0">{selectedRun?.name ?? manifest?.test ?? "Evidence"}</h3>
              {props.selected ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted tabular-nums">
                  {status ? <StatusIcon status={status} label className="size-[15px]" /> : null}
                  {firstFailIndex >= 0 ? <span className="text-ink">at step {firstFailIndex + 1} of {steps.length}</span> : steps.length ? <span className="text-ink">{steps.length} steps</span> : null}
                  {duration ? <span>· {duration}</span> : isLive ? <span>· still working</span> : null}
                  <span>· {selectedRun?.when ?? runWhen(props.selected, manifest?.startedAt)}</span>
                </div>
              ) : null}
            </div>
            {caseId ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!props.canRun}
                title={props.canRun ? `Run ${caseId} again` : "Wait for the current run, or sign in first."}
                onClick={() => props.onRun(caseId)}
              >
                <Play className="size-4" />
                Run again
              </button>
            ) : null}
          </div>

          {!props.selected ? (
            <div className="p-5">
              <EmptyState icon={Images} title="Pick a run" body="Choose a run on the left to see its steps and screenshots." />
            </div>
          ) : !manifest && steps.length === 0 ? (
            <div className="p-5">
              {isLive ? (
                <EmptyState
                  icon={LoaderCircle}
                  title="Chrome is starting"
                  body="The first screenshot shows up here in a few seconds. The page keeps refreshing on its own."
                />
              ) : (
                <EmptyState icon={CircleAlert} title="No evidence for this run" body="It never wrote a manifest, so there are no screenshots. Check the log below." />
              )}
            </div>
          ) : null}

          {manifest?.error ? (
            <div className="flex items-start gap-3 mx-5 mt-4 px-4 py-3 rounded-xl border border-danger-line bg-danger-soft text-danger" role="alert">
              <CircleAlert className="size-[18px] shrink-0 mt-px" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">Why it failed</div>
                <p className="m-0 mt-0.5 text-[13px] leading-relaxed text-ink break-words">{manifest.error}</p>
              </div>
              {firstFailIndex >= 0 && activeIndex !== firstFailIndex ? (
                <button type="button" className="btn btn-sm btn-ghost shrink-0" onClick={() => open(firstFailIndex)}>
                  Show step {firstFailIndex + 1}
                </button>
              ) : null}
            </div>
          ) : null}

          {steps.length > 0 && manifest ? (
            <div className={`grid xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-0 ${manifest.error ? "mt-4 border-t border-line" : ""}`}>
              <ol
                className="m-0 p-2 list-none xl:border-r border-line xl:max-h-[calc(100vh-180px)] xl:overflow-auto scrollbar-thin"
                aria-label="Steps"
              >
                {steps.map((step, i) => {
                  const words = describeStep(step);
                  const Icon = words.icon;
                  const isActive = i === activeIndex;
                  const offset = offsetOf(manifest.startedAt, step.at);
                  return (
                    <li key={step.file} id={`step-${step.file}`}>
                      <button
                        type="button"
                        onClick={() => open(i)}
                        aria-current={isActive ? "step" : undefined}
                        className={`w-full text-left grid grid-cols-[20px_28px_minmax(0,1fr)_auto] items-start gap-x-2.5 px-2.5 py-2.5 rounded-xl transition-colors ${
                          isActive ? (step.ok ? "bg-brand-soft" : "bg-danger-soft") : "hover:bg-soft"
                        }`}
                      >
                        <span className="pt-[5px] text-right text-[11.5px] font-semibold text-faint tabular-nums">{i + 1}</span>
                        <span
                          className={`size-7 rounded-lg grid place-items-center ${
                            step.ok ? (isActive ? "bg-paper text-brand-ink" : "bg-soft text-muted") : "bg-danger text-white"
                          }`}
                        >
                          <Icon className="size-[15px]" strokeWidth={2.2} />
                        </span>
                        <span className="min-w-0 pt-[3px]">
                          <StepSentence step={step} className={`block text-[13px] leading-snug break-words ${step.ok ? "text-ink" : "text-danger"}`} />
                          {words.note ? (
                            <span className={`block mt-0.5 text-[12px] leading-snug break-words ${step.ok ? "text-muted" : "text-danger/90"}`}>{words.note}</span>
                          ) : null}
                        </span>
                        <span className="pt-[5px] text-[11.5px] text-faint tabular-nums">{offset ? `+${offset}` : ""}</span>
                      </button>
                    </li>
                  );
                })}
                {isLive ? (
                  <li className="flex items-center gap-2.5 px-2.5 py-2.5 text-[13px] text-brand-ink">
                    <span className="w-5" />
                    <LoaderCircle className="size-4 animate-spin" />
                    Working on the next step…
                  </li>
                ) : null}
              </ol>

              {active && activeWords ? (
                <figure className="m-0 min-w-0 p-4 md:p-5 bg-canvas">
                  <figcaption className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="text-[12px] text-muted tabular-nums">
                        Step {activeIndex + 1} of {steps.length}
                        {offsetOf(manifest.startedAt, active.at) ? ` · ${offsetOf(manifest.startedAt, active.at)} into the run` : ""}
                      </div>
                      <StepSentence step={active} className={`block text-[15px] leading-snug mt-0.5 ${active.ok ? "" : "text-danger"}`} />
                      {activeWords.note ? (
                        <p className={`m-0 mt-1 text-[13px] leading-relaxed break-words ${active.ok ? "text-muted" : "text-danger"}`}>{activeWords.note}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button type="button" className="icon-btn size-8" aria-label="Previous step" title="Previous step (←)" disabled={activeIndex === 0} onClick={() => open(activeIndex - 1)}>
                        <ChevronLeft className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn size-8"
                        aria-label="Next step"
                        title="Next step (→)"
                        disabled={activeIndex === steps.length - 1}
                        onClick={() => open(activeIndex + 1)}
                      >
                        <ChevronRight className="size-4" />
                      </button>
                      <button type="button" className="icon-btn size-8" aria-label="View full screen" title="View full screen" onClick={() => setZoom(true)}>
                        <Maximize2 className="size-4" />
                      </button>
                    </div>
                  </figcaption>
                  <button
                    type="button"
                    className={`block w-full p-0 rounded-xl overflow-hidden border bg-paper cursor-zoom-in ${active.ok ? "border-line" : "border-danger-line"}`}
                    onClick={() => setZoom(true)}
                    aria-label="View screenshot full screen"
                  >
                    <img key={active.file} src={`/artifacts/runs/${manifest.id}/${active.file}`} alt={`${activeWords.verb} ${activeWords.target ?? ""}`} className="block w-full fade-in" />
                  </button>
                </figure>
              ) : null}
            </div>
          ) : null}

          {log ? (
            <details
              className="log m-5 rounded-xl border border-line bg-canvas"
              open={showLog ?? (!manifest && !isLive)}
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

      {zoom && active && manifest ? <Lightbox steps={steps} index={activeIndex} runId={manifest.id} onIndex={open} onClose={() => setZoom(false)} /> : null}
    </>
  );
}
