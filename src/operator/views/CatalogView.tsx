import { LoaderCircle, Pin, Plus, ScanSearch, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Chip, EmptyState, PageHeader, SectionTitle, Summary } from "../components/ui";
import { json, jsonBody } from "../lib/api";
import type { BBox, Harvest, HarvestNode, TestCase, VocabEntry } from "../lib/types";

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
        jsonBody(nodeId ? { nodeId } : {}),
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
        Unnamed icons
      </SectionTitle>
      <p className="text-[12.5px] text-muted mt-0 mb-3">
        {hasCrops
          ? "Click a box on the shot, name it, pin it. Gemini can guess from the crop if a key is set."
          : "Scan again to get a screenshot of each unnamed control."}
        {!props.vision ? " GEMINI_API_KEY is empty, so guesses are off." : ""}
      </p>
      {screen ? (
        <div className="relative mb-4 rounded-xl overflow-hidden border border-line bg-[#111]">
          <img src={screen} alt="current screen" className="block w-full" />
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
      <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
        {unnamed.map((n, i) => {
          const crop = harvestSrc(props.harvest, n.crop);
          const saved = labeledAs(n, props.entries);
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
                  <Chip tone="ok">Saved as {saved.name}</Chip>
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
                        <Pin className="size-3.5" />
                        Pin
                      </button>
                    </div>
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

export function CatalogView(props: {
  running: boolean;
  busy: string | null;
  vision: boolean;
  onScan: () => void;
  onError: (s: string) => void;
  onCountChange: (n: number) => void;
  scanJob: { status: string } | null;
}) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [harvest, setHarvest] = useState<Harvest | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    const cat = await json<{ entries: VocabEntry[] }>("/api/catalog");
    setEntries(cat.entries);
    props.onCountChange(cat.entries.length);
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
    const data = await json<{ entries: VocabEntry[] }>("/api/catalog", jsonBody({ entries: next }, "PUT"));
    setEntries(data.entries);
    props.onCountChange(data.entries.length);
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
      { id: "manual", role: "button", name: text[0] ?? name, unnamed: false, bbox: { x: 0, y: 0, width: 0, height: 0 } },
      name,
    );
    setNewName("");
    setNewAliases("");
    setAdding(false);
  }

  const savedNames = useMemo(() => new Set(entries.map((e) => e.name.toLowerCase())), [entries]);
  const named = (harvest?.nodes ?? []).filter((n) => !n.unnamed);
  const scanning = props.busy === "scan" || (props.running && props.scanJob?.status === "running");
  const q = filter.trim().toLowerCase();
  const shown = q
    ? entries.filter(
        (e) => e.name.toLowerCase().includes(q) || e.text.some((t) => t.toLowerCase().includes(q)) || (e.hint ?? "").includes(q),
      )
    : entries;
  const iconCount = entries.filter((e) => e.unnamed).length;
  const fieldCount = entries.filter((e) => e.role === "textbox").length;

  return (
    <>
      <PageHeader
        title="Catalog"
        lede="Names the runner can tap, see and type into. Named controls pin as-is; unnamed icons need a screenshot first so you can tell send from mic."
        summary={
          <Summary
            items={[
              `${entries.length} controls`,
              `${iconCount} icons`,
              `${fieldCount} fields`,
              scanning
                ? { text: "Scanning, about 20 seconds", tone: "running" }
                : harvest
                  ? `Last scan ${new Date(harvest.at).toLocaleString()}, ${harvest.nodes.length} controls on ${harvest.url}`
                  : "No scan yet",
            ]}
          />
        }
        actions={
          <button type="button" className="btn btn-primary" disabled={props.running || props.busy !== null} onClick={props.onScan}>
            {scanning ? <LoaderCircle className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
            {scanning ? "Scanning…" : "Scan screen"}
          </button>
        }
      />

      <div className="grid gap-4">
        {harvest ? (
          <UnnamedPanel key={harvest.at} harvest={harvest} entries={entries} vision={props.vision} onPin={pin} onError={props.onError} />
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(280px,2fr)_minmax(0,3fr)] items-start">
          <section className="card p-4 md:p-5">
            <SectionTitle count={harvest ? named.length : undefined}>Named on this screen</SectionTitle>
            {named.length === 0 ? (
              <EmptyState
                compact
                icon={ScanSearch}
                title={harvest ? "Nothing with a label on this screen" : "No scan yet"}
                body={
                  harvest
                    ? "Flutter exposed no named controls. Try scanning from a different page."
                    : "Scan the screen to list the controls Flutter exposes on the dashboard right now."
                }
                action={
                  !harvest ? (
                    <button type="button" className="btn btn-sm btn-primary" disabled={props.running || props.busy !== null} onClick={props.onScan}>
                      <ScanSearch className="size-3.5" />
                      Scan screen
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="rows m-0 p-0 list-none -mx-2">
                {named.map((n) => {
                  const already = savedNames.has(n.name.toLowerCase());
                  return (
                    <li key={n.id} className="row-hover flex items-center justify-between gap-3 px-2 py-2 rounded-lg">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{n.name}</div>
                        <div className="text-[11.5px] text-muted truncate">
                          {n.role ?? "?"} · {n.hint ?? "?"} · {Math.round(n.bbox.x)},{Math.round(n.bbox.y)}
                        </div>
                      </div>
                      <button type="button" className={`btn btn-sm ${already ? "btn-ghost" : "btn-soft"}`} disabled={already} onClick={() => pin(n)}>
                        {already ? "Saved" : <><Pin className="size-3.5" />Pin</>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-0 overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
              <h3 className="text-[13px] font-bold tracking-[-0.01em] mr-auto">
                Saved controls{" "}
                <span className="text-muted font-semibold">{shown.length === entries.length ? entries.length : `${shown.length} of ${entries.length}`}</span>
              </h3>
              <label className="relative block w-[220px] max-w-full">
                <Search className="size-3.5 text-faint absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input className="input input-sm pl-8" placeholder="Filter by name or alias" value={filter} onChange={(e) => setFilter(e.target.value)} />
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
                    <th className="px-4 py-2 font-medium border-b border-line w-[30%]">Name</th>
                    <th className="px-3 py-2 font-medium border-b border-line">On screen as</th>
                    <th className="px-3 py-2 font-medium border-b border-line w-[96px]">Area</th>
                    <th className="px-3 py-2 font-medium border-b border-line w-[88px] text-right">Used in</th>
                    <th className="px-2 py-2 border-b border-line w-[44px]" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => {
                    const users = usedIn(e.name);
                    return (
                      <tr key={e.name} className="group row-hover border-b border-line last:border-b-0">
                        <td className="px-4 py-2 align-middle">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="font-semibold truncate">{e.name}</span>
                            {e.unnamed ? <Chip tone="brand">icon</Chip> : null}
                            {e.role === "textbox" ? <Chip tone="input">field</Chip> : null}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle text-muted max-w-[320px]">
                          <span className="block truncate" title={e.text.join(", ")}>
                            {e.text.join(", ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle text-muted">{e.hint ?? ""}</td>
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
              {shown.length === 0 ? <p className="text-[12.5px] text-muted px-4 py-6 text-center">{q ? `Nothing matches “${filter}”.` : "No controls saved yet."}</p> : null}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
