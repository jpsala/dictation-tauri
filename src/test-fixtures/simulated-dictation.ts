import type { SimulatedFixture } from "../pipeline/types";

export const simulatedDictationFixtures = [
  {
    id: "clean-note",
    label: "Clean note",
    sourceText:
      "Synthetic user says create a short project note about testing the dictation pipeline.",
    expectedTranscript:
      "Create a short project note about testing the dictation pipeline.",
    expectedOutput:
      "Project note: testing the dictation pipeline with a deterministic simulated run.",
    deliveryMode: "delivered",
  },
  {
    id: "transcription-timeout",
    label: "Transcription timeout",
    sourceText:
      "Synthetic user speaks while the mock transcription service times out.",
    failureMode: {
      phase: "transcribing",
      message: "Mock transcription timed out before producing text.",
    },
    deliveryMode: "skipped",
  },
  {
    id: "uncertain-delivery",
    label: "Uncertain delivery",
    sourceText:
      "Synthetic user dictates text that should remain available when paste confidence is unclear.",
    expectedTranscript:
      "Keep this text available when paste confidence is unclear.",
    expectedOutput:
      "Keep this text available when paste confidence is unclear.",
    deliveryMode: "uncertain",
  },
  {
    id: "copied-fallback",
    label: "Copied fallback",
    sourceText:
      "Synthetic user dictates a reminder that should fall back to a copyable result.",
    expectedTranscript: "Remind me to review the pipeline fixtures.",
    expectedOutput: "Reminder: review the pipeline fixtures.",
    deliveryMode: "copiedFallback",
  },
  {
    id: "delivery-failure",
    label: "Delivery failure",
    sourceText:
      "Synthetic user dictates text but the simulated delivery phase fails.",
    expectedTranscript: "Capture this even if simulated delivery fails.",
    expectedOutput: "Capture this even if simulated delivery fails.",
    failureMode: {
      phase: "delivering",
      message: "Mock delivery failed without a fallback channel.",
    },
    deliveryMode: "failed",
  },
] as const satisfies readonly SimulatedFixture[];

export type SimulatedDictationFixtureId =
  (typeof simulatedDictationFixtures)[number]["id"];
