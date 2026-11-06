import { describe, expect, it } from "vitest";
import { Compositor } from "../../render/compositor/Compositor.js";
import { buildTemplatesFixture } from "./templatesFixture.js";
import { getPath, instanceParamIssues, instanceView, kindsForValue, paramValue, paramValueIssue, pathSegments, templateParamIssues, withPath } from "./templates.js";
import type { CompoundClip, Project, Sequence, SolidClip, TemplateParam, TextClip } from "./types.js";
import { validateProject } from "./validate.js";

const fixture = (): Project => buildTemplatesFixture(true);
const seq = (p: Project) => p.sequences["paper-card"] as Sequence;
const inst = (p: Project, id: string) => p.clips[id] as CompoundClip;
const paramsOf = (p: Project) => seq(p).params as NonNullable<Sequence["params"]>;

describe("paths (spec §21.24)", () => {
  it("splits and refuses malformed paths", () => {
    expect(pathSegments("text.value")).toEqual(["text", "value"]);
    for (const bad of ["", "a..b", ".a", "a.", "__proto__.x", "a.constructor"]) expect(pathSegments(bad)).toBeNull();
  });
  it("reads and writes by path without touching the original", () => {
    const clip = { text: { value: "a", box: { w: 1 } }, list: [{ c: 1 }] };
    expect(getPath(clip, "text.value")).toBe("a");
    expect(getPath(clip, "list.0.c")).toBe(1);
    expect(getPath(clip, "text.nope.deeper")).toBeUndefined();
    const next = withPath(clip, "text.value", "b");
    expect(next.text.value).toBe("b");
    expect(clip.text.value).toBe("a");
    expect(next.text.box).toBe(clip.text.box);
    expect(withPath(clip, "list.0.c", 2).list[0]?.c).toBe(2);
  });
});

describe("parameter values", () => {
  it("checks a value against its kind and range", () => {
    expect(paramValueIssue({ kind: "text" }, "x")).toBeNull();
    expect(paramValueIssue({ kind: "text" }, 3)).not.toBeNull();
    expect(paramValueIssue({ kind: "color" }, { r: 0, g: 0.5, b: 1, a: 1 })).toBeNull();
    expect(paramValueIssue({ kind: "color" }, { r: 2, g: 0, b: 0, a: 1 })).not.toBeNull();
    expect(paramValueIssue({ kind: "color" }, `#${"fff"}`)).not.toBeNull();
    expect(paramValueIssue({ kind: "number", min: 1, max: 5 }, 3)).toBeNull();
    expect(paramValueIssue({ kind: "number", min: 1, max: 5 }, 6)).toContain("at most");
    expect(paramValueIssue({ kind: "number" }, Number.NaN)).not.toBeNull();
    expect(paramValueIssue({ kind: "media" }, "")).not.toBeNull();
    expect(paramValueIssue({ kind: "font" }, "Inter")).toBeNull();
    expect(paramValueIssue({ kind: "toggle" }, "yes")).not.toBeNull();
  });
  it("offers the kinds a field can be exposed as", () => {
    expect(kindsForValue("text.value", "a")).toEqual(["text"]);
    expect(kindsForValue("mediaId", "m")).toEqual(["media"]);
    expect(kindsForValue("style.fontFamily", "Inter")).toEqual(["font"]);
    expect(kindsForValue("fill", { r: 1, g: 1, b: 1, a: 1 })).toEqual(["color"]);
    expect(kindsForValue("enabled", true)).toEqual(["toggle"]);
    expect(kindsForValue("opacity", 1)).toEqual(["number"]);
    expect(kindsForValue("nope", undefined)).toEqual([]);
  });
});

