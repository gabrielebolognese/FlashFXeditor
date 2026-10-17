import type { MouseEvent } from "react";
import { cx } from "./cx.js";
import styles from "./Swatches.module.css";

// Color swatch buttons (spec §6.4 label colors: the clip menu's inline row, the marker editor and the
// properties panel's Marker section). The DS has no swatch: icon-size squares, radius-sm, a hairline
// edge; the active one gets the gold ring.

/** One swatch: `color` is a CSS color (a custom property such as `var(--label-red)`). */
export interface Swatch {
  id: string;
  label: string;
  color: string;
  active?: boolean;
}

export interface SwatchesProps {
  swatches: readonly Swatch[];
  onPick: (id: string) => void;
  /** `menuitemradio` inside a menu, `radio` elsewhere. */
  role?: "menuitemradio" | "radio";
  /** In a menu: the row number its keyboard navigation uses. */
  row?: number;
  /** The swatch ids are command ids (the clip menu's `clip.label.<color>`); otherwise they are a field's values. */
  commands?: boolean;
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

export function Swatches({ swatches, onPick, role = "radio", row, commands = false }: SwatchesProps) {
  return (
    <>
      {swatches.map((swatch) => (
        <button
          key={swatch.id}
          type="button"
          role={role}
          aria-checked={swatch.active ?? false}
          aria-label={swatch.label}
          data-tooltip={swatch.label}
          data-row={row}
          data-command={commands ? swatch.id : undefined}
          data-control={commands ? undefined : ""}
          className={cx(styles.swatch, swatch.active && styles.active)}
          style={{ background: swatch.color }}
          onMouseDown={keepFocus}
          onClick={() => onPick(swatch.id)}
        />
      ))}
    </>
  );
}
