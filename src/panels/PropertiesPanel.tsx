import { useMemo, type ReactNode } from "react";
import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { documentStore, sessionStore } from "../app/services.js";
import type { Selection } from "../core/store/selection.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { ClipSection } from "./properties/ClipSection.js";
import { contextKey, propertiesContext, sectionIds, type PropertiesContext, type SectionId } from "./properties/context.js";
import { MarkerSection } from "./properties/MarkerSection.js";
import { ProjectSection } from "./properties/ProjectSection.js";
import { QuickActions } from "./properties/QuickActions.js";
import { Section } from "./properties/Section.js";
import { TrackSection } from "./properties/TrackSection.js";
import { OpacitySection, TransformSection } from "./properties/TransformSection.js";
import styles from "./PropertiesPanel.module.css";

// The properties panel (spec §11): context-driven sections from a registry keyed by the selection kind
// (context.ts), each collapsible with its state persisted; the quick-action row on top for a clip
// selection. The panel renders when the selection kind, its ids or the primary item change (one
// selector on a key string), never on value changes: fields are bound to the store outside React.
// The panel is the `properties` keyboard scope (PanelFrame's data-scope); Tab follows the visual order.

const SECTION_TITLES: Record<SectionId, string> = {
  clip: "Clip",
  transform: "Transform",
  opacity: "Opacity",
  track: "Track",
  marker: "Marker",
  project: "Project",
};

function sectionBody(id: SectionId, context: PropertiesContext): ReactNode {
  switch (id) {
    case "clip":
      return context.kind === "clips" ? <ClipSection ids={context.clipIds} /> : null;
    case "transform":
      return context.kind === "clips" ? <TransformSection ids={context.layerIds} /> : null;
    case "opacity":
      return context.kind === "clips" ? <OpacitySection ids={context.layerIds} /> : null;
    case "track":
      return context.kind === "track" ? <TrackSection ids={context.trackIds} /> : null;
    case "marker":
      return context.kind === "marker" ? <MarkerSection markerId={context.markerId} /> : null;
    case "project":
      return <ProjectSection />;
  }
}

const selectKey = (selection: Selection) => contextKey(selection, null);

export function PropertiesPanel() {
  const selectionKey = useStoreSelector(sessionStore.selection, selectKey);
  const markerId = useStoreSelector(sessionStore.marker, (id) => id);
  // The key changes with every selection change the context depends on; the document is read once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const context = useMemo(() => propertiesContext(sessionStore.selection.getState(), markerId, documentStore.getState()), [selectionKey, markerId]);
  const key = contextKey(sessionStore.selection.getState(), markerId);
  const title = context.kind === "clips" && context.clipIds.length > 1 ? `${context.clipIds.length} clips` : context.kind === "track" && context.trackIds.length > 1 ? `${context.trackIds.length} tracks` : null;
  return (
    <PanelFrame id="properties" header={<PanelTitle>Edit Properties</PanelTitle>} actions={title && <span className={styles.count}>{title}</span>}>
      <div className={styles.body}>
        {context.kind === "clips" && <QuickActions ids={context.clipIds} primary={context.primary} />}
        {/* Keyed by the context: a new selection mounts fresh sections (their bindings follow it). */}
        <div key={key} className={styles.scroll}>
          {sectionIds(context).map((id) => (
            <Section key={id} id={id} title={SECTION_TITLES[id]}>
              {sectionBody(id, context)}
            </Section>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}
