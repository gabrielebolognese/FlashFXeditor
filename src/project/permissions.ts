// Permission flow (spec §15): read/write when granted (asking if the browser would prompt), otherwise
// read-only, otherwise nothing. A denied permission is asked again only on an explicit retry click.
import type { FsDir, PermissionMode, PermissionStatus } from "./fs.js";

export type Access = "readwrite" | "read" | "none";

export interface AccessOptions {
  /** May show browser prompts (call from a user gesture). false only checks. */
  request: boolean;
  /** Also ask for permissions already denied (the user clicked "Allow editing" / "Try again"). */
  retry?: boolean;
}

async function ask(dir: FsDir, mode: PermissionMode, options: AccessOptions): Promise<boolean> {
  let status: PermissionStatus;
  try {
    status = await dir.queryPermission(mode);
    // Requests need a user gesture; without one the browser throws and we stay at "prompt".
    const askable = status === "prompt" || (status === "denied" && options.retry === true);
    if (askable && options.request) status = await dir.requestPermission(mode);
  } catch (error) {
    console.warn(`[permissions] ${mode} on "${dir.name}"`, error);
    return false;
  }
  return status === "granted";
}

export async function ensureAccess(dir: FsDir, options: AccessOptions): Promise<Access> {
  if (await ask(dir, "readwrite", options)) return "readwrite";
  if (await ask(dir, "read", options)) return "read";
  return "none";
}
