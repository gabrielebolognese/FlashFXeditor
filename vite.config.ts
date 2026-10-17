import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { target: "es2022" },
  // Workers are module workers in dev and build alike.
  worker: { format: "es" },
  // Only transcribe.worker imports it: pre-bundled up front, so its first use does not reload the page.
  optimizeDeps: { include: ["@huggingface/transformers"] },
});
