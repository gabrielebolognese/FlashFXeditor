import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { probeLottie } from "./lottieProbe.js";
import { ProbeError } from "./types.js";

const open = (name: string) => new Blob([readFileSync(`fixtures/interop/lottie/animations/${name}`)]);
const notAnimation = () => new Blob([JSON.stringify({ name: "package" })]);

describe("probeLottie (Batch 79)", () => {
  it("reads the size, rate and length of a json animation and of a .lottie archive", async () => {
    expect(await probeLottie(open("bounce.json"))).toEqual({ kind: "lottie", durationUs: 1_500_000, width: 320, height: 200, fps: { num: 60, den: 1 }, hasAudio: false, codec: "lottie" });
    expect(await probeLottie(open("pulse.lottie"))).toMatchObject({ kind: "lottie", durationUs: 2_000_000, width: 200, height: 200, fps: { num: 30, den: 1 }, codec: "dotlottie" });
  });

  it("refuses a file that is not an animation, with a message", async () => {
    await expect(probeLottie(notAnimation())).rejects.toBeInstanceOf(ProbeError);
    await expect(probeLottie(notAnimation())).rejects.toThrow(/not a Lottie/);
    await expect(probeLottie(new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])]))).rejects.toBeInstanceOf(ProbeError);
  });
});
