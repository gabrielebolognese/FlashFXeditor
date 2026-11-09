import { describe, expect, it } from "vitest";
import { makeTrack } from "../core/document/fixtures.js";
import { AudioMixer, dbToGain, RAMP_SECONDS, trackLevel } from "./AudioMixer.js";
import { FakeContext, type FakeGain, type FakePanner } from "./testAudio.js";

describe("track gain and pan (Batch 77)", () => {
  it("trackLevel is the linear gain of the track's dB (0 dB: 1)", () => {
    expect(trackLevel({})).toBe(1);
    expect(trackLevel({ gainDb: -6 })).toBeCloseTo(0.501187, 5);
    expect(trackLevel({ gainDb: 12 })).toBeCloseTo(dbToGain(12), 9);
  });

  it("a track starts at its gain and pan, and a change ramps both without a click", () => {
    const ctx = new FakeContext();
    const mixer = new AudioMixer(ctx.asGraph());
    const track = { ...makeTrack("a1", "audio"), gainDb: -6, pan: -1 };
    mixer.updateTracks({ tracks: [track] });
    const input = mixer.trackInput("a1") as unknown as FakeGain;
    const pan = input.outputs[0] as unknown as FakePanner;
    expect(input.gain.value).toBeCloseTo(0.501187, 5);
    expect(pan.pan.value).toBe(-1);
    // Later: +0 dB, centered: ramped, not jumped.
    mixer.updateTracks({ tracks: [{ ...track, gainDb: 0, pan: 0 }] });
    expect(input.gain.events.some((e) => e[0] === "ramp" && e[1] === 1 && e[2] === ctx.currentTime + RAMP_SECONDS)).toBe(true);
    expect(pan.pan.events.some((e) => e[0] === "ramp" && e[1] === 0)).toBe(true);
  });

  it("a muted track is silent whatever its gain, and the pan clamps to -1..1", () => {
    const ctx = new FakeContext();
    const mixer = new AudioMixer(ctx.asGraph());
    mixer.updateTracks({ tracks: [{ ...makeTrack("a1", "audio"), gainDb: 6, pan: 5, muted: true }] });
    const input = mixer.trackInput("a1") as unknown as FakeGain;
    expect(input.gain.value).toBe(0);
    expect((input.outputs[0] as unknown as FakePanner).pan.value).toBe(1);
  });
});
