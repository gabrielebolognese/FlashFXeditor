import { defineConfig } from "vite";

// The project CLI (spec §21.3): scripts/cli/project-cli.ts bundled for Node into dist-cli/project-cli.mjs.
// A Vite SSR build (no new dependency); every module it imports is DOM-free.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: "scripts/cli/project-cli.ts",
    outDir: "dist-cli",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "project-cli.mjs", format: "es" } },
  },
  ssr: { noExternal: true },
});
