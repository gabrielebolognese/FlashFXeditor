import { describe, expect, it } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../core/document/fixtures.js";
import type { MediaClip, Project } from "../core/document/types.js";
import { exportNeeds } from "./inputs.js";

function project(): Project {
  let doc = makeProject();
  doc = { ...doc, tracks: [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")], media: { a: makeMedia("a"), b: makeMedia("b"), pic: makeMedia("pic", "image"), song: makeMedia("song", "audio") } };
  doc = addCaptionTrack(doc);
  const clip = (fields: Parameters<typeof makeMediaClip>[1]) => makeMediaClip(doc, fields);
  return withClips(doc, [
    clip({ id: "a1", trackId: "v1", start: 0, duration: 30, mediaId: "a" }),
    { ...clip({ id: "b1", trackId: "v1", start: 30, duration: 30, mediaId: "b" }), transitionIn: { id: "t", kind: "crossDissolve", before: 5, after: 5 } } as MediaClip,
    clip({ id: "pic1", trackId: "v2", start: 100, duration: 30, mediaId: "pic", kind: "image" }),
    clip({ id: "song1", trackId: "a1", start: 0, duration: 200, mediaId: "song", kind: "audio" }),
    makeSolidClip({ id: "s1", trackId: "v2", start: 0, duration: 10 }),
    makeTextClip({ id: "t1", trackId: "v2", start: 20, duration: 10, value: "Hello" }),
    makeCaptionClip({ id: "c1", trackId: "cc", start: 40, duration: 10, text: "A cue" }),
  ]);
}

describe("exportNeeds", () => {
  it("lists the media of video tracks and the text drawn in the range", () => {
    const doc = project();
    const needs = exportNeeds(doc, { start: 0, end: 200 });
    expect(needs.media).toEqual(["a", "b", "pic"]);
    expect(needs.texts.map(({ text }) => text)).toEqual(["Hello", "A cue"]);
    expect(needs.texts[1]?.style).toBe(doc.captionTracks.cc?.style.text);
  });

  it("leaves out what the range does not reach, counting a transition's handle", () => {
    const doc = project();
    // b1 starts at 30 but plays from 25 (its transition's handle).
    expect(exportNeeds(doc, { start: 0, end: 26 }).media).toEqual(["a", "b"]);
    expect(exportNeeds(doc, { start: 0, end: 25 }).media).toEqual(["a"]);
    expect(exportNeeds(doc, { start: 0, end: 25 }).texts.map(({ text }) => text)).toEqual(["Hello"]);
    expect(exportNeeds(doc, { start: 60, end: 100 })).toEqual({ media: [], texts: [] });
  });
});
