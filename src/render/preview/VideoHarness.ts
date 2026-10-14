// Batch 06 test harness (temporary): the video selected in the Media panel is drawn into the project
// frame at the frame chosen on a dev scrub bar. Each bar move asks the FrameService for that frame
// with scrub priority, so a newer move supersedes the older one, and the progressive delivery (P8)
// shows a stand-in first, then the exact frame. The shown frame stays pinned in the pool. The bar is
// plain DOM written here (no React state): dragging it costs no React commit (P1). Rotation is
// applied in the layer transform (§9.3).
// TODO(batch 08): removed with ImageHarness; the compositor draws the timeline at the playhead.
import { formatDurationUs } from "../../core/document/time.js";
import type { MediaId, MediaItem, Project } from "../../core/document/types.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { TexturePool } from "../../media/cache/TexturePool.js";
import type { FrameResult, FrameService } from "../../media/decode/FrameService.js";
import { codecLabel } from "../../media/mediaKinds.js";
import { isAbortError, type VideoInfo } from "../../media/workers/protocol.js";
import { errorMessage } from "../../project/errorMessage.js";
import { FULL_UV, type Layer } from "../compositor/drawList.js";
import type { Renderer } from "../gpu/renderer.js";
import { pickPreviewMedia, type MediaSelectionLike } from "./ImageHarness.js";
import { rotatedContainTransform } from "./viewport.js";

/** The scrub bar's elements, created by the preview panel. */
export interface ScrubBarElements {
  /** Hidden while no video is selected. */
  root: HTMLElement;
  /** A range over the frames (display positions). */
  input: HTMLInputElement;
  /** Frame number and time. */
  readout: HTMLElement;
  /** "approx 3 ms", "exact 41 ms", or an error; `data-state` is approx | exact | error | busy. */
  status: HTMLElement;
}

export interface VideoHarnessDeps {
  frames: Pick<FrameService, "video" | "getFrame">;
  pool: Pick<TexturePool, "pin">;
  preview: { setLayers(layers: readonly Layer[]): void; clearLayers(owned: readonly Layer[]): void };
  document: Pick<DocumentStore, "getState" | "subscribe">;
  panel: Pick<Store<{ selection: MediaSelectionLike }>, "getState" | "select">;
  renderer: Pick<Renderer, "subscribe">;
  now?: () => number;
}

type Status = "approx" | "exact" | "error" | "busy";

export class VideoHarness {
  private current: MediaId | null = null;
  private info: VideoInfo | null = null;
  private position = 0;
  /** Cancels the requests of the shown video when another one is selected. */
  private controller: AbortController | null = null;
  /** Bumped by each bar move; older answers are ignored. */
  private token = 0;
  private shown: FrameResult | null = null;
  private unpin: (() => void) | null = null;
  private layers: readonly Layer[] = [];
  private bar: ScrubBarElements | null = null;

  constructor(private readonly deps: VideoHarnessDeps) {}

  /** Follows the Media panel selection of the open project. Returns a stop function. */
  attach(): () => void {
    const { panel, document, renderer } = this.deps;
    const stops = [
      panel.select((state) => pickVideo(state.selection, document.getState().media), (id) => this.show(id), { fireImmediately: true }),
      document.subscribe((state) => this.syncDocument(state), { affects: ["media", "settings"] }),
      renderer.subscribe((event) => {
        // A new device: the pool was emptied. Ask for the frame again.
        if (event === "ready" && this.info) this.seek(this.position);
      }),
    ];
    return () => {
      for (const stop of stops) stop();
      this.show(null);
    };
  }

  /** Takes over the bar's elements (mounted once by the preview panel). Returns a detach function. */
  attachBar(bar: ScrubBarElements): () => void {
    this.bar = bar;
    const onInput = () => this.seek(Number(bar.input.value));
    bar.input.addEventListener("input", onInput);
    this.paintBar();
    return () => {
      bar.input.removeEventListener("input", onInput);
      if (this.bar === bar) this.bar = null;
    };
  }

  private syncDocument(state: Project): void {
    const id = pickVideo(this.deps.panel.getState().selection, state.media);
    if (id !== this.current) this.show(id);
    // Same video: a settings change (frame size) re-fits the frame.
    else if (this.shown) this.display(this.shown);
  }

