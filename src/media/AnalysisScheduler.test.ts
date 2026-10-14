import { describe, expect, it, vi } from "vitest";
import { addMedia, removeMedia } from "../core/commands/mediaCommands.js";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import type { MediaItem } from "../core/document/types.js";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { AnalysisScheduler } from "./AnalysisScheduler.js";

const pending = (id: string, kind: MediaItem["kind"] = "video"): MediaItem => ({ ...makeMedia(id, kind), analysis: { thumbs: kind === "video" ? "pending" : "none", peaks: kind === "image" ? "none" : "pending" } });

function setup() {
  const slices: ((deadline: { timeRemaining(): number }) => void)[] = [];
  const idle = new IdleQueue(
    (cb) => slices.push(cb),
    () => undefined,
  );
  const runIdle = () => slices.splice(0).forEach((cb) => cb({ timeRemaining: () => 50 }));
  const documentStore = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
  const scheduler = new AnalysisScheduler(idle);
  scheduler.attach(documentStore);
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
  return { idle, runIdle, documentStore, scheduler };
}

describe("AnalysisScheduler", () => {
  it("queues one idle task per media with pending analysis", () => {
    const { idle, runIdle, documentStore, scheduler } = setup();
    documentStore.dispatch(addMedia([pending("v"), pending("a", "audio"), pending("i", "image")]));
    expect(scheduler.waiting).toEqual(["v", "a"]);
    expect(idle.size).toBe(2);
    runIdle();
    expect([...scheduler.reached]).toEqual(["v", "a"]);
    expect(scheduler.waiting).toEqual([]);
  });

  it("never queues the same media twice in a session", () => {
    const { idle, runIdle, documentStore } = setup();
    documentStore.dispatch(addMedia([pending("v")]));
    runIdle();
    documentStore.dispatch(addMedia([pending("w")]));
    expect(idle.size).toBe(1);
  });

  it("cancels the task of media removed before it ran, and queues it again on undo", () => {
    const { idle, documentStore, scheduler } = setup();
    documentStore.dispatch(addMedia([pending("v")]));
    documentStore.dispatch(removeMedia(["v"]));
    expect(idle.size).toBe(0);
    expect(scheduler.waiting).toEqual([]);
    documentStore.undo();
    expect(scheduler.waiting).toEqual(["v"]);
  });

  it("picks up pending media of an opened project and stops on dispose", () => {
    const project = makeProject();
    project.media.v = pending("v");
    const documentStore = new DocumentStore(project, { session: createSessionStore(), validate: true });
    const idle = new IdleQueue(
      () => 1,
      () => undefined,
    );
    const scheduler = new AnalysisScheduler(idle);
    scheduler.attach(documentStore);
    expect(scheduler.waiting).toEqual(["v"]);
    scheduler.dispose();
    expect(idle.size).toBe(0);
  });
});
