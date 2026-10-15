import { describe, expect, it } from "vitest";
import {
  addToSelection,
  clickSelection,
  EMPTY_SELECTION,
  filterSelection,
  fromSnapshot,
  selectClips,
  selectedTrackIds,
  selectionEquals,
  selectTracks,
  toSnapshot,
  trackClickSelection,
  type Selection,
} from "./selection.js";

const ids = (selection: Selection) => [...selection.clipIds];

describe("clickSelection", () => {
  it("selects only the clicked clip and its partners on a plain click", () => {
    const one = clickSelection(EMPTY_SELECTION, "a", "none");
    expect(one).toMatchObject({ primary: "a", kind: "clips" });
    expect(ids(one)).toEqual(["a"]);
    const two = clickSelection(clickSelection(one, "b", "shift"), "c", "none", ["c-audio"]);
    expect(ids(two)).toEqual(["c", "c-audio"]);
    expect(two.primary).toBe("c");
  });

  it("toggles with Shift: an added clip becomes the primary, removing the primary passes it on", () => {
    let selection = clickSelection(EMPTY_SELECTION, "a", "shift");
    selection = clickSelection(selection, "b", "shift");
    selection = clickSelection(selection, "c", "shift");
    expect(ids(selection)).toEqual(["a", "b", "c"]);
    expect(selection.primary).toBe("c");
    selection = clickSelection(selection, "b", "shift");
    expect(ids(selection)).toEqual(["a", "c"]);
    expect(selection.primary).toBe("c");
    selection = clickSelection(selection, "c", "shift");
    expect(selection.primary).toBe("a");
    expect(clickSelection(selection, "a", "shift")).toBe(EMPTY_SELECTION);
  });

  it("toggles the linked partners with Shift, and only the clip with Mod", () => {
    let selection = clickSelection(EMPTY_SELECTION, "v", "shift", ["a"]);
    expect(ids(selection)).toEqual(["v", "a"]);
    selection = clickSelection(selection, "x", "mod", ["x-audio"]);
    expect(ids(selection)).toEqual(["v", "a", "x"]);
    expect(selection.primary).toBe("x");
    selection = clickSelection(selection, "v", "shift", ["a"]);
    expect(ids(selection)).toEqual(["x"]);
    selection = clickSelection(selection, "x", "mod");
    expect(selection).toBe(EMPTY_SELECTION);
  });

  it("selects only the clip with Alt, even when partners are given", () => {
    const selection = clickSelection(selectClips(["a", "b"]), "v", "alt", ["v-audio"]);
    expect(ids(selection)).toEqual(["v"]);
    expect(selection.primary).toBe("v");
  });

  it("starts a fresh clip selection when a non-clip selection is active", () => {
    const track: Selection = { clipIds: new Set(["x"]), primary: null, kind: "track" };
    expect(ids(clickSelection(track, "a", "shift"))).toEqual(["a"]);
  });
});

describe("selectClips / addToSelection", () => {
  it("builds a clip selection with a primary, or nothing", () => {
    expect(selectClips([])).toBe(EMPTY_SELECTION);
    expect(selectClips(["a", "b"])).toMatchObject({ primary: "a", kind: "clips" });
    expect(selectClips(["a", "b"], "b").primary).toBe("b");
    expect(selectClips(["a", "b"], "z").primary).toBe("a");
  });

  it("adds to a clip selection keeping its primary, and starts one otherwise", () => {
    const added = addToSelection(selectClips(["a"]), ["b", "a", "c"]);
    expect(ids(added)).toEqual(["a", "b", "c"]);
    expect(added.primary).toBe("a");
    const fresh = addToSelection(EMPTY_SELECTION, ["b", "c"]);
    expect(fresh.primary).toBe("b");
    expect(addToSelection(EMPTY_SELECTION, [])).toBe(EMPTY_SELECTION);
  });
});

describe("track selection (spec §6.7, §3.3 kind track)", () => {
  it("selects a track with a plain click, toggles with Shift or Mod, and replaces a clip selection", () => {
    let selection = trackClickSelection(selectClips(["a"]), "v1", "none");
    expect(selection).toMatchObject({ kind: "track", primary: null });
    expect(selectedTrackIds(selection)).toEqual(["v1"]);
    selection = trackClickSelection(selection, "a1", "toggle");
    expect(selectedTrackIds(selection)).toEqual(["v1", "a1"]);
    selection = trackClickSelection(selection, "v1", "toggle");
    expect(selectedTrackIds(selection)).toEqual(["a1"]);
    expect(trackClickSelection(selection, "a1", "toggle")).toBe(EMPTY_SELECTION);
    expect(selectedTrackIds(trackClickSelection(selectClips(["a"]), "v2", "toggle"))).toEqual(["v2"]);
    expect(selectedTrackIds(selectClips(["a"]))).toEqual([]);
    expect(selectTracks([])).toBe(EMPTY_SELECTION);
  });

  it("compares, snapshots and filters track ids", () => {
    const a = selectTracks(["v1", "a1"]);
    expect(selectionEquals(a, selectTracks(["a1", "v1"]))).toBe(true);
    expect(selectionEquals(a, selectTracks(["v1"]))).toBe(false);
    expect(selectionEquals(a, EMPTY_SELECTION)).toBe(false);
    expect(toSnapshot(a)).toEqual({ clipIds: [], primary: null, kind: "track", trackIds: ["v1", "a1"] });
    expect(selectionEquals(fromSnapshot(toSnapshot(a)), a)).toBe(true);
    expect(toSnapshot(selectClips(["x"]))).toEqual({ clipIds: ["x"], primary: "x", kind: "clips" });
    const snapshot = toSnapshot(a);
    expect(filterSelection(snapshot, () => true, () => true)).toBe(snapshot);
    expect(filterSelection(snapshot, () => true, (id) => id === "a1")).toEqual({ clipIds: [], primary: null, kind: "track", trackIds: ["a1"] });
    expect(filterSelection(snapshot, () => true, () => false)).toEqual({ clipIds: [], primary: null, kind: "none" });
  });
});
