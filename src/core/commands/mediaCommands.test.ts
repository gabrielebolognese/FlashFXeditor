import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../document/fixtures.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { addMedia, cleanMediaName, mediaUseCounts, removeMedia, renameMedia } from "./mediaCommands.js";

const storeFor = (project = makeProject()) => new DocumentStore(project, { session: createSessionStore(), validate: true });

describe("media commands", () => {
  it("adds a whole import batch as one undo step", () => {
    const store = storeFor();
    const seen: string[][] = [];
    store.subscribe((_state, _prev, affects) => seen.push([...affects]));
    store.dispatch(addMedia([makeMedia("a"), makeMedia("b", "audio"), makeMedia("c", "image", 0)]));
    expect(Object.keys(store.getState().media)).toEqual(["a", "b", "c"]);
    expect(seen).toEqual([["media"]]);
    expect(store.history.getState().undoLabel).toBe("Import 3 media files");
    store.undo();
    expect(store.getState().media).toEqual({});
    expect(store.history.getState().canUndo).toBe(false);
  });

  it("refuses an id that already exists and leaves the document untouched", () => {
    const store = storeFor();
    store.dispatch(addMedia([makeMedia("a")]));
    expect(() => store.dispatch(addMedia([makeMedia("b"), makeMedia("a")]))).toThrow(/already exists/);
    expect(Object.keys(store.getState().media)).toEqual(["a"]);
  });

  it("removes media and undo brings them back", () => {
    const store = storeFor();
    store.dispatch(addMedia([makeMedia("a"), makeMedia("b")]));
    store.dispatch(removeMedia(["a", "missing"]));
    expect(Object.keys(store.getState().media)).toEqual(["b"]);
    expect(store.history.getState().undoLabel).toBe("Remove 2 media files");
    store.undo();
    expect(Object.keys(store.getState().media).sort()).toEqual(["a", "b"]);
  });

  it("refuses to remove media that clips use", () => {
    const project = makeProject();
    project.media.m = makeMedia("m");
    project.tracks.push(makeTrack("v1"));
    const store = storeFor(withClips(project, [makeMediaClip(project, { id: "c", trackId: "v1", start: 0, duration: 30, mediaId: "m" })]));
    expect(mediaUseCounts(store.getState()).get("m")).toBe(1);
    expect(() => store.dispatch(removeMedia(["m"]))).toThrow(/still used by clips/);
    expect(store.getState().media.m).toBeDefined();
  });

  it("renames with a cleaned name; empty names are ignored", () => {
    const store = storeFor();
    store.dispatch(addMedia([makeMedia("a")]));
    store.dispatch(renameMedia("a", "  Beach   take 2\n"));
    expect(store.getState().media.a?.name).toBe("Beach take 2");
    expect(store.history.getState().undoLabel).toBe("Rename media");
    store.dispatch(renameMedia("a", "   "));
    expect(store.getState().media.a?.name).toBe("Beach take 2");
    expect(() => store.dispatch(renameMedia("zzz", "x"))).toThrow(/does not exist/);
    expect(cleanMediaName("x".repeat(400))).toHaveLength(255);
  });
});
