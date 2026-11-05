// The render targets of compound clips (spec §21.10, §4 P3 and P6, Batch 62): each compound layer draws its
// sequence into an offscreen texture of its own (the sequence size times the render scale and the layer's
// scale, at most `MAX_COMPOUND_SIZE` px on the long side and the device limit), and the frame draws that
// texture as one layer.
// - A compound whose inner draw list is the one it drew last (`DrawListSnapshot`: a sequence with no
//   animation, no video and no edit since) draws nothing again: `stats.renders` counts the draws, so a
//   static compound renders once per edit.
// - Two targets per compound take turns, so a re-render always shows a texture the frame's own snapshot
//   has not seen: the frame's list changes exactly when the compound did.
// - Targets count against the texture budget (P6): `bytes` is what they hold; a compound not drawn in a
//   pass loses its targets at `end`.
import { DrawListSnapshot } from "../compositor/DrawListSnapshot.js";
import type { DrawList } from "../compositor/drawList.js";
import type { OffscreenTarget, Renderer, TextureHandle } from "../gpu/renderer.js";

/** The long side a compound's texture does not exceed (px): the P6 budget is 768 MB, a 4096 x 4096 target is 64 MB. */
export const MAX_COMPOUND_SIZE = 4096;

export type CompoundGpu = Pick<Renderer, "draw" | "createOffscreenTarget" | "releaseTarget" | "maxTextureSize">;

export interface CompoundStats {
  /** Compound textures drawn since the start (a static compound adds one per edit). */
  renders: number;
  /** Compounds that kept their texture in the last pass. */
  kept: number;
  /** Compound layers of the last pass, and the GPU bytes their targets hold. */
  layers: number;
  bytes: number;
}

interface Entry {
  width: number;
  height: number;
  targets: [OffscreenTarget | null, OffscreenTarget | null];
  current: 0 | 1;
  snapshot: DrawListSnapshot;
  rendered: boolean;
  pass: number;
}

export class CompoundTargets {
  private readonly entries = new Map<string, Entry>();
  private pass = 0;
  readonly stats: CompoundStats = { renders: 0, kept: 0, layers: 0, bytes: 0 };

  /** `onBytes` hears the bytes the targets hold after every pass (the texture pool reserves them: P6). */
  constructor(
    private readonly gpu: CompoundGpu,
    private readonly onBytes?: (bytes: number) => void,
  ) {}

  /** The pixel size a compound's texture has for a sequence of `width` x `height` drawn at `scale` device px per sequence px. */
  sizeFor(width: number, height: number, scale: number): { width: number; height: number } {
    const limit = Math.min(MAX_COMPOUND_SIZE, this.gpu.maxTextureSize);
    const k = Math.min(1, limit / Math.max(1, width * scale, height * scale));
    return { width: Math.max(1, Math.round(width * scale * k)), height: Math.max(1, Math.round(height * scale * k)) };
  }

  /** Starts a pass (the outermost resolve). */
  begin(): void {
    this.pass += 1;
    this.stats.kept = 0;
    this.stats.layers = 0;
  }

  /**
   * The texture holding `list` (the sequence's draw list), `width` x `height` px, for the compound layer `key`:
   * the last one when `list` is unchanged, else `list` drawn into the other target. Null when the device cannot draw.
   */
  render(key: string, list: DrawList, width: number, height: number): TextureHandle | null {
    let entry = this.entries.get(key);
    if (entry && (entry.width !== width || entry.height !== height || !this.valid(entry))) {
      this.free(entry);
      entry = undefined;
    }
    if (!entry) {
      entry = { width, height, targets: [null, null], current: 0, snapshot: new DrawListSnapshot(), rendered: false, pass: this.pass };
      this.entries.set(key, entry);
    }
    entry.pass = this.pass;
    this.stats.layers += 1;
    const changed = entry.snapshot.update(list);
    if (changed || !entry.rendered) {
      const next: 0 | 1 = entry.rendered ? (entry.current === 0 ? 1 : 0) : 0;
      const target = (entry.targets[next] ??= this.gpu.createOffscreenTarget(width, height));
      if (!this.gpu.draw(list, target)) {
        // The device is not ready: draw again at the next pass.
        entry.snapshot = new DrawListSnapshot();
        return null;
      }
      entry.current = next;
      entry.rendered = true;
      this.stats.renders += 1;
    } else {
      this.stats.kept += 1;
    }
    return (entry.targets[entry.current] as OffscreenTarget).texture;
  }

  /** `list` drawn into a target of its own (Export frame: no reuse); `release` frees it. Null when the device cannot draw. */
  renderOnce(list: DrawList, width: number, height: number): { texture: TextureHandle; release: () => void } | null {
    const target = this.gpu.createOffscreenTarget(width, height);
    if (!this.gpu.draw(list, target)) {
      this.gpu.releaseTarget(target);
      return null;
    }
    return { texture: target.texture, release: () => this.gpu.releaseTarget(target) };
  }

  /** Ends a pass: compounds not drawn in it release their targets. */
  end(): void {
    let bytes = 0;
    for (const [key, entry] of this.entries) {
      if (entry.pass !== this.pass) {
        this.free(entry);
        this.entries.delete(key);
        continue;
      }
      for (const target of entry.targets) bytes += target?.texture.bytes ?? 0;
    }
    this.stats.bytes = bytes;
    this.onBytes?.(bytes);
  }

  /** Releases everything (project closed, device lost). */
  clear(): void {
    for (const entry of this.entries.values()) this.free(entry);
    this.entries.clear();
    this.stats.bytes = 0;
    this.onBytes?.(0);
  }

  /** Forgets what each compound drew (the next pass draws all again): the device was replaced. */
  private valid(entry: Entry): boolean {
    return entry.targets.every((target) => target === null || target.texture.valid);
  }

  private free(entry: Entry): void {
    for (const target of entry.targets) if (target) this.gpu.releaseTarget(target);
    entry.targets = [null, null];
  }
}
