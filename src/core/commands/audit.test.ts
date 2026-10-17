import { describe, expect, it } from "vitest";
import { auditCommands } from "./audit.js";

describe("auditCommands", () => {
  it("passes when keys, registry, catalog and the planned list agree", () => {
    expect(auditCommands({ registered: ["a", "b"], catalog: ["a", "b", "later"], keymap: ["a", "later"], planned: ["later"] })).toEqual([]);
  });

  it("reports keys without a command, commands without a label and catalog entries nothing registers", () => {
    const problems = auditCommands({ registered: ["a", "nolabel"], catalog: ["a", "ghost"], keymap: ["a", "missing"], planned: [] });
    expect(problems).toEqual([
      "The key of missing dispatches a command nothing registers.",
      "missing has keys but no catalog entry (label, category).",
      "nolabel is registered but has no catalog entry (label, category).",
      "ghost is in the catalog but nothing registers it.",
    ]);
  });

  it("reports planned commands that are built", () => {
    expect(auditCommands({ registered: ["a"], catalog: ["a"], keymap: ["a"], planned: ["a"] })).toEqual(["a is registered: remove it from planned.ts."]);
  });
});
