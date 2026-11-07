// The last draw list a view drew, flattened into reused buffers (spec §9.4, P3): when the next list
// draws exactly the same thing (same textures, transforms, opacities, crops, colors), the view skips
// the GPU redraw. Comparing allocates nothing once the buffers are big enough.
import type { TextureHandle } from "../gpu/renderer.js";
import type { DissolveSide, DrawList } from "./drawList.js";

const KIND_CODE = { texture: 1, dissolve: 2, solid: 3 } as const;

export class DrawListSnapshot {
  private current = new Float64Array(64);
  private next = new Float64Array(64);
  private currentRefs: (TextureHandle | null)[] = [];
  private nextRefs: (TextureHandle | null)[] = [];
  private currentLength = -1;
  private length = 0;
  private refCount = 0;
  private currentRefCount = 0;

  /** Records `list` and returns true when it differs from the one recorded before (or nothing was). */
  update(list: DrawList): boolean {
    this.length = 0;
    this.refCount = 0;
    this.push(list.width);
    this.push(list.height);
    this.color(list.background);
    this.push(list.layers.length);
    for (const layer of list.layers) {
      this.push(KIND_CODE[layer.kind]);
      for (let i = 0; i < 6; i++) this.push(layer.transform[i] as number);
      this.push(layer.opacity);
      switch (layer.kind) {
        case "texture":
          this.ref(layer.texture);
          this.uv(layer.crop);
          this.push(layer.flipX ? 1 : 0);
          this.push(layer.flipY ? 1 : 0);
          this.push(layer.blur ?? 0);
          this.frame(layer.shape);
          break;
        case "dissolve":
          this.side(layer.from);
          this.side(layer.to);
          this.push(layer.mix);
          break;
        case "solid": {
          this.color(layer.color);
          this.color(layer.to ?? layer.color);
          const shape = layer.shape;
          this.push(shape ? (shape.kind === "ellipse" ? 2 : 1) : 0);
          this.push(shape?.width ?? 0);
          this.push(shape?.height ?? 0);
          this.push(shape?.radius ?? 0);
          const radii = shape?.radii;
          for (let i = 0; i < 4; i++) this.push(radii ? (radii[i] as number) : 0);
          const style = layer.style;
          if (!style) this.push(0);
          else {
            this.push(style.part === "all" ? 1 : style.part === "shadow" ? 2 : 3);
            const g = style.gradient;
            this.push(g ? (g.type === "radial" ? 2 : 1) : 0);
            if (g) {
              this.push(g.angle);
              this.push(g.radius);
              this.push(g.center.x);
              this.push(g.center.y);
              this.push(g.stops.length);
              for (const stop of g.stops) {
                this.push(stop.at);
                this.color(stop.color);
              }
            }
            const stroke = style.stroke;
            this.push(stroke ? stroke.width : -1);
            if (stroke) {
              this.color(stroke.color);
              this.push(stroke.align === "inside" ? 0 : stroke.align === "center" ? 1 : 2);
              this.push(stroke.dashOffset ?? 0);
              this.push(stroke.dash?.length ?? 0);
              for (const v of stroke.dash ?? []) this.push(v);
            }
            const shadow = style.shadow;
            this.push(shadow ? 1 : 0);
            if (shadow) {
              this.push(shadow.x);
              this.push(shadow.y);
              this.push(shadow.blur);
              this.push(shadow.spread);
              this.color(shadow.color);
            }
          }
          break;
        }
      }
    }
    const changed = !this.same();
    const numbers = this.current;
    this.current = this.next;
    this.next = numbers;
    const refs = this.currentRefs;
    this.currentRefs = this.nextRefs;
    this.nextRefs = refs;
    this.currentLength = this.length;
    this.currentRefCount = this.refCount;
    return changed;
  }

  /** Forgets the recorded list: the next `update` reports a change (a failed draw, a new device). */
  reset(): void {
    this.currentLength = -1;
  }

  private same(): boolean {
    if (this.length !== this.currentLength || this.refCount !== this.currentRefCount) return false;
    for (let i = 0; i < this.length; i++) if (this.next[i] !== this.current[i]) return false;
    for (let i = 0; i < this.refCount; i++) if (this.nextRefs[i] !== this.currentRefs[i]) return false;
    return true;
  }

  private push(value: number): void {
    if (this.length === this.next.length) {
      const grown = new Float64Array(this.next.length * 2);
      grown.set(this.next);
      this.next = grown;
    }
    this.next[this.length++] = value;
  }

  private ref(texture: TextureHandle): void {
    this.nextRefs[this.refCount++] = texture;
    // A texture destroyed since (evicted, device lost) must not count as the same picture.
    this.push(texture.valid ? 1 : 0);
  }

  /** A dissolve's picture: its texture, quad, crop and opacity. */
  private side(side: DissolveSide): void {
    this.ref(side.texture);
    for (let i = 0; i < 6; i++) this.push(side.transform[i] as number);
    this.uv(side.crop);
    this.push(side.opacity);
  }

  /** A picture's rounded rectangle (or none). */
  private frame(shape: { width: number; height: number; radii: readonly number[] } | null | undefined): void {
    this.push(shape ? shape.width : -1);
    if (!shape) return;
    this.push(shape.height);
    for (const r of shape.radii) this.push(r);
  }

  private uv(rect: { u0: number; v0: number; u1: number; v1: number }): void {
    this.push(rect.u0);
    this.push(rect.v0);
    this.push(rect.u1);
    this.push(rect.v1);
  }

  private color(color: { r: number; g: number; b: number; a: number }): void {
    this.push(color.r);
    this.push(color.g);
    this.push(color.b);
    this.push(color.a);
  }
}
