import { describe, expect, it } from "vitest";
import { fuzzyScore, pushRecent, rankCommands } from "./fuzzy.js";

const items = [
  { id: "edit.split", label: "Split at playhead", category: "Edit" },
  { id: "edit.closeGap", label: "Close gap", category: "Edit" },
  { id: "edit.closeAllGaps", label: "Close all gaps", category: "Edit", keywords: "compact" },
  { id: "timeline.zoomFit", label: "Zoom to fit", category: "Timeline" },
  { id: "transport.playPause", label: "Play / Pause", category: "Transport" },
];

describe("fuzzyScore", () => {
  it("matches substrings and subsequences, case-insensitive", () => {
    expect(fuzzyScore("split", "Split at playhead")).not.toBeNull();
    expect(fuzzyScore("SPL", "Split at playhead")).not.toBeNull();
    expect(fuzzyScore("sap", "Split at playhead")).not.toBeNull();
    expect(fuzzyScore("xyz", "Split at playhead")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
  });

  it("needs every word, and ranks word starts and substrings above scattered letters", () => {
    expect(fuzzyScore("close all", "Close all gaps")).not.toBeNull();
    expect(fuzzyScore("close zoom", "Close all gaps")).toBeNull();
    const start = fuzzyScore("gap", "Close gap") ?? 0;
    const scattered = fuzzyScore("gap", "Go to start of the playhead") ?? 0;
    expect(start).toBeGreaterThan(scattered);
    expect(fuzzyScore("fit", "Zoom to fit") ?? 0).toBeGreaterThan(fuzzyScore("fit", "Fade in at time") ?? 0);
  });
});

describe("rankCommands", () => {
  it("finds Close all gaps by its keyword", () => {
    const ranked = rankCommands(items, "compact", []);
    expect(ranked[0]?.id).toBe("edit.closeAllGaps");
    expect(ranked).toHaveLength(1);
  });

  it("puts recent commands first with no query, most recent first", () => {
    const ranked = rankCommands(items, "", ["timeline.zoomFit", "edit.closeGap"]);
    expect(ranked.map((item) => item.id)).toEqual(["timeline.zoomFit", "edit.closeGap", "edit.split", "edit.closeAllGaps", "transport.playPause"]);
  });

  it("orders matches by score and lifts recent ones on a tie", () => {
    expect(rankCommands(items, "close", []).map((item) => item.id)).toEqual(["edit.closeGap", "edit.closeAllGaps"]);
    expect(rankCommands(items, "close", ["edit.closeAllGaps"])[0]?.id).toBe("edit.closeAllGaps");
    expect(rankCommands(items, "edit split", [])[0]?.id).toBe("edit.split");
  });

  it("keeps a recent list without duplicates", () => {
    expect(pushRecent(["a", "b", "c"], "b", 3)).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
