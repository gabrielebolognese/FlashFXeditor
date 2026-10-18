import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../core/document/fixtures.js";
import { frameToUs } from "../core/document/time.js";
import type { MediaClip, Project } from "../core/document/types.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { addTransition, transitionAt } from "../timeline/edit/transitions.js";
import { alignmentHover, alignmentPreview, hoverAlignment } from "./transitionPreview.js";

const fps = makeProject().settings.fps;

function clip(id: string, start: number, frames: number, from: number): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId: "v1", start, duration: frames, mediaId: "m", kind: "video" });
  return { ...base, in: frameToUs(from, fps), out: frameToUs(from + frames, fps) };
}

/** A|B cut at frame 60 with a centered 20-frame dissolve (both clips have media to spare). */
function dissolved(): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push({ ...makeTrack("v1"), targeted: true });
  const doc = new DocumentStore(withClips(p, [clip("A", 0, 60, 100), clip("B", 60, 60, 300)]), { session: createSessionStore(), validate: true });
  let n = 0;
  doc.dispatch(addTransition(doc.getState(), { left: "A", right: "B" }, "crossDissolve", { length: 20, newId: () => `t${++n}` })!.command);
  return doc.getState();
}

const cut = { left: "A", right: "B" };

describe("the transition alignment preview (Batch 46)", () => {
  it("splits at the first and last frame of the transition as each alignment would place it, committing nothing", () => {
    const project = dissolved();
    expect(transitionAt(project, cut)).toMatchObject({ before: 10, after: 10 });
    expect(alignmentPreview(project, { cut, alignment: "center" })?.previewSplit).toEqual({ leftFrame: 50, rightFrame: 69 });
    const start = alignmentPreview(project, { cut, alignment: "start" });
    expect(start?.previewSplit).toEqual({ leftFrame: 60, rightFrame: 79 });
    expect(start?.frame).toBe(60);
    expect(transitionAt(start!.project, cut)).toMatchObject({ before: 0, after: 20 });
    expect(alignmentPreview(project, { cut, alignment: "end" })?.previewSplit).toEqual({ leftFrame: 40, rightFrame: 59 });
    // The document itself is untouched.
    expect(transitionAt(project, cut)).toMatchObject({ before: 10, after: 10 });
  });

  it("is nothing without a hover or once the cut has no transition", () => {
    const project = dissolved();
    expect(alignmentPreview(project, null)).toBeNull();
    expect(alignmentPreview(project, { cut: { left: "B", right: "A" }, alignment: "center" })).toBeNull();
  });

  it("writes the hover store only when the choice changes", () => {
    let writes = 0;
    const stop = alignmentHover.subscribe(() => (writes += 1));
    hoverAlignment({ cut, alignment: "start" });
    hoverAlignment({ cut: { ...cut }, alignment: "start" });
    hoverAlignment({ cut, alignment: "end" });
    hoverAlignment(null);
    hoverAlignment(null);
    stop();
    expect(writes).toBe(3);
  });
});