  private show(id: MediaId | null): void {
    if (id === this.current) return;
    this.controller?.abort();
    this.controller = null;
    this.token += 1;
    this.current = id;
    this.info = null;
    this.position = 0;
    this.shown = null;
    this.unpin?.();
    this.unpin = null;
    this.deps.preview.clearLayers(this.layers);
    this.layers = [];
    this.paintBar();
    if (!id) return;
    const controller = new AbortController();
    this.controller = controller;
    this.setStatus("busy", "Opening…");
    this.deps.frames.video(id).then(
      (info) => {
        if (controller.signal.aborted) return;
        this.info = info;
        this.paintBar();
        if (!info.decodable) {
          this.refuse(info);
          return;
        }
        this.seek(0);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) this.setStatus("error", errorMessage(error));
      },
    );
  }

  private seek(position: number): void {
    const { current: id, info, controller } = this;
    if (!id || !info || !info.decodable || !controller) return;
    this.position = Math.max(0, Math.min(info.frameTimesUs.length - 1, Math.round(position)));
    const token = ++this.token;
    const started = this.now();
    const elapsed = () => Math.round(this.now() - started);
    this.paintReadout();
    this.deps.frames
      .getFrame(id, info.frameTimesUs[this.position] as number, {
        priority: "scrub",
        signal: controller.signal,
        onApproximate: (result) => {
          if (token !== this.token) return;
          this.display(result);
          this.setStatus("approx", `approx ${elapsed()} ms`);
        },
      })
      .then(
        (result) => {
          if (token !== this.token) return;
          this.display(result);
          this.setStatus("exact", `exact ${elapsed()} ms`);
        },
        (error: unknown) => {
          if (token !== this.token || isAbortError(error)) return;
          // The decoder refused the video only when it tried (isConfigSupported said yes).
          if ((error as { name?: unknown }).name === "UnsupportedCodecError") this.refuse(info);
          else this.setStatus("error", errorMessage(error));
        },
      );
  }

  /** The error badge of a video this browser cannot decode; the bar stays disabled. */
  private refuse(info: VideoInfo): void {
    if (this.bar) this.bar.input.disabled = true;
    this.setStatus("error", `Can't decode ${codecLabel(info.codec)} (${info.codec}) in this browser`);
  }

  /** Draws a frame contained and upright in the project frame, and keeps its texture pinned. */
  private display(result: FrameResult): void {
    if (!this.info || !result.texture.valid) return;
    if (!this.shown || this.shown.key.timeUs !== result.key.timeUs || this.shown.key.mediaId !== result.key.mediaId || this.shown.key.lod !== result.key.lod) {
      const unpin = this.deps.pool.pin(result.key);
      this.unpin?.();
      this.unpin = unpin;
    }
    this.shown = result;
    const { settings } = this.deps.document.getState();
    this.layers = [
      {
        kind: "texture",
        texture: result.texture,
        transform: rotatedContainTransform(result.texture, this.info.rotation, settings),
        opacity: 1,
        crop: FULL_UV,
        flipX: false,
        flipY: false,
      },
    ];
    this.deps.preview.setLayers(this.layers);
  }

  private paintBar(): void {
    const bar = this.bar;
    if (!bar) return;
    bar.root.hidden = this.current === null;
    const count = this.info?.frameTimesUs.length ?? 1;
    bar.input.min = "0";
    bar.input.max = String(Math.max(0, count - 1));
    bar.input.step = "1";
    bar.input.value = String(this.position);
    bar.input.disabled = !this.info?.decodable;
    this.paintReadout();
  }

  private paintReadout(): void {
    const bar = this.bar;
    if (!bar) return;
    const times = this.info?.frameTimesUs;
    if (!times || times.length === 0) {
      bar.readout.textContent = "";
      return;
    }
    if (bar.input.value !== String(this.position)) bar.input.value = String(this.position);
    bar.readout.textContent = `${this.position + 1}/${times.length} · ${formatDurationUs(times[this.position] as number, true)}`;
  }

  private setStatus(state: Status, text: string): void {
    if (!this.bar) return;
    this.bar.status.dataset.state = state;
    this.bar.status.textContent = text;
  }

  private now(): number {
    return this.deps.now?.() ?? performance.now();
  }
}

function pickVideo(selection: MediaSelectionLike, media: Record<MediaId, MediaItem>): MediaId | null {
  const id = pickPreviewMedia(selection, media);
  return id !== null && media[id]?.kind === "video" ? id : null;
}
