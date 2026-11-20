import { fileURLToPath, URL } from "node:url";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { localVaultBridgePlugin } from "./localVaultPlugin";

export default defineConfig({
  cacheDir: path.join(process.env.LOCALAPPDATA || os.tmpdir(), "vibe-playground-vite-cache"),
  plugins: [
    localVaultBridgePlugin(),
    react({ exclude: [/node_modules/, /vibe-playground-vite-cache/] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5181,
    strictPort: false,
    watch: {
      ignored: ["**/data/**"],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8090",
        changeOrigin: true,
      },
    },
  },
});
