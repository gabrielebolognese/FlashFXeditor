import { describe, expect, it } from "vitest";
import { makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextClip } from "../../core/document/types.js";
import { newCounter } from "../../text/counter.js";
import { addAnimator, animatorKeyed, animatorValueAt, editTextClips, removeAnimator, setAnimatorStopwatch, setCounterField, setCounterOn, toggleAnimatorKey, writeAnimatorField } from "./animators.js";

function project(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1")];
  return withClips(p, [makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 30, value: "abcd" })]);
}

const apply = (p: Project, edit: Parameters<typeof editTextClips>[2], at = 0): Project => {
  const command = editTextClips(p, ["t"], edit, { label: "x", at });
  if (!command) return p;
  const next = structuredClone(p);
  command.run(next as never, { playhead: at } as never);
  return next;
};
const clip = (p: Project) => p.clips.t as TextClip;

describe("animator edits (Batch 68)", () => {
  it("adds, edits and removes an animator with its keys", () => {
    let p = apply(project(), (c) => void addAnimator(c));
    expect(clip(p).animators?.[0]?.id).toBe("a1");
    p = apply(p, (c, rel) => writeAnimatorField(c, "a1", "props.y", 12, rel));
    expect(clip(p).animators?.[0]?.props.y).toBe(12);
    p = apply(p, (c, rel) => setAnimatorStopwatch(c, "a1", "selector.offset", true, rel));
    expect(animatorKeyed(clip(p), "a1", "selector.offset")).toBe(true);
    p = apply(p, (c, rel) => writeAnimatorField(c, "a1", "selector.offset", 1, rel), 10);
    expect(animatorValueAt(clip(p), "a1", "selector.offset", 10)).toBe(1);
    expect(clip(p).animators?.[0]?.selector.offset).toBe(0);
    p = apply(p, (c, rel) => toggleAnimatorKey(c, "a1", "selector.offset", rel), 10);
    expect(clip(p).keyframes?.["animators.a1.selector.offset"]?.length).toBe(1);
    p = apply(p, (c) => removeAnimator(c, "a1"));
    expect(clip(p).animators).toBeUndefined();
    expect(clip(p).keyframes).toBeUndefined();
  });

  it("a counter keeps the final text in the clip", () => {
    let p = apply(project(), (c) => setCounterOn(c, true, newCounter));
    expect(clip(p).text.value).toBe("100");
    p = apply(p, (c) => setCounterField(c, { to: 85.6, decimals: 1, suffix: "%" }));
    expect(clip(p).text.value).toBe("85.6%");
    p = apply(p, (c) => setCounterOn(c, false, newCounter));
    expect(clip(p).counter).toBeUndefined();
  });

  it("an edit that changes nothing makes no command", () => {
    expect(editTextClips(project(), ["t"], () => undefined, { label: "x", at: 0 })).toBeNull();
  });
});