describe("validation of the model (spec §21.1, §21.24)", () => {
  it("the fixture is valid", () => {
    expect(validateProject(fixture())).toEqual([]);
  });
  it("refuses duplicate ids, bad kinds, defaults of the wrong type and empty targets", () => {
    const p = fixture();
    paramsOf(p).push({ ...(paramsOf(p)[0] as TemplateParam), id: "title" }, { id: "x", label: "X", kind: "nope" as never, targets: [], default: 1 }, { id: "y", label: "Y", kind: "number", targets: [], default: "s", min: 5, max: 1 });
    const issues = validateProject(p).join("\n");
    expect(issues).toContain("id is used twice");
    expect(issues).toContain("kind nope must be one of");
    expect(issues).toContain("default must be a finite number");
    expect(issues).toContain("targets must list at least one");
    expect(issues).toContain("min 5 is above max 1");
  });
  it("refuses targets in another scope, forbidden fields and fields of the wrong type", () => {
    const p = fixture();
    paramsOf(p)[0] = { ...(paramsOf(p)[0] as TemplateParam), targets: [{ clipId: "backdrop", path: "fill" }, { clipId: "card-title", path: "id" }, { clipId: "card-title", path: "style.fontSize" }, { clipId: "card-title", path: "start" }] };
    const issues = templateParamIssues(p, seq(p), "s");
    expect(issues.some((m) => m.includes("backdrop is not in this sequence"))).toBe(true);
    expect(issues.filter((m) => m.includes("cannot be set by a parameter"))).toHaveLength(2);
    expect(issues.some((m) => m.includes('has no text field at "style.fontSize"'))).toBe(true);
  });
  it("lets a target dangle when its clip is gone (deleting a clip never rewrites the template)", () => {
    const p = fixture();
    delete p.clips["card-dot"];
    const dot = seq(p).tracks.find((t) => t.id === "t-dot");
    if (dot) dot.clipIds = [];
    expect(templateParamIssues(p, seq(p), "s")).toEqual([]);
    expect(validateProject(p)).toEqual([]);
  });
  it("checks an instance's values against its sequence", () => {
    const p = fixture();
    const clip = inst(p, "card-b");
    clip.params = { title: 5 as never, unknown: "x", width: 999 };
    const issues = instanceParamIssues(p, clip, "c");
    expect(issues).toHaveLength(3);
    expect(issues.join("\n")).toContain('"unknown", which its sequence does not define');
  });
  it("paramValue falls back to the default for a missing or wrong value", () => {
    const p = fixture();
    const param = paramsOf(p)[0] as NonNullable<Sequence["params"]>[number];
    expect(paramValue(inst(p, "card-b"), param)).toBe("Launch day");
    expect(paramValue(inst(p, "card-a"), param)).toBe("Paper card");
    expect(paramValue({ params: { title: 3 as never } }, param)).toBe("Paper card");
  });
});

