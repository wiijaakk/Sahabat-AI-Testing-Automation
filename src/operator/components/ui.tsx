import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CircleCheck, CircleDashed, CircleX, Info, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader(props: { title: string; lede?: ReactNode; actions?: ReactNode; summary?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-5">
      <div className="min-w-0">
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em] leading-tight">{props.title}</h2>
        {props.lede ? <p className="mt-1 text-[13.5px] text-muted max-w-[62ch]">{props.lede}</p> : null}
        {props.summary ? <div className="mt-2">{props.summary}</div> : null}
      </div>
      {props.actions ? <div className="flex items-center gap-2 shrink-0">{props.actions}</div> : null}
    </header>
  );
}

/** One quiet sentence of facts, separated by middle dots. Status items get a small dot in their colour. */
export function Summary(props: { items: (ReactNode | { text: ReactNode; tone: "ok" | "bad" | "running" | "warn" } | null | false)[] }) {
  const items = props.items.filter(Boolean) as (ReactNode | { text: ReactNode; tone: string })[];
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted">
      {items.map((it, i) => {
        const obj = it && typeof it === "object" && "tone" in (it as object) ? (it as { text: ReactNode; tone: string }) : null;
        const dot =
          obj?.tone === "ok" ? "bg-ok" : obj?.tone === "bad" ? "bg-danger" : obj?.tone === "running" ? "bg-brand pulse-soft" : obj?.tone === "warn" ? "bg-warn" : null;
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 ? <span className="text-faint mr-1.5">·</span> : null}
            {dot ? <span className={`dot ${dot}`} /> : null}
            <span className={obj ? "text-ink font-medium" : ""}>{obj ? obj.text : (it as ReactNode)}</span>
          </span>
        );
      })}
    </p>
  );
}

export function Banner(props: {
  tone: "bad" | "warn" | "info";
  children: ReactNode;
  onDismiss?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  const tone =
    props.tone === "bad"
      ? "bg-danger-soft border-danger-line text-danger"
      : props.tone === "warn"
        ? "bg-warn-soft border-warn-line text-warn"
        : "bg-brand-soft border-brand-tint text-brand-ink";
  const Icon = props.tone === "info" ? Info : AlertTriangle;
  return (
    <div
      role={props.tone === "bad" ? "alert" : "status"}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-[13px] fade-in ${tone} ${props.className ?? ""}`}
    >
      <Icon className="size-4 shrink-0" />
      <div className="min-w-0 flex-1 [&_b]:font-semibold">{props.children}</div>
      {props.action}
      {props.onDismiss ? (
        <button type="button" className="icon-btn text-current hover:text-current" aria-label="Dismiss" onClick={props.onDismiss}>
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState(props: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; compact?: boolean }) {
  const Icon = props.icon;
  return (
    <div
      className={`sahabat-glow rounded-2xl border border-dashed border-line flex flex-col items-center text-center ${
        props.compact ? "px-5 py-7 gap-2" : "px-6 py-12 gap-3"
      }`}
    >
      <div className="size-11 rounded-2xl bg-paper border border-line grid place-items-center shadow-card">
        <Icon className="size-5 text-brand" />
      </div>
      <div className="font-semibold text-[14px]">{props.title}</div>
      {props.body ? <p className="text-[13px] text-muted max-w-[44ch] m-0">{props.body}</p> : null}
      {props.action ? <div className="mt-1">{props.action}</div> : null}
    </div>
  );
}

export function StatTile(props: { label: string; value: ReactNode; sub?: ReactNode; tone?: "ok" | "bad" | "brand" | "neutral" }) {
  const toneClass =
    props.tone === "ok" ? "text-ok" : props.tone === "bad" ? "text-danger" : props.tone === "brand" ? "text-brand-ink" : "text-ink";
  return (
    <div className="min-w-0 rounded-xl border border-line bg-paper px-3.5 py-3">
      <div className="text-[12px] font-medium text-muted">{props.label}</div>
      <div className={`mt-0.5 text-[18px] font-bold tracking-[-0.01em] leading-tight truncate ${toneClass}`}>{props.value}</div>
      {props.sub ? <div className="mt-0.5 text-[11.5px] text-muted truncate">{props.sub}</div> : null}
    </div>
  );
}

export function Chip(props: { tone?: "neutral" | "ok" | "bad" | "running" | "warn" | "brand" | "input"; children: ReactNode; title?: string; className?: string }) {
  const tone = props.tone ?? "neutral";
  return (
    <span className={`chip chip-${tone} ${tone === "running" ? "pulse-soft" : ""} ${props.className ?? ""}`} title={props.title}>
      {props.children}
    </span>
  );
}

/** Run status as an icon, optionally followed by a plain word. No pill, no dot. */
export function StatusIcon(props: { status: string | null | undefined; className?: string; label?: boolean }) {
  const st = props.status ?? "";
  const word =
    st === "passed" ? "Passed" : st === "failed" ? "Failed" : st === "running" ? "Running" : st === "stopped" ? "Stopped before finishing" : "No result";
  const [Icon, tone] =
    st === "passed"
      ? [CircleCheck, "text-ok"]
      : st === "failed"
        ? [CircleX, "text-danger"]
        : st === "running"
          ? [LoaderCircle, "text-brand animate-spin"]
          : [CircleDashed, "text-faint"];
  const icon = <Icon className={`shrink-0 ${tone} ${props.className ?? "size-4"}`} strokeWidth={2.2} aria-label={props.label ? undefined : word} />;
  if (!props.label) return <span title={word} className="inline-flex">{icon}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      {icon}
      <span className={tone.replace(" animate-spin", "")}>{word}</span>
    </span>
  );
}

export function Field(props: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${props.className ?? ""}`}>
      <span className="label">{props.label}</span>
      {props.children}
    </label>
  );
}

export function SectionTitle(props: { children: ReactNode; count?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 mb-3 ${props.className ?? ""}`}>
      <h3 className="text-[13px] font-bold tracking-[-0.01em] flex items-center gap-2">
        {props.children}
        {props.count !== undefined ? <span className="text-[11.5px] font-semibold text-muted">{props.count}</span> : null}
      </h3>
      {props.right}
    </div>
  );
}
