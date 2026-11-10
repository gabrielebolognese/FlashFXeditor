// The "every" part of fixtures/interop/full (Batch 82): what the other fixtures do not already show, so that the
// full fixture holds every value of every list of the capability manifest: all easing curves, the normal blend
// mode, every text animation, every caption highlight mode and cue animation, a two-stop gradient fill, a beveled
// join, an equal-power fade and the media and font kinds of template parameters. 1080 x 1920 at 30 fps, 96 frames;
// its media are files of fixtures/interop/basic (`EVERY_ASSETS_FROM`). Built from the model constants, so a value
// added to a list later is shown here too.
import { makeCaptionClip, makeCompoundClip, makeMedia, makeMediaClip, makeShapeClip, makeSolidClip, makeTextClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import { CAPTION_HIGHLIGHTS, CUE_ANIM_KINDS, EASE_IDS, TEXT_ANIM_IDS } from "./types.js";
import type { Clip, Project, RGBA, Sequence, Track } from "./types.js";

export const EVERY_DURATION = 96;
export const EVERY_ASSETS_FROM = "basic";
const rgba = (r: number, g: number, b: number): RGBA => ({ r, g, b, a: 1 });
const T = (patch: { x?: number; y?: number; scale?: number } = {}) => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...patch });

export function buildEveryPart(): Project {
  const project = createProject({ id: "7d1e4a58-2c93-4f0b-b6a7-90e3d5c81f24", name: "Interop every", now: "2026-11-10T12:00:00.000Z", appVersion: "1.2.0" });
  project.settings = { ...project.settings, width: 1080, height: 1920, fps: { num: 30, den: 1 }, background: rgba(0.05, 0.05, 0.07) };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/full (Batch 82)" };
  const tracks = new Map<string, Track>();
  const track = (id: string, kind: Track["kind"] = "video"): Track => {
    let t = tracks.get(id);
    if (!t) {
      t = emptyTrack(id, kind, id);
      tracks.set(id, t);
    }
    return t;
  };
  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    track(clip.trackId, clip.kind === "audio" ? "audio" : clip.kind === "caption" ? "caption" : "video").clipIds.push(clip.id);
  };
  /** Item `i` of a lane layout: the lane (a track) and the start frame, `each` frames per item. */
  const slot = (i: number, perLane: number, each: number, prefix: string) => ({ trackId: `${prefix}${Math.floor(i / perLane)}`, start: (i % perLane) * each, lane: Math.floor(i / perLane) });

  // Every easing curve but the two with parameters (bezier and spring, shown by the keyframes fixture): a bar sliding across.
  const eases = EASE_IDS.filter((id) => id !== "bezier" && id !== "spring");
  eases.forEach((ease, i) => {
    const { trackId, start, lane } = slot(i, 8, 12, "ease");
    add({
      ...makeSolidClip({ id: `ease-${ease}`, trackId, start, duration: 12 }),
      name: ease,
      fill: rgba(0.95, 0.75, 0.2),
      size: { w: 24, h: 24 },
      transform: T({ x: -420, y: -860 + lane * 40 }),
      keyframes: { "transform.x": [{ frame: 0, value: -420, ease }, { frame: 11, value: 420, ease: "linear" }] },
    });
  });

  // The normal blend mode and a two-stop gradient fill.
  add({ ...makeSolidClip({ id: "blend-normal", trackId: "solids", start: 0, duration: EVERY_DURATION }), fill: rgba(0.2, 0.5, 0.9), size: { w: 200, h: 120 }, transform: T({ x: -300, y: -620 }), blend: "normal" });
  add({ ...makeSolidClip({ id: "gradient-two", trackId: "solids2", start: 0, duration: EVERY_DURATION }), fill: { from: rgba(1, 0.4, 0.3), to: rgba(0.3, 0.2, 0.9) } as never, size: { w: 200, h: 120 }, transform: T({ x: 0, y: -620 }) });

  // A line solid, a linear gradient, per-corner radii.
  add({ ...makeSolidClip({ id: "solid-line", trackId: "solids3", start: 0, duration: EVERY_DURATION }), shape: "line", fill: rgba(0.9, 0.9, 0.9), size: { w: 200, h: 12 }, cornerRadius: 6, transform: T({ x: -300, y: -500 }) });
  add({
    ...makeSolidClip({ id: "gradient-linear", trackId: "solids4", start: 0, duration: EVERY_DURATION }),
    fill: { type: "linear", angle: 45, center: { x: 0.5, y: 0.5 }, radius: 1, stops: [{ at: 0, color: rgba(0.95, 0.8, 0.2) }, { at: 1, color: rgba(0.8, 0.2, 0.5) }] } as never,
    size: { w: 200, h: 120 }, transform: T({ x: 0, y: -500 }),
  });
  add({ ...makeSolidClip({ id: "solid-radii", trackId: "solids5", start: 0, duration: EVERY_DURATION }), shape: "roundedRect", cornerRadii: [4, 40, 4, 40], fill: rgba(0.3, 0.8, 0.7), size: { w: 200, h: 120 }, transform: T({ x: 300, y: -500 }) });

  // A text with a two-stop gradient fill, a shadow, a line background with stroke and shadow, and a per-line animation.
  {
    const clip = makeTextClip({ id: "text-styled", trackId: "styled", start: 0, duration: EVERY_DURATION, value: "Styled line one\nline two" });
    add({
      ...clip,
      style: {
        ...clip.style,
        fontSize: 44,
        fill: { from: rgba(1, 0.9, 0.3), to: rgba(1, 0.4, 0.3) } as never,
        shadow: { enabled: true, x: 4, y: 6, blur: 8, color: { r: 0, g: 0, b: 0, a: 0.6 } },
        background: { enabled: true, color: { r: 0.1, g: 0.1, b: 0.2, a: 0.9 }, paddingX: 20, paddingY: 8, radius: 10, mode: "line", stroke: { enabled: true, width: 2, color: rgba(1, 1, 1) }, shadow: { enabled: true, x: 3, y: 3, blur: 0, color: { r: 0, g: 0, b: 0, a: 0.5 } } },
      },
      transform: T({ y: -250 }),
      animIn: { id: "fade", duration: 24, perUnit: "line", stagger: 6 },
    } as Clip);
  }

  add({
    ...makeTextClip({ id: "text-radial", trackId: "styled2", start: 0, duration: EVERY_DURATION, value: "Radial fill" }),
    style: { ...makeTextClip({ id: "x", trackId: "x", start: 0, duration: 1 }).style, fontSize: 44, fill: { type: "radial", angle: 0, center: { x: 0.5, y: 0.5 }, radius: 1, stops: [{ at: 0, color: rgba(1, 1, 1) }, { at: 1, color: rgba(0.3, 0.6, 1) }] } as never },
    transform: T({ y: -170 }),
  } as Clip);

  // A beveled join.
  add(makeShapeClip({
    id: "bevel", trackId: "shapes", start: 0, duration: EVERY_DURATION, size: { w: 200, h: 160 }, transform: T({ x: 300, y: -620 }),
    paths: [{ id: "zig", d: "M20 130 L100 30 L180 130", fill: null, fillRule: "nonzero", stroke: { width: 22, color: rgba(0.4, 0.9, 0.6), align: "center", cap: "butt", join: "bevel", miterLimit: 4 } }],
  }));

  // Every text animation (three per lane, 30 frames each).
  TEXT_ANIM_IDS.forEach((anim, i) => {
    const { trackId, start, lane } = slot(i, 3, 30, "anim");
    const clip = makeTextClip({ id: `anim-${anim}`, trackId, start, duration: 30, value: `${anim}` });
    add({ ...clip, style: { ...clip.style, fontSize: 40 }, transform: T({ x: -240 + (i % 3) * 240, y: -380 + lane * 70 }), animIn: { id: anim, duration: 20 } } as Clip);
  });

  // Every caption highlight mode with every cue animation in turn (cues join the captions part's track).
  CAPTION_HIGHLIGHTS.forEach((mode, i) => {
    const cue = makeCaptionClip({
      id: `cue-${mode}`, trackId: "cc1", start: i * 13, duration: 12, text: `mode ${mode}`,
      words: [{ text: "mode", start: 0, end: 5 }, { text: mode, start: 5, end: 11 }],
    });
    const kind = CUE_ANIM_KINDS[i % CUE_ANIM_KINDS.length]!;
    add({ ...cue, styleOverride: { ...(i === 0 && { text: { background: { enabled: true, mode: "line" } } }), highlight: { mode }, anim: { in: { kind, frames: 3 }, out: { kind: CUE_ANIM_KINDS[(i + 1) % CUE_ANIM_KINDS.length]!, frames: 2 } } } });
  });

  // An equal-power fade on a tone (a file of the basic fixture).
  project.media.tone = { ...makeMedia("tone", "audio", 500_000), name: "tone.wav", file: { relPath: "media/tone.wav" }, hasAudio: true };
  add({ ...makeMediaClip(project, { id: "fade-clip", trackId: "audio", start: 0, duration: 15, mediaId: "tone", kind: "audio" }), fades: { in: 5, out: 5, curve: "equalPower" }, out: 500_000 });

  add({ ...makeMediaClip(project, { id: "fade-linear", trackId: "audio", start: 20, duration: 15, mediaId: "tone", kind: "audio" }), fades: { in: 5, out: 5, curve: "linear" }, out: 500_000 });

  // A freeze frame (speed 0) of a video file of the basic fixture.
  project.media.clip = { ...makeMedia("clip", "video", 2_000_000), name: "clip.mp4", file: { relPath: "media/clip.mp4" }, width: 270, height: 480, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", hasAudio: true, size: 18761 };
  add({ ...makeMediaClip(project, { id: "freeze", trackId: "freeze", start: 0, duration: EVERY_DURATION, mediaId: "clip" }), in: 500_000, out: 500_000 + 33_333, speed: 0, transform: T({ x: 0, y: 0, scale: 0.6 }), opacity: 0.5 });

  // A template with a media and a font parameter, and its instance.
  project.media.badge = { ...makeMedia("badge", "image", 5_000_000), name: "badge.png", file: { relPath: "media/badge.png" }, hasAudio: false, width: 64, height: 64 };
  const innerTrack = (id: string): Track => emptyTrack(id, "video", id);
  const inner = [innerTrack("tp-pic"), innerTrack("tp-label")];
  const picture = { ...makeMediaClip(project, { id: "tp-image", trackId: "tp-pic", start: 0, duration: 30, mediaId: "badge", kind: "image" }), in: 0, out: frameToUs(30, project.settings.fps), transform: T({ y: -40 }) };
  const label = makeTextClip({ id: "tp-text", trackId: "tp-label", start: 0, duration: 30, value: "Template" });
  project.clips[picture.id] = picture;
  project.clips[label.id] = { ...label, transform: T({ y: 60 }) } as Clip;
  inner[0]!.clipIds.push(picture.id);
  inner[1]!.clipIds.push(label.id);
  const sequence: Sequence = {
    id: "tp-seq", name: "Media template", size: { w: 300, h: 300 }, duration: 30, background: null, tracks: inner,
    params: [
      { id: "pic", label: "Picture", kind: "media", targets: [{ clipId: "tp-image", path: "mediaId" }], default: "badge" },
      { id: "face", label: "Font", kind: "font", targets: [{ clipId: "tp-text", path: "style.fontFamily" }], default: "Inter" },
    ],
  };
  project.sequences[sequence.id] = sequence;
  add({ ...makeCompoundClip({ id: "tp-instance", trackId: "templates", start: 0, duration: 30, sequenceId: "tp-seq" }), transform: T({ y: 380 }), params: { pic: "badge", face: "Silkscreen" } });

  // Video tracks first, then audio (caption tracks sit above the video tracks).
  const all = [...tracks.values()];
  project.tracks = [...all.filter((t) => t.kind === "video"), ...all.filter((t) => t.kind === "caption"), ...all.filter((t) => t.kind === "audio")];
  project.captionTracks = {};
  return project;
}
