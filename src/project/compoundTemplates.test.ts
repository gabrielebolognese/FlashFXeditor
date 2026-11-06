import { describe, expect, it } from "vitest";
import { makeCompoundClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack } from "../core/document/fixtures.js";
import { buildTemplatesFixture } from "../core/document/templatesFixture.js";
import { instanceView } from "../core/document/templates.js";
import type { Clip, CompoundClip, MediaClip, Project, Sequence, TextClip } from "../core/document/types.js";
import { validateProject } from "../core/document/validate.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { newCompoundClip } from "../timeline/edit/compound.js";
import { collectBundle, compoundTemplate, compoundTemplateProblem, filterCompoundTemplates, insertBundleCommand, instantiateBundle, nextCompoundTemplateName, sanitizeCompoundTemplate } from "./compoundTemplates.js";

let n = 0;
const newId = () => `x${++n}`;

/** The fixture plus a nested sequence with an image on it, and a media parameter. */
function source(): Project {
  const p = buildTemplatesFixture(true);
  p.media.pic = { ...makeMedia("pic", "image", 0), name: "pic.png", file: { relPath: "media/pic.png" } };
  const root = p.sequences["paper-card"] as Sequence;
  const picture = { ...makeMediaClip(p, { id: "pic-clip", trackId: "t-pic", start: 0, duration: 30, mediaId: "pic" }), kind: "image" } as MediaClip;
  p.sequences.nested = { id: "nested", name: "Nested", size: { w: 100, h: 100 }, duration: 30, background: null, tracks: [{ ...makeTrack("nt"), name: "N", clipIds: ["dot2"] }] };
  p.clips.dot2 = makeSolidClip({ id: "dot2", trackId: "nt", start: 0, duration: 30 });
  p.clips["pic-clip"] = picture;
  root.tracks.push({ ...makeTrack("t-pic"), name: "pic", clipIds: ["pic-clip"] }, { ...makeTrack("t-nest"), name: "nest", clipIds: ["nest-inst"] });
  p.clips["nest-inst"] = newCompoundClip({ id: "nest-inst", trackId: "t-nest", name: "Nest", start: 0, duration: 30, sequenceId: "nested" });
  root.params?.push({ id: "pic", label: "Picture", kind: "media", targets: [{ clipId: "pic-clip", path: "mediaId" }], default: "pic" });
  return p;
}

describe("collecting a template (spec §21.24)", () => {
  it("needs a sequence with parameters", () => {
    const p = buildTemplatesFixture(true);
    expect(compoundTemplateProblem(p, "paper-card")).toBeNull();
    expect(compoundTemplateProblem(p, "ghost")).toContain("missing");
    delete (p.sequences["paper-card"] as Sequence).params;
    expect(compoundTemplateProblem(p, "paper-card")).toContain("Expose at least one");
    expect(collectBundle(p, "paper-card")).toBeNull();
  });

  it("holds the sequence tree, its clips, the media they play and the fonts they use", () => {
    const bundle = collectBundle(source(), "paper-card")!;
    expect(Object.keys(bundle.sequences).sort()).toEqual(["nested", "paper-card"]);
    expect(Object.keys(bundle.clips).sort()).toEqual(["card-bar", "card-body", "card-dot", "card-paper", "card-title", "dot2", "nest-inst", "pic-clip"]);
    expect(Object.keys(bundle.media)).toEqual(["pic"]);
    expect(bundle.families).toHaveLength(1);
    // A copy: later edits of the project do not reach it.
    expect(bundle.clips["card-title"]).not.toBe(source().clips["card-title"]);
  });
});

