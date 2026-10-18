import { test, expect } from "@playwright/test";
import { addScanned, isBrowserGone, loadScanPlan, mergeScreens, renderPlan, seenOn, tagCatalog } from "../src/framework/scan-plan.ts";
import type { HarvestScreen, VocabEntry } from "../src/framework/types.ts";

const view = { width: 1440, height: 900 };

function screen(id: string, names: string[], status: "ok" | "skipped" = "ok"): HarvestScreen {
  return {
    id,
    title: id,
    status,
    nodes: names.map((name, i) => ({
      id: `n${i}`,
      role: "button",
      name,
      unnamed: false,
      bbox: { x: 20 + i * 10, y: 100 + i * 50, width: 200, height: 40 },
    })),
  };
}

test("the shipped plan renders every fixture placeholder", () => {
  const plan = renderPlan(loadScanPlan());
  expect(plan.screens.length).toBeGreaterThan(0);
  for (const s of plan.screens) {
    expect(s.needs ?? "").not.toMatch(/\{\{/);
    for (const step of s.steps) {
      expect(step.text ?? "").not.toMatch(/\{\{/);
      expect(step.target ?? "").not.toMatch(/\{\{/);
    }
  }
  const ids = plan.screens.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const s of plan.screens) {
    expect(s.page).toBeTruthy();
    expect(s.title).toBe(s.state ? `${s.page} · ${s.state}` : s.page);
  }
  expect(new Set(plan.screens.map((s) => s.page))).toEqual(new Set(["Dashboard", "New Chat", "Library", "AiStorage"]));
});

test("renderPlan leaves unknown placeholders alone", () => {
  const plan = renderPlan({
    fixtures: { project: "P1" },
    screens: [{ id: "a", page: "a", title: "a", needs: "{{project}} and {{runTag}}", steps: [{ action: "tapText", text: "{{project}}" }] }],
  });
  expect(plan.screens[0].needs).toBe("P1 and {{runTag}}");
  expect(plan.screens[0].steps[0].text).toBe("P1");
});

test("tagCatalog tags entries with the screens they were found on", () => {
  const entries: VocabEntry[] = [
    { name: "Library", text: ["Library"], role: "button", hint: "sidebar" },
    { name: "Your Uploads", text: ["Your Uploads"], role: "button" },
    { name: "Nowhere", text: ["Nowhere"], role: "button" },
  ];
  const screens = [screen("dashboard", ["Library", "New Chat"]), screen("library", ["Library", "Your Uploads"])];
  const tagged = tagCatalog(entries, screens, view);
  expect(tagged[0].screens).toEqual(["dashboard", "library"]);
  expect(tagged[1].screens).toEqual(["library"]);
  expect(tagged[2].screens).toBeUndefined();
});

test("tagCatalog keeps tags for screens the scan skipped and drops stale ones", () => {
  const entries: VocabEntry[] = [
    { name: "Edit Project", text: ["Edit Project"], role: "button", screens: ["aistorage-project-menu", "dashboard"] },
  ];
  const screens = [screen("dashboard", ["Library"]), screen("aistorage-project-menu", [], "skipped")];
  const tagged = tagCatalog(entries, screens, view);
  expect(tagged[0].screens).toEqual(["aistorage-project-menu"]);
});

test("seenOn tags an unnamed control only where a same-size box sits near its pin", () => {
  const field: VocabEntry = {
    name: "Project Description",
    text: ["Project Description"],
    role: "textbox",
    unnamed: true,
    bbox: { x: 657.5, y: 502, width: 285, height: 20 },
  };
  const dialog = [{ id: "a", role: "textbox", name: "", unnamed: true, bbox: { x: 577.5, y: 452, width: 285, height: 20 } }];
  const dashboard = [{ id: "b", role: "textbox", name: "", unnamed: true, bbox: { x: 420, y: 500, width: 700, height: 44 } }];
  expect(seenOn(field, dialog, view)).toBe(true);
  expect(seenOn(field, dashboard, view)).toBe(false);
  const icon: VocabEntry = { name: "File Menu", text: ["File Menu"], role: "button", unnamed: true, bbox: { x: 963.5, y: 178, width: 22, height: 22 } };
  const bigButtonNearby = [{ id: "c", role: "button", name: "", unnamed: true, bbox: { x: 875.5, y: 201, width: 32, height: 48 } }];
  expect(seenOn(icon, bigButtonNearby, view)).toBe(false);
});

test("seenOn counts the chat composer only when one unnamed field sits in the composer strip", () => {
  const composer: VocabEntry = { name: "composer", text: ["composer", "Ask me"], role: "textbox", hint: "composer" };
  const chat = [{ id: "f", role: "textbox", name: "", unnamed: true, bbox: { x: 400, y: 700, width: 700, height: 44 } }];
  const dialog = [
    { id: "n", role: "textbox", name: "", unnamed: true, bbox: { x: 579.5, y: 364, width: 229, height: 20 } },
    { id: "d", role: "textbox", name: "", unnamed: true, bbox: { x: 577.5, y: 452, width: 285, height: 20 } },
  ];
  expect(seenOn(composer, chat, view)).toBe(true);
  expect(seenOn(composer, dialog, view)).toBe(false);
});

test("mergeScreens keeps old screens, replaces rescanned ones and follows plan order", () => {
  const plan = renderPlan(loadScanPlan());
  const previous = [screen("library", ["Library"]), screen("dashboard", ["Library"]), screen("gone-from-plan", ["x"])];
  const merged = mergeScreens(plan, previous, [screen("library", ["Library", "Your Uploads"])]);
  expect(merged.map((s) => s.id)).toEqual(["dashboard", "library"]);
  expect(merged[1].nodes).toHaveLength(2);
});

test("isBrowserGone recognises a closed Chrome and nothing else", () => {
  expect(isBrowserGone("page.goto: Target page, context or browser has been closed")).toBe(true);
  expect(isBrowserGone('tapText("SANITY_SCAN_PROJECT"): not on this screen')).toBe(false);
});

test("addScanned adds labeled controls the catalog does not cover yet", () => {
  const entries: VocabEntry[] = [{ name: "AIStorage", text: ["AiStorage", "AI Storage"], role: "button" }];
  const dash = screen("dashboard", ["AiStorage", "Help Center", "Show menu\nSort"]);
  dash.nodes.push({ id: "icon", role: "button", name: "", unnamed: true, bbox: { x: 900, y: 20, width: 24, height: 24 } });
  const out = addScanned(entries, [dash, screen("library", ["Help Center"]), screen("menu", ["Edit"], "skipped")], view);
  expect(out.map((e) => e.name)).toEqual(["AIStorage", "Help Center", "Show menu Sort"]);
  expect(out[1]).toMatchObject({ text: ["Help Center"], role: "button", source: "scan" });
  expect(addScanned(out, [dash], view)).toEqual(out);
});

test("addScanned sets a hint only when every copy of a label shares it", () => {
  const twice = screen("dashboard", ["Explore Companions", "Explore Companions"]);
  twice.nodes[0].hint = "sidebar";
  twice.nodes[1].hint = "footer";
  const once = screen("library", ["Library"]);
  once.nodes[0].hint = "sidebar";
  const out = addScanned([], [twice, once], view);
  expect(out.find((e) => e.name === "Explore Companions")?.hint).toBeUndefined();
  expect(out.find((e) => e.name === "Library")?.hint).toBe("sidebar");
});
