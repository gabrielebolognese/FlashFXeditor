// Transient status messages (the design system's Dynamic Island): refusals, errors, progress.
// Framework-free; ToastHost renders the list. Progress toasts stay until updated or dismissed. A toast
// with a `live` store shows its progress and detail line from it, written into the toast as they
// change without rendering it again (P1: an export's progress while the user plays or drags).
import { createStore, type Store } from "../core/store/createStore.js";

export type ToastTone = "info" | "success" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  detail?: string;
  /** 0..1; shows a progress bar and keeps the toast open. */
  progress?: number;
  /** A text button before the close button (e.g. Cancel on a progress toast). */
  action?: ToastAction;
  /** A second text button before `action` (Pause on the export's progress toast). */
  secondaryAction?: ToastAction;
  /** The progress and detail line, followed live instead of `progress` and `detail`. */
  live?: Store<ToastLive>;
}

export interface ToastLive {
  /** 0..1 */
  progress: number;
  detail: string;
}

export interface ToastAction {
  label: string;
  run: () => void;
}

export type ToastInput = Omit<Toast, "id">;

/** How long a toast stays, by tone (gap: the design system gives no durations). */
export const TOAST_DURATION_MS: Record<ToastTone, number> = { info: 4000, success: 3000, error: 7000 };
const MAX_TOASTS = 4;

export const toastStore = createStore<readonly Toast[]>([]);

const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

function schedule(id: number, durationMs: number | null): void {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (durationMs !== null) timers.set(id, setTimeout(() => dismissToast(id), durationMs));
}

/** Shows a toast; `durationMs` null keeps it until dismissed (default: by tone, none with progress). */
export function showToast(input: ToastInput, options: { durationMs?: number | null } = {}): number {
  const id = nextId++;
  const toasts = [...toastStore.getState(), { ...input, id }];
  // The oldest go first when too many pile up.
  for (const dropped of toasts.splice(0, Math.max(0, toasts.length - MAX_TOASTS))) schedule(dropped.id, null);
  toastStore.set(toasts);
  schedule(id, options.durationMs !== undefined ? options.durationMs : input.progress !== undefined || input.live ? null : TOAST_DURATION_MS[input.tone]);
  return id;
}

/** Changes a toast in place; a new `durationMs` restarts its timer. */
export function updateToast(id: number, patch: Partial<ToastInput>, options: { durationMs?: number | null } = {}): void {
  toastStore.set((toasts) => toasts.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast)));
  if (options.durationMs !== undefined) schedule(id, options.durationMs);
}

export function dismissToast(id: number): void {
  schedule(id, null);
  toastStore.set((toasts) => (toasts.some((t) => t.id === id) ? toasts.filter((t) => t.id !== id) : toasts));
}
