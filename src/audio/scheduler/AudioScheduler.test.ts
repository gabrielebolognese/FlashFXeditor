import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { MediaClip, Project } from "../../core/document/types.js";
import { AudioMixer, audibleTracks, RAMP_SECONDS } from "../AudioMixer.js";
import { segmentLayout, type SegmentLayout } from "../decode/segments.js";
import { FakeContext, fakeBuffer, type FakeGain, type FakeSource } from "../testAudio.js";
import { applyTrim, rateStretch } from "../../timeline/edit/trim.js";
import { AHEAD_SECONDS, AudioScheduler, START_MARGIN_SECONDS, type AudioSchedulerDeps, type PlayMapping } from "./AudioScheduler.js";

const FPS = { num: 30, den: 1 };
/** Context time = clock time + CONTEXT_OFFSET. */
const CONTEXT_OFFSET = 100;

function audioClip(project: Project, id: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(project, { id, trackId: "a1", start, duration, mediaId: "m", kind: "audio" }), ...extra };
}

interface Options {
  clips?: (project: Project) => MediaClip[];
  layout?: SegmentLayout;
  /** Segments in memory from the start (default: all). */
  loaded?: boolean;
}

function setup(options: Options = {}) {
  let project = withClips({ ...makeProject(), tracks: [makeTrack("v1"), makeTrack("a1", "audio"), makeTrack("a2", "audio")], media: { m: makeMedia("m", "audio") } }, []);
  const clips = options.clips?.(project) ?? [audioClip(project, "c1", 0, 300)];
  project = withClips(project, clips);
  const ctx = new FakeContext();
  const mixer = new AudioMixer(ctx.asGraph());
  let now = 0;
  let epoch = 1;
  const layout = options.layout ?? segmentLayout(48_000, 60 * 48_000);
  const loaded = new Set<number>(options.loaded === false ? [] : Array.from({ length: layout.count }, (_, i) => i));
  const listeners: ((state: Project) => void)[] = [];
  const audio = {
    layout: vi.fn(() => layout),
    segment: vi.fn((_mediaId: string, index: number) => (loaded.has(index) ? fakeBuffer(layout.segmentFrames / layout.sampleRate) : null)),
    request: vi.fn(),
    open: vi.fn(async () => layout),
    hasFailed: vi.fn(() => false),
  };
  const deps: AudioSchedulerDeps = {
    clock: {
      now: () => now,
      get epoch() {
        return epoch;
      },
      contextTime: (t: number) => t + CONTEXT_OFFSET,
      renderLead: () => 0.03,
    },
    mixer: () => mixer,
    document: {
      getState: () => project,
      subscribe: (listener) => {
        listeners.push(listener);
        return () => undefined;
      },
    },
    audio: audio as unknown as AudioSchedulerDeps["audio"],
  };
  const scheduler = new AudioScheduler(deps);
  return {
    scheduler,
    ctx,
    mixer,
    audio,
    loaded,
    /** Sets the output clock; the render clock runs 30 ms ahead of it. */
    at(clock: number) {
      now = clock;
      ctx.currentTime = clock + CONTEXT_OFFSET + 0.03;
    },
    bumpEpoch: () => (epoch += 1),
    edit(next: (project: Project) => Project) {
      project = next(project);
      for (const listener of listeners) listener(project);
    },
    project: () => project,
    mapping: (fields: Partial<PlayMapping> = {}): PlayMapping => ({ frame: 0, clock: 10, speed: 1, end: 300, loop: false, fps: FPS, ...fields }),
  };
}

const voiceSources = (ctx: FakeContext) => ctx.sources.filter((source) => source.started !== null);
const envelopeOf = (source: FakeSource) => source.outputs[0] as FakeGain;

