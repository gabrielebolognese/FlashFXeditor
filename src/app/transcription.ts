// Transcription state (spec §10.6), apart from transcribeController so the Captions tab and the
// dialogs can read it without loading the audio and worker wiring: the Transcribe dialog, the run (its
// phase and progress) or the review of its result, and the range a transcription covers.
import type { Project } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import type { TranscribeDevice, WhisperModelId } from "../media/transcribe/models.js";
import type { TranscribePhase, TranscribeStatus } from "../media/workers/protocol.js";
import type { ImportedCue } from "../timeline/edit/captions.js";
import { markedRange, type FrameRange } from "../timeline/model/inOut.js";
import { contentEnd } from "../timeline/model/queries.js";

export type TranscribeRangeChoice = "inOut" | "all";

export interface TranscribeDialogState {
  /** The worker's report: null until it answers. */
  status: TranscribeStatus | null;
  error: string | null;
  /** A model being removed. */
  removing: WhisperModelId | null;
}

/** The Transcribe dialog (null: closed). */
export const transcribeDialog = createStore<TranscribeDialogState | null>(null);

export interface TranscriptReview {
  projectId: string;
  range: FrameRange;
  cues: ImportedCue[];
  language: string;
  model: WhisperModelId;
  device: TranscribeDevice;
  words: number;
  /** The cues overlapping the range, which the confirmation replaces. */
  replaced: number;
}

export type TranscriptionState =
  | { kind: "idle" }
  | { kind: "running"; phase: TranscribePhase | "mix"; fraction: number; model: WhisperModelId }
  | { kind: "review"; review: TranscriptReview };

export const transcription = createStore<TranscriptionState>({ kind: "idle" });

export interface TranscribeOptions {
  model: WhisperModelId;
  /** A Whisper language code, or null: detected. */
  language: string | null;
  range: TranscribeRangeChoice;
}

/** The frames a transcription covers: the in/out range (`inOut`, when set), else the whole timeline. Null on an empty timeline. */
export function transcribeRange(project: Project, inOut: { inPoint: number | null; outPoint: number | null }, choice: TranscribeRangeChoice): FrameRange | null {
  const end = contentEnd(project);
  const marked = choice === "inOut" ? markedRange(inOut, end) : null;
  if (marked) return marked;
  return end > 0 ? { start: 0, end } : null;
}
