import { test, expect } from "@playwright/test";
import type { SahabatDriver } from "../src/framework/driver.ts";
import { runSteps } from "../src/framework/run-steps.ts";
import type { CaseStep } from "../src/framework/types.ts";

test("feature steps resolve run data and dispatch to the driver", async () => {
  const calls: unknown[][] = [];
  const sahabat = {
    artifacts: { manifest: { id: "20260916-143000-as-004-create-project" } },
    tapText: async (...args: unknown[]) => calls.push(["tapText", ...args]),
    seeText: async (...args: unknown[]) => calls.push(["seeText", ...args]),
    seeAny: async (...args: unknown[]) => calls.push(["seeAny", ...args]),
    notSeeText: async (...args: unknown[]) => calls.push(["notSeeText", ...args]),
    replace: async (...args: unknown[]) => calls.push(["replace", ...args]),
    upload: async (...args: unknown[]) => calls.push(["upload", ...args]),
    reload: async (...args: unknown[]) => calls.push(["reload", ...args]),
  } as unknown as SahabatDriver;
  const steps: CaseStep[] = [
    { action: "tapText", text: "SANITY_{{runId}}" },
    { action: "tapText", text: "SANITY_A_{{runTag}}" },
    { action: "tapText", text: "SANITY_A_{{runAlpha}}" },
    { action: "seeText", text: "SANITY_{{runId}}" },
    { action: "seeAny", text: "Quota | Unlimited" },
    { action: "notSeeText", text: "OLD_{{runId}}" },
    { action: "replace", target: "Project Name", text: "NEW_{{runId}}" },
    { action: "upload", target: "Upload Files", text: "one.txt\ntwo.txt,three.txt" },
    { action: "reload" },
  ];

  await runSteps(sahabat, steps);

  expect(calls).toEqual([
    ["tapText", "SANITY_20260916-143000"],
    ["tapText", "SANITY_A_143000"],
    ["tapText", "SANITY_A_bedaaa"],
    ["seeText", "SANITY_20260916-143000"],
    ["seeAny", ["Quota", "Unlimited"]],
    ["notSeeText", "OLD_20260916-143000"],
    ["replace", "Project Name", "NEW_20260916-143000"],
    ["upload", "Upload Files", ["one.txt", "two.txt", "three.txt"]],
    ["reload"],
  ]);
});
