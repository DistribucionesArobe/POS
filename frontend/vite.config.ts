import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Aceromax POS",
        short_name: "Aceromax",
        theme_color: "#1f2937",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
    }),
  ],
  server: { port: 5173 },
});
