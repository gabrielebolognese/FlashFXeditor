import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { revealSection } from "../app/captionController.js";
import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { documentStore, sessionStore } from "../app/services.js";
import type { Selection } from "../core/store/selection.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { AnimationSection } from "./properties/AnimationSection.js";
import { CaptionStyleSection } from "./properties/CaptionStyleSection.js";
import { ClipSection } from "./properties/ClipSection.js";
import { CropModeToggle, CropSection } from "./properties/CropSection.js";
import { contextKey, propertiesContext, sectionIds, type PropertiesContext, type SectionId } from "./properties/context.js";
import { KeyframeControls } from "./properties/KeyframeControls.js";
import { MarkerSection } from "./properties/MarkerSection.js";
import { ProjectSection } from "./properties/ProjectSection.js";
import { QuickActions } from "./properties/QuickActions.js";
import { Section } from "./properties/Section.js";
import { SolidSection } from "./properties/SolidSection.js";
import { SpeedSection } from "./properties/SpeedSection.js";
import { TextSection } from "./properties/TextSection.js";
import { TrackSection } from "./properties/TrackSection.js";
import { OpacitySection, TransformSection } from "./properties/TransformSection.js";
import styles from "./PropertiesPanel.module.css";

// The properties panel (spec §11): context-driven sections from a registry keyed by the selection kind
// (context.ts), each collapsible with its state persisted; the quick-action row on top for a clip
// selection. The panel renders when the selection kind, its ids or the primary item change (one
// selector on a key string), never on value changes: fields are bound to the store outside React.
// The panel is the `properties` keyboard scope (PanelFrame's data-scope); Tab follows the visual order.
// A section asked for by `revealSection` (the Captions header's Style) is scrolled to and focused.

const SECTION_TITLES: Record<SectionId, string> = {
  clip: "Clip",
  text: "Text",
  animation: "Animation",
  solid: "Solid",
  captionStyle: "Caption style",
  transform: "Transform",
  crop: "Crop",
  opacity: "Opacity",
  speed: "Speed",
  track: "Track",
  marker: "Marker",
  project: "Project",
};

function sectionBody(id: SectionId, context: PropertiesContext): ReactNode {
  switch (id) {
    case "clip":
      return context.kind === "clips" ? <ClipSection ids={context.clipIds} /> : null;
    case "text":
      return context.kind === "clips" ? <TextSection ids={context.textIds} /> : null;
    case "animation":
      return context.kind === "clips" ? <AnimationSection ids={context.textIds} primary={context.primary} /> : null;
    case "solid":
      return context.kind === "clips" ? <SolidSection ids={context.solidIds} /> : null;
    case "captionStyle":
      return (context.kind === "clips" || context.kind === "track") && context.captionTrackId ? <CaptionStyleSection trackId={context.captionTrackId} /> : null;
    case "transform":
      return context.kind === "clips" ? <TransformSection ids={context.layerIds} /> : null;
    case "crop":
      return context.kind === "clips" ? <CropSection ids={context.mediaIds} /> : null;
    case "opacity":
      return context.kind === "clips" ? <OpacitySection ids={context.layerIds} /> : null;
    case "speed":
      return context.kind === "clips" ? <SpeedSection ids={context.speedIds} /> : null;
    case "track":
      return context.kind === "track" ? <TrackSection ids={context.trackIds} /> : null;
    case "marker":
      return context.kind === "marker" ? <MarkerSection markerId={context.markerId} /> : null;
    case "project":
      return <ProjectSection />;
  }
}

/**
 * Header actions of a section: the Crop section's crop mode toggle (one video or image layer selected);
 * the stopwatch and keyframe navigator of Transform and Opacity (spec §11, Batch 35).
 */
function sectionActions(id: SectionId, context: PropertiesContext): ReactNode {
  if (context.kind !== "clips") return null;
  if (id === "transform" || id === "opacity") return <KeyframeControls ids={context.layerIds} section={id} />;
  if (id !== "crop") return null;
  return <CropModeToggle ids={context.mediaIds} single={context.layerIds.length === 1 && context.mediaIds.length === 1} />;
}

const selectKey = (selection: Selection) => contextKey(selection, null);

export function PropertiesPanel() {
  const selectionKey = useStoreSelector(sessionStore.selection, selectKey);
  const markerId = useStoreSelector(sessionStore.marker, (id) => id);
  // The key changes with every selection change the context depends on; the document is read once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const context = useMemo(() => propertiesContext(sessionStore.selection.getState(), markerId, documentStore.getState()), [selectionKey, markerId]);
  const key = contextKey(sessionStore.selection.getState(), markerId);
  const body = useRef<HTMLDivElement>(null);
  const reveal = useStoreSelector(revealSection, (id) => id);
  useEffect(() => {
    const section = reveal ? body.current?.querySelector<HTMLElement>(`[data-section="${reveal}"]`) : null;
    // Waits for the context that shows the section (the effect runs again when it renders).
    if (!section) return;
    revealSection.set(null);
    section.scrollIntoView({ block: "start" });
    section.querySelector<HTMLElement>("[aria-pressed='true'], input, textarea, select")?.focus();
  }, [reveal, key]);
  const title = context.kind === "clips" && context.clipIds.length > 1 ? `${context.clipIds.length} clips` : context.kind === "track" && context.trackIds.length > 1 ? `${context.trackIds.length} tracks` : null;
  return (
    <PanelFrame id="properties" header={<PanelTitle>Edit Properties</PanelTitle>} actions={title && <span className={styles.count}>{title}</span>}>
      <div ref={body} className={styles.body}>
        {context.kind === "clips" && <QuickActions ids={context.clipIds} primary={context.primary} />}
        {/* Keyed by the context: a new selection mounts fresh sections (their bindings follow it). */}
        <div key={key} className={styles.scroll}>
          {sectionIds(context).map((id) => (
            <Section key={id} id={id} title={SECTION_TITLES[id]} actions={sectionActions(id, context)}>
              {sectionBody(id, context)}
            </Section>
          ))}
        </div>
      </div>
    </PanelFrame>
  );
}
