import { describe, expect, it } from "vitest";
import { addToSelection, clickSelection, EMPTY_SELECTION, selectClips, type Selection } from "./selection.js";

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
