// Panel reloads (Batch 47): `panel.reload` and the bridge that turns a canvas view failing frame after
// frame into its panel's error state.
import { panelOfFlags, reportPanelFault, runPanelReload } from "./panelErrors.js";
import { actions, scheduler } from "./services.js";

export function installPanelController(): () => void {
  scheduler.onViewFailure = (flags, error) => {
    const panel = panelOfFlags(flags);
    if (panel) reportPanelFault(panel, error);
  };
  const stop = actions.register("panel.reload", runPanelReload);
  return () => {
    stop();
    scheduler.onViewFailure = null;
  };
}