describe("the view an instance is evaluated in", () => {
  it("is the sequence's own view when the instance has no values", () => {
    const p = fixture();
    const a = instanceView(p, seq(p), inst(p, "card-a"));
    expect(a.clips).toBe(p.clips);
  });
  it("writes each value over its target fields, under ids that carry the values", () => {
    const p = fixture();
    const b = instanceView(p, seq(p), inst(p, "card-b"));
    expect((b.clips["card-title"] as TextClip).text.value).toBe("Launch day");
    expect((b.clips["card-body"] as TextClip).text.value).toBe("Doors open at nine. Bring a friend.");
    expect((b.clips["card-bar"] as SolidClip).fill).toEqual({ r: 0.95, g: 0.5, b: 0.12, a: 1 });
    expect((b.clips["card-dot"] as SolidClip).fill).toEqual({ r: 0.95, g: 0.5, b: 0.12, a: 1 });
    expect((b.clips["card-bar"] as SolidClip).size).toEqual({ w: 260, h: 14 });
    expect((b.clips["card-paper"] as SolidClip).id).toBe("card-paper");
    // The document is not changed.
    expect((p.clips["card-title"] as TextClip).text.value).toBe("Paper card");
    const c = instanceView(p, seq(p), inst(p, "card-c"));
    expect(b.clips["card-title"]?.id).not.toBe(c.clips["card-title"]?.id);
    expect(b.clips["card-title"]?.id.startsWith("card-title~")).toBe(true);
    expect((c.clips["card-bar"] as SolidClip).enabled).toBe(false);
  });
  it("gives equal values equal ids (two instances share caches) and caches per values object", () => {
    const p = fixture();
    const twin = { ...inst(p, "card-b"), id: "twin", params: structuredClone(inst(p, "card-b").params) } as CompoundClip;
    const one = instanceView(p, seq(p), inst(p, "card-b"));
    expect(instanceView(p, seq(p), inst(p, "card-b"))).toBe(one);
    expect(instanceView(p, seq(p), twin).clips["card-title"]?.id).toBe(one.clips["card-title"]?.id);
  });
  it("ignores values that do not fit and targets that do not resolve (a foreign project never crashes the compositor)", () => {
    const p = fixture();
    const clip = inst(p, "card-b");
    clip.params = { title: 7 as never, accent: "red" as never, width: { x: 1 } as never, show: "no" as never };
    const view = instanceView(p, seq(p), clip);
    expect((view.clips["card-title"] as TextClip).text.value).toBe("Paper card");
    expect((view.clips["card-bar"] as SolidClip).fill).toEqual((p.clips["card-bar"] as SolidClip).fill);
    paramsOf(p)[0] = { ...(paramsOf(p)[0] as TemplateParam), targets: [{ clipId: "gone", path: "text.value" }, { clipId: "card-title", path: "text.missing.deep" }, { clipId: "card-title", path: "id" }] };
    const other = { ...inst(p, "card-b"), params: { title: "x" } } as CompoundClip;
    expect(() => instanceView(p, seq(p), other)).not.toThrow();
    expect((instanceView(p, seq(p), other).clips["card-title"] as TextClip).text.value).toBe("Paper card");
  });
});

describe("rendering instances of one sequence", () => {
  type Inner = { kind: string; clipId?: string | undefined; color?: { r: number; g: number; b: number } | undefined };
  const inner = (project: Project, frame: number): Inner[] => {
    const layers = new Compositor().evaluate(project, frame).layers as unknown as { kind: string; inner?: { layers: Inner[] } }[];
    return layers.filter((l) => l.kind === "compound").flatMap((l) => (l.inner?.layers ?? []).map((x) => ({ kind: x.kind, clipId: x.clipId, color: x.color ? { ...x.color } : undefined })));
  };
  const innerIds = (project: Project, frame: number): string[] => inner(project, frame).filter((l) => l.kind === "text").map((l) => l.clipId as string);
  it("two instances with different values give two different cards from one sequence", () => {
    const p = fixture();
    const a = innerIds(p, 15);
    const b = innerIds(p, 45);
    const c = innerIds(p, 75);
    expect(a).toContain("card-title");
    expect(b.find((id) => id.startsWith("card-title"))).toMatch(/^card-title~/);
    expect(b.find((id) => id.startsWith("card-title"))).not.toBe(c.find((id) => id.startsWith("card-title")));
    // Card C hides the accent bar and dot: the paper alone is left of the solids; Card B's accent is orange.
    expect([15, 45, 75].map((frame) => inner(p, frame).filter((l) => l.kind === "solid").length)).toEqual([3, 3, 1]);
    const orange = inner(p, 45).filter((l) => l.kind === "solid" && l.color !== undefined && Math.abs(l.color.r - 0.95) < 1e-6);
    expect(orange).toHaveLength(2);
    expect(Object.keys(p.sequences)).toEqual(["paper-card"]);
  });
  it("editing the sequence updates every instance and keeps each instance's values", () => {
    const p = fixture();
    (p.clips["card-paper"] as SolidClip).fill = { r: 1, g: 0, b: 0, a: 1 };
    const view = instanceView(p, seq(p), inst(p, "card-b"));
    expect((view.clips["card-paper"] as SolidClip).fill).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect((view.clips["card-title"] as TextClip).text.value).toBe("Launch day");
  });
});
