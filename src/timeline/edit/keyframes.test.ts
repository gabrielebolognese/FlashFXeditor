import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { animatedOpacity, animatedTransform, sectionFrames } from "../../core/document/keyframes.js";
import type { Clip, Keyframes, MediaClip, Project, SolidClip } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { setOpacities } from "./clipProps.js";
import { adjacentKey, addKeyAt, clampKeyDelta, copyKeys, deleteKeys, keyable, keyAt, keyCount, moveKeys, pasteKeys, setKeysEase, setStopwatch, stopwatchOn, toggleKeyAt } from "./keyframes.js";
import { nudgeLayers, quickTransforms, setTransforms } from "./transform.js";

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m", "video"), width: 1920, height: 1080 };
  p.media.a = makeMedia("a", "audio");
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

const solid = (id: string, fields: Partial<SolidClip> = {}): SolidClip => ({ ...makeSolidClip({ id, trackId: "v1", start: 100, duration: 60 }), ...fields });
const store = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });
const get = <C extends Clip>(s: DocumentStore, id: string) => s.getState().clips[id] as C;

describe("keyable", () => {
  it("keys transform and opacity on layers, volume on video and audio", () => {
    const p = makeProject();
    const video = makeMediaClip(p, { id: "v", trackId: "v1", start: 0, duration: 10, mediaId: "m" });
    const audio = { ...video, id: "a", kind: "audio" as const };
    expect(keyable(video, "transform") && keyable(video, "volume")).toBe(true);
    expect(keyable(audio, "transform")).toBe(false);
    expect(keyable(audio, "volume")).toBe(true);
    expect(keyable(makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 10 }), "opacity")).toBe(true);
    expect(keyable(solid("s"), "volume")).toBe(false);
  });
});

describe("stopwatch", () => {
  it("on: a key at the playhead with the values shown; off: no keys, the look at the playhead kept", () => {
    const s = store(project([solid("s", { transform: { x: 10, y: 20, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } })]));
    s.dispatch(setStopwatch(s.getState(), ["s"], "transform", true, 110)!);
    const on = get<SolidClip>(s, "s");
    expect(stopwatchOn(on, "transform")).toBe(true);
    expect(sectionFrames(on.keyframes, "transform")).toEqual([10]);
    expect(on.keyframes?.["transform.x"]).toEqual([{ frame: 10, value: 10, ease: "linear" }]);
    expect(on.keyframes?.["transform.scaleY"]?.[0]?.value).toBe(1);
    // Already on: nothing to do.
    expect(setStopwatch(s.getState(), ["s"], "transform", true, 120)).toBeNull();
    // Move at frame 0 and 30 of the clip (timeline 100 and 130): it animates between them.
    s.dispatch(setTransforms(s.getState(), new Map([["s", { ...on.transform, x: 0 }]]), { label: "Move", at: 100 })!);
    s.dispatch(setTransforms(s.getState(), new Map([["s", { ...on.transform, x: 300 }]]), { label: "Move", at: 130 })!);
    const keyed = get<SolidClip>(s, "s");
    expect(sectionFrames(keyed.keyframes, "transform")).toEqual([0, 10, 30]);
    expect(keyed.transform.x).toBe(10);
    expect(animatedTransform(keyed, 20).x).toBeCloseTo(155);
    s.dispatch(setStopwatch(s.getState(), ["s"], "transform", false, 120)!);
    const off = get<SolidClip>(s, "s");
    expect(off.keyframes).toBeUndefined();
    expect(off.transform.x).toBeCloseTo(155);
    expect(off.transform.scaleY).toBeUndefined();
  });

  it("skips locked clips and clips that cannot be keyed in the section", () => {
    const p = project([solid("s")]);
    p.tracks[0]!.locked = true;
    expect(setStopwatch(p, ["s"], "opacity", true, 100)).toBeNull();
    expect(setStopwatch(project([solid("s")]), ["s"], "volume", true, 100)).toBeNull();
  });
});

describe("edits at the playhead", () => {
  const animated = (): Keyframes => ({ opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: 20, value: 1, ease: "linear" }] });

  it("setOpacities keys the opacity there; without `at` it sets the clip's own", () => {
    const s = store(project([solid("s", { keyframes: animated() })]));
    s.dispatch(setOpacities(s.getState(), new Map([["s", 0.25]]), { label: "Opacity", at: 140 })!);
    const clip = get<SolidClip>(s, "s");
    expect(clip.keyframes?.opacity?.map((key) => [key.frame, key.value])).toEqual([
      [0, 0],
      [20, 1],
      [40, 0.25],
    ]);
    expect(clip.opacity).toBe(1);
    // Unchanged at the playhead: no command.
    expect(setOpacities(s.getState(), new Map([["s", 0.5]]), { label: "Opacity", at: 110 })).toBeNull();
    s.dispatch(setOpacities(s.getState(), new Map([["s", 0.5]]), { label: "Opacity" })!);
    expect(get<SolidClip>(s, "s").opacity).toBe(0.5);
  });

  it("a moved anchor shifts every position key; nudges and quick transforms act on the shown transform", () => {
    const keyframes: Keyframes = {
      "transform.x": [{ frame: 0, value: 0, ease: "linear" }, { frame: 30, value: 100, ease: "linear" }],
      "transform.y": [{ frame: 0, value: 0, ease: "linear" }, { frame: 30, value: 0, ease: "linear" }],
    };
    const s = store(project([solid("s", { keyframes })]));
    const shown = animatedTransform(get<SolidClip>(s, "s"), 15);
    s.dispatch(setTransforms(s.getState(), new Map([["s", { ...shown, anchor: { x: 0, y: 0.5 }, x: shown.x - 10 }]]), { label: "Anchor", at: 115 })!);
    const moved = get<SolidClip>(s, "s");
    expect(moved.transform.anchor).toEqual({ x: 0, y: 0.5 });
    expect(moved.keyframes?.["transform.x"]?.map((key) => key.value)).toEqual([-10, 40, 90]);
    s.dispatch(nudgeLayers(s.getState(), ["s"], 1, 0, 130)!);
    expect(animatedTransform(get<SolidClip>(s, "s"), 30).x).toBe(91);
    s.dispatch(quickTransforms(s.getState(), ["s"], "flipH", 100)!);
    expect(get<SolidClip>(s, "s").transform.flipH).toBe(true);
  });
});

