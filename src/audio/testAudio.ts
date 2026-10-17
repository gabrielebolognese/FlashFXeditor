// Test-only stand-ins for the Web Audio objects the audio engine uses (jsdom has none). They record
// what was scheduled instead of producing sound. Not imported by app code.
import type { AudioGraphContext } from "./AudioMixer.js";

export class FakeAudioBuffer {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly data: Float32Array[];
  constructor({ length, numberOfChannels = 1, sampleRate }: AudioBufferOptions) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    return this.data[channel] as Float32Array;
  }
  copyToChannel(source: Float32Array, channel: number, offset = 0): void {
    (this.data[channel] as Float32Array).set(source, offset);
  }
}

export const fakeBuffer = (seconds: number, sampleRate = 48_000, channels = 2) => new FakeAudioBuffer({ length: Math.round(seconds * sampleRate), numberOfChannels: channels, sampleRate }) as unknown as AudioBuffer;

export type ParamEvent = [kind: "set" | "ramp" | "hold" | "cancel" | "curve", value: number, time: number];

/** An automation event on the param's timeline. */
interface TimelineEvent {
  kind: "set" | "ramp";
  value: number;
  time: number;
}

/**
 * Records every call (`events`) and keeps the automation timeline with the Web Audio rules for the
 * calls the engine makes, so `valueAt` gives the value the browser would render: a linear ramp runs
 * from the previous event, `cancelAndHoldAtTime` cuts a ramp in progress at the cancel time and
 * changes nothing when the last event has passed.
 */
export class FakeParam {
  value: number;
  readonly events: ParamEvent[] = [];
  private timeline: TimelineEvent[] = [];
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number, time: number) {
    this.events.push(["set", value, time]);
    this.insert({ kind: "set", value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push(["ramp", value, time]);
    this.insert({ kind: "ramp", value, time });
    return this;
  }
  /** A curve is a set at its start and linear ramps through its points (the spec's interpolation); it must not overlap another event, as in browsers. */
  setValueCurveAtTime(values: ArrayLike<number>, startTime: number, duration: number) {
    if (values.length < 2 || !(duration > 0)) throw new Error("setValueCurveAtTime: needs 2 values and a duration");
    if (this.timeline.some((event) => event.time >= startTime && event.time < startTime + duration)) throw new Error("setValueCurveAtTime: overlaps another automation event");
    this.events.push(["curve", values[values.length - 1] as number, startTime]);
    this.insert({ kind: "set", value: values[0] as number, time: startTime });
    for (let i = 1; i < values.length; i++) this.insert({ kind: "ramp", value: values[i] as number, time: startTime + (duration * i) / (values.length - 1) });
    return this;
  }
  cancelAndHoldAtTime(time: number) {
    this.events.push(["hold", this.value, time]);
    const next = this.timeline.find((event) => event.time > time);
    if (next?.kind === "ramp") {
      const held = this.valueAt(time);
      this.timeline = this.timeline.filter((event) => event.time <= time);
      this.timeline.push({ kind: "ramp", value: held, time });
    } else this.timeline = this.timeline.filter((event) => event.time <= time);
    return this;
  }
  cancelScheduledValues(time: number) {
    this.events.push(["cancel", this.value, time]);
    this.timeline = this.timeline.filter((event) => event.time < time);
    return this;
  }
  /** The value rendered at `time`. */
  valueAt(time: number): number {
    let value = this.value;
    let from = 0;
    for (const event of this.timeline) {
      if (event.time <= time) {
        value = event.value;
        from = event.time;
      } else {
        if (event.kind === "ramp") return value + ((event.value - value) * (time - from)) / (event.time - from);
        break;
      }
    }
    return value;
  }
  private insert(event: TimelineEvent) {
    const at = this.timeline.findIndex((other) => other.time > event.time);
    if (at === -1) this.timeline.push(event);
    else this.timeline.splice(at, 0, event);
  }
  /** The last target the param was set or ramped to (or its value). */
  get target(): number {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const [kind, value] = this.events[i] as ParamEvent;
      if (kind === "set" || kind === "ramp" || kind === "curve") return value;
    }
    return this.value;
  }
}

export class FakeNode {
  readonly outputs: FakeNode[] = [];
  connect(target: FakeNode) {
    this.outputs.push(target);
    return target;
  }
  disconnect() {
    this.outputs.length = 0;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
  channelCount = 2;
  channelCountMode = "max";
  channelInterpretation = "speakers";
}

export class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  readonly playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  started: { when: number; offset: number } | null = null;
  stoppedAt: number | null = null;
  start(when = 0, offset = 0) {
    this.started = { when, offset };
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

export class FakeAnalyser extends FakeNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  /** Samples the next read returns (the last `fftSize` frames). */
  samples = new Float32Array(0);
  getFloatTimeDomainData(target: Float32Array) {
    target.fill(0);
    target.set(this.samples.subarray(0, target.length));
  }
}

export class FakeContext {
  currentTime = 0;
  readonly sampleRate = 48_000;
  readonly destination = new FakeNode();
  readonly sources: FakeSource[] = [];
  createGain() {
    return new FakeGain();
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createAnalyser() {
    return new FakeAnalyser();
  }
  createChannelSplitter() {
    return new FakeNode();
  }
  asGraph(): AudioGraphContext {
    return this as unknown as AudioGraphContext;
  }
}
