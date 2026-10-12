import { BookMarked, History, ListChecks, LoaderCircle, LogIn, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import iohLogo from "../assets/ioh-logo.svg";
import iohLogoDark from "../assets/ioh-logo-dark.svg";
import sahabatMark from "../assets/sahabat-ai-mark.png";
import type { ThemePref } from "../lib/theme";
import type { CurrentJob, View } from "../lib/types";

const NAV: { id: View; label: string; icon: typeof BookMarked; hint: string }[] = [
  { id: "catalog", label: "Catalog", icon: BookMarked, hint: "Controls the runner can find on screen" },
  { id: "cases", label: "Cases", icon: ListChecks, hint: "Step lists that run against the product" },
  { id: "runs", label: "Runs", icon: History, hint: "Screenshot evidence for every run" },
];

export function Sidebar(props: {
  view: View;
  onView: (v: View) => void;
  counts: Partial<Record<View, number>>;
  loaded: boolean;
  profile: boolean;
  running: boolean;
  busy: string | null;
  current: CurrentJob | null;
  currentLabel: string | null;
  onLogin: () => void;
  onOpenCurrent: () => void;
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
}) {
  return (
    <aside className="flex flex-col gap-5 h-full px-3.5 pt-5 pb-4 bg-paper border-r border-line max-lg:flex-row max-lg:flex-wrap max-lg:items-center max-lg:gap-x-4 max-lg:gap-y-3 max-lg:py-3 max-lg:border-r-0 max-lg:border-b">
      <div className="flex items-center gap-3 px-1.5">
        <img src={sahabatMark} alt="Sahabat-AI" className="size-9 shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="font-extrabold tracking-[-0.02em] text-[15px]">Sahabat Sanity</div>
          <div className="text-[11.5px] text-muted mt-0.5">QA operator for Sahabat-AI</div>
        </div>
      </div>

      <nav className="grid gap-1 max-lg:flex max-lg:gap-1" aria-label="Views">
        {NAV.map((n) => {
          const active = props.view === n.id;
          const Icon = n.icon;
          const count = props.counts[n.id];
          return (
            <button
              key={n.id}
              type="button"
              title={n.hint}
              aria-current={active ? "page" : undefined}
              onClick={() => props.onView(n.id)}
              className={`flex items-center gap-2.5 h-9 px-2.5 rounded-xl text-[13.5px] font-semibold text-left transition-colors ${
                active ? "bg-brand-soft text-brand-ink" : "text-muted hover:bg-soft hover:text-ink"
              }`}
            >
              <Icon className="size-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
              <span className="flex-1">{n.label}</span>
              {count !== undefined ? (
                <span className={`text-[11px] font-semibold tabular-nums ${active ? "text-brand-ink/70" : "text-faint"}`}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-3 min-w-0 max-lg:mt-0 max-lg:ml-auto max-lg:flex max-lg:items-center">
        <SessionCard
          loaded={props.loaded}
          profile={props.profile}
          running={props.running}
          busy={props.busy}
          current={props.current}
          label={props.currentLabel}
          onLogin={props.onLogin}
          onOpen={props.onOpenCurrent}
        />
        <div className="flex items-center justify-between gap-3 max-lg:contents">
          <ThemeToggle value={props.theme} onChange={props.onTheme} />
          <a
            href="https://ioh.co.id"
            target="_blank"
            rel="noreferrer"
            title="Indosat Ooredoo Hutchison"
            className="shrink-0 rounded-lg px-1.5 py-1"
          >
            <img src={iohLogo} alt="Indosat Ooredoo Hutchison" className="h-7 w-auto dark:hidden" />
            <img src={iohLogoDark} alt="Indosat Ooredoo Hutchison" className="hidden h-7 w-auto dark:block" />
          </a>
        </div>
      </div>
    </aside>
  );
}

/**
 * The Chrome profile is the login. Sign in once in the headed window and every run reuses it,
 * so this card is the one place that says whether the operator is signed in and lets them redo it.
 */
function SessionCard(props: {
  loaded: boolean;
  profile: boolean;
  running: boolean;
  busy: string | null;
  current: CurrentJob | null;
  label: string | null;
  onLogin: () => void;
  onOpen: () => void;
}) {
  const c = props.current;
  const loggingIn = props.busy === "login" || (props.running && c?.kind === "login");
  const canLogin = !props.running && props.busy === null;

  if (!props.loaded) {
    return (
      <div className="rounded-xl border border-line bg-canvas p-3 text-[12px] text-muted max-lg:min-w-[240px]">Checking Chrome profile…</div>
    );
  }

  if (loggingIn) {
    return (
      <div className="rounded-xl border border-brand-tint bg-brand-soft p-3 grid gap-2 text-[12px] max-lg:min-w-[260px]">
        <div className="flex items-center gap-2 font-semibold text-brand-ink">
          <LoaderCircle className="size-3.5 animate-spin" />
          Chrome is open
        </div>
        <p className="m-0 text-muted leading-snug">Finish signing in to Sahabat-AI in that window. This closes itself once the dashboard loads.</p>
        <button type="button" onClick={props.onOpen} className="text-left text-brand-ink font-semibold hover:underline">
          Watch progress
        </button>
      </div>
    );
  }

  if (!props.profile) {
    return (
      <div className="rounded-xl border border-warn-line bg-warn-soft p-3 grid gap-2.5 text-[12px] max-lg:min-w-[260px]">
        <div className="flex items-center gap-2 font-semibold text-warn">
          <span className="dot bg-warn" />
          Not signed in
        </div>
        <p className="m-0 text-muted leading-snug">Runs need a Chrome profile that is signed in to Sahabat-AI. Sign in once and it is kept.</p>
        <button type="button" className="btn btn-sm btn-primary" disabled={!canLogin} onClick={props.onLogin}>
          <LogIn className="size-3.5" />
          Sign in to Sahabat-AI
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-canvas p-3 grid gap-2 text-[12px] min-w-0 max-lg:min-w-[260px]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="dot bg-ok" />
        <span className="font-semibold whitespace-nowrap">Signed in</span>
        <span className="text-muted truncate min-w-0">· Chrome profile saved</span>
        <button
          type="button"
          className="icon-btn ml-auto -my-1"
          title="Sign in again, for example after the session expired"
          aria-label="Sign in again"
          disabled={!canLogin}
          onClick={props.onLogin}
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>
      {props.running && c ? (
        <button type="button" onClick={props.onOpen} className="flex items-center gap-2 text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-soft">
          <span className="dot bg-brand pulse-soft" />
          <span className="text-muted">Running</span>
          <b className="ml-auto font-semibold truncate max-w-[130px] text-brand-ink">{props.label}</b>
        </button>
      ) : c ? (
        <button type="button" onClick={props.onOpen} className="flex items-center gap-2 text-left rounded-lg -mx-1 px-1 py-0.5 hover:bg-soft">
          <span className={`dot ${c.status === "passed" ? "bg-ok" : "bg-danger"}`} />
          <span className="text-muted">Last job</span>
          <b className={`ml-auto font-semibold truncate max-w-[130px] ${c.status === "passed" ? "text-ok" : "text-danger"}`}>
            {props.label} · {c.status}
          </b>
        </button>
      ) : (
        <div className="flex items-center gap-2 text-muted">
          <span className="dot bg-faint" />
          Idle, nothing has run yet
        </div>
      )}
    </div>
  );
}

function ThemeToggle(props: { value: ThemePref; onChange: (t: ThemePref) => void }) {
  const opts: { id: ThemePref; icon: typeof Sun; label: string }[] = [
    { id: "system", icon: Monitor, label: "Follow system" },
    { id: "light", icon: Sun, label: "Light" },
    { id: "dark", icon: Moon, label: "Dark" },
  ];
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-line bg-canvas" role="radiogroup" aria-label="Appearance">
      {opts.map((o) => {
        const Icon = o.icon;
        const active = props.value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => props.onChange(o.id)}
            className={`size-7 rounded-md grid place-items-center transition-colors ${
              active ? "bg-paper text-ink shadow-card border border-line" : "text-faint hover:text-ink"
            }`}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
