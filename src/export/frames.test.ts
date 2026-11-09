import { describe, expect, it } from "vitest";
import { exportPlan } from "./plan.js";
import { PauseGate } from "./pipeline.js";
import { runFrames, sequenceFileName, sequenceRange, type FramesDeps, type FramesProgress } from "./frames.js";
import type { RgbaImage } from "./gif.js";

const fps30 = { num: 30, den: 1 };
const plan = (frames: number, fps = fps30) => exportPlan({ start: 10, end: 10 + frames * (30 / (fps.num / fps.den)) }, fps30, fps, 2, 48000);

function deps(rendered: number[] = []): FramesDeps {
  let clock = 0;
  return {
    async render(frame, k) {
      rendered.push(frame);
      const data = new Uint8ClampedArray(8 * 8 * 4);
      for (let i = 0; i < 64; i++) data.set([(k * 20) & 255, (i * 4) & 255, 90, 255], i * 4);
      return { width: 8, height: 8, data } satisfies RgbaImage;
    },
    async encodePng(image) {
      return Uint8Array.of(0x89, 0x50, 0x4e, 0x47, image.width);
    },
    now: () => (clock += 200),
  };
}

const job = (frames: number, container: "png" | "gif", name = "x", fps = fps30) => ({ plan: plan(frames, fps), container, width: 8, height: 8, dither: container === "gif", name });

describe("sequence names", () => {
  it("numbers frames from 1 with five digits", () => {
    expect(sequenceFileName("title", 0)).toBe("title_00001.png");
    expect(sequenceFileName("title", 99999)).toBe("title_100000.png");
    expect(sequenceRange("a", 1)).toBe("a_00001.png");
    expect(sequenceRange("a", 12)).toBe("a_00001.png … a_00012.png");
  });
});

describe("runFrames PNG", () => {
  it("renders every frame of the plan and emits one numbered file each, with progress", async () => {
    const rendered: number[] = [];
    const out: FramesProgress[] = [];
    const result = await runFrames(job(5, "png", "clip"), deps(rendered), new AbortController().signal, (p) => out.push(p));
    expect(result.frames).toBe(5);
    expect(rendered).toEqual([10, 11, 12, 13, 14]);
    const files = out.filter((p) => p.kind === "file") as Extract<FramesProgress, { kind: "file" }>[];
    expect(files.map((f) => f.name)).toEqual(["clip_00001.png", "clip_00002.png", "clip_00003.png", "clip_00004.png", "clip_00005.png"]);
    expect(new Uint8Array(files[0]!.data)[1]).toBe(0x50);
    expect(out.at(-1)).toEqual({ kind: "frames", done: 5, total: 5 });
    expect(out[0]).toMatchObject({ kind: "started" });
  });

  it("takes every second project frame when the export rate is half the project rate", async () => {
    const rendered: number[] = [];
    await runFrames(job(4, "png", "x", { num: 15, den: 1 }), deps(rendered), new AbortController().signal, () => undefined);
    expect(rendered).toEqual([10, 12, 14, 16]);
  });

  it("stops at an abort, and waits while paused", async () => {
    const controller = new AbortController();
    const seen: string[] = [];
    const d = deps();
    const render = d.render;
    d.render = async (frame, k, signal) => {
      if (k === 2) controller.abort(new Error("stop"));
      return render(frame, k, signal);
    };
    await expect(runFrames(job(6, "png"), d, controller.signal, (p) => seen.push(p.kind))).rejects.toThrow("stop");
    expect(seen.filter((k) => k === "file").length).toBe(3);

    const gate = new PauseGate();
    gate.set(true);
    let done = false;
    const run = runFrames(job(2, "png"), deps(), new AbortController().signal, () => undefined, gate).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    gate.set(false);
    await run;
    expect(done).toBe(true);
  });
});

describe("runFrames GIF", () => {
  it("emits the estimate first, then the file bytes in order with their positions, ending in the trailer", async () => {
    const out: FramesProgress[] = [];
    const result = await runFrames(job(12, "gif", "g"), deps(), new AbortController().signal, (p) => out.push(p));
    expect(result).toMatchObject({ frames: 12, files: 1 });
    const estimate = out.findIndex((p) => p.kind === "estimate");
    const firstBytes = out.findIndex((p) => p.kind === "bytes");
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(firstBytes);
    const chunks = out.filter((p) => p.kind === "bytes") as Extract<FramesProgress, { kind: "bytes" }>[];
    let position = 0;
    let total = 0;
    for (const chunk of chunks) {
      expect(chunk.position).toBe(position);
      position += chunk.data.byteLength;
      total += chunk.data.byteLength;
    }
    const file = new Uint8Array(total);
    for (const chunk of chunks) file.set(new Uint8Array(chunk.data), chunk.position);
    expect(new TextDecoder().decode(file.slice(0, 6))).toBe("GIF89a");
    expect(file[file.length - 1]).toBe(0x3b);
    // The estimate (from 8 sampled frames) is close to the real size of this simple clip.
    const projected = (out[estimate] as { bytes: number }).bytes;
    expect(Math.abs(projected - total) / total).toBeLessThan(0.2);
  });
});
