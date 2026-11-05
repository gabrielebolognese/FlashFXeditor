import { useCallback, useEffect, useState } from "react";
import { documentStore, sessionStore } from "../../app/services.js";
import { clipRel } from "../../core/document/keyframes.js";
import { clipLookAt, hasLookKeys } from "../../core/document/keyProps.js";
import type { Clip, ClipId, Keyframes, Project, Track, TrackId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";

/** The selected items differ (spec §11: the field shows `--`). */
export const MIXED: unique symbol = Symbol("mixed");
/** None of the selected items has the property. */
export const NONE: unique symbol = Symbol("none");
/** What `get` returns for an item that does not have the property (skipped). */
export const SKIP: unique symbol = Symbol("skip");

export type Shared<V> = V | typeof MIXED | typeof NONE;

/**
 * The value of `get` the clips of `ids` share, MIXED or NONE, as a narrow selector (spec §3.3): the
 * component renders only when that value changes. `get` must be stable (module scope) and return a
 * primitive, or SKIP for a clip without the property.
 */
export function useClipsShared<V extends string | number | boolean | null>(ids: readonly ClipId[], get: (clip: Clip, project: Project) => V | typeof SKIP): Shared<V> {
  // A clip with keyed look properties (Batch 61) shows them at the playhead, refreshed once the
  // playhead settles (never during playback or a scrub: zero React commits, P1).
  const keyed = useStoreSelector(documentStore, useCallback((project: Project) => ids.some((id) => hasLookKeys((project.clips[id] as { keyframes?: Keyframes } | undefined)?.keyframes)), [ids]));
  const tick = useSettledPlayhead(keyed);
  const select = useCallback(
    (project: Project): Shared<V> => {
      const at = keyed ? sessionStore.state.getState().playhead : null;
      let result: Shared<V> = NONE;
      for (const id of ids) {
        const clip = project.clips[id];
        if (!clip) continue;
        const value = get(at === null ? clip : clipLookAt(clip, clipRel(clip, at)), project);
        if (value === SKIP) continue;
        if (result === NONE) result = value;
        else if (!Object.is(result, value)) return MIXED;
      }
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` only forces a re-read at the settled playhead
    [ids, get, keyed, tick],
  );
  return useStoreSelector(documentStore, select);
}

/** A counter that changes 150 ms after the playhead stops moving, while `active`: lets a hook re-read at rest. */
function useSettledPlayhead(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = sessionStore.state.select(
      (state) => state.playhead,
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => setTick((value) => value + 1), 150);
      },
    );
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [active]);
  return tick;
}

/** `useClipsShared` for tracks: the value of `get` the tracks of `ids` share, MIXED or NONE. */
export function useTracksShared<V extends string | number | boolean | null>(ids: readonly TrackId[], get: (track: Track) => V | typeof SKIP): Shared<V> {
  const select = useCallback(
    (project: Project): Shared<V> => {
      let result: Shared<V> = NONE;
      for (const track of project.tracks) {
        if (!ids.includes(track.id)) continue;
        const value = get(track);
        if (value === SKIP) continue;
        if (result === NONE) result = value;
        else if (!Object.is(result, value)) return MIXED;
      }
      return result;
    },
    [ids, get],
  );
  return useStoreSelector(documentStore, select);
}
