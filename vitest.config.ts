import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/pipeline/**/*.test.ts"],
    passWithNoTests: false,
  },
});
