import { useMemo } from "react";
import { Pencil } from "lucide-react";
import { standInBlocker, requestMakeEditable } from "../../app/standInController.js";
import { documentStore } from "../../app/services.js";
import type { Clip, ClipId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { Button } from "../../ui/Button.js";
import styles from "./StandInNotice.module.css";

/**
 * The properties header line of a baked stand-in (spec §21.5): what it stands for and why it is baked, with
 * Make editable, enabled when the conversion would succeed (the reason is the tooltip when it would not).
 */
export function StandInNotice({ id }: { id: ClipId }) {
  const clip = useStoreSelector(documentStore, (project): Clip | null => project.clips[id] ?? null);
  const block = clip?.fallbackOf;
  // The check validates the whole project with the conversion in place: once per stand-in version, not per render.
  const blocker = useMemo(() => (block && clip ? standInBlocker(documentStore.getState(), id) : null), [block, clip, id]);
  if (!block) return null;
  return (
    <div className={styles.notice}>
      <span className={styles.text}>
        Baked stand-in for a {block.kind} clip: {block.reason}
      </span>
      <Button size="compact" icon={Pencil} commandId="clip.makeEditable" disabled={blocker !== null} tooltip={blocker ?? "Replace this layer with the editable clip it stands for"} onClick={() => requestMakeEditable(id)}>
        Make editable
      </Button>
    </div>
  );
}
