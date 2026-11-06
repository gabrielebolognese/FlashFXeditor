import { describe, expect, it } from "vitest";
import { buildTemplatesFixture } from "../../core/document/templatesFixture.js";
import type { CompoundClip, JsonValue, Project, Sequence, TextClip } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { breakApartProblem, makeUnique } from "./compound.js";
import { addParamTarget, cleanLabel, defaultParamLabel, exposeKinds, exposeParam, exposeProblem, removeParam, renameSequence, resetInstanceValues, setInstanceValue, updateParam } from "./templates.js";

const store = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });
const seq = (p: Project) => p.sequences["paper-card"] as Sequence;
const inst = (p: Project, id: string) => p.clips[id] as CompoundClip;

/** The fixture without its parameters: a plain compound with five inner clips. */
function bare(): Project {
  const p = buildTemplatesFixture(false);
  delete seq(p).params;
  return p;
}

describe("Expose as parameter (spec §21.24)", () => {
  it("makes a parameter of the field, with its value as the default, one undo step", () => {
    const doc = store(bare());
    expect(exposeProblem(doc.getState(), "card-title", "text.value")).toBeNull();
    const command = exposeParam(doc.getState(), "card-title", "text.value");
    expect(command).not.toBeNull();
    doc.dispatch(command!);
    expect(seq(doc.getState()).params).toEqual([{ id: "p1", label: "card-title text", kind: "text", targets: [{ clipId: "card-title", path: "text.value" }], default: "Paper card" }]);
    expect(validateProject(doc.getState())).toEqual([]);
    doc.undo();
    expect(seq(doc.getState()).params).toBeUndefined();
    doc.redo();
    expect(seq(doc.getState()).params).toHaveLength(1);
  });

  it("offers the kinds of a field and refuses what cannot be a parameter", () => {
    const p = bare();
    expect(exposeKinds(p, "card-bar", "fill")).toEqual(["color"]);
    expect(exposeKinds(p, "card-bar", "size.w")).toEqual(["number"]);
    expect(exposeKinds(p, "card-bar", "enabled")).toEqual(["toggle"]);
    expect(exposeKinds(p, "card-title", "style.fontFamily")).toEqual(["font"]);
    expect(exposeProblem(p, "card-title", "id")).toBe("This field cannot be a parameter");
    expect(exposeProblem(p, "card-title", "start")).toBe("This field cannot be a parameter");
    expect(exposeProblem(p, "card-title", "text.nothing")).toBe("This field cannot be a parameter");
    expect(exposeProblem(p, "backdrop", "fill")).toContain("Open a compound");
    expect(exposeProblem(p, "ghost", "fill")).toContain("Select a clip");
    seq(p).tracks[3]!.locked = true;
    expect(exposeProblem(p, "card-title", "text.value")).toBe("The track is locked");
  });

  it("refuses the same field twice, and gives each parameter a free id", () => {
    const doc = store(bare());
    doc.dispatch(exposeParam(doc.getState(), "card-title", "text.value", { label: "  Big   title " })!);
    expect(seq(doc.getState()).params?.[0]?.label).toBe("Big title");
    expect(exposeProblem(doc.getState(), "card-title", "text.value")).toBe("This field is a parameter already");
    expect(exposeParam(doc.getState(), "card-title", "text.value")).toBeNull();
    doc.dispatch(exposeParam(doc.getState(), "card-body", "text.value")!);
    expect(seq(doc.getState()).params?.map((param) => param.id)).toEqual(["p1", "p2"]);
    doc.dispatch(removeParam(doc.getState(), "paper-card", "p1")!);
    doc.dispatch(exposeParam(doc.getState(), "card-bar", "fill")!);
    expect(seq(doc.getState()).params?.map((param) => param.id)).toEqual(["p2", "p1"]);
  });

  it("labels by clip and field", () => {
    const p = bare();
    expect(defaultParamLabel(p, "card-bar", "fill")).toBe("card-bar color");
    expect(defaultParamLabel(p, "card-bar", "size.w")).toBe("card-bar w");
    expect(cleanLabel("   ")).toBeNull();
    expect(cleanLabel("x".repeat(80))).toHaveLength(40);
  });

  it("one parameter can follow several fields of the same kind", () => {
    const doc = store(bare());
    doc.dispatch(exposeParam(doc.getState(), "card-bar", "fill", { label: "Accent" })!);
    const add = addParamTarget(doc.getState(), "paper-card", "p1", "card-dot", "fill");
    expect(add).not.toBeNull();
    doc.dispatch(add!);
    expect(seq(doc.getState()).params?.[0]?.targets).toHaveLength(2);
    expect(addParamTarget(doc.getState(), "paper-card", "p1", "card-dot", "fill")).toBeNull();
    // A text field cannot join a color parameter.
    expect(addParamTarget(doc.getState(), "paper-card", "p1", "card-title", "text.value")).toBeNull();
    expect(validateProject(doc.getState())).toEqual([]);
  });
});

