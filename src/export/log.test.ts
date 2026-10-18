import { describe, expect, it } from "vitest";
import { MAX_LOG_ENTRIES, pushLogEntry, sanitizeExportLog, sanitizeRequest, type ExportLogEntry, type ExportRequest } from "./log.js";
import { DEFAULT_CUSTOM_SETTINGS, FILE_NAME_TEMPLATE, REELS_PRESET } from "./presets.js";

const request: ExportRequest = {
  kind: "video",
  presetId: "reels",
  presetName: "Reels",
  settings: REELS_PRESET.settings,
  audioFormat: "wav",
  range: { start: 30, end: 90 },
  template: "{project}-{preset}.mp4",
  destination: "project",
};

const entry = (id: string, patch: Partial<ExportLogEntry> = {}): ExportLogEntry => ({ id, name: `${id}.mp4`, status: "done", at: 1, bytes: 100, summary: "s", request, ...patch });

describe("export log", () => {
  it("keeps the newest first and at most 20 entries", () => {
    let log: ExportLogEntry[] = [];
    for (let i = 0; i < 25; i++) log = pushLogEntry(log, entry(`e${i}`));
    expect(log).toHaveLength(MAX_LOG_ENTRIES);
    expect(log[0]?.id).toBe("e24");
    expect(log.at(-1)?.id).toBe("e5");
    // The same id again moves it to the top.
    expect(pushLogEntry(log, entry("e10", { status: "failed" })).filter((e) => e.id === "e10")).toHaveLength(1);
  });

  it("reads back what it stored and drops invalid entries", () => {
    const stored = [entry("a"), entry("b", { status: "failed", error: "Disk full", bytes: 0 })].map((e) => JSON.parse(JSON.stringify(e)) as unknown);
    expect(sanitizeExportLog(stored)).toEqual([entry("a"), entry("b", { status: "failed", error: "Disk full", bytes: 0 })]);
    expect(sanitizeExportLog([{ id: "x" }, { id: "y", name: "y", status: "lost" }, "junk", entry("a"), entry("a")])).toEqual([entry("a")]);
    expect(sanitizeExportLog(null)).toEqual([]);
  });

  it("sanitizes a request field by field", () => {
    expect(sanitizeRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
    expect(sanitizeRequest({ kind: "x", range: { start: 5, end: 5 }, template: "  ", destination: "cloud", settings: "x", audioFormat: "flac" })).toEqual({
      kind: "video",
      presetId: "custom",
      presetName: "Custom",
      settings: DEFAULT_CUSTOM_SETTINGS,
      audioFormat: "wav",
      range: null,
      template: FILE_NAME_TEMPLATE,
      destination: "project",
    });
  });
});
