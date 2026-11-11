// Open links (spec §21.5, Batch 56): `/?open=<path>` opens the project folder at <path> inside a watched
// folder (inbox/watchedFolders.ts keeps them; inbox/links.ts tries each in order).
import type { FsDir } from "./fs.js";
import { PROJECT_FILE } from "./layout.js";

/** The `open` parameter of a query string (`?open=interop/basic`), cleaned to segments joined by `/`; null when absent or unusable. */
export function parseOpenLink(search: string): string | null {
  const raw = new URLSearchParams(search).get("open");
  if (raw === null) return null;
  const segments = openSegments(raw);
  return segments && segments.length > 0 ? segments.join("/") : null;
}

/** The segments of a link path: `\` counts as `/`, empty and `.` segments are dropped, `..` makes the path unusable (null). */
export function openSegments(path: string): string[] | null {
  const parts = path.replace(/\\/g, "/").split("/").filter((part) => part !== "" && part !== ".");
  return parts.some((part) => part === "..") ? null : parts;
}

/** The query string without its `open` parameter (what the address shows once the link is used). */
export function withoutOpenLink(search: string): string {
  const params = new URLSearchParams(search);
  params.delete("open");
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}

export type LinkTarget = { ok: true; dir: FsDir } | { ok: false; reason: "missing" | "noProject" };

/** The project folder at `path` inside `root`: it must exist and hold a project.json. */
export async function resolveLinkTarget(root: FsDir, path: string): Promise<LinkTarget> {
  const segments = openSegments(path);
  if (!segments || segments.length === 0) return { ok: false, reason: "missing" };
  let dir: FsDir | null = root;
  for (const segment of segments) {
    dir = await dir.dir(segment);
    if (!dir) return { ok: false, reason: "missing" };
  }
  const file = await dir.readFile(PROJECT_FILE);
  return file ? { ok: true, dir } : { ok: false, reason: "noProject" };
}
