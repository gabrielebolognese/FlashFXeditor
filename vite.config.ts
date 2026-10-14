import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { target: "es2022" },
  // Workers are module workers in dev and build alike.
  worker: { format: "es" },
});
