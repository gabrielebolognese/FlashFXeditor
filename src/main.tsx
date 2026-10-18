import "./styles/tokens.css";
import "./styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { findMissingApis, GPU_ADAPTER_LABEL } from "./app/compat.js";
import { installAudioController } from "./app/audioController.js";
import { installAudioEditController } from "./app/audioEditController.js";
import { installCanvasController } from "./app/canvasController.js";
import { installCaptionController } from "./app/captionController.js";
import { installClipboardController } from "./app/clipboardController.js";
import { installCommandAudit } from "./app/commandAudit.js";
import { installCommandController } from "./app/commandController.js";
import { installTranscribeController } from "./app/transcribeController.js";
import { installCutController } from "./app/cutController.js";
import { installDropController } from "./app/dropController.js";
import { installGraphicsController } from "./app/graphicsController.js";
import { installKeyframeController } from "./app/keyframeController.js";
import { installMarkerController } from "./app/markerController.js";
import { installMediaController } from "./app/mediaController.js";
import { installPlaybackController } from "./app/playbackController.js";
import { installPresetController } from "./app/presetController.js";
import { installPreviewController, startGpu } from "./app/previewController.js";
import { installProjectController } from "./app/projectController.js";
import { installPropertiesController } from "./app/propertiesController.js";
import { startServices } from "./app/services.js";
import { installSilenceController } from "./app/silenceController.js";
import { installSpeedController } from "./app/speedController.js";
import { installTextController } from "./app/textController.js";
import { installTimelineController } from "./app/timelineController.js";
import { installTransitionController } from "./app/transitionController.js";
import { installTrackController } from "./app/trackController.js";
import { UnsupportedScreen } from "./app/UnsupportedScreen.js";
import { installSettingsController } from "./app/settingsController.js";
import { installHistoryController } from "./app/historyController.js";
import { installTemplateController } from "./app/templateController.js";
import { installCacheController } from "./app/cacheController.js";
import { requestGpuAdapter } from "./render/gpu/GpuDevice.js";

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing from index.html");
const root = createRoot(container);

async function start(): Promise<void> {
  const missing = findMissingApis(window);
  // WebGPU without an adapter (blocklisted GPU, hardware acceleration off) is unsupported too.
  const adapter = missing.length === 0 ? await requestGpuAdapter() : null;
  if (!adapter) {
    root.render(<UnsupportedScreen missing={missing.length > 0 ? missing : [GPU_ADAPTER_LABEL]} />);
    return;
  }
  startServices();
  installCommandController();
  startGpu(adapter);
  installSettingsController();
  installProjectController();
  installHistoryController();
  installTemplateController();
  installCacheController();
  installMediaController();
  installDropController();
  installPreviewController();
  installTimelineController();
  installCutController();
  installCanvasController();
  installPropertiesController();
  installSpeedController();
  installKeyframeController();
  installTransitionController();
  installTextController();
  installGraphicsController();
  installPresetController();
  installCaptionController();
  installTranscribeController();
  installMarkerController();
  installTrackController();
  installPlaybackController();
  installAudioController();
  installAudioEditController();
  installSilenceController();
  installClipboardController();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  // Every controller has registered its commands: the dev assertion (and the watch over buttons).
  if (import.meta.env.DEV) installCommandAudit();
}

void start();
