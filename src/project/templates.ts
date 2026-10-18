// Project templates (spec §15 "Save as template stores the current project settings + text presets +
// track layout (no media) in IndexedDB; New from template on the start screen", Batch 42): the frame
// size, frame rate and background, the tracks (kind, name, height, lock / mute / solo / hide / target)
// with the caption track's style, and the project's own text presets (its `presets/text/` folder).
// No media, clips or markers. A project made from a template starts with those tracks and presets.
import { MAX_DIMENSION, MIN_DIMENSION } from "../core/commands/projectCommands.js";
import { createStore, type Store } from "../core/store/createStore.js";
import { createProject as createDocument } from "../core/document/project.js";
import type { CaptionStyle, Project, Rational, RGBA, TextPreset, Track } from "../core/document/types.js";
import { validateProject } from "../core/document/validate.js";
import { sanitizePreset } from "../text/presets.js";
import type { KeyValueStore } from "./kv.js";

export interface TemplateTrack {
  kind: Track["kind"];
  name: string;
  height: Track["height"];
  locked: boolean;
  muted: boolean;
  solo: boolean;
  hidden: boolean;
  targeted: boolean;
  /** A caption track's style. */
  captionStyle?: CaptionStyle;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  /** ISO time it was saved. */
  createdAt: string;
  settings: { width: number; height: number; fps: Rational; background: RGBA };
  /** Bottom video track first, as `Project.tracks`. */
  tracks: TemplateTrack[];
  /** The project's text presets (spec §10.3 project scope). */
  presets: TextPreset[];
}

export const MAX_TEMPLATES = 50;
export const MAX_TEMPLATE_NAME = 80;
const KEY = "templates.v1";

/** Trimmed, one line, capped; empty names become null. */
export function cleanTemplateName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_TEMPLATE_NAME);
  return clean === "" ? null : clean;
}

/** A template of `project` and its presets (deep copies). */
export function templateFromProject(project: Project, presets: readonly TextPreset[], fields: { id: string; name: string; now: string }): ProjectTemplate {
  const { width, height, fps, background } = project.settings;
  return {
    id: fields.id,
    name: cleanTemplateName(fields.name) ?? cleanTemplateName(project.name) ?? "Template",
    createdAt: fields.now,
    settings: { width, height, fps: { ...fps }, background: { ...background } },
    tracks: project.tracks.map((track) => {
      const { kind, name, height: trackHeight, locked, muted, solo, hidden, targeted } = track;
      const style = project.captionTracks[track.id]?.style;
      return { kind, name, height: trackHeight, locked, muted, solo, hidden, targeted, ...(style && { captionStyle: structuredClone(style) }) };
    }),
    presets: structuredClone([...presets]),
  };
}

/** A new document with the template's settings and tracks (new track ids), as `base` otherwise. */
export function projectFromTemplate(template: ProjectTemplate, base: Project, newId: () => string): Project {
  const captionTracks: Project["captionTracks"] = {};
  const tracks: Track[] = template.tracks.map((track) => {
    const id = newId();
    if (track.kind === "caption" && track.captionStyle) captionTracks[id] = { style: structuredClone(track.captionStyle) };
    return { id, kind: track.kind, name: track.name, clipIds: [], locked: track.locked, muted: track.muted, solo: track.solo, hidden: track.hidden, targeted: track.targeted, height: track.height };
  });
  const { width, height, fps, background } = template.settings;
  return { ...base, settings: { ...base.settings, width, height, fps: { ...fps }, background: { ...background } }, tracks, captionTracks };
}

/** "1080×1920 · 30 fps · 3 tracks · 2 presets" */
export function describeTemplate(template: ProjectTemplate, formatFps: (fps: Rational) => string): string {
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [`${template.settings.width}×${template.settings.height}`, `${formatFps(template.settings.fps)} fps`, count(template.tracks.length, "track")];
  if (template.presets.length > 0) parts.push(count(template.presets.length, "preset"));
  return parts.join(" · ");
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isUnit = (value: unknown) => typeof value === "number" && value >= 0 && value <= 1;
const isSize = (value: unknown) => Number.isInteger(value) && (value as number) >= MIN_DIMENSION && (value as number) <= MAX_DIMENSION;
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) > 0;