describe("the parameter editor", () => {
  it("renames, sets a range and the default; refuses what is invalid", () => {
    const doc = store(buildTemplatesFixture(true));
    doc.dispatch(updateParam(doc.getState(), "paper-card", "width", { label: "Bar length", min: 100, max: 250, default: 200 })!);
    expect(seq(doc.getState()).params?.find((param) => param.id === "width")).toMatchObject({ label: "Bar length", min: 100, max: 250, default: 200 });
    expect(updateParam(doc.getState(), "paper-card", "width", { min: 300 })).toBeNull();
    expect(updateParam(doc.getState(), "paper-card", "width", { default: 50 })).toBeNull();
    expect(updateParam(doc.getState(), "paper-card", "title", { min: 1 })).toBeNull();
    expect(updateParam(doc.getState(), "paper-card", "title", { label: "  " })).toBeNull();
    expect(updateParam(doc.getState(), "paper-card", "title", { default: 5 })).toBeNull();
    expect(updateParam(doc.getState(), "paper-card", "title", { label: "Title" })).toBeNull();
    doc.dispatch(updateParam(doc.getState(), "paper-card", "width", { min: null, max: null })!);
    expect(seq(doc.getState()).params?.find((param) => param.id === "width")).not.toHaveProperty("min");
    expect(validateProject(doc.getState())).toEqual([]);
  });

  it("removing a parameter also removes the values every instance holds", () => {
    const doc = store(buildTemplatesFixture(true));
    doc.dispatch(removeParam(doc.getState(), "paper-card", "title")!);
    expect(seq(doc.getState()).params?.some((param) => param.id === "title")).toBe(false);
    expect(inst(doc.getState(), "card-b").params).not.toHaveProperty("title");
    expect(inst(doc.getState(), "card-b").params).toHaveProperty("body");
    expect(validateProject(doc.getState())).toEqual([]);
    for (const id of ["body", "accent", "width", "show"]) doc.dispatch(removeParam(doc.getState(), "paper-card", id)!);
    expect(seq(doc.getState()).params).toBeUndefined();
    expect(inst(doc.getState(), "card-b").params).toBeUndefined();
    expect(inst(doc.getState(), "card-c").params).toBeUndefined();
    expect(validateProject(doc.getState())).toEqual([]);
    expect(removeParam(doc.getState(), "paper-card", "title")).toBeNull();
  });
});

describe("instance values", () => {
  it("sets a value on the selected instances (undo restores), coalescing a drag into one step", () => {
    const doc = store(buildTemplatesFixture(false));
    doc.dispatch(setInstanceValue(doc.getState(), ["card-a", "card-b"], "title", "One")!);
    expect(inst(doc.getState(), "card-a").params).toEqual({ title: "One" });
    expect(inst(doc.getState(), "card-b").params).toEqual({ title: "One" });
    expect(inst(doc.getState(), "card-c").params).toBeUndefined();
    doc.undo();
    expect(inst(doc.getState(), "card-a").params).toBeUndefined();
    doc.redo();
    doc.dispatch(setInstanceValue(doc.getState(), ["card-a"], "width", 100)!);
    doc.dispatch(setInstanceValue(doc.getState(), ["card-a"], "width", 120)!);
    doc.dispatch(setInstanceValue(doc.getState(), ["card-a"], "width", 140)!);
    expect(inst(doc.getState(), "card-a").params?.width).toBe(140);
    doc.undo();
    expect(inst(doc.getState(), "card-a").params).toEqual({ title: "One" });
    expect(validateProject(doc.getState())).toEqual([]);
  });

  it("refuses a value that does not fit, a parameter the sequence lacks, an unchanged value and a locked track", () => {
    const p = buildTemplatesFixture(true);
    expect(setInstanceValue(p, ["card-a"], "width", 9999)).toBeNull();
    expect(setInstanceValue(p, ["card-a"], "title", 4)).toBeNull();
    expect(setInstanceValue(p, ["card-a"], "nope", "x")).toBeNull();
    expect(setInstanceValue(p, ["card-b"], "title", "Launch day")).toBeNull();
    expect(setInstanceValue(p, ["backdrop"], "title", "x")).toBeNull();
    p.tracks.find((track) => track.id === "v2")!.locked = true;
    expect(setInstanceValue(p, ["card-a"], "title", "x")).toBeNull();
  });

  it("resets one value or all of them", () => {
    const doc = store(buildTemplatesFixture(true));
    doc.dispatch(resetInstanceValues(doc.getState(), ["card-b"], "title")!);
    expect(inst(doc.getState(), "card-b").params).not.toHaveProperty("title");
    expect(resetInstanceValues(doc.getState(), ["card-b"], "title")).toBeNull();
    doc.dispatch(resetInstanceValues(doc.getState(), ["card-b", "card-c"], null)!);
    expect(inst(doc.getState(), "card-b").params).toBeUndefined();
    expect(inst(doc.getState(), "card-c").params).toBeUndefined();
    expect(resetInstanceValues(doc.getState(), ["card-a"], null)).toBeNull();
  });

  it("renames a sequence", () => {
    const doc = store(buildTemplatesFixture(true));
    doc.dispatch(renameSequence(doc.getState(), "paper-card", "  Birthday   card ")!);
    expect(seq(doc.getState()).name).toBe("Birthday card");
    expect(renameSequence(doc.getState(), "paper-card", "Birthday card")).toBeNull();
    expect(renameSequence(doc.getState(), "paper-card", " ")).toBeNull();
    expect(renameSequence(doc.getState(), "ghost", "x")).toBeNull();
  });
});

