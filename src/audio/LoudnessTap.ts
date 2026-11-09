// The live loudness meter (spec §21.21, Batch 77): an AudioWorklet taps the mix bus (before the monitor
// volume, as the peak meters do) and posts its samples in blocks; a LoudnessMeter (audio/dsp/loudness.ts,
// BS.1770-4: momentary, short-term, integrated, true peak) consumes them. No React: the MeterView
// reads `reading()` through the scheduler. The processor is a module made from a Blob URL (no
// bundler entry). Without AudioWorklet support the readings stay silent (-Infinity).
import { LoudnessMeter, type LoudnessReading } from "./dsp/loudness.js";

/** Samples per posted block (a few animation frames' worth at 48 kHz). */
export const TAP_BLOCK = 1024;

const PROCESSOR = "loudness-tap";

const SOURCE = `
class LoudnessTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fill = 0;
    this.left = new Float32Array(${TAP_BLOCK});
    this.right = new Float32Array(${TAP_BLOCK});
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const l = input[0];
    const r = input[1] || input[0];
    for (let i = 0; i < l.length; i++) {
      this.left[this.fill] = l[i];
      this.right[this.fill] = r[i];
      if (++this.fill === ${TAP_BLOCK}) {
        const left = this.left;
        const right = this.right;
        this.port.postMessage([left, right], [left.buffer, right.buffer]);
        this.left = new Float32Array(${TAP_BLOCK});
        this.right = new Float32Array(${TAP_BLOCK});
        this.fill = 0;
      }
    }
    return true;
  }
}
registerProcessor("${PROCESSOR}", LoudnessTap);
`;

export const SILENT_READING: LoudnessReading = { momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity, truePeakDb: -Infinity };

export interface TapContext {
  readonly sampleRate: number;
  readonly audioWorklet?: { addModule(url: string): Promise<void> };
}

export class LoudnessTap {
  readonly meter: LoudnessMeter;
  /** Blocks received (dev stats, tests). */
  blocks = 0;
  private node: AudioWorkletNode | null = null;
  private disposed = false;

  constructor(private readonly ctx: TapContext, private readonly source: AudioNode) {
    this.meter = new LoudnessMeter(ctx.sampleRate, 2);
  }

  /** Loads the processor and connects it to the source; resolves false when the browser cannot. */
  async start(): Promise<boolean> {
    const worklet = this.ctx.audioWorklet;
    if (!worklet) return false;
    const url = URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" }));
    try {
      await worklet.addModule(url);
    } catch {
      return false;
    } finally {
      URL.revokeObjectURL(url);
    }
    if (this.disposed) return false;
    const node = new AudioWorkletNode(this.ctx as unknown as BaseAudioContext, PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: "explicit" });
    node.port.onmessage = (event: MessageEvent<[Float32Array, Float32Array]>) => {
      this.blocks += 1;
      this.meter.push(event.data);
    };
    this.source.connect(node);
    this.node = node;
    return true;
  }

  reading(): LoudnessReading {
    return this.meter.reading();
  }

  /** Starts the integrated and the true-peak values over (a click on the strip). */
  reset(): void {
    this.meter.reset();
  }

  dispose(): void {
    this.disposed = true;
    if (this.node) {
      this.node.port.onmessage = null;
      this.source.disconnect(this.node);
      this.node.disconnect();
      this.node = null;
    }
  }
}
