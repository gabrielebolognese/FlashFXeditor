import { useCallback } from "react";
import { documentStore } from "../../app/services.js";
import { MAX_TRACK_NAME, renameTrack, setTracksFlag, setTracksHeight } from "../../app/trackController.js";
import type { Project, Track, TrackId, TrackKind } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { hasFlag, type TrackFlag, type TrackHeight } from "../../timeline/edit/tracks.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { MIXED, NONE, SKIP, useTracksShared } from "./useShared.js";

// The Track section (spec §11: name, kind, height, lock/mute/solo/hide; and target, §6.12), shown when
// tracks are selected (a track header click). With several tracks, values they do not share show `--`
// (a mixed switch sits halfway) and an edit applies to every selected track it fits (one undo step;
// the height has none, it is session state). The name row is for one track.

const KIND_NAMES: Record<TrackKind, string> = { video: "Video", audio: "Audio", caption: "Captions" };
const MIXED_OPTION = { value: "", label: "--" } as const;
const HEIGHT_OPTIONS = [
  { value: "S", label: "Small (S)" },
  { value: "M", label: "Medium (M)" },
  { value: "L", label: "Large (L)" },
] as const;
const FLAGS: readonly { flag: TrackFlag; label: string; get: (track: Track) => boolean | typeof SKIP }[] = (
  [
    ["targeted", "Target"],
    ["locked", "Lock"],
    ["muted", "Mute"],
    ["solo", "Solo"],
    ["hidden", "Hide"],
  ] as const
).map(([flag, label]) => ({ flag, label, get: (track: Track) => (hasFlag(track, flag) ? track[flag] : SKIP) }));

const getKind = (track: Track) => track.kind;
const getHeight = (track: Track) => (track.kind === "caption" ? SKIP : track.height);

function FlagRow({ ids, flag, label, get }: { ids: readonly TrackId[]; flag: TrackFlag; label: string; get: (track: Track) => boolean | typeof SKIP }) {
  const value = useTracksShared(ids, get);
  if (value === NONE) return null;
  return (
    <Row label={label}>
      <span className={styles.switchCell}>
        <Toggle checked={value === true} mixed={value === MIXED} onChange={(on) => setTracksFlag(ids, flag, on)} label={label} />
      </span>
    </Row>
  );
}

export function TrackSection({ ids }: { ids: readonly TrackId[] }) {
  const first = ids[0];
  const name = useStoreSelector(
    documentStore,
    useCallback((project: Project) => (ids.length === 1 ? (project.tracks.find((track) => track.id === first)?.name ?? null) : null), [ids, first]),
  );
  const kind = useTracksShared(ids, getKind);
  const height = useTracksShared(ids, getHeight);
  if (kind === NONE) return null;
  return (
    <>
      {name !== null && first !== undefined && (
        <Row label="Name">
          <TextField value={name} onCommit={(text) => renameTrack(first, text)} ariaLabel="Track name" maxLength={MAX_TRACK_NAME} />
        </Row>
      )}
      <Row label="Kind">
        <span className={styles.value}>{kind === MIXED ? "--" : KIND_NAMES[kind]}</span>
      </Row>
      {height !== NONE && (
        <Row label="Height">
          <Select<TrackHeight | ""> value={height === MIXED ? "" : height} options={height === MIXED ? [MIXED_OPTION, ...HEIGHT_OPTIONS] : HEIGHT_OPTIONS} onChange={(next) => next !== "" && setTracksHeight(ids, next)} label="Track height" />
        </Row>
      )}
      {FLAGS.map((entry) => (
        <FlagRow key={entry.flag} ids={ids} {...entry} />
      ))}
    </>
  );
}
