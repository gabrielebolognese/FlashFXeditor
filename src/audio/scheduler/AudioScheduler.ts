// The audio scheduler (spec §8, §14): plays the audio clips of the timeline in sync with the playback
// clock. Framework-free; the playback engine drives it from its tick (`sync`), never more than
// AHEAD_SECONDS ahead, so a seek or a pause is heard at once.
// - Mapping: the engine's anchor (frame `frame` begins at clock time `clock`, at `speed`) places
//   timeline second s at clock time `clock + s - frame / fps`, the moment the preview starts showing
//   that frame (the same clock: video frame selection and audio share `AudioClock`). Clock times
//   become context times through `AudioClock.contextTime`.
// - Voices: one AudioBufferSourceNode per (clip, segment, loop pass), started when its start comes
//   within AHEAD_SECONDS (checked every STEP_SECONDS) and stopped at the clip's end: source -> envelope
//   GainNode (start/stop ramps) -> clip GainNode (gain dB, mute; TODO(batch 37): fades, keyframes and
//   rubber bands as gain curves per scheduled chunk) -> track GainNode (mute/solo) -> mix bus.
//   `playbackRate` = the clip speed (0.25x..4x, pitch follows, spec §14).
// - A voice whose start time has passed (playback starting mid-clip, a seek, audio decoded late)
//   starts as soon as the render clock allows, with its offset moved on by the delay and a 10 ms
//   fade-in. A cut at a clip's own start, or a segment joining the previous one, starts exactly
//   with no ramp. Stops (pause, seek, edits) ramp out over 10 ms.
// - Loop: the passes after the end are scheduled ahead like the rest; a voice is identified by the
//   clock time of its pass's timeline 0 (`origin`), so the engine's re-anchoring at the wrap (the
//   same mapping) keeps every voice, while a seek (another mapping) restarts them.
// - Silent at transport speeds other than 1x (spec §8; Batch 10: "silence at other shuttle speeds").
// - Document changes while playing: mute/solo ramp the track gains, a clip whose gain or mute changed
//   ramps its voice, a clip moved, trimmed or removed stops its voice and is scheduled again.
import type { PlaybackClock } from "../AudioClock.js";
import { fpsToNumber } from "../../core/document/time.js";
import type { Clip, ClipId, Frame, MediaClip, Project, Rational } from "../../core/document/types.js";
import { clipInIndex, clipsInRange, trackIndex } from "../../timeline/model/queries.js";
import { dbToGain, ramp, rampTo, RAMP_SECONDS, type AudioMixer } from "../AudioMixer.js";
import type { DecodedAudio } from "../decode/DecodedAudio.js";
import { segmentAt, segmentStartSeconds } from "../decode/segments.js";

/** Voices start at most this far ahead of the clock (spec §8: 200 ms). */
export const AHEAD_SECONDS = 0.2;
/** Scheduling steps (spec §8: 50 ms). */
export const STEP_SECONDS = 0.05;
/** A voice starts at least this far ahead of the render clock. */
const MIN_AHEAD_SECONDS = 0.005;
/** Added to the render lead when playback starts or seeks, so the first samples are scheduled in time. */
export const START_MARGIN_SECONDS = 0.02;
/** Audio of clips starting this soon is loaded ahead (like the video lookahead, P7). */
export const LOAD_AHEAD_SECONDS = 2;
/** Two pass origins closer than this are the same pass. */
const ORIGIN_TOLERANCE = 1e-4;
/** Passes scheduled per step at most (a very short looped timeline). */
const MAX_PASSES = 4;

export interface PlayMapping {
  /** Frame `frame` begins at clock time `clock`. */
  frame: Frame;
  clock: number;
  /** Signed transport speed. */
  speed: number;
  /** Start of the loop range (the in point, or 0): a wrap goes from `end` to it. */
  start: Frame;
  /** End of the play range (exclusive): the content end, the out point, or a range played on its own. */
  end: Frame;
  /** Playback wraps from `end` to `start`. */
  loop: boolean;
  fps: Rational;
}

