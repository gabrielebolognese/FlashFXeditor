import { describe, expect, it, vi } from "vitest";
import { addMedia, removeMedia } from "../core/commands/mediaCommands.js";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import type { MediaId, MediaItem } from "../core/document/types.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { AnalysisScheduler } from "./AnalysisScheduler.js";

const pending = (id: string, kind: MediaItem["kind"] = "video"): MediaItem => ({ ...makeMedia(id, kind), analysis: { thumbs: kind === "video" ? "pending" : "none", peaks: kind === "image" ? "none" : "pending" } });

function setup(project = makeProject()) {
  const documentStore = new DocumentStore(project, { session: createSessionStore(), validate: true });
  const peaks = { request: vi.fn(), forget: vi.fn(), dispose: vi.fn() };
  const thumbs = { sync: vi.fn(), dispose: vi.fn() };
  const scheduler = new AnalysisScheduler({ peaks, thumbs });
  const stop = scheduler.attach(documentStore);
  return { documentStore, peaks, thumbs, scheduler, stop };
}

describe("AnalysisScheduler", () => {
  it("hands every audio-bearing media to the peaks jobs and the media to the thumbnails", () => {
    const { documentStore, peaks, thumbs } = setup();
    documentStore.dispatch(addMedia([pending("v"), pending("a", "audio"), pending("i", "image"), { ...pending("s"), hasAudio: false, analysis: { thumbs: "pending", peaks: "none" } }]));
    expect(peaks.request.mock.calls.map(([id]) => id)).toEqual(["v", "a"]);
    const media = thumbs.sync.mock.lastCall?.[0] as Record<MediaId, MediaItem>;
    expect(Object.keys(media)).toEqual(["v", "a", "i", "s"]);
  });

  it("checks media already marked ready once per session (the cache is disposable)", () => {
    const project = makeProject();
    project.media.a = { ...pending("a", "audio"), analysis: { thumbs: "none", peaks: "ready" } };
    const { peaks, thumbs } = setup(project);
    expect(peaks.request).toHaveBeenCalledWith("a");
    expect(thumbs.sync).toHaveBeenCalledTimes(1);
  });

  it("forgets the peaks of media that leave the project, and asks again when an undo brings them back", () => {
    const { documentStore, peaks } = setup();
    documentStore.dispatch(addMedia([pending("a", "audio")]));
    documentStore.dispatch(removeMedia(["a"]));
    expect(peaks.forget).toHaveBeenCalledWith("a");
    peaks.request.mockClear();
    documentStore.undo();
    expect(peaks.request).toHaveBeenCalledWith("a");
  });

  it("stops both jobs on dispose", () => {
    const { scheduler, peaks, thumbs, stop } = setup();
    stop();
    scheduler.dispose();
    expect(peaks.dispose).toHaveBeenCalled();
    expect(thumbs.dispose).toHaveBeenCalled();
  });
});
