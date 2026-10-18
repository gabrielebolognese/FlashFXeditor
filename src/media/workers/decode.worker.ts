// decode.worker entry (spec §3.5): probes and image posters, animated image frames and strips
// (Batch 34), the video decode sessions (sample index, requestFrame, prefetch) and MP4/MOV audio
// (decode/AudioTracks.ts). The handlers are decodeHandlers.ts's (the export worker runs its own set).
import { DECODE_CONCURRENCY, DECODE_IMMEDIATE, decodeHandlers } from "./decodeHandlers.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

new WorkerHost(self as unknown as HostScope, decodeHandlers(), DECODE_CONCURRENCY, DECODE_IMMEDIATE);
