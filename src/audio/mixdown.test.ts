import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../core/document/fixtures.js";
import type { MediaClip, Project, Track } from "../core/document/types.js";
import { segmentLayout, segmentStartSeconds, type SegmentLayout } from "./decode/segments.js";
import { heardClips, renderMixdown, type MixdownDeps, type OfflineGraphContext } from "./mixdown.js";
import { FakeAudioBuffer, FakeContext, fakeBuffer, type FakeGain, type FakeNode } from "./testAudio.js";

const RATE = 48_000;
/** The mixdown renders this far ahead and cuts it off (mixdown.ts LEAD). */
const LEAD = 0.05;

class FakeOffline extends FakeContext {
  constructor(readonly options: { numberOfChannels: number; length: number; sampleRate: number }) {
    super();
  }
  /** Every sample holds its own index, so the cut-off lead is visible in the result. */
  async startRendering(): Promise<AudioBuffer> {
    const buffer = new FakeAudioBuffer({ length: this.options.length, numberOfChannels: this.options.numberOfChannels, sampleRate: this.options.sampleRate });
    for (let c = 0; c < this.options.numberOfChannels; c++) buffer.getChannelData(c).forEach((_, i, data) => (data[i] = i));
    return buffer as unknown as AudioBuffer;
  }
}

function audioClip(project: Project, id: string, trackId: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(project, { id, trackId, start, duration, mediaId: "m", kind: "audio" }), ...extra };
}

function setup(clips: (project: Project) => MediaClip[], options: { tracks?: Track[]; layout?: SegmentLayout; failing?: boolean } = {}) {
  let project: Project = { ...makeProject(), tracks: options.tracks ?? [makeTrack("v1"), makeTrack("a1", "audio"), makeTrack("a2", "audio")], media: { m: makeMedia("m", "audio") } };
  project = withClips(project, clips(project));
  const layout = options.layout ?? segmentLayout(RATE, 60 * RATE);
  const contexts: FakeOffline[] = [];
  const audio = {
    open: vi.fn(async () => {
      if (options.failing) throw new Error("no audio");
      return layout;
    }),
    load: vi.fn(async (_mediaId: string, index: number) => ({ buffer: fakeBuffer(layout.segmentFrames / layout.sampleRate), pcm: null, index })),
    layout: vi.fn(() => layout),
    hasFailed: vi.fn(() => options.failing === true),
  };
  const deps: MixdownDeps = {
    audio: audio as unknown as MixdownDeps["audio"],
    createContext: (init) => {
      const ctx = new FakeOffline(init);
      contexts.push(ctx);
      return ctx as unknown as OfflineGraphContext;
    },
  };
  return { project, audio, deps, contexts };
}

