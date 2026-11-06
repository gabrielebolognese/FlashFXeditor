// Lottie on the main thread (spec §21.23, Batch 79): the file is parsed whole (animations are small), checked for the
// bodymovin keys (so a `.json` that is not an animation is refused with a message) and described: size, frame rate and
// length come from the file. The worker renders from the same bytes (`renderLottie`).
import { describeLottie, LottieError, readLottie } from "../lottie/lottieFile.js";
import { ProbeError, type ProbeResult } from "./types.js";

export async function probeLottie(file: Blob): Promise<ProbeResult> {
  try {
    const { json, format } = await readLottie(new Uint8Array(await file.arrayBuffer()));
    const info = describeLottie(json, format);
    return { kind: "lottie", durationUs: info.durationUs, width: info.width, height: info.height, fps: info.fps, hasAudio: false, codec: info.format === "dotlottie" ? "dotlottie" : "lottie" };
  } catch (error) {
    if (error instanceof LottieError) throw new ProbeError(error.message);
    throw error;
  }
}
