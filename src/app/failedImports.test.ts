import { beforeEach, describe, expect, it } from "vitest";
import { dismissFailedImport, failedImports, recordImport } from "./failedImports.js";

const corrupt = { name: "broken.mp4", container: "mp4" as const, reason: "Not a readable MP4/MOV file (no movie header found)" };
const silent = { name: "empty.mov", container: "mp4" as const, reason: "The file has no video or audio track" };

beforeEach(() => dismissFailedImport());

describe("failed imports", () => {
  it("keeps each failed file with its reason until it is dismissed", () => {
    recordImport([corrupt, silent], ["fine.mp4"]);
    expect(failedImports.getState().map(({ name, reason }) => ({ name, reason }))).toEqual([
      { name: "broken.mp4", reason: corrupt.reason },
      { name: "empty.mov", reason: silent.reason },
    ]);
    const [first] = failedImports.getState();
    dismissFailedImport(first?.id);
    expect(failedImports.getState().map((entry) => entry.name)).toEqual(["empty.mov"]);
    dismissFailedImport();
    expect(failedImports.getState()).toEqual([]);
  });

  it("replaces the entry of a file that fails again, in place, and drops it once it imports", () => {
    recordImport([corrupt, silent], []);
    const before = failedImports.getState();
    recordImport([{ ...corrupt, reason: "could not copy it into media/ (disk full)" }], []);
    const after = failedImports.getState();
    expect(after.map((entry) => entry.name)).toEqual(["broken.mp4", "empty.mov"]);
    expect(after[0]?.reason).toBe("could not copy it into media/ (disk full)");
    expect(after[0]?.id).not.toBe(before[0]?.id);
    recordImport([], ["broken.mp4"]);
    expect(failedImports.getState().map((entry) => entry.name)).toEqual(["empty.mov"]);
  });

  it("leaves the store alone when nothing changes", () => {
    recordImport([corrupt], []);
    const state = failedImports.getState();
    recordImport([], ["other.mp4"]);
    expect(failedImports.getState()).toBe(state);
    dismissFailedImport("nope");
    expect(failedImports.getState()).toBe(state);
  });
});
