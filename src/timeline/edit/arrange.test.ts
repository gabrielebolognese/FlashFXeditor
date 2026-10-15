import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { arrangeLayers } from "./arrange.js";

function clip(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" }), ...extra };
}

/** V1, V2 (bottom to top), then A1. */
function project(clips: Clip[], tracks: Track[] = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")]): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m", "video", 100_000_000), width: 1080, height: 1920 };
  p.tracks.push(...tracks);
  return withClips(p, clips);
}

function run(p: Project, ids: string[], direction: "forward" | "backward"): Project {
  let n = 0;
  const s = new DocumentStore(p, { session: createSessionStore(), validate: true });
  const command = arrangeLayers(p, ids, direction, () => `new${++n}`);
  if (!command) throw new Error("no command");
  s.dispatch(command);
  return s.getState();
}

const layout = (p: Project) => p.tracks.filter((track) => track.kind === "video").map((track) => `${track.id}:${track.clipIds.join(",")}`);

describe("arrangeLayers (spec §7.2 Bring forward / Send backward)", () => {
  it("moves a clip to the adjacent video track when it is free there", () => {
    const p = run(project([clip("a", "v1", 0, 30), clip("b", "v2", 40, 30)]), ["a"], "forward");
    expect(layout(p)).toEqual(["v1:", "v2:a,b"]);
    expect(p.clips.a?.trackId).toBe("v2");
    const back = run(p, ["a"], "backward");
    expect(layout(back)).toEqual(["v1:a", "v2:b"]);
  });

  it("creates a track past the neighbour when it is taken, so the layer passes the one above or below", () => {
    const p = run(project([clip("a", "v1", 0, 30), clip("b", "v2", 10, 30)]), ["a"], "forward");
    expect(layout(p)).toEqual(["v1:", "v2:b", "new1:a"]);
    expect(p.tracks.find((track) => track.id === "new1")?.name).toBe("V3");
    const back = run(project([clip("a", "v1", 0, 30), clip("b", "v2", 10, 30)]), ["b"], "backward");
    expect(layout(back)).toEqual(["new1:b", "v1:a", "v2:"]);
  });

  it("creates a track at the top or bottom, and passes locked, hidden or muted neighbours", () => {
    expect(layout(run(project([clip("a", "v2", 0, 30)]), ["a"], "forward"))).toEqual(["v1:", "v2:", "new1:a"]);
    expect(layout(run(project([clip("a", "v1", 0, 30)]), ["a"], "backward"))).toEqual(["new1:a", "v1:", "v2:"]);
    for (const flag of ["locked", "hidden", "muted"] as const) {
      const v2 = { ...makeTrack("v2"), [flag]: true };
      expect(layout(run(project([clip("a", "v1", 0, 30)], [makeTrack("v1"), v2, makeTrack("a1", "audio")]), ["a"], "forward"))).toEqual(["v1:", "v2:", "new1:a"]);
    }
  });

  it("moves several clips one by one without collisions, keeping links and time", () => {
    const p = run(project([clip("a", "v1", 0, 30, { linkGroup: "L" }), clip("b", "v2", 0, 30), clip("au", "a1", 0, 30, { linkGroup: "L" })]), ["a", "b", "au"], "forward");
    expect(layout(p)).toEqual(["v1:", "v2:a", "new1:b"]);
    expect(p.clips.au?.trackId).toBe("a1");
    expect(p.clips.a).toMatchObject({ start: 0, duration: 30, linkGroup: "L" });
  });

  it("does nothing for clips on locked tracks or audio tracks", () => {
    const p = project([clip("a", "v1", 0, 30), clip("au", "a1", 0, 30)], [{ ...makeTrack("v1"), locked: true }, makeTrack("v2"), makeTrack("a1", "audio")]);
    expect(arrangeLayers(p, ["a", "au"], "forward", () => "x")).toBeNull();
    expect(arrangeLayers(p, ["zz"], "backward", () => "x")).toBeNull();
  });
});
