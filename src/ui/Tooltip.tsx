import type { ReactNode } from "react";
import { shortcutLabel } from "./shortcutLabel.js";

/** Gives any content a tooltip (rendered by the controller in tooltip.ts). IconButton has one built in. */
export function Tooltip({ label, commandId, children }: { label: string; commandId?: string; children: ReactNode }) {
  return (
    <span data-tooltip={label} data-shortcut={commandId ? shortcutLabel(commandId) : undefined}>
      {children}
    </span>
  );
}
