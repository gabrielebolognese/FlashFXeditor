import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { beatFrames, detectBeats } from "../../audio/dsp/beats.js";
import { measureLoudness } from "../../audio/dsp/loudness.js";
import { normalizeLoudness } from "../../audio/dsp/normalize.js";
import { trackMix } from "../../timeline/edit/mixer.js";
import { AUDIO_FIXTURE_RATE, buildAudioFixture, CLICK_BEAT_FRAMES, clickChannels, mixChannels, wavBytes } from "./audioFixture.js";
import { validateStrict } from "./strict.js";
import type { MediaClip, Project } from "./types.js";
import { validateProject } from "./validate.js";

const DIR = "fixtures/interop/audio";

// The writer only runs when asked, so a normal run never rewrites files other tests read in parallel.
it.skipIf(!process.env.WRITE_AUDIO_FIXTURE)("writes the audio interop fixture", () => {
  mkdirSync(`${DIR}/media`, { recursive: true });
  writeFileSync(`${DIR}/project.json`, `${JSON.stringify(buildAudioFixture(), null, 2)}\n`);
  writeFileSync(`${DIR}/media/mix.wav`, wavBytes(mixChannels(), AUDIO_FIXTURE_RATE));
  writeFileSync(`${DIR}/media/click.wav`, wavBytes(clickChannels(), AUDIO_FIXTURE_RATE));
});

/** Decodes the 16-bit PCM WAV the writer makes. */
function readWav(file: string): Float32Array[] {
  const bytes = readFileSync(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(22, true);
  const frames = view.getUint32(40, true) / (count * 2);
  const channels = Array.from({ length: count }, () => new Float32Array(frames));
  for (let n = 0; n < frames; n++) for (let c = 0; c < count; c++) (channels[c] as Float32Array)[n] = view.getInt16(44 + (n * count + c) * 2, true) / 32767;
  return channels;
}

describe("fixtures/interop/audio (Batch 77)", () => {
  const read = (): Project => JSON.parse(readFileSync(`${DIR}/project.json`, "utf8")) as Project;

  it("is the project this build writes, strictly valid", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildAudioFixture())));
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("has the audio v2 fields: track gain and pan, a clip pan, a fade curve and the project loudness target", () => {
    const project = read();
    expect(project.tracks.map((t) => [t.gainDb, t.pan])).toEqual([[undefined, undefined], [-6, -1]]);
    expect((project.clips["click-clip"] as MediaClip).volume.pan).toBe(-0.5);
    expect((project.clips["click-clip"] as MediaClip).fades.curve).toBe("exponential");
    expect(project.settings.loudness).toEqual({ targetLufs: -14, truePeakDb: -1 });
    expect(project.tracks.map(trackMix)).toEqual([{ gainDb: 0, pan: 0 }, { gainDb: -6, pan: -1 }]);
  });

  it("mix.wav is -20 LUFS; normalized to -14 LUFS with a -1 dBTP ceiling it reads -14 (+-0.5 LU) and peaks under -1 dBTP", () => {
    const mix = readWav(`${DIR}/media/mix.wav`);
    expect(measureLoudness(mix, AUDIO_FIXTURE_RATE).integrated).toBeCloseTo(-20, 1);
    const out = normalizeLoudness(mix, AUDIO_FIXTURE_RATE, { targetLufs: -14, truePeakDb: -1 });
    const after = measureLoudness(out.channels, AUDIO_FIXTURE_RATE);
    expect(Math.abs(after.integrated + 14)).toBeLessThanOrEqual(0.5);
    expect(after.truePeakDb).toBeLessThanOrEqual(-1);
  });

  it("click.wav: detect beats puts a beat within 1 frame of every click at 120 BPM", () => {
    const [click] = readWav(`${DIR}/media/click.wav`) as [Float32Array];
    const { beats, bpm } = detectBeats(click, AUDIO_FIXTURE_RATE);
    expect(Math.round(bpm)).toBe(120);
    const frames = beatFrames(beats, { start: 0, duration: 180, in: 0, speed: 1 }, { num: 30, den: 1 });
    expect(frames.length).toBe(CLICK_BEAT_FRAMES.length);
    for (const [i, expected] of CLICK_BEAT_FRAMES.entries()) expect(Math.abs((frames[i] as number) - expected)).toBeLessThanOrEqual(1);
    expect(read().markers.map((m) => m.frame)).toEqual([...CLICK_BEAT_FRAMES]);
  });
});
