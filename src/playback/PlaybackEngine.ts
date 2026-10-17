// The playback engine (spec §8, P1, P6, P7, P13). Framework-free: it moves the session playhead
// against the master clock from the FrameScheduler's tick, keeps the decoders fed ahead of it, and
// counts dropped frames. React only reads `playing` through `subscribe`.
// - Clock: `playheadFrame = startFrame + floor((clock - startClock) * speed * fps)`; the clock is the
//   AudioContext's (`AudioClock`), even for silent projects. Starting from pause waits up to
//   PREROLL_SECONDS for the windows of the clips under the playhead to fill, so their decoders then
//   run at the pace frames are used: filling a window as fast as the hardware decodes while the
//   clock runs starves the GPU process at the start (4K60 HEVC on the development machine: 14-34
//   frames dropped in the first 60 with a 3-frame preroll, 7-9 with a full window, ~25 ms later).
//   The start is taken half a display frame early (at most half a timeline frame): anchored on a
//   vsync, every frame boundary would fall on a vsync too, and the slightest jitter would show a
//   frame twice, then skip one.
// - Each new frame is one session write: the timeline overlay, the preview (which evaluates the
//   composite with `playback` priority: what is not decoded yet holds the track's previous frame) and
//   the timecode readouts follow it. Playback never changes the document.
// - Prefetch windows: every video clip under the playhead keeps up to TARGET_READY frames of its
//   media decoded ahead (PREFETCH_SECONDS at most), at `playback` priority. Forward, a window is a
//   chunk of CHUNK_DECODES decoded frames and the next one is asked for as soon as it completes (not
//   at the next animation frame), so the decoder keeps the pace frames are used at in short bursts:
//   decoding a whole window as fast as the hardware can starves Chrome's GPU process, which also
//   composites the page (4K60 HEVC on the development machine: 15-frame windows dropped 12-35% of the
//   frames, 2-frame chunks 1.3-4.5%). Shuttle speeds deliver only the frames the screen can show
//   (`stride`). Backward windows end at the playhead and hold up to TARGET_READY frames, requested
//   when fewer than half are left: the worker decodes each one from the keyframe before it (reverse
//   GOP decoding), so going backward costs more decode but never blocks the main thread. Received
//   frames stay pinned in the pool until the playhead passes them.
// - Lookahead (P7): every SCAN_INTERVAL_SECONDS the clips starting within LOOKAHEAD_SECONDS get their
//   first window at `idle` priority, so their decoder has sought to the keyframe before the in point
//   and the first frame is in the pool at the cut. Decoders idle for 10 s are closed by decode.worker
//   (`DecodeSessions` IDLE_MS), so media not needed any more are released without a message.
// - Dropped frames (1x only; shuttle speeds skip frames by design): frames the clock skipped, and
//   frames whose first preview render lacked the exact frame of a layer. A clip whose frame is late on
//   more than BEHIND_FRAMES consecutive frames flags its media (`autoProxy`, `onBehind`).
// - Proxies (spec §7.5, §8, §9.5): each clip's windows come from the lod the quality mode wants while
//   playing (detail.ts `wantedLod`: Auto and Proxy play proxies, 1/2 and 1/4 switch a flagged media
//   to its proxy for the rest of the playback), routed by the frame service (only media with a ready
//   proxy get it). A lod change starts the clip's windows over on the other file.
// - Transport: play/pause/toggle, the J/L ladder (`shuttleSpeed`), K held (pause; J and L step), play
//   around, play in to out, steps, the end of the content (stop on the last frame, or wrap when loop is
//   on), and playhead moves by others (Home, End, the timecode field: play on from there). A ruler
//   scrub pauses. Loop (spec §6.13) wraps the in/out range when one is set (`markedRange`), else the
//   whole timeline; a play that starts outside the loop range starts at its first frame (or, backward,
//   its last). Play in to out (§8) plays the range once, stopping on its last frame, or loops it while
//   loop is on. Every wrap is frame-exact: the last frame shown is the one before the out point, the
//   next one the in point.
// - Transitions (Batch 36): over a transition's frames both of its clips are under the playhead (the
//   incoming one before its start, the outgoing one past its end, each in its handle); their windows
//   and the lookahead cover the frames each clip shows (`extendedStart` / `extendedEnd`).
// - Audio (spec §8, §14): the engine owns the audio scheduler. The preroll also waits for the decoded
//   audio of the clips under the playhead; the clock starts (and re-anchors after a seek) `lead`
//   seconds ahead, the time the render clock runs ahead of what is heard, so the first samples are
//   not cut; every tick hands the scheduler the anchor, and a pause stops it. A loop wraps at its
//   exact time (not at the tick that sees it), so audio scheduled across the wrap stays in sync.
import type { PlaybackClock } from "../audio/AudioClock.js";
import type { PlayMapping } from "../audio/scheduler/AudioScheduler.js";
import { fpsToNumber, playedFrames, secondsToFrames, usPerFrame } from "../core/document/time.js";
import { isMediaClip, type Clip, type ClipId, type Frame, type MediaClip, type MediaId, type Project, type Rational } from "../core/document/types.js";
import type { FrameScheduler } from "../core/scheduler/FrameScheduler.js";
import type { IdleQueue } from "../core/scheduler/IdleQueue.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import { setPlayhead, type SessionStore } from "../core/store/sessionStore.js";
import type { PreviewQuality } from "../core/store/sessionStore.js";
import type { Lod, TextureKey, TexturePool } from "../media/cache/TexturePool.js";
import type { FrameResult, FrameService } from "../media/decode/FrameService.js";
import type { ImageService } from "../media/decode/ImageService.js";
import { nearestPosition } from "../media/demux/sampleIndex.js";
import { isAbortError } from "../media/workers/protocol.js";
import { sourceTimeUs } from "../render/compositor/Compositor.js";
import { extendedEnd, extendedStart, handleTimeUs } from "../core/document/transitions.js";
import { wantedLod } from "../render/preview/detail.js";
import { markedRange } from "../timeline/model/inOut.js";
import { clipInIndex, contentEnd, lastClipStartingBy, trackIndex, type TrackIndex } from "../timeline/model/queries.js";
import { shuttleSpeed } from "./transport.js";

