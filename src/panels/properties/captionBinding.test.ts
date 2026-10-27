import { describe, expect, it } from "vitest";
import { addCaptionTrack, makeProject, makeTrack } from "../../core/document/fixtures.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { CAPTION_MAX_LINES, CAPTION_Y, captionBinding, captionTextProp } from "./captionBinding.js";
import { FONT_SIZE, BOX_WIDTH } from "./textProps.js";

function setup() {
  let time = 0;
  const p = makeProject();
  p.tracks.push(makeTrack("v1"));
  const document = new DocumentStore(addCaptionTrack(p), { session: createSessionStore(), validate: true, now: () => time });
  const live = createStore<LiveEdit>(NO_LIVE_EDIT);
  return {
    document,
    live,
    deps: { document, live },
    advance: (ms: number) => {
      time += ms;
    },
    style: () => document.getState().captionTracks.cc!.style,
  };
}

describe("caption style bindings (spec §11 Caption style, P2)", () => {
  it("sets a typed value in one undo step, clamped and rounded", () => {
    const { deps, document, style } = setup();
    const lines = captionBinding(deps, CAPTION_MAX_LINES, "cc");
    expect(lines.read()).toBe(2);
    lines.set(3.4);
    expect(style().maxLines).toBe(3);
    expect(document.history.getState().undoLabel).toBe("Change caption lines");
    lines.set(99);
    expect(style().maxLines).toBe(CAPTION_MAX_LINES.max);
  });

  it("edits the text style through the Text section's properties", () => {
    const { deps, style } = setup();
    const size = captionBinding(deps, captionTextProp(FONT_SIZE), "cc");
    expect(size.read()).toBe(64);
    size.set(80);
    expect(style().text.fontSize).toBe(80);
    expect(() => captionTextProp(BOX_WIDTH)).toThrow(/not a style property/);
  });

  it("coalesces arrow steps, scrubs live with no document change, commits once on release", () => {
    const { deps, document, live, advance, style } = setup();
    const y = captionBinding(deps, CAPTION_Y, "cc");
    y.change(1, "step");
    advance(100);
    y.change(1, "step");
    expect(style().y).toBe(2);
    // One undo step for both.
    document.undo();
    expect(style().y).toBe(0);
    document.redo();
    const before = document.getState();
    y.change(-50, "scrub");
    expect(document.getState()).toBe(before);
    expect(live.getState().captionStyles?.get("cc")?.y).toBe(-48);
    expect(y.read()).toBe(-48);
    y.change(-40, "commit");
    expect(style().y).toBe(-38);
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    y.change(10, "scrub");
    y.change(0, "cancel");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(style().y).toBe(-38);
  });
});
