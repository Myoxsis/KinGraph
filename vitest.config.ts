import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "dist", "apps/paste-preview/dist", "apps/paste-preview/**/*.test.ts"],
  },
});
