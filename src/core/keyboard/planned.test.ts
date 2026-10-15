import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP } from "./keymap.js";
import { PLANNED_COMMANDS, plannedMessage } from "./planned.js";

describe("planned commands", () => {
  it("lists only keymap commands, each with a later batch and a name", () => {
    const ids = new Set(DEFAULT_KEYMAP.map((binding) => binding.id));
    for (const [id, planned] of Object.entries(PLANNED_COMMANDS)) {
      expect(ids.has(id), id).toBe(true);
      expect(planned.batch, id).toBeGreaterThan(19);
      expect(planned.label.length, id).toBeGreaterThan(0);
    }
  });

  it("names the batch in the dev toast", () => {
    expect(plannedMessage("preview.toggleFullscreen")).toBe("Fullscreen preview: coming in Batch 21");
    expect(plannedMessage("marker.add")).toBeNull();
    expect(plannedMessage("clipboard.paste")).toBe("Paste: coming in Batch 39");
    expect(plannedMessage("timeline.zoomToSelection")).toBeNull();
  });
});
