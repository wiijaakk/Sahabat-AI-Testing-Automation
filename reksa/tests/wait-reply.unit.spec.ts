import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import {
  buildReplyShot,
  classifyReply,
  isPinkAction,
  looksEmptyHome,
  replyTimeoutReason,
  type ReplyShot,
} from "../src/framework/reply.ts";
import type { BBox, HarvestNode } from "../src/framework/types.ts";

const view = { width: 1440, height: 900 };

function node(partial: Partial<HarvestNode> & Pick<HarvestNode, "name" | "bbox">): HarvestNode {
  return {
    id: partial.id ?? "n",
    role: partial.role ?? "button",
    unnamed: partial.unnamed ?? !partial.name,
    ...partial,
  };
}

/** Tiny solid-color png so we can poke isPinkAction without a real screenshot. */
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const img = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
  return Buffer.from(PNG.sync.write(img));
}

/** Full viewport with a colored square where the action icon sits. */
function screenWithAction(actionRgb: [number, number, number], fill: [number, number, number] = [255, 255, 255]): {
  png: Buffer;
  bbox: BBox;
} {
  const img = new PNG({ width: view.width, height: view.height });
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const i = (view.width * y + x) << 2;
      img.data[i] = fill[0];
      img.data[i + 1] = fill[1];
      img.data[i + 2] = fill[2];
      img.data[i + 3] = 255;
    }
  }
  const bbox: BBox = { x: 1200, y: 820, width: 34, height: 34 };
  for (let y = bbox.y; y < bbox.y + bbox.height; y++) {
    for (let x = bbox.x; x < bbox.x + bbox.width; x++) {
      const i = (view.width * y + x) << 2;
      img.data[i] = actionRgb[0];
      img.data[i + 1] = actionRgb[1];
      img.data[i + 2] = actionRgb[2];
      img.data[i + 3] = 255;
    }
  }
  return { png: Buffer.from(PNG.sync.write(img)), bbox };
}

const homeNodes = [
  node({ name: "Create Image", bbox: { x: 500, y: 400, width: 120, height: 36 } }),
  node({ name: "New Chat", bbox: { x: 20, y: 100, width: 100, height: 32 } }),
];

const chatNodes = [
  node({ name: "New Chat", bbox: { x: 20, y: 100, width: 100, height: 32 } }),
  node({ name: "Library", bbox: { x: 20, y: 140, width: 100, height: 32 } }),
];

function shot(
  actionRgb: [number, number, number],
  nodes: HarvestNode[],
  fill: [number, number, number] = [255, 255, 255],
): ReplyShot {
  const { png, bbox } = screenWithAction(actionRgb, fill);
  return buildReplyShot(png, nodes, view, bbox);
}

test("pink send/stop icon samples as pink", () => {
  const png = solidPng(40, 40, [226, 0, 116]);
  expect(isPinkAction(png, { x: 0, y: 0, width: 40, height: 40 })).toBe(true);
});

test("gray mic icon is not pink", () => {
  const png = solidPng(40, 40, [120, 120, 120]);
  expect(isPinkAction(png, { x: 0, y: 0, width: 40, height: 40 })).toBe(false);
});

test("Create Image chip means empty home", () => {
  expect(looksEmptyHome(homeNodes)).toBe(true);
  expect(looksEmptyHome(chatNodes)).toBe(false);
});

test("pre-send home + generating (chips gone, pink) is generating", () => {
  const pre = shot([226, 0, 116], homeNodes);
  const now = shot([226, 0, 116], chatNodes, [250, 250, 250]);
  expect(classifyReply(pre, now, 0)).toBe("generating");
  expect(classifyReply(pre, now, 2000)).toBe("generating");
});

test("fast reply: left home, not pink, transcript changed, idle 800ms → done", () => {
  const pre = shot([226, 0, 116], homeNodes);
  // different fill so the transcript crop hash moves
  const now = shot([120, 120, 120], chatNodes, [245, 240, 250]);
  expect(classifyReply(pre, now, 0)).toBe("waiting");
  expect(classifyReply(pre, now, 799)).toBe("waiting");
  expect(classifyReply(pre, now, 800)).toBe("done");
});

test("generating that never goes idle stays generating", () => {
  const pre = shot([226, 0, 116], homeNodes);
  const now = shot([226, 0, 116], chatNodes, [240, 240, 245]);
  expect(classifyReply(pre, now, 5000)).toBe("generating");
  expect(replyTimeoutReason("generating")).toMatch(/still generating/);
});

test("still on home with gray mic reports home", () => {
  const pre = shot([226, 0, 116], homeNodes);
  const now = shot([120, 120, 120], homeNodes);
  expect(classifyReply(pre, now, 2000)).toBe("home");
  expect(replyTimeoutReason("home")).toMatch(/still on home/);
});

test("idle mic but transcript never moved stays waiting", () => {
  // same fill → same transcript hash; chips already gone in both shots
  const pre = shot([226, 0, 116], chatNodes, [255, 255, 255]);
  const now = shot([120, 120, 120], chatNodes, [255, 255, 255]);
  expect(classifyReply(pre, now, 2000)).toBe("waiting");
  expect(replyTimeoutReason("waiting")).toMatch(/transcript never moved/);
});
