import "./styles/tokens.css";
import "./styles/base.css";
import { Profiler, StrictMode } from "react";
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
import { AppBoundary, FatalScreen } from "./app/FatalScreen.js";
import { installPanelController } from "./app/panelController.js";
import { installSettingsController } from "./app/settingsController.js";
import { installHistoryController } from "./app/historyController.js";
import { installTemplateController } from "./app/templateController.js";
import { installCacheController } from "./app/cacheController.js";
import { installExportController } from "./app/exportController.js";
import { chooseBackend, forcedBackend } from "./render/gpu/backend.js";
import { webgl2Available } from "./render/gpu/GlContext.js";
import { requestGpuAdapter } from "./render/gpu/GpuDevice.js";

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing from index.html");
const root = createRoot(container);

async function start(): Promise<void> {
  performance.mark("app:start");
  const missing = findMissingApis(window);
  // A WebGPU adapter, else WebGL2 on the GPU (Batch 48); neither (blocklisted GPU, hardware
  // acceleration off) is unsupported too. `?renderer=webgl2` tries WebGL2 first (dev flag).
  const choice = missing.length === 0 ? await chooseBackend(forcedBackend(location.search), { requestAdapter: () => requestGpuAdapter(), webgl2: webgl2Available }) : null;
  if (!choice) {
    root.render(<UnsupportedScreen missing={missing.length > 0 ? missing : [GPU_ADAPTER_LABEL]} />);
    return;
  }
  performance.mark("app:gpu");
  startServices();
  installCommandController();
  installPanelController();
  startGpu(choice);
  installSettingsController();
  installProjectController();
  installHistoryController();
  installTemplateController();
  installCacheController();
  installExportController();
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
  // Dev builds: the performance overlay, benchmarks and the React commit counter (Batch 45).
  const perf = import.meta.env.DEV ? await import("./app/perfController.js") : null;
  perf?.installPerfController();
  root.render(
    <StrictMode>
      <AppBoundary>
        {perf ? (
          <>
            <Profiler id="app" onRender={perf.perfMonitor.reactCommit}>
              <App />
            </Profiler>
            <perf.PerfStats />
          </>
        ) : (
          <App />
        )}
      </AppBoundary>
    </StrictMode>,
  );
  // Every controller has registered its commands: the dev assertion (and the watch over buttons).
  if (import.meta.env.DEV) installCommandAudit();
}

// A startup that fails shows what failed and Reload, never a blank page (Batch 47).
start().catch((error: unknown) => {
  console.error("[app] the editor could not start", error);
  root.render(<FatalScreen message={error instanceof Error ? error.message || error.name : String(error)} />);
});
