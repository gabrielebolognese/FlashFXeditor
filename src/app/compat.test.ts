import { describe, expect, it } from "vitest";
import { findMissingApis } from "./compat.js";

const ALL_GLOBALS = [
  "VideoDecoder",
  "VideoEncoder",
  "AudioDecoder",
  "AudioEncoder",
  "VideoFrame",
  "ImageDecoder",
  "showDirectoryPicker",
  "showSaveFilePicker",
];

function fakeWindow(globals: string[], gpu: boolean): Window {
  const win: Record<string, unknown> = { navigator: gpu ? { gpu: {} } : {} };
  for (const name of globals) win[name] = () => {};
  return win as unknown as Window;
}

describe("findMissingApis", () => {
  it("returns nothing when every API is present", () => {
    expect(findMissingApis(fakeWindow(ALL_GLOBALS, true))).toEqual([]);
  });

  it("lists each missing API", () => {
    const missing = findMissingApis(fakeWindow(["VideoDecoder", "VideoFrame"], false));
    expect(missing).toContain("WebGPU (navigator.gpu) or WebGL2");
    expect(missing).toContain("WebCodecs VideoEncoder");
    expect(missing).toContain("File System Access (showDirectoryPicker)");
    expect(missing).not.toContain("WebCodecs VideoDecoder");
  });

  it("accepts WebGL2 without WebGPU (Batch 48)", () => {
    expect(findMissingApis(fakeWindow([...ALL_GLOBALS, "WebGL2RenderingContext"], false))).toEqual([]);
  });

  it("reports jsdom as unsupported", () => {
    expect(findMissingApis(window).length).toBeGreaterThan(0);
  });
});
