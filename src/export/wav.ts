// WAV files of the mixdown (spec §16 Export audio): RIFF/WAVE, 16-bit PCM little-endian, interleaved;
// samples are clamped to [-1, 1] and rounded (no dither).

export const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2;

/** The 44-byte header of a 16-bit PCM file holding `frames` sample frames of `channels` channels. */
export function wavHeader(frames: number, channels: number, sampleRate: number): Uint8Array {
  const dataBytes = frames * channels * BYTES_PER_SAMPLE;
  const header = new Uint8Array(WAV_HEADER_BYTES);
  const view = new DataView(header.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) header[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * BYTES_PER_SAMPLE, true);
  view.setUint16(32, channels * BYTES_PER_SAMPLE, true);
  view.setUint16(34, BYTES_PER_SAMPLE * 8, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  return header;
}

/** The total size of such a file (bytes). */
export function wavBytes(frames: number, channels: number): number {
  return WAV_HEADER_BYTES + frames * channels * BYTES_PER_SAMPLE;
}

/**
 * Sample frames [from, from + count) of `planes` (one per channel; frames past a plane's end are
 * silence) as interleaved 16-bit PCM.
 */
export function pcm16(planes: readonly Float32Array[], channels: number, from: number, count: number): Uint8Array {
  const out = new Uint8Array(count * channels * BYTES_PER_SAMPLE);
  const view = new DataView(out.buffer);
  for (let c = 0; c < channels; c++) {
    // A mono mix feeds every channel.
    const plane = planes[Math.min(c, planes.length - 1)];
    for (let i = 0; i < count; i++) {
      const value = plane?.[from + i] ?? 0;
      const clamped = value > 1 ? 1 : value < -1 ? -1 : Number.isNaN(value) ? 0 : value;
      // Rounded symmetrically (halves away from zero), so -x writes the negation of x.
      view.setInt16((i * channels + c) * BYTES_PER_SAMPLE, Math.sign(clamped) * Math.round(Math.abs(clamped) * 32767), true);
    }
  }
  return out;
}
