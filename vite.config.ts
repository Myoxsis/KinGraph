import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const appRoot = resolve(__dirname, "apps/paste-preview");

export default defineConfig({
  root: appRoot,
  base: "./",
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 5173),
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
  build: {
    outDir: resolve(__dirname, "dist/paste-preview"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        records: resolve(appRoot, "index.html"),
        individuals: resolve(appRoot, "individuals.html"),
        tree: resolve(appRoot, "tree.html"),
        settings: resolve(appRoot, "settings.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
