import { PanelFrame, PanelTabs } from "../app/PanelFrame.js";
import { actions, sessionStore } from "../app/services.js";
import type { MediaTab as MediaTabId, SessionState } from "../core/store/sessionStore.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { CaptionsActions, CaptionsTab } from "./media/CaptionsTab.js";
import { MediaActions, MediaTab } from "./media/MediaTab.js";
import { PresetsActions, PresetsTab } from "./media/PresetsTab.js";

const TABS = [
  { id: "media", label: "Media" },
  { id: "presets", label: "Presets" },
  { id: "captions", label: "Captions" },
] as const;

const selectTab = (state: SessionState) => state.mediaPanel.tab;
/** The tabs are commands too (`panel.media`, `panel.presets`, `panel.captions`: the palette has them). */
const tabCommand = (tab: MediaTabId) => `panel.${tab}`;
const setTab = (tab: MediaTabId) => void actions.run(tabCommand(tab));

// The Media tab holds the bins, the search and the filter chips (Batch 41).
export function MediaPanel() {
  const tab = useStoreSelector(sessionStore.state, selectTab);
  return (
    <PanelFrame id="media" header={<PanelTabs tabs={TABS} active={tab} onChange={setTab} commandOf={tabCommand} />} actions={tab === "media" ? <MediaActions /> : tab === "presets" ? <PresetsActions /> : <CaptionsActions />}>
      {tab === "media" ? <MediaTab /> : tab === "presets" ? <PresetsTab /> : <CaptionsTab />}
    </PanelFrame>
  );
}