/** A frame size, a rational frame rate and an RGBA background, or null. */
function sanitizeSettings(value: Record<string, unknown>): ProjectTemplate["settings"] | null {
  const { width, height, fps, background } = value;
  if (!isSize(width) || !isSize(height) || !isRecord(fps) || !isCount(fps.num) || !isCount(fps.den) || !isRecord(background)) return null;
  if (!["r", "g", "b", "a"].every((key) => isUnit(background[key]))) return null;
  const color = background as unknown as RGBA;
  return { width: width as number, height: height as number, fps: { num: fps.num as number, den: fps.den as number }, background: { r: color.r, g: color.g, b: color.b, a: color.a } };
}

const TRACK_KINDS: ReadonlySet<unknown> = new Set(["video", "audio", "caption"]);
const TRACK_HEIGHTS: ReadonlySet<unknown> = new Set(["S", "M", "L"]);

/** A track of a known kind, height and name (a caption track with its style), its switches booleans; null otherwise. */
function sanitizeTrack(value: unknown): TemplateTrack | null {
  if (!isRecord(value) || !TRACK_KINDS.has(value.kind) || !TRACK_HEIGHTS.has(value.height) || typeof value.name !== "string" || value.name.trim() === "") return null;
  if (value.kind === "caption" && !isRecord(value.captionStyle)) return null;
  const flag = (key: string, fallback: boolean) => (typeof value[key] === "boolean" ? (value[key] as boolean) : fallback);
  return {
    kind: value.kind as TemplateTrack["kind"],
    name: value.name,
    height: value.height as TemplateTrack["height"],
    locked: flag("locked", false),
    muted: flag("muted", false),
    solo: flag("solo", false),
    hidden: flag("hidden", false),
    targeted: flag("targeted", true),
    ...(value.kind === "caption" && { captionStyle: structuredClone(value.captionStyle) as unknown as CaptionStyle }),
  };
}

/** A stored template that still makes a valid project, its presets sanitized; null otherwise. */
export function sanitizeTemplate(value: unknown, now: string): ProjectTemplate | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "" || typeof value.name !== "string" || !Array.isArray(value.tracks) || !isRecord(value.settings)) return null;
  const name = cleanTemplateName(value.name);
  const settings = sanitizeSettings(value.settings);
  const tracks = value.tracks.map(sanitizeTrack);
  if (!name || !settings || tracks.includes(null)) return null;
  const template: ProjectTemplate = {
    id: value.id,
    name,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    settings,
    tracks: tracks as TemplateTrack[],
    presets: Array.isArray(value.presets) ? value.presets.map((preset) => sanitizePreset(preset, now)).filter((preset): preset is TextPreset => preset !== null) : [],
  };
  // The tracks and settings must make a valid project (spec §5.2 invariants).
  let n = 0;
  try {
    const project = projectFromTemplate(template, createDocument({ id: "template", name, now, appVersion: "" }), () => `t${++n}`);
    if (validateProject(project).length > 0) return null;
  } catch {
    return null;
  }
  return template;
}

/** The templates in IndexedDB, newest first. */
export class TemplateStore {
  readonly list: Store<readonly ProjectTemplate[]> = createStore<readonly ProjectTemplate[]>([]);
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly kv: KeyValueStore) {}

  async load(now = new Date().toISOString()): Promise<void> {
    try {
      const stored = await this.kv.get(KEY);
      const templates = Array.isArray(stored) ? stored.map((value) => sanitizeTemplate(value, now)).filter((template): template is ProjectTemplate => template !== null) : [];
      this.list.set(templates.slice(0, MAX_TEMPLATES));
    } catch (error) {
      console.warn("[templates] could not read templates", error);
    }
  }

  /** Adds a template first; a template with the same name is replaced. */
  save(template: ProjectTemplate): Promise<void> {
    const others = this.list.getState().filter((other) => other.id !== template.id && other.name.toLowerCase() !== template.name.toLowerCase());
    this.list.set([template, ...others].slice(0, MAX_TEMPLATES));
    return this.persist();
  }

  remove(id: string): Promise<void> {
    if (!this.list.getState().some((template) => template.id === id)) return this.writing;
    this.list.set(this.list.getState().filter((template) => template.id !== id));
    return this.persist();
  }

  find(id: string): ProjectTemplate | null {
    return this.list.getState().find((template) => template.id === id) ?? null;
  }

  private persist(): Promise<void> {
    this.writing = this.writing.then(async () => {
      try {
        await this.kv.set(KEY, this.list.getState());
      } catch (error) {
        console.warn("[templates] could not store templates", error);
      }
    });
    return this.writing;
  }
}
