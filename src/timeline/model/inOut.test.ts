import { describe, expect, it } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { EMPTY_SELECTION, selectClips, selectTracks } from "../../core/store/selection.js";
import { clipToMark, dragIn, dragOut, lastFrameOf, markedRange, markIn, markOut, rangeOf, selectionSpan, tracksTopDown } from "./inOut.js";

const none = { inPoint: null, outPoint: null };

describe("in/out", () => {
  it("I sets the first frame, O the boundary after the frame on screen", () => {
    expect(markIn(none, 30)).toEqual({ inPoint: 30, outPoint: null });
    expect(markOut(none, 59)).toEqual({ inPoint: null, outPoint: 60 });
    expect(markOut(markIn(none, 30), 59)).toEqual({ inPoint: 30, outPoint: 60 });
    expect(lastFrameOf(60)).toBe(59);
    // O on the in frame keeps a one-frame range.
    expect(markOut({ inPoint: 30, outPoint: null }, 30)).toEqual({ inPoint: 30, outPoint: 31 });
  });

  it("a point on the wrong side of the other clears it", () => {
    expect(markIn({ inPoint: 10, outPoint: 60 }, 60)).toEqual({ inPoint: 60, outPoint: null });
    expect(markIn({ inPoint: 10, outPoint: 60 }, 59)).toEqual({ inPoint: 59, outPoint: 60 });
    expect(markOut({ inPoint: 30, outPoint: 60 }, 29)).toEqual({ inPoint: null, outPoint: 30 });
  });

  it("handle drags keep at least one frame between the points", () => {
    expect(dragIn({ inPoint: 10, outPoint: 60 }, 80)).toEqual({ inPoint: 59, outPoint: 60 });
    expect(dragIn({ inPoint: 10, outPoint: 60 }, -5)).toEqual({ inPoint: 0, outPoint: 60 });
    expect(dragIn({ inPoint: 10, outPoint: null }, 500.4)).toEqual({ inPoint: 500, outPoint: null });
    expect(dragOut({ inPoint: 10, outPoint: 60 }, 3)).toEqual({ inPoint: 10, outPoint: 11 });
    expect(dragOut({ inPoint: null, outPoint: 60 }, -3)).toEqual({ inPoint: null, outPoint: 1 });
  });

  it("marks [in, out) with in defaulting to 0 and out to the content end", () => {
    expect(markedRange(none, 300)).toBeNull();
    expect(markedRange({ inPoint: 30, outPoint: 60 }, 300)).toEqual({ start: 30, end: 60 });
    expect(markedRange({ inPoint: 30, outPoint: null }, 300)).toEqual({ start: 30, end: 300 });
    expect(markedRange({ inPoint: null, outPoint: 60 }, 300)).toEqual({ start: 0, end: 60 });
    expect(markedRange({ inPoint: 300, outPoint: null }, 300)).toBeNull();
    expect(rangeOf({ start: 5, end: 9 })).toEqual({ inPoint: 5, outPoint: 9 });
    expect(rangeOf(null)).toEqual(none);
  });
});

describe("clipToMark (X)", () => {
  function project() {
    let doc = makeProject();
    doc.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")].map((track) => ({ ...track, targeted: true }));
    doc = withClips(doc, [
      makeSolidClip({ id: "low", trackId: "v1", start: 0, duration: 100 }),
      makeSolidClip({ id: "top", trackId: "v2", start: 40, duration: 20 }),
      makeSolidClip({ id: "next", trackId: "v2", start: 60, duration: 30 }),
    ]);
    return doc;
  }

  it("stacks tracks top-down: captions and video from the highest, then audio", () => {
    const doc = project();
    doc.tracks.splice(2, 0, makeTrack("cc", "caption"));
    expect(tracksTopDown(doc).map((track) => track.id)).toEqual(["cc", "v2", "v1", "a1"]);
  });

  it("takes the topmost clip under the frame, a clip starting there owning the cut", () => {
    const doc = project();
    expect(clipToMark(doc, 45)?.id).toBe("top");
    expect(clipToMark(doc, 60)?.id).toBe("next");
    expect(clipToMark(doc, 95)?.id).toBe("low");
    expect(clipToMark(doc, 100)).toBeNull();
  });

  it("spans the selected clips, a track selection's clips, the gap or the edit point", () => {
    const doc = project();
    expect(selectionSpan(doc, selectClips(["top", "next"]), null, null)).toEqual({ start: 40, end: 90 });
    expect(selectionSpan(doc, selectTracks(["v1"]), null, null)).toEqual({ start: 0, end: 100 });
    expect(selectionSpan(doc, EMPTY_SELECTION, { trackId: "v2", start: 0, end: 40 }, null)).toEqual({ start: 0, end: 40 });
    expect(selectionSpan(doc, EMPTY_SELECTION, null, { left: "top", right: "next" })).toEqual({ start: 40, end: 90 });
    expect(selectionSpan(doc, EMPTY_SELECTION, null, null)).toBeNull();
  });

  it("prefers a selected clip, then targeted tracks", () => {
    const doc = project();
    expect(clipToMark(doc, 45, new Set(["low"]))?.id).toBe("low");
    expect(clipToMark(doc, 45, new Set(["top", "low"]), "low")?.id).toBe("low");
    (doc.tracks[1] as { targeted: boolean }).targeted = false;
    expect(clipToMark(doc, 45)?.id).toBe("low");
    (doc.tracks[0] as { targeted: boolean }).targeted = false;
    expect(clipToMark(doc, 45)?.id).toBe("top");
  });
});
