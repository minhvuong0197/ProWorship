import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Tauri expects a fixed port and to ignore src-tauri changes
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        splash: resolve(__dirname, "splash.html"),
        output: resolve(__dirname, "output.html"),
        stage: resolve(__dirname, "stage.html"),
        templateEditor: resolve(__dirname, "template-editor.html"),
      },
    },
  },
});
