import { ArrowLeftRight, Blend, Circle, Columns2, Droplets, MoveHorizontal, Moon, Sun, Wind, Zap, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import type { TransitionKind } from "../../core/document/types.js";

/** The icon of each transition kind (chips, command palette). */
export const TRANSITION_ICONS: Readonly<Record<TransitionKind, LucideIcon>> = {
  crossDissolve: Blend, dipToBlack: Moon, dipToWhite: Sun, slide: MoveHorizontal, push: ArrowLeftRight, wipe: Columns2, iris: Circle, zoomIn: ZoomIn, zoomOut: ZoomOut,
  whip: Wind, blurDissolve: Droplets, glitch: Zap, flash: Sun,
};
