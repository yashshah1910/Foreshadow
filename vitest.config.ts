import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  test: {
    include: ["packages/**/tests/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@foreshadow/core": path.resolve(root, "packages/core/src/index.ts"),
      "@foreshadow/uw": path.resolve(root, "packages/uw/src/index.ts"),
      "@foreshadow/narrator": path.resolve(root, "packages/narrator/src/index.ts"),
      "@": root,
    },
  },
});