export interface AudioSchedulerStats {
  voices: number;
  started: number;
  /** Voices that started after their time (mid-clip starts, seeks, late decodes). */
  late: number;
  stopped: number;
}

export interface AudioSchedulerDeps {
  clock: PlaybackClock & { readonly epoch: number; contextTime(clockTime: number): number | null; renderLead(): number | null };
  /** The running graph; null before the AudioContext runs. */
  mixer(): AudioMixer | null;
  document: { getState(): Project; subscribe(listener: (state: Project) => void, options?: { affects?: readonly ("timeline" | "clips" | "tracks" | "media" | "audio")[] }): () => void };
  audio: Pick<DecodedAudio, "layout" | "segment" | "request" | "open" | "hasFailed">;
}

interface Voice {
  clip: MediaClip;
  segment: number;
  /** Clock time of timeline 0 in the voice's pass. */
  origin: number;
  /** Context times. */
  start: number;
  end: number;
  source: AudioBufferSourceNode;
  envelope: GainNode;
  gain: GainNode;
}

/** Clip gain: volume in dB, 0 when muted. */
export const clipGain = (clip: MediaClip) => (clip.volume.muted ? 0 : dbToGain(clip.volume.gainDb));

/** Same audio at the same times (a gain or mute change keeps the voice). */
function sameTiming(a: MediaClip, b: MediaClip): boolean {
  return a.trackId === b.trackId && a.start === b.start && a.duration === b.duration && a.in === b.in && a.out === b.out && a.speed === b.speed && a.mediaId === b.mediaId && a.enabled === b.enabled && a.kind === b.kind;
}

const sameMapping = (a: PlayMapping, b: PlayMapping) =>
  a.frame === b.frame && a.clock === b.clock && a.speed === b.speed && a.start === b.start && a.end === b.end && a.loop === b.loop && a.fps.num === b.fps.num && a.fps.den === b.fps.den;

const isAudioClip = (clip: Clip | null | undefined): clip is MediaClip => clip?.kind === "audio" && clip.enabled;

/** Media seconds of a clip at timeline second `s`. */
const mediaSeconds = (clip: MediaClip, clipStart: number, s: number) => clip.in / 1e6 + (s - clipStart) * clip.speed;

export class AudioScheduler {
  readonly stats: AudioSchedulerStats = { voices: 0, started: 0, late: 0, stopped: 0 };
  private mapping: PlayMapping | null = null;
  private readonly voices: Voice[] = [];
  private epoch = -1;
  private lastStep = -Infinity;
  private mixerSeen: AudioMixer | null = null;
  private readonly stopDocument: () => void;

  constructor(private readonly deps: AudioSchedulerDeps) {
    this.stopDocument = deps.document.subscribe((state) => this.onDocument(state), { affects: ["timeline", "clips", "tracks", "media", "audio"] });
  }

  /** True while a 1x playback is scheduled (audio may be heard). */
  get active(): boolean {
    return this.mapping?.speed === 1;
  }

  /** Seconds to start the clock ahead of now, so the first samples are heard on time; 0 without a running context. */
  lead(): number {
    const lead = this.deps.mixer() ? this.deps.clock.renderLead() : null;
    return lead === null ? 0 : lead + START_MARGIN_SECONDS;
  }

  /**
   * True when the audio of every clip under `frame` is in memory (the preroll waits for it); asks for
   * what is missing. Media that cannot be decoded do not hold playback.
   */
  prepare(project: Project, frame: Frame): boolean {
    let ready = true;
    const fps = fpsToNumber(project.settings.fps);
    for (const track of project.tracks) {
      if (track.kind !== "audio") continue;
      const clip = clipInIndex(trackIndex(project, track), frame);
      if (!isAudioClip(clip)) continue;
      if (!this.ensure(clip, mediaSeconds(clip, clip.start / fps, frame / fps))) ready = false;
    }
    return ready;
  }

