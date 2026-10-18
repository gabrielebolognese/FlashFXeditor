// Project settings conversions (spec §15, Batch 42), from the Project section:
// - A new frame size asks "Scale layout" (positions per axis, scale by the smaller ratio, keys too) or
//   "Keep" (every layer keeps its pixel size and its offset from the center) when the timeline has
//   layers; without any the size just changes. One undo step either way.
// - A new frame rate converts every frame value by the rational ratio (core/document/fpsConvert.ts):
//   a lossless conversion (30 to 60 fps, or none needed) is made at once with a toast; one that rounds
//   timings asks first, naming how many. One undo step; Undo reverts every frame value.
// - The session's frames (playhead, in/out, zoom, scroll) follow every frame rate change of the open
//   project, Undo and Redo included, so the view keeps its place in time (`followFrameRate`).
import { frameRateReport, setFrameRate, setResolution } from "../core/commands/projectCommands.js";
import { FrameConverter, frameRatio, isLossless, sameFrameRate, type ConversionReport } from "../core/document/fpsConvert.js";
import { isLayerClip } from "../timeline/edit/transform.js";
import type { Project, Rational } from "../core/document/types.js";
import { formatFps } from "../project/projectPresets.js";
import { showToast } from "../ui/toasts.js";
import { closeDialog, showDialog } from "./projectController.js";
import { documentStore, sessionStore } from "./services.js";

/** Clips whose transform the frame size changes the look of (what Scale layout scales). */
function hasLayers(project: Project): boolean {
  for (const id in project.clips) {
    const clip = project.clips[id];
    if (clip && isLayerClip(clip)) return true;
  }
  return false;
}

/** The Project section's new frame size: asks Scale layout or Keep when there are layers. */
export function changeResolution(width: number, height: number): void {
  const project = documentStore.getState();
  const { settings } = project;
  if (width === settings.width && height === settings.height) return;
  if (!hasLayers(project)) {
    documentStore.dispatch(setResolution(width, height));
    return;
  }
  showDialog({ kind: "resolution", width, height });
}

/** The resolution dialog's choice (one undo step). */
export function confirmResolution(width: number, height: number, scaleLayout: boolean): void {
  closeDialog();
  documentStore.dispatch(setResolution(width, height, { scaleLayout }));
}

/** What a report says, in words ("12 timings rounded to the nearest frame, 1 clip moved by a frame"). */
export function describeRounding(report: ConversionReport): string {
  const parts: string[] = [];
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (report.rounded > 0) parts.push(`${count(report.rounded, "timing falls", "timings fall")} between frames and ${report.rounded === 1 ? "is" : "are"} rounded to the nearest one`);
  if (report.merged > 0) parts.push(`${count(report.merged, "keyframe lands", "keyframes land")} on the frame of another and ${report.merged === 1 ? "merges" : "merge"}`);
  if (report.shifted > 0) parts.push(`${count(report.shifted, "clip moves", "clips move")} a frame later to keep the clip before it`);
  return parts.join("; ");
}

/** The Project section's new frame rate: converted at once when nothing rounds, else after the warning. */
export function changeFrameRate(fps: Rational): void {
  const project = documentStore.getState();
  if (sameFrameRate(project.settings.fps, fps)) return;
  const report = frameRateReport(project, fps);
  if (!isLossless(report)) {
    showDialog({ kind: "frameRate", fps, report });
    return;
  }
  applyFrameRate(fps);
}

/** Converts the project to `fps` (one undo step). */
export function applyFrameRate(fps: Rational): void {
  closeDialog();
  const before = documentStore.getState().settings.fps;
  documentStore.dispatch(setFrameRate(fps));
  const after = documentStore.getState();
  if (Object.keys(after.clips).length > 0 || after.markers.length > 0) {
    showToast({ tone: "success", message: `Converted to ${formatFps(fps)} fps`, detail: `Every clip, keyframe, caption and marker moved from ${formatFps(before)} fps. Undo reverts it.` });
  }
}

/**
 * Keeps the session's frames on the same moments when the open project's frame rate changes (a
 * conversion, its undo or redo, a history restore). Returns a stop function.
 */
export function followFrameRate(): () => void {
  return documentStore.subscribe(
    (state, prev) => {
      if (sameFrameRate(state.settings.fps, prev.settings.fps)) return;
      const ratio = frameRatio(prev.settings.fps, state.settings.fps);
      const conv = new FrameConverter(ratio);
      const at = (frame: number | null) => (frame === null ? null : Math.max(0, conv.frame(frame)));
      sessionStore.state.set((session) => ({
        ...session,
        playhead: at(session.playhead) ?? 0,
        inPoint: at(session.inPoint),
        outPoint: at(session.outPoint),
        // The same pixels per second: as zoomed in on the same moment.
        timeline: { ...session.timeline, pxPerFrame: (session.timeline.pxPerFrame * ratio.den) / ratio.num, scrollFrame: at(session.timeline.scrollFrame) ?? 0 },
      }));
      // Selections named by frames lose their meaning.
      sessionStore.gap.set(null);
      sessionStore.keyframes.set(null);
      sessionStore.silence.set(null);
    },
    { affects: ["settings"] },
  );
}
