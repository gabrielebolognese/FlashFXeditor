import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { fadeBinding, gainBinding } from "./audioBinding.js";

function store(clips: Clip[]) {
  const p: Project = makeProject();
  p.media.a = makeMedia("a", "audio");
  p.tracks.push(makeTrack("a1", "audio"));
  return new DocumentStore(withClips(p, clips), { session: createSessionStore(), validate: true });
}
const audio = (id: string, start: number, fields: Partial<MediaClip> = {}): MediaClip => ({ ...makeMediaClip(makeProject(), { id, trackId: "a1", start, duration: 60, mediaId: "a", kind: "audio" }), ...fields });
const gain = (s: DocumentStore, id: string) => (s.getState().clips[id] as MediaClip).volume.gainDb;

describe("Audio section bindings (Batch 37)", () => {
  it("reads the shared gain, sets it, steps each clip's own and applies a scrub once on release", () => {
    const s = store([audio("a", 0), audio("b", 100, { volume: { gainDb: -6, muted: false } })]);
    const binding = gainBinding({ document: s }, ["a", "b"]);
    expect(binding.read()).toBeNull();
    binding.set(-3);
    expect(binding.read()).toBe(-3);
    binding.change(1, "step");
    binding.change(1, "step");
    expect(gain(s, "a")).toBe(-1);
    s.undo();
    expect(gain(s, "a")).toBe(-3);
    const dispatch = vi.spyOn(s, "dispatch");
    binding.change(4, "scrub");
    binding.change(6, "scrub");
    expect(dispatch).not.toHaveBeenCalled();
    binding.change(6, "commit");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(gain(s, "b")).toBe(3);
  });

  it("shows and writes a keyed gain at the playhead, re-reading as it moves", () => {
    const keys = [
      { frame: 0, value: 0, ease: "linear" as const },
      { frame: 40, value: -20, ease: "linear" as const },
    ];
    const s = store([audio("a", 10, { keyframes: { "volume.gainDb": keys } })]);
    let playhead = 30;
    const listeners: (() => void)[] = [];
    const binding = gainBinding({ document: s, playhead: { get: () => playhead, subscribe: (l) => (listeners.push(l), () => undefined) } }, ["a"]);
    const seen = vi.fn();
    binding.subscribe(seen);
    expect(binding.read()).toBe(-10);
    playhead = 40;
    for (const listener of listeners) listener();
    expect(seen).toHaveBeenCalled();
    expect(binding.read()).toBe(-15);
    binding.set(-6);
    expect((s.getState().clips.a as MediaClip).keyframes?.["volume.gainDb"]).toEqual([keys[0], { frame: 30, value: -6, ease: "linear" }, keys[1]]);
  });

  it("sets fades in frames within the clip", () => {
    const s = store([audio("a", 0)]);
    const fadeIn = fadeBinding({ document: s }, ["a"], "in");
    fadeIn.set(15);
    expect(fadeIn.read()).toBe(15);
    fadeIn.set(500);
    expect(fadeIn.read()).toBe(60);
  });
});
