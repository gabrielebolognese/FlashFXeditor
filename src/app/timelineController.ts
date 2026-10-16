// Timeline wiring (spec §6): the timeline view, the zoom, center playhead, edit-point/marker and
// in/out navigation actions (§6.2, §6.5, §6.6, §6.13; the transport keys are in playbackController,
// the markers and the range in markerController), the toolbar's
// direct-DOM bindings (zoom slider, timecode field, duration: no React render while they change, P1),
// the timecode format toggle shared with the preview (§5.1), files dropped from the OS (§6.14, placed
// by dropController), the track header gestures (toggles, reorder,
// rename: handled by trackController, §6.12), clip moves (drops, nudges, Alt+Up/Down, §6.8), edits (trim, roll, slip, slide and rate
// stretch drags, Q/W/E, Ripple mode, §6.10), the tools (§6.18), the snap toggle (§6.9), select all /
// deselect (§6.7), Esc for gestures and the dev clip generator.
import { addTrack, updateClip, updateTrack, type ClipPatch, type TrackPatch } from "../core/commands/basicCommands.js";
import type { ActionRun } from "../core/commands/ActionRegistry.js";
import { emptyTrack, nextTrackName } from "../core/document/project.js";
import { formatTimecode, parseTimecode } from "../core/document/time.js";
import type { ClipId, Frame, Project, TrackKind } from "../core/document/types.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { createStore } from "../core/store/createStore.js";
import { EMPTY_SELECTION, selectClips, toSnapshot } from "../core/store/selection.js";
import { selectEditPoint, selectGap, setPlayhead, setSelection, type Tool } from "../core/store/sessionStore.js";
import { applyMoveRequest, moveToAdjacentLane, nudgeClips, type MoveRefusal, type MoveRequest, type MoveResult } from "../timeline/edit/move.js";
import { extendToPlayhead, planEdit, resolveTrim, trimToPlayhead, type TrimLimit, type TrimResult } from "../timeline/edit/trim.js";
import { lastFrameOf, selectionSpan } from "../timeline/model/inOut.js";
import { contentEnd, laneOf, markerFrames, navigationPoints, nextEditPoint, prevEditPoint, selectableClipIds } from "../timeline/model/queries.js";
import type { TrimRequest } from "../timeline/view/gestures/trimClip.js";
import { TimelineView } from "../timeline/view/TimelineView.js";
import { pxToSlider, sliderToPx, zoomLimits, ZOOM_IN_STEP, ZOOM_OUT_STEP, type ZoomContext } from "../timeline/view/zoom.js";
import { showToast } from "../ui/toasts.js";
import { openContextMenu, razorCut } from "./cutController.js";
import { dropFilesOnTimeline, insertMediaAtPlayhead } from "./dropController.js";
import { moveMarker, openMarkerEditor } from "./markerController.js";
import { clipVisuals } from "./mediaController.js";
import { moveTrackTo, startTrackRename, toggleTrack } from "./trackController.js";
import { generateCutTimeline, generateTestClips } from "./timelineDev.js";
import { actions, documentStore, idleQueue, layoutStore, scheduler, sessionStore, themeBridge } from "./services.js";

/** Zoom slider resolution (positions per full range). */
const SLIDER_STEPS = 1000;

function addTrackOfKind(kind: TrackKind): void {
  const { tracks } = documentStore.getState();
  documentStore.dispatch(addTrack(emptyTrack(crypto.randomUUID(), kind, nextTrackName(tracks, kind))));
}

const newId = () => crypto.randomUUID();

/** Why a move or a drop was refused, as a toast (spec §6.8: refused drops are reported). */
export function reportMoveRefusal(refusal: MoveRefusal): void {
  const name = documentStore.getState().tracks.find((track) => track.id === refusal.trackId)?.name ?? "The track";
  if (refusal.reason === "occupied") {
    showToast({ tone: "info", message: "No room on that track", detail: `${name} already has a clip there.` });
    return;
  }
  const message = refusal.reason === "lockedTarget" ? "Can't drop clips onto a locked track" : "Can't move clips on a locked track";
  showToast({ tone: "error", message, detail: `${name} is locked. Unlock it to edit its clips.` });
}

