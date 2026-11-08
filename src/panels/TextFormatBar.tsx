import { X } from "lucide-react";
import { rememberColor } from "../app/propertiesController.js";
import { appSettings } from "../app/services.js";
import { textEditor } from "../app/previewController.js";
import type { RGBA } from "../core/document/types.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { FormatState } from "../render/preview/InlineTextEditor.js";
import type { AppSettings } from "../project/appSettings.js";
import { ColorField } from "../ui/ColorField.js";
import { IconButton } from "../ui/IconButton.js";
import styles from "./TextFormatBar.module.css";

// The format bar of inline text editing (Batch 67, spec §21.13): floats at the top of the preview canvas
// while a text clip is edited, with Bold, Italic, Underline, Strike, the span color, the highlight and Clear,
// all acting on the selection (the textarea keeps the keyboard and the selection: its buttons never take
// focus). It renders when editing starts or ends and when the selection's formats change, never while typing
// inside one format (the editor publishes only changes), so there is no React commit per keystroke (P1).

const selectFormat = (state: FormatState | null) => state;
const selectRecent = (settings: AppSettings) => settings.recentColors;

/** What the swatches show while the selection has no span color or highlight of its own. */
const TEXT_DEFAULT: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const HIGHLIGHT_DEFAULT: RGBA = { r: 1, g: 0.86, b: 0.2, a: 1 };

export function TextFormatBar() {
  const format = useStoreSelector(textEditor.format, selectFormat);
  const recent = useStoreSelector(appSettings, selectRecent);
  if (!format) return null;
  const off = !format.selection;
  const pick = (apply: (color: RGBA) => boolean) => (color: RGBA) => {
    if (apply(color)) rememberColor(color);
  };
  return (
    <div className={styles.bar} role="toolbar" aria-label="Text format" data-text-format-bar="">
      <IconButton commandId="text.bold" pressed={format.bold} disabled={off} />
      <IconButton commandId="text.italic" pressed={format.italic} disabled={off} />
      <IconButton commandId="text.underline" pressed={format.underline} disabled={off} />
      <IconButton commandId="text.strike" pressed={format.strike} disabled={off} />
      <span className={styles.rule} aria-hidden="true" />
      <ColorField value={format.color ?? TEXT_DEFAULT} recent={recent} ariaLabel="Selection color" disabled={off} onChange={pick((color) => textEditor.formatColor(color))} />
      <IconButton control icon={X} label="Use the clip's color for the selection" disabled={off || format.color === null} onClick={() => textEditor.formatColor(null)} />
      <span className={styles.rule} aria-hidden="true" />
      <ColorField value={format.highlight ?? HIGHLIGHT_DEFAULT} recent={recent} ariaLabel="Selection highlight" disabled={off} onChange={pick((color) => textEditor.formatHighlight(color))} />
      <IconButton control icon={X} label="Remove the highlight from the selection" disabled={off || format.highlight === null} onClick={() => textEditor.formatHighlight(null)} />
      <span className={styles.rule} aria-hidden="true" />
      <IconButton commandId="text.clearFormat" disabled={off} />
    </div>
  );
}