describe("renderMixdown", () => {
  it("schedules the clips of the range as playback would, from the range start", async () => {
    const { project, deps, contexts } = setup((p) => [audioClip(p, "c1", "a1", 0, 60), audioClip(p, "c2", "a1", 90, 60, { in: 2_000_000, out: 4_000_000 })]);
    const mix = await renderMixdown(project, { start: 30, end: 120 }, { sampleRate: RATE, channels: 1 }, deps);
    const ctx = contexts[0] as FakeOffline;
    expect(ctx.options).toEqual({ numberOfChannels: 1, length: Math.round(LEAD * RATE) + 3 * RATE, sampleRate: RATE });
    const started = ctx.sources.map((source) => ({ when: source.started?.when, offset: source.started?.offset, stop: source.stoppedAt }));
    expect(started).toHaveLength(2);
    // c1 from 1 s into the clip, at the start, to its end; c2 at 2 s, its in point, to the range end.
    expect(started[0]?.when).toBeCloseTo(LEAD, 6);
    expect(started[0]?.offset).toBeCloseTo(1, 6);
    expect(started[0]?.stop).toBeCloseTo(LEAD + 1, 6);
    expect(started[1]?.when).toBeCloseTo(LEAD + 2, 6);
    expect(started[1]?.offset).toBeCloseTo(2, 6);
    expect(started[1]?.stop).toBeCloseTo(LEAD + 3, 6);
    // The result: 3 s, the lead cut off.
    expect(mix?.sampleRate).toBe(RATE);
    expect(mix?.channels).toHaveLength(1);
    expect(mix?.channels[0]).toHaveLength(3 * RATE);
    expect(mix?.channels[0]?.[0]).toBe(Math.round(LEAD * RATE));
  });

  it("mixes muted tracks silent, and plays only the soloed ones", async () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("a1", "audio"), muted: true }, makeTrack("a2", "audio"), makeTrack("a3", "audio")];
    const both = (p: Project) => [audioClip(p, "c1", "a1", 0, 30), audioClip(p, "c2", "a2", 0, 30), audioClip(p, "c3", "a3", 0, 30)];
    const muted = setup(both, { tracks });
    expect(heardClips(muted.project, 0, 30).map((clip) => clip.id)).toEqual(["c2", "c3"]);
    await renderMixdown(muted.project, { start: 0, end: 30 }, { sampleRate: RATE, channels: 2 }, muted.deps);
    // Every voice goes source -> envelope -> fade -> clip gain -> track gain: the muted track's is 0 (playback's mixer).
    const trackGain = (source: FakeNode) => ((source.outputs[0]?.outputs[0]?.outputs[0]?.outputs[0] as FakeGain | undefined)?.gain.value ?? NaN);
    expect(muted.contexts[0]?.sources.map(trackGain)).toEqual([0, 1, 1]);
    const solo = setup(both, { tracks: tracks.map((track) => (track.id === "a3" ? { ...track, solo: true } : track)) });
    expect(heardClips(solo.project, 0, 30).map((clip) => clip.id)).toEqual(["c3"]);
    // Disabled clips and freeze frames (speed 0) are silent too.
    const off = setup((p) => [audioClip(p, "c1", "a1", 0, 30, { enabled: false }), audioClip(p, "c2", "a2", 0, 30, { speed: 0 })]);
    expect(heardClips(off.project, 0, 30)).toEqual([]);
  });

  it("loads only the segments the range plays and holds them while rendering", async () => {
    const layout = segmentLayout(RATE, 20 * 60 * RATE);
    // The clip plays media 70 s to 72 s: segment 1 only.
    const { project, deps, audio, contexts } = setup((p) => [audioClip(p, "c1", "a1", 0, 60, { in: 70_000_000, out: 72_000_000 })], { layout });
    await renderMixdown(project, { start: 0, end: 60 }, { sampleRate: RATE, channels: 1 }, deps);
    expect(audio.load.mock.calls.map((call) => call[1])).toEqual([1]);
    // The offset within segment 1 (which starts on a 1024-sample boundary near 60 s).
    expect(contexts[0]?.sources[0]?.started?.offset).toBeCloseTo(70 - segmentStartSeconds(layout, 1), 6);
  });

  it("gives null when nothing is heard: no clip, or no decodable audio", async () => {
    const empty = setup(() => []);
    expect(await renderMixdown(empty.project, { start: 0, end: 30 }, { sampleRate: RATE, channels: 1 }, empty.deps)).toBeNull();
    const failing = setup((p) => [audioClip(p, "c1", "a1", 0, 30)], { failing: true });
    expect(await renderMixdown(failing.project, { start: 0, end: 30 }, { sampleRate: RATE, channels: 1 }, failing.deps)).toBeNull();
    expect(failing.contexts).toHaveLength(0);
  });

  it("stops when its signal is aborted", async () => {
    const { project, deps } = setup((p) => [audioClip(p, "c1", "a1", 0, 30)]);
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(renderMixdown(project, { start: 0, end: 30 }, { sampleRate: RATE, channels: 1, signal: controller.signal }, deps)).rejects.toMatchObject({ name: "AbortError" });
  });
});
