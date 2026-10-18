import { describe, expect, it } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip, Clip, MediaClip, MediaItem, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { CLIPBOARD_FORMAT, copyClips, keysPayload, parseClipboard, pasteClips, serializeClipboard, type ClipsPayload, type PasteResult } from "./clipboard.js";

const FRAME_US = 1_000_000 / 30;

function video(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m" }), ...extra };
}

function audio(id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return video(id, trackId, start, duration, { kind: "audio", ...extra });
}

/** V1, V2 and A1, A2 (V1 and A1 targeted) with media `m`, and `clips`. */
function project(clips: Clip[], options: { id?: string; targeted?: string[] } = {}): Project {
  const p = makeProject();
  if (options.id) p.id = options.id;
  p.media.m = makeMedia("m");
  const targeted = new Set(options.targeted ?? ["v1", "a1"]);
  p.tracks.push(...["v1", "v2"].map((id) => makeTrack(id)), ...["a1", "a2"].map((id) => makeTrack(id, "audio")));
  for (const track of p.tracks) track.targeted = targeted.has(track.id);
  return withClips(p, clips);
}

let n = 0;
const newId = () => `id-${++n}`;

function copied(p: Project, ids: string[], primary: string | null = null, linked = true): ClipsPayload {
  const payload = copyClips(p, ids, primary, { linked });
  if (!payload) throw new Error("expected a payload");
  return payload;
}

function paste(p: Project, payload: ClipsPayload, at: number, mode: "overwrite" | "insert" = "overwrite"): { doc: DocumentStore; result: Extract<PasteResult, { kind: "ok" }>; clips: Clip[] } {
  const result = pasteClips(p, payload, { at, mode, newId });
  if (result.kind !== "ok") throw new Error(`refused: ${result.reason}`);
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  return { doc, result, clips: result.placed.map((id) => doc.getState().clips[id] as Clip) };
}

describe("copyClips (spec §18 Copy)", () => {
  it("takes the clips with their linked partners (Linked selection on) and groups, times from the block start, lanes, media", () => {
    const p = project([video("v", "v2", 40, 30, { linkGroup: "L" }), audio("a", "a2", 40, 30, { linkGroup: "L" }), video("g", "v1", 50, 10, { group: "G" }), video("h", "v1", 90, 10, { group: "G" })]);
    const payload = copied(p, ["v", "g"], "v");
    expect(payload).toMatchObject({ format: CLIPBOARD_FORMAT, version: 1, kind: "clips", projectId: p.id, fps: p.settings.fps, primary: "v" });
    expect(payload.clips.map(({ clip, lane }) => [clip.id, clip.start, lane])).toEqual([
      ["v", 0, { kind: "video", number: 1 }],
      ["a", 0, { kind: "audio", number: 1 }],
      ["g", 10, { kind: "video", number: 0 }],
      ["h", 50, { kind: "video", number: 0 }],
    ]);
    expect(payload.media.map((item) => item.id)).toEqual(["m"]);
    // Linked selection off: the partner stays (the group still comes).
    expect(copied(p, ["v"], null, false).clips.map(({ clip }) => clip.id)).toEqual(["v"]);
    expect(copyClips(p, ["gone"], null, { linked: true })).toBeNull();
  });

  it("keeps a transition only when both of its clips are copied", () => {
    const t = { id: "T", kind: "crossDissolve" as const, before: 5, after: 5 };
    const p = project([video("a", "v1", 0, 30, { in: 1_000_000, out: 2_000_000, transitionOut: t }), video("b", "v1", 30, 30, { in: 1_000_000, out: 2_000_000, transitionIn: t })]);
    const both = copied(p, ["a", "b"]).clips.map(({ clip }) => clip as MediaClip);
    expect(both[0]?.transitionOut).toEqual(t);
    expect(both[1]?.transitionIn).toEqual(t);
    expect((copied(p, ["b"]).clips[0]?.clip as MediaClip).transitionIn).toBeUndefined();
  });
});

