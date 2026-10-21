import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../../core/document/fixtures.js";
import type { Project } from "../../../core/document/types.js";
import { SnapIndex } from "../../snap/snapIndex.js";
import { MediaDropGesture } from "./dropMedia.js";
import { NO_MODIFIERS, type MoveSnap } from "./moveClips.js";

function setup(): Project {
  let project = makeProject();
  project.media.vid = makeMedia("vid", "video", 10_000_000);
  project.media.still = makeMedia("still", "image", 0);
  project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  project = withClips(project, [makeMediaClip(project, { id: "c", trackId: "v2", start: 100, duration: 50, mediaId: "vid" })]);
  return project;
}

function snap(project: Project, pxPerFrame = 4): MoveSnap {
  return { candidates: new SnapIndex().get(project, null, null), playhead: 0, thresholdPx: 8, pxPerFrame };
}

describe("MediaDropGesture", () => {
  it("shows the video on V2 and its linked audio on a new A2 row at the pointer frame (spec §6.14)", () => {
    const project = setup();
    const drop = new MediaDropGesture(project, [{ media: project.media.vid!, range: null }]);
    expect(drop.length).toBe(300);
    const proposal = drop.update(160.4, { video: 1, audio: 1 }, NO_MODIFIERS);
    expect(proposal.ghosts.map((g) => [g.clip.kind, g.start, g.clip.duration, g.target.kind, g.target.number, g.target.track?.id ?? null])).toEqual([
      ["video", 160, 300, "video", 1, "v2"],
      ["audio", 160, 300, "audio", 1, null],
    ]);
    expect(proposal.newLanes).toEqual([{ kind: "audio", lane: 1, name: "A2" }]);
    expect(proposal.mode).toBe("overwrite");
    expect(proposal.insertFrame).toBeNull();
    expect(proposal.refused).toBeNull();
    expect(proposal.end).toBe(460);
    expect(drop.request()).toEqual({ items: [{ mediaId: "vid", range: null }], start: 160, lanes: { video: 1, audio: 1 }, mode: "overwrite" });
  });

  it("hatches what it would overwrite, snaps the block's leading or trailing edge, inserts with Mod", () => {
    const project = setup();
    const drop = new MediaDropGesture(project, [{ media: project.media.still!, range: null }]);
    // 150-frame still from 98 covers c [100, 150) on V2.
    const over = drop.update(98, { video: 1, audio: 1 }, NO_MODIFIERS);
    expect(over.ghosts[0]?.hatch).toEqual([[100, 150]]);
    // Snapping on (4 px/frame, 8 px = 2 frames): the leading edge sticks to c's end at 150...
    const lead = drop.update(151.5, { video: 0, audio: 0 }, NO_MODIFIERS, snap(project));
    expect([lead.ghosts[0]?.start, lead.snap?.frame]).toEqual([150, 150]);
    // ...and a 30-frame clip's trailing edge (71 + 30 = 101) to c's start at 100.
    const short = new MediaDropGesture(project, [{ media: project.media.vid!, range: { inUs: 0, outUs: 1_000_000 } }]);
    const trail = short.update(71, { video: 0, audio: 0 }, NO_MODIFIERS, snap(project));
    expect([trail.ghosts[0]?.start, trail.snap?.frame]).toEqual([70, 100]);
    const insert = drop.update(60, { video: 0, audio: 0 }, { ...NO_MODIFIERS, mod: true });
    expect([insert.mode, insert.insertFrame, insert.ghosts[0]?.hatch]).toEqual(["insert", 60, []]);
  });

  it("is refused over a locked track; files from the OS show only where they start", () => {
    const project = setup();
    project.tracks[1]!.locked = true;
    const drop = new MediaDropGesture(project, [{ media: project.media.vid!, range: { inUs: 0, outUs: 1_000_000 } }]);
    const refused = drop.update(0, { video: 1, audio: 0 }, NO_MODIFIERS);
    expect(refused.refused).toEqual({ reason: "lockedTarget", trackId: "v2" });
    expect(refused.ghosts.map((g) => g.hatch)).toEqual([[], []]);

    const files = new MediaDropGesture(project, []);
    const proposal = files.update(42.6, { video: 0, audio: 0 }, NO_MODIFIERS, snap(project));
    expect([proposal.ghosts.length, proposal.insertFrame, files.startFrame]).toEqual([0, 43, 43]);
    expect(files.request()).toEqual({ items: [], start: 43, lanes: { video: 0, audio: 0 }, mode: "overwrite" });
  });
});