describe("navigator, lane and menu edits", () => {
  const keyed = (): SolidClip =>
    solid("s", {
      keyframes: {
        opacity: [
          { frame: 0, value: 0, ease: "linear" },
          { frame: 20, value: 1, ease: "linear" },
          { frame: 50, value: 0.5, ease: "linear" },
        ],
      },
    });

  it("adds or removes the key at the playhead, and finds the keys around it", () => {
    const s = store(project([keyed()]));
    expect(keyAt(get(s, "s"), "opacity", 120)).toBe(true);
    s.dispatch(toggleKeyAt(s.getState(), ["s"], "opacity", 120)!);
    expect(keyCount(get(s, "s"), "opacity")).toBe(2);
    s.dispatch(toggleKeyAt(s.getState(), ["s"], "opacity", 110)!);
    expect(sectionFrames(get<SolidClip>(s, "s").keyframes, "opacity")).toEqual([0, 10, 50]);
    expect(adjacentKey(s.getState(), ["s"], "opacity", 110, 1)).toBe(150);
    expect(adjacentKey(s.getState(), ["s"], "opacity", 110, -1)).toBe(100);
    expect(adjacentKey(s.getState(), ["s"], "opacity", 100, -1)).toBeNull();
  });

  it("Alt+click adds a key with the value there; drags retime inside the clip; deleting the last key keeps the look", () => {
    const s = store(project([keyed()]));
    s.dispatch(addKeyAt(s.getState(), "s", "opacity", 10)!);
    expect(get<SolidClip>(s, "s").keyframes?.opacity?.[1]).toEqual({ frame: 10, value: 0.5, ease: "linear" });
    expect(addKeyAt(s.getState(), "s", "opacity", 10)).toBeNull();
    expect(addKeyAt(s.getState(), "s", "opacity", 60)).toBeNull();
    expect(clampKeyDelta({ duration: 60 }, [10, 50], 30)).toBe(9);
    s.dispatch(moveKeys(s.getState(), "s", "opacity", [50], 100)!);
    expect(sectionFrames(get<SolidClip>(s, "s").keyframes, "opacity")).toEqual([0, 10, 20, 59]);
    // A key moved onto another replaces it.
    s.dispatch(moveKeys(s.getState(), "s", "opacity", [10], 10)!);
    expect(sectionFrames(get<SolidClip>(s, "s").keyframes, "opacity")).toEqual([0, 20, 59]);
    s.dispatch(deleteKeys(s.getState(), "s", "opacity", [0, 59])!);
    s.dispatch(deleteKeys(s.getState(), "s", "opacity", [20])!);
    const clip = get<SolidClip>(s, "s");
    expect(clip.keyframes).toBeUndefined();
    expect(clip.opacity).toBe(0.5);
    expect(deleteKeys(s.getState(), "s", "opacity", [20])).toBeNull();
  });

  it("sets eases, and copies and pastes keys from the playhead on", () => {
    const s = store(project([keyed(), solid("t", { trackId: "v2", start: 200, duration: 40 })]));
    s.dispatch(setKeysEase(s.getState(), new Map([["s", [0, 20]]]), "opacity", "hold")!);
    expect(get<SolidClip>(s, "s").keyframes?.opacity?.map((key) => key.ease)).toEqual(["hold", "hold", "linear"]);
    expect(animatedOpacity(get<SolidClip>(s, "s"), 19)).toBe(0);
    expect(setKeysEase(s.getState(), new Map([["s", [0]]]), "opacity", "hold")).toBeNull();
    const clipboard = copyKeys(get(s, "s"), "opacity", [20, 50]);
    expect(clipboard?.keys.opacity?.map((key) => key.offset)).toEqual([0, 30]);
    s.dispatch(pasteKeys(s.getState(), ["t"], clipboard!, 205)!);
    expect(get<SolidClip>(s, "t").keyframes?.opacity).toEqual([
      { frame: 5, value: 1, ease: "hold" },
      { frame: 35, value: 0.5, ease: "linear" },
    ]);
    expect(copyKeys(get(s, "s"), "opacity", [7])).toBeNull();
  });

  it("works on media clips (volume model)", () => {
    const p = project([]);
    const clip: MediaClip = { ...makeMediaClip(p, { id: "v", trackId: "v1", start: 0, duration: 30, mediaId: "m" }) };
    const s = store(withClips(p, [clip]));
    s.dispatch(setStopwatch(s.getState(), ["v"], "volume", true, 5)!);
    expect(get<MediaClip>(s, "v").keyframes?.["volume.gainDb"]).toEqual([{ frame: 5, value: 0, ease: "linear" }]);
  });
});
