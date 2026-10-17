// The Audio section's number fields (spec §11, Batch 37; §3.3, P1, P2): the clip gain in dB and the
// fades in frames of the selected audio clips (the value they share, or null when mixed: `--`).
// - Gain: typed values set every clip; arrow steps add to each clip's own gain and coalesce into one
//   undo step; a label scrub shows its value in the field only and applies once on release (the mix,
//   the waveform and the rubber band change with that one command: nothing renders while it runs).
//   Volume keys (the stopwatch, the rubber band): a keyed clip shows, and is edited at, its gain at the
//   playhead; the field re-reads when the playhead moves (DOM writes only) while a target is keyed.
// - Fades: frames from the clip's start (in) or end (out), clamped to what the clip takes.
import { clipRel, gainDbAt, hasSectionKeys } from "../../core/document/keyframes.js";
import type { ClipId, Frame, MediaClip, Project } from "../../core/document/types.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import { fadesOf, setFades, type FadeEdge } from "../../timeline/edit/fades.js";
import { isAudioClip, setGains } from "../../timeline/edit/volume.js";
import { roundTo, type NumberBinding } from "../../ui/NumberField.js";
import { shared } from "./context.js";

export interface AudioBindingDeps {
  document: Pick<DocumentStore, "getState" | "subscribe" | "dispatch">;
  /** The playhead (keyed clips are shown and edited there); without it, the clips' own gain. */
  playhead?: { get(): Frame; subscribe(listener: () => void): () => void };
}

function audioClips(project: Project, ids: readonly ClipId[]): MediaClip[] {
  return ids.map((id) => project.clips[id]).filter(isAudioClip);
}

/** The gain a clip shows: at the playhead `at` when its Volume is keyed. */
export function shownGain(clip: MediaClip, at: Frame | null): number {
  return at !== null && hasSectionKeys(clip.keyframes, "volume") ? gainDbAt(clip, clipRel(clip, at)) : clip.volume.gainDb;
}

/** The gain field (dB, one decimal) over the audio clips among `ids`. */
export function gainBinding(deps: AudioBindingDeps, ids: readonly ClipId[]): NumberBinding {
  const at = () => deps.playhead?.get() ?? null;
  const apply = (valueOf: (clip: MediaClip) => number, coalesceKey?: string) => {
    const project = deps.document.getState();
    const playhead = at();
    const changes = new Map(audioClips(project, ids).map((clip) => [clip.id, valueOf(clip)] as const));
    const command = setGains(project, changes, { label: "Change volume", ...(coalesceKey !== undefined && { coalesceKey }), ...(playhead !== null && { at: playhead }) });
    if (command) deps.document.dispatch(command);
  };
  return {
    read() {
      const playhead = at();
      const value = shared(audioClips(deps.document.getState(), ids), (clip) => roundTo(shownGain(clip, playhead), 1));
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      const stops = [deps.document.subscribe(() => listener(), { affects: ["audio", "clips"] })];
      // A keyed gain changes along the timeline: re-read when the playhead moves (DOM only, P1).
      const keyed = () => audioClips(deps.document.getState(), ids).some((clip) => hasSectionKeys(clip.keyframes, "volume"));
      if (deps.playhead) stops.push(deps.playhead.subscribe(() => keyed() && listener()));
      return () => {
        for (const stop of stops) stop();
      };
    },
    set(value) {
      apply(() => value);
    },
    change(delta, phase) {
      // The field shows a scrub's value itself; the release applies it (cancel: nothing changed).
      if (phase === "scrub" || phase === "cancel" || delta === 0) return;
      const playhead = at();
      apply((clip) => roundTo(shownGain(clip, playhead) + delta, 1), phase === "step" ? "properties.gain" : undefined);
    },
  };
}

/** A fade field (frames) over the audio clips among `ids`. */
export function fadeBinding(deps: Pick<AudioBindingDeps, "document">, ids: readonly ClipId[], edge: FadeEdge): NumberBinding {
  const apply = (valueOf: (clip: MediaClip) => number, coalesceKey?: string) => {
    const project = deps.document.getState();
    const changes = new Map(audioClips(project, ids).map((clip) => [clip.id, valueOf(clip)] as const));
    const command = setFades(project, edge, changes, edge === "in" ? "Fade in" : "Fade out");
    if (command) deps.document.dispatch(coalesceKey ? { ...command, coalesceKey } : command);
  };
  return {
    read() {
      const value = shared(audioClips(deps.document.getState(), ids), (clip) => fadesOf(clip)[edge]);
      return value && !value.mixed ? value.value : null;
    },
    subscribe(listener) {
      return deps.document.subscribe(() => listener(), { affects: ["clips"] });
    },
    set(value) {
      apply(() => value);
    },
    change(delta, phase) {
      if (phase === "scrub" || phase === "cancel" || delta === 0) return;
      apply((clip) => fadesOf(clip)[edge] + delta, phase === "step" ? `properties.fade.${edge}` : undefined);
    },
  };
}
