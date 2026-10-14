// Timeline wiring (spec §6): the timeline view, the zoom and playhead actions (§6.2, §6.5), the
// toolbar's direct-DOM bindings (zoom slider, timecode field, duration: no React render while they
// change, P1), insert at the playhead from the media panel (§6.14) and the dev clip generator.
import { addTrack } from "../core/commands/basicCommands.js";
import type { ActionRun } from "../core/commands/ActionRegistry.js";
import { emptyTrack, nextTrackName } from "../core/document/project.js";
import { formatTimecode, parseTimecode, secondsToFrames } from "../core/document/time.js";
import type { Frame, MediaId, Project, TrackKind } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { setPlayhead } from "../core/store/sessionStore.js";
import { insertCommands, planMediaInsert } from "../timeline/edit/insertMedia.js";
import { contentEnd, markerFrames, navigationPoints, nextEditPoint, prevEditPoint } from "../timeline/model/queries.js";
import { TimelineView } from "../timeline/view/TimelineView.js";
import { pxToSlider, sliderToPx, zoomLimits, ZOOM_IN_STEP, ZOOM_OUT_STEP, type ZoomContext } from "../timeline/view/zoom.js";
import { showToast } from "../ui/toasts.js";
import { generateTestClips } from "./timelineDev.js";
import { actions, documentStore, layoutStore, scheduler, sessionStore, themeBridge } from "./services.js";

/** Hold-to-repeat for the frame-stepping keys (the dispatcher suppresses OS repeats, spec §3.6). */
const STEP_REPEAT_DELAY_MS = 300;
const STEP_REPEAT_MS = 33;
/** Zoom slider resolution (positions per full range). */
const SLIDER_STEPS = 1000;

function addTrackOfKind(kind: TrackKind): void {
  const { tracks } = documentStore.getState();
  documentStore.dispatch(addTrack(emptyTrack(crypto.randomUUID(), kind, nextTrackName(tracks, kind))));
}

export const timelineView = new TimelineView({
  scheduler,
  document: documentStore,
  session: sessionStore,
  layout: layoutStore,
  theme: themeBridge,
  onAddTrack: addTrackOfKind,
});

/** Dev chrome of the timeline (not persisted). */
export const timelineDev = createStore<{ stats: boolean }>({ stats: false });

const playhead = () => sessionStore.state.getState().playhead;

/**
 * Double-click on a media item (spec §6.14): its clip(s) at the playhead on the first targeted
 * tracks (created when missing), then the playhead moves to the clip end. One undo step.
 */
export function insertMediaAtPlayhead(mediaId: MediaId): void {
  const project = documentStore.getState();
  const media = project.media[mediaId];
  if (!media) return;
  const plan = planMediaInsert(project, media, playhead(), () => crypto.randomUUID());
  if (!plan) {
    showToast({ tone: "error", message: `Can't insert ${media.name}`, detail: "It has no duration." });
    return;
  }
  documentStore.transaction("Insert clip", () => {
    for (const command of insertCommands(plan)) documentStore.dispatch(command);
  });
  setPlayhead(sessionStore, plan.end);
}

/** Zoom limits from the stores (the view need not be mounted): track area width, content end, fps. */
function zoomContext(project: Project = documentStore.getState()): ZoomContext {
  const width = Math.max(0, layoutStore.getState().panels.timeline.width - themeBridge.theme.timeline.headerWidth);
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

/**
 * The toolbar timecode field and total duration (spec §6.1, §6.5). The field shows the playhead
 * (direct DOM writes, skipped while it is being edited); Enter jumps to the typed timecode, including
 * the relative forms `+30`, `-15`, `+2.`; Escape cancels.
 * TODO(batch 18): the mm:ss.mmm format toggle shared with the preview, validation feedback.
 */
export function bindTimecode(input: HTMLInputElement, duration: HTMLElement): () => void {
  const fps = () => documentStore.getState().settings.fps;
  const show = () => {
    if (input.ownerDocument.activeElement !== input) input.value = formatTimecode(playhead(), fps());
  };
  const showDuration = () => {
    duration.textContent = formatTimecode(contentEnd(documentStore.getState()), fps());
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      const frame = parseTimecode(input.value, fps(), { current: playhead() });
      if (frame !== null) setPlayhead(sessionStore, frame);
      input.blur();
    } else if (event.key === "Escape") {
      input.blur();
    }
  };
  const onFocus = () => input.select();
  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", show);
  const stops = [
    sessionStore.state.select((state) => state.playhead, show),
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
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("blur", show);
    for (const stop of stops) stop();
  };
}

