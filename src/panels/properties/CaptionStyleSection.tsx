import { MoveHorizontal, RotateCcw, Rows3 } from "lucide-react";
import { useCallback, useMemo, type ReactNode } from "react";
import { patchLiveEdit, liveEdit } from "../../app/liveEdit.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore, sessionStore } from "../../app/services.js";
import { formatHexColor } from "../../core/document/color.js";
import type { CaptionHighlightMode, CaptionPosition, CaptionStyle, ClipId, Project, RGBA, TextStyle, TrackId } from "../../core/document/types.js";
import type { CaptionScope, SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { captionMiddleY, DEFAULT_HIGHLIGHT_COLOR, DEFAULT_INACTIVE_COLOR, overrideFields, overrideWithout } from "../../text/captions.js";
import { captionStyleOf, cueStyleOf, setCaptionStyle, setCueStyles } from "../../timeline/edit/captions.js";
import { Button } from "../../ui/Button.js";
import { ColorField } from "../../ui/ColorField.js";
import { NumberField } from "../../ui/NumberField.js";
import { CAPTION_MAX_LINES, CAPTION_MAX_WIDTH, CAPTION_X, CAPTION_Y, captionBinding, captionTextProp, cueStylesAfter, editableCues, liveCueStyles, type CaptionBindingDeps, type CaptionTarget } from "./captionBinding.js";
import marks from "./CaptionStyleSection.module.css";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { Choice, colorOf, StyleFields, type StyleTarget } from "./StyleFields.js";
import { MIXED, NONE, SKIP, type Shared } from "./useShared.js";

// The Caption style section (spec §11 "Caption style", §10.5, §20.3) of the caption track, shown when the
// track or a cue is selected: where the captions sit (Bottom, Center, Top, or Custom at an X and Y),
// how wide they wrap and how many lines they take (more lines draw smaller), the word highlight (None,
// Color, Box, Scale, Color + scale; the active and the other words' colors), then the text style rows
// of the Text section (StyleFields, no vertical anchor: captions sit at their position). Every edit is
// one undo step; number field scrubs and color drags show live (P2).
// - Scope (spec §20.3): with cues selected, `All cues | Selected (n)` chooses what the rows edit: the
//   track's style (the default of every cue), or the selected cues' own styles, where an edit writes
//   only the fields it changes into their overrides. The choice is session state. In `Selected` the
//   rows show the cues' effective values (`--` when they differ); a row a selected cue overrides has
//   an accent dot that resets it to the track style (it turns into the reset arrow under the pointer);
//   `Reset to track style` clears the selected cues' overrides.

const DEPS: CaptionBindingDeps = { document: documentStore, live: liveEdit };
const selectRecent = (settings: AppSettings) => settings.recentColors;
const selectScope = (state: SessionState) => state.captionScope;

/** What the section edits: the values it shows, one undo step, a live preview, the number field bindings, the row markers. */
interface CaptionEdits {
  target: CaptionTarget;
  useValue<V extends string | number | boolean | null>(get: (style: CaptionStyle) => V | typeof SKIP): Shared<V>;
  edit(label: string, change: (style: CaptionStyle) => CaptionStyle): void;
  preview(change: ((style: CaptionStyle) => CaptionStyle) | null): void;
  /** The marker of a row editing the fields at `paths` (Selected scope only). */
  marker(paths: readonly string[], label: string): ReactNode;
}

/** The value `get` reads in the edited styles (the track's, or the selected cues' effective ones), as a narrow selector (`get` stable). */
function useCaptionValue<V extends string | number | boolean | null>(target: CaptionTarget, get: (style: CaptionStyle) => V | typeof SKIP): Shared<V> {
  const select = useCallback(
    (project: Project): Shared<V> => {
      if (target.kind === "track") {
        const value = get(captionStyleOf(project, target.trackId));
        return value === SKIP ? NONE : value;
      }
      let result: Shared<V> = NONE;
      for (const cue of editableCues(project, target.cueIds)) {
        const value = get(cueStyleOf(project, cue));
        if (value === SKIP) continue;
        if (result === NONE) result = value;
        else if (!Object.is(result, value)) return MIXED;
      }
      return result;
    },
    [target, get],
  );
  return useStoreSelector(documentStore, select);
}

function captionEdits(target: CaptionTarget): CaptionEdits {
  return {
    target,
    useValue(get) {
      return useCaptionValue(target, get);
    },
    edit(label, change) {
      const project = documentStore.getState();
      const command =
        target.kind === "track"
          ? setCaptionStyle(project, target.trackId, change(captionStyleOf(project, target.trackId)), { label })
          : setCueStyles(project, cueStylesAfter(project, editableCues(project, target.cueIds), change), { label });
      if (command) documentStore.dispatch(command);
    },
    preview(change) {
      const project = documentStore.getState();
      if (target.kind === "track") patchLiveEdit({ captionStyles: change ? new Map([[target.trackId, change(captionStyleOf(project, target.trackId))]]) : null });
      else patchLiveEdit({ cueStyles: change ? liveCueStyles(project, editableCues(project, target.cueIds), change) : null });
    },
    marker: (paths, label) => (target.kind === "cues" ? <OverrideMark cueIds={target.cueIds} paths={paths} label={label} /> : undefined),
  };
}

/** Whether `fields` (override paths) hold one of `paths` or a field under one. */
function overridesAny(fields: readonly string[], paths: readonly string[]): boolean {
  return fields.some((field) => paths.some((path) => field === path || field.startsWith(`${path}.`)));
}

/**
 * A row's override marker (spec §20.3 "a marker dot and a reset button"): an accent dot while a
 * selected cue overrides the row's fields, a button that resets them to the track style (one undo
 * step). The slot keeps its width when there is nothing to mark, so the rows never move.
 */
function OverrideMark({ cueIds, paths, label }: { cueIds: readonly ClipId[]; paths: readonly string[]; label: string }) {
  const on = useStoreSelector(
    documentStore,
    useCallback((project: Project) => editableCues(project, cueIds).some((cue) => overridesAny(overrideFields(cue.styleOverride), paths)), [cueIds, paths]),
  );
  if (!on) return <span className={marks.slot} aria-hidden="true" />;
  const reset = () => {
    const project = documentStore.getState();
    const command = setCueStyles(project, new Map(editableCues(project, cueIds).map((cue) => [cue.id, { styleOverride: overrideWithout(cue.styleOverride, paths), presetId: cue.presetId }])), { label: `Reset ${label.toLowerCase()} to track style` });
    if (command) documentStore.dispatch(command);
  };
  return (
    <button type="button" className={marks.mark} data-control="" aria-label={`Reset ${label.toLowerCase()} to the track style`} data-tooltip={`${label}: set on the selected cues. Click to use the track style.`} onClick={reset}>
      <span className={marks.dot} aria-hidden="true" />
      <RotateCcw className={marks.reset} aria-hidden="true" />
    </button>
  );
}

const textGetters = new WeakMap<(style: TextStyle) => unknown, (style: CaptionStyle) => unknown>();
function textGetter<V>(get: (style: TextStyle) => V | typeof SKIP): (style: CaptionStyle) => V | typeof SKIP {
  let found = textGetters.get(get);
  if (!found) {
    found = (style: CaptionStyle) => get(style.text);
    textGetters.set(get, found);
  }
  return found as (style: CaptionStyle) => V | typeof SKIP;
}

/** Style field paths as caption override paths (`text.` before each; one array per input, so markers keep their selectors). */
const textPaths = new WeakMap<readonly string[], readonly string[]>();
function inText(paths: readonly string[]): readonly string[] {
  let found = textPaths.get(paths);
  if (!found) {
    found = paths.map((path) => `text.${path}`);
    textPaths.set(paths, found);
  }
  return found;
}

/** The style rows' target: the edited text style (the track's, or the selected cues'). */
function captionStyleTarget(edits: CaptionEdits): StyleTarget {
  const withText = (patch: (style: TextStyle) => Partial<TextStyle>) => (style: CaptionStyle) => ({ ...style, text: { ...style.text, ...patch(style.text) } });
  return {
    useShared(get) {
      return edits.useValue(textGetter(get));
    },
    edit: (label, patch) => edits.edit(label, withText(patch)),
    preview: (patch) => edits.preview(patch ? withText(patch) : null),
    binding: (prop) => captionBinding(DEPS, captionTextProp(prop), edits.target),
    ...(edits.target.kind === "cues" && { marker: (paths: readonly string[], label: string) => edits.marker(inText(paths), label) }),
  };
}

const POSITIONS: { value: CaptionPosition; label: string; text: string }[] = [
  { value: "bottom", label: "Bottom: in the lower third", text: "Bottom" },
  { value: "center", label: "Center of the frame", text: "Center" },
  { value: "top", label: "Top: below the platform bar", text: "Top" },
  { value: "custom", label: "Custom: at the X and Y below", text: "Custom" },
];

const HIGHLIGHTS: { value: CaptionHighlightMode; label: string; text: string }[] = [
  { value: "none", label: "No word highlight", text: "None" },
  { value: "color", label: "The spoken word in the highlight color", text: "Color" },
  { value: "background", label: "A box in the highlight color behind the spoken word", text: "Box" },
  { value: "scale", label: "The spoken word grows", text: "Scale" },
  { value: "colorAndScale", label: "The spoken word in the highlight color, grown", text: "Both" },
];

const getPosition = (style: CaptionStyle) => style.position;
const getMode = (style: CaptionStyle) => style.highlight.mode;
const getColor = (style: CaptionStyle) => formatHexColor(style.highlight.color);
const getInactive = (style: CaptionStyle) => formatHexColor(style.highlight.inactiveColor);

// Override paths of the section's own rows (stable: the markers' selectors key on them).
const PATHS = {
  position: ["position"],
  xy: ["x", "y"],
  maxWidth: ["maxWidth"],
  maxLines: ["maxLines"],
  mode: ["highlight.mode"],
  color: ["highlight.color"],
  inactive: ["highlight.inactiveColor"],
} as const;

/** Whether a selected cue has an override (Reset to track style has something to do). */
function useAnyOverride(cueIds: readonly ClipId[]): boolean {
  return useStoreSelector(
    documentStore,
    useCallback((project: Project) => editableCues(project, cueIds).some((cue) => cue.styleOverride !== undefined || cue.presetId !== undefined), [cueIds]),
  );
}

/** The scope switch and Reset to track style (spec §20.3), shown with cues selected. */
function ScopeRows({ cueIds, scope }: { cueIds: readonly ClipId[]; scope: CaptionScope }) {
  const any = useAnyOverride(cueIds);
  const setScope = (next: CaptionScope) => sessionStore.state.set((state) => (state.captionScope === next ? state : { ...state, captionScope: next }));
  return (
    <>
      <Row label="Edit">
        <Choice
          value={scope}
          options={[
            { value: "all", label: "Edit the track's style: every cue without its own style", text: "All cues" },
            { value: "selected", label: "Edit the selected cues' own style", text: `Selected (${cueIds.length})` },
          ]}
          onChange={setScope}
        />
      </Row>
      {scope === "selected" && (
        <Row label="">
          <span className={marks.resetRow}>
            <Button size="compact" icon={RotateCcw} commandId="caption.resetStyle" disabled={!any}>
              Reset to track style
            </Button>
          </span>
        </Row>
      )}
    </>
  );
}

export function CaptionStyleSection({ trackId, cueIds }: { trackId: TrackId; cueIds: readonly ClipId[] }) {
  const scope = useStoreSelector(sessionStore.state, selectScope);
  const onCues = cueIds.length > 0 && scope === "selected";
  const target = useMemo<CaptionTarget>(() => (onCues ? { kind: "cues", trackId, cueIds } : { kind: "track", trackId }), [onCues, trackId, cueIds]);
  const edits = useMemo(() => captionEdits(target), [target]);
  const textTarget = useMemo(() => captionStyleTarget(edits), [edits]);
  const bindings = useMemo(
    () => ({ x: captionBinding(DEPS, CAPTION_X, target), y: captionBinding(DEPS, CAPTION_Y, target), maxWidth: captionBinding(DEPS, CAPTION_MAX_WIDTH, target), maxLines: captionBinding(DEPS, CAPTION_MAX_LINES, target) }),
    [target],
  );
  const position = edits.useValue(getPosition);
  const mode = edits.useValue(getMode);
  const color = edits.useValue(getColor);
  const inactive = edits.useValue(getInactive);
  const recent = useStoreSelector(appSettings, selectRecent);
  const highlight = (label: string, set: (style: CaptionStyle, color: RGBA) => CaptionStyle) => ({
    onChange: (next: RGBA) => {
      edits.edit(label, (style) => set(style, next));
      rememberColor(next);
    },
    onPreview: (next: RGBA | null) => edits.preview(next ? (style) => set(style, next) : null),
  });
  const choosePosition = (next: CaptionPosition) =>
    edits.edit("Caption position", (style) => {
      if (next !== "custom" || style.position === "custom") return { ...style, position: next };
      // Custom starts where the preset showed a one-line caption.
      const line = style.text.fontSize * style.text.lineHeight;
      return { ...style, position: next, x: 0, y: captionMiddleY(style, documentStore.getState().settings.height, line) };
    });
  const custom = position === "custom" || position === MIXED;
  return (
    <>
      {cueIds.length > 0 && <ScopeRows cueIds={cueIds} scope={scope} />}
      <Row label="Position" marker={edits.marker(PATHS.position, "Position")}>
        <Choice value={position} options={POSITIONS} onChange={choosePosition} />
      </Row>
      <Row label="Offset" marker={edits.marker(PATHS.xy, "Offset")}>
        <div className={styles.pair}>
          <NumberField label="X" unit="px" binding={bindings.x} precision={0} min={CAPTION_X.min} max={CAPTION_X.max} disabled={!custom} ariaLabel="Caption X" />
          <NumberField label="Y" unit="px" binding={bindings.y} precision={0} min={CAPTION_Y.min} max={CAPTION_Y.max} disabled={!custom} ariaLabel="Caption Y" />
        </div>
      </Row>
      <Row label="Max width" marker={edits.marker(PATHS.maxWidth, "Max width")}>
        <NumberField label={<MoveHorizontal aria-hidden="true" />} unit="px" binding={bindings.maxWidth} precision={0} min={CAPTION_MAX_WIDTH.min} max={CAPTION_MAX_WIDTH.max} ariaLabel="Caption max width" />
      </Row>
      <Row label="Max lines" marker={edits.marker(PATHS.maxLines, "Max lines")}>
        <NumberField label={<Rows3 aria-hidden="true" />} binding={bindings.maxLines} precision={0} min={CAPTION_MAX_LINES.min} max={CAPTION_MAX_LINES.max} ariaLabel="Caption max lines" />
      </Row>
      <Row label="Highlight" marker={edits.marker(PATHS.mode, "Highlight")}>
        <Choice value={mode} options={HIGHLIGHTS} onChange={(next) => edits.edit("Word highlight", (style) => ({ ...style, highlight: { ...style.highlight, mode: next } }))} />
      </Row>
      <span className={styles.hint}>{mode === "none" ? "Off: cues show in the text color." : "Shows on cues with word timings (VTT karaoke, transcription)."}</span>
      <Row label="Active" marker={edits.marker(PATHS.color, "Highlight color")}>
        <ColorField value={colorOf(color, DEFAULT_HIGHLIGHT_COLOR)} recent={recent} ariaLabel="Highlight color" {...highlight("Change highlight color", (style, c) => ({ ...style, highlight: { ...style.highlight, color: c } }))} />
      </Row>
      <Row label="Other words" marker={edits.marker(PATHS.inactive, "Other words color")}>
        <ColorField value={colorOf(inactive, DEFAULT_INACTIVE_COLOR)} recent={recent} ariaLabel="Other words color" {...highlight("Change highlight color", (style, c) => ({ ...style, highlight: { ...style.highlight, inactiveColor: c } }))} />
      </Row>
      <StyleFields target={textTarget} anchor={false} />
    </>
  );
}
