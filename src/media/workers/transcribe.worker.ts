// transcribe.worker entry (spec §3.5, §10.6): local speech to text with Whisper through transformers.js
// (ONNX Runtime Web), on WebGPU when this worker gets an adapter, else on WASM. Nothing leaves the
// machine but the model download from the Hugging Face hub (once: the files stay in the browser's
// cache). The ONNX Runtime binary is bundled with the app (no CDN).
// - transcribeStatus: the device and which models are cached. transcribeRemove: a model's files out
//   of the cache.
// - transcribe: loads the model (progress: `download` bytes, or `load` when cached), resamples the mix
//   to 16 kHz (transcribe/resample.ts), detects the language from the first 30 s unless one is given
//   (one decoder step: the most likely language token; transformers.js has no detection and would
//   assume English), then runs the ASR pipeline with word timestamps in 30 s windows (progress per
//   generated token and window). The result is the timed words (text/transcript.ts `wordsFromChunks`).
// - Cancelling aborts at the next token; the main thread also terminates this worker, which frees the
//   model's memory at once. The library loads on first use (dynamic import, P12).
import ortWasm from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";
import ortFactory from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url";
import { wordsFromChunks, type WordChunk } from "../../text/transcript.js";
import { resample } from "../transcribe/resample.js";
import { MODEL_DTYPES, WHISPER_MODELS, WHISPER_SAMPLE_RATE, whisperModel, type TranscribeDevice, type WhisperModelId } from "../transcribe/models.js";
import { abortError, type TranscribeParams, type TranscribeProgress, type TranscribeResult, type TranscribeStatus } from "./protocol.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

type Transformers = typeof import("@huggingface/transformers");

const TASK = "automatic-speech-recognition";
/** Whisper's window and the overlap the pipeline keeps on each side of a window (s). */
const CHUNK_SECONDS = 30;
const STRIDE_SECONDS = 5;
/** Tokens a window of speech yields, roughly: the progress inside a window. */
const TOKENS_PER_WINDOW = 120;

let library: Promise<Transformers> | null = null;
function transformers(): Promise<Transformers> {
  library ??= import("@huggingface/transformers").then((lib) => {
    lib.env.allowLocalModels = false;
    const wasm = lib.env.backends.onnx.wasm;
    if (wasm) wasm.wasmPaths = { mjs: new URL(ortFactory, self.location.href).href, wasm: new URL(ortWasm, self.location.href).href };
    return lib;
  });
  return library;
}

let device: Promise<TranscribeDevice> | null = null;
function pickDevice(): Promise<TranscribeDevice> {
  device ??= (async () => {
    try {
      const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
      if (gpu && (await gpu.requestAdapter())) return "webgpu";
    } catch {
      // No WebGPU here.
    }
    return "wasm";
  })();
  return device;
}

const options = (on: TranscribeDevice) => ({ device: on, dtype: MODEL_DTYPES[on] as Record<string, "fp32" | "q4" | "q8"> });

async function status(): Promise<TranscribeStatus> {
  const [lib, on] = await Promise.all([transformers(), pickDevice()]);
  const entries = await Promise.all(
    WHISPER_MODELS.map(async (model) => [model.id, await lib.ModelRegistry.is_pipeline_cached(TASK, model.repo, options(on)).catch(() => false)] as const),
  );
  return { device: on, cached: Object.fromEntries(entries) as Record<WhisperModelId, boolean> };
}

async function remove(id: WhisperModelId): Promise<null> {
  const [lib, on] = await Promise.all([transformers(), pickDevice()]);
  await lib.ModelRegistry.clear_pipeline_cache(TASK, whisperModel(id).repo, options(on));
  return null;
}

/** The ASR pipeline's parts this worker uses. */
interface Asr {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{ text: string; chunks?: WordChunk[] }>;
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>;
  model: {
    (inputs: Record<string, unknown>): Promise<{ logits: { data: Float32Array; dims: number[] } }>;
    generate: (inputs: Record<string, unknown>) => Promise<unknown>;
    generation_config: { decoder_start_token_id: number; lang_to_id?: Record<string, number> };
  };
  dispose(): Promise<void>;
}

