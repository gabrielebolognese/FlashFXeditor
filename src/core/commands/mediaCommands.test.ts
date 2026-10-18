import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../document/fixtures.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { addBin, addMedia, cleanBinName, cleanMediaName, clipsOfMedia, mediaUseCounts, nextBinName, relinkMedia, removeBin, removeMedia, renameBin, renameMedia, setMediaBin, setMediaProxy } from "./mediaCommands.js";

const storeFor = (project = makeProject()) => new DocumentStore(project, { session: createSessionStore(), validate: true });

describe("media commands", () => {
  it("records a proxy's status with no undo step", () => {
    const store = storeFor();
    store.dispatch(addMedia([makeMedia("a")]));
    store.amend(setMediaProxy("a", { relPath: "cache/proxies/a.mp4", width: 960, height: 540, status: "pending" }));
    store.amend(setMediaProxy("a", { relPath: "cache/proxies/a.mp4", width: 960, height: 540, status: "ready" }));
    store.amend(setMediaProxy("missing", { relPath: "cache/proxies/x.mp4", width: 2, height: 2, status: "ready" }));
    expect(store.getState().media.a?.proxy).toEqual({ relPath: "cache/proxies/a.mp4", width: 960, height: 540, status: "ready" });
    expect(store.history.getState().undoLabel).toBe("Import media");
  });

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

  function usedProject() {
    const project = makeProject();
    project.media.m = makeMedia("m");
    project.media.n = makeMedia("n");
    project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
    project.tracks[1]!.locked = true;
    return withClips(project, [
      makeMediaClip(project, { id: "c1", trackId: "v1", start: 0, duration: 30, mediaId: "m" }),
      makeMediaClip(project, { id: "c2", trackId: "a1", start: 0, duration: 30, mediaId: "m", kind: "audio" }),
      makeMediaClip(project, { id: "c3", trackId: "v1", start: 30, duration: 30, mediaId: "n" }),
      makeMediaClip(project, { id: "c4", trackId: "v2", start: 0, duration: 30, mediaId: "m" }),
    ]);
  }

  it("Remove from project keeps the clips of used media as offline clips (spec §6.19); undo restores", () => {
    const store = storeFor(usedProject());
    expect(mediaUseCounts(store.getState()).get("m")).toBe(3);
    expect(clipsOfMedia(store.getState(), ["m"]).sort()).toEqual(["c1", "c2", "c4"]);
    store.dispatch(removeMedia(["m"]));
    expect(store.getState().media.m).toBeUndefined();
    expect(Object.keys(store.getState().clips).sort()).toEqual(["c1", "c2", "c3", "c4"]);
    expect(store.history.getState().undoLabel).toBe("Remove media");
    store.undo();
    expect(store.getState().media.m).toBeDefined();
  });

  it("Remove and delete clips takes every clip of the media, on locked tracks too, in one undo step", () => {
    const project = usedProject();
    const store = storeFor(project);
    store.dispatch(removeMedia(["m"], "delete"));
    const state = store.getState();
    expect(state.media.m).toBeUndefined();
    expect(Object.keys(state.clips)).toEqual(["c3"]);
    expect(state.tracks.map((track) => track.clipIds)).toEqual([["c3"], [], []]);
    expect(store.history.getState().undoLabel).toBe("Remove media and delete clips");
    store.undo();
    expect(store.getState()).toEqual(project);
  });

  it("relinks media to new files in one step; undefined fields are removed", () => {
    const project = makeProject();
    project.media.a = { ...makeMedia("a"), file: { handleKey: "", pathHint: "media/a.mp4" }, proxy: { relPath: "cache/proxies/a.mp4", width: 2, height: 2, status: "failed" } };
    project.media.b = makeMedia("b");
    const store = storeFor(project);
    store.dispatch(
      relinkMedia([
        { id: "a", fields: { file: { relPath: "media/a (2).mp4" }, size: 99, durationUs: 5_000_000, proxy: undefined } },
        { id: "b", fields: { file: { handleKey: "h-b", pathHint: "b.mp4" } } },
        { id: "zzz", fields: { file: { relPath: "media/z.mp4" } } },
      ]),
    );
    const { a, b } = store.getState().media;
    expect(a?.file).toEqual({ relPath: "media/a (2).mp4" });
    expect(a?.size).toBe(99);
    expect(a?.durationUs).toBe(5_000_000);
    expect(a && "proxy" in a).toBe(false);
    expect(b?.file).toEqual({ handleKey: "h-b", pathHint: "b.mp4" });
    expect(store.history.getState().undoLabel).toBe("Relink 3 media files");
    store.undo();
    expect(store.getState()).toEqual(project);
  });

  it("bins: add, rename, move media in and out, delete (media stay, in no bin)", () => {
    const store = storeFor();
    store.dispatch(addMedia([makeMedia("a"), makeMedia("b")]));
    expect(nextBinName(store.getState().bins)).toBe("Bin");
    store.dispatch(addBin({ id: "b1", name: "  B-roll  " }));
    store.dispatch(addBin({ id: "b2", name: nextBinName([{ id: "x", name: "bin" }]) }));
    expect(store.getState().bins).toEqual([
      { id: "b1", name: "B-roll" },
      { id: "b2", name: "Bin 2" },
    ]);
    expect(() => store.dispatch(addBin({ id: "b1", name: "Again" }))).toThrow(/already exists/);
    expect(() => store.dispatch(addBin({ id: "b3", name: " " }))).toThrow(/empty name/);
    store.dispatch(renameBin("b2", "Music"));
    store.dispatch(renameBin("b2", "   "));
    expect(store.getState().bins[1]?.name).toBe("Music");
    store.dispatch(setMediaBin(["a", "b", "nope"], "b1"));
    expect(store.history.getState().undoLabel).toBe("Move 3 media files to bin");
    expect([store.getState().media.a?.binId, store.getState().media.b?.binId]).toEqual(["b1", "b1"]);
    expect(() => store.dispatch(setMediaBin(["a"], "zz"))).toThrow(/does not exist/);
    store.dispatch(setMediaBin(["b"], null));
    expect(store.getState().media.b && "binId" in store.getState().media.b!).toBe(false);
    store.dispatch(removeBin("b1"));
    expect(store.getState().bins.map((bin) => bin.id)).toEqual(["b2"]);
    expect(store.getState().media.a && "binId" in store.getState().media.a!).toBe(false);
    store.undo();
    expect(store.getState().media.a?.binId).toBe("b1");
    expect(cleanBinName("x".repeat(100))).toHaveLength(64);
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
