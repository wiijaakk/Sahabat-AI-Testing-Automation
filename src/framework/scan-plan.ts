import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aliases, dist, hintFor, inHint, norm, type Viewport } from "./harvest.ts";
import type { BBox, CaseStep, ControlHint, ControlRole, HarvestNode, HarvestScreen, VocabEntry } from "./types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SCAN_PLAN_FILE = path.join(root, "vocab", "scan-plan.json");

export type ScanScreenDef = {
  id: string;
  /** Product page the screen belongs to: Dashboard, New Chat, Library, AiStorage. One tab per page in the UI. */
  page: string;
  /** State of that page: a tab, an open item, a dialog or a menu. Omitted for the page itself. */
  state?: string;
  /** "Page · State", filled in by loadScanPlan. */
  title: string;
  /** Account state the screen needs. Shown when the scan skips it. Fixture names use {{project}} style. */
  needs?: string;
  /** Run after gotoDashboard + dismiss Skip. A failing step skips the screen, the scan continues. */
  steps: CaseStep[];
};

export type ScanPlan = {
  /** Names of the items the scan account must hold, substituted into steps and needs. */
  fixtures: Record<string, string>;
  screens: ScanScreenDef[];
};

export function screenTitle(s: { page: string; state?: string }): string {
  return s.state ? `${s.page} · ${s.state}` : s.page;
}

export function loadScanPlan(): ScanPlan {
  const raw = JSON.parse(fs.readFileSync(SCAN_PLAN_FILE, "utf8")) as ScanPlan;
  return { ...raw, screens: raw.screens.map((s) => ({ ...s, title: s.title ?? screenTitle(s) })) };
}

export function renderFixtures(value: string, fixtures: Record<string, string>): string {
  return value.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => fixtures[key] ?? whole);
}

/** Plan with fixture names filled in, so steps and needs read as what the runner does. */
export function renderPlan(plan: ScanPlan): ScanPlan {
  const r = (v?: string) => (v === undefined ? undefined : renderFixtures(v, plan.fixtures));
  return {
    fixtures: plan.fixtures,
    screens: plan.screens.map((s) => ({
      ...s,
      title: s.title ?? screenTitle(s),
      needs: r(s.needs),
      steps: s.steps.map((step) => ({
        ...step,
        target: r(step.target),
        text: r(step.text),
      })),
    })),
  };
}

function sameSize(a: BBox, b: BBox): boolean {
  return (
    Math.abs(a.width - b.width) <= Math.max(6, a.width * 0.15) &&
    Math.abs(a.height - b.height) <= Math.max(6, a.height * 0.15)
  );
}

/**
 * Did the scan see this control on a screen? Stricter than the runner's matcher on purpose: the
 * runner already knows it is on the right screen and may fall back to the nearest box or a composer
 * guess, but for tagging those fallbacks would put a dialog field on the dashboard. A named control
 * counts when its name is on the screen. An unnamed one counts when a node of the same role and
 * size sits close to where it was pinned.
 */
export function seenOn(entry: VocabEntry, nodes: HarvestNode[], viewport: Viewport): boolean {
  if (entry.unnamed) {
    if (!entry.bbox) return false;
    const saved = entry.bbox;
    return nodes.some(
      (n) =>
        n.unnamed &&
        (!entry.role || n.role === entry.role) &&
        sameSize(n.bbox, saved) &&
        dist(n.bbox, saved) <= 96,
    );
  }
  const want = aliases(entry);
  const named = nodes.some((n) => n.name && want.includes(norm(n.name)) && (!entry.role || n.role === entry.role));
  if (named) return true;
  if (entry.role === "textbox" && (entry.hint === "composer" || norm(entry.name) === "composer")) {
    // the chat field has no name; it is the only unnamed field in the composer strip
    const fields = nodes.filter((n) => n.role === "textbox" && n.unnamed && inHint(n, "composer", viewport));
    return fields.length === 1;
  }
  return false;
}

/**
 * Add every labeled control the scan found that no catalog entry covers yet, so the catalog holds
 * everything on the scanned screens without a human pinning each one. Unnamed icons still need a
 * name from a human. A hint is set only when every copy of the label sits in the same region, since
 * the runner drops matches outside the hint. Entries get source "scan" so they can be told apart
 * from hand-made ones, e.g. to prune chat history titles that scrolled away.
 */
export function addScanned(entries: VocabEntry[], screens: HarvestScreen[], viewport: Viewport): VocabEntry[] {
  const known = new Set(entries.flatMap(aliases));
  const found = new Map<string, { label: string; role: ControlRole; hints: Set<ControlHint | undefined> }>();
  for (const s of screens) {
    if (s.status !== "ok") continue;
    for (const n of s.nodes) {
      if (n.unnamed || !n.name.trim()) continue;
      const label = n.name.replace(/\s+/g, " ").trim();
      const key = norm(label);
      if (known.has(key)) continue;
      const hint = n.hint ?? hintFor(n, viewport);
      const prev = found.get(key);
      if (prev) prev.hints.add(hint);
      else found.set(key, { label, role: n.role === "textbox" ? "textbox" : "button", hints: new Set([hint]) });
    }
  }
  const added: VocabEntry[] = [...found.values()].map((f) => {
    const hint = f.hints.size === 1 ? [...f.hints][0] : undefined;
    return { name: f.label, text: [f.label], role: f.role, ...(hint ? { hint } : {}), source: "scan" };
  });
  return [...entries, ...added];
}

/**
 * Tag every catalog entry with the screens it was found on. Screens the scan reached replace old
 * tags; screens it skipped keep whatever was tagged before, since we learned nothing about them.
 */
export function tagCatalog(entries: VocabEntry[], screens: HarvestScreen[], viewport: Viewport): VocabEntry[] {
  const reached = new Set(screens.filter((s) => s.status === "ok").map((s) => s.id));
  return entries.map((entry) => {
    const kept = (entry.screens ?? []).filter((id) => !reached.has(id));
    const found = screens.filter((s) => s.status === "ok" && seenOn(entry, s.nodes, viewport)).map((s) => s.id);
    const next = [...new Set([...kept, ...found])];
    if (next.length === 0 && !entry.screens) return entry;
    return { ...entry, screens: next };
  });
}

/**
 * Screens for the harvest index after a scan: the plan's order, with freshly scanned screens
 * replacing their old entry and every other screen kept from the previous scan. A rescan of one
 * screen, or a scan that died halfway, must not erase what the last full scan found.
 */
export function mergeScreens(plan: ScanPlan, previous: HarvestScreen[], scanned: HarvestScreen[]): HarvestScreen[] {
  const fresh = new Map(scanned.map((s) => [s.id, s]));
  const old = new Map(previous.map((s) => [s.id, s]));
  const out: HarvestScreen[] = [];
  for (const def of plan.screens) {
    const s = fresh.get(def.id) ?? old.get(def.id);
    if (s) out.push(s);
  }
  return out;
}

/** Playwright's wording when Chrome went away. Nothing after this can be scanned, so stop instead of skipping every screen. */
export function isBrowserGone(reason: string): boolean {
  return /has been closed|Target closed|browser has been closed|Browser closed/i.test(reason);
}
