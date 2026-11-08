// The hover preview of a transition chip (spec §21.16, Batch 71): two swatches (the outgoing and the
// incoming picture) drawn with 2D canvas at progress `t`. A schematic of the look, not the renderers'
// output (those are the GPU shaders); colors come from the Theme, geometry from the same pure helpers
// the compositor uses (core/document/transitions.ts).
import { directionVector, travelOffsets } from "../../core/document/transitions.js";
import type { TransitionKind } from "../../core/document/types.js";

export interface SampleColors {
  from: string;
  to: string;
  dark: string;
  light: string;
}

/** Draws `kind` at progress `t` (0..1) into a `width` x `height` area of `ctx` at the origin. */
export function drawTransitionSample(ctx: CanvasRenderingContext2D, kind: TransitionKind, t: number, width: number, height: number, colors: SampleColors): void {
  const [dx, dy] = directionVector(kind === "wipe" ? "right" : "left");
  const swatch = (color: string, x: number, y: number, scale = 1, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(width / 2 + x, height / 2 + y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.restore();
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  switch (kind) {
    case "crossDissolve":
    case "blurDissolve":
      swatch(colors.from, 0, 0);
      swatch(colors.to, 0, 0, 1, t);
      break;
    case "dipToBlack":
    case "dipToWhite":
    case "flash": {
      swatch(t < 0.5 ? colors.from : colors.to, 0, 0);
      const peak = 1 - Math.abs(2 * t - 1);
      swatch(kind === "dipToBlack" ? colors.dark : colors.light, 0, 0, 1, peak);
      break;
    }
    case "slide":
    case "push":
    case "whip": {
      const offsets = travelOffsets(kind, t);
      swatch(colors.from, -dx * offsets.from * width, -dy * offsets.from * height);
      swatch(colors.to, dx * offsets.to * width, dy * offsets.to * height);
      if (kind === "whip") {
        const streak = Math.sin(Math.PI * t);
        for (let i = 1; i <= 3; i++) swatch(t < 0.5 ? colors.from : colors.to, -dx * (t < 0.5 ? offsets.from : offsets.to) * width + i * streak * 4, 0, 1, 0.25 / i);
      }
      break;
    }
    case "wipe": {
      swatch(colors.from, 0, 0);
      ctx.fillStyle = colors.to;
      ctx.fillRect(0, 0, width * t, height);
      break;
    }
    case "iris": {
      swatch(colors.from, 0, 0);
      ctx.fillStyle = colors.to;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, t * Math.hypot(width, height) * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "zoomIn":
      swatch(colors.from, 0, 0, 1 + t, 1 - t);
      swatch(colors.to, 0, 0, 0.5 + 0.5 * t, t);
      break;
    case "zoomOut":
      swatch(colors.from, 0, 0, 1 - 0.5 * t, 1 - t);
      swatch(colors.to, 0, 0, 2 - t, t);
      break;
    case "glitch": {
      swatch(t < 0.5 ? colors.from : colors.to, 0, 0);
      const bands = 6;
      const amount = Math.sin(Math.PI * t) * width * 0.3;
      for (let i = 0; i < bands; i++) {
        const swap = Math.sin(i * 12.9898 + Math.floor(t * 8) * 78.233) > 0.3;
        if (!swap) continue;
        ctx.fillStyle = (i + Math.floor(t * 8)) % 2 === 0 ? colors.to : colors.from;
        ctx.fillRect(((i % 2) * 2 - 1) * amount, (i * height) / bands, width, height / bands);
      }
      break;
    }
  }
  ctx.restore();
}