/** How far ahead of the playhead each clip's media is decoded (spec §8). */
export const PREFETCH_SECONDS = 0.5;
/** Frames kept decoded ahead at most (spec §8 "target 15 frames ready"). */
export const TARGET_READY = 15;
/** Decoded frames per forward window: one short burst of the hardware decoder. */
export const CHUNK_DECODES = 2;
/** Frames a clip starting soon gets decoded before its cut (P7). */
export const WARM_FRAMES = 4;
/** Clips starting this soon get their decoder warmed (P7). */
export const LOOKAHEAD_SECONDS = 2;
export const SCAN_INTERVAL_SECONDS = 0.25;
/** Shift+K plays from this long before the playhead to this long after it. */
export const PLAY_AROUND_SECONDS = 2;
/** A clip whose frame is late on more frames than this in a row falls behind (Auto quality: proxy). */
export const BEHIND_FRAMES = 2;
/** Starting from pause waits at most this long for the windows of the clips under the playhead before the clock runs. */
export const PREROLL_SECONDS = 0.5;
/** Frames the screen shows per second at most: shuttle speeds deliver no more than this. */
const DISPLAY_HZ = 60;
/** The clock start is moved this much earlier: frame boundaries fall between vsyncs (see the header). */
const PHASE_SECONDS = 0.5 / DISPLAY_HZ;

/** What the preview's first render of a playhead frame drew (`PreviewView.firstShown`). */
export interface ShownFrame {
  readonly frame: Frame;
  /** Media layers, and those drawn with their exact frame. */
  readonly layers: number;
  readonly exact: number;
}

export interface PlaybackStats {
  /** Frames of the current (or last) playback dropped at 1x; reset on play. */
  dropped: number;
  /** Frames advanced at 1x in the current (or last) playback: the base of the drop rate. */
  frames: number;
  /** Prefetch windows requested and frames they delivered. */
  windows: number;
  received: number;
}

/** The audio scheduler, as the engine drives it (audio/scheduler/AudioScheduler.ts). */
export interface PlaybackAudio {
  /** Seconds to start the clock ahead of now so the first samples are heard on time (0 when silent). */
  lead(): number;
  /** True when the audio under `frame` is decoded; asks for what is missing. */
  prepare(project: Project, frame: Frame): boolean;
  /** Loads the audio of clips playing soon. */
  prefetch(project: Project, frame: Frame): void;
  /** Follows the anchor and schedules what comes next. */
  sync(mapping: PlayMapping): void;
  stop(): void;
}

