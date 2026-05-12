import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// NOTA: Removimos vite-plugin-pwa porque generaba un Service Worker agresivo
// que cacheaba el bundle y bloqueaba los updates. Para POS interno no
// necesitamos PWA / offline.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
