import { ArrowDown, ArrowUp, Copy, ListChecks, LoaderCircle, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActionPicker } from "../components/ActionPicker";
import { ControlPicker, type ControlUsage } from "../components/ControlPicker";
import { Chip, EmptyState, PageHeader, SectionTitle, Summary } from "../components/ui";
import { FAMILY_STYLE, metaOf, needsControl, needsText, stepForAction, TEMPLATE_HINT } from "../lib/actions";
import { json, jsonBody } from "../lib/api";
import type { CaseStep, ControlPreview, RunListItem, TestCase, VocabEntry } from "../lib/types";

function sameCase(a: TestCase | null, b: TestCase | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cleanId(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
}

/** The little word between the action and its target, so a step reads like a sentence: Tap · on · AIStorage. */
function joiner(action: string): string {
  if (action === "type" || action === "replace") return "into";
  if (action === "upload") return "via";
  if (action === "press") return "key";
  if (action === "checkpoint") return "named";
  return "on";
}

export function CasesView(props: {
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
  const [previews, setPreviews] = useState<Record<string, ControlPreview>>({});

  async function load() {
    const data = await json<{ cases: TestCase[] }>("/api/cases");
    setCases(data.cases);
    const first = data.cases[0] ?? null;
    setCurrent((prev) => (prev ? (data.cases.find((c) => c.id === prev.id) ?? first) : first));
    setSaved((prev) => (prev ? (data.cases.find((c) => c.id === prev.id) ?? first) : first));
    const cat = await json<{ entries: VocabEntry[] }>("/api/catalog");
    setCatalog(cat.entries);
  }

  useEffect(() => {
    load().catch((err) => props.onError(String(err)));
  }, []);

  // previews come from run screenshots, so refresh them whenever a run lands
  const newestRun = props.runs[0] ? `${props.runs[0].id}:${props.runs[0].manifest?.status}` : "";
  useEffect(() => {
    json<{ previews: Record<string, ControlPreview> }>("/api/catalog/previews")
      .then((r) => setPreviews(r.previews))
      .catch(() => setPreviews({}));
  }, [newestRun]);

  /** Which saved cases point at each control, for grouping and the picker's "Used in". */
  const usage: ControlUsage = useMemo(() => {
    const out: ControlUsage = {};
    for (const c of cases) {
      for (const st of c.steps) {
        if (!st.target || !needsControl(st.action)) continue;
        const list = (out[st.target] ??= []);
        if (!list.includes(c.id)) list.push(c.id);
      }
    }
    return out;
  }, [cases]);

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
    const res = await json<{ case: TestCase }>(`/api/cases/${next.id}`, jsonBody(next, "PUT"));
    setCurrent(res.case);
    setSaved(res.case);
    setCases((all) => [...all.filter((c) => c.id !== res.case.id), res.case].sort((a, b) => a.id.localeCompare(b.id)));
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
  const wrap = (p: Promise<unknown>) => p.catch((err) => props.onError(String(err)));
  const passed = cases.filter((c) => lastRunOf(c.id)?.manifest?.status === "passed").length;
  const failed = cases.filter((c) => lastRunOf(c.id)?.manifest?.status === "failed").length;
  const never = cases.length - passed - failed;

  return (
    <>
      <PageHeader
        title="Cases"
        lede="Each case is a list of steps against the live product. Pick an action, point it at a catalog control, and run it in the signed-in Chrome profile."
        summary={
          <Summary
            items={[
              `${cases.length} cases`,
              passed > 0 && { text: `${passed} passing`, tone: "ok" },
              failed > 0 && { text: `${failed} failing`, tone: "bad" },
              never > 0 && `${never} not run yet`,
            ]}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] items-start">
        <section className="card p-3.5 lg:sticky lg:top-6">
          <SectionTitle>Saved cases</SectionTitle>
          <form
            className="grid gap-1.5 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              wrap(createCase());
            }}
          >
            <div className="flex gap-1.5">
              <input className="input input-sm" placeholder="New case id, e.g. lb-007-rename" value={newId} onChange={(e) => setNewId(e.target.value)} />
              <button type="submit" className="btn btn-sm btn-primary" disabled={!newIdPreview}>
                <Plus className="size-3.5" />
                New
              </button>
            </div>
            {newId && newIdPreview !== newId.trim() ? (
              <span className="text-[11.5px] text-muted">Will be saved as {newIdPreview || "…"}</span>
            ) : null}
          </form>
          <ul className="grid gap-1 m-0 p-0 list-none max-h-[calc(100vh-240px)] overflow-auto scrollbar-thin pr-0.5">
            {cases.map((c) => {
              const last = lastRunOf(c.id);
              const st = last?.manifest?.status;
              const active = c.id === current?.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c)}
                    className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
                      active ? "border-brand bg-brand-soft" : "border-transparent hover:bg-soft"
                    }`}
                  >
                    <span
                      className={`dot mt-[7px] ${st === "passed" ? "bg-ok" : st === "failed" ? "bg-danger" : "bg-line-strong"}`}
                      title={st ? `Last run ${st} · ${last?.when ?? ""}` : "Never run"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13px] leading-snug ${active ? "font-semibold" : "font-medium"}`}>{c.title}</span>
                      <span className="block text-[11px] text-muted mt-0.5 truncate">
                        {c.id} · {c.steps.length} steps
                      </span>
                    </span>
                    {active && dirty ? <Chip tone="warn">unsaved</Chip> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-4 md:p-5 min-w-0">
          {current ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 mb-4 border-b border-line">
                <div className="flex-1 min-w-[260px]">
                  <input
                    className="input text-[16px] font-bold h-10"
                    aria-label="Case title"
                    value={current.title}
                    onChange={(e) => patch({ title: e.target.value })}
                  />
                  <div className="mt-1.5 text-[12px] text-muted">
                    {current.id} · {current.steps.length} {current.steps.length === 1 ? "step" : "steps"}
                    {dirty ? <b className="text-warn font-semibold"> · unsaved changes</b> : flash ? <b className="text-ok font-semibold"> · {flash}</b> : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" className="btn btn-ghost" title="Duplicate this case" onClick={() => wrap(duplicateCase())}>
                    <Copy className="size-4" />
                    Duplicate
                  </button>
                  <button type="button" className="btn btn-danger" title="Delete this case" aria-label="Delete this case" onClick={() => wrap(deleteCase())}>
                    <Trash2 className="size-4" />
                  </button>
                  <button type="button" className={`btn ${dirty ? "btn-dark" : "btn-ghost"}`} onClick={() => wrap(save())}>
                    <Save className="size-4" />
                    {dirty ? "Save changes" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={props.running || props.busy !== null || !props.canRun}
                    title={props.noRunTitle}
                    onClick={() => wrap(saveAndRun())}
                  >
                    {props.busy === "case" ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {props.busy === "case" ? "Starting…" : props.running ? "A run is in progress" : dirty ? "Save & run" : "Run this case"}
                  </button>
                </div>
              </div>

              {names.length === 0 && current.steps.some((s) => needsControl(s.action)) ? (
                <p className="text-[12.5px] text-warn bg-warn-soft border border-warn-line rounded-xl px-3 py-2 mb-3">
                  Catalog is empty. Pin names on Catalog so Tap, See, Dismiss and Type can pick a control.
                </p>
              ) : null}

              <ol className="grid gap-1.5 m-0 p-0 list-none">
                {current.steps.map((step, i) => {
                  const meta = metaOf(step.action);
                  const fam = FAMILY_STYLE[meta.family];
                  const Icon = meta.icon;
                  const isField = ["type", "replace"].includes(step.action);
                  const missing = Boolean(needsControl(step.action) && step.target && !names.includes(step.target));
                  const payload = needsControl(step.action) ? (
                    <ControlPicker
                      entries={catalog}
                      previews={previews}
                      usage={usage}
                      inCase={current.steps.filter((s, j) => j !== i && s.target && needsControl(s.action)).map((s) => s.target!)}
                      preferFields={isField}
                      invalid={missing}
                      value={step.target}
                      onChange={(v) => setStep(i, { ...step, target: v })}
                    />
                  ) : step.action === "press" ? (
                    <input className="input" aria-label="Key" value={step.key ?? "Enter"} placeholder="Enter" onChange={(e) => setStep(i, { ...step, key: e.target.value })} />
                  ) : step.action === "checkpoint" ? (
                    <input
                      className="input"
                      aria-label="Screenshot name"
                      value={step.target ?? ""}
                      placeholder="after-send"
                      onChange={(e) => setStep(i, { ...step, target: e.target.value })}
                    />
                  ) : null;
                  return (
                    <li key={i} className="group flex items-start gap-3 px-3 py-2.5 rounded-xl border border-line bg-canvas">
                      <div className="flex items-center gap-2 pt-0.5 shrink-0">
                        <span className="w-5 text-right text-[11.5px] font-semibold text-faint tabular-nums">{i + 1}</span>
                        <span className={`size-8 rounded-lg grid place-items-center ${fam.tile}`} title={`${fam.label}: ${meta.hint}`}>
                          <Icon className="size-4" strokeWidth={2.2} />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ActionPicker value={step.action} onChange={(a) => setStep(i, stepForAction(a, step, names))} />
                          {payload ? (
                            <>
                              <span className="text-[12.5px] text-muted">{joiner(step.action)}</span>
                              <div className="flex-1 min-w-[180px]">{payload}</div>
                            </>
                          ) : (
                            <span className="text-[12.5px] text-muted truncate">{meta.hint}</span>
                          )}
                        </div>
                        {needsText(step.action) ? (
                          <textarea
                            className="input"
                            rows={step.action === "upload" ? 1 : 2}
                            aria-label={step.action === "upload" ? "File paths" : "Text"}
                            value={step.text ?? ""}
                            placeholder={
                              step.action === "seeAny"
                                ? "Option one | Option two"
                                : step.action === "upload"
                                  ? "test-data/file.txt, one path per line or comma separated"
                                  : `Text to ${step.action === "type" || step.action === "replace" ? "type" : "look for"}. ${TEMPLATE_HINT}`
                            }
                            onChange={(e) => setStep(i, { ...step, text: e.target.value })}
                          />
                        ) : null}
                        {missing ? <p className="m-0 text-[12px] text-danger">This control is not in the catalog any more, so the step will fail.</p> : null}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 pt-0.5 opacity-40 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button type="button" className="icon-btn" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Move down"
                          title="Move down"
                          disabled={i === current.steps.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button type="button" className="icon-btn" aria-label="Insert step below" title="Insert step below" onClick={() => addStep(i + 1)}>
                          <Plus className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn hover:enabled:text-danger"
                          aria-label="Remove step"
                          title="Remove step"
                          disabled={current.steps.length === 1}
                          onClick={() => removeStep(i)}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <button
                type="button"
                className="btn w-full mt-2 border border-dashed border-line text-brand-ink bg-transparent hover:bg-brand-soft hover:border-brand"
                onClick={() => addStep()}
              >
                <Plus className="size-4" />
                Add step
              </button>
            </>
          ) : (
            <EmptyState
              icon={ListChecks}
              title="No case open"
              body="Create a case on the left. New cases start by opening the dashboard and dismissing the Skip prompt."
            />
          )}
        </section>
      </div>
    </>
  );
}