/** Dispatches a move as one undo step, selecting the moved clips (or the copies), the dragged one primary. */
function commitMove(result: MoveResult, primary: ClipId | null): void {
  if (result.kind === "refused") reportMoveRefusal(result.refusal);
  if (result.kind !== "ok") return;
  const placed = [...result.placed.values()];
  const selection = selectClips(placed, primary !== null ? (result.placed.get(primary) ?? null) : null);
  documentStore.dispatch(result.command, { selection: toSnapshot(selection) });
}

/** A clip drag was dropped (spec §6.8, P2): the one command of the gesture. */
export function moveClips(request: MoveRequest): void {
  commitMove(applyMoveRequest(documentStore.getState(), request, newId), request.primary);
}

/** An edit drag (trim, roll, slip, slide, rate stretch) was released (spec §6.10, P2): the one command of the gesture. The selection stays. */
export function trimClip(request: TrimRequest): void {
  const result = resolveTrim(planEdit(documentStore.getState(), request), request.deltaFrames);
  if (result.command) documentStore.dispatch(result.command);
}

/** Why a keyboard trim (Q/W/E) or a typed clip time (the properties Clip section) stopped short, as a toast. */
export function reportTrimLimit(limit: TrimLimit): void {
  const project = documentStore.getState();
  const clip = project.clips[limit.clipId]?.name ?? "The clip";
  const track = project.tracks.find((candidate) => candidate.id === limit.trackId)?.name ?? "a track";
  const toasts: Record<TrimLimit["reason"], { message: string; detail: string }> = {
    mediaStart: { message: "Trim stopped at the media start", detail: `${clip} has no earlier frames.` },
    mediaEnd: { message: "Trim stopped at the media end", detail: `${clip} has no later frames.` },
    minDuration: { message: "Trim stopped at 1 frame", detail: "A clip is at least one frame long." },
    minSpeed: { message: "Stopped at the slowest speed", detail: `${clip} can't play slower than 0.25x.` },
    maxSpeed: { message: "Stopped at the fastest speed", detail: `${clip} can't play faster than 4x.` },
    neighbor: { message: "Trim stopped at the next clip", detail: `Clips on ${track} can't overlap.` },
    ripple: { message: `Ripple stopped by ${track}`, detail: `Clips on ${track} can't move further without overlapping.` },
    timelineStart: { message: "Trim stopped at the timeline start", detail: "Clips can't start before 0." },
  };
  showToast({ tone: "info", ...toasts[limit.reason] });
}

/** Dispatches a keyboard trim (one undo step); a limit that stopped it short gets a toast. */
function commitKeyTrim(result: TrimResult): boolean {
  if (result.limit) reportTrimLimit(result.limit);
  if (!result.command) return false;
  documentStore.dispatch(result.command);
  return true;
}

/**
 * Q / W (spec §6.10): ripple trim of the edit point nearest the playhead to the playhead, on targeted
 * tracks. Pure over the document and instant (one command, no gesture); during playback the edit
 * applies at the frame on screen and playback goes on. After Q the playhead moves to the edit point,
 * where the frame it showed now is, so the picture continues.
 */
function rippleTrimToPlayhead(side: "start" | "end"): ActionRun {
  return () => {
    const trim = trimToPlayhead(documentStore.getState(), playhead(), side, { linked: sessionStore.state.getState().linkedSelection });
    if (trim && commitKeyTrim(trim.result) && trim.playhead !== playhead()) movePlayhead(trim.playhead);
  };
}

/** E (spec §6.10): the primary selected clip's nearest edge to the playhead (regular trim, with linked partners). */
const extendEdit: ActionRun = () => {
  const { ids, primary } = selectedClips();
  const clipId = primary ?? ids[0];
  if (clipId === undefined) return;
  const result = extendToPlayhead(documentStore.getState(), clipId, playhead(), { linked: sessionStore.state.getState().linkedSelection });
  if (result) commitKeyTrim(result);
};

export const timelineView = new TimelineView({
  scheduler,
  document: documentStore,
  session: sessionStore,
  layout: layoutStore,
  theme: themeBridge,
  onAddTrack: addTrackOfKind,
  onToggleTrack: toggleTrack,
  onReorderTrack: moveTrackTo,
  onRenameTrack: startTrackRename,
  onMoveClips: moveClips,
  onTrimEdge: trimClip,
  // The preview shows the trim's new edge frame while the edge moves (spec §6.10).
  onTrimPreview: () => scheduler.invalidate("preview"),
  onRazor: razorCut,
  onContextMenu: openContextMenu,
  onMoveMarker: (markerId, frame) => moveMarker(markerId, frame),
  onEditMarker: (markerId) => openMarkerEditor(markerId),
  idle: idleQueue,
  visuals: clipVisuals,
  platform: detectPlatform(),
  // Space armed for Space+drag and released without a drag: the play/pause it would have been (spec §6.6).
  onSpaceTap: () => void actions.run("transport.playPause"),
  // Called at drop time only (dropController imports this module).
  onDropFiles: (transfer, request) => dropFilesOnTimeline(transfer, request),
});

