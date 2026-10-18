// What an export asks for (a queue job's request) and the export log (spec §16: the last 20 jobs, in
// the Export tab), kept per project in session.json. A log entry keeps its request, so Export again
// runs the same settings, range, file name template and destination on the current document.
import type { Frame } from "../core/document/types.js";
import type { AudioFileFormat } from "./audioExport.js";
import { CUSTOM_PRESET_ID, DEFAULT_CUSTOM_SETTINGS, FILE_NAME_TEMPLATE, MAX_FILE_TEMPLATE, MAX_PRESET_NAME, sanitizeExportSettings, type ExportSettings } from "./presets.js";

export type ExportKind = "video" | "audio";
export type ExportDestination = "project" | "pick";
export type ExportRangeMode = "whole" | "inOut";

export interface ExportRequest {
  kind: ExportKind;
  /** The preset chosen (its id and name: the file name's `{preset}`). */
  presetId: string;
  presetName: string;
  settings: ExportSettings;
  /** Export audio's file type. */
  audioFormat: AudioFileFormat;
  /** Project frames [start, end); null: the whole timeline (to its content end when it runs). */
  range: { start: Frame; end: Frame } | null;
  template: string;
  destination: ExportDestination;
}

export type ExportLogStatus = "done" | "cancelled" | "failed";

export interface ExportLogEntry {
  id: string;
  /** The file's name (in exports/, or the picked file's); the intended name when it did not finish. */
  name: string;
  status: ExportLogStatus;
  /** Why it failed. */
  error?: string;
  /** When it ended (ms since the epoch). */
  at: number;
  /** The file's size (bytes; 0 when it did not finish). */
  bytes: number;
  /** The format in one line ("1080×1920 · 30 fps · H.264 · 12 Mbps · AAC 192 kbps", "WAV · 48 kHz stereo"). */
  summary: string;
  request: ExportRequest;
}

export const MAX_LOG_ENTRIES = 20;

/** `entry` first, then the others, at most MAX_LOG_ENTRIES. */
export function pushLogEntry(log: readonly ExportLogEntry[], entry: ExportLogEntry): ExportLogEntry[] {
  return [entry, ...log.filter((e) => e.id !== entry.id)].slice(0, MAX_LOG_ENTRIES);
}

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {});
const str = (value: unknown, fallback: string, max = 500) => (typeof value === "string" ? value.slice(0, max) : fallback);
const frame = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);

function sanitizeRange(value: unknown): { start: Frame; end: Frame } | null {
  const raw = obj(value);
  const start = frame(raw.start);
  const end = frame(raw.end);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

export function sanitizeRequest(value: unknown): ExportRequest {
  const raw = obj(value);
  const template = str(raw.template, FILE_NAME_TEMPLATE, MAX_FILE_TEMPLATE);
  return {
    kind: raw.kind === "audio" ? "audio" : "video",
    presetId: str(raw.presetId, CUSTOM_PRESET_ID, 100) || CUSTOM_PRESET_ID,
    presetName: str(raw.presetName, "Custom", MAX_PRESET_NAME),
    settings: sanitizeExportSettings(raw.settings, DEFAULT_CUSTOM_SETTINGS),
    audioFormat: raw.audioFormat === "m4a" ? "m4a" : "wav",
    range: sanitizeRange(raw.range),
    template: template.trim() === "" ? FILE_NAME_TEMPLATE : template,
    destination: raw.destination === "pick" ? "pick" : "project",
  };
}

const STATUSES: readonly ExportLogStatus[] = ["done", "cancelled", "failed"];

/** session.json's log: valid entries with unique ids, newest first as stored, at most MAX_LOG_ENTRIES. */
export function sanitizeExportLog(value: unknown): ExportLogEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: ExportLogEntry[] = [];
  for (const item of value) {
    const raw = obj(item);
    if (typeof raw.id !== "string" || raw.id === "" || seen.has(raw.id) || typeof raw.name !== "string" || !STATUSES.includes(raw.status as ExportLogStatus)) continue;
    seen.add(raw.id);
    entries.push({
      id: raw.id,
      name: raw.name.slice(0, 255),
      status: raw.status as ExportLogStatus,
      ...(typeof raw.error === "string" && { error: raw.error.slice(0, 500) }),
      at: typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : 0,
      bytes: typeof raw.bytes === "number" && Number.isFinite(raw.bytes) && raw.bytes >= 0 ? Math.round(raw.bytes) : 0,
      summary: str(raw.summary, ""),
      request: sanitizeRequest(raw.request),
    });
    if (entries.length === MAX_LOG_ENTRIES) break;
  }
  return entries;
}
