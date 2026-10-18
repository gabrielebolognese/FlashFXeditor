// What the main thread hands export.worker for one export (spec §16, Batch 43), and what comes back.
// The document is a snapshot taken when the export starts: edits made meanwhile never reach it.
import type { Frame, MediaId, Project } from "../core/document/types.js";
import type { SlateLook } from "../render/compositor/Compositor.js";
import type { ProjectFace } from "../render/text/FontLibrary.js";
import type { PipelineProgress } from "./pipeline.js";
import type { AudioFileFormat } from "./audioExport.js";
import type { ExportFormat } from "./presets.js";

/** A media file the worker decodes, with its cache/index/ sample index when there is one. */
export interface ExportMediaFile {
  file: File;
  index: Blob | null;
}

export interface ExportJobParams {
  project: Project;
  /** Project frames exported, [start, end). */
  range: { start: Frame; end: Frame };
  format: ExportFormat;
  /** Files of the media the range shows (online ones; offline ones are in `offline`). */
  media: Record<MediaId, ExportMediaFile>;
  /** SVG images rasterized on the main thread (workers cannot draw SVG) at SVG_MAX_SIZE (transferred). */
  svg: Record<MediaId, ImageBitmap>;
  /** The project's font faces (`fonts/`; bundled fonts are added by the worker itself). */
  fonts: ProjectFace[];
  /** Media drawn as offline slates: their slate's second line (spec §6.19). */
  offline: Record<MediaId, string>;
  slate: SlateLook;
  /** The mixdown of the range, one plane per channel (transferred), or null when nothing is heard. */
  audio: { sampleRate: number; channels: ArrayBuffer[] } | null;
  /** GPU texture budget of the worker's pool (spec §16: 30% of the budget while exporting). */
  textureBudget: number;
  /** Starts paused: Pause was pressed before the job was posted (`ExportPauseSync`). */
  paused: boolean;
}

export type ExportProgress = PipelineProgress;

export interface ExportJobResult {
  frames: number;
  videoCodec: string;
  audioCodec: string | null;
  width: number;
  height: number;
  /** Wall time in the worker (ms), setup included. */
  ms: number;
}

/** Export audio (spec §16 extras): the range's mixdown written as a file. */
export interface AudioJobParams {
  format: AudioFileFormat;
  /** The mixdown of the range, one plane per channel (transferred), or null when nothing is heard. */
  audio: { sampleRate: number; channels: ArrayBuffer[] } | null;
  sampleRate: number;
  channels: number;
  /** Sample frames of the file (the range's length at the mix rate). */
  samples: number;
  /** AAC bitrate (M4A). */
  audioBitrate: number;
  /** Starts paused (`ExportPauseSync`). */
  paused: boolean;
}

export interface AudioJobResult {
  samples: number;
  codec: string;
  ms: number;
}