  /** Loads the audio of clips playing within LOAD_AHEAD_SECONDS of `frame` (forward). */
  prefetch(project: Project, frame: Frame): void {
    const fps = fpsToNumber(project.settings.fps);
    const to = frame + Math.ceil(LOAD_AHEAD_SECONDS * fps);
    for (const track of project.tracks) {
      if (track.kind !== "audio") continue;
      for (const clip of clipsInRange(project, track.id, frame, to)) {
        if (!isAudioClip(clip)) continue;
        const s = Math.max(frame, clip.start) / fps;
        this.ensure(clip, mediaSeconds(clip, clip.start / fps, s));
      }
    }
  }

  /** Follows the engine's mapping and schedules what comes within AHEAD_SECONDS. Called every engine tick. */
  sync(mapping: PlayMapping): void {
    this.forgetEnded();
    if (!this.mapping || !sameMapping(this.mapping, mapping)) {
      this.mapping = { ...mapping, fps: { ...mapping.fps } };
      this.lastStep = -Infinity;
      if (mapping.speed !== 1) this.stopAll();
      else for (const voice of [...this.voices]) if (!this.validOrigin(voice.origin)) this.stopVoice(voice);
    }
    const now = this.deps.clock.now();
    if (now - this.lastStep < STEP_SECONDS) return;
    this.lastStep = now;
    this.step(now);
  }

  /** Stops every voice with a 10 ms ramp (pause). */
  stop(): void {
    this.mapping = null;
    this.stopAll();
  }

  dispose(): void {
    this.stop();
    this.stopDocument();
  }

  // --- Scheduling -------------------------------------------------------------------------------

  private step(now: number): void {
    const mapping = this.mapping;
    const mixer = this.deps.mixer();
    if (!mapping || mapping.speed !== 1 || !mixer) return;
    if (mixer !== this.mixerSeen) {
      // A new graph (first play, or a new context): start from the document's mute/solo.
      this.mixerSeen = mixer;
      this.voices.length = 0;
      mixer.updateTracks(this.deps.document.getState());
    }
    if (this.deps.clock.epoch !== this.epoch) {
      // The clock-to-context mapping changed: what is scheduled plays at the wrong time.
      this.stopAll();
      this.epoch = this.deps.clock.epoch;
    }
    const project = this.deps.document.getState();
    const fps = fpsToNumber(mapping.fps);
    const start = mapping.start / fps;
    const end = mapping.end / fps;
    const span = end - start;
    const w0 = now;
    const w1 = now + AHEAD_SECONDS;
    // Pass 0 plays from the anchor to the end; with loop, passes of the loop range [start, end) follow,
    // pass p with its timeline 0 at `origin0 + p * span` (it reaches `start` when pass p - 1 ends).
    const origin0 = mapping.clock - mapping.frame / fps;
    this.schedulePass(project, mixer, origin0, mapping.frame / fps, end, w0, w1);
    if (!mapping.loop || span <= 0) return;
    const firstWrap = origin0 + end;
    const first = Math.max(1, Math.floor((w0 - firstWrap) / span) + 1);
    for (let p = first; p < first + MAX_PASSES; p++) {
      if (firstWrap + (p - 1) * span >= w1) break;
      this.schedulePass(project, mixer, origin0 + p * span, start, end, w0, w1);
    }
  }

  /** Voices of the timeline range [from, to) (seconds) of the pass whose timeline 0 is at clock `origin`, starting before `w1`. */
  private schedulePass(project: Project, mixer: AudioMixer, origin: number, from: number, to: number, w0: number, w1: number): void {
    const a = Math.max(from, w0 - origin);
    const b = Math.min(to, w1 - origin);
    if (b <= a) return;
    const fps = fpsToNumber(project.settings.fps);
    for (const track of project.tracks) {
      if (track.kind !== "audio") continue;
      for (const clip of clipsInRange(project, track.id, Math.floor(a * fps), Math.ceil(b * fps) + 1)) {
        if (!isAudioClip(clip)) continue;
        const clipStart = clip.start / fps;
        const clipEnd = (clip.start + clip.duration) / fps;
        const spanStart = Math.max(clipStart, from);
        const spanEnd = Math.min(clipEnd, to);
        if (spanEnd <= spanStart || origin + spanEnd <= w0 || origin + spanStart >= w1) continue;
        this.scheduleClip(clip, mixer, origin, clipStart, spanStart, spanEnd, w0, w1);
      }
    }
  }

