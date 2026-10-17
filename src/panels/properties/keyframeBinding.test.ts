import { describe, expect, it } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Keyframes, Project } from "../../core/document/types.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { setKeysEase } from "../../timeline/edit/keyframes.js";
import { bindEaseLabel, bindKeyButton, keyableIds, keyStateAt, type KeyBindingDeps } from "./keyframeBinding.js";

const keyed = (frames: number[], ease: "linear" | "hold" = "linear"): Keyframes => ({ opacity: frames.map((frame) => ({ frame, value: 1, ease })) });

function project(): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"));
  return withClips(p, [
    { ...makeSolidClip({ id: "a", trackId: "v1", start: 0, duration: 100 }), keyframes: keyed([0, 30]) },
    { ...makeSolidClip({ id: "b", trackId: "v2", start: 10, duration: 100 }), keyframes: keyed([20], "hold") },
    makeSolidClip({ id: "c", trackId: "v3", start: 0, duration: 100 }),
  ]);
}

describe("keyStateAt", () => {
  it("is on a key when every animated clip has one at the playhead; the ease they share", () => {
    const p = project();
    expect(keyStateAt(p, ["a"], "opacity", 30)).toEqual({ onKey: true, ease: "linear", mixed: false });
    expect(keyStateAt(p, ["a"], "opacity", 31).onKey).toBe(false);
    // b's key at its frame 20 is timeline frame 30; unanimated c does not count.
    expect(keyStateAt(p, ["a", "b", "c"], "opacity", 30)).toEqual({ onKey: true, ease: null, mixed: true });
    expect(keyStateAt(p, ["a", "b"], "opacity", 0).onKey).toBe(false);
    expect(keyStateAt(p, ["c"], "opacity", 0).onKey).toBe(false);
    expect(keyableIds(p, ["a", "missing", "c"], "volume")).toEqual([]);
    expect(keyableIds(p, ["a", "missing", "c"], "transform")).toEqual(["a", "c"]);
  });
});

describe("DOM bindings", () => {
  it("write the add / remove state and the Ease text as the playhead and the document change", () => {
    const doc = new DocumentStore(project(), { session: createSessionStore(), validate: true });
    const playhead = createStore(0);
    const deps: KeyBindingDeps = { document: doc, playhead: { get: () => playhead.getState(), subscribe: (listener) => playhead.subscribe(() => listener()) } };
    const button = document.createElement("button");
    const text = document.createElement("span");
    const stops = [bindKeyButton(button, deps, ["a"], "opacity"), bindEaseLabel(text, deps, ["a"], "opacity")];
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Remove keyframe");
    expect(text.textContent).toBe("Linear");
    playhead.set(12);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("data-tooltip")).toBe("Add keyframe");
    expect(text.textContent).toBe("--");
    expect(text.dataset.dim).toBe("true");
    playhead.set(30);
    doc.dispatch(setKeysEase(doc.getState(), new Map([["a", [30]]]), "opacity", "hold")!);
    expect(text.textContent).toBe("Hold");
    for (const stop of stops) stop();
    playhead.set(12);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });
});
