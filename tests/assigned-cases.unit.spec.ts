import { test, expect } from "@playwright/test";
import { listCases } from "../src/framework/cases.ts";

test("only the assigned cases are kept", () => {
  const ids = listCases().map((item) => item.id);
  expect(ids).toEqual(["favorite-project", "open-library-assets", "project-chat-summary"]);
});

test("favorite-project opens the project menu around favorite actions", () => {
  const item = listCases().find((candidate) => candidate.id === "favorite-project");
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
