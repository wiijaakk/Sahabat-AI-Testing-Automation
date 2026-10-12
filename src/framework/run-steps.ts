import type { CaseStep } from "./types.ts";
import type { SahabatDriver } from "./driver.ts";

export async function runSteps(sahabat: SahabatDriver, steps: CaseStep[]) {
  const id = sahabat.artifacts.manifest.id;
  const runId = id.match(/^\d{8}-\d{6}/)?.[0] ?? id;
  const runTag = id.match(/^\d{8}-(\d{6})/)?.[1] ?? id.slice(-6);
  const runAlpha = runTag.replace(/\d/g, (digit) => "abcdefghij"[Number(digit)]);
  const render = (value = "") =>
    value
      .replaceAll("{{runId}}", runId)
      .replaceAll("{{runTag}}", runTag)
      .replaceAll("{{runAlpha}}", runAlpha);

  for (const step of steps) {
    if (step.action === "gotoDashboard") {
      await sahabat.gotoDashboard();
      continue;
    }
    if (step.action === "tap") {
      if (!step.target) throw new Error("tap needs a target");
      await sahabat.tap(step.target);
      continue;
    }
    if (step.action === "tapText") {
      if (!step.text) throw new Error("tapText needs text");
      await sahabat.tapText(render(step.text));
      continue;
    }
    if (step.action === "see") {
      if (!step.target) throw new Error("see needs a target");
      await sahabat.see(step.target);
      continue;
    }
    if (step.action === "seeText") {
      if (!step.text) throw new Error("seeText needs text");
      await sahabat.seeText(render(step.text));
      continue;
    }
    if (step.action === "seeAny") {
      const texts = render(step.text).split("|").map((text) => text.trim()).filter(Boolean);
      if (texts.length === 0) throw new Error("seeAny needs pipe-separated text");
      await sahabat.seeAny(texts);
      continue;
    }
    if (step.action === "notSeeText") {
      if (!step.text) throw new Error("notSeeText needs text");
      await sahabat.notSeeText(render(step.text));
      continue;
    }
    if (step.action === "dismiss") {
      if (!step.target) throw new Error("dismiss needs a target");
      await sahabat.dismissIfPresent(step.target);
      continue;
    }
    if (step.action === "checkpoint") {
      await sahabat.checkpoint(step.target ?? "checkpoint");
      continue;
    }
    if (step.action === "type") {
      if (!step.target) throw new Error("type needs a target");
      await sahabat.type(step.target, render(step.text));
      continue;
    }
    if (step.action === "replace") {
      if (!step.target) throw new Error("replace needs a target");
      await sahabat.replace(step.target, render(step.text));
      continue;
    }
    if (step.action === "upload") {
      if (!step.target) throw new Error("upload needs a target");
      const files = render(step.text).split(/\r?\n|,/).map((file) => file.trim()).filter(Boolean);
      if (files.length === 0) throw new Error("upload needs file paths");
      await sahabat.upload(step.target, files);
      continue;
    }
    if (step.action === "press") {
      await sahabat.press(step.key ?? "Enter");
      continue;
    }
    if (step.action === "waitReply") {
      await sahabat.waitReply();
      continue;
    }
    if (step.action === "reload") {
      await sahabat.reload();
      continue;
    }
    throw new Error(`unknown action ${(step as CaseStep).action}`);
  }
}
