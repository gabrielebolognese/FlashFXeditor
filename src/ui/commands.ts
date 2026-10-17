// The bridge from the shared ui components to the app's CommandRegistry and catalog (Batch 40): ui/
// does not import app/, so the app installs these at startup (app/commandController.ts). A button or
// menu row given a command id runs it through here and takes its default label and icon from the
// catalog; a menu restores the focus scope it took over when it closes.
import type { LucideIcon } from "lucide-react";

export interface CommandBridge {
  run(id: string, arg?: string): void;
  label(id: string): string | undefined;
  icon(id: string): LucideIcon | undefined;
  /** False when the command has an `enabled` predicate that does not hold (unknown ids are enabled). */
  enabled(id: string): boolean;
  scope(): string;
  setScope(scope: string): void;
}

const NONE: CommandBridge = {
  run: () => {},
  label: () => undefined,
  icon: () => undefined,
  enabled: () => true,
  scope: () => "global",
  setScope: () => {},
};

let bridge: CommandBridge = NONE;

export function setCommandBridge(next: CommandBridge | null): void {
  bridge = next ?? NONE;
}

export function commandBridge(): CommandBridge {
  return bridge;
}

export function runCommand(id: string, arg?: string): void {
  bridge.run(id, arg);
}