export interface PlaybackEngineDeps {
  scheduler: Pick<FrameScheduler, "addTicker">;
  clock: PlaybackClock;
  document: Pick<DocumentStore, "getState">;
  session: SessionStore;
  frames: Pick<FrameService, "info" | "video" | "frameKeyInto" | "prefetch" | "lodFor">;
  images: Pick<ImageService, "get" | "load">;
  pool: Pick<TexturePool, "has" | "pin">;
  preview: { readonly firstShown: ShownFrame };
  /** True while the playhead is dragged on the ruler or a clip edge is trimmed: playback pauses. */
  scrubbing(): boolean;
  /** Background work pauses while playing (spec §3.4). */
  idle: Pick<IdleQueue, "pause" | "resume">;
  audio?: PlaybackAudio;
  /** The preview's quality mode (which lod plays); full frames when absent. */
  quality?(): PreviewQuality;
  /** Playback fell behind on a media (Auto quality: a proxy is worth making). */
  onBehind?(mediaId: MediaId): void;
}

/**
 * A range played on its own: play around (from `from` up to, not including, `to`, then back to
 * `returnTo`) or play in to out (`loops`: wraps from `to` to `from` while the loop toggle is on, else
 * stops on the range's last frame).
 */
interface PlayRange {
  from: Frame;
  to: Frame;
  returnTo: Frame | null;
  loops: boolean;
}

/** The frames the playhead runs through: [start, end), wrapping at the ends when `loop`. */
interface Bounds {
  start: Frame;
  end: Frame;
  loop: boolean;
}

/** The prefetch windows of one clip (under the playhead, or starting soon). */
interface Stream {
  /** The clip as it was; an edit (a new object) starts the stream over. */
  clip: MediaClip;
  /** Its media's duration: a transition plays the clip past its edges, up to the media's. */
  durationUs: number;
  /** The file its frames come from; a change starts the stream over. */
  lod: Lod;
  /** Media frame duration (us) and frame times of the open video. */
  frameUs: number;
  times: Float64Array;
  /** Furthest display position requested in the play direction; null before the first window. */
  requested: number | null;
  /** The window in flight. */
  inFlight: AbortController | null;
  /** Window failed (not cancelled): no more requests for this clip. */
  failed: boolean;
  /** Received frames pinned in the pool, by display position. */
  pins: Map<number, () => void>;
  /** New frames in a row whose frame was not ready. */
  late: number;
  /** The last feed that found the clip under the playhead, and the last scan that found it ahead. */
  pass: number;
  scan: number;
}

export class PlaybackEngine {
  readonly stats: PlaybackStats = { dropped: 0, frames: 0, windows: 0, received: 0 };
  /** Media whose decoding fell behind in this playback (1/2 and 1/4 play their proxy for the rest of it). */
  readonly autoProxy = new Set<MediaId>();

  /** Signed speed; 0 = paused. */
  private velocity = 0;
  private anchorFrame: Frame = 0;
  private anchorTime = 0;
  /** The playhead as last written by the engine. */
  private written: Frame = 0;
  private range: PlayRange | null = null;
  private stopHeld = false;
  private stopTicker: (() => void) | null = null;
  /** Clock time the preroll ends at the latest; null once the clock runs. */
  private prerollUntil: number | null = null;
  private lastScan = -Infinity;
  private pass = 0;
  private scanId = 0;
  /** A frame written at 1x whose first render is not checked yet. */
  private pending: Frame | null = null;
  /** True when a clip under the playhead has no stream yet (its video is opening). */
  private waiting = false;
  private readonly streams = new Map<ClipId, Stream>();
  /** Videos opening, as `mediaId|lod`. */
  private readonly opening = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly key: TextureKey = { mediaId: "", lod: "full", timeUs: 0 };
  /** Handed to the audio scheduler every tick (it copies what changed). */
  private readonly mapping: PlayMapping = { frame: 0, clock: 0, speed: 0, start: 0, end: 0, loop: false, fps: { num: 30, den: 1 } };

  constructor(private readonly deps: PlaybackEngineDeps) {}

  get playing(): boolean {
    return this.velocity !== 0;
  }

  /** Signed speed (1, 2, 4, 8, or negative backward); 0 when paused. */
  get speed(): number {
    return this.velocity;
  }

  /** Play/pause changes and dropped-frame counts. React reads only `playing`. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Space. */
  toggle(): void {
    if (this.playing) this.pause();
    else this.play(1);
  }

  /**
   * Plays at a signed speed from the playhead: from the start when it is at the end; with loop on,
   * from the loop range's first frame (backward: its last) when it is outside the range.
   */
  play(speed = 1): void {
    if (speed === 0) {
      this.pause();
      return;
    }
    if (contentEnd(this.doc()) <= 0) return;
    if (this.playing) {
      this.start(speed, this.written, null);
      return;
    }
    const { start, end, loop } = this.bounds(this.doc());
    if (end <= start) return;
    const playhead = this.playhead();
    let from = playhead;
    if (speed > 0) {
      if (playhead >= end - 1 || (loop && playhead < start)) from = start;
    } else if (playhead <= start) {
      if (!loop) return;
      from = end - 1;
    } else if (playhead > end - 1) {
      from = end - 1;
    }
    this.start(speed, from, null);
  }

