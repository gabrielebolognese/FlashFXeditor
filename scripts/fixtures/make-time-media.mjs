// Writes the media of fixtures/interop/time (Batch 78): media/clip.mp4, 270 x 480, 30 fps, 2 s, H.264 High
// (yuv420p) with a mono 48 kHz AAC tone. The picture moves many pixels on every frame so a blended frame
// (spec §21.22) shows a visible double exposure:
// - the ffmpeg `testsrc2` pattern (its own gradient and counter move every frame),
// - a white vertical bar 24 px wide that moves 40 px right per frame (no overlap between neighbouring frames),
// - a white horizontal bar 24 px high that moves 32 px down per frame.
// The file is committed; the expected frames are rendered from it with `npm run cli -- render`.
// Usage: node scripts/fixtures/make-time-media.mjs (needs ffmpeg on PATH)
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const media = fileURLToPath(new URL("../../fixtures/interop/time/media/", import.meta.url));
mkdirSync(media, { recursive: true });

const filter = [
  "[0:v][1:v]overlay=x='mod(n*40\\,294)-24':y=0[a]",
  "[a][2:v]overlay=x=0:y='mod(n*32\\,504)-24',format=yuv420p[v]",
].join(";");
const args = [
  "-y",
  "-v", "error",
  "-f", "lavfi", "-i", "testsrc2=size=270x480:rate=30:duration=2",
  "-f", "lavfi", "-i", "color=c=white:size=24x480:rate=30:duration=2",
  "-f", "lavfi", "-i", "color=c=white:size=270x24:rate=30:duration=2",
  "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
  "-filter_complex", filter,
  "-map", "[v]", "-map", "3:a",
  "-c:v", "libx264", "-profile:v", "high", "-crf", "12", "-g", "30", "-threads", "1",
  "-c:a", "aac", "-ac", "1", "-b:a", "64k",
  "-movflags", "+faststart",
  "-shortest",
  join(media, "clip.mp4"),
];
const run = spawnSync("ffmpeg", args, { stdio: "inherit" });
process.exit(run.status ?? 1);
