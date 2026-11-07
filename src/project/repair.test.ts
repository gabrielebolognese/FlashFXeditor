import { describe, expect, it } from "vitest";
import { createProject } from "../core/document/project.js";
import type { MediaItem, Project, MediaClip } from "../core/document/types.js";
import type { ProbeResult } from "../media/probe/types.js";
import { createMemoryDir } from "./memoryFs.js";
import { repairLogName, repairProject, writeRepairLog } from "./repair.js";

const NOW = "2026-11-07T08:00:00.000Z";

async function setup() {
  const dir = createMemoryDir("P");
  const media = await dir.dir("media", { create: true });
  await media!.writeFile("tone.wav", new Blob([new Uint8Array(100)]));
  const item: MediaItem = { id: "m1", kind: "audio", name: "tone.wav", file: { relPath: "media/tone.wav" }, durationUs: 10_000_000, hasAudio: true, analysis: { thumbs: "none", peaks: "pending" }, addedAt: NOW, size: 100 };
  const base = createProject({ id: "p", name: "P", now: NOW, appVersion: "t" });
  const track = { id: "a1", kind: "audio" as const, name: "A1", clipIds: ["c1", "c2"], locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" as const };
  const clip = (id: string, start: number, inUs: number, outUs: number, duration: number): MediaClip =>
    ({ id, trackId: "a1", kind: "audio", name: id, start, duration, enabled: true, mediaId: "m1", in: inUs, out: outUs, speed: 1, volume: { gainDb: 0, muted: false }, fades: { in: 0, out: 0 } }) as unknown as MediaClip;
  const project: Project = { ...base, media: { m1: item }, tracks: [track], clips: { c1: clip("c1", 0, 0, 10_000_000, 300), c2: clip("c2", 400, 0, 4_000_000, 120) } };
  return { dir, project };
}

const header = (durationUs: number) => async (): Promise<ProbeResult> => ({ kind: "audio", durationUs, hasAudio: true });

describe("repairProject (spec §21.5)", () => {
  it("corrects a 10.0 s record of a 9.5 s file and trims the clip past the new end, once", async () => {
    const { dir, project } = await setup();
    const report = await repairProject(project, dir, header(9_500_000));
    expect(report.media).toBe(1);
    expect(report.clipsTrimmed).toBe(1);
    expect(report.project.media["m1"]?.durationUs).toBe(9_500_000);
    const c1 = report.project.clips["c1"] as MediaClip;
    expect(c1.out).toBe(9_500_000);
    expect(c1.duration).toBe(285);
    expect(report.project.clips["c2"]).toBe(project.clips["c2"]); // inside the media: untouched
    expect(report.lines.join("\n")).toContain("tone.wav: duration 10.000 s -> 9.500 s");
    // A second pass finds nothing.
    const again = await repairProject(report.project, dir, header(9_500_000));
    expect(again.media).toBe(0);
    expect(again.project).toBe(report.project);
  });

  it("writes the log file under history/ with the counts and the lines", async () => {
    const { dir, project } = await setup();
    const report = await repairProject(project, dir, header(9_500_000));
    const now = new Date("2026-11-07T08:00:05.000Z");
    const path = await writeRepairLog(dir, report, now);
    expect(path).toBe(`history/${repairLogName(now)}`);
    expect(path).toBe("history/repair-20261107-080005.log");
    const text = (await (await dir.dir("history"))!.readFile("repair-20261107-080005.log"))!.text;
    expect(text).toContain("1 media record(s) corrected, 1 clip(s) trimmed");
    expect(text).toContain("- tone.wav: duration 10.000 s -> 9.500 s");
  });

  it("leaves a record within one frame, an unreadable header and a missing file alone", async () => {
    const { dir, project } = await setup();
    expect((await repairProject(project, dir, header(9_990_000))).media).toBe(0);
    const unreadable = await repairProject(project, dir, async () => {
      throw new Error("no header reader");
    });
    expect(unreadable.project).toBe(project);
    const missing = { ...project, media: { m1: { ...project.media["m1"]!, file: { relPath: "media/gone.wav" } } } } as Project;
    expect((await repairProject(missing, dir, header(1))).media).toBe(0);
  });

  it("corrects size, frame rate, audio presence and the file size of a video record", async () => {
    const { dir, project } = await setup();
    const video: MediaItem = { ...project.media["m1"]!, kind: "video", width: 100, height: 100, fps: { num: 30, den: 1 }, hasAudio: false, durationUs: 2_000_000, size: 5 };
    const probed = async (): Promise<ProbeResult> => ({ kind: "video", durationUs: 2_000_000, width: 270, height: 480, fps: { num: 25, den: 1 }, hasAudio: true });
    const report = await repairProject({ ...project, media: { m1: video }, clips: {}, tracks: [{ ...project.tracks[0]!, clipIds: [] }] }, dir, probed);
    expect(report.project.media["m1"]).toMatchObject({ width: 270, height: 480, fps: { num: 25, den: 1 }, hasAudio: true, size: 100 });
    expect(report.lines).toHaveLength(4);
  });
});
