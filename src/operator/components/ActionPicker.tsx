import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ACTIONS, ACTION_META, FAMILY_STYLE, metaOf, type Action, type ActionFamily } from "../lib/actions";

const FAMILY_ORDER: ActionFamily[] = ["navigate", "act", "assert", "input", "capture", "wait"];

export function ActionPicker(props: { value: string; onChange: (action: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () =>
      FAMILY_ORDER.map((f) => ({ family: f, items: ACTIONS.filter((a) => ACTION_META[a].family === f) })).filter((g) => g.items.length),
    [],
  );
  const flat: Action[] = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const active = flat.find((a) => a === activeAction) ?? flat[0];

  const meta = metaOf(props.value);
  const listId = useMemo(() => `actions-${Math.random().toString(36).slice(2, 8)}`, []);

  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 340;
    const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const flip = below < 320 && above > below;
    const maxHeight = Math.min(560, (flip ? above : below) - 6);
    setPos({ left, top: flip ? r.top - 6 : r.bottom + 6, maxHeight, above: flip });
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
    listRef.current?.querySelector(`[data-action="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open, pos !== null]);

  function show() {
    setActiveAction(props.value);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function choose(action: string) {
    if (action !== props.value) props.onChange(action);
    close();
  }

  function onKey(e: React.KeyboardEvent) {
    const i = active ? flat.indexOf(active) : -1;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveAction(flat[Math.min(flat.length - 1, i + 1)]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveAction(flat[Math.max(0, i - 1)]);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveAction(flat[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveAction(flat[flat.length - 1]);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (active) choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // typeahead: jump to the next action whose label starts with the key
      const k = e.key.toLowerCase();
      const order = [...flat.slice(i + 1), ...flat.slice(0, i + 1)];
      const hit = order.find((a) => ACTION_META[a].label.toLowerCase().startsWith(k));
      if (hit) setActiveAction(hit);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`input w-[200px] flex items-center gap-2 text-left pr-2.5 font-semibold ${open ? "border-brand ring-2 ring-brand/20" : ""}`}
        aria-label="Action"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={meta.hint}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate">{meta.label}</span>
        <ChevronDown className={`size-4 text-faint shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              className="fixed z-40 flex flex-col w-[340px] rounded-2xl border border-line bg-paper shadow-pop overflow-hidden fade-in"
              style={{
                left: pos.left,
                maxHeight: pos.maxHeight,
                ...(pos.above ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
              }}
            >
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                tabIndex={-1}
                aria-label="Action"
                aria-activedescendant={active ? `${listId}-${active}` : undefined}
                className="overflow-auto scrollbar-thin p-1.5 outline-none"
                onKeyDown={onKey}
                onBlur={(e) => {
                  const next = e.relatedTarget as Node | null;
                  if (next && !popRef.current?.contains(next) && !triggerRef.current?.contains(next)) setOpen(false);
                }}
              >
                {groups.map((g) => (
                  <div key={g.family} role="group" aria-label={FAMILY_STYLE[g.family].label} className="mb-1 last:mb-0">
                    <div className="px-2.5 pt-2 pb-1 text-[12px] font-semibold text-muted">{FAMILY_STYLE[g.family].label}</div>
                    {g.items.map((a) => {
                      const m = ACTION_META[a];
                      const ItemIcon = m.icon;
                      const selected = a === props.value;
                      return (
                        <div
                          key={a}
                          id={`${listId}-${a}`}
                          data-action={a}
                          role="option"
                          aria-selected={selected}
                          className={`flex items-center gap-3 px-2 py-1.5 rounded-xl cursor-pointer ${a === active ? "bg-soft" : ""}`}
                          onMouseMove={() => setActiveAction(a)}
                          onClick={() => choose(a)}
                        >
                          <span className={`size-8 rounded-lg grid place-items-center shrink-0 ${FAMILY_STYLE[m.family].tile}`}>
                            <ItemIcon className="size-4" strokeWidth={2.2} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[13.5px] leading-snug ${selected ? "font-semibold text-brand-ink" : "font-medium"}`}>{m.label}</span>
                            <span className="block text-[11.5px] leading-snug text-muted">{m.hint}</span>
                          </span>
                          {selected ? <Check className="size-4 text-brand shrink-0" strokeWidth={2.5} /> : null}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
