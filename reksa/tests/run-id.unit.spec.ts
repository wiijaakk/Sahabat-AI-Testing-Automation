import { test, expect } from "@playwright/test";
import { displayRunName, makeRunId } from "../src/framework/artifacts.ts";

test("run folders keep the date and append the action", () => {
  const at = new Date(2026, 8, 13, 22, 35, 3);
  expect(makeRunId("login", at)).toBe("20260913-223503-login");
  expect(makeRunId("chat-hi", at)).toBe("20260913-223503-chat-hi");
});

test("history titles prefer the action over a raw timestamp", () => {
  expect(
    displayRunName({ id: "20260913-223503-login" }),
  ).toBe("Save login");
  expect(
    displayRunName({ id: "20260913-223503-smoke" }),
  ).toBe("Library smoke");
  expect(
    displayRunName({ id: "20260913-223503-scan" }),
  ).toBe("Scan screen");
  expect(
    displayRunName({
      id: "20260913-223503-chat-hi",
      kind: "case",
      caseId: "chat-hi",
      test: "New Chat says hi",
    }),
  ).toBe("New Chat says hi");
});

test("old date-only folders still pick a name from the manifest", () => {
  expect(
    displayRunName({
      id: "20260913-161015",
      test: "save headed login into the chrome profile",
    }),
  ).toBe("Save login");
  expect(
    displayRunName({
      id: "20260913-223503",
      test: "New Chat says hi",
    }),
  ).toBe("New Chat says hi");
});
