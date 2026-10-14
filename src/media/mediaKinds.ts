// Accepted import types (spec §9.1). The extension decides; files without one (pasted images) fall
// back to their MIME type. WebM waits for the optional WebM batch (49) and is refused like any other
// unknown type.

/** How a file is probed: mp4box in the worker, decodeAudioData, the worker image probe, or SVG. */
export type Container = "mp4" | "audio" | "image" | "svg";

export interface FileKind {
  container: Container;
  /** MIME type for the probe (Blob.type is empty for some files). */
  mime: string;
  /** Audio codec label for decodeAudioData formats. */
  audioCodec?: string;
}

const BY_EXTENSION: Record<string, FileKind> = {
  mp4: { container: "mp4", mime: "video/mp4" },
  mov: { container: "mp4", mime: "video/quicktime" },
  m4v: { container: "mp4", mime: "video/x-m4v" },
  m4a: { container: "mp4", mime: "audio/mp4" },
  mp3: { container: "audio", mime: "audio/mpeg", audioCodec: "mp3" },
  aac: { container: "audio", mime: "audio/aac", audioCodec: "aac" },
  wav: { container: "audio", mime: "audio/wav", audioCodec: "pcm" },
  ogg: { container: "audio", mime: "audio/ogg", audioCodec: "ogg" },
  png: { container: "image", mime: "image/png" },
  jpg: { container: "image", mime: "image/jpeg" },
  jpeg: { container: "image", mime: "image/jpeg" },
  webp: { container: "image", mime: "image/webp" },
  gif: { container: "image", mime: "image/gif" },
  svg: { container: "svg", mime: "image/svg+xml" },
};

const BY_MIME = new Map<string, FileKind>(Object.values(BY_EXTENSION).map((kind) => [kind.mime, kind]));

export const ACCEPTED_EXTENSIONS: readonly string[] = Object.keys(BY_EXTENSION).map((ext) => `.${ext}`);

/** The extension without the dot, lower case; "" when there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** null: refused (unknown type). */
export function classifyFile(name: string, type: string): FileKind | null {
  const ext = extensionOf(name);
  if (ext) return BY_EXTENSION[ext] ?? null;
  return BY_MIME.get(type.toLowerCase()) ?? null;
}

/** `showOpenFilePicker` types. "All files" stays available so unknown files reach the refusal toast. */
export const PICKER_TYPES = [
  { description: "Video", accept: { "video/*": [".mp4", ".mov", ".m4v"] } },
  { description: "Audio", accept: { "audio/*": [".mp3", ".m4a", ".aac", ".wav", ".ogg"] } },
  { description: "Images", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"] } },
];
