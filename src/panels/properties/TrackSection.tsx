import type { ReactNode } from "react";
import { documentStore, sessionStore } from "../../app/services.js";
import { MAX_TRACK_NAME, renameTrack, setTracksFlag, setTracksHeight } from "../../app/trackController.js";
import type { Project, Track, TrackKind } from "../../core/document/types.js";
import { selectedTrackIds, type Selection } from "../../core/store/selection.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { hasFlag, type TrackFlag, type TrackHeight } from "../../timeline/edit/tracks.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { Toggle } from "../../ui/Toggle.js";
// The section layout of the properties panel (shared until the Batch 25 framework).
import styles from "./ProjectSection.module.css";

const KIND_NAMES: Record<TrackKind, string> = { video: "Video", audio: "Audio", caption: "Captions" };
const HEIGHT_OPTIONS = [
  { value: "S", label: "Small (S)" },
  { value: "M", label: "Medium (M)" },
  { value: "L", label: "Large (L)" },
] as const;
const FLAGS: readonly { flag: TrackFlag; label: string }[] = [
  { flag: "targeted", label: "Target" },
  { flag: "locked", label: "Lock" },
  { flag: "muted", label: "Mute" },
  { flag: "solo", label: "Solo" },
  { flag: "hidden", label: "Hide" },
];

/** The selected track ids as one string, so the selector's value is stable (Object.is). */
const selectTrackKey = (selection: Selection) => selectedTrackIds(selection).join("\n");

/**
 * The Track section (spec §11: name, kind, height, lock/mute/solo/hide; and target, §6.12), shown when
 * tracks are selected (a track header click). The values are the first selected track's; an edit
 * applies to every selected track (one undo step; the height has none, it is session state).
 * TODO(batch 25): the collapsible section framework and mixed-value indicators.
 */
export function TrackSection() {
  const key = useStoreSelector(sessionStore.selection, selectTrackKey);
  const ids = key === "" ? [] : key.split("\n");
  const first = ids[0];
  const track = useStoreSelector(documentStore, (project: Project): Track | undefined => project.tracks.find((candidate) => candidate.id === first));
  if (!track) return null;
  const many = ids.length > 1;
  return (
    <section className={styles.section} aria-labelledby="track-section-title">
      <h3 id="track-section-title" className={styles.title}>
        {many ? `${ids.length} tracks` : "Track"}
      </h3>
      <div className={styles.grid}>
        {!many && (
          <>
            <span className={styles.label}>Name</span>
            <TextField value={track.name} onCommit={(text) => renameTrack(track.id, text)} ariaLabel="Track name" maxLength={MAX_TRACK_NAME} />
          </>
        )}
        <span className={styles.label}>Kind</span>
        <span className={styles.value}>{KIND_NAMES[track.kind]}</span>
        {track.kind !== "caption" && (
          <>
            <span className={styles.label}>Height</span>
            <Select<TrackHeight> value={track.height} options={HEIGHT_OPTIONS} onChange={(height) => setTracksHeight(ids, height)} label="Track height" />
          </>
        )}
        {FLAGS.filter(({ flag }) => hasFlag(track, flag)).map(({ flag, label }) => (
          <Row key={flag} label={label}>
            <Toggle checked={track[flag]} onChange={(value) => setTracksFlag(ids, flag, value)} label={label} />
          </Row>
        ))}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className={styles.label}>{label}</span>
      <span>{children}</span>
    </>
  );
}
