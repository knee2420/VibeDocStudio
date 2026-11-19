import { fileURLToPath, URL } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  cacheDir: path.join(process.env.LOCALAPPDATA || os.tmpdir(), "vibe-studio-vite-cache"),
  plugins: [react({ exclude: [/node_modules/, /vibe-studio-vite-cache/] }), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  preview: {
    headers: { "Document-Policy": "js-profiling" },
  },
  server: {
    port: 5180,
    strictPort: false,
    // 개발 서버에서 JS Self-Profiling API 허용 (`window.__studioPerf.profile` · scripts/studio_perf.py --profile)
    headers: { "Document-Policy": "js-profiling" },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8090",
        changeOrigin: true,
      },
    },
  },
});