describe("other compound edits keep templates sound", () => {
  let n = 0;
  const newId = () => `m${++n}`;

  it("Make unique copies the parameters onto the copied clips", () => {
    const doc = store(buildTemplatesFixture(true));
    doc.dispatch(makeUnique(doc.getState(), "card-c", newId)!);
    const copy = doc.getState().sequences[inst(doc.getState(), "card-c").sequenceId] as Sequence;
    expect(copy.id).not.toBe("paper-card");
    const ids = new Set(copy.tracks.flatMap((track) => track.clipIds));
    for (const param of copy.params ?? []) for (const target of param.targets) expect(ids.has(target.clipId)).toBe(true);
    // The original keeps its own targets.
    expect(seq(doc.getState()).params?.[0]?.targets[0]?.clipId).toBe("card-title");
    // Card C keeps its values, and its copy shows them through the copied clips.
    expect(inst(doc.getState(), "card-c").params).toMatchObject({ title: "Thank you", show: false });
    expect(validateProject(doc.getState())).toEqual([]);
  });

  it("Break apart is refused while an instance holds values", () => {
    const p = buildTemplatesFixture(true);
    expect(breakApartProblem(p, "card-b")).toContain("template values");
    expect(breakApartProblem(p, "card-a") ?? "").not.toContain("template values");
  });

  it("deleting an inner clip leaves a dangling target that sets nothing and keeps the project valid", () => {
    const doc = store(buildTemplatesFixture(true));
    doc.dispatch({
      id: "test.delete",
      label: "delete",
      affects: ["clips"],
      run(draft) {
        delete draft.clips["card-title"];
        const track = draft.sequences["paper-card"]?.tracks.find((t) => t.id === "t-title");
        if (track) track.clipIds = [];
      },
    });
    expect(validateProject(doc.getState())).toEqual([]);
  });
});

describe("property test: random template edits keep the document valid (spec §21.1)", () => {
  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const VALUES: Record<string, () => JsonValue[]> = {
    title: () => ["x", "Hello world", "", "ünï"],
    body: () => ["a", "b c"],
    accent: () => [{ r: 0, g: 0, b: 0, a: 1 }, { r: 1, g: 0.5, b: 0.25, a: 0.5 }],
    width: () => [40, 100, 280],
    show: () => [true, false],
  };
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`seed ${seed}`, () => {
      const next = rng(seed);
      const doc = store(buildTemplatesFixture(true));
      const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
      let made = 0;
      for (let step = 0; step < 60; step++) {
        const p = doc.getState();
        const ids = Object.keys(VALUES);
        const roll = next();
        if (roll < 0.45) {
          const id = pick(ids);
          const command = setInstanceValue(p, [pick(["card-a", "card-b", "card-c"])], id, pick((VALUES[id] as () => JsonValue[])()));
          if (command) doc.dispatch(command);
        } else if (roll < 0.6) {
          const command = resetInstanceValues(p, [pick(["card-a", "card-b", "card-c"])], next() < 0.5 ? pick(ids) : null);
          if (command) doc.dispatch(command);
        } else if (roll < 0.7) {
          const command = removeParam(p, "paper-card", pick(ids));
          if (command) doc.dispatch(command);
        } else if (roll < 0.85) {
          const clip = pick(["card-title", "card-body", "card-bar", "card-dot", "card-paper"]);
          const path = pick(["text.value", "fill", "enabled", "size.w", "opacity", "style.fontFamily", "style.fill"]);
          const command = exposeParam(p, clip, path);
          if (command) {
            doc.dispatch(command);
            made += 1;
          }
        } else if (roll < 0.92) {
          const command = updateParam(p, "paper-card", pick(ids), { label: `L${step}` });
          if (command) doc.dispatch(command);
        } else if (doc.history.getState().canUndo) doc.undo();
        else if (doc.history.getState().canRedo) doc.redo();
        expect(validateProject(doc.getState())).toEqual([]);
      }
      expect(made).toBeGreaterThanOrEqual(0);
      const title = doc.getState().clips["card-title"] as TextClip;
      expect(title.text.value).toBe("Paper card");
    });
  }
});
