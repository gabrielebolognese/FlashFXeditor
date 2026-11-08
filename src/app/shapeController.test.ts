import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia, makeProject, makeTrack } from "../core/document/fixtures.js";
import type { MediaItem, Project } from "../core/document/types.js";
import { setPlayhead } from "../core/store/sessionStore.js";
import { toastStore, type Toast } from "../ui/toasts.js";
import { dropMediaOnCanvas, placeAtPlayhead } from "./dropController.js";
import { importAsShapes, installShapeController } from "./shapeController.js";
import { documentStore, sessionStore } from "./services.js";

// The real services open IndexedDB at import time, which jsdom lacks.
vi.mock("./services.js", async () => {
  const { CommandRegistry } = await import("../core/commands/CommandRegistry.js");
  const { createProject } = await import("../core/document/project.js");
  const { DocumentStore } = await import("../core/store/DocumentStore.js");
  const { createSessionStore } = await import("../core/store/sessionStore.js");
  const sessionStore = createSessionStore();
  return {
    actions: new CommandRegistry(),
    documentStore: new DocumentStore(createProject({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: true }),
    sessionStore,
  };
});
// The SVG files come from the interop fixtures instead of the project's media folder.
const FILES: Record<string, string> = { check: "fixtures/interop/svg/icons/check.svg", filter: "fixtures/interop/svg/icons/filter.svg" };
vi.mock("./mediaOffline.js", () => ({
  sourceFile: (id: string) => {
    const path = FILES[id];
    return Promise.resolve(path ? new File([readFileSync(join(process.cwd(), path), "utf8")], `${id}.svg`, { type: "image/svg+xml" }) : null);
  },
}));
// These pull in the media pipeline and the timeline view; the drop and shape paths use none of them here.
vi.mock("./mediaController.js", () => ({ filesFromTransfer: () => Promise.resolve([]), importMediaFiles: () => undefined, selectedMedia: () => [] }));
vi.mock("./timelineController.js", () => ({ movePlayhead: () => undefined, reportMoveRefusal: () => undefined }));

function svgMedia(id: string): MediaItem {
  return { ...makeMedia(id, "image", 0), name: `${id}.svg`, codec: "svg", width: 24, height: 24 };
}

function project(): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"));
  p.media.check = svgMedia("check");
  p.media.filter = svgMedia("filter");
  return p;
}

const clipKinds = () => Object.values(documentStore.getState().clips).map((clip) => clip.kind);
const offers = (): Toast[] => toastStore.getState().filter((toast) => toast.action?.label === "Make shapes");
const warnings = (): Toast[] => toastStore.getState().filter((toast) => toast.tone === "warning");
/** Lets the async shape import (file read, parse, placement) finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let stop: () => void = () => undefined;

beforeEach(() => {
  toastStore.set([]);
  documentStore.load(project());
  setPlayhead(sessionStore, 0);
  stop = installShapeController();
});

afterEach(() => {
  stop();
  toastStore.set([]);
});

describe("the SVG drop choice (spec §21.12, Batch 66)", () => {
  it("offers Make shapes once for a dropped SVG; pressing it leaves one shape clip and no image clip", async () => {
    placeAtPlayhead(["check"], "insert");
    expect(clipKinds()).toEqual(["image"]);
    expect(offers()).toHaveLength(1);
    offers()[0]!.action!.run();
    await settle();
    expect(clipKinds()).toEqual(["shape"]);
    expect(offers()).toHaveLength(1); // only the pressed toast; the shape clip offers nothing new
    expect(warnings()).toHaveLength(0);
    // One undo step: back to the image clip (the drop), not to an empty timeline.
    documentStore.undo();
    expect(clipKinds()).toEqual([]);
  });

  it("an unsupported SVG ends as one image clip with the warning only, and does not offer the choice again", async () => {
    dropMediaOnCanvas(["filter"], null);
    expect(offers()).toHaveLength(1);
    const pressed = offers()[0]!;
    pressed.action!.run();
    await settle();
    expect(clipKinds()).toEqual(["image"]);
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]!.detail).toContain("filter");
    expect(offers().filter((toast) => toast.id !== pressed.id)).toHaveLength(0);
  });

  it("Import as shapes on an unsupported SVG: the image fallback with the warning naming the feature, no Make shapes", async () => {
    await importAsShapes(["filter"]);
    expect(clipKinds()).toEqual(["image"]);
    expect(toastStore.getState().map((toast) => toast.tone)).toEqual(["warning"]);
    expect(warnings()[0]!.detail).toContain("filter");
    expect(offers()).toHaveLength(0);
  });

  it("Import as shapes on a supported SVG: one shape clip, no toast", async () => {
    await importAsShapes(["check"]);
    expect(clipKinds()).toEqual(["shape"]);
    expect(toastStore.getState()).toHaveLength(0);
  });

  it("the placement can turn the offer off (the shape import's fallback, + Image)", () => {
    dropMediaOnCanvas(["check"], null, { offer: false });
    expect(clipKinds()).toEqual(["image"]);
    expect(offers()).toHaveLength(0);
  });
});
