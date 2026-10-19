import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, ClipId, MediaClip, Project, TextClip, TextStyle } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { approximateMeasurer, setTextMeasurer } from "../../render/text/layoutCache.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { copyClips, type ClipsPayload } from "./clipboard.js";
import { attributeTargets, availableGroups, pasteAttributes, pastedSpeed, type AttributeGroup } from "./pasteAttributes.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };

function title(id: string, start: number, extra: Partial<TextClip> = {}): TextClip {
  return { ...makeTextClip({ id, trackId: "v1", start, duration: 60, value: "Hello" }), ...extra };
}

function video(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m" }), ...extra };
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m"), width: 1920, height: 1080 };
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

const payloadOf = (p: Project, ids: ClipId[], primary: ClipId): ClipsPayload => copyClips(p, ids, primary, { linked: true }) as ClipsPayload;

function apply(p: Project, payload: ClipsPayload, ids: ClipId[], groups: AttributeGroup[]): Project {
  const command = pasteAttributes(p, payload, ids, new Set(groups));
  if (!command) throw new Error("expected a command");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(command);
  expect(doc.history.getState().undoLabel).toBe("Paste attributes");
  return doc.getState();
}

const styled: TextStyle = { ...structuredClone(DEFAULT_TEXT_STYLE), fontFamily: "Oswald", fontWeight: 600, fontSize: 120, fill: { r: 1, g: 0.8, b: 0, a: 1 }, stroke: { enabled: true, width: 6, color: { r: 0, g: 0, b: 0, a: 1 } } };

/** A styled title (style, transform, opacity, animations, fades) and five plain ones. */
function titles(): Project {
  const source = title("src", 0, { style: styled, presetId: "bold", transform: { ...TRANSFORM, x: 100, y: -300, scale: 1.5 }, opacity: 0.8, animIn: { id: "pop", duration: 10 }, fades: { in: 6, out: 9 } });
  return project([source, ...[1, 2, 3, 4, 5].map((i) => ({ ...title(`t${i}`, i * 100), trackId: "v2" }))]);
}

const FIVE = ["t1", "t2", "t3", "t4", "t5"];

describe("availableGroups", () => {
  it("offers the groups a copied title gives other titles, and Keyframes with an animatable group", () => {
    const p = titles();
    expect(availableGroups(p, payloadOf(p, ["src"], "src"), FIVE)).toEqual(["transform", "opacity", "textStyle", "animations", "fades", "keyframes"]);
  });

  it("takes the picture groups from a video and the audio gain from its linked audio, onto a video's linked audio", () => {
    const p = project([video("v", "v1", 0, 30, { linkGroup: "L" }), video("a", "a1", 0, 30, { kind: "audio", linkGroup: "L" }), video("w", "v2", 50, 30, { linkGroup: "M" }), video("b", "a1", 50, 30, { kind: "audio", linkGroup: "M" })]);
    const payload = payloadOf(p, ["v"], "v");
    expect(availableGroups(p, payload, ["w"])).toEqual(["transform", "opacity", "crop", "speed", "audio", "fades", "keyframes"]);
    expect(attributeTargets(p, ["w"], "audio")).toEqual(["b"]);
    expect(availableGroups(p, payload, [])).toEqual([]);
  });
});

describe("pasteAttributes (Batch 39)", () => {
  it("gives five titles only the checked groups of a styled title, in one undo step", () => {
    const p = titles();
    const payload = payloadOf(p, ["src"], "src");
    const next = apply(p, payload, FIVE, ["textStyle", "fades"]);
    for (const id of FIVE) {
      const clip = next.clips[id] as TextClip;
      const before = p.clips[id] as TextClip;
      expect(clip.style).toEqual(styled);
      expect(clip.presetId).toBe("bold");
      expect(clip.fades).toEqual({ in: 6, out: 9 });
      // Not checked: these stay the title's own.
      expect(clip.text).toEqual(before.text);
      expect(clip.opacity).toBe(1);
      expect(clip.animIn).toBeUndefined();
      expect(clip.transform.scale).toBe(1);
    }
    const all = apply(p, payload, FIVE, ["transform", "opacity", "animations"]);
    expect(all.clips.t3).toMatchObject({ transform: { x: 100, y: -300, scale: 1.5 }, opacity: 0.8, animIn: { id: "pop", duration: 10 }, style: (p.clips.t3 as TextClip).style });
  });

  it("brings a section's keys with Keyframes (cut to the target's length); without, the values at the first frame and no keys", () => {
    const keys = { opacity: [{ frame: 0, value: 0.2, ease: "linear" as const }, { frame: 40, value: 1, ease: "linear" as const }] };
    const p = project([title("src", 0, { keyframes: keys }), title("short", 100, { duration: 20, trackId: "v2", keyframes: { "transform.x": [{ frame: 5, value: 7, ease: "linear" as const }] } })]);
    const payload = payloadOf(p, ["src"], "src");
    const keyed = apply(p, payload, ["short"], ["opacity", "keyframes"]).clips.short as TextClip;
    // 0.2 -> 1 over 40 frames: at frame 19 (the last of 20) the value is 0.2 + 0.8 * 19 / 40.
    expect(keyed.keyframes?.opacity?.map((key) => key.frame)).toEqual([0, 19]);
    expect(keyed.keyframes?.opacity?.[1]?.value).toBeCloseTo(0.2 + (0.8 * 19) / 40, 9);
    expect(keyed.keyframes?.["transform.x"]).toEqual([{ frame: 5, value: 7, ease: "linear" }]);
    const flat = apply(p, payload, ["short"], ["opacity"]).clips.short as TextClip;
    expect(flat.opacity).toBe(0.2);
    expect(flat.keyframes?.opacity).toBeUndefined();
    expect(flat.keyframes?.["transform.x"]).toBeDefined();
  });

  it("clamps fades to the target's length and crops to its media", () => {
    const p = project([video("src", "v1", 0, 90, { crop: { left: 0.25, top: 0, right: 0.25, bottom: 0.1 }, fades: { in: 30, out: 40 } }), video("tiny", "v2", 100, 50)]);
    const next = apply(p, payloadOf(p, ["src"], "src"), ["tiny"], ["crop", "fades"]).clips.tiny as MediaClip;
    expect(next.crop).toEqual({ left: 0.25, top: 0, right: 0.25, bottom: 0.1 });
    expect(next.fades).toEqual({ in: 30, out: 20 });
  });

  it("sets the gain and mute of the audio linked to a selected video; locked clips are left alone", () => {
    const p = project([video("a", "a1", 0, 30, { kind: "audio", volume: { gainDb: -6, muted: true } }), video("w", "v2", 50, 30, { linkGroup: "M" }), video("b", "a1", 50, 30, { kind: "audio", linkGroup: "M" })]);
    const next = apply(p, payloadOf(p, ["a"], "a"), ["w"], ["audio"]);
    expect((next.clips.b as MediaClip).volume).toEqual({ gainDb: -6, muted: true });
    const locked = structuredClone(p);
    (locked.tracks.find((track) => track.id === "a1") as { locked: boolean }).locked = true;
    expect(pasteAttributes(locked, payloadOf(p, ["a"], "a"), ["w"], new Set(["audio"]))).toBeNull();
  });

  it("names the pasted speed only when Speed is checked", () => {
    const p = project([video("src", "v1", 0, 30, { speed: 2, out: 2_000_000 })]);
    const payload = payloadOf(p, ["src"], "src");
    expect(pastedSpeed(payload, new Set(["speed"]))).toBe(2);
    expect(pastedSpeed(payload, new Set(["transform"]))).toBeNull();
  });
});

describe("Caption style (spec §20.3, Batch 53)", () => {
  it("gives a copied cue's own style and preset link to the selected cues; a cue with none puts them back to the track style", () => {
    const own = { text: { fontSize: 120 }, position: "custom" as const, x: 0, y: -400 };
    const base = addCaptionTrack(project([]));
    const p = withClips(base, [
      { ...makeCaptionClip({ id: "q1", trackId: "cc", start: 0, duration: 30, text: "a" }), styleOverride: own, presetId: "pr" },
      makeCaptionClip({ id: "q2", trackId: "cc", start: 30, duration: 30, text: "b" }),
      { ...makeCaptionClip({ id: "q3", trackId: "cc", start: 60, duration: 30, text: "c" }), styleOverride: { maxLines: 1 } },
    ]);
    const styled = payloadOf(p, ["q1"], "q1");
    expect(availableGroups(p, styled, ["q2", "q3"])).toEqual(["captionStyle"]);
    expect(attributeTargets(p, ["q2", "q3"], "captionStyle")).toEqual(["q2", "q3"]);
    const next = apply(p, styled, ["q2", "q3"], ["captionStyle"]);
    expect(next.clips.q2).toMatchObject({ styleOverride: own, presetId: "pr" });
    expect(next.clips.q3).toMatchObject({ styleOverride: own, presetId: "pr" });
    // The same style already: nothing to paste.
    expect(pasteAttributes(next, payloadOf(next, ["q2"], "q2"), ["q3"], new Set(["captionStyle"]))).toBeNull();
    const reset = apply(p, payloadOf(p, ["q2"], "q2"), ["q3"], ["captionStyle"]);
    expect(reset.clips.q3).not.toHaveProperty("styleOverride");
    // A copied cue with a preset link alone (no style of its own) gives no link.
    const lone = withClips(base, [
      { ...makeCaptionClip({ id: "q1", trackId: "cc", start: 0, duration: 30, text: "a" }), presetId: "pr" },
      { ...makeCaptionClip({ id: "q2", trackId: "cc", start: 30, duration: 30, text: "b" }), styleOverride: own, presetId: "pr" },
    ]);
    const cleared = apply(lone, payloadOf(lone, ["q1"], "q1"), ["q2"], ["captionStyle"]);
    expect(cleared.clips.q2).not.toHaveProperty("styleOverride");
    expect(cleared.clips.q2).not.toHaveProperty("presetId");
  });
});