  /**
   * `Mod+Shift+Space`, the preview's Play in/out (spec §8): from the in point (0 when none) to the out
   * point (the content end when none); it stops on the range's last frame, or loops it while loop is on.
   */
  playInToOut(): void {
    const end = contentEnd(this.doc());
    const span = markedRange(this.deps.session.state.getState(), end) ?? { start: 0, end };
    if (span.end <= span.start) return;
    this.start(1, span.start, { from: span.start, to: span.end, returnTo: null, loops: true });
  }

  /** J (-1) and L (+1): the speed ladder; while K is held, one frame step instead. */
  shuttle(direction: 1 | -1): void {
    if (this.stopHeld) {
      this.step(direction);
      return;
    }
    this.play(shuttleSpeed(this.velocity, direction));
  }

  /** K pressed (pauses at once) and released. */
  holdStop(held: boolean): void {
    this.stopHeld = held;
    if (held) this.pause();
  }

  /** Shift+K: from PLAY_AROUND_SECONDS before the playhead to as long after it, then back. */
  playAround(): void {
    const doc = this.doc();
    const playhead = this.playhead();
    const reach = secondsToFrames(PLAY_AROUND_SECONDS, doc.settings.fps);
    const from = Math.max(0, playhead - reach);
    const to = Math.min(playhead + reach, contentEnd(doc));
    if (to <= from) return;
    this.start(1, from, { from, to, returnTo: playhead, loops: false });
  }

  /**
   * Plays [`from`, `to`) once, then puts the playhead back at `returnTo` (a text animation's preview,
   * spec §10.4). Clamped to the content.
   */
  playRange(from: Frame, to: Frame, returnTo: Frame): void {
    const start = Math.max(0, from);
    const end = Math.min(to, contentEnd(this.doc()));
    if (end <= start) return;
    this.start(1, start, { from: start, to: end, returnTo, loops: false });
  }

  /** Arrows, K+J / K+L: pause and move the playhead by `frames`. */
  step(frames: Frame): void {
    this.pause();
    setPlayhead(this.deps.session, this.playhead() + frames);
  }

  pause(): void {
    if (!this.playing) return;
    this.checkShown();
    this.velocity = 0;
    this.range = null;
    this.prerollUntil = null;
    this.pending = null;
    this.stopTicker?.();
    this.stopTicker = null;
    for (const stream of [...this.streams.values()]) this.release(stream);
    this.deps.audio?.stop();
    this.deps.idle.resume("playback");
    this.notify();
  }

  dispose(): void {
    this.pause();
    this.listeners.clear();
  }

  // --- Clock ----------------------------------------------------------------------------------

  private start(speed: number, from: Frame, range: PlayRange | null): void {
    const wasPlaying = this.playing;
    if (wasPlaying && Math.sign(speed) !== Math.sign(this.velocity)) {
      // Windows run in one direction.
      for (const stream of [...this.streams.values()]) this.release(stream);
    }
    this.velocity = speed;
    this.range = range;
    if (!wasPlaying) {
      this.stats.dropped = 0;
      this.stats.frames = 0;
      this.autoProxy.clear();
      this.deps.idle.pause("playback");
      this.stopTicker = this.deps.scheduler.addTicker(this.tick);
    }
    this.write(from, false);
    const now = this.deps.clock.now();
    this.anchorAt(from, wasPlaying ? now + this.audioLead() : now);
    this.prerollUntil = wasPlaying ? null : now + PREROLL_SECONDS;
    this.lastScan = -Infinity;
    this.notify();
  }

