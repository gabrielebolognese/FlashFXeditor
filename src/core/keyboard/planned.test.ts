import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP } from "./keymap.js";
import { PLANNED_COMMANDS, plannedMessage } from "./planned.js";

describe("planned commands", () => {
  it("lists only keymap commands, each with a later batch and a name", () => {
    const ids = new Set(DEFAULT_KEYMAP.map((binding) => binding.id));
    for (const [id, planned] of Object.entries(PLANNED_COMMANDS)) {
      expect(ids.has(id), id).toBe(true);
      expect(planned.batch, id).toBeGreaterThan(29);
      expect(planned.label.length, id).toBeGreaterThan(0);
    }
  });

  it("names the batch in the dev toast", () => {
    expect(plannedMessage("preview.toggleFullscreen")).toBeNull();
    expect(plannedMessage("canvas.nudgeLeft")).toBeNull();
    expect(plannedMessage("edit.freezeFrame")).toBeNull();
    expect(plannedMessage("edit.punchZoom")).toBeNull();
    expect(plannedMessage("add.title")).toBeNull();
    expect(plannedMessage("text.edit")).toBeNull();
    expect(plannedMessage("marker.add")).toBeNull();
    expect(plannedMessage("clipboard.paste")).toBeNull();
    expect(plannedMessage("app.commandPalette")).toBeNull();
    expect(plannedMessage("app.export")).toBe("Export: coming in Batch 44");
    expect(plannedMessage("timeline.zoomToSelection")).toBeNull();
    expect(plannedMessage("edit.duplicate")).toBeNull();
  });
});
