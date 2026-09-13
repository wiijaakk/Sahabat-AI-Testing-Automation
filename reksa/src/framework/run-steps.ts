import type { CaseStep } from "./types.ts";
import type { SahabatDriver } from "./driver.ts";

export async function runSteps(sahabat: SahabatDriver, steps: CaseStep[]) {
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
    if (step.action === "see") {
      if (!step.target) throw new Error("see needs a target");
      await sahabat.see(step.target);
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
      await sahabat.type(step.target, step.text ?? "");
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
    throw new Error(`unknown action ${(step as CaseStep).action}`);
  }
}
