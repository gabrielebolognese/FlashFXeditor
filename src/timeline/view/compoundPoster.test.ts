import { describe, expect, it } from "vitest";
import { makeCompoundClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project, Sequence } from "../../core/document/types.js";
import { drawCompoundPoster, type PosterContext } from "./compoundPoster.js";

function recorder(): { ctx: PosterContext; calls: string[] } {
  const calls: string[] = [];
  const log = (name: string) => (...args: unknown[]) => void calls.push(`${name}(${args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : typeof a === "string" ? a : "…")).join(",")})`);
  const ctx = {
    save: log("save"),
    restore: log("restore"),
    beginPath: log("beginPath"),
    rect: log("rect"),
    clip: log("clip"),
    fillRect: log("fillRect"),
    fill: log("fill"),
    translate: log("translate"),
    rotate: log("rotate"),
    scale: log("scale"),
    ellipse: log("ellipse"),
    roundRect: log("roundRect"),
    drawImage: log("drawImage"),
    fillText: log("fillText"),
    globalAlpha: 1,
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as PosterContext;
  return { ctx, calls };
}

const colors = { backdrop: "backdrop", placeholder: "placeholder" };

function project(): { project: Project; sequence: Sequence } {
  const base = makeProject();
  base.media.m = makeMedia("m");
  base.tracks.push(makeTrack("v1"));
  const sequence: Sequence = {
    id: "q",
    name: "Card",
    size: { w: 1080, h: 1920 },
    duration: 60,
    background: null,
    tracks: [makeTrack("c1", "video", ["s", "t", "i"]), makeTrack("c2", "video", [])],
  };
  const clips: Clip[] = [
    makeSolidClip({ id: "s", trackId: "c1", start: 0, duration: 60 }),
    makeTextClip({ id: "t", trackId: "c1", start: 0, duration: 60, value: "Hello\nsecond" }),
    { ...makeMediaClip(base, { id: "i", trackId: "c1", start: 0, duration: 60, mediaId: "m" }), kind: "image" } as MediaClip,
  ];
  // The fixture helper puts clips on project tracks: put these on the sequence's own.
  const withInner = withClips({ ...base, sequences: { q: sequence } }, clips);
  const seq: Sequence = { ...sequence, tracks: [makeTrack("c1", "video", ["s"]), makeTrack("c2", "video", ["t"])] };
  const doc = { ...withInner, sequences: { q: seq }, clips: { ...withInner.clips, s: { ...withInner.clips.s, trackId: "c1" }, t: { ...withInner.clips.t, trackId: "c2" } } } as Project;
  return { project: doc, sequence: seq };
}

describe("drawCompoundPoster (spec §21.10)", () => {
  it("fits the sequence in the rect and draws its clips bottom to top", () => {
    const { project: doc, sequence } = project();
    const { ctx, calls } = recorder();
    drawCompoundPoster(ctx, doc, sequence, 10, { x: 0, y: 0, w: 320, h: 180 }, () => null, colors);
    // 1080x1920 into 320x180: contain, centered horizontally.
    expect(calls[1]).toMatch(/^translate\(109\.38,0\)/);
    const fill = calls.findIndex((call) => call.startsWith("fillRect(0,0,1080,1920"));
    const text = calls.findIndex((call) => call.startsWith("fillText(Hello"));
    expect(fill).toBeGreaterThan(-1);
    expect(text).toBeGreaterThan(fill);
    expect(calls.some((call) => call.startsWith("fillText(second"))).toBe(false);
  });

  it("draws nothing for an empty rect or a frame with no clips", () => {
    const { project: doc, sequence } = project();
    const empty = recorder();
    drawCompoundPoster(empty.ctx, doc, sequence, 0, { x: 0, y: 0, w: 0, h: 180 }, () => null, colors);
    expect(empty.calls).toEqual([]);
    const late = recorder();
    drawCompoundPoster(late.ctx, doc, { ...sequence, tracks: [makeTrack("c1")] }, 0, { x: 0, y: 0, w: 320, h: 180 }, () => null, colors);
    expect(late.calls.some((call) => call.startsWith("fillText"))).toBe(false);
  });

  it("shows a nested compound's sequence and stops at a cycle's depth", () => {
    const { project: doc, sequence } = project();
    const outerClip = makeCompoundClip({ id: "k", trackId: "o1", start: 0, duration: 60, sequenceId: "q" });
    const outer: Sequence = { id: "p", name: "Outer", size: { w: 1080, h: 1920 }, duration: 60, background: null, tracks: [makeTrack("o1", "video", ["k"])] };
    const nested = { ...doc, sequences: { ...doc.sequences, p: outer }, clips: { ...doc.clips, k: outerClip } } as Project;
    const { ctx, calls } = recorder();
    drawCompoundPoster(ctx, nested, outer, 5, { x: 0, y: 0, w: 320, h: 180 }, () => null, colors);
    expect(calls.some((call) => call.startsWith("fillText(Hello"))).toBe(true);
    // A compound that shows its own sequence (invalid, but the poster must end).
    const loop = { ...nested, clips: { ...nested.clips, k: { ...outerClip, sequenceId: "p" } } } as Project;
    const again = recorder();
    drawCompoundPoster(again.ctx, loop, outer, 5, { x: 0, y: 0, w: 320, h: 180 }, () => null, colors);
    expect(again.calls.length).toBeLessThan(200);
    void sequence;
  });

  it("uses the media picture when there is one and the placeholder when not", () => {
    const { project: doc, sequence } = project();
    const seq: Sequence = { ...sequence, tracks: [makeTrack("c1", "video", ["i"])] };
    const withImage = { ...doc, sequences: { q: seq }, clips: { ...doc.clips, i: { ...makeMediaClip(doc, { id: "i", trackId: "c1", start: 0, duration: 60, mediaId: "m" }), kind: "image" } } } as Project;
    const none = recorder();
    drawCompoundPoster(none.ctx, withImage, seq, 0, { x: 0, y: 0, w: 320, h: 180 }, () => null, colors);
    expect(none.calls.some((call) => call.startsWith("drawImage"))).toBe(false);
    const some = recorder();
    drawCompoundPoster(some.ctx, withImage, seq, 0, { x: 0, y: 0, w: 320, h: 180 }, () => ({ image: {} as CanvasImageSource, sx: 0, sy: 0, sw: 10, sh: 10 }), colors);
    expect(some.calls.some((call) => call.startsWith("drawImage"))).toBe(true);
  });
});