  private scheduleClip(clip: MediaClip, mixer: AudioMixer, origin: number, clipStart: number, spanStart: number, spanEnd: number, w0: number, w1: number): void {
    const layout = this.deps.audio.layout(clip.mediaId);
    if (!layout) {
      this.ensure(clip, mediaSeconds(clip, clipStart, Math.max(spanStart, w0 - origin)));
      return;
    }
    // The segments the span plays, each from its timeline start to its timeline end.
    const first = segmentAt(layout, mediaSeconds(clip, clipStart, Math.max(spanStart, w0 - origin)));
    for (let segment = first; segment < layout.count; segment++) {
      const segStart = segmentStartSeconds(layout, segment);
      const segEnd = segment + 1 < layout.count ? segmentStartSeconds(layout, segment + 1) : Infinity;
      // Timeline seconds where the clip's media reaches the segment's edges.
      const sStart = Math.max(spanStart, clipStart + (segStart - clip.in / 1e6) / clip.speed);
      const sEnd = Math.min(spanEnd, clipStart + (segEnd - clip.in / 1e6) / clip.speed);
      if (origin + sStart >= w1) break;
      if (sEnd <= sStart || origin + sEnd <= w0) continue;
      if (this.voices.some((voice) => voice.clip.id === clip.id && voice.segment === segment && Math.abs(voice.origin - origin) < ORIGIN_TOLERANCE)) continue;
      this.startVoice(clip, segment, mixer, origin, {
        clipStart,
        start: sStart,
        end: sEnd,
        segStart,
        // A clip's own start and a segment continuing the previous one start exactly; anything else joins mid-sound.
        natural: Math.abs(sStart - clipStart) < 1e-9 || (segment > first && Math.abs(sStart - spanStart) > 1e-9),
      });
    }
  }

  private startVoice(clip: MediaClip, segment: number, mixer: AudioMixer, origin: number, span: { clipStart: number; start: number; end: number; segStart: number; natural: boolean }): void {
    const buffer = this.deps.audio.segment(clip.mediaId, segment);
    if (!buffer) {
      this.deps.audio.request(clip.mediaId, segment, "playback");
      return;
    }
    const { clock } = this.deps;
    const ctx = mixer.context;
    let start = clock.contextTime(origin + span.start);
    const end = clock.contextTime(origin + span.end);
    if (start === null || end === null) return;
    let offset = mediaSeconds(clip, span.clipStart, span.start) - span.segStart;
    const earliest = ctx.currentTime + MIN_AHEAD_SECONDS;
    const late = start < earliest;
    if (late) {
      offset += (earliest - start) * clip.speed;
      start = earliest;
    }
    // Less than a ramp left (a voice that just ended, still inside the window): nothing to start.
    if (start >= end - RAMP_SECONDS || offset >= buffer.duration) return;
    const fadeIn = late || !span.natural;
    if (late) this.stats.late += 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = clip.speed;
    const envelope = ctx.createGain();
    const gain = ctx.createGain();
    gain.gain.value = clipGain(clip);
    if (fadeIn) ramp(envelope.gain, 0, 1, start);
    source.connect(envelope);
    envelope.connect(gain);
    gain.connect(mixer.trackInput(clip.trackId));
    const voice: Voice = { clip, segment, origin, start, end, source, envelope, gain };
    source.onended = () => this.forget(voice, 0);
    source.start(start, Math.max(0, offset));
    source.stop(end);
    this.voices.push(voice);
    this.stats.started += 1;
    this.stats.voices = this.voices.length;
  }

