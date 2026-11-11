// Open links with several watched folders: `/?open=<path>` is tried in each folder in order and the first
// project found opens; `/?open=<folder label>:<path>` names the folder.
import type { FsDir } from "../fs.js";
import { ensureAccess } from "../permissions.js";
import { resolveLinkTarget } from "../projectsFolder.js";
import type { WatchedFolder } from "./watchedFolders.js";

/** The folder label (when the text before the first `:` is one, case ignored) and the path of a cleaned link. */
export function splitOpenLink(link: string, labels: readonly string[]): { label: string | null; path: string } {
  const colon = link.indexOf(":");
  if (colon > 0) {
    const prefix = link.slice(0, colon).trim().toLowerCase();
    const label = labels.find((other) => other.toLowerCase() === prefix);
    if (label !== undefined) return { label, path: link.slice(colon + 1).replace(/^\/+/, "") };
  }
  return { label: null, path: link };
}

export type LinkResolution =
  | { kind: "found"; dir: FsDir; folder: WatchedFolder; path: string }
  /** Not found in the folders that can be read; `folders` want a click before they can be looked at. */
  | { kind: "needsAccess"; folders: WatchedFolder[]; path: string }
  /** `noProject`: the folder exists somewhere but holds no project.json. */
  | { kind: "missing"; reason: "missing" | "noProject"; path: string; searched: WatchedFolder[] }
  | { kind: "noFolders" };

/**
 * Where a link leads. Never asks for permission unless `request` is set (the start screen's button, a user
 * gesture): then each folder that needs it is asked, in order, until the project is found.
 */
export async function resolveOpenLink(folders: readonly WatchedFolder[], link: string, options: { request?: boolean } = {}): Promise<LinkResolution> {
  if (folders.length === 0) return { kind: "noFolders" };
  const { label, path } = splitOpenLink(link, folders.map((folder) => folder.label));
  const candidates = label === null ? [...folders] : folders.filter((folder) => folder.label === label);
  const locked: WatchedFolder[] = [];
  let reason: "missing" | "noProject" = "missing";
  for (const folder of candidates) {
    const access = await ensureAccess(folder.dir, { request: options.request === true, retry: options.request === true });
    if (access === "none") {
      locked.push(folder);
      continue;
    }
    try {
      const target = await resolveLinkTarget(folder.dir, path);
      if (target.ok) return { kind: "found", dir: target.dir, folder, path };
      if (target.reason === "noProject") reason = "noProject";
    } catch (error) {
      console.warn(`[open-link] cannot look into ${folder.name}`, error);
    }
  }
  if (locked.length > 0) return { kind: "needsAccess", folders: locked, path };
  return { kind: "missing", reason, path, searched: candidates };
}
