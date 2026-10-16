// Document invariants (spec §5.2). The DocumentStore runs `assertValid` after every command in dev
// builds; messages name the track and clip so a broken command is found at once.
import { usPerFrame } from "./time.js";
import { isFreeze, isMediaClip, LABEL_COLORS, type Clip, type ClipId, type ClipKind, type MediaItem, type Project, type TextClip, type Track, type TrackId, type TrackKind } from "./types.js";

export class DocumentInvariantError extends Error {
  readonly issues: readonly string[];

  constructor(context: string, issues: readonly string[]) {
    super(`Document invariants violated ${context}:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "DocumentInvariantError";
    this.issues = issues;
  }
}

const ALLOWED_CLIPS: Record<TrackKind, ReadonlySet<ClipKind>> = {
  video: new Set(["video", "image", "text", "solid"]),
  audio: new Set(["audio"]),
  caption: new Set(["caption"]),
};

const ROTATIONS: ReadonlySet<number> = new Set([0, 90, 180, 270]);
const PROXY_STATUSES: ReadonlySet<string> = new Set(["none", "pending", "ready", "failed"]);
const LABEL_SET: ReadonlySet<string> = new Set(LABEL_COLORS);
const isPositiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) > 0;

const trackLabel = (track: Track) => `track "${track.name}" (${track.id})`;
const clipLabel = (clip: Clip) => `clip "${clip.name}" (${clip.id})`;

/** Integer microseconds and sizes (P4), a quarter-turn rotation, and a path inside the project folder. */
function mediaIssues(key: string, media: MediaItem): string[] {
  const issues: string[] = [];
  const label = `media "${media.name}" (${media.id})`;
  if (key !== media.id) issues.push(`${label}: stored under key ${key}`);
  if (!Number.isInteger(media.durationUs) || media.durationUs < 0) issues.push(`${label}: durationUs ${media.durationUs} must be an integer >= 0`);
  if (media.width !== undefined && !isPositiveInteger(media.width)) issues.push(`${label}: width ${media.width} must be a positive integer`);
  if (media.height !== undefined && !isPositiveInteger(media.height)) issues.push(`${label}: height ${media.height} must be a positive integer`);
  if (media.rotation !== undefined && !ROTATIONS.has(media.rotation)) issues.push(`${label}: rotation ${media.rotation} must be 0, 90, 180 or 270`);
  if (media.fps !== undefined && !(isPositiveInteger(media.fps.num) && isPositiveInteger(media.fps.den))) {
    issues.push(`${label}: fps ${media.fps.num}/${media.fps.den} must be a ratio of positive integers`);
  }
  if ("relPath" in media.file && !isInsidePath(media.file.relPath)) issues.push(`${label}: relPath "${media.file.relPath}" must be a relative path inside the project folder`);
  const { proxy } = media;
  if (proxy) {
    if (!PROXY_STATUSES.has(proxy.status)) issues.push(`${label}: proxy status "${proxy.status}" is not none, pending, ready or failed`);
    if (!isPositiveInteger(proxy.width) || !isPositiveInteger(proxy.height)) issues.push(`${label}: proxy size ${proxy.width}x${proxy.height} must be positive integers`);
    if (!isInsidePath(proxy.relPath)) issues.push(`${label}: proxy relPath "${proxy.relPath}" must be a relative path inside the project folder`);
  }
  return issues;
}

function isInsidePath(path: string): boolean {
  return !path.startsWith("/") && !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

function clipIssues(project: Project, clip: Clip): string[] {
  const issues: string[] = [];
  const label = clipLabel(clip);
  if (!Number.isInteger(clip.start) || clip.start < 0) issues.push(`${label}: start ${clip.start} must be an integer frame >= 0`);
  if (!Number.isInteger(clip.duration) || clip.duration < 1) issues.push(`${label}: duration ${clip.duration} must be an integer >= 1`);
  if (clip.color !== undefined && !LABEL_SET.has(clip.color)) issues.push(`${label}: color "${clip.color}" is not a label color`);
  if (clip.kind === "text") issues.push(...textIssues(clip, label));
  if (!isMediaClip(clip)) return issues;

  if (!Number.isInteger(clip.in) || !Number.isInteger(clip.out)) issues.push(`${label}: in/out must be integer microseconds`);
  if (clip.in < 0) issues.push(`${label}: in ${clip.in} < 0`);
  if (clip.out <= clip.in) issues.push(`${label}: out ${clip.out} <= in ${clip.in}`);
  const media = project.media[clip.mediaId];
  if (!media) issues.push(`${label}: media ${clip.mediaId} does not exist`);
  // Image clips hold their picture for any length (a still has durationUs 0), so `out` is not bound
  // by the media. TODO(batch 34): animated images (loop or hold past their own duration).
  else if (clip.kind !== "image" && clip.out > media.durationUs) issues.push(`${label}: out ${clip.out} > media duration ${media.durationUs}`);
  if (isFreeze(clip)) {
    // A freeze frame holds `in` for any duration (Batch 27): no duration * speed invariant.
  } else if (!(clip.speed > 0)) {
    issues.push(`${label}: speed ${clip.speed} must be > 0 (0 only for a video freeze frame)`);
  } else {
    const sourceFrameUs = usPerFrame(project.settings.fps) * clip.speed;
    const expected = clip.duration * sourceFrameUs;
    if (Math.abs(clip.out - clip.in - expected) > sourceFrameUs) {
      issues.push(`${label}: out - in = ${clip.out - clip.in} us, expected duration * speed = ${Math.round(expected)} us (within 1 frame)`);
    }
  }
  return issues;
}

const isPositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

/** A text clip's content and style (spec §10.1): a string, a box with a positive width, a size, weight and line height the layout can use. */
function textIssues(clip: TextClip, label: string): string[] {
  const issues: string[] = [];
  const { text, style } = clip;
  if (typeof text?.value !== "string") issues.push(`${label}: text value must be a string`);
  if (text?.box?.mode !== "auto" && text?.box?.mode !== "fixed") issues.push(`${label}: text box mode must be auto or fixed`);
  if (!isPositive(text?.box?.width)) issues.push(`${label}: text box width ${String(text?.box?.width)} must be > 0`);
  if (typeof style?.fontFamily !== "string" || style.fontFamily === "") issues.push(`${label}: font family must be a name`);
  if (!isPositive(style?.fontSize)) issues.push(`${label}: font size ${String(style?.fontSize)} must be > 0`);
  if (!isPositive(style?.lineHeight)) issues.push(`${label}: line height ${String(style?.lineHeight)} must be > 0`);
  if (!(isPositive(style?.fontWeight) && style.fontWeight <= 1000)) issues.push(`${label}: font weight ${String(style?.fontWeight)} must be in 1..1000`);
  return issues;
}

/**
 * Returns every violated invariant (empty when valid). Linked clips may be offset on purpose
 * (flagged with a sync badge, Batch 16), so link groups are not checked here.
 */
export function validateProject(project: Project): string[] {
  const issues: string[] = [];
  const trackIds = new Set<TrackId>();
  const placed = new Set<ClipId>();
  let sawAudio = false;

  for (const track of project.tracks) {
    if (trackIds.has(track.id)) issues.push(`${trackLabel(track)}: duplicate track id`);
    trackIds.add(track.id);
    if (track.kind === "audio") sawAudio = true;
    else if (track.kind === "video" && sawAudio) issues.push(`${trackLabel(track)}: video track placed after an audio track`);

    let prev: Clip | null = null;
    for (const clipId of track.clipIds) {
      const clip = project.clips[clipId];
      if (!clip) {
        issues.push(`${trackLabel(track)}: lists clip ${clipId}, which is not in clips`);
        continue;
      }
      if (placed.has(clipId)) issues.push(`${clipLabel(clip)}: listed more than once across tracks`);
      placed.add(clipId);
      if (clip.trackId !== track.id) issues.push(`${clipLabel(clip)}: listed on ${trackLabel(track)} but points to track ${clip.trackId}`);
      if (!ALLOWED_CLIPS[track.kind].has(clip.kind)) issues.push(`${clipLabel(clip)}: a ${clip.kind} clip cannot sit on ${track.kind} ${trackLabel(track)}`);
      issues.push(...clipIssues(project, clip));
      if (prev) {
        if (clip.start < prev.start) issues.push(`${trackLabel(track)}: ${clipLabel(clip)} is listed after ${clipLabel(prev)} but starts earlier`);
        else if (clip.start < prev.start + prev.duration) issues.push(`${trackLabel(track)}: ${clipLabel(clip)} overlaps ${clipLabel(prev)}`);
      }
      prev = clip;
    }
  }

  for (const [key, clip] of Object.entries(project.clips)) {
    if (key !== clip.id) issues.push(`${clipLabel(clip)}: stored under key ${key}`);
    if (!placed.has(clip.id)) issues.push(`${clipLabel(clip)}: not listed on any track (trackId ${clip.trackId})`);
  }
  for (const [key, media] of Object.entries(project.media)) issues.push(...mediaIssues(key, media));
  for (const trackId of Object.keys(project.captionTracks)) {
    const track = project.tracks.find((t) => t.id === trackId);
    if (track?.kind !== "caption") issues.push(`captionTracks entry ${trackId} has no caption track`);
  }
  issues.push(...markerIssues(project));
  return issues;
}

/** Markers (spec §5.2, §6.13): unique ids, integer frames >= 0 in ascending order, a label string, one of the 8 label colors. */
function markerIssues(project: Project): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  let prev = -Infinity;
  for (const marker of project.markers) {
    const label = `marker ${marker.id}`;
    if (ids.has(marker.id)) issues.push(`${label}: listed more than once`);
    ids.add(marker.id);
    if (!Number.isInteger(marker.frame) || marker.frame < 0) issues.push(`${label}: frame ${marker.frame} must be an integer >= 0`);
    else if (marker.frame < prev) issues.push(`${label}: at frame ${marker.frame}, listed after a marker at ${prev} (markers are sorted by frame); it belongs before`);
    else prev = marker.frame;
    if (typeof marker.label !== "string") issues.push(`${label}: label must be a string`);
    if (!LABEL_SET.has(marker.color)) issues.push(`${label}: color ${String(marker.color)} is not a label color`);
  }
  return issues;
}

export function assertValid(project: Project, context: string): void {
  const issues = validateProject(project);
  if (issues.length > 0) throw new DocumentInvariantError(context, issues);
}
