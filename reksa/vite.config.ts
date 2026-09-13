import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "src/operator"),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/artifacts": "http://127.0.0.1:8787",
    },
  },
  build: {
    outDir: path.join(root, "dist/operator"),
    emptyOutDir: true,
  },
});