  private readonly tick = (): void => {
    if (!this.playing) return;
    if (this.deps.scrubbing()) {
      this.pause();
      return;
    }
    const doc = this.doc();
    const { playhead } = this.deps.session.state.getState();
    const now = this.deps.clock.now();
    if (playhead !== this.written) {
      // Moved by someone else (Home, End, the timecode field): play on from there.
      this.range = null;
      this.written = playhead;
      this.anchorAt(playhead, now + this.audioLead());
      this.pending = null;
    }
    this.checkShown();

    if (this.prerollUntil !== null) {
      this.feed(doc, this.written, false);
      this.scanIfDue(doc, this.written, now);
      this.releaseUnused();
      const audioReady = this.deps.audio?.prepare(doc, this.written) ?? true;
      if (now < this.prerollUntil && !(this.ready(doc, this.written) && audioReady)) return;
      this.prerollUntil = null;
      this.anchorAt(this.written, now + this.audioLead());
    }

    const direction = Math.sign(this.velocity);
    const speed = Math.abs(this.velocity);
    const counting = speed === 1;
    const fps = doc.settings.fps;
    const bounds = this.bounds(doc);
    const { start, end, loop } = bounds;
    let frame = this.anchorFrame + direction * playedFrames(now - this.anchorTime, speed, fps);
    let natural = true;
    if (direction > 0 && frame >= end) {
      const returnTo = this.range?.returnTo ?? null;
      if (returnTo !== null) {
        this.finish(returnTo);
        return;
      }
      if (!loop || end <= start) {
        this.write(Math.max(0, end - 1), false);
        this.pause();
        return;
      }
      // Wrap at the exact time the end frame would have started.
      this.anchorTime += (end - this.anchorFrame) / (fpsToNumber(fps) * speed);
      this.anchorFrame = start;
      frame = Math.min(end - 1, start + playedFrames(now - this.anchorTime, speed, fps));
      natural = false;
    } else if (direction < 0 && frame < start) {
      if (!loop || end <= start) {
        this.write(start, false);
        this.pause();
        return;
      }
      // The frame before the start would have started at this time: the last frame shows from then on.
      this.anchorTime += (this.anchorFrame - start + 1) / (fpsToNumber(fps) * speed);
      this.anchorFrame = end - 1;
      frame = Math.max(start, end - 1 - playedFrames(now - this.anchorTime, speed, fps));
      natural = false;
    }
    this.syncAudio(bounds, fps);
    const advanced = frame !== this.written;
    if (advanced) {
      if (counting && natural) {
        const steps = Math.abs(frame - this.written);
        this.stats.frames += steps;
        if (steps > 1) {
          this.stats.dropped += steps - 1;
          this.notify();
        }
      }
      this.write(frame, counting);
    }
    this.feed(doc, frame, advanced);
    this.scanIfDue(doc, frame, now);
    this.releaseUnused();
  };

  /** Clock lead for a start or a seek at 1x (audio only plays at 1x). */
  private audioLead(): number {
    return this.velocity === 1 ? (this.deps.audio?.lead() ?? 0) : 0;
  }

  private syncAudio(bounds: Bounds, fps: Rational): void {
    const audio = this.deps.audio;
    if (!audio) return;
    const mapping = this.mapping;
    mapping.frame = this.anchorFrame;
    mapping.clock = this.anchorTime;
    mapping.speed = this.velocity;
    mapping.start = bounds.start;
    mapping.end = bounds.end;
    mapping.loop = bounds.loop;
    mapping.fps = fps;
    audio.sync(mapping);
  }

  /**
   * What the playhead runs through: a range played on its own (looping only while loop is on and it
   * may); with loop on, the in/out range when one is set, else the whole timeline; else [0, content end).
   */
  private bounds(doc: Project): Bounds {
    const session = this.deps.session.state.getState();
    const range = this.range;
    if (range) return { start: range.from, end: range.to, loop: range.loops && session.loop };
    const end = contentEnd(doc);
    const marked = session.loop ? markedRange(session, end) : null;
    return marked ? { start: marked.start, end: marked.end, loop: true } : { start: 0, end, loop: session.loop };
  }

  /** Frame `frame` shows from clock time `now` on (see PHASE_SECONDS). */
  private anchorAt(frame: Frame, now: number): void {
    this.anchorFrame = frame;
    const framesPerSecond = fpsToNumber(this.doc().settings.fps) * Math.abs(this.velocity);
    this.anchorTime = now - Math.min(PHASE_SECONDS, 0.5 / framesPerSecond);
  }

  /** End of a play-around: stop and put the playhead back. */
  private finish(returnTo: Frame): void {
    this.pause();
    setPlayhead(this.deps.session, returnTo);
  }

  private write(frame: Frame, check: boolean): void {
    setPlayhead(this.deps.session, frame);
    this.written = this.playhead();
    this.pending = check ? this.written : null;
  }

  /** Counts the last 1x frame as dropped when its first render lacked an exact layer. */
  private checkShown(): void {
    const pending = this.pending;
    if (pending === null) return;
    const shown = this.deps.preview.firstShown;
    if (shown.frame !== pending) return;
    this.pending = null;
    if (shown.exact < shown.layers) {
      this.stats.dropped += 1;
      this.notify();
    }
  }

  // --- Frames ---------------------------------------------------------------------------------

