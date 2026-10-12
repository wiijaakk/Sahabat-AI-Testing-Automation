import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const api = `http://127.0.0.1:${process.env.OPERATOR_PORT ?? 8787}`;

export default defineConfig({
  root: path.join(root, "src/operator"),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": api,
      "/artifacts": api,
    },
  },
  build: {
    outDir: path.join(root, "dist/operator"),
    emptyOutDir: true,
  },
});
