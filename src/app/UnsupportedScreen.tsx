import { TriangleAlert } from "lucide-react";
import styles from "./UnsupportedScreen.module.css";

/** Full-screen message for browsers missing required APIs (spec §1.4). No degraded mode. */
export function UnsupportedScreen({ missing }: { missing: readonly string[] }) {
  return (
    <div className={styles.screen}>
      <div className={styles.card} role="alert">
        <div className={styles.header}>
          <TriangleAlert className={styles.icon} aria-hidden="true" />
          <h1 className={styles.title}>This browser cannot run Shorts Editor</h1>
        </div>
        <p className={styles.text}>
          Open it in the current stable version of Chrome or Edge on desktop. These required features are
          missing:
        </p>
        <ul className={styles.list}>
          {missing.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
