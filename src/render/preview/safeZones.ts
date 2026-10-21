// Platform safe zones of the preview overlay (spec §7.6): editable constants. Measured on a 1080 x 1920
// frame (scaled to the project frame by `overlays.ts`): the areas the platform's UI covers (drawn as
// masks) and the safe rectangle (dashed) clear of all of them. The platforms publish no single
// organic-post spec and change their UI; the numbers follow their ad-spec templates as measured by
// third-party tools in 2026:
// - Reels: Meta's 14% top, 35% bottom and 6% side margins; the right rail of buttons about 15% wide
//   from 40% above the bottom. The safe rectangle stops at the rail, the full height clear.
// - TikTok: the in-feed template's 240 px top, 660 px bottom and 120 px sides; the button column
//   180 px wide from 840 px down.
// - Shorts: Google's 288 px top, 672 px bottom, 48 px left and 192 px right; the button column in
//   the right margin from 40% of the height down.
import type { SafeZone } from "../../core/store/sessionStore.js";

/** The frame the measurements are given on. */
export const SAFE_ZONE_REFERENCE = { width: 1080, height: 1920 } as const;

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An area the platform's UI covers. */
export interface SafeZoneRegion extends ZoneRect {
  label: string;
}

export interface SafeZoneSpec {
  label: string;
  /** Masked areas: top bar, action column, caption area. */
  regions: readonly SafeZoneRegion[];
  /** The rectangle clear of all of them (dashed). */
  safe: ZoneRect;
}

export const SAFE_ZONE_SPECS: Readonly<Record<Exclude<SafeZone, "none">, SafeZoneSpec>> = {
  reels: {
    label: "Reels",
    regions: [
      { label: "Top bar", x: 0, y: 0, width: 1080, height: 270 },
      { label: "Actions", x: 918, y: 1152, width: 162, height: 768 },
      { label: "Caption", x: 0, y: 1250, width: 918, height: 670 },
    ],
    safe: { x: 65, y: 270, width: 853, height: 980 },
  },
  tiktok: {
    label: "TikTok",
    regions: [
      { label: "Top bar", x: 0, y: 0, width: 1080, height: 240 },
      { label: "Actions", x: 900, y: 840, width: 180, height: 1080 },
      { label: "Caption", x: 0, y: 1260, width: 900, height: 660 },
    ],
    safe: { x: 120, y: 240, width: 780, height: 1020 },
  },
  shorts: {
    label: "Shorts",
    regions: [
      { label: "Top bar", x: 0, y: 0, width: 1080, height: 288 },
      { label: "Actions", x: 888, y: 768, width: 192, height: 1152 },
      { label: "Caption", x: 0, y: 1248, width: 888, height: 672 },
    ],
    safe: { x: 48, y: 288, width: 840, height: 960 },
  },
};

/** Menu order and names (§7.6). */
export const SAFE_ZONE_CHOICES: readonly { id: SafeZone; label: string }[] = [
  { id: "none", label: "None" },
  { id: "reels", label: SAFE_ZONE_SPECS.reels.label },
  { id: "tiktok", label: SAFE_ZONE_SPECS.tiktok.label },
  { id: "shorts", label: SAFE_ZONE_SPECS.shorts.label },
];