describe("serializeClipboard / parseClipboard (the system clipboard mirror)", () => {
  it("round-trips clips and keys; other text, formats, versions and broken shapes are not payloads", () => {
    const payload = copied(project([video("v", "v1", 0, 30)]), ["v"]);
    expect(parseClipboard(serializeClipboard(payload))).toEqual(payload);
    const keys = keysPayload({ section: "opacity", keys: { opacity: [{ offset: 0, value: 1, ease: "linear" }] } });
    expect(parseClipboard(serializeClipboard(keys))).toEqual(keys);
    expect(parseClipboard("hello")).toBeNull();
    expect(parseClipboard(`{"format":"${CLIPBOARD_FORMAT}"`)).toBeNull();
    expect(parseClipboard(JSON.stringify({ ...payload, version: 2 }))).toBeNull();
    expect(parseClipboard(JSON.stringify({ ...payload, format: "other", note: CLIPBOARD_FORMAT }))).toBeNull();
    expect(parseClipboard(JSON.stringify({ ...payload, clips: [] }))).toBeNull();
    expect(parseClipboard(JSON.stringify({ ...payload, clips: [{ clip: { id: "x", kind: "video", start: -1, duration: 5 }, lane: { kind: "video", number: 0 } }] }))).toBeNull();
  });

  it("refuses keys that would break the document's keyframe invariants (pasted straight into clips)", () => {
    const key = { offset: 2, value: 0.5, ease: "linear" };
    const text = (keys: unknown) => JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, kind: "keys", keys });
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: [key] } }))).not.toBeNull();
    // The review's case: a key at frame 2.5 would save a project that cannot be opened.
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: [{ ...key, offset: 2.5 }] } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: [{ ...key, offset: -1 }] } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: [{ ...key, value: null }] } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: [{ ...key, value: "1" }] } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: [{ ...key, ease: "bounce" }] } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: [] } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: { opacity: key } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: {} }))).toBeNull();
    // An unknown section, and a property of another section (or none at all).
    expect(parseClipboard(text({ section: "color", keys: { opacity: [key] } }))).toBeNull();
    expect(parseClipboard(text({ section: "opacity", keys: { "transform.x": [key] } }))).toBeNull();
    expect(parseClipboard(text({ section: "transform", keys: { "transform.x": [key], "transform.skew": [key] } }))).toBeNull();
  });

  it("refuses media records the paste could not read (no file reference, an unknown kind, a broken duration)", () => {
    const payload = copied(project([video("v", "v1", 0, 30)]), ["v"]);
    const item = payload.media[0] as MediaItem;
    const text = (media: unknown) => JSON.stringify({ ...payload, media: [media] });
    expect(parseClipboard(text(item))).not.toBeNull();
    expect(parseClipboard(text({ ...item, file: { handleKey: "", pathHint: "media/x.mp4" } }))).not.toBeNull();
    // The review's case: a record without `file` made Ctrl+V throw a TypeError instead of showing a toast.
    expect(parseClipboard(text({ ...item, file: undefined }))).toBeNull();
    expect(parseClipboard(text({ ...item, file: "media/x.mp4" }))).toBeNull();
    expect(parseClipboard(text({ ...item, file: { relPath: 5 } }))).toBeNull();
    expect(parseClipboard(text({ ...item, file: { handleKey: "k" } }))).toBeNull();
    expect(parseClipboard(text({ ...item, kind: "gif" }))).toBeNull();
    expect(parseClipboard(text({ ...item, durationUs: 1.5 }))).toBeNull();
    expect(parseClipboard(text({ ...item, durationUs: -1 }))).toBeNull();
    expect(parseClipboard(text({ ...item, durationUs: undefined }))).toBeNull();
    expect(parseClipboard(text({ ...item, id: 7 }))).toBeNull();
  });
});

