import { ArrowUpDown, MoveHorizontal, Rows3 } from "lucide-react";
import { useCallback, useMemo } from "react";
import { patchLiveEdit, liveEdit } from "../../app/liveEdit.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore } from "../../app/services.js";
import { formatHexColor } from "../../core/document/color.js";
import type { CaptionHighlightMode, CaptionPosition, CaptionStyle, Project, RGBA, TextStyle, TrackId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { captionMiddleY, DEFAULT_HIGHLIGHT_COLOR, DEFAULT_INACTIVE_COLOR } from "../../text/captions.js";
import { captionStyleOf, setCaptionStyle } from "../../timeline/edit/captions.js";
import { ColorField } from "../../ui/ColorField.js";
import { NumberField } from "../../ui/NumberField.js";
import { CAPTION_MAX_LINES, CAPTION_MAX_WIDTH, CAPTION_Y, captionBinding, captionTextProp, type CaptionBindingDeps } from "./captionBinding.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { Choice, colorOf, StyleFields, type StyleTarget } from "./StyleFields.js";
import { NONE, SKIP, type Shared } from "./useShared.js";

// The Caption style section (spec §11 "Caption style", §10.5) of the caption track, shown when the
// track or a cue is selected: where the captions sit (Bottom, Center, Top, or Custom at a Y), how wide
// they wrap and how many lines they take (more lines draw smaller), the word highlight (None, Color,
// Box, Scale, Color + scale; the active and the other words' colors), then the text style rows of the
// Text section (StyleFields, no vertical anchor: captions sit at their position). Every edit is one
// undo step on the track's style; number field scrubs and color drags show live (P2).

const DEPS: CaptionBindingDeps = { document: documentStore, live: liveEdit };
const selectRecent = (settings: AppSettings) => settings.recentColors;

/** The value `get` reads in the caption track's style, as a narrow selector (`get` stable). */
function useCaption<V extends string | number | boolean | null>(trackId: TrackId, get: (style: CaptionStyle) => V | typeof SKIP): Shared<V> {
  const select = useCallback(
    (project: Project): Shared<V> => {
      const value = get(captionStyleOf(project, trackId));
      return value === SKIP ? NONE : value;
    },
    [trackId, get],
  );
  return useStoreSelector(documentStore, select);
}

/** One undo step on the caption track's style. */
function editCaption(trackId: TrackId, label: string, change: (style: CaptionStyle) => CaptionStyle): void {
  const project = documentStore.getState();
  const command = setCaptionStyle(project, trackId, change(captionStyleOf(project, trackId)), { label });
  if (command) documentStore.dispatch(command);
}

/** The caption track's style shown live (null ends it). */
function previewCaption(trackId: TrackId, change: ((style: CaptionStyle) => CaptionStyle) | null): void {
  patchLiveEdit({ captionStyles: change ? new Map([[trackId, change(captionStyleOf(documentStore.getState(), trackId))]]) : null });
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

/** The style rows' target: the caption track's text style. */
function captionStyleTarget(trackId: TrackId): StyleTarget {
  const withText = (patch: (style: TextStyle) => Partial<TextStyle>) => (style: CaptionStyle) => ({ ...style, text: { ...style.text, ...patch(style.text) } });
  return {
    useShared(get) {
      return useCaption(trackId, textGetter(get));
    },
    edit: (label, patch) => editCaption(trackId, label, withText(patch)),
    preview: (patch) => previewCaption(trackId, patch ? withText(patch) : null),
    binding: (prop) => captionBinding(DEPS, captionTextProp(prop), trackId),
  };
}

const POSITIONS: { value: CaptionPosition; label: string; text: string }[] = [
  { value: "bottom", label: "Bottom: in the lower third", text: "Bottom" },
  { value: "center", label: "Center of the frame", text: "Center" },
  { value: "top", label: "Top: below the platform bar", text: "Top" },
  { value: "custom", label: "Custom: at the Y below", text: "Custom" },
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

export function CaptionStyleSection({ trackId }: { trackId: TrackId }) {
  const target = useMemo(() => captionStyleTarget(trackId), [trackId]);
  const bindings = useMemo(() => ({ y: captionBinding(DEPS, CAPTION_Y, trackId), maxWidth: captionBinding(DEPS, CAPTION_MAX_WIDTH, trackId), maxLines: captionBinding(DEPS, CAPTION_MAX_LINES, trackId) }), [trackId]);
  const position = useCaption(trackId, getPosition);
  const mode = useCaption(trackId, getMode);
  const color = useCaption(trackId, getColor);
  const inactive = useCaption(trackId, getInactive);
  const recent = useStoreSelector(appSettings, selectRecent);
  const highlight = (label: string, set: (style: CaptionStyle, color: RGBA) => CaptionStyle) => ({
    onChange: (next: RGBA) => {
      editCaption(trackId, label, (style) => set(style, next));
      rememberColor(next);
    },
    onPreview: (next: RGBA | null) => previewCaption(trackId, next ? (style) => set(style, next) : null),
  });
  const choosePosition = (next: CaptionPosition) =>
    editCaption(trackId, "Caption position", (style) => {
      if (next !== "custom" || style.position === "custom") return { ...style, position: next };
      // Custom starts where the preset showed a one-line caption.
      const line = style.text.fontSize * style.text.lineHeight;
      return { ...style, position: next, y: captionMiddleY(style, documentStore.getState().settings.height, line) };
    });
  return (
    <>
      <Row label="Position">
        <Choice value={position} options={POSITIONS} onChange={choosePosition} />
      </Row>
      <Row label="Y">
        <NumberField label={<ArrowUpDown aria-hidden="true" />} unit="px" binding={bindings.y} precision={0} min={CAPTION_Y.min} max={CAPTION_Y.max} disabled={position !== "custom"} ariaLabel="Caption Y" />
      </Row>
      <Row label="Max width">
        <NumberField label={<MoveHorizontal aria-hidden="true" />} unit="px" binding={bindings.maxWidth} precision={0} min={CAPTION_MAX_WIDTH.min} max={CAPTION_MAX_WIDTH.max} ariaLabel="Caption max width" />
      </Row>
      <Row label="Max lines">
        <NumberField label={<Rows3 aria-hidden="true" />} binding={bindings.maxLines} precision={0} min={CAPTION_MAX_LINES.min} max={CAPTION_MAX_LINES.max} ariaLabel="Caption max lines" />
      </Row>
      <Row label="Highlight">
        <Choice value={mode} options={HIGHLIGHTS} onChange={(next) => editCaption(trackId, "Word highlight", (style) => ({ ...style, highlight: { ...style.highlight, mode: next } }))} />
      </Row>
      <span className={styles.hint}>{mode === "none" ? "Off: cues show in the text color." : "Shows on cues with word timings (VTT karaoke, transcription)."}</span>
      <Row label="Active">
        <ColorField value={colorOf(color, DEFAULT_HIGHLIGHT_COLOR)} recent={recent} ariaLabel="Highlight color" {...highlight("Change highlight color", (style, c) => ({ ...style, highlight: { ...style.highlight, color: c } }))} />
      </Row>
      <Row label="Other words">
        <ColorField value={colorOf(inactive, DEFAULT_INACTIVE_COLOR)} recent={recent} ariaLabel="Other words color" {...highlight("Change highlight color", (style, c) => ({ ...style, highlight: { ...style.highlight, inactiveColor: c } }))} />
      </Row>
      <StyleFields target={target} anchor={false} />
    </>
  );
}
