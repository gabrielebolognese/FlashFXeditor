// The project of fixtures/interop/svg (Batch 66): four icons imported with `importSvgShapes` in a grid on an
// 800 x 800 frame, the checkmark's tick drawing on over frames 0 to 10. Shared by the fixture test (which checks
// the committed project.json against a fresh import) and the script that writes it.
import { importSvgShapes } from "./svgImport.js";

export const SVG_FIXTURE_ICONS = [
  { file: "check", name: "Check", x: -200, y: -200, keyed: true },
  { file: "badge", name: "Badge", x: 200, y: -200, keyed: false },
  { file: "gauge", name: "Gauge", x: -200, y: 200, keyed: false },
  { file: "arrow", name: "Arrow", x: 200, y: 200, keyed: false },
] as const;

/** The icon's long side on the frame, project px. */
export const SVG_FIXTURE_LONG_SIDE = 320;
export const SVG_FIXTURE_BACKGROUND = { r: 0.1, g: 0.1, b: 0.12, a: 1 };

export const fixtureScale = (size: { w: number; h: number }) => Math.round((SVG_FIXTURE_LONG_SIDE / Math.max(size.w, size.h)) * 1000) / 1000;

/** The fixture's project from the icons' SVG texts (by file stem). */
export function buildSvgFixture(svgs: Readonly<Record<string, string>>): { project: Record<string, unknown>; sizes: Record<string, { w: number; h: number }> } {
  const tracks: unknown[] = [];
  const clips: Record<string, unknown> = {};
  const sizes: Record<string, { w: number; h: number }> = {};
  tracks.push({ id: "v1", kind: "video", name: "V1", clipIds: [], locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" });
  SVG_FIXTURE_ICONS.forEach((icon, index) => {
    let n = 0;
    const doc = new DOMParser().parseFromString(svgs[icon.file] as string, "image/svg+xml");
    const result = importSvgShapes(doc.documentElement, () => `${icon.file}-${++n}`);
    if (!result.ok) throw new Error(`${icon.file}: ${result.unsupported.join(", ")}`);
    const trackId = `v${index + 2}`;
    tracks.push({ id: trackId, kind: "video", name: `V${index + 2}`, clipIds: [icon.file], locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" });
    sizes[icon.file] = result.size;
    const clip: Record<string, unknown> = {
      id: icon.file,
      trackId,
      kind: "shape",
      name: icon.name,
      start: 0,
      duration: 60,
      enabled: true,
      size: result.size,
      paths: result.paths,
      transform: { x: icon.x, y: icon.y, scale: fixtureScale(result.size), rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
      opacity: 1,
    };
    if (icon.keyed) {
      const tick = result.paths.find((path) => path.stroke);
      if (tick) {
        tick.trim = { start: 0, end: 1, offset: 0 };
        clip.keyframes = { [`paths.${tick.id}.trim.end`]: [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 1, ease: "linear" }] };
      }
    }
    clips[icon.file] = clip;
  });
  return {
    sizes,
    project: {
      schemaVersion: 10,
      id: "3c5e7a91-2d4f-4b86-8a1c-9e0f6d2b4a38",
      name: "Interop svg",
      settings: { width: 800, height: 800, fps: { num: 30, den: 1 }, background: SVG_FIXTURE_BACKGROUND, sampleRate: 48000 },
      media: {},
      bins: [],
      tracks,
      clips,
      markers: [],
      captionTracks: {},
      textPresetsLocal: [],
      sequences: {},
      meta: { createdAt: "2026-11-08T08:00:00.000Z", modifiedAt: "2026-11-08T08:00:00.000Z", appVersion: "1.1.0", generator: { name: "interop-fixture", version: "1", source: "fixtures/interop/svg (Batch 66)" } },
    },
  };
}
