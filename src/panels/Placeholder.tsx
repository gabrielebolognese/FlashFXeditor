import styles from "./Placeholder.module.css";

/** Temporary panel body: the panel name and what will live there. */
export function Placeholder({ name, detail }: { name: string; detail?: string }) {
  return (
    <div className={styles.placeholder}>
      <span className={styles.name}>{name}</span>
      {detail && <span className={styles.detail}>{detail}</span>}
    </div>
  );
}
