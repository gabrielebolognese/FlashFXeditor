// Transport wiring (spec §8, §6.2, §6.5, §7.8, §13): the transport actions (Space, J/K/L, K+J/K+L,
// Shift+K, arrows, Home/End, loop, play in to out), follow playhead during playback, the reveal of the playhead after
// keyboard moves, and the preview status strip (dropped frames of the last playback, texture pool
// usage). Framework-free: React reads only the play/pause state (`playbackEngine.subscribe`).
import type { ActionRun } from "../core/commands/ActionRegistry.js";
import { secondsToFrames } from "../core/document/time.js";
import type { Frame } from "../core/document/types.js";
import type { RenderView } from "../core/scheduler/FrameScheduler.js";
import { contentEnd } from "../timeline/model/queries.js";
import { playbackEngine, previewDev, texturePool } from "./previewController.js";
import { actions, documentStore, scheduler, sessionStore } from "./services.js";
import { movePlayhead, timelineView } from "./timelineController.js";

/** Hold-to-repeat for the frame-stepping keys (the dispatcher suppresses OS repeats, spec §3.6). */
const STEP_REPEAT_DELAY_MS = 300;
const STEP_REPEAT_MS = 33;

const MB = 1024 * 1024;

const playhead = () => sessionStore.state.getState().playhead;

/** A frame-stepping action: pauses, steps once on key down (or click), then repeats while the key is held. */
function steppingAction(frames: () => Frame): ActionRun {
  let delay: ReturnType<typeof setTimeout> | null = null;
  let repeat: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (delay !== null) clearTimeout(delay);
    if (repeat !== null) clearInterval(repeat);
    delay = null;
    repeat = null;
  };
  const step = () => {
    playbackEngine.step(frames());
    timelineView.reveal(playhead());
  };
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

/** J and L (held keys: only the press counts, spec §8 "pressing L repeatedly"). */
function shuttleAction(direction: 1 | -1): ActionRun {
  return (context) => {
    if (context?.phase !== "up") playbackEngine.shuttle(direction);
  };
}

function toggleLoop(): void {
  sessionStore.state.set((state) => ({ ...state, loop: !state.loop }));
}

/** Follow playhead (spec §6.2): pages the view while playing; every play turns following back on. */
function followPlayhead(): () => void {
  let wasPlaying = false;
  const stops = [
    playbackEngine.subscribe(() => {
      if (playbackEngine.playing && !wasPlaying) timelineView.resumeFollowing();
      wasPlaying = playbackEngine.playing;
      // While playing, Space pauses at once and never arms the timeline's Space+drag pan.
      timelineView.playing = playbackEngine.playing;
    }),
    sessionStore.state.select(
      (state) => state.playhead,
      (frame) => {
        if (playbackEngine.playing) timelineView.follow(frame);
      },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}

/**
 * The preview status strip (spec §13): dropped frames of the last playback (reset on play), and the
 * texture pool usage while the dev GPU stats are on. Written in the scheduler loop at most once per
 * frame, never by React.
 */
export function bindPlaybackStatus(dropped: HTMLElement, pool: HTMLElement): () => void {
  const write = (element: HTMLElement, text: string) => {
    if (element.textContent !== text) element.textContent = text;
  };
  const view: RenderView = {
    render: () => {
      write(dropped, `Dropped ${playbackEngine.stats.dropped}`);
      const show = previewDev.getState().stats;
      pool.hidden = !show;
      if (show) {
        const { bytes, budget } = texturePool.stats;
        write(pool, `Pool ${(bytes / MB).toFixed(0)} / ${(budget / MB).toFixed(0)} MB`);
      }
    },
  };
  const invalidate = () => scheduler.invalidate("previewOverlay");
  const stops = [
    scheduler.register("previewOverlay", view),
    playbackEngine.subscribe(invalidate),
    texturePool.subscribe(invalidate),
    previewDev.select((state) => state.stats, invalidate),
  ];
  view.render(0);
  return () => {
    for (const stop of stops) stop();
  };
}

/** Registers the transport actions and follow playhead. Returns a stop function. */
export function installPlaybackController(): () => void {
  const second = () => secondsToFrames(1, documentStore.getState().settings.fps);
  const stops = [
    actions.register("transport.playPause", () => playbackEngine.toggle()),
    actions.register("transport.shuttleBack", shuttleAction(-1)),
    actions.register("transport.shuttleForward", shuttleAction(1)),
    actions.register("transport.shuttleStop", (context) => {
      // K held: J and L step one frame (spec §8). A click just pauses.
      if (context) playbackEngine.holdStop(context.phase === "down");
      else playbackEngine.pause();
    }),
    actions.register("transport.playAround", () => playbackEngine.playAround()),
    actions.register("transport.toggleLoop", toggleLoop),
    // Mod+Shift+Space and the preview's Play in/out (spec §8): the in/out range, looping while loop is on.
    actions.register("transport.playInToOut", () => playbackEngine.playInToOut()),
    actions.register("transport.stepBack", steppingAction(() => -1)),
    actions.register("transport.stepForward", steppingAction(() => 1)),
    actions.register("transport.stepBack5", steppingAction(() => -5)),
    actions.register("transport.stepForward5", steppingAction(() => 5)),
    actions.register("transport.stepBack1s", steppingAction(() => -second())),
    actions.register("transport.stepForward1s", steppingAction(() => second())),
    // While playing, the engine plays on from where these put the playhead.
    actions.register("transport.goToStart", () => movePlayhead(0)),
    actions.register("transport.goToEnd", () => movePlayhead(contentEnd(documentStore.getState()))),
    followPlayhead(),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
