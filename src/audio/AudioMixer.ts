// The playback graph (spec §14): voices (audio clips) -> track GainNode (mute/solo) -> mix bus (the
// master GainNode) -> monitor GainNode (master volume and mute, monitoring only) -> destination. The
// meters read the mix bus through a splitter and one AnalyserNode per channel, before the monitor
// volume, so they show (and the clip indicator latches on) the mix the export will contain, whatever
// the knob says. Gain changes ramp over RAMP_SECONDS (no clicks), so a mute applies at once.
import type { Project, TrackId } from "../core/document/types.js";

/** Ramp of every gain change, start and stop (spec §8: 10 ms). */
export const RAMP_SECONDS = 0.01;
/** Time after a removed track's ramp before its node is disconnected (timers are not sample-exact). */
const DISCONNECT_MARGIN_MS = 50;
/** Analyser window: longer than an animation frame, so peaks between two reads are not missed. */
export const METER_FFT_SIZE = 2048;

/** The parts of a BaseAudioContext the graph and the scheduler use (tests use fakes). */
export interface AudioGraphContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNode;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
  createAnalyser(): AnalyserNode;
  createChannelSplitter(outputs?: number): ChannelSplitterNode;
}

export const dbToGain = (db: number) => 10 ** (db / 20);

/** Audio tracks that are heard: not muted, and soloed when any audio track is (spec §6.12). */
export function audibleTracks(project: Pick<Project, "tracks">): Map<TrackId, boolean> {
  const audio = project.tracks.filter((track) => track.kind === "audio");
  const anySolo = audio.some((track) => track.solo);
  return new Map(audio.map((track) => [track.id, !track.muted && (!anySolo || track.solo)]));
}

/** The last ramp given to each param here, so its value at any time is known exactly. */
const ramps = new WeakMap<AudioParam, { t0: number; v0: number; t1: number; v1: number }>();

/** The value `param` has at context time `at` (its plain value when no ramp was set here). */
function valueAt(param: AudioParam, at: number): number {
  const ramp = ramps.get(param);
  if (!ramp) return param.value;
  if (at >= ramp.t1) return ramp.v1;
  if (at <= ramp.t0) return ramp.v0;
  return ramp.v0 + ((ramp.v1 - ramp.v0) * (at - ramp.t0)) / (ramp.t1 - ramp.t0);
}

/**
 * Sets `param` to `from` at `at`, then ramps it linearly to `to` over RAMP_SECONDS. Every ramp starts
 * from this explicit point: a linear ramp runs from the previous event, and `cancelAndHoldAtTime`
 * adds none after a ramp that has ended (Web Audio spec), so a stop after a fade-in would ramp from
 * the fade-in's end, seconds ago, and drop to 0 at once (a click).
 */
export function ramp(param: AudioParam, from: number, to: number, at: number): void {
  param.cancelScheduledValues(at);
  param.setValueAtTime(from, at);
  param.linearRampToValueAtTime(to, at + RAMP_SECONDS);
  ramps.set(param, { t0: at, v0: from, t1: at + RAMP_SECONDS, v1: to });
}

/** Ramps `param` from its value at `at` to `value` (no click). */
export function rampTo(param: AudioParam, value: number, at: number): void {
  ramp(param, valueAt(param, at), value, at);
}

export class AudioMixer {
  /** The mix of every track (spec "master GainNode"); the export mixdown builds the same graph offline (audio/mixdown.ts). */
  readonly bus: GainNode;
  readonly meters: readonly [AnalyserNode, AnalyserNode];
  private readonly monitor: GainNode;
  private readonly splitter: ChannelSplitterNode;
  private readonly tracks = new Map<TrackId, GainNode>();
  private audible = new Map<TrackId, boolean>();

  constructor(private readonly ctx: AudioGraphContext) {
    this.bus = ctx.createGain();
    this.monitor = ctx.createGain();
    this.splitter = ctx.createChannelSplitter(2);
    const left = ctx.createAnalyser();
    const right = ctx.createAnalyser();
    for (const meter of [left, right]) {
      meter.fftSize = METER_FFT_SIZE;
      meter.smoothingTimeConstant = 0;
    }
    this.meters = [left, right];
    // Mono mixes reach the splitter upmixed to both channels (the bus is stereo, "speakers").
    this.bus.channelCount = 2;
    this.bus.channelCountMode = "explicit";
    this.bus.channelInterpretation = "speakers";
    this.bus.connect(this.splitter);
    this.splitter.connect(left, 0);
    this.splitter.connect(right, 1);
    this.bus.connect(this.monitor);
    this.monitor.connect(ctx.destination);
  }

  get context(): AudioGraphContext {
    return this.ctx;
  }

  /** The input of a track (created on first use, at its current audibility). */
  trackInput(trackId: TrackId): GainNode {
    let node = this.tracks.get(trackId);
    if (!node) {
      node = this.ctx.createGain();
      node.gain.value = this.audible.get(trackId) === false ? 0 : 1;
      node.connect(this.bus);
      this.tracks.set(trackId, node);
    }
    return node;
  }

  /**
   * Applies mute/solo from the document. A track gone (deleted, or an undone insert that created it)
   * ramps out and is disconnected once the ramp is over, so sound still playing on it never clicks.
   */
  updateTracks(project: Pick<Project, "tracks">): void {
    const audible = audibleTracks(project);
    const at = this.ctx.currentTime;
    for (const [trackId, node] of this.tracks) {
      const heard = audible.get(trackId);
      if (heard === undefined) {
        this.tracks.delete(trackId);
        rampTo(node.gain, 0, at);
        setTimeout(() => node.disconnect(), RAMP_SECONDS * 1000 + DISCONNECT_MARGIN_MS);
      } else if (heard !== this.audible.get(trackId)) rampTo(node.gain, heard ? 1 : 0, at);
    }
    this.audible = audible;
  }

  /** Master volume (dB, monitoring only) and mute. */
  setMonitor(volumeDb: number, muted: boolean): void {
    rampTo(this.monitor.gain, muted ? 0 : dbToGain(volumeDb), this.ctx.currentTime);
  }

  dispose(): void {
    for (const node of this.tracks.values()) node.disconnect();
    this.tracks.clear();
    this.bus.disconnect();
    this.splitter.disconnect();
    this.monitor.disconnect();
  }
}
