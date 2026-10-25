import { memo, useEffect, useRef } from "react";
import { bindProxyProgress } from "../../app/mediaController.js";
import type { MediaId, MediaItem } from "../../core/document/types.js";
import styles from "./MediaTab.module.css";

// The proxy of a video (spec §9.5, §12): the card's `PX` chip and the list's Proxy cell. The share
// done of a running job is written by `bindProxyProgress` (direct DOM writes, never a React render).

type ProxyStatus = NonNullable<MediaItem["proxy"]>["status"];

const CHIP_TOOLTIPS: Record<Exclude<ProxyStatus, "none">, string> = {
  pending: "Proxy being made (Remove proxy cancels it)",
  ready: "Proxy ready",
  failed: "No proxy: it could not be made (Generate proxy tries again)",
};

/** The card's `PX` chip: tertiary while pending (with its percentage and bar), success when ready, danger when failed. */
export const ProxyBadge = memo(function ProxyBadge({ id, status }: { id: MediaId; status: ProxyStatus }) {
  const text = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => (status === "pending" ? bindProxyProgress(id, text.current, bar.current) : undefined), [id, status]);
  if (status === "none") return null;
  return (
    <span className={styles.proxyBadge} data-status={status} data-tooltip={CHIP_TOOLTIPS[status]}>
      PX
      {status === "pending" && (
        <>
          <span ref={text} className={styles.proxyPercent} />
          <span ref={bar} className={styles.proxyBar} />
        </>
      )}
    </span>
  );
});

/** The list view's Proxy column: None, Queued or the share done, the proxy's size, Failed. */
export const ProxyCell = memo(function ProxyCell({ item }: { item: MediaItem }) {
  const text = useRef<HTMLSpanElement>(null);
  const status = item.kind === "video" ? (item.proxy?.status ?? "none") : "none";
  useEffect(() => (status === "pending" ? bindProxyProgress(item.id, text.current, null, "Queued") : undefined), [item.id, status]);
  if (status === "pending") return <span ref={text} className={styles.mono} />;
  if (status === "ready" && item.proxy) return <span className={styles.mono}>{`${item.proxy.width}×${item.proxy.height}`}</span>;
  if (status === "failed") return <span className={styles.failed}>Failed</span>;
  return <span className={styles.muted}>None</span>;
});