  /** Keeps the windows of the clips under `frame` filled. `advanced`: a new frame (late frames count). */
  private feed(doc: Project, frame: Frame, advanced: boolean): void {
    this.pass += 1;
    this.waiting = false;
    for (const track of doc.tracks) {
      if (track.kind !== "video" || track.hidden) continue;
      const index = trackIndex(doc, track);
      const clip = clipInIndex(index, frame);
      if (!clip?.enabled) continue;
      this.feedClip(doc, clip, frame, advanced);
      // A transition's other clip plays too (Batch 36).
      const partner = transitionPartner(index, clip, frame);
      if (partner) this.feedClip(doc, partner, frame, advanced);
    }
  }

  private feedClip(doc: Project, clip: Clip, frame: Frame, advanced: boolean): void {
    if (!clip.enabled || clip.kind !== "video") return;
    const stream = this.stream(clip);
    if (!stream) {
      this.waiting = true;
      return;
    }
    stream.pass = this.pass;
    const need = this.position(stream, frame, doc.settings.fps);
    if (advanced && this.prerollUntil === null) this.checkLate(stream, need);
    this.fill(stream, doc, frame, need, "playback");
  }

  /** Every SCAN_INTERVAL_SECONDS: warms the clips starting within LOOKAHEAD_SECONDS (P7). */
  private scanIfDue(doc: Project, frame: Frame, now: number): void {
    if (now - this.lastScan < SCAN_INTERVAL_SECONDS) return;
    this.lastScan = now;
    this.scanId += 1;
    const reach = secondsToFrames(LOOKAHEAD_SECONDS, doc.settings.fps);
    const forward = this.velocity > 0;
    if (this.velocity === 1) this.deps.audio?.prefetch(doc, frame);
    const { start, end, loop } = this.bounds(doc);
    for (const track of doc.tracks) {
      if (track.kind !== "video" || track.hidden) continue;
      const index = trackIndex(doc, track);
      const at = lastClipStartingBy(index, frame);
      if (forward) {
        for (let i = at + 1; i < index.clips.length; i++) {
          const clip = index.clips[i] as Clip;
          if (clip.start > frame + reach || clip.start >= end) break;
          // From its first frame (under a transition in, before its start).
          this.warm(doc, clip, Math.max(frame, extendedStart(clip)));
        }
        // Loop: the start of the loop range comes next after its end.
        if (loop && end - frame <= reach) {
          const first = clipInIndex(index, start);
          if (first) this.warm(doc, first, start);
        }
      } else {
        for (let i = at; i >= 0; i--) {
          const clip = index.clips[i] as Clip;
          const last = extendedEnd(clip) - 1;
          if (last >= frame) continue;
          if (last < frame - reach) break;
          this.warm(doc, clip, last);
        }
        if (loop && frame - start <= reach) {
          const lastClip = clipInIndex(index, end - 1);
          if (lastClip) this.warm(doc, lastClip, end - 1);
        }
      }
    }
  }

  private warm(doc: Project, clip: Clip, cursor: Frame): void {
    if (!clip.enabled) return;
    if (clip.kind === "image") {
      if (!this.deps.images.get(clip.mediaId)) this.deps.images.load(clip.mediaId).catch(() => undefined);
      return;
    }
    if (clip.kind !== "video") return;
    const stream = this.stream(clip);
    if (!stream) return;
    stream.scan = this.scanId;
    // The first frames only; the rest follows once the clip is under the playhead.
    if (stream.requested === null) this.fill(stream, doc, cursor, this.position(stream, cursor, doc.settings.fps), "idle");
  }

  /** Tops up the windows of `stream` so TARGET_READY frames lie ahead of `need` (see the header). */
  private fill(stream: Stream, doc: Project, cursor: Frame, need: number, priority: "playback" | "idle"): void {
    const direction = this.velocity > 0 ? 1 : -1;
    const forward = direction > 0;
    this.unpinPassed(stream, need, direction);
    if (stream.failed || need < 0) return;
    const { clip } = stream;
    const fps = doc.settings.fps;
    const stride = strideFor(stream, Math.abs(this.velocity), fps);
    const last = extendedEnd(clip) - 1;
    const horizon = Math.min(last, Math.max(extendedStart(clip), cursor + direction * secondsToFrames(PREFETCH_SECONDS, fps)));
    let goal = this.position(stream, horizon, fps);
    goal = forward ? Math.min(goal, need + (TARGET_READY - 1) * stride) : Math.max(goal, need - (TARGET_READY - 1) * stride);
    const { requested } = stream;
    // Not started, or overtaken by the playhead (decoding fell behind): from the frame needed now.
    const overtaken = requested === null || (forward ? requested < need : requested > need);
    if (stream.inFlight && !overtaken) return;
    const ahead = overtaken ? 0 : Math.abs(requested - need) / stride;
    // Forward: kept topped up, chunk by chunk. Backward: a whole window once half of the last one is used.
    if (ahead >= (forward ? TARGET_READY - 1 : TARGET_READY / 2)) return;
    const from = overtaken ? need : requested + direction * stride;
    if (forward ? from > goal : from < goal) return;
    // Idle warming asks for its first WARM_FRAMES once.
    const chunk = priority === "idle" ? WARM_FRAMES : forward ? Math.max(1, Math.floor(CHUNK_DECODES / stride)) : TARGET_READY;
    const to = from + direction * Math.min(chunk - 1, Math.floor(Math.abs(goal - from) / stride)) * stride;
    stream.inFlight?.abort();
    stream.requested = to;
    this.request(stream, from, to, stride, priority);
  }