/** The selected clip ids (none for a track or cue selection) and the primary. */
function selectedClips(): { ids: ClipId[]; primary: ClipId | null } {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? { ids: [...selection.clipIds], primary: selection.primary } : { ids: [], primary: null };
}

/** Alt+Left/Right (1 frame), Alt+Shift+Left/Right (5 frames): handled even with nothing selected (Alt+Left is the browser's Back). */
function nudge(frames: number): ActionRun {
  return () => {
    const { ids, primary } = selectedClips();
    if (ids.length > 0) commitMove(nudgeClips(documentStore.getState(), ids, frames, newId), primary);
  };
}

/** Alt+Up/Down: the selection to the adjacent track, the primary clip's kind giving the direction. */
function moveToTrack(direction: "up" | "down"): ActionRun {
  return () => {
    const project = documentStore.getState();
    const { ids, primary } = selectedClips();
    const anchor = primary !== null ? project.clips[primary] : undefined;
    const lane = anchor ? laneOf(project.tracks, anchor.trackId) : null;
    if (ids.length > 0 && lane) commitMove(moveToAdjacentLane(project, ids, direction, lane.kind, newId), primary);
  };
}

/**
 * S and the toolbar magnet (spec §6.9): a press outside a drag, or a click, toggles snapping (session
 * state, not undoable). During a drag the timeline reads S itself as hold-to-invert, so it never gets
 * here; the key-up of a held S does nothing.
 */
const toggleSnap: ActionRun = (context) => {
  if (context?.phase === "up") return;
  sessionStore.state.set((state) => ({ ...state, snap: !state.snap }));
};

/** V, Y, U, R and the toolbar tools (spec §6.18): the active tool (session state, not undoable). */
function selectTool(tool: Tool): ActionRun {
  return () => sessionStore.state.set((state) => (state.activeTool === tool ? state : { ...state, activeTool: tool }));
}

/** Dev chrome of the timeline (not persisted). */
export const timelineDev = createStore<{ stats: boolean }>({ stats: false });

const playhead = () => sessionStore.state.getState().playhead;

/** Zoom limits from the stores (the view need not be mounted): track area width, content end, fps. */
function zoomContext(project: Project = documentStore.getState()): ZoomContext {
  const { headerWidth, scrollbarSize } = themeBridge.theme.timeline;
  const width = Math.max(0, layoutStore.getState().panels.timeline.width - headerWidth - scrollbarSize);
  return { width, contentEnd: contentEnd(project), fps: project.settings.fps };
}

/**
 * The toolbar zoom slider (spec §6.2, logarithmic). Its position follows the zoom through direct DOM
 * writes; dragging it previews the zoom on the canvases and writes the session once on release.
 */
export function bindZoomSlider(input: HTMLInputElement): () => void {
  input.min = "0";
  input.max = String(SLIDER_STEPS);
  input.step = "1";
  let dragging = false;
  const sync = () => {
    if (dragging) return;
    const limits = zoomLimits(zoomContext());
    input.value = String(Math.round(pxToSlider(sessionStore.state.getState().timeline.pxPerFrame, limits) * SLIDER_STEPS));
  };
  const onInput = () => {
    dragging = true;
    timelineView.previewZoom(sliderToPx(Number(input.value) / SLIDER_STEPS, zoomLimits(zoomContext())));
  };
  const onChange = () => {
    dragging = false;
    timelineView.commitPreviewZoom();
    // Give the arrow keys back to the shortcuts (frame stepping).
    input.blur();
    sync();
  };
  input.addEventListener("input", onInput);
  input.addEventListener("change", onChange);
  const stops = [
    sessionStore.state.select((state) => state.timeline.pxPerFrame, sync),
    documentStore.subscribe(sync, { affects: ["timeline", "clips", "settings"] }),
    layoutStore.select((state) => state.panels.timeline.width, sync),
  ];
  sync();
  return () => {
    input.removeEventListener("input", onInput);
    input.removeEventListener("change", onChange);
    for (const stop of stops) stop();
  };
}

