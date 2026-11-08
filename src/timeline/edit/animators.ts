// Edits of a text clip's counter and animators (spec §21.13, §11 Text and Animators sections, Batch 68).
// - `editTextClips` runs one edit over the selected unlocked text clips as one command (`clip.animators`,
//   one undo step; steps of a field coalesce by key); clips the edit leaves unchanged are skipped.
// - Fields: an animator's `unit`, `selector.*` and `props.*`. A keyed field (`animators.<id>.<field>`)
//   shows its value at the playhead and an edit writes a key there; an unkeyed one writes the base.
// - Stopwatch: on keys the field at the playhead with the value shown; off bakes that value into the base
//   and drops the keys.
// - Counter: its fields; the clip's `text.value` always holds the final text (what search, captions and
//   readers of the file see).
// Pure.
import { produce, type Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { ANIMATOR_PROP_PATTERN, clipRel, sampleValue, scalar, setKey, withKeys, type Key } from "../../core/document/keyframes.js";
import type { ClipId, Frame, Keyframes, Project, TextAnimator, TextClip, TextCounter } from "../../core/document/types.js";
import { nextAnimatorId, newAnimator } from "../../text/animators.js";
import { counterText, MAX_COUNTER_DECIMALS } from "../../text/counter.js";
import { isClipLocked } from "../model/queries.js";

/** One edit of a text clip draft; `rel` is the playhead's frame inside the clip. */
export type TextClipEdit = (clip: Draft<TextClip>, rel: Frame) => void;

/** `edit` over the unlocked text clips among `ids` as one command; null when nothing changes. */
export function editTextClips(project: Project, ids: Iterable<ClipId>, edit: TextClipEdit, options: { label: string; at: Frame; coalesceKey?: string }): Command | null {
  const targets: ClipId[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind !== "text" || isClipLocked(project, id)) continue;
    const rel = clipRel(clip, options.at);
    if (produce(clip, (draft) => edit(draft, rel)) !== clip) targets.push(id);
  }
  if (targets.length === 0) return null;
  return {
    id: "clip.animators",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: ["composite", "text", "clips"],
    run(draft) {
      for (const id of targets) {
        const clip = draft.clips[id] as Draft<TextClip>;
        edit(clip, clipRel(clip, options.at));
      }
    },
  };
}

/** The animator `id` of a clip. */
export const animatorOf = (clip: { animators?: TextAnimator[] | undefined }, id: string): TextAnimator | undefined => clip.animators?.find((a) => a.id === id);

/** Fields of an animator: the keyable numbers, the selector's other numbers, and the choices. */
export const ANIMATOR_NUMBER_FIELDS = ["selector.start", "selector.end", "selector.offset", "selector.ease", "selector.seed", "props.x", "props.y", "props.scale", "props.rotation", "props.opacity", "props.blur", "props.tracking"] as const;
export type AnimatorNumberField = (typeof ANIMATOR_NUMBER_FIELDS)[number];

const PROP_DEFAULT: Readonly<Record<string, number>> = { scale: 1, opacity: 1 };

/** The prop id of a keyable field (`animators.a1.selector.offset`), or null for a field that cannot be keyed. */
export const animatorKeyProp = (id: string, field: string): string | null => {
  const prop = `animators.${id}.${field}`;
  return ANIMATOR_PROP_PATTERN.test(prop) ? prop : null;
};

/** The base value of a number field. */
export function animatorBase(animator: TextAnimator, field: AnimatorNumberField): number {
  if (field.startsWith("selector.")) return animator.selector[field.slice(9) as "start" | "end" | "offset" | "ease" | "seed"];
  const name = field.slice(6) as keyof TextAnimator["props"];
  const value = animator.props[name];
  return typeof value === "number" ? value : (PROP_DEFAULT[name] ?? 0);
}

/** The value a field shows at `rel` (its keys when it has them, else the base), or undefined without the animator. */
export function animatorValueAt(clip: TextClip, id: string, field: AnimatorNumberField, rel: Frame): number | undefined {
  const animator = animatorOf(clip, id);
  if (!animator) return undefined;
  const prop = animatorKeyProp(id, field);
  const keys = prop ? clip.keyframes?.[prop] : undefined;
  return keys && keys.length > 0 ? scalar(sampleValue(keys, rel)) : animatorBase(animator, field);
}

/** Whether a field is keyed. */
export const animatorKeyed = (clip: TextClip, id: string, field: string): boolean => {
  const prop = animatorKeyProp(id, field);
  return prop !== null && (clip.keyframes?.[prop]?.length ?? 0) > 0;
};

function putKeys(clip: Draft<TextClip>, prop: string, keys: readonly Key[] | undefined): void {
  const next = withKeys(clip.keyframes as Keyframes | undefined, prop, keys);
  if (next) clip.keyframes = next as Draft<Keyframes>;
  else delete clip.keyframes;
}

function writeBase(animator: Draft<TextAnimator>, field: AnimatorNumberField, value: number): void {
  if (field.startsWith("selector.")) (animator.selector as unknown as Record<string, number>)[field.slice(9)] = value;
  else (animator.props as Record<string, number>)[field.slice(6)] = value;
}