  private request(stream: Stream, from: number, to: number, stride: number, priority: "playback" | "idle"): void {
    const { times } = stream;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    const controller = new AbortController();
    stream.inFlight = controller;
    this.stats.windows += 1;
    this.deps.frames
      .prefetch(stream.clip.mediaId, times[lo] as number, times[hi] as number, {
        lod: stream.lod,
        priority,
        stride,
        signal: controller.signal,
        onFrame: (result) => {
          if (stream.inFlight === controller) this.received(stream, result);
        },
      })
      .then(
        () => {
          if (stream.inFlight !== controller) return;
          stream.inFlight = null;
          // The next chunk at once: the decoder keeps pace without waiting for the next animation frame.
          if (priority === "playback") this.topUp(stream);
        },
        (error: unknown) => {
          if (stream.inFlight !== controller) return;
          stream.inFlight = null;
          if (isAbortError(error)) return;
          stream.failed = true;
          console.warn(`[playback] no frames of ${stream.clip.mediaId}`, error);
        },
      );
  }

  /** Tops up a clip that was under the playhead at the last frame, between animation frames. */
  private topUp(stream: Stream): void {
    if (!this.playing || stream.pass !== this.pass || this.streams.get(stream.clip.id) !== stream) return;
    const { clip } = stream;
    const frame = this.written;
    if (frame < extendedStart(clip) || frame >= extendedEnd(clip)) return;
    const doc = this.doc();
    this.fill(stream, doc, frame, this.position(stream, frame, doc.settings.fps), "playback");
  }

  /** A window frame is in the pool: pin it until the playhead passes it (P6). */
  private received(stream: Stream, result: FrameResult): void {
    this.stats.received += 1;
    const position = nearestPosition(stream.times, result.key.timeUs);
    stream.pins.get(position)?.();
    stream.pins.set(position, this.deps.pool.pin(result.key));
  }

  private unpinPassed(stream: Stream, need: number, direction: number): void {
    if (need < 0) return;
    for (const [position, unpin] of stream.pins) {
      if (direction > 0 ? position >= need : position <= need) continue;
      unpin();
      stream.pins.delete(position);
    }
  }

  /** A clip whose frame is late on more than BEHIND_FRAMES new frames in a row falls behind. */
  private checkLate(stream: Stream, need: number): void {
    if (need < 0) return;
    if (this.hasFrame(stream, need)) {
      stream.late = 0;
      return;
    }
    stream.late += 1;
    const { mediaId } = stream.clip;
    if (stream.late > BEHIND_FRAMES && !this.autoProxy.has(mediaId)) {
      this.autoProxy.add(mediaId);
      console.info(`[playback] decoding of ${mediaId} (${stream.lod}) fell more than ${BEHIND_FRAMES} frames behind`);
      this.deps.onBehind?.(mediaId);
    }
  }

  /** True when every clip under the playhead has its window in the pool (the frames `fill` keeps ahead at 1x). */
  private ready(doc: Project, frame: Frame): boolean {
    if (this.waiting) return false;
    const fps = doc.settings.fps;
    const direction = this.velocity > 0 ? 1 : -1;
    const frames = Math.min(TARGET_READY, secondsToFrames(PREFETCH_SECONDS, fps) + 1);
    for (const stream of this.streams.values()) {
      if (stream.pass !== this.pass) continue;
      const { clip } = stream;
      for (let k = 0; k < frames; k++) {
        const at = frame + direction * k;
        if (at < extendedStart(clip) || at >= extendedEnd(clip)) break;
        if (!this.hasFrame(stream, this.position(stream, at, fps))) return false;
      }
    }
    return true;
  }

  private hasFrame(stream: Stream, position: number): boolean {
    const key = this.key;
    key.mediaId = stream.clip.mediaId;
    key.lod = stream.lod;
    key.timeUs = stream.times[position] as number;
    return this.deps.pool.has(key);
  }