/** The playhead or a duration as the timecode format toggle shows them (spec §5.1: `mm:ss:ff` or `mm:ss.mmm`). */
export function formatFrame(frame: Frame, project: Project = documentStore.getState()): string {
  return formatTimecode(frame, project.settings.fps, sessionStore.state.getState().timecodeFormat);
}

/**
 * The toolbar timecode field and total duration (spec §6.1, §6.5), in the format of the preview's
 * toggle. The field shows the playhead (direct DOM writes, skipped while it is being edited). Enter
 * jumps to the typed timecode (absolute, or relative: `+30` / `-15` frames, `+2.` seconds); text that
 * is no timecode keeps the field open, marked invalid (`aria-invalid`) until it is fixed. Escape and
 * leaving the field put the playhead's timecode back.
 */
export function bindTimecode(input: HTMLInputElement, duration: HTMLElement): () => void {
  const parse = () => parseTimecode(input.value, documentStore.getState().settings.fps, { current: playhead(), mode: sessionStore.state.getState().timecodeFormat });
  const setInvalid = (invalid: boolean) => {
    if (invalid) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  };
  const show = () => {
    if (input.ownerDocument.activeElement !== input) input.value = formatFrame(playhead());
  };
  const showDuration = () => {
    duration.textContent = formatFrame(contentEnd(documentStore.getState()));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      const frame = parse();
      if (frame === null) {
        setInvalid(true);
        input.select();
        return;
      }
      movePlayhead(frame);
      input.blur();
    } else if (event.key === "Escape") {
      input.blur();
    }
  };
  // Once marked, the mark goes as soon as the text reads as a timecode again.
  const onInput = () => {
    if (input.hasAttribute("aria-invalid") && parse() !== null) setInvalid(false);
  };
  const onFocus = () => input.select();
  const onBlur = () => {
    setInvalid(false);
    show();
  };
  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  const stops = [
    sessionStore.state.select((state) => state.playhead, show),
    sessionStore.state.select(
      (state) => state.timecodeFormat,
      () => {
        show();
        showDuration();
      },
    ),
    documentStore.subscribe(
      () => {
        show();
        showDuration();
      },
      { affects: ["timeline", "clips", "settings"] },
    ),
  ];
  show();
  showDuration();
  return () => {
    input.removeEventListener("keydown", onKeyDown);
    input.removeEventListener("input", onInput);
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("blur", onBlur);
    for (const stop of stops) stop();
  };
}

/** Moves the playhead and pages the view to it when it lands outside (spec §6.2 paging). */
export function movePlayhead(frame: Frame): void {
  setPlayhead(sessionStore, frame);
  timelineView.reveal(playhead());
}

function jumpTo(target: (project: Project, frame: Frame) => Frame | null): ActionRun {
  return () => {
    const frame = target(documentStore.getState(), playhead());
    if (frame !== null) movePlayhead(frame);
  };
}

function inOut(): (Frame | null)[] {
  const { inPoint, outPoint } = sessionStore.state.getState();
  return [inPoint, outPoint];
}

/**
 * Zoom to selection (spec §6.2, `Shift+\`): the selected clips (a track selection: the clips on those
 * tracks), else the selected gap, else the clips of the selected edit point, framed with a 10% margin.
 * Nothing selected: nothing happens.
 */
const zoomToSelection: ActionRun = () => {
  const span = selectionSpan(documentStore.getState(), sessionStore.selection.getState(), sessionStore.gap.getState(), sessionStore.editPoint.getState());
  if (span) timelineView.zoomToFrames(span.start, span.end);
};

