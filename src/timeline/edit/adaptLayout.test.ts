import { describe, expect, it } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip, Clip, MediaClip, MediaItem, Project, SolidClip, Transform } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { adaptResolution } from "./adaptLayout.js";
import { defaultTransform } from "./insertMedia.js";

const media = (id: string, width: number, height: number, kind: MediaItem["kind"] = "video"): MediaItem => ({ ...makeMedia(id, kind), width, height });

/** A 9:16 project with `items` imported, `clips` on V1 (one after another) and the V1 lock given. */
function projectWith(items: MediaItem[], clips: (project: Project) => Clip[], locked = false): Project {
  const p = makeProject();
  p.tracks.push({ ...makeTrack("v1"), locked });
  for (const item of items) p.media[item.id] = item;
  return withClips(p, clips(p));
}

const storeFor = (project: Project) => new DocumentStore(project, { session: createSessionStore(), validate: true });
const transformOf = (store: DocumentStore, id: string) => (store.getState().clips[id] as MediaClip | SolidClip).transform;
const close = (transform: Transform) => ({ x: Number(transform.x.toFixed(3)) + 0, y: Number(transform.y.toFixed(3)) + 0, scale: Number(transform.scale.toFixed(5)) });

describe("adaptResolution (Adapt layout, spec §15)", () => {
  // Media at their default Fit in 1080x1920, and a 4:3 image at Fill.
  const TALL = media("tall", 1080, 1920);
  const WIDE = media("wide", 1920, 1080);
  const PHOTO = media("photo", 1600, 1200, "image");
  const placed = (p: Project, id: string, item: MediaItem, start: number, transform?: Transform): MediaClip => ({
    ...makeMediaClip(p, { id, trackId: "v1", start, duration: 10, mediaId: item.id, kind: item.kind === "image" ? "image" : "video" }),
    transform: transform ?? defaultTransform(item, p.settings),
  });

  it("refits videos and images to 16:9: Fit stays Fit, Fill stays Fill; one undo step", () => {
    const fill: Transform = { ...defaultTransform(PHOTO, { width: 1080, height: 1920 }), scale: 1.6 };
    const project = projectWith([TALL, WIDE, PHOTO], (p) => [placed(p, "tall", TALL, 0), placed(p, "wide", WIDE, 10), placed(p, "fit", PHOTO, 20), placed(p, "fill", PHOTO, 30, fill)], true);
    const store = storeFor(project);
    store.dispatch(adaptResolution(store.getState(), 1920, 1080));
    expect(store.getState().settings).toMatchObject({ width: 1920, height: 1080 });
    // A vertical video goes in whole, with bands at the sides; a horizontal one now fills the frame.
    expect(close(transformOf(store, "tall"))).toEqual({ x: 0, y: 0, scale: 0.5625 });
    expect(close(transformOf(store, "wide"))).toEqual({ x: 0, y: 0, scale: 1 });
    // 4:3 at Fit: 0.675 (the width of 1080) to 0.9 (the height of 1080); at Fill 1.6 to 1.2.
    expect(close(transformOf(store, "fit"))).toEqual({ x: 0, y: 0, scale: 0.9 });
    expect(close(transformOf(store, "fill"))).toEqual({ x: 0, y: 0, scale: 1.2 });
    expect(store.history.getState().undoLabel).toBe("Change resolution");
    store.undo();
    expect(store.getState()).toStrictEqual(project);
  });

  it("keeps a picture in picture's size relative to its Fit and its place in the frame", () => {
    // Half its Fit, in the top-right quarter of 1080x1920: shown over [540, 1080] x [0, 960].
    const pip: Transform = { ...defaultTransform(TALL, { width: 1080, height: 1920 }), x: 270, y: -480, scale: 0.5 };
    const store = storeFor(projectWith([TALL], (p) => [placed(p, "pip", TALL, 0, pip)]));
    store.dispatch(adaptResolution(store.getState(), 1920, 1080));
    // Half its Fit of 0.5625, its middle at 75% across and 25% down: (1440, 270).
    expect(close(transformOf(store, "pip"))).toEqual({ x: 480, y: -270, scale: 0.28125 });
  });

  it("moves position keys each axis and scales scale keys by the layer's ratio", () => {
    const keyed = (p: Project): MediaClip => ({
      ...placed(p, "k", TALL, 0),
      keyframes: {
        "transform.x": [{ frame: 0, value: 100, ease: "linear" }],
        "transform.y": [{ frame: 0, value: -200, ease: "linear" }],
        "transform.scale": [{ frame: 0, value: 1.2, ease: "linear" }],
        opacity: [{ frame: 0, value: 0.5, ease: "linear" }],
      },
    });
    const store = storeFor(projectWith([TALL], (p) => [keyed(p)]));
    store.dispatch(adaptResolution(store.getState(), 1920, 1080));
    const keys = (store.getState().clips.k as MediaClip).keyframes;
    const value = (prop: string) => Number(keys?.[prop]?.[0]?.value.toFixed(4));
    expect([value("transform.x"), value("transform.y"), value("transform.scale"), value("opacity")]).toEqual([177.7778, -112.5, 0.675, 0.5]);
  });

  it("sizes shapes by the short side, inside the new frame, and resizes a background", () => {
    const solid = (id: string, size: SolidClip["size"], fields: Partial<Transform>, start: number): SolidClip => {
      const clip = makeSolidClip({ id, trackId: "v1", start, duration: 10 });
      return { ...clip, size, transform: { ...clip.transform, ...fields } };
    };
    const store = storeFor(
      projectWith([], () => [
        // A banner near the top, a background, and a bar along the bottom edge.
        solid("banner", { w: 900, h: 200 }, { y: -700 }, 0),
        solid("bg", { w: 1080, h: 1920 }, {}, 10),
        solid("bar", { w: 1080, h: 100 }, { y: 910 }, 20),
      ]),
    );
    store.dispatch(adaptResolution(store.getState(), 1920, 1080));
    // Same short side: same size; its middle 13.5% down stays 13.5% down.
    expect(close(transformOf(store, "banner"))).toEqual({ x: 0, y: -393.75, scale: 1 });
    expect(store.getState().clips.bg).toMatchObject({ size: { w: 1920, h: 1080 }, transform: { x: 0, y: 0, scale: 1 } });
    // At the bottom edge before, at the bottom edge after.
    expect(close(transformOf(store, "bar"))).toEqual({ x: 0, y: 490, scale: 1 });
    // Back to 9:16: the 1920 px background is a background again; a 1600 px shape shrinks to the width.
    store.dispatch(adaptResolution(store.getState(), 1080, 1920));
    expect(store.getState().clips.bg).toMatchObject({ size: { w: 1080, h: 1920 } });
    const wide = storeFor({ ...projectWith([], () => [solid("w", { w: 1600, h: 100 }, {}, 0)]), settings: { ...makeProject().settings, width: 1920, height: 1080 } });
    wide.dispatch(adaptResolution(wide.getState(), 1080, 1920));
    expect(close(transformOf(wide, "w"))).toEqual({ x: 0, y: 0, scale: 0.675 });
  });

  it("adapts caption styles and cue overrides: text by the short side, wrap width by the width, a custom place each axis", () => {
    let project = addCaptionTrack(projectWith([], () => []));
    const cue: CaptionClip = { ...makeCaptionClip({ id: "c1", trackId: "cc", start: 0, duration: 30 }), styleOverride: { position: "custom", x: 100, y: 600, maxWidth: 800, text: { fontSize: 80, stroke: { width: 6 } } } };
    project = withClips(project, [cue]);
    const store = storeFor(project);
    store.dispatch(adaptResolution(store.getState(), 2160, 3840));
    const style = store.getState().captionTracks.cc?.style;
    expect([style?.text.fontSize, style?.text.stroke.width, style?.maxWidth]).toEqual([128, 12, 1800]);
    expect((store.getState().clips.c1 as CaptionClip).styleOverride).toEqual({ position: "custom", x: 200, y: 1200, maxWidth: 1600, text: { fontSize: 160, stroke: { width: 12 } } });
    // 9:16 to 16:9 at the same short side: the text keeps its size, lines grow wider.
    store.dispatch(adaptResolution(store.getState(), 3840, 2160));
    expect([store.getState().captionTracks.cc?.style.text.fontSize, store.getState().captionTracks.cc?.style.maxWidth]).toEqual([128, 3200]);
  });

  it("changes nothing but the size when the size is the same", () => {
    const store = storeFor(projectWith([TALL], (p) => [placed(p, "tall", TALL, 0)]));
    const before = store.getState();
    store.dispatch(adaptResolution(before, 1080, 1920));
    expect(store.getState()).toBe(before);
  });
});
