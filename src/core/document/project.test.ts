import { describe, expect, it } from "vitest";
import { defaultTracks, emptyTrack, nextTrackName } from "./project.js";

describe("track defaults", () => {
  it("names new tracks V/A/CC with the next free number", () => {
    expect(nextTrackName([], "video")).toBe("V1");
    const tracks = [emptyTrack("1", "video", "V1"), emptyTrack("2", "audio", "A1"), emptyTrack("3", "video", "V2")];
    expect(nextTrackName(tracks, "video")).toBe("V3");
    expect(nextTrackName(tracks, "audio")).toBe("A2");
    expect(nextTrackName(tracks, "caption")).toBe("CC1");
    // A renamed track does not block its number; an existing name is skipped.
    expect(nextTrackName([emptyTrack("1", "video", "V2")], "video")).toBe("V3");
    expect(nextTrackName([emptyTrack("1", "video", "Intro")], "video")).toBe("V2");
  });

  it("creates empty, targeted, M-height tracks", () => {
    const [video, audio] = defaultTracks(() => "id");
    expect(video).toMatchObject({ kind: "video", name: "V1", clipIds: [], targeted: true, locked: false, height: "M" });
    expect(audio).toMatchObject({ kind: "audio", name: "A1" });
  });
});
