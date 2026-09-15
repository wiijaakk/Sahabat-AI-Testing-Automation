import { test, expect } from "@playwright/test";
import { listCases } from "../src/framework/cases.ts";

test("AI Storage, Library, and Profile have all assigned cases", () => {
  const ids = listCases().map((item) => item.id);
  expect(ids.filter((id) => id.startsWith("as-"))).toHaveLength(9);
  expect(ids.filter((id) => id.startsWith("lb-"))).toHaveLength(6);
  expect(ids.filter((id) => id.startsWith("pf-"))).toHaveLength(4);
});

test("delete cases only target disposable SANITY data", () => {
  const deleteIds = ["as-005-delete-file", "as-006-delete-project", "lb-001-delete"];
  const cases = listCases().filter((item) => deleteIds.includes(item.id));
  for (const item of cases) {
    const selected = item.steps.find((step) => step.action === "tapText");
    expect(selected?.text).toContain("SANITY_");
  }
});

test("AS-001 opens the project menu around favorite actions", () => {
  const item = listCases().find((candidate) => candidate.id === "as-001-favorite");
  expect(item).toBeTruthy();

  const actions = item!.steps.map((step) => `${step.action}:${step.target ?? ""}`);
  expect(actions).toEqual(
    expect.arrayContaining([
      "tap:Project Menu",
      "tap:Favorite",
      "see:Remove Favorite",
      "tap:Remove Favorite",
      "see:Favorite",
    ]),
  );

  expect(actions.filter((action) => action === "tap:Project Menu")).toHaveLength(3);
});