describe("pasteClips (spec §18 Paste / Paste insert, §6.8, §6.12 Target)", () => {
  it("puts two linked clips at the playhead on the targeted tracks with a new link between them, overwriting; one undo step", () => {
    const p = project([video("v", "v2", 10, 30, { linkGroup: "L" }), audio("a", "a2", 10, 30, { linkGroup: "L" }), video("under", "v1", 90, 30)]);
    const { doc, result, clips } = paste(p, copied(p, ["v", "a"], "v"), 100);
    const [v, a] = clips as [MediaClip, MediaClip];
    expect([v.trackId, v.start, a.trackId, a.start]).toEqual(["v1", 100, "a1", 100]);
    expect(v.linkGroup).toBeDefined();
    expect(v.linkGroup).toBe(a.linkGroup);
    expect(v.linkGroup).not.toBe("L");
    expect([v.in, v.out]).toEqual([(p.clips.v as MediaClip).in, (p.clips.v as MediaClip).out]);
    expect(result).toMatchObject({ primary: v.id, start: 100, end: 130, offline: [] });
    // Overwrite: the clip under them keeps 90..100.
    expect(doc.getState().clips.under?.duration).toBe(10);
    expect(doc.history.getState().undoLabel).toBe("Paste");
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("keeps the relative track offsets from the lowest targeted track, creating tracks past the last one", () => {
    const p = project([video("low", "v1", 0, 10), video("high", "v2", 0, 10)], { targeted: ["v2", "a1"] });
    const { doc, clips } = paste(p, copied(p, ["low", "high"]), 50);
    const lanes = doc.getState().tracks.filter((track) => track.kind === "video");
    expect(lanes.map((track) => track.name)).toEqual(["V1", "V2", "V3"]);
    expect(clips.map((clip) => clip.trackId)).toEqual([lanes[1]?.id, lanes[2]?.id]);
  });

  it("leaves clips on their own lanes when no track of their kind is targeted", () => {
    const p = project([audio("a", "a2", 0, 10)], { targeted: ["v1"] });
    expect(paste(p, copied(p, ["a"]), 20).clips[0]?.trackId).toBe("a2");
  });

  it("Paste insert ripples every unlocked track open by the block's length (a clip across the playhead is split)", () => {
    const p = project([video("src", "v2", 0, 20), video("across", "v1", 40, 30), audio("later", "a1", 80, 10)]);
    const { doc, clips } = paste(p, copied(p, ["src"]), 50, "insert");
    const state = doc.getState();
    expect(clips[0]).toMatchObject({ trackId: "v1", start: 50, duration: 20 });
    expect(state.clips.across).toMatchObject({ start: 40, duration: 10 });
    expect(state.clips.later?.start).toBe(100);
    const right = state.tracks[0]?.clipIds.map((id) => state.clips[id] as Clip).find((clip) => clip.start === 70);
    expect(right?.duration).toBe(20);
    expect(doc.history.getState().undoLabel).toBe("Paste insert");
  });

  it("refuses a paste onto a locked track", () => {
    const p = project([video("v", "v1", 0, 10)]);
    const payload = copied(p, ["v"]);
    const locked = structuredClone(p);
    (locked.tracks[0] as { locked: boolean }).locked = true;
    (locked.tracks[1] as { targeted: boolean }).targeted = true;
    // V1 locked: the lowest targeted unlocked video track is V2.
    expect(pasteClips(locked, payload, { at: 0, mode: "overwrite", newId })).toMatchObject({ kind: "ok" });
    (locked.tracks[1] as { locked: boolean }).locked = true;
    expect(pasteClips(locked, payload, { at: 0, mode: "overwrite", newId })).toMatchObject({ kind: "refused", reason: "locked" });
  });

  it("converts clips copied at another frame rate (spec §15, Batch 42): positions, lengths, fades, keys and transitions", () => {
    const t = { id: "T", kind: "crossDissolve" as const, before: 5, after: 5 };
    const p60 = project([
      video("a", "v1", 0, 60, { in: 0, out: 1_000_000, transitionOut: t, fades: { in: 10, out: 0 }, keyframes: { opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: 30, value: 1, ease: "linear" }] } }),
      video("b", "v1", 60, 61, { in: 1_000_000, out: 2_016_667, transitionIn: t }),
    ]);
    p60.settings.fps = { num: 60, den: 1 };
    const payload = copied(p60, ["a", "b"]);
    const p30 = project([]);
    const { clips, doc } = paste(p30, payload, 100);
    const [a, b] = clips as [MediaClip, MediaClip];
    expect([a.start, a.duration, b.start, b.duration]).toEqual([100, 30, 130, 31]);
    expect(a.fades).toEqual({ in: 5, out: 0 });
    expect(a.keyframes?.opacity?.map((key) => key.frame)).toEqual([0, 15]);
    expect(a.transitionOut).toMatchObject({ before: 3, after: 3 });
    expect(b.transitionIn).toMatchObject({ before: 3, after: 3 });
    // The same media time is played: a source range is not rescaled.
    expect([a.in, a.out]).toEqual([0, 1_000_000]);
    expect(doc.getState().settings.fps).toEqual({ num: 30, den: 1 });
  });

  it("gives a transition pair pasted together a new id", () => {
    const t = { id: "T", kind: "dipToBlack" as const, before: 4, after: 6 };
    const p = project([video("a", "v2", 0, 30, { in: 1_000_000, out: 2_000_000, transitionOut: t }), video("b", "v2", 30, 30, { in: 1_000_000, out: 2_000_000, transitionIn: t })]);
    const [a, b] = paste(p, copied(p, ["a", "b"]), 100).clips as [MediaClip, MediaClip];
    expect(a.transitionOut).toMatchObject({ kind: "dipToBlack", before: 4, after: 6 });
    expect(a.transitionOut?.id).not.toBe("T");
    expect(b.transitionIn).toEqual(a.transitionOut);
  });
});

