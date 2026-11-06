import { Layers } from "lucide-react";
import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import { cardImages } from "../../app/mediaController.js";
import { compoundItem, dropCompoundOnCanvas, placeCompoundAtPlayhead } from "../../app/dropController.js";
import { draggingMedia, pressDragCard, takeClickAfterDrag } from "../../app/mediaGestures.js";
import { documentStore, themeBridge } from "../../app/services.js";
import { formatTimecode } from "../../core/document/time.js";
import type { Project, Sequence } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { CardImage } from "../../media/ThumbnailStore.js";
import { drawCompoundPoster } from "../../timeline/view/compoundPoster.js";
import { EmptyState } from "../../ui/EmptyState.js";
import styles from "./MediaTab.module.css";

const POSTER_W = 320;
const POSTER_H = 180;

const selectSequences = (project: Project) => project.sequences;
const selectClips = (project: Project) => project.clips;
const selectProject = (project: Project) => project;
const selectFps = (project: Project) => project.settings.fps;

/** The media a sequence shows, through its nested compounds too (what the poster waits for). */
function mediaOf(project: Project, sequence: Sequence, seen = new Set<string>()): string[] {
  const ids = new Set<string>();
  if (seen.has(sequence.id)) return [];
  seen.add(sequence.id);
  for (const track of sequence.tracks) {
    for (const clipId of track.clipIds) {
      const clip = project.clips[clipId];
      if (clip && (clip.kind === "image" || clip.kind === "video" || clip.kind === "lottie")) ids.add(clip.mediaId);
      if (clip?.kind === "compound") {
        const inner = project.sequences[clip.sequenceId];
        if (inner) for (const id of mediaOf(project, inner, seen)) ids.add(id);
      }
    }
  }
  return [...ids];
}

/** A sequence's poster: its first frame sketched on a canvas (see `timeline/view/compoundPoster.ts`), redrawn when a media picture arrives. */
function SequencePoster({ sequence }: { sequence: Sequence }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const posters = useStoreSelector(cardImages, (store) => store);
  const project = useStoreSelector(documentStore, selectProject);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { color } = themeBridge.theme;
    const images = new Map<string, CardImage>();
    const draw = () => {
      ctx.clearRect(0, 0, POSTER_W, POSTER_H);
      drawCompoundPoster(
        ctx,
        project,
        sequence,
        0,
        { x: 0, y: 0, w: POSTER_W, h: POSTER_H },
        (id) => {
          const image = images.get(id);
          return image ? { image: image.bitmap, sx: image.sx, sy: image.sy, sw: image.sw, sh: image.sh } : null;
        },
        { backdrop: color.surface3, placeholder: color.surface5 },
      );
      canvas.dataset.ready = "";
    };
    const stops = posters
      ? mediaOf(project, sequence).map((id) =>
          posters.observe(id, (image) => {
            if (image) images.set(id, image);
            else images.delete(id);
            draw();
          }),
        )
      : [];
    draw();
    return () => {
      for (const stop of stops) stop();
    };
  }, [project, sequence, posters]);
  return <canvas ref={ref} className={styles.poster} width={POSTER_W} height={POSTER_H} aria-hidden="true" />;
}

function SequenceCard({ sequence, uses, fps }: { sequence: Sequence; uses: number; fps: Project["settings"]["fps"] }) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pressDragCard(event.nativeEvent, event.currentTarget, {
      items: () => {
        const item = compoundItem(documentStore.getState(), sequence.id);
        return item ? [item] : [];
      },
      dropOnCanvas: (point) => dropCompoundOnCanvas(sequence.id, point),
    });
  };
  return (
    <div
      className={styles.card}
      data-sequence-id={sequence.id}
      data-unused={uses === 0 || undefined}
      role="option"
      aria-selected={false}
      tabIndex={-1}
      data-tooltip="Drag to the timeline to add an instance, double-click to add one at the playhead"
      onPointerDown={onPointerDown}
      onDoubleClick={() => placeCompoundAtPlayhead(sequence.id)}
    >
      <div className={styles.thumb} data-thumb="">
        <Layers className={styles.placeholderIcon} aria-hidden="true" />
        <SequencePoster sequence={sequence} />
        <span className={styles.badge}>
          <span className={styles.duration}>{formatTimecode(sequence.duration, fps)}</span>
        </span>
        <span className={styles.uses}>{uses === 0 ? "Unused" : `Used ${uses}×`}</span>
      </div>
      <div className={styles.cardInfo}>
        <Layers className={styles.kindIcon} aria-label="compound" />
        <span className={styles.name}>{sequence.name}</span>
      </div>
      <div className={styles.meta}>{`${sequence.size.w}×${sequence.size.h}`}</div>
    </div>
  );
}

/**
 * The Compounds bin (spec §21.10, Batch 63): every sequence of the project as a card with its poster,
 * length, size and number of instances. A drag out adds an instance (the timeline's media drop rules);
 * a double-click adds one at the playhead. Nothing here renders during playback (P1): the cards change
 * with edits only.
 */
export function CompoundsBin() {
  const sequences = useStoreSelector(documentStore, selectSequences);
  const clips = useStoreSelector(documentStore, selectClips);
  const fps = useStoreSelector(documentStore, selectFps);
  const list = useMemo(() => Object.values(sequences), [sequences]);
  const uses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const clip of Object.values(clips)) if (clip.kind === "compound") counts.set(clip.sequenceId, (counts.get(clip.sequenceId) ?? 0) + 1);
    return counts;
  }, [clips]);
  if (list.length === 0) {
    return <EmptyState icon={Layers} title="No compounds yet" text="Select clips on the timeline and choose Make compound clip (Mod+Alt+G) to nest them." />;
  }
  return (
    <div className={styles.scroll} role="listbox" aria-label="Compounds" onClick={() => void takeClickAfterDrag()} data-dragging={draggingMedia() || undefined}>
      <div className={styles.grid}>
        {list.map((sequence) => (
          <SequenceCard key={sequence.id} sequence={sequence} uses={uses.get(sequence.id) ?? 0} fps={fps} />
        ))}
      </div>
    </div>
  );
}
