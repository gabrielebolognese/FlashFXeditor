// Repair on open (spec §21.5, Batch 56): media records whose stored duration, size, frame rate or audio
// presence disagree with the file's header are corrected, and clips past a shortened media end are trimmed.
// The headers are read by the caller's `header` (the analysis worker in the app, through `readMediaHeader`);
// a file that cannot be read is left as it is. A mismatch within one frame is not a repair (the app's own
// probes and the header readers can differ by a few samples). Pure over the project and the files.
import { produce } from "immer";
import { fitFades } from "../core/document/fades.js";
import { usPerFrame } from "../core/document/time.js";
import { BOUND_SLACK_US, reconciled } from "../core/document/transitions.js";
import { isFreeze, type MediaItem, type Project, type Rational } from "../core/document/types.js";
import type { ProbeResult } from "../media/probe/types.js";
import type { FsDir } from "./fs.js";
import { backupStamp } from "./history.js";
import { HISTORY_DIR, subdir } from "./layout.js";
import { resolveFile } from "./mediaFiles.js";

export type HeaderReader = (file: File, name: string) => Promise<ProbeResult>;

export interface RepairReport {
  project: Project;
  /** Media records corrected. */
  media: number;
  /** Clips shortened because their media ended earlier than stored. */
  clipsTrimmed: number;
  /** One line per correction, for the log file. */
  lines: string[];
}

const sameRate = (a: Rational, b: Rational): boolean => a.num * b.den === b.num * a.den;
const seconds = (us: number): string => `${(us / 1_000_000).toFixed(3)} s`;

/** What `probe` says that the record contradicts (the record's own fields stay for what the probe does not give). */
function corrections(item: MediaItem, probe: ProbeResult, file: File, frameUs: number): { patch: Partial<MediaItem>; lines: string[] } {
  const patch: Partial<MediaItem> = {};
  const lines: string[] = [];
  if (Math.abs(probe.durationUs - item.durationUs) > frameUs) {
    patch.durationUs = probe.durationUs;
    lines.push(`${item.name}: duration ${seconds(item.durationUs)} -> ${seconds(probe.durationUs)}`);
  }
  if (probe.width !== undefined && probe.height !== undefined && (probe.width !== item.width || probe.height !== item.height)) {
    patch.width = probe.width;
    patch.height = probe.height;
    lines.push(`${item.name}: size ${item.width ?? "?"}x${item.height ?? "?"} -> ${probe.width}x${probe.height}`);
  }
  if (probe.fps && item.fps && !sameRate(probe.fps, item.fps)) {
    patch.fps = probe.fps;
    lines.push(`${item.name}: frame rate ${item.fps.num}/${item.fps.den} -> ${probe.fps.num}/${probe.fps.den}`);
  }
  if (probe.hasAudio !== item.hasAudio) {
    patch.hasAudio = probe.hasAudio;
    lines.push(`${item.name}: audio ${item.hasAudio ? "yes" : "no"} -> ${probe.hasAudio ? "yes" : "no"}`);
  }
  if (item.size !== undefined && item.size !== file.size) {
    patch.size = file.size;
    lines.push(`${item.name}: file size ${item.size} -> ${file.size} bytes`);
  }
  return { patch, lines };
}

/** Probes `items` four at a time. */
async function mapLimited<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let index = next++; index < items.length; index = next++) out[index] = await work(items[index] as T);
  });
  await Promise.all(runners);
  return out;
}

/** The corrected project and what was done (the same project object when nothing needed repair). */
export async function repairProject(project: Project, dir: FsDir, header: HeaderReader): Promise<RepairReport> {
  const frameUs = usPerFrame(project.settings.fps);
  const items = Object.values(project.media).filter((item) => "relPath" in item.file);
  const probed = await mapLimited(items, 4, async (item) => {
    try {
      const file = await resolveFile(dir, (item.file as { relPath: string }).relPath);
      if (!file) return null;
      return { item, ...corrections(item, await header(file, file.name), file, frameUs) };
    } catch {
      // Unreadable (a type without a header reader, a damaged file): the app's own probes deal with it.
      return null;
    }
  });
  const found = probed.filter((entry): entry is NonNullable<typeof entry> => entry !== null && Object.keys(entry.patch).length > 0);
  if (found.length === 0) return { project, media: 0, clipsTrimmed: 0, lines: [] };

  const lines = found.flatMap((entry) => entry.lines);
  let trimmed = 0;
  const repaired = produce(project, (draft) => {
    for (const { item, patch } of found) Object.assign(draft.media[item.id] as MediaItem, patch);
    const shortened = new Map(found.filter((entry) => entry.patch.durationUs !== undefined).map((entry) => [entry.item.id, entry.patch.durationUs as number]));
    if (shortened.size === 0) return;
    for (const clip of Object.values(draft.clips)) {
      if ((clip.kind !== "video" && clip.kind !== "audio") || isFreeze(clip)) continue;
      const end = shortened.get(clip.mediaId);
      if (end === undefined || clip.out <= end + BOUND_SLACK_US) continue;
      const before = clip.duration;
      clip.out = end;
      if (clip.in >= end) clip.in = Math.max(0, end - Math.round(frameUs * clip.speed));
      clip.duration = Math.max(1, Math.min(clip.duration, Math.round((clip.out - clip.in) / (frameUs * clip.speed))));
      if ("fades" in clip) clip.fades = fitFades(clip.fades, clip.duration);
      if (clip.duration !== before) {
        trimmed++;
        lines.push(`clip ${clip.name}: ${before} -> ${clip.duration} frames (media ends at ${seconds(end)})`);
      }
    }
  });
  return { project: reconciled(project, repaired), media: found.length, clipsTrimmed: trimmed, lines };
}

/** history/repair-YYYYMMDD-HHMMSS.log (UTC, the stamp of the backups). */
export function repairLogName(date: Date): string {
  return `repair-${backupStamp(date)}.log`;
}

/** Writes the log file; returns its path inside the project folder. */
export async function writeRepairLog(dir: FsDir, report: RepairReport, now: Date): Promise<string> {
  const history = await subdir(dir, HISTORY_DIR);
  const name = repairLogName(now);
  const head = `Repaired on open ${now.toISOString()}: ${report.media} media record(s) corrected, ${report.clipsTrimmed} clip(s) trimmed.`;
  await history.writeText(name, `${head}\n${report.lines.map((line) => `- ${line}`).join("\n")}\n`);
  return `${HISTORY_DIR}/${name}`;
}