describe("pasteClips into another project (the system clipboard JSON)", () => {
  const source = () => {
    const p = project([video("v", "v1", 0, 30, { linkGroup: "L", in: 2_000_000, out: 2_000_000 + 30 * FRAME_US }), audio("a", "a1", 0, 30, { linkGroup: "L", in: 2_000_000, out: 2_000_000 + 30 * FRAME_US })], { id: "source" });
    (p.media.m as { name: string }).name = "Interview.mp4";
    return p;
  };

  it("uses the media of the same name there", () => {
    const target = project([], { id: "target" });
    target.media = { other: { ...makeMedia("other"), name: "Interview.mp4" } };
    const payload = parseClipboard(serializeClipboard(copied(source(), ["v", "a"]))) as ClipsPayload;
    const { doc, result, clips } = paste(target, payload, 0);
    expect(clips.map((clip) => (clip as MediaClip).mediaId)).toEqual(["other", "other"]);
    expect(result.offline).toEqual([]);
    expect(Object.keys(doc.getState().media)).toEqual(["other"]);
  });

  it("adds an offline media item when none matches (or the match is too short), in the paste's undo step", () => {
    const target = project([], { id: "target" });
    target.media = { short: { ...makeMedia("short", "video", 1_000_000), name: "Interview.mp4" } };
    const { doc, result, clips } = paste(target, copied(source(), ["v", "a"]), 0);
    expect(result.offline).toHaveLength(1);
    const offline = result.offline[0];
    expect(offline).toMatchObject({ name: "Interview.mp4", kind: "video", analysis: { thumbs: "none", peaks: "none" } });
    expect(offline?.id).not.toBe("m");
    expect(clips.every((clip) => (clip as MediaClip).mediaId === offline?.id)).toBe(true);
    expect(doc.getState().media[offline?.id as string]).toEqual(offline);
    doc.undo();
    expect(Object.keys(doc.getState().media)).toEqual(["short"]);
  });

  it("never points an offline item at a file of this project (both imported Interview.mp4 as media/Interview.mp4)", () => {
    const from = source();
    from.media.m = { ...(from.media.m as MediaItem), file: { relPath: "media/Interview.mp4" } };
    const target = project([], { id: "target" });
    // This project's Interview.mp4 is too short for the clips' 2..3 s source range.
    target.media = { short: { ...makeMedia("short", "video", 1_000_000), name: "Interview.mp4", file: { relPath: "media/Interview.mp4" } } };
    const { doc, result } = paste(target, parseClipboard(serializeClipboard(copied(from, ["v", "a"]))) as ClipsPayload, 0);
    const offline = result.offline[0] as MediaItem;
    // A handle key that resolves nowhere; the copied path stays as the hint for Relink.
    expect(offline.file).toEqual({ handleKey: "", pathHint: "media/Interview.mp4" });
    expect(Object.values(doc.getState().media).filter((item) => "relPath" in item.file && item.file.relPath === "media/Interview.mp4").map((item) => item.id)).toEqual(["short"]);
    // A second paste of the same clips finds the offline item by name instead of adding another.
    const again = pasteClips(doc.getState(), copied(from, ["v", "a"]), { at: 100, mode: "overwrite", newId });
    expect(again).toMatchObject({ kind: "ok", offline: [] });
  });

  it("moves pasted cues to the nearest free spot, and creates the caption track with the copied style when there is none", () => {
    const withCues = (p: Project, cues: [string, number, number][]) => withClips(addCaptionTrack(p), cues.map(([id, start, duration]) => makeCaptionClip({ id, trackId: "cc", start, duration })));
    const from = withCues(project([], { id: "source" }), [["c1", 0, 20]]);
    from.captionTracks.cc = { style: { ...(from.captionTracks.cc as { style: Project["captionTracks"][string]["style"] }).style, maxLines: 3 } };
    const payload = copied(from, ["c1"]);
    // An existing cue at 50..60: a paste at 48 (48..68) moves to 60..80, the nearest spot that fits (30..50 is further).
    const target = withCues(project([], { id: "target" }), [["x", 50, 10]]);
    expect((paste(target, payload, 48).clips[0] as CaptionClip).start).toBe(60);
    const bare = project([], { id: "target" });
    const { doc, clips } = paste(bare, payload, 10);
    const track = doc.getState().tracks.find((candidate) => candidate.kind === "caption");
    expect(track).toMatchObject({ name: "CC", height: "S" });
    expect(clips[0]).toMatchObject({ trackId: track?.id, start: 10, kind: "caption" });
    expect(doc.getState().captionTracks[track?.id as string]?.style.maxLines).toBe(3);
  });
});
