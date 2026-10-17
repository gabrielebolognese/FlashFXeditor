import type { ReactNode } from "react";

/**
 * Gives any content a tooltip (rendered by the controller in tooltipController.ts, which shows the
 * live shortcut of `commandId`). IconButton has one built in.
 */
export function Tooltip({ label, commandId, children }: { label: string; commandId?: string; children: ReactNode }) {
  return (
    <span data-tooltip={label} data-command={commandId}>
      {children}
    </span>
  );
}