  /** True when `origin` is the timeline-0 clock time of one of the current mapping's passes. */
  private validOrigin(origin: number): boolean {
    const mapping = this.mapping;
    if (!mapping) return false;
    const fps = fpsToNumber(mapping.fps);
    const origin0 = mapping.clock - mapping.frame / fps;
    if (Math.abs(origin - origin0) < ORIGIN_TOLERANCE) return true;
    const span = (mapping.end - mapping.start) / fps;
    if (!mapping.loop || span <= 0) return false;
    // Any pass of the loop, the one before the anchor included (the engine re-anchors at each wrap).
    const passes = (origin - origin0) / span;
    return Math.abs(passes - Math.round(passes)) * span < ORIGIN_TOLERANCE;
  }

  /** True when the clip's media audio at media second `at` is in memory; asks for it otherwise. */
  private ensure(clip: MediaClip, at: number): boolean {
    const { audio } = this.deps;
    if (audio.hasFailed(clip.mediaId)) return true;
    const layout = audio.layout(clip.mediaId);
    if (!layout) {
      audio.open(clip.mediaId).catch(() => undefined);
      return false;
    }
    const segment = segmentAt(layout, at);
    if (audio.segment(clip.mediaId, segment)) return true;
    audio.request(clip.mediaId, segment, "playback");
    return false;
  }

  // --- Stopping and edits -------------------------------------------------------------------------

  private stopVoice(voice: Voice): void {
    const ctx = this.mixerSeen?.context;
    this.stats.stopped += 1;
    if (!ctx) {
      this.forget(voice, 0);
      return;
    }
    const at = ctx.currentTime;
    try {
      if (voice.start >= at + RAMP_SECONDS) {
        // Not heard yet: drop it.
        voice.source.stop();
      } else {
        rampTo(voice.envelope.gain, 0, at);
        voice.source.stop(at + RAMP_SECONDS);
      }
    } catch {
      // Already stopped.
    }
    this.forget(voice, RAMP_SECONDS);
  }

  /** Voices whose sound is over (their `ended` event may still be on its way). */
  private forgetEnded(): void {
    const ctx = this.mixerSeen?.context;
    if (!ctx) return;
    for (const voice of [...this.voices]) if (voice.end <= ctx.currentTime) this.forget(voice, 0);
  }

  private stopAll(): void {
    for (const voice of [...this.voices]) this.stopVoice(voice);
  }

  /** Drops a voice; its nodes are disconnected once its last `afterSeconds` of sound (a stop ramp) are out. */
  private forget(voice: Voice, afterSeconds: number): void {
    const at = this.voices.indexOf(voice);
    if (at !== -1) this.voices.splice(at, 1);
    this.stats.voices = this.voices.length;
    voice.source.onended = null;
    const disconnect = () => {
      voice.source.disconnect();
      voice.envelope.disconnect();
      voice.gain.disconnect();
    };
    if (afterSeconds > 0) setTimeout(disconnect, afterSeconds * 1000 + 50);
    else disconnect();
  }

  private onDocument(project: Project): void {
    const mixer = this.deps.mixer();
    if (!mixer || mixer !== this.mixerSeen) return;
    mixer.updateTracks(project);
    for (const voice of [...this.voices]) {
      const current = project.clips[voice.clip.id];
      if (current === voice.clip) continue;
      if (!isAudioClip(current) || !sameTiming(current, voice.clip)) {
        this.stopVoice(voice);
        continue;
      }
      if (clipGain(current) !== clipGain(voice.clip)) rampTo(voice.gain.gain, clipGain(current), mixer.context.currentTime);
      voice.clip = current;
    }
    this.lastStep = -Infinity;
  }

  /** Voices playing or scheduled for a clip (tests, dev stats). */
  voicesOf(clipId: ClipId): readonly { segment: number; start: number; end: number; origin: number }[] {
    return this.voices.filter((voice) => voice.clip.id === clipId);
  }
}