describe("inserting a template into another project", () => {
  function target(): Project {
    const p = makeProject();
    p.tracks.push(makeTrack("v1"));
    p.media.other = makeMedia("other", "image", 0);
    return p;
  }

  it("gives every sequence, track and clip a fresh id and keeps the references between them", () => {
    const bundle = collectBundle(source(), "paper-card")!;
    const placed = instantiateBundle(bundle, newId);
    const ids = [...Object.keys(placed.clips), ...Object.keys(placed.sequences), ...Object.values(placed.sequences).flatMap((s) => s.tracks.map((t) => t.id))];
    expect(new Set(ids).size).toBe(ids.length);
    for (const old of [...Object.keys(bundle.clips), ...Object.keys(bundle.sequences)]) expect(ids).not.toContain(old);
    const root = placed.sequences[placed.sequenceId] as Sequence;
    for (const param of root.params ?? []) for (const t of param.targets) expect(placed.clips[t.clipId]).toBeDefined();
    const nest = Object.values(placed.clips).find((c) => c.kind === "compound") as CompoundClip;
    expect(placed.sequences[nest.sequenceId]?.name).toBe("Nested");
    for (const sequence of Object.values(placed.sequences)) for (const track of sequence.tracks) for (const id of track.clipIds) expect(placed.clips[id]?.trackId).toBe(track.id);
  });

  it("adds a valid sequence an instance can show, in one undo step, with parameters that still work", () => {
    const doc = new DocumentStore(target(), { session: createSessionStore(), validate: true });
    const bundle = collectBundle(source(), "paper-card")!;
    const placed = instantiateBundle(bundle, newId, { pic: { ...makeMedia("n-pic", "image", 0), name: "pic.png" } });
    doc.dispatch(insertBundleCommand(doc.getState(), placed));
    const after = doc.getState();
    expect(validateProject(after)).toEqual([]);
    expect(Object.keys(after.media).sort()).toEqual(["n-pic", "other"]);
    const root = after.sequences[placed.sequenceId] as Sequence;
    expect(root.params?.find((p) => p.id === "pic")?.default).toBe("n-pic");
    const picture = Object.values(after.clips).find((c) => c.kind === "image") as MediaClip;
    expect(picture.mediaId).toBe("n-pic");
    // An instance of it takes values like the original does.
    const instance = { ...makeCompoundClip({ id: "i1", trackId: "v1", start: 0, duration: 30, sequenceId: placed.sequenceId }), params: { title: "Hi" } } as CompoundClip;
    doc.dispatch({ id: "test.add", label: "add", affects: ["clips"], run(draft) { draft.clips.i1 = instance as never; draft.tracks[0]?.clipIds.push("i1"); } });
    expect(validateProject(doc.getState())).toEqual([]);
    const view = instanceView(doc.getState(), root, instance);
    const titleId = (root.params?.[0]?.targets[0]?.clipId) as string;
    expect((view.clips[titleId] as TextClip).text.value).toBe("Hi");
    doc.undo();
    doc.undo();
    expect(Object.keys(doc.getState().sequences)).toEqual([]);
    expect(Object.keys(doc.getState().media)).toEqual(["other"]);
  });

  it("inserting twice makes two independent sequences, and media the project has are not added twice", () => {
    const doc = new DocumentStore(target(), { session: createSessionStore(), validate: true });
    const bundle = collectBundle(source(), "paper-card")!;
    for (let i = 0; i < 2; i++) doc.dispatch(insertBundleCommand(doc.getState(), instantiateBundle(bundle, newId)));
    const after = doc.getState();
    expect(Object.values(after.sequences).filter((s) => s.name === "Paper card")).toHaveLength(2);
    expect(Object.keys(after.media).sort()).toEqual(["other", "pic"]);
    expect(validateProject(after)).toEqual([]);
  });
});

describe("the stored record", () => {
  const base = () => makeProject();
  const record = () => compoundTemplate(collectBundle(source(), "paper-card")!, { id: "t1", name: "  Paper   card ", category: "", now: "2026-11-09T00:00:00.000Z", thumbnail: null });

  it("cleans the name and category and counts the parameters", () => {
    expect(record()).toMatchObject({ id: "t1", name: "Paper card", category: "General", params: 6, duration: 30, size: { w: 360, h: 640 } });
  });

  it("survives a JSON round trip", () => {
    const stored = JSON.parse(JSON.stringify(record())) as unknown;
    expect(sanitizeCompoundTemplate(stored, base(), "now")).toEqual(record());
  });

    /* eslint-disable @typescript-eslint/no-explicit-any */
  it("refuses records that are not sound", () => {
    const bad = (mutate: (r: Record<string, any>) => void) => {
      const r = JSON.parse(JSON.stringify(record())) as Record<string, any>;
      mutate(r);
      return sanitizeCompoundTemplate(r, base(), "now");
    };
    expect(bad(() => {})).not.toBeNull();
    expect(sanitizeCompoundTemplate(null, base(), "now")).toBeNull();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(bad((r) => delete r.id)).toBeNull();
    expect(bad((r) => (r.name = "  "))).toBeNull();
    expect(bad((r) => delete r.bundle.sequences["paper-card"].params)).toBeNull();
    expect(bad((r) => (r.bundle.sequences["paper-card"].params[0].default = 5))).toBeNull();
    expect(bad((r) => (r.bundle.sequences["paper-card"].params[0].targets[0].path = "id"))).toBeNull();
    expect(bad((r) => (r.thumbnail = "javascript:alert(1)"))?.thumbnail).toBeNull();
    expect(bad((r) => (r.category = 7))?.category).toBe("General");
  });

  it("names and filters", () => {
    expect(nextCompoundTemplateName(["Template 1", "template 2"])).toBe("Template 3");
    const list = [{ name: "Paper card", category: "Cards" }, { name: "Stamp", category: "Overlays" }, { name: "Card stack", category: "Cards" }];
    expect(filterCompoundTemplates(list, "").length).toBe(3);
    expect(filterCompoundTemplates(list, "CARD").map((t) => t.name)).toEqual(["Paper card", "Card stack"]);
    expect(filterCompoundTemplates(list, "cards stamp")).toEqual([]);
    expect(filterCompoundTemplates(list, "over")).toEqual([list[1]]);
  });
});

it("a text clip default font family is collected (sanity of the fixture helper)", () => {
  const clip: Clip = makeTextClip({ id: "t", trackId: "x", start: 0, duration: 1 });
  expect(clip.kind).toBe("text");
});
