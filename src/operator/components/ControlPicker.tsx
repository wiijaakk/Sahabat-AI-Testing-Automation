import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, ImageOff, MousePointerClick, Search, SquareDashedMousePointer, TextCursorInput } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { runWhen } from "../lib/actions";
import type { ControlPreview, VocabEntry } from "../lib/types";
import { ShotCrop } from "./ShotCrop";

/** Case id prefix → the product area those cases live in, so unhinted controls still group sensibly. */
const AREA_BY_PREFIX: Record<string, string> = {
  as: "AI Storage",
  lb: "Library",
  pf: "Profile and plans",
};

const HINT_AREA: Record<string, string> = {
  sidebar: "Sidebar",
  header: "Header",
  composer: "Chat composer",
  banner: "Banners",
  footer: "Footer",
};

export type ControlUsage = Record<string, string[]>;

function kindOf(e: VocabEntry): { label: string; icon: LucideIcon } {
  if (e.role === "textbox") return { label: "Text field", icon: TextCursorInput };
  if (e.unnamed) return { label: "Icon button, no label", icon: SquareDashedMousePointer };
  return { label: "Button", icon: MousePointerClick };
}

/** Scan plan screen id prefix → product area, so a scanned control groups by where it lives. */
const SCREEN_AREA: [string, string][] = [
  ["library", "Library"],
  ["aistorage", "AI Storage"],
  ["new-chat", "Chat"],
  ["dashboard", "Dashboard"],
];

