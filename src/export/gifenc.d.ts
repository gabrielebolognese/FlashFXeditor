// Types of the parts of gifenc (MIT, no types of its own) the GIF writer uses.
declare module "gifenc" {
  export type Palette = number[][];
  export type PaletteFormat = "rgb565" | "rgb444" | "rgba4444";
  export interface FrameOptions {
    palette?: Palette | null;
    /** Milliseconds, written in hundredths of a second. */
    delay?: number;
    /** -1 once, 0 forever. */
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    first?: boolean;
    dispose?: number;
  }
  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  }
  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): GifEncoder;
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: { format?: PaletteFormat }): Palette;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: PaletteFormat): Uint8Array;
}
