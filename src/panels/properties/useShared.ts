import { useCallback } from "react";
import { documentStore } from "../../app/services.js";
import type { Clip, ClipId, Project, Track, TrackId } from "../../core/document/types.js";
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
  const select = useCallback(
    (project: Project): Shared<V> => {
      let result: Shared<V> = NONE;
      for (const id of ids) {
        const clip = project.clips[id];
        if (!clip) continue;
        const value = get(clip, project);
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
