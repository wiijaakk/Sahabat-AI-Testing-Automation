import { AlertTriangle, ImageOff, LoaderCircle, Plus, RefreshCw, ScanSearch, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ShotCrop } from "../components/ShotCrop";
import { Chip, PageHeader, SectionTitle, Summary } from "../components/ui";
import { json, jsonBody } from "../lib/api";
import type { BBox, ControlPreview, Harvest, HarvestNode, HarvestScreen, ScanPlan, TestCase, VocabEntry } from "../lib/types";

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

/**
 * The saved entry for this node. An entry only claims the node closest to its
 * box, so neighbouring icons (often under 40px apart) don't share one label.
 */
function labeledAs(node: HarvestNode, nodes: HarvestNode[], entries: VocabEntry[]): VocabEntry | undefined {
  let best: { entry: VocabEntry; dist: number } | undefined;
  for (const e of entries) {
    if (!e.unnamed || !e.bbox) continue;
    const dist = boxCenterDist(e.bbox, node.bbox);
    if (dist >= 40) continue;
    const box = e.bbox;
    if (nodes.some((other) => other.id !== node.id && boxCenterDist(box, other.bbox) < dist)) continue;
    if (!best || dist < best.dist) best = { entry: e, dist };
  }
  return best?.entry;
}

function NoShot(props: { title: string }) {
  return (
    <div className="w-[64px] h-[36px] rounded-md border border-dashed border-line grid place-items-center text-faint shrink-0" title={props.title}>
      <ImageOff className="size-3.5" />
    </div>
  );
}

/** Short label for a screen id when the plan has no title for it. */
function screenTitle(id: string, plan: ScanPlan | null, harvest: Harvest | null): string {
  return plan?.screens.find((s) => s.id === id)?.title ?? harvest?.screens.find((s) => s.id === id)?.title ?? id;
}

