import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { dismissToast, toastStore, type Toast, type ToastAction, type ToastLive, type ToastTone } from "../ui/toasts.js";
import styles from "./ToastHost.module.css";

const ICONS: Record<ToastTone, LucideIcon> = { info: Info, success: CircleCheck, error: CircleAlert };

const percent = (progress: number) => `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;

function ActionButton({ action }: { action: ToastAction }) {
  return (
    <button type="button" className={styles.action} data-control="" onMouseDown={(event) => event.preventDefault()} onClick={action.run}>
      {action.label}
    </button>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const Icon = ICONS[toast.tone];
  const detail = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const { live } = toast;
  // The live line and bar are written straight into the DOM (no React render per change), before the first paint.
  useLayoutEffect(() => {
    if (!live) return;
    const write = (state: ToastLive) => {
      if (detail.current) detail.current.textContent = state.detail;
      if (bar.current) bar.current.style.width = percent(state.progress);
    };
    write(live.getState());
    return live.subscribe(write);
  }, [live]);
  const progress = live ? live.getState().progress : toast.progress;
  return (
    <div className={styles.toast} data-tone={toast.tone} role={toast.tone === "error" ? "alert" : "status"}>
      <Icon className={styles.icon} aria-hidden="true" />
      <div className={styles.text}>
        <span className={styles.message}>{toast.message}</span>
        {live ? (
          <span ref={detail} className={styles.detail} />
        ) : (
          toast.detail && <span className={styles.detail}>{toast.detail}</span>
        )}
      </div>
      {toast.secondaryAction && <ActionButton action={toast.secondaryAction} />}
      {toast.action && <ActionButton action={toast.action} />}
      {!toast.pinned && (
        <button type="button" className={styles.close} aria-label="Dismiss" data-control="" onMouseDown={(event) => event.preventDefault()} onClick={() => dismissToast(toast.id)}>
          <X className={styles.closeIcon} aria-hidden="true" />
        </button>
      )}
      {progress !== undefined && (
        <div className={styles.track} aria-hidden="true">
          <div ref={bar} className={styles.bar} style={{ width: percent(progress) }} />
        </div>
      )}
    </div>
  );
}

/** The Dynamic Island: transient toasts, top center, newest at the bottom. */
export function ToastHost() {
  const toasts = useStoreSelector(toastStore, (list) => list);
  if (toasts.length === 0) return null;
  return (
    <div className={styles.host} aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