function areaOf(e: VocabEntry, usedIn: string[]): string {
  if (e.hint && HINT_AREA[e.hint]) return HINT_AREA[e.hint];
  // the page-specific screen wins over the dashboard, which every nav button is on too
  for (const [prefix, area] of SCREEN_AREA) {
    if (e.screens?.some((id) => id.startsWith(prefix))) return area;
  }
  const counts = new Map<string, number>();
  for (const id of usedIn) {
    const area = AREA_BY_PREFIX[id.split("-")[0]];
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  return usedIn.length ? "Other screens" : "Not used by any case yet";
}

const AREA_ORDER = ["Sidebar", "Header", "Chat composer", "Chat", "Library", "AI Storage", "Dashboard", "Profile and plans", "Banners", "Footer", "Other screens", "Not used by any case yet"];

type Group = { title: string; items: VocabEntry[] };

function Thumb(props: { entry: VocabEntry; preview?: ControlPreview }) {
  if (props.preview) {
    return <ShotCrop preview={props.preview} width={64} height={36} mode="zoom" className="rounded-md border border-line shrink-0" />;
  }
  const Icon = kindOf(props.entry).icon;
  return (
    <span className="w-16 h-9 shrink-0 rounded-md border border-dashed border-line grid place-items-center text-faint">
      <Icon className="size-4" />
    </span>
  );
}

function Detail(props: { entry: VocabEntry; preview?: ControlPreview; usedIn: string[] }) {
  const { entry, preview } = props;
  const aliases = entry.text.filter((t) => t !== entry.name);
  return (
    <div className="p-3.5 grid gap-3 content-start">
      {preview ? (
        <ShotCrop preview={preview} width={292} height={132} mode="zoom" className="rounded-xl border border-line" />
      ) : (
        <div className="w-[292px] h-[132px] rounded-xl border border-dashed border-line grid place-items-center text-center px-6">
          <div className="grid justify-items-center gap-1.5">
            <ImageOff className="size-5 text-faint" />
            <span className="text-[12px] text-muted leading-snug">No screenshot yet. One appears after a run taps this control or a scan finds it.</span>
          </div>
        </div>
      )}
      <div>
        <div className="text-[15px] font-bold leading-snug">{entry.name}</div>
        <div className="text-[12.5px] text-muted mt-0.5">
          {kindOf(entry).label}
          {entry.hint ? ` in the ${HINT_AREA[entry.hint]?.toLowerCase() ?? entry.hint}` : ""}
        </div>
      </div>
      {preview ? (
        <div className="grid gap-1.5">
          <ShotCrop preview={preview} width={292} mode="whole" className="rounded-lg border border-line" />
          <span className="text-[11.5px] text-muted">
            {preview.from === "run" && preview.runId ? `Seen in ${runWhen(preview.runId)} run` : "Seen in the last scan"}
          </span>
        </div>
      ) : null}
      <dl className="m-0 grid gap-2 text-[12.5px]">
        {aliases.length ? (
          <div>
            <dt className="text-muted">Also matches</dt>
            <dd className="m-0 text-ink">{aliases.map((a) => `“${a}”`).join(", ")}</dd>
          </div>
        ) : null}
        {entry.expectPath ? (
          <div>
            <dt className="text-muted">After tapping</dt>
            <dd className="m-0 text-ink">The address should contain {entry.expectPath}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted">Used in</dt>
          <dd className="m-0 text-ink">{props.usedIn.length ? props.usedIn.join(", ") : "No case yet"}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ControlPicker(props: {
  entries: VocabEntry[];
  previews: Record<string, ControlPreview>;
  usage: ControlUsage;
  /** Controls the open case already points at, listed first because cases reuse them. */
  inCase: string[];
  value?: string;
  /** Type / Replace want a text field, so fields go first. */
  preferFields?: boolean;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeName, setActiveName] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const current = props.entries.find((e) => e.name === props.value);
  const unknown = props.value && !current ? props.value : null;

  const groups: Group[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (e: VocabEntry) => !q || e.name.toLowerCase().includes(q) || e.text.some((t) => t.toLowerCase().includes(q));
    const pool = props.entries.filter(match);
    const out: Group[] = [];
    const taken = new Set<string>();
    const push = (title: string, items: VocabEntry[]) => {
      const fresh = items.filter((e) => !taken.has(e.name));
      fresh.forEach((e) => taken.add(e.name));
      if (fresh.length) out.push({ title, items: fresh });
    };
    if (props.preferFields) push("Text fields", pool.filter((e) => e.role === "textbox"));
    if (!q) push("Used in this case", pool.filter((e) => props.inCase.includes(e.name)));
    const byArea = new Map<string, VocabEntry[]>();
    for (const e of pool) {
      const area = areaOf(e, props.usage[e.name] ?? []);
      byArea.set(area, [...(byArea.get(area) ?? []), e]);
    }
    const areas = [...byArea.keys()].sort((a, b) => (AREA_ORDER.indexOf(a) + 1 || 99) - (AREA_ORDER.indexOf(b) + 1 || 99));
    for (const a of areas) push(a, byArea.get(a)!);
    return out;
  }, [props.entries, props.inCase, props.usage, props.preferFields, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const active = flat.find((e) => e.name === activeName) ?? flat[0];

  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(680, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < 360 && above > below;
    const maxHeight = Math.min(520, (flip ? above : below) - 6);
    setPos({ left, top: flip ? r.top - 6 : r.bottom + 6, width, maxHeight, above: flip });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open || !active) return;
    listRef.current?.querySelector(`[data-name="${CSS.escape(active.name)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active?.name, open]);

  function show() {
    setQuery("");
    setActiveName(props.value ?? null);
    setOpen(true);
  }

  function choose(name: string) {
    props.onChange(name);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    const i = active ? flat.indexOf(active) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveName(flat[Math.min(flat.length - 1, i + 1)]?.name ?? null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveName(flat[Math.max(0, i - 1)]?.name ?? null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active) choose(active.name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const preview = current ? props.previews[current.name] : undefined;
  const listId = useMemo(() => `controls-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`input flex items-center gap-2.5 text-left pl-1.5 pr-2.5 ${props.invalid ? "border-danger text-danger" : ""} ${open ? "border-brand ring-2 ring-brand/20" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            show();
          }
        }}
      >
        {preview ? (
          <ShotCrop preview={preview} width={44} height={26} mode="zoom" className="rounded-[7px] border border-line shrink-0" />
        ) : (
          <span className="w-11 h-[26px] rounded-[7px] bg-soft grid place-items-center text-faint shrink-0">
            {current ? (() => {
              const Icon = kindOf(current).icon;
              return <Icon className="size-3.5" />;
            })() : <MousePointerClick className="size-3.5" />}
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate ${current || unknown ? "font-medium" : "text-faint"}`}>
          {current ? current.name : unknown ? `${unknown} (not in catalog)` : props.entries.length ? "Pick a control" : "No catalog names yet"}
        </span>
        <ChevronDown className="size-4 text-faint shrink-0" />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              className="fixed z-40 flex flex-col rounded-2xl border border-line bg-paper shadow-pop overflow-hidden fade-in"
              style={{
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
                ...(pos.above ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
              }}
            >
              <div className="flex items-center gap-2 px-3.5 h-12 border-b border-line shrink-0">
                <Search className="size-4 text-faint shrink-0" />
                <input
                  autoFocus
                  className="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-[14px] placeholder:text-faint"
                  placeholder={`Search ${props.entries.length} controls by name or on-screen text`}
                  value={query}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={active ? `${listId}-${flat.indexOf(active)}` : undefined}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveName(null);
                  }}
                  onKeyDown={onKey}
                />
                <span className="text-[11.5px] text-faint shrink-0 hidden sm:inline">↑↓ to move, Enter to pick</span>
              </div>
              <div className="flex min-h-0 flex-1">
                <div ref={listRef} id={listId} role="listbox" className="flex-1 min-w-0 overflow-auto scrollbar-thin p-1.5">
                  {flat.length === 0 ? (
                    <p className="m-0 px-3 py-6 text-center text-[13px] text-muted">
                      Nothing matches “{query}”. Pin it on the Catalog page first.
                    </p>
                  ) : null}
                  {groups.map((g) => (
                    <div key={g.title} role="group" aria-label={g.title} className="mb-1">
                      <div className="px-2.5 pt-2 pb-1 text-[12px] font-semibold text-muted">{g.title}</div>
                      {g.items.map((e) => {
                        const idx = flat.indexOf(e);
                        const isActive = e === active;
                        const selected = e.name === props.value;
                        return (
                          <div
                            key={e.name}
                            id={`${listId}-${idx}`}
                            data-name={e.name}
                            role="option"
                            aria-selected={selected}
                            className={`flex items-center gap-3 px-2 py-1.5 rounded-xl cursor-pointer ${isActive ? "bg-soft" : ""}`}
                            onMouseMove={() => setActiveName(e.name)}
                            onClick={() => choose(e.name)}
                          >
                            <Thumb entry={e} preview={props.previews[e.name]} />
                            <span className="min-w-0 flex-1">
                              <span className={`block text-[13.5px] leading-snug truncate ${selected ? "font-semibold text-brand-ink" : "font-medium"}`}>{e.name}</span>
                              <span className="block text-[11.5px] text-muted truncate">
                                {kindOf(e).label}
                                {(props.usage[e.name]?.length ?? 0) > 0 ? ` · ${props.usage[e.name].length} ${props.usage[e.name].length === 1 ? "case" : "cases"}` : ""}
                              </span>
                            </span>
                            {selected ? <Check className="size-4 text-brand-ink shrink-0" /> : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {active && pos.width >= 600 ? (
                  <div className="w-[320px] shrink-0 border-l border-line overflow-auto scrollbar-thin bg-canvas">
                    <Detail entry={active} preview={props.previews[active.name]} usedIn={props.usage[active.name] ?? []} />
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
