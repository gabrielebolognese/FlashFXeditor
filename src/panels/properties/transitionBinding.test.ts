import { describe, expect, it, vi } from "vitest";
import { transitionLive, transitionLivePreview } from "../../app/transitionPreview.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { Compositor } from "../../render/compositor/Compositor.js";
import { addTransition, transitionAt } from "../../timeline/edit/transitions.js";
import { liveTransitionBinding } from "./transitionBinding.js";

const fps = makeProject().settings.fps;
const cut = { left: "A", right: "B" };

function clip(id: string, start: number, from: number): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId: "v1", start, duration: 60, mediaId: "m", kind: "video" });
  return { ...base, in: frameToUs(from, fps), out: frameToUs(from + 60, fps) };
}

function setup() {
  const p: Project = makeProject();
  p.media.m = { ...makeMedia("m", "video", 100_000_000), width: 1920, height: 1080 };
  p.tracks.push({ ...makeTrack("v1"), targeted: true });
  let n = 0;
  const document = new DocumentStore(withClips(p, [clip("A", 0, 0) as Clip, clip("B", 60, 300) as Clip]), { session: createSessionStore(), validate: true, newId: () => `id${++n}` });
  document.dispatch(addTransition(document.getState(), cut, "wipe", { newId: () => "t1" })!.command);
  const softness = liveTransitionBinding({ document, live: transitionLive, linked: () => false }, cut, (t) => Math.round((t.softness ?? 0) * 100), (value) => ({ softness: value / 100 }));
  return { document, softness };
}

const fxSoftness = (project: Project): number | undefined => {
  const layer = new Compositor().evaluate(project, 60).layers[0] as unknown as { fx?: { softness: number } };
  return layer.fx?.softness;
};

describe("transition field bindings (Batch 71 review: live preview, P2)", () => {
  it("shows a Softness scrub in the evaluated draw list before the commit, then writes one undo step", () => {
    const { document, softness } = setup();
    const before = document.getState();
    const changed = vi.fn();
    document.subscribe(changed);
    const start = softness.read() as number;
    softness.change(30, "scrub");
    softness.change(50, "scrub");
    expect(softness.read()).toBe(start + 50);
    expect(document.getState()).toBe(before);
    expect(changed).not.toHaveBeenCalled();
    const live = transitionLivePreview(document.getState(), transitionLive.getState(), 60);
    expect(live).not.toBeNull();
    expect(transitionAt(live!.project, cut)?.softness).toBeCloseTo((start + 50) / 100);
    expect(fxSoftness(live!.project)).toBeCloseTo((start + 50) / 100);
    expect(fxSoftness(document.getState())).not.toBeCloseTo((start + 50) / 100);
    softness.change(50, "commit");
    expect(transitionLive.getState()).toBeNull();
    expect(transitionAt(document.getState(), cut)?.softness).toBeCloseTo((start + 50) / 100);
    expect(changed).toHaveBeenCalledTimes(1);
    const undoSteps = document.history.getState().undoLabel;
    expect(undoSteps).toBeTruthy();
    document.undo();
    expect(transitionAt(document.getState(), cut)?.softness).toBeCloseTo(start / 100);
    expect(transitionAt(document.getState(), cut)?.kind).toBe("wipe");
  });

  it("a cancelled scrub leaves the document and the live values as they were", () => {
    const { document, softness } = setup();
    const before = document.getState();
    softness.change(20, "scrub");
    expect(transitionLive.getState()).not.toBeNull();
    softness.change(0, "cancel");
    expect(transitionLive.getState()).toBeNull();
    expect(document.getState()).toBe(before);
    expect(transitionLivePreview(document.getState(), transitionLive.getState(), 60)).toBeNull();
  });
});