describe("AudioScheduler", () => {
  it("starts the clip under the playhead at the anchor, from its media position, with a fade-in", () => {
    const t = setup();
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10 }));
    const [source] = voiceSources(t.ctx);
    expect(source?.started).toEqual({ when: 110, offset: expect.closeTo(2, 9) });
    expect(source?.stoppedAt).toBeCloseTo(110 + 8, 9);
    expect(source?.playbackRate.value).toBe(1);
    expect(envelopeOf(source as FakeSource).gain.events).toEqual([
      ["cancel", 1, 110],
      ["set", 0, 110],
      ["ramp", 1, 110 + RAMP_SECONDS],
    ]);
  });

  it("starts a clip exactly at its cut, only once it is within 200 ms", () => {
    const t = setup({ clips: (p) => [audioClip(p, "c1", 0, 60), audioClip(p, "c2", 66, 60)] });
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 30, clock: 10 }));
    expect(voiceSources(t.ctx)).toHaveLength(1);
    // c2 starts at timeline 2.2 s = clock 11.2.
    t.at(11.2 - AHEAD_SECONDS - 0.01);
    t.scheduler.sync(t.mapping({ frame: 30, clock: 10 }));
    expect(voiceSources(t.ctx)).toHaveLength(1);
    t.at(11.2 - AHEAD_SECONDS + 0.05);
    t.scheduler.sync(t.mapping({ frame: 30, clock: 10 }));
    const sources = voiceSources(t.ctx);
    expect(sources).toHaveLength(2);
    expect(sources[1]?.started).toEqual({ when: expect.closeTo(111.2, 9), offset: 0 });
    expect(envelopeOf(sources[1] as FakeSource).gain.events).toEqual([]);
    expect((sources[1]?.started?.when ?? 0) - t.ctx.currentTime).toBeLessThanOrEqual(0.4);
  });

  it("moves a late start on by the delay, with a fade-in", () => {
    const t = setup();
    t.at(10.5);
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10 }));
    const [source] = voiceSources(t.ctx);
    const earliest = t.ctx.currentTime + 0.005;
    expect(source?.started?.when).toBeCloseTo(earliest, 9);
    expect(source?.started?.offset).toBeCloseTo(2 + (earliest - 110), 9);
    expect(t.scheduler.stats.late).toBe(1);
  });

  it("plays sped-up clips with their speed as playbackRate", () => {
    const t = setup({ clips: (p) => [audioClip(p, "c1", 0, 150, { speed: 2, in: 1_000_000, out: 11_000_000 })] });
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 30, clock: 10 }));
    const [source] = voiceSources(t.ctx);
    expect(source?.playbackRate.value).toBe(2);
    // 1 s into the clip at 2x: media second 1 + 2.
    expect(source?.started?.offset).toBeCloseTo(3, 9);
  });

  it("follows a rate stretch while playing: the voice restarts at the new speed (pitch follows) and plays to the new end", () => {
    // 5 s of media on [0, 150); stretched to 300 frames it plays at 0.5x, its in and out unchanged.
    const t = setup({ clips: (p) => [audioClip(p, "c1", 0, 150, { in: 0, out: 5_000_000 })] });
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 30, clock: 10 }));
    expect(voiceSources(t.ctx)[0]?.playbackRate.value).toBe(1);
    const stretch = rateStretch(t.project(), "c1", "out", 150);
    expect(stretch.changes.get("c1")).toMatchObject({ duration: 300, speed: 0.5, in: 0, out: 5_000_000 });
    t.edit((p) => applyTrim(p, stretch));
    expect(t.scheduler.stats.stopped).toBe(1);
    t.at(10.01);
    t.scheduler.sync(t.mapping({ frame: 30, clock: 10 }));
    const voice = voiceSources(t.ctx)[1];
    expect(voice?.playbackRate.value).toBe(0.5);
    // The clip now ends at frame 300 (10 s): 9 s after the anchor's frame 30.
    expect(voice?.stoppedAt).toBeCloseTo(100 + 10 + 9, 6);
    // Late by the restart: the media offset moves on at half the rate.
    const late = (voice?.started?.when ?? 0) - 110;
    expect(voice?.started?.offset).toBeCloseTo(0.5 + late * 0.5, 6);
  });

  it("is silent at other transport speeds", () => {
    const t = setup();
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10 }));
    expect(t.scheduler.stats.voices).toBe(1);
    t.at(10.1);
    t.scheduler.sync(t.mapping({ frame: 63, clock: 10.1, speed: 2 }));
    expect(t.scheduler.stats.voices).toBe(0);
    t.scheduler.sync(t.mapping({ frame: 63, clock: 10.1, speed: -1 }));
    expect(voiceSources(t.ctx)).toHaveLength(1);
  });

  it("restarts on a seek: the old voice ramps out over 10 ms, the new one starts at the new position", () => {
    const t = setup();
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10 }));
    t.at(10.4);
    const lead = t.scheduler.lead();
    expect(lead).toBeCloseTo(0.03 + START_MARGIN_SECONDS, 9);
    t.scheduler.sync(t.mapping({ frame: 200, clock: 10.4 + lead }));
    const [old, next] = voiceSources(t.ctx);
    const at = t.ctx.currentTime;
    expect(envelopeOf(old as FakeSource).gain.events.slice(-2)).toEqual([
      ["set", 1, at],
      ["ramp", 0, at + RAMP_SECONDS],
    ]);
    expect(old?.stoppedAt).toBeCloseTo(at + RAMP_SECONDS, 9);
    expect(next?.started?.when).toBeCloseTo(110.4 + lead, 9);
    expect(next?.started?.offset).toBeCloseTo(200 / 30, 9);
    // Heard within the lead of the seek (output latency + margin), well under 50 ms.
    expect((next?.started?.when ?? 0) - (10.4 + CONTEXT_OFFSET)).toBeLessThan(0.05);
  });

  it("ramps a voice that faded in out from full level when it stops (no click)", () => {
    const t = setup();
    // Starts mid-clip with a fade-in, which has long ended by the seek.
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10 }));
    t.at(12);
    t.scheduler.sync(t.mapping({ frame: 200, clock: 12 + t.scheduler.lead() }));
    const envelope = envelopeOf(voiceSources(t.ctx)[0] as FakeSource).gain;
    const at = t.ctx.currentTime;
    // A ramp without its own start point would run from the fade-in's end (110.01) and render ~0 here.
    expect(envelope.valueAt(at)).toBeCloseTo(1, 9);
    expect(envelope.valueAt(at + RAMP_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(envelope.valueAt(at + RAMP_SECONDS)).toBe(0);
    // A second change during the ramp continues from where the first one is.
    const track = t.mixer.trackInput("a1") as unknown as FakeGain;
    t.edit((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === "a1" ? { ...x, muted: true } : x)) }));
    t.ctx.currentTime += RAMP_SECONDS / 4;
    t.edit((p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === "a1" ? { ...x, muted: false } : x)) }));
    expect(track.gain.valueAt(t.ctx.currentTime)).toBeCloseTo(0.75, 9);
    expect(track.gain.valueAt(t.ctx.currentTime + RAMP_SECONDS)).toBe(1);
  });

  it("schedules the next loop pass ahead of the wrap and keeps it when the engine re-anchors there", () => {
    const t = setup({ clips: (p) => [audioClip(p, "c1", 0, 90)] });
    t.at(9.95);
    // Frame 60 at clock 10: the end (90) comes at clock 11, the clip starts again there.
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10, end: 90, loop: true }));
    t.at(10.9);
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10, end: 90, loop: true }));
    const sources = voiceSources(t.ctx);
    expect(sources).toHaveLength(2);
    expect(sources[1]?.started).toEqual({ when: expect.closeTo(111, 9), offset: 0 });
    // The engine wraps: frame 0 at clock 11, the same mapping. Nothing restarts.
    t.at(11.01);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 11, end: 90, loop: true }));
    expect(t.scheduler.stats.stopped).toBe(0);
    expect(voiceSources(t.ctx)).toHaveLength(2);
  });

  it("applies mute and solo to the track gains with a ramp, at once", () => {
    const t = setup({ clips: (p) => [audioClip(p, "c1", 0, 300), { ...audioClip(p, "c2", 0, 300), trackId: "a2" }] });
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
    const a1 = t.mixer.trackInput("a1") as unknown as FakeGain;
    const a2 = t.mixer.trackInput("a2") as unknown as FakeGain;
    t.edit((p) => ({ ...p, tracks: p.tracks.map((track) => (track.id === "a2" ? { ...track, solo: true } : track)) }));
    expect(a1.gain.events.at(-1)).toEqual(["ramp", 0, t.ctx.currentTime + RAMP_SECONDS]);
    expect(a2.gain.events).toEqual([]);
    t.edit((p) => ({ ...p, tracks: p.tracks.map((track) => (track.id === "a2" ? { ...track, solo: false, muted: true } : track)) }));
    expect(a1.gain.target).toBe(1);
    expect(a2.gain.target).toBe(0);
    expect(t.scheduler.stats.stopped).toBe(0);
  });

  it("ramps a removed track out before disconnecting it (no click)", () => {
    vi.useFakeTimers();
    try {
      const t = setup({ clips: (p) => [{ ...audioClip(p, "c2", 0, 300), trackId: "a2" }] });
      t.at(9.95);
      t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
      const a2 = t.mixer.trackInput("a2") as unknown as FakeGain;
      expect(a2.outputs).toHaveLength(1);
      t.edit((p) => ({ ...p, tracks: p.tracks.filter((track) => track.id !== "a2"), clips: {} }));
      expect(a2.gain.events.at(-1)).toEqual(["ramp", 0, t.ctx.currentTime + RAMP_SECONDS]);
      // Still connected while the ramp plays out; disconnected after it.
      expect(a2.outputs).toHaveLength(1);
      vi.advanceTimersByTime(RAMP_SECONDS * 1000 + 100);
      expect(a2.outputs).toHaveLength(0);
      // A track with that id added again gets a new node.
      expect(t.mixer.trackInput("a2")).not.toBe(a2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ramps a clip's gain change and restarts a clip that moved", () => {
    const t = setup();
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
    const [first] = voiceSources(t.ctx);
    const clipGainNode = envelopeOf(first as FakeSource).outputs[0] as FakeGain;
    t.edit((p) => ({ ...p, clips: { ...p.clips, c1: { ...(p.clips.c1 as MediaClip), volume: { gainDb: 6, muted: false } } } }));
    expect(clipGainNode.gain.target).toBeCloseTo(10 ** (6 / 20), 9);
    expect(t.scheduler.stats.stopped).toBe(0);
    t.edit((p) => ({ ...p, clips: { ...p.clips, c1: { ...(p.clips.c1 as MediaClip), start: 3 } } }));
    expect(t.scheduler.stats.stopped).toBe(1);
    t.at(10.01);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
    expect(voiceSources(t.ctx)).toHaveLength(2);
  });

  it("plays a clip across a segment boundary as back-to-back voices", () => {
    const layout = segmentLayout(48_000, 11 * 60 * 48_000);
    const boundary = layout.segmentFrames / 48_000;
    const t = setup({ layout, clips: (p) => [audioClip(p, "c1", 0, 600, { in: Math.round((boundary - 1) * 1e6), out: Math.round((boundary + 19) * 1e6) })] });
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
    t.at(10.85);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
    const [a, b] = voiceSources(t.ctx);
    expect(a?.started?.offset).toBeCloseTo(boundary - 1, 6);
    expect(b?.started).toEqual({ when: expect.closeTo(111, 6), offset: expect.closeTo(0, 6) });
    expect(a?.stoppedAt).toBeCloseTo(111, 6);
    expect(envelopeOf(b as FakeSource).gain.events).toEqual([]);
  });

  it("asks for audio that is not in memory and joins once it is loaded", () => {
    const t = setup({ loaded: false });
    t.at(9.95);
    expect(t.scheduler.prepare(t.project(), 60)).toBe(false);
    expect(t.audio.request).toHaveBeenCalledWith("m", 0, "playback");
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10 }));
    expect(voiceSources(t.ctx)).toHaveLength(0);
    t.loaded.add(0);
    expect(t.scheduler.prepare(t.project(), 60)).toBe(true);
    t.at(10.3);
    t.scheduler.sync(t.mapping({ frame: 60, clock: 10 }));
    const [source] = voiceSources(t.ctx);
    expect(source?.started?.offset).toBeCloseTo(2 + (t.ctx.currentTime + 0.005 - 110), 9);
  });

  it("stops everything on pause and when the clock re-bases", () => {
    const t = setup();
    t.at(9.95);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
    t.bumpEpoch();
    t.at(10.06);
    t.scheduler.sync(t.mapping({ frame: 0, clock: 10 }));
    expect(t.scheduler.stats.stopped).toBe(1);
    expect(t.scheduler.stats.voices).toBe(1);
    t.scheduler.stop();
    expect(t.scheduler.stats.voices).toBe(0);
  });
});

describe("audibleTracks", () => {
  it("hears unmuted tracks, and only soloed ones when any is soloed", () => {
    const tracks = [makeTrack("a1", "audio"), { ...makeTrack("a2", "audio"), muted: true }, makeTrack("v1")];
    expect([...audibleTracks({ tracks })]).toEqual([
      ["a1", true],
      ["a2", false],
    ]);
    const solo = [{ ...makeTrack("a1", "audio"), solo: true }, makeTrack("a2", "audio"), { ...makeTrack("a3", "audio"), solo: true, muted: true }];
    expect([...audibleTracks({ tracks: solo })]).toEqual([
      ["a1", true],
      ["a2", false],
      ["a3", false],
    ]);
  });
});