/** Registers the timeline actions. Returns a stop function. */
export function installTimelineController(): () => void {
  const stops = [
    actions.register("timeline.zoomIn", () => timelineView.zoomBy(ZOOM_IN_STEP)),
    actions.register("timeline.zoomOut", () => timelineView.zoomBy(ZOOM_OUT_STEP)),
    actions.register("timeline.zoomFit", () => timelineView.fit()),
    actions.register("timeline.zoomToSelection", zoomToSelection),
    // The preview's format toggle (spec §5.1); the timeline field, the durations and the ruler follow.
    actions.register("view.toggleTimecodeFormat", () =>
      sessionStore.state.set((state) => ({ ...state, timecodeFormat: state.timecodeFormat === "frames" ? "ms" : "frames" })),
    ),
    actions.register("timeline.centerPlayhead", () => timelineView.centerPlayhead()),
    actions.register("timeline.prevEditPoint", jumpTo((project, frame) => prevEditPoint(navigationPoints(project, inOut()), frame))),
    actions.register("timeline.nextEditPoint", jumpTo((project, frame) => nextEditPoint(navigationPoints(project, inOut()), frame))),
    actions.register("timeline.prevMarker", jumpTo((project, frame) => prevEditPoint(markerFrames(project), frame))),
    actions.register("timeline.nextMarker", jumpTo((project, frame) => nextEditPoint(markerFrames(project), frame))),
    // Shift+I / Shift+O (spec §6.13): the in point, the last frame of the range.
    actions.register("range.goToIn", jumpTo(() => sessionStore.state.getState().inPoint)),
    actions.register(
      "range.goToOut",
      jumpTo(() => {
        const { outPoint } = sessionStore.state.getState();
        return outPoint !== null ? lastFrameOf(outPoint) : null;
      }),
    ),
    actions.register("selection.selectAll", () => {
      const { primary } = selectedClips();
      setSelection(sessionStore, selectClips(selectableClipIds(documentStore.getState()), primary));
    }),
    actions.register("selection.deselect", () => {
      setSelection(sessionStore, EMPTY_SELECTION);
      selectEditPoint(sessionStore, null);
      selectGap(sessionStore, null);
    }),
    actions.register("edit.nudgeLeft", nudge(-1)),
    actions.register("edit.nudgeRight", nudge(1)),
    actions.register("edit.nudgeLeft5", nudge(-5)),
    actions.register("edit.nudgeRight5", nudge(5)),
    actions.register("edit.moveToTrackAbove", moveToTrack("up")),
    actions.register("edit.moveToTrackBelow", moveToTrack("down")),
    actions.register("edit.rippleTrimPrev", rippleTrimToPlayhead("start")),
    actions.register("edit.rippleTrimNext", rippleTrimToPlayhead("end")),
    actions.register("edit.extendToPlayhead", extendEdit),
    actions.register("toggle.snap", toggleSnap),
    // The Razor tool (C) is registered by cutController.
    actions.register("tool.select", selectTool("select")),
    actions.register("tool.hand", selectTool("hand")),
    actions.register("tool.slip", selectTool("slip")),
    actions.register("tool.slide", selectTool("slide")),
    actions.register("tool.rateStretch", selectTool("rateStretch")),
    // Ripple mode (spec §6.10): edge drags ripple without Mod. Session state, not undoable.
    actions.register("toggle.rippleMode", () => sessionStore.state.set((state) => ({ ...state, ripple: !state.ripple }))),
    // Esc (app.cancel) is registered by canvasController: it cancels a timeline or canvas gesture.
  ];
  if (import.meta.env.DEV) {
    const generate = (clips?: number, tracks?: number) => generateTestClips(documentStore, { ...(clips !== undefined && { clips }), ...(tracks !== undefined && { tracks }) });
    stops.push(actions.register("dev.generateTimeline", () => generate()));
    // Console access for the acceptance checks, e.g. `__editor.timeline.generate(500, 8)`.
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    // `__editor.timeline.cuts(60, 1)`: 60 one-second clips on V1 cycling through the project's videos (playback checks).
    const cuts = (clips?: number, seconds?: number) => generateCutTimeline(documentStore, { ...(clips !== undefined && { clips }), ...(seconds !== undefined && { seconds }) });
    editor.timeline = { view: timelineView, generate, cuts, insert: insertMediaAtPlayhead };
    // Raw clip edits for the compositor checks, e.g. `__editor.clips.update(id, { opacity: 0.5 })`.
    editor.clips = {
      list: () => Object.values(documentStore.getState().clips),
      update: (clipId: string, patch: ClipPatch) => documentStore.dispatch(updateClip(clipId, patch)),
    };
    // Raw track flags for the acceptance checks, e.g. `__editor.tracks.update("V2", { locked: true })`.
    editor.tracks = {
      list: () => documentStore.getState().tracks.map(({ id, name, kind, locked }) => ({ id, name, kind, locked })),
      update: (nameOrId: string, patch: TrackPatch) => {
        const track = documentStore.getState().tracks.find((candidate) => candidate.id === nameOrId || candidate.name === nameOrId);
        if (track) documentStore.dispatch(updateTrack(track.id, patch));
      },
    };
  }
  return () => {
    for (const stop of stops) stop();
  };
}
