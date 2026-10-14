// Required browser APIs (spec §1.4). Missing any of them shows the unsupported screen; there is no
// degraded mode. WebGPU must also give an adapter (checked at startup, see main.tsx).

interface Requirement {
  label: string;
  present: (win: Window) => boolean;
}

const REQUIREMENTS: readonly Requirement[] = [
  { label: "WebGPU (navigator.gpu)", present: (w) => "gpu" in w.navigator },
  { label: "WebCodecs VideoDecoder", present: (w) => "VideoDecoder" in w },
  { label: "WebCodecs VideoEncoder", present: (w) => "VideoEncoder" in w },
  { label: "WebCodecs AudioDecoder", present: (w) => "AudioDecoder" in w },
  { label: "WebCodecs AudioEncoder", present: (w) => "AudioEncoder" in w },
  { label: "WebCodecs VideoFrame", present: (w) => "VideoFrame" in w },
  { label: "WebCodecs ImageDecoder", present: (w) => "ImageDecoder" in w },
  { label: "File System Access (showDirectoryPicker)", present: (w) => "showDirectoryPicker" in w },
  { label: "File System Access (showSaveFilePicker)", present: (w) => "showSaveFilePicker" in w },
];

/** Shown when navigator.gpu exists but no adapter can be acquired (blocklisted GPU, acceleration off). */
export const GPU_ADAPTER_LABEL = "A WebGPU adapter (a supported GPU with hardware acceleration turned on)";

/** Labels of the required APIs this browser lacks; empty when everything is available. */
export function findMissingApis(win: Window): string[] {
  return REQUIREMENTS.filter((r) => !r.present(win)).map((r) => r.label);
}
