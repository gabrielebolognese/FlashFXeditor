// Accepted import types (spec §9.1). The extension decides; files without one (pasted images) fall
// back to their MIME type. WebM waits for the optional WebM batch (49) and is refused like any other
// unknown type.
import type { MediaItem } from "../core/document/types.js";

/** How a file is probed: mp4box in the worker, decodeAudioData, the worker image probe, or SVG. */
export type Container = "mp4" | "audio" | "image" | "svg";

export interface FileKind {
  container: Container;
  /** MIME type for the probe (Blob.type is empty for some files). */
  mime: string;
  /** Audio codec label for decodeAudioData formats. */
  audioCodec?: string;
}

// A Map, not an object literal: "constructor" or "__proto__" must not look like known extensions.
const BY_EXTENSION = new Map<string, FileKind>([
  ["mp4", { container: "mp4", mime: "video/mp4" }],
  ["mov", { container: "mp4", mime: "video/quicktime" }],
  ["m4v", { container: "mp4", mime: "video/x-m4v" }],
  ["m4a", { container: "mp4", mime: "audio/mp4" }],
  ["mp3", { container: "audio", mime: "audio/mpeg", audioCodec: "mp3" }],
  ["aac", { container: "audio", mime: "audio/aac", audioCodec: "aac" }],
  ["wav", { container: "audio", mime: "audio/wav", audioCodec: "pcm" }],
  ["ogg", { container: "audio", mime: "audio/ogg", audioCodec: "ogg" }],
  ["png", { container: "image", mime: "image/png" }],
  ["jpg", { container: "image", mime: "image/jpeg" }],
  ["jpeg", { container: "image", mime: "image/jpeg" }],
  ["webp", { container: "image", mime: "image/webp" }],
  ["gif", { container: "image", mime: "image/gif" }],
  ["svg", { container: "svg", mime: "image/svg+xml" }],
]);

const BY_MIME = new Map<string, FileKind>([...BY_EXTENSION.values()].map((kind) => [kind.mime, kind]));

export const ACCEPTED_EXTENSIONS: readonly string[] = [...BY_EXTENSION.keys()].map((ext) => `.${ext}`);

/** The extension without the dot, lower case; "" when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** null: refused (unknown type). */
export function classifyFile(name: string, type: string): FileKind | null {
  const ext = extensionOf(name);
  if (ext) return BY_EXTENSION.get(ext) ?? null;
  return BY_MIME.get(type.toLowerCase()) ?? null;
}

/** `showOpenFilePicker` types. "All files" stays available so unknown files reach the refusal toast. */
export const PICKER_TYPES = [
  { description: "Video", accept: { "video/*": [".mp4", ".mov", ".m4v"] } },
  { description: "Audio", accept: { "audio/*": [".mp3", ".m4a", ".aac", ".wav", ".ogg"] } },
  { description: "Images", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"] } },
];

/** `+ Image`'s picker types (spec §6.1): images only. */
export const IMAGE_PICKER_TYPES = PICKER_TYPES.filter((type) => type.description === "Images");

/** An SVG: vector, rasterized at the detail it is shown at (Batch 34). */
export const isSvgImage = (item: Pick<MediaItem, "kind" | "codec">): boolean => item.kind === "image" && item.codec === "svg";

/** An animated GIF or WebP (Batch 34): an image with a duration (a still has none). */
export const isAnimatedImage = (item: Pick<MediaItem, "kind" | "durationUs">): boolean => item.kind === "image" && item.durationUs > 0;

const CODEC_NAMES: [prefix: string, label: string][] = [
  ["avc1", "H.264"],
  ["avc3", "H.264"],
  ["hvc1", "HEVC"],
  ["hev1", "HEVC"],
  ["av01", "AV1"],
  ["vp09", "VP9"],
  ["vp08", "VP8"],
  ["mp4a.40", "AAC"],
  ["mp4a.6b", "MP3"],
  ["mp4a.69", "MP3"],
  ["mp4a", "AAC"],
  ["opus", "Opus"],
  ["alac", "ALAC"],
  ["ac-3", "AC-3"],
  ["ec-3", "E-AC-3"],
  ["sowt", "PCM"],
  ["twos", "PCM"],
  ["lpcm", "PCM"],
];

/** A readable codec name: "hvc1.1.6.L153.90" -> "HEVC"; unknown codecs in capitals; "" for none. */
export function codecLabel(codec: string | undefined): string {
  if (!codec) return "";
  const lower = codec.toLowerCase();
  return CODEC_NAMES.find(([prefix]) => lower.startsWith(prefix))?.[1] ?? codec.toUpperCase();
}
