import { PanelFrame, PanelTabs } from "../app/PanelFrame.js";
import { sessionStore } from "../app/services.js";
import type { MediaTab as MediaTabId, SessionState } from "../core/store/sessionStore.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { MediaActions, MediaTab } from "./media/MediaTab.js";
import { Placeholder } from "./Placeholder.js";

const TABS = [
  { id: "media", label: "Media" },
  { id: "presets", label: "Presets" },
  { id: "captions", label: "Captions" },
] as const;

const selectTab = (state: SessionState) => state.mediaPanel.tab;
const setTab = (tab: MediaTabId) => sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, tab } }));

// TODO(batch 30): Presets tab. TODO(batch 32): Captions tab. TODO(batch 41): bins, search, filter chips.
export function MediaPanel() {
  const tab = useStoreSelector(sessionStore.state, selectTab);
  return (
    <PanelFrame id="media" header={<PanelTabs tabs={TABS} active={tab} onChange={setTab} />} actions={tab === "media" ? <MediaActions /> : undefined}>
      {tab === "media" ? <MediaTab /> : tab === "presets" ? <Placeholder name="Presets" detail="Text preset library" /> : <Placeholder name="Captions" detail="Caption cue editor" />}
    </PanelFrame>
  );
}
