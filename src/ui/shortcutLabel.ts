import { bindingFor } from "../core/keyboard/keymap.js";
import { detectPlatform, formatChord, type Platform } from "../core/keyboard/keys.js";

let platform: Platform | null = null;

/** Display label of the first shortcut bound to a command id, e.g. "Ctrl+K"; undefined when unbound. */
export function shortcutLabel(commandId: string): string | undefined {
  const keys = bindingFor(commandId)?.keys[0];
  if (!keys) return undefined;
  platform ??= detectPlatform();
  return formatChord(keys, platform);
}
