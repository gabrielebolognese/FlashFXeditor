// Project settings conversions (spec §15, Batch 42), from the Project section:
// - A new frame size asks "Adapt layout" (timeline/edit/adaptLayout.ts: videos and images refit the new
//   frame, Fit staying Fit and Fill staying Fill, text, shapes and captions keep their place and a size
//   that suits it, keys too) or "Keep" (every layer keeps its pixel size and its offset from the center)
//   when the timeline has layers or caption cues; without any it adapts at once (the caption tracks'
//   styles). One undo step either way. The preview's Ratio menu (`changeRatio`) changes the frame's
//   shape at the project's short side.
// - A new frame rate converts every frame value by the rational ratio (core/document/fpsConvert.ts):
//   a lossless conversion (30 to 60 fps, or none needed) is made at once with a toast; one that rounds
//   timings asks first, naming how many. One undo step; Undo reverts every frame value.
// - The session's frames (playhead, in/out, zoom, scroll) follow every frame rate change of the open
//   project, Undo and Redo included, so the view keeps its place in time (`followFrameRate`).
import { frameRateReport, setFrameRate, setResolution } from "../core/commands/projectCommands.js";
import { FrameConverter, frameRatio, isLossless, sameFrameRate, type ConversionReport } from "../core/document/fpsConvert.js";
import { adaptResolution } from "../timeline/edit/adaptLayout.js";
import { isLayerClip } from "../timeline/edit/transform.js";
import type { Project, Rational } from "../core/document/types.js";
import { formatFps, ratioSize, type ResolutionPreset } from "../project/projectPresets.js";
import { showToast } from "../ui/toasts.js";
import { closeDialog, showDialog } from "./projectController.js";
import { documentStore, sessionStore } from "./services.js";

/** Clips whose look the frame size changes (what Adapt layout adapts): layers and caption cues. */
function hasLayout(project: Project): boolean {
  for (const id in project.clips) {
    const clip = project.clips[id];
    if (clip && (isLayerClip(clip) || clip.kind === "caption")) return true;
  }
  return false;
}

/** A new frame size (the Project section, the Ratio menu): asks Adapt layout or Keep when there is a layout. */
export function changeResolution(width: number, height: number): void {
  const project = documentStore.getState();
  const { settings } = project;
  if (width === settings.width && height === settings.height) return;
  if (!hasLayout(project)) {
    documentStore.dispatch(adaptResolution(project, width, height));
    return;
  }
  showDialog({ kind: "resolution", width, height });
}

/** The preview's Ratio menu: `preset`'s shape at the project's short side (`ratioSize`). */
export function changeRatio(preset: ResolutionPreset): void {
  const { width, height } = ratioSize(preset, documentStore.getState().settings);
  changeResolution(width, height);
}

/** The resolution dialog's choice (one undo step). */
export function confirmResolution(width: number, height: number, adapt: boolean): void {
  closeDialog();
  documentStore.dispatch(adapt ? adaptResolution(documentStore.getState(), width, height) : setResolution(width, height));
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
