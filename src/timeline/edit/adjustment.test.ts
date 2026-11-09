import { describe, expect, it } from "vitest";
import { makeProject, makeShapeClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Command } from "../../core/commands/command.js";
import type { Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { addAdjustment } from "./adjustment.js";

const ids = (from: number) => {
  let n = from;
  return () => `id${n++}`;
};

const run = (p: Project, command: Command): Project => {
  const next = structuredClone(p);
  command.run(next as never, { playhead: 0 } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};

describe("add an adjustment", () => {
  it("puts an empty, fully shown adjustment clip on the topmost video track when it is free there", () => {
    const p = makeProject();
    p.tracks = [makeTrack("v1"), makeTrack("v2")];
    const added = addAdjustment(withClips(p, [makeShapeClip({ id: "a", trackId: "v1", start: 0, duration: 100 })]), 12.4, ids(0));
    const next = run(withClips(p, [makeShapeClip({ id: "a", trackId: "v1", start: 0, duration: 100 })]), added.command);
    expect(next.clips[added.clipId]).toMatchObject({ kind: "adjustment", trackId: "v2", start: 12, effects: [], opacity: 1, name: "Adjustment" });
    expect(next.clips[added.clipId]).not.toHaveProperty("transform");
    expect(next.tracks).toHaveLength(2);
  });

  it("adds a new track above every other when the top one is busy, so the clip adjusts all of them", () => {
    const p = makeProject();
    p.tracks = [makeTrack("v1"), makeTrack("v2")];
    const project = withClips(p, [makeShapeClip({ id: "a", trackId: "v2", start: 0, duration: 400 })]);
    const added = addAdjustment(project, 30, ids(0));
    const next = run(project, added.command);
    const videos = next.tracks.filter((track) => track.kind === "video");
    expect(videos).toHaveLength(3);
    expect(videos.at(-1)?.clipIds).toEqual([added.clipId]);
  });
});
