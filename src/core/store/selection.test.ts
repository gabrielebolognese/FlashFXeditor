import { describe, expect, it } from "vitest";
import { clickClipSelection, EMPTY_SELECTION, type Selection } from "./selection.js";

const ids = (selection: Selection) => [...selection.clipIds];

describe("clickClipSelection", () => {
  it("selects only the clicked clip on a plain click", () => {
    const one = clickClipSelection(EMPTY_SELECTION, "a", false);
    expect(one).toMatchObject({ primary: "a", kind: "clips" });
    expect(ids(one)).toEqual(["a"]);
    const two = clickClipSelection(clickClipSelection(one, "b", true), "c", false);
    expect(ids(two)).toEqual(["c"]);
    expect(two.primary).toBe("c");
  });

  it("toggles with Shift: an added clip becomes the primary, removing the primary passes it on", () => {
    let selection = clickClipSelection(EMPTY_SELECTION, "a", true);
    selection = clickClipSelection(selection, "b", true);
    selection = clickClipSelection(selection, "c", true);
    expect(ids(selection)).toEqual(["a", "b", "c"]);
    expect(selection.primary).toBe("c");
    selection = clickClipSelection(selection, "b", true);
    expect(ids(selection)).toEqual(["a", "c"]);
    expect(selection.primary).toBe("c");
    selection = clickClipSelection(selection, "c", true);
    expect(selection.primary).toBe("a");
    expect(clickClipSelection(selection, "a", true)).toBe(EMPTY_SELECTION);
  });

  it("starts a fresh clip selection when a non-clip selection is active", () => {
    const track: Selection = { clipIds: new Set(["x"]), primary: null, kind: "track" };
    expect(ids(clickClipSelection(track, "a", true))).toEqual(["a"]);
  });
});