/** Writes a number field: a key at `rel` when it is keyed, else the base. */
export function writeAnimatorField(clip: Draft<TextClip>, id: string, field: AnimatorNumberField, value: number, rel: Frame): void {
  const animator = clip.animators?.find((a) => a.id === id);
  if (!animator) return;
  const prop = animatorKeyProp(id, field);
  const keys = prop ? clip.keyframes?.[prop] : undefined;
  if (prop && keys && keys.length > 0) putKeys(clip, prop, setKey(keys, rel, value));
  else writeBase(animator, field, value);
}

/** The stopwatch of a field. */
export function setAnimatorStopwatch(clip: Draft<TextClip>, id: string, field: AnimatorNumberField, on: boolean, rel: Frame): void {
  const animator = clip.animators?.find((a) => a.id === id);
  const prop = animatorKeyProp(id, field);
  if (!animator || !prop) return;
  const keys = clip.keyframes?.[prop];
  const keyed = !!keys && keys.length > 0;
  if (on && !keyed) putKeys(clip, prop, setKey([], rel, animatorBase(animator as TextAnimator, field)));
  if (!on && keyed) {
    writeBase(animator, field, scalar(sampleValue(keys, rel)));
    putKeys(clip, prop, undefined);
  }
}

/** Adds a key at `rel` to a keyed field, or removes the one there (the field's navigator). */
export function toggleAnimatorKey(clip: Draft<TextClip>, id: string, field: AnimatorNumberField, rel: Frame): void {
  const prop = animatorKeyProp(id, field);
  const keys = prop ? clip.keyframes?.[prop] : undefined;
  if (!prop || !keys || keys.length === 0) return;
  if (keys.some((k) => k.frame === rel)) {
    const rest = keys.filter((k) => k.frame !== rel);
    putKeys(clip, prop, rest.length > 0 ? rest : undefined);
  } else putKeys(clip, prop, setKey(keys, rel, scalar(sampleValue(keys, rel))));
}

/** Adds a new animator (the defaults of `newAnimator`) at the end. */
export function addAnimator(clip: Draft<TextClip>): string {
  const id = nextAnimatorId(clip.animators);
  (clip.animators ??= []).push(newAnimator(id));
  return id;
}

/** Removes an animator with its keys. */
export function removeAnimator(clip: Draft<TextClip>, id: string): void {
  if (!clip.animators) return;
  clip.animators = clip.animators.filter((a) => a.id !== id);
  if (clip.animators.length === 0) delete clip.animators;
  const keyframes = clip.keyframes;
  if (!keyframes) return;
  for (const prop of Object.keys(keyframes)) if (prop.startsWith(`animators.${id}.`)) putKeys(clip, prop, undefined);
}

/** Sets a choice field of an animator (unit, selector shape or order). */
export function setAnimatorChoice(clip: Draft<TextClip>, id: string, field: "unit" | "selector.shape" | "selector.order", value: string): void {
  const animator = clip.animators?.find((a) => a.id === id);
  if (!animator) return;
  if (field === "unit") animator.unit = value as TextAnimator["unit"];
  else (animator.selector as unknown as Record<string, string>)[field.slice(9)] = value;
}

/** Turns an animator prop on (its neutral-looking default is replaced by `value`) or off (removed with its keys). */
export function setAnimatorProp(clip: Draft<TextClip>, id: string, name: "x" | "y" | "scale" | "rotation" | "opacity" | "blur" | "tracking" | "fill", value: number | { r: number; g: number; b: number; a: number } | null): void {
  const animator = clip.animators?.find((a) => a.id === id);
  if (!animator) return;
  const props = animator.props as Record<string, unknown>;
  if (value === null) {
    delete props[name];
    const prop = animatorKeyProp(id, `props.${name}`);
    if (prop) putKeys(clip, prop, undefined);
  } else props[name] = value;
}

/** Whether an animator has a prop. */
export const animatorHasProp = (animator: TextAnimator, name: string): boolean => (animator.props as Record<string, unknown>)[name] !== undefined;

/** Writes a counter field; the clip's text follows the counter's final value. */
export function setCounterField(clip: Draft<TextClip>, patch: Partial<TextCounter>): void {
  const base = clip.counter;
  if (!base) return;
  const next: TextCounter = { ...(base as TextCounter), ...patch };
  next.decimals = Math.min(MAX_COUNTER_DECIMALS, Math.max(0, Math.round(next.decimals)));
  clip.counter = next;
  clip.text.value = counterText(next, next.to);
}

/** Turns the counter on (a default one counting 0 to 100) or off (the text keeps the final value). */
export function setCounterOn(clip: Draft<TextClip>, on: boolean, make: () => TextCounter): void {
  if (on && !clip.counter) {
    clip.counter = make();
    clip.text.value = counterText(clip.counter as TextCounter, clip.counter.to);
  }
  if (!on && clip.counter) {
    delete clip.counter;
    const keys = clip.keyframes?.["text.counter.value"];
    if (keys) putKeys(clip, "text.counter.value", undefined);
  }
}
