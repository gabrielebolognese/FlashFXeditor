import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, selectClips } from "../../core/store/selection.js";
import { cueClickSelection } from "./cueSelection.js";

const ORDER = ["a", "b", "c", "d", "e"];
const ids = (selection: ReturnType<typeof cueClickSelection>) => (selection.kind === "clips" ? [...selection.clipIds].sort() : []);

describe("cue list multi-selection (spec §20.3)", () => {
  it("Ctrl click toggles a cue, keeping the others", () => {
    const one = cueClickSelection(selectClips(["b"]), "d", "toggle", ORDER);
    expect(ids(one)).toEqual(["b", "d"]);
    expect(one.primary).toBe("d");
    const back = cueClickSelection(one, "b", "toggle", ORDER);
    expect(ids(back)).toEqual(["d"]);
    expect(cueClickSelection(back, "d", "toggle", ORDER)).toEqual(EMPTY_SELECTION);
  });

  it("Shift click selects the range from the anchor, which stays the primary", () => {
    const range = cueClickSelection(selectClips(["b"]), "d", "range", ORDER);
    expect(ids(range)).toEqual(["b", "c", "d"]);
    expect(range.primary).toBe("b");
    const back = cueClickSelection(range, "a", "range", ORDER);
    expect(ids(back)).toEqual(["a", "b"]);
    expect(back.primary).toBe("b");
  });

  it("starts a range at the clicked cue without an anchor, and drops clips that are not listed cues", () => {
    expect(ids(cueClickSelection(EMPTY_SELECTION, "c", "range", ORDER))).toEqual(["c"]);
    const mixed = cueClickSelection(selectClips(["title", "a"], "title"), "c", "range", ORDER);
    expect(ids(mixed)).toEqual(["a", "b", "c"]);
    expect(ids(cueClickSelection(selectClips(["title"]), "e", "toggle", ORDER))).toEqual(["e"]);
  });
});
