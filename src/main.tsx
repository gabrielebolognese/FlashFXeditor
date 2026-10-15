import "./styles/tokens.css";
import "./styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { findMissingApis, GPU_ADAPTER_LABEL } from "./app/compat.js";
import { installAudioController } from "./app/audioController.js";
import { installCutController } from "./app/cutController.js";
import { installDropController } from "./app/dropController.js";
import { installMarkerController } from "./app/markerController.js";
import { installMediaController } from "./app/mediaController.js";
import { installPlaybackController } from "./app/playbackController.js";
import { installPreviewController, startGpu } from "./app/previewController.js";
import { installProjectController } from "./app/projectController.js";
import { startServices } from "./app/services.js";
import { installTimelineController } from "./app/timelineController.js";
import { installTrackController } from "./app/trackController.js";
import { UnsupportedScreen } from "./app/UnsupportedScreen.js";
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
  startGpu(adapter);
  installProjectController();
  installMediaController();
  installDropController();
  installPreviewController();
  installTimelineController();
  installCutController();
  installMarkerController();
  installTrackController();
  installPlaybackController();
  installAudioController();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
