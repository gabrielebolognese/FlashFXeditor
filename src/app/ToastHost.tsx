import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from "lucide-react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { dismissToast, toastStore, type Toast, type ToastTone } from "../ui/toasts.js";
import styles from "./ToastHost.module.css";

const ICONS: Record<ToastTone, LucideIcon> = { info: Info, success: CircleCheck, error: CircleAlert };

function ToastItem({ toast }: { toast: Toast }) {
  const Icon = ICONS[toast.tone];
  return (
    <div className={styles.toast} data-tone={toast.tone} role={toast.tone === "error" ? "alert" : "status"}>
      <Icon className={styles.icon} aria-hidden="true" />
      <div className={styles.text}>
        <span className={styles.message}>{toast.message}</span>
        {toast.detail && <span className={styles.detail}>{toast.detail}</span>}
      </div>
      {toast.action && (
        <button type="button" className={styles.action} onMouseDown={(event) => event.preventDefault()} onClick={toast.action.run}>
          {toast.action.label}
        </button>
      )}
      <button type="button" className={styles.close} aria-label="Dismiss" onMouseDown={(event) => event.preventDefault()} onClick={() => dismissToast(toast.id)}>
        <X className={styles.closeIcon} aria-hidden="true" />
      </button>
      {toast.progress !== undefined && (
        <div className={styles.track} aria-hidden="true">
          <div className={styles.bar} style={{ width: `${Math.round(Math.min(1, Math.max(0, toast.progress)) * 100)}%` }} />
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
