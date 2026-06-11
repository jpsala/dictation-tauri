import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/pipeline/**/*.test.ts",
      "tests/synthetic-audio-stt/**/*.test.ts",
      "tests/capture/**/*.test.ts",
    ],
    passWithNoTests: false,
  },
});