/** The most likely language of the first window: one decoder step after `<|startoftranscript|>`. */
async function detectLanguage(lib: Transformers, asr: Asr, audio: Float32Array): Promise<string> {
  const config = asr.model.generation_config;
  const languages = Object.entries(config.lang_to_id ?? {});
  if (languages.length === 0) return "en";
  const { input_features } = await asr.processor(audio.subarray(0, CHUNK_SECONDS * WHISPER_SAMPLE_RATE));
  const start = new lib.Tensor("int64", BigInt64Array.from([BigInt(config.decoder_start_token_id)]), [1, 1]);
  const { logits } = await asr.model({ input_features, decoder_input_ids: start });
  const vocab = logits.dims[logits.dims.length - 1] ?? logits.data.length;
  const row = logits.data.subarray(logits.data.length - vocab);
  let best = "<|en|>";
  let score = -Infinity;
  for (const [token, id] of languages) {
    const value = row[id] ?? -Infinity;
    if (value > score) {
      score = value;
      best = token;
    }
  }
  return best.slice(2, -2);
}

/** Windows the pipeline cuts `samples` into (its own loop: 30 s windows, 5 s strides). */
function windowCount(samples: number): number {
  const window = CHUNK_SECONDS * WHISPER_SAMPLE_RATE;
  const jump = window - 2 * STRIDE_SECONDS * WHISPER_SAMPLE_RATE;
  let count = 1;
  for (let offset = 0; offset + window < samples; offset += jump) count += 1;
  return count;
}

async function transcribe(params: TranscribeParams, signal: AbortSignal, emit: (value: TranscribeProgress) => void): Promise<TranscribeResult> {
  const [lib, on] = await Promise.all([transformers(), pickDevice()]);
  const model = whisperModel(params.model);
  const cached = await lib.ModelRegistry.is_pipeline_cached(TASK, model.repo, options(on)).catch(() => false);
  const phase = cached ? "load" : "download";
  // The library knows a file's size once its download starts (when the hub's metadata is not at hand):
  // the model's known size is the floor of the total, so the bar never fills on the small files first.
  const expected = model.sizeMb[on] * 1e6;
  emit({ phase, fraction: 0, loaded: 0, total: expected });
  const asr = (await lib.pipeline(TASK, model.repo, {
    ...options(on),
    progress_callback: (info: { status: string; loaded?: number; total?: number }) => {
      if (info.status !== "progress_total") return;
      const loaded = info.loaded ?? 0;
      const total = Math.max(info.total ?? 0, expected, loaded);
      emit({ phase, fraction: loaded / total, loaded, total });
    },
  })) as unknown as Asr;
  try {
    if (signal.aborted) throw abortError();
    const audio = resample(new Float32Array(params.audio), params.sampleRate, WHISPER_SAMPLE_RATE);
    let language = params.language;
    if (!language) {
      emit({ phase: "detect", fraction: 0 });
      language = await detectLanguage(lib, asr, audio);
    }
    if (signal.aborted) throw abortError();
    // Progress: windows done, and the tokens of the window being generated.
    const windows = windowCount(audio.length);
    let done = 0;
    let tokens = 0;
    const report = () => emit({ phase: "transcribe", fraction: Math.min(1, (done + Math.min(0.95, tokens / TOKENS_PER_WINDOW)) / windows), language });
    report();
    const generate = asr.model.generate.bind(asr.model);
    asr.model.generate = async (inputs) => {
      tokens = 0;
      const out = await generate(inputs);
      done += 1;
      tokens = 0;
      report();
      return out;
    };
    const streamer = {
      put() {
        if (signal.aborted) throw abortError();
        tokens += 1;
        report();
      },
      end() {},
    };
    const output = await asr(audio, {
      language,
      task: "transcribe",
      return_timestamps: "word",
      chunk_length_s: CHUNK_SECONDS,
      stride_length_s: STRIDE_SECONDS,
      streamer,
    });
    const durationUs = Math.round((audio.length / WHISPER_SAMPLE_RATE) * 1e6);
    return { language, device: on, words: wordsFromChunks(output.chunks ?? [], durationUs) };
  } finally {
    await asr.dispose().catch(() => undefined);
  }
}

new WorkerHost(
  self as unknown as HostScope,
  {
    transcribeStatus: () => status(),
    transcribeRemove: ({ model }) => remove(model),
    transcribe: (params, signal, emit) => transcribe(params, signal, emit),
  },
  1,
);
