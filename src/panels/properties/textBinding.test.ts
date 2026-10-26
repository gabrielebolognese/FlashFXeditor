import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextClip } from "../../core/document/types.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { approximateMeasurer, setTextMeasurer } from "../../render/text/layoutCache.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { textBinding } from "./textBinding.js";
import { BOX_WIDTH, FONT_SIZE, LINE_HEIGHT } from "./textProps.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

function project(): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"));
  const a = makeTextClip({ id: "a", trackId: "v1", start: 0, duration: 30, value: "Hello" });
  const b = { ...makeTextClip({ id: "b", trackId: "v2", start: 0, duration: 30, value: "World" }), style: { ...a.style, fontSize: 48, verticalAnchor: "bottom" as const } };
  return withClips(p, [a, b]);
}

function setup() {
  let time = 0;
  const document = new DocumentStore(project(), { session: createSessionStore(), validate: true, now: () => time });
  const live = createStore<LiveEdit>(NO_LIVE_EDIT);
  return {
    document,
    live,
    deps: { document, live },
    advance(ms: number) {
      time += ms;
    },
    clip: (id: string) => document.getState().clips[id] as TextClip,
  };
}

describe("text bindings (spec §11 Text section, P2)", () => {
  it("shows -- for different sizes; a typed size applies to both in one undo step", () => {
    const { deps, document, clip } = setup();
    const size = textBinding(deps, FONT_SIZE, ["a", "b"]);
    expect(size.read()).toBeNull();
    size.set(120);
    expect([clip("a").style.fontSize, clip("b").style.fontSize]).toEqual([120, 120]);
    expect(document.history.getState().undoLabel).toBe("Change font size");
    document.undo();
    expect([clip("a").style.fontSize, clip("b").style.fontSize]).toEqual([96, 48]);
  });

  it("scrubs live (the document is untouched, bottom-anchored boxes keep their bottom), then one command on release", () => {
    const { deps, document, live, clip } = setup();
    const size = textBinding(deps, FONT_SIZE, ["b"]);
    const changed = vi.fn();
    document.subscribe(changed);
    size.change(10, "scrub");
    size.change(52, "scrub");
    expect(live.getState().texts?.get("b")?.style.fontSize).toBe(100);
    expect(size.read()).toBe(100);
    // 48 px -> 100 px: the slot grows by 62.4 px (line height 1.2); the bottom stays, so y moves up half of it.
    expect(live.getState().transforms?.get("b")?.y).toBeCloseTo(-31.2);
    expect(changed).not.toHaveBeenCalled();
    size.change(52, "commit");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(clip("b").style.fontSize).toBe(100);
    expect(clip("b").transform.y).toBeCloseTo(-31.2);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("cancels a scrub, clamps to the limits and coalesces arrow steps", () => {
    const { deps, document, live, clip, advance } = setup();
    const height = textBinding(deps, LINE_HEIGHT, ["a"]);
    height.change(0.3, "scrub");
    height.change(0, "cancel");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(clip("a").style.lineHeight).toBe(1.2);
    height.set(99);
    expect(clip("a").style.lineHeight).toBe(4);
    height.change(-0.1, "step");
    advance(100);
    height.change(-0.1, "step");
    expect(clip("a").style.lineHeight).toBe(3.8);
    document.undo();
    expect(clip("a").style.lineHeight).toBe(4);
  });

  it("edits the box width of the content", () => {
    const { deps, clip } = setup();
    textBinding(deps, BOX_WIDTH, ["a"]).set(400);
    expect(clip("a").text.box.width).toBe(400);
    expect(clip("a").text.value).toBe("Hello");
  });
});