  /** Display position of the media frame `clip` shows at timeline `frame`; -1 when the video is not open. */
  private position(stream: Stream, frame: Frame, fps: Rational): number {
    const { clip } = stream;
    // Outside its span (a transition): its media past its in or out point.
    const timeUs = frame >= clip.start && frame < clip.start + clip.duration ? sourceTimeUs(clip, frame, fps) : handleTimeUs(clip, frame, fps, stream.durationUs);
    return this.deps.frames.frameKeyInto(this.key, clip.mediaId, timeUs, stream.lod);
  }

  /** The lod a media plays from now. */
  private lodOf(mediaId: MediaId): Lod {
    const quality = this.deps.quality?.();
    if (!quality) return "full";
    const wanted = wantedLod(quality, "playing", this.autoProxy.has(mediaId));
    return wanted === "full" ? "full" : this.deps.frames.lodFor(mediaId, wanted);
  }

  private stream(clip: MediaClip): Stream | null {
    const { mediaId } = clip;
    const lod = this.lodOf(mediaId);
    const info = this.deps.frames.info(mediaId, lod);
    if (!info) {
      this.open(mediaId, lod);
      return null;
    }
    const times = info.frameTimesUs;
    if (!info.decodable || times.length === 0) return null;
    let stream = this.streams.get(clip.id);
    if (stream && (stream.clip !== clip || stream.lod !== lod)) {
      this.release(stream);
      stream = undefined;
    }
    if (!stream) {
      const frameUs = times.length > 1 ? ((times[times.length - 1] as number) - (times[0] as number)) / (times.length - 1) : 0;
      const durationUs = this.doc().media[clip.mediaId]?.durationUs ?? clip.out;
      stream = { clip, durationUs, lod, frameUs, times, requested: null, inFlight: null, failed: false, pins: new Map(), late: 0, pass: 0, scan: 0 };
      this.streams.set(clip.id, stream);
    }
    return stream;
  }

  private open(mediaId: MediaId, lod: Lod): void {
    const id = `${mediaId}|${lod}`;
    if (this.opening.has(id)) return;
    this.opening.add(id);
    this.deps.frames
      .video(mediaId, lod)
      .catch(() => undefined)
      .finally(() => this.opening.delete(id));
  }

  /** Drops the streams of clips neither under the playhead nor starting soon. */
  private releaseUnused(): void {
    // Runs every frame: no copy of the map (deleting the current entry while iterating is safe).
    for (const stream of this.streams.values()) {
      if (stream.pass !== this.pass && stream.scan !== this.scanId) this.release(stream);
    }
  }

  private release(stream: Stream): void {
    stream.inFlight?.abort();
    stream.inFlight = null;
    for (const unpin of stream.pins.values()) unpin();
    stream.pins.clear();
    if (this.streams.get(stream.clip.id) === stream) this.streams.delete(stream.clip.id);
  }

  private doc(): Project {
    return this.deps.document.getState();
  }

  private playhead(): Frame {
    return this.deps.session.state.getState().playhead;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

/**
 * The other clip of the transition `clip` is part of at `frame` (Batch 36): the one before it over its
 * transition in, the one after it over its transition out; null outside a transition.
 */
function transitionPartner(index: TrackIndex, clip: Clip, frame: Frame): Clip | null {
  if (!isMediaClip(clip)) return null;
  const at = lastClipStartingBy(index, frame);
  if (clip.transitionIn && frame < clip.start + clip.transitionIn.after) {
    const prev = index.clips[at - 1];
    return prev && isMediaClip(prev) && prev.transitionOut?.id === clip.transitionIn.id ? prev : null;
  }
  if (clip.transitionOut && frame >= clip.start + clip.duration - clip.transitionOut.before) {
    const next = index.clips[at + 1];
    return next && isMediaClip(next) && next.transitionIn?.id === clip.transitionOut.id ? next : null;
  }
  return null;
}

/**
 * Media positions between delivered frames: every frame the clip shows at 1x (2 for 60 fps media in
 * a 30 fps project), and at shuttle speeds only as many as a DISPLAY_HZ screen can show.
 */
function strideFor(stream: Stream, speed: number, fps: Rational): number {
  if (stream.frameUs <= 0) return 1;
  const perFrame = (stream.clip.speed * usPerFrame(fps)) / stream.frameUs;
  const framesPerSecond = fpsToNumber(fps) * speed;
  const framesPerShown = framesPerSecond / Math.min(framesPerSecond, DISPLAY_HZ);
  return Math.max(1, Math.floor(perFrame * framesPerShown + 1e-6));
}
