// Opening and creating project folders (spec §15, §9.7).
import { clampDimension, cleanProjectName } from "../core/commands/projectCommands.js";
import { createProject as createDocument, defaultTracks } from "../core/document/project.js";
import type { Project, Rational } from "../core/document/types.js";
import type { FsDir } from "./fs.js";
import { ensureFolderLayout, PROJECT_FILE, SESSION_FILE } from "./layout.js";
import { ensureAccess } from "./permissions.js";
import { parseProjectFile, ProjectFileError, serializeProject } from "./projectFile.js";
import { findRecovery, type Recovery } from "./recovery.js";
import { defaultSessionFile, parseSessionFile, serializeSession, type SessionFileData } from "./sessionFile.js";
import { projectPresetsDir } from "./presetFiles.js";
import { projectFromTemplate, type ProjectTemplate } from "./templates.js";
import { formatPresetFile, presetFileName } from "../text/presets.js";

export type OpenFailure = "permission" | "missing" | "invalid" | "exists";

export class ProjectOpenError extends Error {
  constructor(
    message: string,
    readonly reason: OpenFailure,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = "ProjectOpenError";
  }
}

export interface OpenedProject {
  dir: FsDir;
  /** "read": the user denied write access; the project opens read-only and nothing is written. */
  access: "readwrite" | "read";
  project: Project;
  session: SessionFileData;
  /** A newer project.json.tmp to offer for restore. */
  recovery: Recovery | null;
}

export interface NewProjectSettings {
  width: number;
  height: number;
  fps: Rational;
}

/** Reads a project folder. Call from a user gesture: it may show permission prompts. */
export async function openProjectFolder(dir: FsDir, options: { retry?: boolean } = {}): Promise<OpenedProject> {
  const access = await ensureAccess(dir, { request: true, retry: options.retry ?? false });
  if (access === "none") throw new ProjectOpenError(`Shorts Editor has no permission to read the folder "${dir.name}".`, "permission");

  const file = await dir.readFile(PROJECT_FILE);
  if (!file) throw new ProjectOpenError(`The folder "${dir.name}" has no project.json. Pick a project folder, or create a new project.`, "missing");
  let project: Project;
  try {
    project = parseProjectFile(file.text);
  } catch (error) {
    if (error instanceof ProjectFileError) {
      throw new ProjectOpenError(`The project in "${dir.name}" could not be read. ${error.message.split("\n")[0]}`, "invalid", error.issues);
    }
    throw error;
  }

  const writable = access === "readwrite";
  if (writable) await ensureFolderLayout(dir);
  let sessionText: string | null = null;
  try {
    sessionText = (await dir.readFile(SESSION_FILE))?.text ?? null;
  } catch (error) {
    console.warn("[project] could not read session.json", error);
  }
  const recovery = await findRecovery(dir, file, writable);
  return { dir, access, project, session: parseSessionFile(sessionText), recovery };
}

/**
 * Makes `dir` a new project folder: the §9.7 layout, session.json and project.json (written last, so
 * a folder with project.json is always complete). Refuses a folder that already holds a project.
 * With a `template` (spec §15 New from template) the project takes its tracks, caption style and
 * background, and its presets go into `presets/text/`; `settings` give the size and frame rate.
 */
export async function createProject(
  dir: FsDir,
  name: string,
  settings: NewProjectSettings,
  options: { appVersion: string; now?: Date; newId?: () => string; template?: ProjectTemplate | null },
): Promise<OpenedProject> {
  const access = await ensureAccess(dir, { request: true });
  if (access !== "readwrite") throw new ProjectOpenError(`Shorts Editor has no permission to write to the folder "${dir.name}".`, "permission");
  if (await dir.readFile(PROJECT_FILE)) {
    throw new ProjectOpenError(`The folder "${dir.name}" already contains a project. Open it instead, or pick an empty folder.`, "exists");
  }

  const now = (options.now ?? new Date()).toISOString();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const base = createDocument({ id: newId(), name: cleanProjectName(name) ?? cleanProjectName(dir.name) ?? "Untitled project", now, appVersion: options.appVersion });
  const template = options.template ?? null;
  const shaped = template ? projectFromTemplate(template, base, newId) : { ...base, tracks: defaultTracks(newId) };
  const project: Project = {
    ...shaped,
    settings: { ...shaped.settings, width: clampDimension(settings.width), height: clampDimension(settings.height), fps: { num: settings.fps.num, den: settings.fps.den } },
  };
  const session = defaultSessionFile();

  await ensureFolderLayout(dir);
  if (template && template.presets.length > 0) {
    const presets = await projectPresetsDir(dir, true);
    for (const preset of template.presets) await presets?.writeText(presetFileName(preset.id), formatPresetFile(preset));
  }
  await dir.writeText(SESSION_FILE, serializeSession(session));
  await dir.writeText(PROJECT_FILE, serializeProject(project, { now, appVersion: options.appVersion }));
  return { dir, access, project, session, recovery: null };
}