/** A frame-stepping action: steps once on key down (or click), then repeats while the key is held. */
function steppingAction(frames: () => Frame): ActionRun {
  let delay: ReturnType<typeof setTimeout> | null = null;
  let repeat: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (delay !== null) clearTimeout(delay);
    if (repeat !== null) clearInterval(repeat);
    delay = null;
    repeat = null;
  };
  const step = () => setPlayhead(sessionStore, playhead() + frames());
  return (context) => {
    if (context?.phase === "up") {
      stop();
      return;
    }
    stop();
    step();
    if (context?.phase === "down") {
      delay = setTimeout(() => {
        repeat = setInterval(step, STEP_REPEAT_MS);
      }, STEP_REPEAT_DELAY_MS);
    }
  };
}

function jumpTo(target: (project: Project, frame: Frame) => Frame | null): ActionRun {
  return () => {
    const frame = target(documentStore.getState(), playhead());
    if (frame !== null) setPlayhead(sessionStore, frame);
  };
}

function inOut(): (Frame | null)[] {
  const { inPoint, outPoint } = sessionStore.state.getState();
  return [inPoint, outPoint];
}

/** Registers the timeline actions. Returns a stop function. */
export function installTimelineController(): () => void {
  const second = () => secondsToFrames(1, documentStore.getState().settings.fps);
  const stops = [
    actions.register("timeline.zoomIn", () => timelineView.zoomBy(ZOOM_IN_STEP)),
    actions.register("timeline.zoomOut", () => timelineView.zoomBy(ZOOM_OUT_STEP)),
    actions.register("timeline.zoomFit", () => timelineView.fit()),
    actions.register("transport.stepBack", steppingAction(() => -1)),
    actions.register("transport.stepForward", steppingAction(() => 1)),
    actions.register("transport.stepBack5", steppingAction(() => -5)),
    actions.register("transport.stepForward5", steppingAction(() => 5)),
    actions.register("transport.stepBack1s", steppingAction(() => -second())),
    actions.register("transport.stepForward1s", steppingAction(() => second())),
    actions.register("transport.goToStart", () => setPlayhead(sessionStore, 0)),
    actions.register("transport.goToEnd", jumpTo((project) => contentEnd(project))),
    actions.register("timeline.prevEditPoint", jumpTo((project, frame) => prevEditPoint(navigationPoints(project, inOut()), frame))),
    actions.register("timeline.nextEditPoint", jumpTo((project, frame) => nextEditPoint(navigationPoints(project, inOut()), frame))),
    actions.register("timeline.prevMarker", jumpTo((project, frame) => prevEditPoint(markerFrames(project), frame))),
    actions.register("timeline.nextMarker", jumpTo((project, frame) => nextEditPoint(markerFrames(project), frame))),
  ];
  if (import.meta.env.DEV) {
    const generate = (clips?: number, tracks?: number) => generateTestClips(documentStore, { ...(clips !== undefined && { clips }), ...(tracks !== undefined && { tracks }) });
    stops.push(actions.register("dev.generateTimeline", () => generate()));
    // Console access for the acceptance checks, e.g. `__editor.timeline.generate(500, 8)`.
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.timeline = { view: timelineView, generate, insert: insertMediaAtPlayhead };
  }
  return () => {
    for (const stop of stops) stop();
  };
}
