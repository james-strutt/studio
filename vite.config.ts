import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // mupdf (and other WASM libs) ship top-level await; es2022 output supports it.
  build: { target: "es2022" },
  esbuild: { target: "es2022" },
  // Excluding mupdf keeps its relative .wasm URL valid in dev — pre-bundling it
  // into .vite/deps made the wasm fetch fall back to index.html (magic-word error).
  optimizeDeps: { esbuildOptions: { target: "es2022" }, exclude: ["mupdf"] },
});
