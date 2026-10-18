import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { licenses } from "./scripts/licenses.js";

// Third-party licenses of the main and the worker bundles in dist/licenses.txt (Batch 50).
// The library fonts since Batch 51.
const notices = licenses({ app: "Shorts Editor", libraryDir: "public/fonts/library" });

export default defineConfig({
  plugins: [react(), notices.emit],
  build: {
    target: "es2022",
    // Batch 50: the warning is a budget. The main chunk is ~1.3 MB (Batch 45 measured startup about 10x
    // inside P12 with it), and the heavy modules of §4 P12 are separate chunks already; this warns when
    // a chunk grows past it.
    chunkSizeWarningLimit: 1600,
  },
  // Workers are module workers in dev and build alike.
  worker: { format: "es", plugins: () => [notices.collect] },
  // Only transcribe.worker imports it: pre-bundled up front, so its first use does not reload the page.
  optimizeDeps: { include: ["@huggingface/transformers"] },
});
