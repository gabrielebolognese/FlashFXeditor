import { afterEach, describe, expect, it } from "vitest";
import { isPanelId, panelEpochs, panelFaults, panelOfFlags, reloadPanels, reportPanelFault, runPanelReload } from "./panelErrors.js";

afterEach(() => {
  panelFaults.set({});
  panelEpochs.set({});
});

describe("panel faults (Batch 47)", () => {
  it("keeps the first fault of a panel until it is reloaded, and bumps its epoch", () => {
    reportPanelFault("timeline", new Error("Cannot read properties of undefined (reading 'start')"));
    reportPanelFault("timeline", new Error("later"));
    expect(panelFaults.getState()).toEqual({ timeline: "Cannot read properties of undefined (reading 'start')" });
    expect(reloadPanels(["timeline"])).toEqual(["timeline"]);
    expect(panelFaults.getState()).toEqual({});
    expect(panelEpochs.getState()).toEqual({ timeline: 1 });
  });

  it("reloads the named panel, else every failed one, else the panel that had the keyboard", () => {
    reportPanelFault("media", "boom");
    reportPanelFault("preview", new TypeError("x is not a function"));
    runPanelReload(null, "media");
    expect(panelFaults.getState()).toEqual({ preview: "x is not a function" });
    runPanelReload(null);
    expect(panelFaults.getState()).toEqual({});
    expect(panelEpochs.getState()).toEqual({ media: 1, preview: 1 });
    runPanelReload({ scope: "timeline", phase: "down", repeat: false });
    expect(panelEpochs.getState()).toEqual({ media: 1, preview: 1, timeline: 1 });
    // A scope that is no panel (a dialog) reloads nothing.
    runPanelReload({ scope: "dialog", phase: "down", repeat: false });
    expect(panelEpochs.getState()).toEqual({ media: 1, preview: 1, timeline: 1 });
  });

  it("maps canvas flags to their panels", () => {
    expect(panelOfFlags(["timelineOverlay"])).toBe("timeline");
    expect(panelOfFlags(["preview", "previewOverlay"])).toBe("preview");
    expect(panelOfFlags(["meters"])).toBe("preview");
    expect(panelOfFlags(["mediaThumbs"])).toBe("media");
    expect(panelOfFlags(["devStats"])).toBeNull();
    expect(isPanelId("properties")).toBe(true);
    expect(isPanelId("dialog")).toBe(false);
  });
});
