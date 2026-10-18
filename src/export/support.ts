// Which codecs this browser can encode at a format (spec §16 Custom "as supported by
// VideoEncoder.isConfigSupported"): asked once per codec and format on the main thread (a capability
// query, no encoding) and cached; the Export tab marks the codecs it cannot use (an export asking for
// one falls back to H.264, codecs.ts).
import { chooseConfig, codecConfigs, type VideoConfigFormat } from "./codecs.js";
import type { VideoCodecId } from "./presets.js";

const cache = new Map<string, Promise<boolean>>();

/** Whether `codec` can be encoded at `format` (with its bitrate mode and hardware preference); null without WebCodecs. */
export function codecSupported(format: VideoConfigFormat, codec: VideoCodecId): Promise<boolean> | null {
  if (typeof VideoEncoder === "undefined") return null;
  const { width, height, fps, videoBitrate, maxBitrate, bitrateMode, hardware } = format;
  const key = JSON.stringify([codec, width, height, fps.num, fps.den, videoBitrate, maxBitrate, bitrateMode, hardware]);
  let answer = cache.get(key);
  if (!answer) {
    answer = chooseConfig(codecConfigs(format, codec), async (config) => (await VideoEncoder.isConfigSupported(config)).supported === true).then((config) => config !== null);
    cache.set(key, answer);
  }
  return answer;
}
