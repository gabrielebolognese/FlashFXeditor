// The Whisper models of local transcription (spec §10.6): tiny, base and small, multilingual, from the
// `_timestamped` ONNX exports (they output the cross attentions word timestamps need). The files come
// from the Hugging Face hub once and stay in the browser's cache (transformers.js `transformers-cache`).
// - WebGPU: the encoder in fp32 (fp16 encoders lose words on some GPUs) and the decoder in q4 (4-bit
//   MatMulNBits, which the WebGPU backend runs); WASM: both int8 (`q8`), the smallest files.
// - Sizes are the download in MB (onnx files + tokenizer and configs), shown before a download.

export type WhisperModelId = "tiny" | "base" | "small";
export type TranscribeDevice = "webgpu" | "wasm";

export interface WhisperModel {
  id: WhisperModelId;
  label: string;
  /** Hugging Face repository. */
  repo: string;
  /** Download size in MB per device. */
  sizeMb: Readonly<Record<TranscribeDevice, number>>;
  /** One line on what it is good for. */
  note: string;
}

/** Tokenizer, configs and the preprocessor's files of every model (MB). */
const SHARED_MB = 3;

export const WHISPER_MODELS: readonly WhisperModel[] = [
  { id: "tiny", label: "Tiny", repo: "onnx-community/whisper-tiny_timestamped", sizeMb: { webgpu: 120 + SHARED_MB, wasm: 41 + SHARED_MB }, note: "Fastest, rough on noisy audio" },
  { id: "base", label: "Base", repo: "onnx-community/whisper-base_timestamped", sizeMb: { webgpu: 206 + SHARED_MB, wasm: 77 + SHARED_MB }, note: "Good balance (default)" },
  { id: "small", label: "Small", repo: "onnx-community/whisper-small_timestamped", sizeMb: { webgpu: 586 + SHARED_MB, wasm: 249 + SHARED_MB }, note: "Most accurate, slowest" },
];

export const DEFAULT_WHISPER_MODEL: WhisperModelId = "base";

export const isWhisperModel = (value: unknown): value is WhisperModelId => WHISPER_MODELS.some((model) => model.id === value);

export function whisperModel(id: WhisperModelId): WhisperModel {
  return WHISPER_MODELS.find((model) => model.id === id) ?? (WHISPER_MODELS[1] as WhisperModel);
}

/** The ONNX precision of each part per device (transformers.js `dtype`). */
export const MODEL_DTYPES: Readonly<Record<TranscribeDevice, Readonly<Record<string, string>>>> = {
  webgpu: { encoder_model: "fp32", decoder_model_merged: "q4" },
  wasm: { encoder_model: "q8", decoder_model_merged: "q8" },
};

/** Whisper's audio: 16 kHz mono. */
export const WHISPER_SAMPLE_RATE = 16_000;
