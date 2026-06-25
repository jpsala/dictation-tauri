import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/pipeline/**/*.test.ts",
      "tests/synthetic-audio-stt/**/*.test.ts",
      "tests/capture/**/*.test.ts",
      "tests/runtime-transcription/**/*.test.ts",
      "tests/host-runtime/**/*.test.ts",
      "tests/fixvox-text-runtime/**/*.test.ts",
      "tests/desktop-control/**/*.test.ts",
      "tests/voice-dock/**/*.test.ts",
      "tests/voice-dock/**/*.test.tsx",
      "tests/selection-transform/**/*.test.ts",
    ],
    passWithNoTests: false,
  },
});
