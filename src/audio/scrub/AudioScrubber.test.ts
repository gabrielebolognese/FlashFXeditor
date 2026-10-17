import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { MediaClip, Project } from "../../core/document/types.js";
import { AudioMixer } from "../AudioMixer.js";
import { segmentLayout } from "../decode/segments.js";
import { FakeContext, fakeBuffer, type FakeGain, type FakeSource } from "../testAudio.js";
import { AudioScrubber, GRAIN_LEAD_SECONDS, GRAIN_RAMP_SECONDS, GRAIN_SECONDS } from "./AudioScrubber.js";

function setup(clips: (p: Project) => MediaClip[], loaded = true) {
  let project = withClips({ ...makeProject(), tracks: [makeTrack("v1"), makeTrack("a1", "audio"), makeTrack("a2", "audio")], media: { m: makeMedia("m", "audio") } }, []);
  project = withClips(project, clips(project));
  const ctx = new FakeContext();
  ctx.currentTime = 50;
  const mixer = new AudioMixer(ctx.asGraph());
  const layout = segmentLayout(48_000, 60 * 48_000);
  const audio = {
    layout: vi.fn(() => layout),
    segment: vi.fn(() => (loaded ? fakeBuffer(60) : null)),
    request: vi.fn(),
    open: vi.fn(async () => layout),
    hasFailed: vi.fn(() => false),
  };
  const scrubber = new AudioScrubber({ mixer: () => mixer, audio: audio as never });
  return { scrubber, ctx, mixer, audio, project: () => project, setProject: (next: Project) => (project = next) };
}

const audioClip = (p: Project, id: string, start: number, duration: number, extra: Partial<MediaClip> = {}): MediaClip => ({
  ...makeMediaClip(p, { id, trackId: "a1", start, duration, mediaId: "m", kind: "audio" }),
  ...extra,
});
const started = (ctx: FakeContext) => ctx.sources.filter((source) => source.started !== null);
const gainOf = (source: FakeSource) => (source.outputs[0] as FakeGain).gain;
const releaseOf = (source: FakeSource) => ((source.outputs[0] as FakeGain).outputs[0] as FakeGain).gain;

describe("AudioScrubber (Batch 37)", () => {
  it("plays a 40 ms grain of each heard clip at the frame's media time, rising from and falling to silence", () => {
    const t = setup((p) => [audioClip(p, "a", 0, 300, { in: 2_000_000, out: 12_000_000, volume: { gainDb: -6, muted: false } }), audioClip(p, "b", 0, 300, { trackId: "a2" })]);
    expect(t.scrubber.grain(t.project(), 30)).toBe(2);
    const [a, b] = started(t.ctx) as [FakeSource, FakeSource];
    const at = 50 + GRAIN_LEAD_SECONDS;
    // Frame 30 at 30 fps = 1 s into the clips: media 3 s for a (in point 2 s), 1 s for b.
    expect(a.started).toEqual({ when: expect.closeTo(at, 9), offset: expect.closeTo(3, 9) });
    expect(b.started?.offset).toBeCloseTo(1, 9);
    expect(a.stoppedAt).toBeCloseTo(at + GRAIN_SECONDS, 9);
    const gain = gainOf(a);
    const level = 10 ** (-6 / 20);
    // Silent before its first event too (a source starting a hair early plays no spike).
    expect(gain.valueAt(at - 0.001)).toBe(0);
    expect(gain.valueAt(at)).toBe(0);
    expect(gain.valueAt(at + GRAIN_RAMP_SECONDS)).toBeCloseTo(level, 9);
    expect(gain.valueAt(at + 0.02)).toBeCloseTo(level, 9);
    expect(gain.valueAt(at + GRAIN_SECONDS)).toBeCloseTo(0, 9);
    // Through the release node into the track inputs (mute and solo apply there).
    expect(((a.outputs[0] as FakeGain).outputs[0] as FakeGain).outputs[0]).toBe(t.mixer.trackInput("a1"));
    expect(releaseOf(a).events).toEqual([]);
  });

  it("fades the previous grain out from its value when a new one starts", () => {
    const t = setup((p) => [audioClip(p, "a", 0, 300)]);
    t.scrubber.grain(t.project(), 30);
    t.ctx.currentTime = 50.01;
    t.scrubber.grain(t.project(), 31);
    const [first, second] = started(t.ctx) as [FakeSource, FakeSource];
    // The second grain starts at 50.01 + the lead: the first one fades out from there.
    const release = 50.01 + GRAIN_LEAD_SECONDS;
    // The envelope is left as it was (no cancelled ramp: no jump); the release node fades it out.
    expect(gainOf(first).valueAt(release)).toBeCloseTo(1, 9);
    expect(gainOf(first).events.some(([kind]) => kind === "cancel" || kind === "hold")).toBe(false);
    expect(releaseOf(first).valueAt(release)).toBe(1);
    expect(releaseOf(first).valueAt(release + GRAIN_RAMP_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(releaseOf(first).valueAt(release + GRAIN_RAMP_SECONDS)).toBe(0);
    expect(first.stoppedAt).toBeCloseTo(release + GRAIN_RAMP_SECONDS, 9);
    expect(second.started?.offset).toBeCloseTo(31 / 30, 9);
  });

  it("follows the clip's level there (volume keys, fades, mute) and skips what is not heard", () => {
    const keyed = { "volume.gainDb": [{ frame: 0, value: -12, ease: "linear" as const }] };
    const t = setup((p) => [audioClip(p, "a", 0, 300, { keyframes: keyed, fades: { in: 30, out: 0 } }), audioClip(p, "m", 0, 300, { trackId: "a2", volume: { gainDb: 0, muted: true } })]);
    expect(t.scrubber.grain(t.project(), 15)).toBe(1);
    const gain = gainOf(started(t.ctx)[0] as FakeSource);
    // -12 dB times the equal-power fade in halfway (sin 45°).
    expect(gain.valueAt(50 + GRAIN_LEAD_SECONDS + 0.02)).toBeCloseTo(10 ** (-12 / 20) * Math.SQRT1_2, 6);
    // Past the clip: nothing.
    expect(t.scrubber.grain(t.project(), 400)).toBe(0);
  });

  it("asks for audio that is not in memory and plays nothing until it is there", () => {
    const t = setup((p) => [audioClip(p, "a", 0, 300)], false);
    expect(t.scrubber.grain(t.project(), 30)).toBe(0);
    expect(t.audio.request).toHaveBeenCalledWith("m", 0, "playback");
  });

  it("is silent before the AudioContext runs", () => {
    const scrubber = new AudioScrubber({ mixer: () => null, audio: {} as never });
    expect(scrubber.grain(makeProject(), 0)).toBe(0);
  });
});
