import { describe, expect, it, vi } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, SolidClip } from "../../core/document/types.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { solidBinding } from "./solidBinding.js";
import { SOLID_HEIGHT, SOLID_RADIUS, SOLID_WIDTH } from "./solidProps.js";

function project(): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"), makeTrack("v2"));
  const a = { ...makeSolidClip({ id: "a", trackId: "v1", start: 0, duration: 30 }), shape: "roundedRect" as const, cornerRadius: 10 };
  const b = { ...makeSolidClip({ id: "b", trackId: "v2", start: 0, duration: 30 }), size: { w: 300, h: 100 } };
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
    clip: (id: string) => document.getState().clips[id] as SolidClip,
  };
}

describe("solid bindings (spec §11 Solid section, P2, Batch 34)", () => {
  it("shows -- for different widths; a typed width applies to both in one undo step", () => {
    const { deps, document, clip } = setup();
    const width = solidBinding(deps, SOLID_WIDTH, ["a", "b"]);
    expect(width.read()).toBeNull();
    expect(solidBinding(deps, SOLID_HEIGHT, ["a", "b"]).read()).toBe(100);
    width.set(640.4);
    expect([clip("a").size, clip("b").size]).toEqual([
      { w: 640, h: 100 },
      { w: 640, h: 100 },
    ]);
    expect(document.history.getState().undoLabel).toBe("Change size");
    document.undo();
    expect(clip("b").size).toEqual({ w: 300, h: 100 });
  });

  it("scrubs the radius live (the document is untouched), then one command on release; Esc drops it", () => {
    const { deps, document, live, clip } = setup();
    const radius = solidBinding(deps, SOLID_RADIUS, ["a"]);
    const changed = vi.fn();
    document.subscribe(changed);
    radius.change(5, "scrub");
    radius.change(20, "scrub");
    expect(live.getState().solids?.get("a")).toMatchObject({ shape: "roundedRect", cornerRadius: 30, size: { w: 100, h: 100 } });
    expect(radius.read()).toBe(30);
    expect(changed).not.toHaveBeenCalled();
    radius.change(20, "commit");
    expect(clip("a").cornerRadius).toBe(30);
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(document.history.getState().undoLabel).toBe("Change corner radius");
    radius.change(40, "scrub");
    radius.change(40, "cancel");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(clip("a").cornerRadius).toBe(30);
  });

  it("coalesces arrow steps into one undo step and clamps at the limits", () => {
    const { deps, document, clip, advance } = setup();
    const height = solidBinding(deps, SOLID_HEIGHT, ["a"]);
    height.change(1, "step");
    advance(100);
    height.change(1, "step");
    expect(clip("a").size.h).toBe(102);
    document.undo();
    expect(clip("a").size.h).toBe(100);
    height.set(-50);
    expect(clip("a").size.h).toBe(1);
  });
});
