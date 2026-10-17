import { describe, expect, it } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Project } from "../../core/document/types.js";
import { EMPTY_SELECTION, selectClips, selectTracks } from "../../core/store/selection.js";
import { contextKey, propertiesContext, sectionIds, shared } from "./context.js";

function project(): Project {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio"));
  const clips: Clip[] = [
    makeMediaClip(p, { id: "v", trackId: "v1", start: 0, duration: 30, mediaId: "m" }),
    makeMediaClip(p, { id: "a", trackId: "a1", start: 0, duration: 30, mediaId: "m", kind: "audio" }),
    makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 30 }),
    makeTextClip({ id: "t", trackId: "v3", start: 0, duration: 30 }),
  ];
  return withClips(p, clips);
}

describe("properties context (spec §11)", () => {
  it("shows the project with nothing selected, a marker before anything, tracks for a track selection", () => {
    const p = project();
    expect(sectionIds(propertiesContext(EMPTY_SELECTION, null, p))).toEqual(["project"]);
    expect(propertiesContext(selectClips(["v"]), "mk", p)).toEqual({ kind: "marker", markerId: "mk" });
    expect(sectionIds(propertiesContext(EMPTY_SELECTION, "mk", p))).toEqual(["marker"]);
    expect(propertiesContext(selectTracks(["v2", "gone", "v1"]), null, p)).toEqual({ kind: "track", trackIds: ["v2", "v1"], captionTrackId: null });
    expect(sectionIds(propertiesContext(selectTracks(["v1"]), null, p))).toEqual(["track"]);
    expect(propertiesContext(selectTracks(["gone"]), null, p)).toEqual({ kind: "none" });
  });

  it("lists the clips with their primary and the layers among them; layers add Transform and Opacity, media layers Crop, video and audio Speed", () => {
    const p = project();
    const linked = propertiesContext(selectClips(["a", "v"], "a"), null, p);
    expect(linked).toEqual({ kind: "clips", clipIds: ["a", "v"], primary: "a", layerIds: ["v"], layerPrimary: "v", mediaIds: ["v"], speedIds: ["a", "v"], textIds: [], solidIds: [], captionTrackId: null });
    expect(sectionIds(linked)).toEqual(["clip", "transform", "crop", "opacity", "speed"]);
    const audio = propertiesContext(selectClips(["a"]), null, p);
    expect(sectionIds(audio)).toEqual(["clip", "speed"]);
    const solid = propertiesContext(selectClips(["gone", "s"], "gone"), null, p);
    expect(solid).toMatchObject({ clipIds: ["s"], primary: "s", layerPrimary: "s", mediaIds: [], speedIds: [] });
    expect(sectionIds(solid)).toEqual(["clip", "solid", "transform", "opacity"]);
    expect(solid).toMatchObject({ solidIds: ["s"] });
    expect(propertiesContext(selectClips(["s", "v"]), null, p)).toMatchObject({ layerIds: ["s", "v"], mediaIds: ["v"] });
    expect(propertiesContext(selectClips(["gone"]), null, p)).toEqual({ kind: "none" });
  });

  it("adds Text right after Clip for text clips (Batch 28), then Animation (Batch 31)", () => {
    const p = project();
    const text = propertiesContext(selectClips(["t", "s"]), null, p);
    expect(text).toMatchObject({ layerIds: ["t", "s"], textIds: ["t"], solidIds: ["s"], mediaIds: [] });
    expect(sectionIds(text)).toEqual(["clip", "text", "animation", "solid", "transform", "opacity"]);
  });

  it("adds Caption style for cues and for the caption track (Batch 32)", () => {
    const base = addCaptionTrack(project());
    const p = withClips(base, [makeCaptionClip({ id: "q", trackId: "cc", start: 0, duration: 30 })]);
    const cue = propertiesContext(selectClips(["q"]), null, p);
    expect(cue).toMatchObject({ kind: "clips", captionTrackId: "cc", layerIds: [], textIds: [] });
    expect(sectionIds(cue)).toEqual(["clip", "captionStyle"]);
    expect(sectionIds(propertiesContext(selectClips(["q", "t"]), null, p))).toEqual(["clip", "text", "animation", "captionStyle", "transform", "opacity"]);
    const track = propertiesContext(selectTracks(["cc"]), null, p);
    expect(track).toEqual({ kind: "track", trackIds: ["cc"], captionTrackId: "cc" });
    expect(sectionIds(track)).toEqual(["track", "captionStyle"]);
  });

  it("keys the context by kind, primary, ids and marker (React renders the panel when it changes)", () => {
    expect(contextKey(selectClips(["a", "v"], "v"), null)).toBe("clips:v:a,v");
    expect(contextKey(selectClips(["a", "v"], "a"), null)).not.toBe(contextKey(selectClips(["a", "v"], "v"), null));
    expect(contextKey(selectTracks(["v1", "v2"]), null)).toBe("track::v1,v2");
    expect(contextKey(EMPTY_SELECTION, "m1")).toBe("marker:m1");
  });

  it("finds the shared value or a mix", () => {
    expect(shared([], (n: number) => n)).toBeNull();
    expect(shared([0.5, 0.5], (n) => n)).toEqual({ value: 0.5, mixed: false });
    expect(shared([0.5, 0.25, 1], (n) => n)).toEqual({ value: 0.5, mixed: true });
    expect(shared(["a", "A"], (s) => s, (x, y) => x.toLowerCase() === y.toLowerCase())).toEqual({ value: "a", mixed: false });
  });
});
