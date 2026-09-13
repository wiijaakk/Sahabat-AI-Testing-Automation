import { test, expect } from "@playwright/test";
import { harvestRole, matchEntry } from "../src/framework/harvest.ts";
import type { HarvestNode, VocabEntry } from "../src/framework/types.ts";

const view = { width: 1440, height: 900 };

function node(partial: Partial<HarvestNode> & Pick<HarvestNode, "name" | "bbox">): HarvestNode {
  return {
    id: partial.id ?? "n",
    role: partial.role ?? "button",
    unnamed: partial.unnamed ?? !partial.name,
    ...partial,
  };
}

test("header hint picks the top Login, not the banner one", () => {
  const entry: VocabEntry = { name: "Login", text: ["Login"], hint: "header" };
  const nodes = [
    node({ name: "Login", bbox: { x: 20, y: 900, width: 50, height: 20 } }),
    node({ name: "Login", bbox: { x: 1300, y: 24, width: 68, height: 32 } }),
  ];
  const hit = matchEntry(entry, nodes, view);
  expect(hit?.bbox.x).toBe(1300);
});

test("two Logins with no hint throw", () => {
  const entry: VocabEntry = { name: "Login", text: ["Login"] };
  const nodes = [
    node({ name: "Login", bbox: { x: 20, y: 900, width: 50, height: 20 } }),
    node({ name: "Login", bbox: { x: 1300, y: 24, width: 68, height: 32 } }),
  ];
  expect(() => matchEntry(entry, nodes, view)).toThrow(/matched 2/);
});

test("composer send is the unnamed button on the right of the textbox", () => {
  const entry: VocabEntry = { name: "send", text: ["send"], unnamed: true, hint: "composer" };
  const nodes = [
    node({
      name: "",
      role: "textbox",
      unnamed: false,
      bbox: { x: 700, y: 600, width: 400, height: 40 },
    }),
    node({
      name: "",
      unnamed: true,
      bbox: { x: 710, y: 605, width: 32, height: 32 },
    }),
    node({
      name: "",
      unnamed: true,
      bbox: { x: 1060, y: 605, width: 34, height: 34 },
    }),
  ];
  const hit = matchEntry(entry, nodes, view);
  expect(hit?.bbox.x).toBe(1060);
});

const composer: VocabEntry = {
  name: "composer",
  text: ["composer"],
  role: "textbox",
  hint: "composer",
};

// logged-in dashboard: field sits above + / mic, no role=textbox on the node
const sahabatComposer = [
  node({
    id: "field",
    name: "",
    role: "textbox",
    unnamed: true,
    bbox: { x: 493, y: 501, width: 734, height: 39 },
  }),
  node({
    id: "plus",
    name: "",
    unnamed: true,
    bbox: { x: 493, y: 541, width: 32, height: 32 },
  }),
  node({
    id: "mic",
    name: "",
    unnamed: true,
    bbox: { x: 1193, y: 540, width: 34, height: 34 },
  }),
];

test("a direct textarea with no role still counts as a textbox", () => {
  expect(harvestRole(null, true)).toBe("textbox");
  expect(harvestRole("button", true)).toBe("button");
  expect(harvestRole(null, false)).toBeNull();
});

test("composer is the leaf textbox, not a full-screen ancestor", () => {
  const nodes = [
    node({
      id: "root",
      name: "",
      role: "textbox",
      unnamed: true,
      bbox: { x: 0, y: 0, width: 1440, height: 900 },
    }),
    ...sahabatComposer,
  ];
  const hit = matchEntry(composer, nodes, view);
  expect(hit?.id).toBe("field");
});

test("composer hint skips a sidebar search box", () => {
  const nodes = [
    node({
      id: "search",
      name: "Search chats",
      role: "textbox",
      bbox: { x: 16, y: 72, width: 247, height: 40 },
    }),
    ...sahabatComposer,
  ];
  const hit = matchEntry(composer, nodes, view);
  expect(hit?.id).toBe("field");
});

test("plus and mic still find composer when flutter omitted the field node", () => {
  const hit = matchEntry(composer, sahabatComposer.slice(1), view);
  expect(hit).not.toBeNull();
  expect(hit!.bbox.x).toBeGreaterThan(280);
  expect(hit!.bbox.width).toBeGreaterThan(200);
});

test("send is the rightmost icon on the composer row even if it sits below the field", () => {
  const entry: VocabEntry = { name: "send", text: ["send"], unnamed: true, hint: "composer" };
  const hit = matchEntry(entry, sahabatComposer, view);
  expect(hit?.id).toBe("mic");
});
