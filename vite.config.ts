import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = (process.env.VITE_BASE_PATH || "/").replace(/\/?$/, "/");

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      base,
      scope: base,
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: [
        "favicon.svg",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "pwa-maskable-512x512.png",
      ],
      manifest: {
        id: base,
        name: "N.E.X.U.S.",
        short_name: "NEXUS",
        description: "Seu espaço pessoal para conversar, aprender e criar.",
        lang: "pt-BR",
        theme_color: "#80d5f2",
        background_color: "#080b10",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\/api\//],
        globPatterns: ["**/*.{css,html,ico,js,png,svg,webmanifest}"],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
});
