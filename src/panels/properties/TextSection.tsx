import { useMemo, useState, type ChangeEvent } from "react";
import { liveEdit } from "../../app/liveEdit.js";
import { documentStore } from "../../app/services.js";
import { textEditor } from "../../app/previewController.js";
import { editTexts, previewTexts, type TextChange } from "../../app/textController.js";
import type { Clip, ClipId, TextClip, TextStyle } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { NumberField } from "../../ui/NumberField.js";
import { Row } from "./Section.js";
import { Choice, StyleFields, type StyleTarget } from "./StyleFields.js";
import { textBinding, type TextBindingDeps } from "./textBinding.js";
import { BOX_WIDTH } from "./textProps.js";
import text from "./TextSection.module.css";
import { MIXED, SKIP, useClipsShared } from "./useShared.js";

// The Text section (spec §11, §10.1) of the selected text clips: content, the style rows (StyleFields:
// font, weight and italic, size, fill, stroke, shadow, background box, alignment, vertical anchor,
// letter spacing, line height, case), and the box (auto size, or a fixed width that wraps). Every edit
// is one undo step over all the selected text clips; mixed values show `--`. Number fields are bound
// outside React (textBinding.ts): a label scrub shows live and re-rasterizes only those layers (P1, P2,
// P11). Content typing coalesces into one step per burst; while the text is edited on the canvas (spec
// §7.7) the content shows the draft, and focusing it ends that editing first (committed).

const DEPS: TextBindingDeps = { document: documentStore, live: liveEdit };

const getValue = (clip: Clip) => (clip.kind === "text" ? clip.text.value : SKIP);
const getBoxMode = (clip: Clip) => (clip.kind === "text" ? clip.text.box.mode : SKIP);

/** A style change of every selected text clip. */
const restyle =
  (patch: (style: TextStyle) => Partial<TextStyle>): TextChange =>
  (clip: TextClip) => ({ style: { ...clip.style, ...patch(clip.style) } });

/** Clip getters for the style rows' style getters (made once per getter, so selectors stay stable). */
const clipGetters = new WeakMap<(style: TextStyle) => unknown, (clip: Clip) => unknown>();
function clipGetter<V>(get: (style: TextStyle) => V | typeof SKIP): (clip: Clip) => V | typeof SKIP {
  let found = clipGetters.get(get);
  if (!found) {
    found = (clip: Clip) => (clip.kind === "text" ? get(clip.style) : SKIP);
    clipGetters.set(get, found);
  }
  return found as (clip: Clip) => V | typeof SKIP;
}

/** The style rows' target: the selected text clips. */
function clipStyleTarget(ids: readonly ClipId[]): StyleTarget {
  return {
    useShared(get) {
      return useClipsShared(ids, clipGetter(get));
    },
    edit: (label, patch) => editTexts(ids, restyle(patch), label),
    preview: (patch) => previewTexts(ids, patch ? restyle(patch) : null),
    binding: (prop) => textBinding(DEPS, prop, ids),
  };
}

const selectInline = (state: { clipId: ClipId | null; value: string }) => state;

/** The content: typing edits every selected text clip live, one undo step per burst of typing. */
function ContentField({ ids }: { ids: readonly ClipId[] }) {
  const value = useClipsShared(ids, getValue);
  // Edited on the canvas: its draft.
  const inline = useStoreSelector(textEditor.state, selectInline);
  const drafting = inline.clipId !== null && ids.includes(inline.clipId);
  const shown = drafting ? inline.value : typeof value === "string" ? value : "";
  // While the field has the focus it shows what was typed (the document follows it, one burst at a time).
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);
  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setDraft(next);
    editTexts(ids, (clip) => ({ text: { ...clip.text, value: next } }), "Edit text", "properties.text.content");
  };
  return (
    <textarea
      className={text.content}
      value={editing ? draft : shown}
      placeholder={value === MIXED ? "--" : "Text"}
      aria-label="Text"
      spellCheck={false}
      onFocus={() => {
        // One editor of the content at a time: the canvas's commits first.
        textEditor.end(true);
        setDraft(shown);
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={onChange}
    />
  );
}

export function TextSection({ ids }: { ids: readonly ClipId[] }) {
  const target = useMemo(() => clipStyleTarget(ids), [ids]);
  const boxWidth = useMemo(() => textBinding(DEPS, BOX_WIDTH, ids), [ids]);
  const boxMode = useClipsShared(ids, getBoxMode);
  return (
    <>
      <Row label="Text">
        <ContentField ids={ids} />
      </Row>
      <StyleFields target={target} anchor />
      <Row label="Box">
        <Choice
          value={boxMode}
          options={[
            { value: "auto", label: "Auto size: the box fits the lines", text: "Auto" },
            { value: "fixed", label: "Fixed width: words wrap at the width", text: "Fixed" },
          ]}
          onChange={(mode) => editTexts(ids, (clip) => ({ text: { ...clip.text, box: { ...clip.text.box, mode } } }), mode === "fixed" ? "Fixed text box" : "Auto size text box")}
        />
      </Row>
      <Row label="Width">
        <NumberField label="W" unit="px" binding={boxWidth} precision={0} min={BOX_WIDTH.min} max={BOX_WIDTH.max} disabled={boxMode !== "fixed"} ariaLabel="Text box width" />
      </Row>
    </>
  );
}