function UnnamedPanel(props: {
  harvest: Harvest;
  screen: HarvestScreen;
  entries: VocabEntry[];
  vision: boolean;
  onPin: (node: HarvestNode, name: string, hint?: string) => void;
  onError: (s: string) => void;
}) {
  const unnamed = props.screen.nodes.filter((n) => n.unnamed && n.role === "button");
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
  const screen = harvestSrc(props.harvest, props.screen.screen);
  const hasCrops = unnamed.some((n) => n.crop);

  async function guess(nodeId?: string) {
    setGuessing(nodeId ?? "all");
    try {
      const data = await json<{ guesses: { id: string; name: string; hint?: string; description?: string }[] }>(
        "/api/vision/guess-unnamed",
        jsonBody({ screen: props.screen.id, ...(nodeId ? { nodeId } : {}) }),
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

  return (
    <section className="card p-4 md:p-5 fade-in">
      <SectionTitle
        count={unnamed.length}
        right={
          <button
            type="button"
            className="btn btn-sm btn-soft"
            disabled={!props.vision || guessing !== null || !hasCrops}
            title={!props.vision ? "GEMINI_API_KEY is empty, so guesses are off." : "Ask Gemini to name every unnamed icon from its crop"}
            onClick={() => guess()}
          >
            {guessing === "all" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {guessing === "all" ? "Looking…" : "Ask Gemini"}
          </button>
        }
      >
        Icons without a label on {props.screen.title}
      </SectionTitle>
      <p className="text-[12.5px] text-muted mt-0 mb-3">
        {unnamed.length === 0
          ? "Every control on this screen has a label, so the scan already put them in the catalog."
          : hasCrops
            ? "Cases can't find these by text, so they need a name from you. Click a box on the shot, name it, add it to the catalog. Gemini can guess from the crop if a key is set."
            : "Scan again to get a screenshot of each unnamed control."}
        {!props.vision && unnamed.length > 0 ? " GEMINI_API_KEY is empty, so guesses are off." : ""}
      </p>
      {screen ? (
        <div className="relative mb-4 rounded-xl overflow-hidden border border-line bg-[#111]">
          <img src={screen} alt={props.screen.title} className="block w-full" />
          {unnamed.map((n, i) => (
            <button
              key={n.id}
              type="button"
              className={`absolute p-0 rounded-[3px] border-2 border-brand transition-colors ${
                n.id === selected ? "bg-brand/30 shadow-[0_0_0_2px_white]" : "bg-brand/10 hover:bg-brand/20"
              }`}
              style={{
                left: `${(n.bbox.x / vw) * 100}%`,
                top: `${(n.bbox.y / vh) * 100}%`,
                width: `${(n.bbox.width / vw) * 100}%`,
                height: `${(n.bbox.height / vh) * 100}%`,
              }}
              onClick={() => setSelected(n.id)}
              title={`#${i + 1}`}
            >
              <b className="absolute -top-2.5 -left-2.5 size-[18px] rounded-full bg-brand text-white text-[10px] grid place-items-center">
                {i + 1}
              </b>
            </button>
          ))}
        </div>
      ) : null}
      {unnamed.length > 0 ? (
        <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {unnamed.map((n, i) => {
            const crop = harvestSrc(props.harvest, n.crop);
            const saved = labeledAs(n, unnamed, props.entries);
            const focused = n.id === selected;
            return (
              <article
                key={n.id}
                className={`rounded-xl overflow-hidden border bg-canvas cursor-pointer transition-colors ${
                  focused ? "border-brand" : "border-line hover:border-line-strong"
                }`}
                onClick={() => setSelected(n.id)}
              >
                {crop ? (
                  <img src={crop} alt={`unnamed ${i + 1}`} className="block w-full h-[110px] object-contain bg-brand-soft" />
                ) : (
                  <div className="grid place-items-center h-[110px] text-[12px] text-muted bg-brand-soft">no crop</div>
                )}
                <div className="p-2.5 grid gap-2 text-[12px]">
                  <div className="flex items-center gap-1.5 text-muted">
                    <b className="text-ink">#{i + 1}</b>
                    <span>{n.role ?? "?"}</span>
                    <span>·</span>
                    <span>{n.hint ?? "?"}</span>
                    <span className="ml-auto text-[11px] text-faint tabular-nums">
                      {Math.round(n.bbox.x)},{Math.round(n.bbox.y)}
                    </span>
                  </div>
                  {notes[n.id] ? <div className="text-[12px] text-muted">{notes[n.id]}</div> : null}
                  {saved ? (
                    <Chip tone="ok">In catalog as {saved.name}</Chip>
                  ) : (
                    <>
                      <input
                        className="input input-sm"
                        placeholder="Name it"
                        value={draft[n.id] ?? ""}
                        onChange={(e) => setDraft({ ...draft, [n.id]: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex gap-1.5">
                        <select
                          className="input input-sm flex-1"
                          value={hintDraft[n.id] ?? ""}
                          onChange={(e) => setHintDraft({ ...hintDraft, [n.id]: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="">Where on screen</option>
                          {HINTS.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          disabled={guessing !== null || !props.vision || !n.crop}
                          title="Ask Gemini about this icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            guess(n.id);
                          }}
                        >
                          {guessing === n.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={!(draft[n.id] ?? "").trim()}
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onPin(n, draft[n.id] ?? "", hintDraft[n.id] || n.hint);
                          }}
                        >
                          <Plus className="size-3.5" />
                          Add
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/** Page and state of a scanned screen. Old harvests only have the "Page · State" title. */
function pageOf(s: HarvestScreen): string {
  return s.page ?? s.title.split(" · ")[0];
}
function stateOf(s: HarvestScreen): string {
  if (s.state) return s.state;
  const rest = s.title.split(" · ").slice(1).join(" · ");
  return rest || "Page";
}

/** One tab per product page; the states of that page (tabs, open items, dialogs, menus) sit in a picker under it. */
function ScreenPicker(props: {
  screens: HarvestScreen[];
  selected: HarvestScreen | null;
  onSelect: (id: string) => void;
  onRescan: (id: string) => void;
  canScan: boolean;
}) {
  const pages: { name: string; screens: HarvestScreen[] }[] = [];
  for (const s of props.screens) {
    const name = pageOf(s);
    const page = pages.find((p) => p.name === name);
    if (page) page.screens.push(s);
    else pages.push({ name, screens: [s] });
  }
  const currentPage = props.selected ? pageOf(props.selected) : null;
  const states = pages.find((p) => p.name === currentPage)?.screens ?? [];
  const sel = props.selected;
  const skippedHere = sel?.status === "skipped";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Scanned pages">
        {pages.map((p) => {
          const active = p.name === currentPage;
          const ok = p.screens.filter((s) => s.status === "ok").length;
          const skipped = p.screens.length - ok;
          const first = p.screens.find((s) => s.status === "ok") ?? p.screens[0];
          return (
            <button
              key={p.name}
              type="button"
              role="tab"
              aria-selected={active}
              title={skipped ? `${ok} of ${p.screens.length} states scanned, ${skipped} skipped` : `${p.screens.length} state${p.screens.length === 1 ? "" : "s"} scanned`}
              className={`btn btn-sm ${active ? "btn-primary" : "btn-soft"}`}
              onClick={() => props.onSelect(active ? (sel?.id ?? first.id) : first.id)}
            >
              {p.name}
              {p.screens.length > 1 ? (
                <span className={`tabular-nums ${active ? "opacity-80" : "text-muted"}`}>
                  {ok}/{p.screens.length}
                </span>
              ) : null}
              {skipped > 0 ? <AlertTriangle className={`size-3.5 ${active ? "" : "text-warn"}`} /> : null}
            </button>
          );
        })}
      </div>

      {sel ? (
        <div className="flex flex-wrap items-center gap-2">
          {states.length > 1 ? (
            <label className="flex items-center gap-2 text-[13px] text-muted">
              State
              <select className="input input-sm w-auto min-w-[220px]" value={sel.id} onChange={(e) => props.onSelect(e.target.value)} aria-label={`${currentPage} state`}>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {stateOf(s)}
                    {s.status === "skipped" ? " · skipped" : ` · ${s.nodes.length} controls`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-[13px] text-muted tabular-nums">
              {sel.status === "ok" ? `${sel.nodes.length} controls` : "skipped"}
            </span>
          )}
          {skippedHere ? (
            <span className="inline-flex items-center gap-1 text-[13px] text-warn" title={sel.reason}>
              <AlertTriangle className="size-3.5" /> Skipped
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-soft"
            title={`Rescan only ${sel.title}`}
            disabled={!props.canScan}
            onClick={() => props.onRescan(sel.id)}
          >
            <RefreshCw className="size-3.5" />
            Rescan this state
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CatalogView(props: {
  running: boolean;
  busy: string | null;
  vision: boolean;
  onScan: (screens?: string[]) => void;
  onError: (s: string) => void;
  onCountChange: (n: number) => void;
  scanJob: { status: string } | null;
}) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [screenId, setScreenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [previews, setPreviews] = useState<Record<string, ControlPreview>>({});
  const [onlyHere, setOnlyHere] = useState(false);

  async function load() {
    const cat = await json<{ entries: VocabEntry[] }>("/api/catalog");
    setEntries(cat.entries);
    props.onCountChange(cat.entries.length);
    const h = await json<{ harvest: Harvest | null }>("/api/harvest");
    setHarvest(h.harvest);
    const c = await json<{ cases: TestCase[] }>("/api/cases");
    setCases(c.cases);
    try {
      const p = await json<{ plan: ScanPlan }>("/api/scan-plan");
      setPlan(p.plan);
    } catch {
      setPlan(null);
    }
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

  // previews walk every run manifest, so fetch them when the catalog or scan changes, not on the 2s poll
  const entryKey = entries.map((e) => e.name).join("\n");
  useEffect(() => {
    json<{ previews: Record<string, ControlPreview> }>("/api/catalog/previews")
      .then((r) => setPreviews(r.previews))
      .catch(() => {});
  }, [entryKey, harvest?.at]);

  const screens = harvest?.screens ?? [];
  const screen = screens.find((s) => s.id === screenId) ?? screens.find((s) => s.status === "ok") ?? screens[0] ?? null;
  const skipped = screens.filter((s) => s.status === "skipped");

  async function save(next: VocabEntry[]) {
    const data = await json<{ entries: VocabEntry[] }>("/api/catalog", jsonBody({ entries: next }, "PUT"));
    setEntries(data.entries);
    props.onCountChange(data.entries.length);
  }

  function pin(node: HarvestNode, name = node.name, hint = node.hint) {
    const n = name.trim();
    if (!n) return;
    const prev = entries.find((e) => e.name.toLowerCase() === n.toLowerCase());
    const onScreen = screen && node.id !== "manual" ? [screen.id] : [];
    const screensTag = [...new Set([...(prev?.screens ?? []), ...onScreen])];
    const entry: VocabEntry = {
      name: n,
      text: node.name ? [node.name] : [n],
      role: node.role === "textbox" ? "textbox" : "button",
      unnamed: node.unnamed || !node.name,
      hint: hint || undefined,
      bbox: node.unnamed ? node.bbox : undefined,
      screens: screensTag.length ? screensTag : undefined,
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
      { id: "manual", role: "button", name: text[0] ?? name, unnamed: false, bbox: { x: 0, y: 0, width: 0, height: 0 } },
      name,
    );
    setNewName("");
    setNewAliases("");
    setAdding(false);
  }

  const scanning = props.busy === "scan" || (props.running && props.scanJob?.status === "running");
  const canScan = !props.running && props.busy === null;
  const q = filter.trim().toLowerCase();
  const here = onlyHere && screen ? screen.id : null;
  const pool = here ? entries.filter((e) => e.screens?.includes(here)) : entries;
  const shown = q
    ? pool.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.text.some((t) => t.toLowerCase().includes(q)) ||
          (e.hint ?? "").includes(q) ||
          (e.screens ?? []).some((id) => id.includes(q) || screenTitle(id, plan, harvest).toLowerCase().includes(q)),
      )
    : pool;
  const iconCount = entries.filter((e) => e.unnamed).length;
  const fieldCount = entries.filter((e) => e.role === "textbox").length;
  const okCount = screens.filter((s) => s.status === "ok").length;

  return (
    <>
      <PageHeader
        title="Catalog"
        lede="The names your test cases use to tap, see and type. A scan walks every screen and adds each labeled control it finds. Icons without a label need a name from you."
        summary={
          <Summary
            items={[
              `${entries.length} controls`,
              `${iconCount} icons`,
              `${fieldCount} fields`,
              scanning
                ? { text: `Scanning ${plan?.screens.length ?? ""} screens, a few minutes`, tone: "running" }
                : harvest
                  ? `Last scan ${new Date(harvest.at).toLocaleString()}, ${okCount} of ${screens.length} screens`
                  : "No scan yet",
              !scanning && skipped.length > 0 ? { text: `${skipped.length} skipped`, tone: "warn" } : null,
            ]}
          />
        }
        actions={
          <button type="button" className="btn btn-primary" disabled={!canScan} onClick={() => props.onScan()}>
            {scanning ? <LoaderCircle className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {scanning ? "Scanning…" : "Scan screens"}
          </button>
        }
      />

      <div className="grid gap-4">
        {screens.length > 0 ? (
          <ScreenPicker screens={screens} selected={screen ?? null} onSelect={setScreenId} onRescan={(id) => props.onScan([id])} canScan={canScan} />
        ) : null}

        {screen?.status === "skipped" ? (
          <section className="card p-4 md:p-5 border-warn-line bg-warn-soft fade-in">
            <SectionTitle>Skipped: {screen.title}</SectionTitle>
            <p className="text-[13px] mt-0 mb-2">{screen.reason ?? "The scan could not reach this screen."}</p>
            {screen.needs ? (
              <p className="text-[12.5px] text-muted m-0">
                <b className="text-ink">Needs:</b> {screen.needs} See “Scan account setup” in the README, then rescan this screen.
              </p>
            ) : null}
          </section>
        ) : null}

        {harvest && screen && screen.status === "ok" ? (
          <UnnamedPanel key={`${harvest.at}:${screen.id}`} harvest={harvest} screen={screen} entries={entries} vision={props.vision} onPin={pin} onError={props.onError} />
        ) : null}

          <section className="card p-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
              <h3 className="text-[13px] font-bold tracking-[-0.01em] mr-auto">
                Catalog{" "}
                <span className="text-muted font-semibold">{shown.length === entries.length ? entries.length : `${shown.length} of ${entries.length}`}</span>
                <span className="block text-[12px] font-normal text-muted mt-0.5">
                  Every name your cases can use. Each scan adds the labeled controls it finds.
                </span>
              </h3>
              {screen ? (
                <div className="flex rounded-lg border border-line p-0.5 text-[12px]" role="radiogroup" aria-label="Which controls">
                  <button type="button" role="radio" aria-checked={!onlyHere} className={`px-2.5 py-1 rounded-md ${!onlyHere ? "bg-brand-soft text-brand-ink font-semibold" : "text-muted"}`} onClick={() => setOnlyHere(false)}>
                    All screens
                  </button>
                  <button type="button" role="radio" aria-checked={onlyHere} className={`px-2.5 py-1 rounded-md ${onlyHere ? "bg-brand-soft text-brand-ink font-semibold" : "text-muted"}`} onClick={() => setOnlyHere(true)}>
                    On {screen.title}
                  </button>
                </div>
              ) : null}
              <label className="relative block w-[220px] max-w-full">
                <Search className="size-3.5 text-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input className="input input-sm pl-8" placeholder="Filter by name, alias or screen" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </label>
              <button type="button" className={`btn btn-sm ${adding ? "btn-ghost" : "btn-soft"}`} onClick={() => setAdding((a) => !a)}>
                <Plus className="size-3.5" />
                Add by text
              </button>
            </div>

            {adding ? (
              <form
                className="flex flex-wrap items-center gap-2 px-4 py-3 bg-canvas border-b border-line fade-in"
                onSubmit={(e) => {
                  e.preventDefault();
                  addManual();
                }}
              >
                <input className="input input-sm w-[200px]" autoFocus placeholder="Name you will use in cases" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input
                  className="input input-sm flex-1 min-w-[220px]"
                  placeholder="Text as shown on screen, comma separated if it varies"
                  value={newAliases}
                  onChange={(e) => setNewAliases(e.target.value)}
                />
                <button type="submit" className="btn btn-sm btn-primary" disabled={!newName.trim()}>
                  Save
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </form>
            ) : null}

            <div className="max-h-[70vh] overflow-auto scrollbar-thin">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-paper z-10">
                  <tr className="text-left text-[12px] text-muted font-medium">
                    <th className="pl-4 pr-1 py-2 font-medium border-b border-line w-[80px]">Looks like</th>
                    <th className="px-3 py-2 font-medium border-b border-line w-[24%]">Name</th>
                    <th className="px-3 py-2 font-medium border-b border-line">Matches text</th>
                    <th className="px-3 py-2 font-medium border-b border-line w-[26%]">Seen on</th>
                    <th className="px-3 py-2 font-medium border-b border-line w-[88px] text-right">Used in</th>
                    <th className="px-2 py-2 border-b border-line w-[44px]" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => {
                    const users = usedIn(e.name);
                    const tags = e.screens ?? [];
                    return (
                      <tr key={e.name} className="group row-hover border-b border-line last:border-b-0">
                        <td className="pl-4 pr-1 py-2 align-middle">
                          {previews[e.name] ? (
                            <button
                              type="button"
                              className="block p-0 rounded-md"
                              title={previews[e.name].screen ? `Show ${screenTitle(previews[e.name].screen!, plan, harvest)}` : "Seen in a run"}
                              onClick={() => previews[e.name].screen && setScreenId(previews[e.name].screen!)}
                            >
                              <ShotCrop preview={previews[e.name]} width={64} height={36} mode="zoom" className="rounded-md border border-line" />
                            </button>
                          ) : (
                            <NoShot title="No scan or run has found this control yet" />
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-semibold truncate">{e.name}</span>
                            {e.unnamed ? <Chip tone="brand">icon</Chip> : null}
                            {e.role === "textbox" ? <Chip tone="input">field</Chip> : null}
                          </div>
                          {e.hint ? <div className="text-[11px] text-muted">{e.hint}</div> : null}
                        </td>
                        <td className="px-3 py-2 align-middle text-muted max-w-[260px]">
                          <span className="block truncate" title={e.text.join(", ")}>
                            {e.text.join(", ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {tags.length === 0 ? (
                            <span className="text-[11.5px] text-faint" title="Added by hand and no scan has found it yet">not found by a scan yet</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {tags.slice(0, 2).map((id) => (
                                <button
                                  key={id}
                                  type="button"
                                  className="chip chip-neutral cursor-pointer hover:bg-brand-soft"
                                  title={`Show ${screenTitle(id, plan, harvest)}`}
                                  onClick={() => setScreenId(id)}
                                >
                                  {screenTitle(id, plan, harvest)}
                                </button>
                              ))}
                              {tags.length > 2 ? (
                                <span className="chip chip-neutral" title={tags.slice(2).map((id) => screenTitle(id, plan, harvest)).join("\n")}>
                                  +{tags.length - 2}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-right tabular-nums text-muted" title={users.join(", ")}>
                          {users.length > 0 ? `${users.length} case${users.length === 1 ? "" : "s"}` : ""}
                        </td>
                        <td className="px-2 py-1.5 align-middle">
                          <button
                            type="button"
                            className="icon-btn opacity-50 group-hover:opacity-100 hover:enabled:text-danger"
                            title="Remove from catalog"
                            aria-label={`Remove ${e.name}`}
                            onClick={() => remove(e.name)}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {shown.length === 0 ? (
                <p className="text-[12.5px] text-muted px-4 py-6 text-center">
                  {q ? `Nothing matches “${filter}”.` : here ? `Nothing in the catalog was seen on ${screen?.title}.` : "The catalog is empty. Scan to fill it."}
                </p>
              ) : null}
            </div>
          </section>
      </div>
    </>
  );
}
