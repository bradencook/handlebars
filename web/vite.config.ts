import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// M1 is fully client-side (GPX parsed in-browser, video stays local) — no
// backend needed. The Express server returns in M3 for the ffmpeg work; add a
// `/api` proxy here then.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
