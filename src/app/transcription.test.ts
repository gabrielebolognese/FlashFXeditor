import { describe, expect, it } from "vitest";
import { makeMediaClip, makeProject, makeTrack, withClips } from "../core/document/fixtures.js";
import { transcribeRange } from "./transcription.js";

function project() {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  return withClips(p, [{ ...makeMediaClip(p, { id: "c1", trackId: "a1", start: 30, duration: 270, mediaId: "m", kind: "audio" }) }]);
}

describe("transcribeRange", () => {
  const none = { inPoint: null, outPoint: null };

  it("is the whole timeline, from frame 0 to the content end, without an in/out range", () => {
    expect(transcribeRange(project(), none, "inOut")).toEqual({ start: 0, end: 300 });
    expect(transcribeRange(project(), none, "all")).toEqual({ start: 0, end: 300 });
  });

  it("is the in/out range when one is set, unless the whole timeline is chosen", () => {
    expect(transcribeRange(project(), { inPoint: 60, outPoint: 120 }, "inOut")).toEqual({ start: 60, end: 120 });
    // An in point alone runs to the content end.
    expect(transcribeRange(project(), { inPoint: 60, outPoint: null }, "inOut")).toEqual({ start: 60, end: 300 });
    expect(transcribeRange(project(), { inPoint: 60, outPoint: 120 }, "all")).toEqual({ start: 0, end: 300 });
  });

  it("is null on an empty timeline", () => {
    const empty = makeProject();
    empty.tracks.push(makeTrack("v1"));
    expect(transcribeRange(empty, none, "all")).toBeNull();
  });
});
