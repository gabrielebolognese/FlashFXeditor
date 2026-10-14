import { useState } from "react";
import { PanelFrame, PanelTabs } from "../app/PanelFrame.js";
import { Placeholder } from "./Placeholder.js";

type MediaTab = "media" | "presets" | "captions";

const TABS = [
  { id: "media", label: "Media" },
  { id: "presets", label: "Presets" },
  { id: "captions", label: "Captions" },
] as const;

const DETAILS: Record<MediaTab, string> = {
  media: "Imported media, bins, search, hover-scrub",
  presets: "Text preset library",
  captions: "Caption cue editor",
};

// TODO(batch 04): media grid, import and probe. Presets and Captions tabs fill in from Batches 30 and 32.
export function MediaPanel() {
  const [tab, setTab] = useState<MediaTab>("media");
  return (
    <PanelFrame id="media" header={<PanelTabs tabs={TABS} active={tab} onChange={setTab} />}>
      <Placeholder name={TABS.find((t) => t.id === tab)?.label ?? ""} detail={DETAILS[tab]} />
    </PanelFrame>
  );
}
