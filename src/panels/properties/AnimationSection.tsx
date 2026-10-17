import { ChevronsRight, Timer } from "lucide-react";
import { useMemo } from "react";
import { liveEdit } from "../../app/liveEdit.js";
import { documentStore } from "../../app/services.js";
import { chooseTextAnim, previewTextAnim, SIDE_NAMES } from "../../app/textAnimController.js";
import { fpsToNumber } from "../../core/document/time.js";
import { TEXT_ANIM_IDS, type Clip, type ClipId, type Project, type Rational, type TextAnimId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { animAtlas } from "../../render/compositor/Compositor.js";
import { animEase, animLength, EASE_LABELS, isPlayable, TEXT_ANIMS, TEXT_EASES, type TextEase } from "../../text/anim.js";
import { animEdits, setTextAnims, type AnimSide } from "../../timeline/edit/textAnim.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField } from "../../ui/NumberField.js";
import { Select, type SelectOption } from "../../ui/Select.js";
import { ANIM_PRECISION, animBinding } from "./animBinding.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { MIXED, NONE, SKIP, useClipsShared } from "./useShared.js";

// The Animation section (spec §11, §10.4) of the selected text clips: for the in and for the out
// animation, a row of chips (None and the 12 animations; one click sets it on every selected text
// clip, one undo step, and previews it: the clip's start, or its end, plays once and the playhead comes
// back), the duration and the stagger in seconds (bound outside React, animBinding.ts: a label scrub
// shows live at the playhead) and the easing. A duration longer than half the clip plays over half
// of it (a hint says so). Presets keep the animations (Batch 30's Save / Update / Apply).

type Getter<V> = (clip: Clip) => V | typeof SKIP;

function getters(side: AnimSide) {
  const anim = (clip: Clip) => (clip.kind === "text" && isPlayable(clip[side]) ? clip[side] : null);
  const id: Getter<string> = (clip) => (clip.kind === "text" ? (anim(clip)?.id ?? "none") : SKIP);
  // Whether its units come one after another with a delay (characters, words, lines; a typewriter types by count).
  const staggered: Getter<boolean> = (clip) => {
    const a = anim(clip);
    return a ? animAtlas(a) !== "block" && a.id !== "typewriter" : SKIP;
  };
  const ease: Getter<string> = (clip) => anim(clip)?.ease ?? (anim(clip) ? "auto" : SKIP);
  // The frames it plays over when that is less than asked (half the clip), else -1.
  const clamped: Getter<number> = (clip) => {
    const a = anim(clip);
    if (!a) return SKIP;
    const length = animLength(a, clip.duration);
    return length < a.duration ? length : -1;
  };
  return { id, staggered, ease, clamped };
}

const GETTERS = { animIn: getters("animIn"), animOut: getters("animOut") } as const;
const selectFps = (project: Project): Rational => project.settings.fps;

function AnimationRows({ ids, primary, side }: { ids: readonly ClipId[]; primary: ClipId; side: AnimSide }) {
  const get = GETTERS[side];
  const id = useClipsShared(ids, get.id);
  const staggered = useClipsShared(ids, get.staggered);
  const ease = useClipsShared(ids, get.ease);
  const clamped = useClipsShared(ids, get.clamped);
  const fps = useStoreSelector(documentStore, selectFps);
  const replay = () => {
    const target = ids.includes(primary) ? primary : ids[0];
    if (target !== undefined) previewTextAnim(target, side);
  };
  const bindings = useMemo(() => {
    const deps = { document: documentStore, live: liveEdit, onCommit: replay };
    return { duration: animBinding(deps, ids, side, "duration"), stagger: animBinding(deps, ids, side, "stagger") };
    // `replay` reads `ids`, `primary` and `side` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, primary, side]);
  const has = typeof id === "string" && id !== "none";
  const sideName = SIDE_NAMES[side];
  const title = side === "animIn" ? "In" : "Out";
  const step = 1 / fpsToNumber(fps);
  const anyAnim = id === MIXED || has;
  const defaultEase: TextEase | null = has ? animEase({ id: id as TextAnimId }, side === "animIn" ? "in" : "out") : null;
  const easeOptions: SelectOption<string>[] = [
    ...(ease === MIXED ? [{ value: "", label: "--" }] : []),
    { value: "auto", label: defaultEase ? `Auto (${EASE_LABELS[defaultEase]})` : "Auto" },
    ...TEXT_EASES.map((value) => ({ value, label: EASE_LABELS[value] })),
  ];
  const setEase = (next: string) => {
    if (next === "") return;
    const project = documentStore.getState();
    const edits = animEdits(project, ids, side, (current) => {
      if (!isPlayable(current)) return undefined;
      const rest = { ...current };
      delete rest.ease;
      return next === "auto" ? rest : { ...rest, ease: next as TextEase };
    });
    const command = setTextAnims(project, edits, { label: `Change ${sideName} animation easing` });
    if (!command) return;
    documentStore.dispatch(command);
    replay();
  };
  return (
    <>
      <Row label={title}>
        <div className={styles.chips} role="group" aria-label={`${title} animation`}>
          <IconButton text="None" label={`No ${sideName} animation`} pressed={id === "none"} onClick={() => chooseTextAnim(ids, side, null, primary)} />
          {TEXT_ANIM_IDS.map((anim) => (
            <IconButton key={anim} text={TEXT_ANIMS[anim].label} label={`${title}: ${TEXT_ANIMS[anim].label}. Click to preview`} pressed={id === anim} onClick={() => chooseTextAnim(ids, side, anim, primary)} />
          ))}
        </div>
      </Row>
      <Row label="Duration">
        <NumberField
          label={<Timer aria-hidden="true" />}
          unit="s"
          binding={bindings.duration}
          precision={ANIM_PRECISION}
          step={step}
          min={step}
          disabled={!anyAnim}
          ariaLabel={`${title} animation duration`}
        />
      </Row>
      {typeof clamped === "number" && clamped >= 0 && (
        <span className={styles.hint}>{clamped === 0 ? "The clip is too short to play it" : `Plays in ${(clamped / fpsToNumber(fps)).toFixed(ANIM_PRECISION)} s: half the clip`}</span>
      )}
      <Row label="Stagger">
        <NumberField
          label={<ChevronsRight aria-hidden="true" />}
          unit="s"
          binding={bindings.stagger}
          precision={ANIM_PRECISION}
          step={step}
          min={0}
          disabled={staggered !== true && staggered !== MIXED}
          ariaLabel={`${title} animation stagger`}
        />
      </Row>
      <Row label="Easing">
        <Select label={`${title} animation easing`} value={ease === MIXED || ease === NONE ? (ease === MIXED ? "" : "auto") : ease} options={easeOptions} disabled={!anyAnim} onChange={setEase} />
      </Row>
    </>
  );
}

export function AnimationSection({ ids, primary }: { ids: readonly ClipId[]; primary: ClipId }) {
  return (
    <>
      <AnimationRows ids={ids} primary={primary} side="animIn" />
      <AnimationRows ids={ids} primary={primary} side="animOut" />
    </>
  );
}
