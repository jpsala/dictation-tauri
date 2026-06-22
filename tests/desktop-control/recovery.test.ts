import { describe, expect, it, vi } from "vitest";
import {
  DesktopDictationController,
  type DesktopCaptureGateway,
  type DesktopRuntimeGateway,
} from "../../src/desktop-control/controller";
import {
  createUnavailableDesktopControlReadiness,
  mapDesktopFailureToRecovery,
} from "../../src/desktop-control";
import type { DesktopDeliveryGateway } from "../../src/delivery";
import { createControlEvent } from "./desktop-control-fixtures";

describe("desktop recovery failure matrix", () => {
  it.each([
    {
      kind: "capture_setup" as const,
      cause: new Error("Microphone denied; GROQ_API_KEY=gsk_secret_capture"),
      clipAvailable: false,
      transcriptAvailable: false,
      expectedCode: "capture-start-failed",
      expectedAction: "record_again",
      expectedLabel: "Check microphone setup",
      expectedReason: "Check microphone permission or device setup, then record again.",
    },
    {
      kind: "runtime_transcription" as const,
      cause: new Error("Provider timed out with Authorization: Bearer sk-runtime-secret"),
      clipAvailable: true,
      transcriptAvailable: false,
      expectedCode: "runtime-failed",
      expectedAction: "retry_from_clip",
      expectedLabel: "Retry from captured clip",
      expectedReason: "The captured clip is still available; retry after the runtime issue is resolved.",
    },
    {
      kind: "managed_preflight" as const,
      cause: new Error("Managed preflight denied quota for token=ghp_secret_preflight"),
      clipAvailable: true,
      transcriptAvailable: false,
      expectedCode: "managed-preflight-failed",
      expectedAction: "inspect_setup",
      expectedLabel: "Inspect managed cloud setup",
      expectedReason: "Fix managed cloud, quota, or backend readiness before retrying; direct BYOK fallback is never automatic.",
    },
    {
      kind: "desktop_control" as const,
      cause: new Error("Hotkey registration failed: shortcut conflict; secret: xoxb-secret-control"),
      clipAvailable: false,
      transcriptAvailable: false,
      expectedCode: "desktop-control-unavailable",
      expectedAction: "inspect_setup",
      expectedLabel: "Inspect desktop control setup",
      expectedReason: "Use in-window controls and resolve hotkey or desktop-control setup before trying the shortcut again.",
    },
    {
      kind: "delivery" as const,
      cause: new Error("Clipboard denied token: github_pat_secret_delivery"),
      clipAvailable: true,
      transcriptAvailable: true,
      expectedCode: "delivery-failed",
      expectedAction: "copy_manually",
      expectedLabel: "Copy transcript manually",
      expectedReason: "Transcript text is still available in review even though automatic delivery failed.",
    },
  ])(
    "maps $kind failures to redacted actionable recovery",
    ({
      kind,
      cause,
      clipAvailable,
      transcriptAvailable,
      expectedCode,
      expectedAction,
      expectedLabel,
      expectedReason,
    }) => {
      const recovery = mapDesktopFailureToRecovery({
        kind,
        cause,
        clipAvailable,
        transcriptAvailable,
      });

      expect(recovery.error.code).toBe(expectedCode);
      expect(recovery.recoveryAction).toMatchObject({
        kind: expectedAction,
        label: expectedLabel,
        reason: expectedReason,
        clipAvailable,
      });
      expect(recovery.error.message).toContain("[REDACTED]");
      expect(recovery.error.message).not.toMatch(/gsk_secret|sk-runtime-secret|ghp_secret|xoxb-secret|github_pat_secret/);
    },
  );

  it("keeps desktop control readiness unavailable and redacted without registering hotkeys", () => {
    const readiness = createUnavailableDesktopControlReadiness(
      "Shortcut conflict with Authorization: Bearer sk-desktop-control-secret",
    );
    const recovery = mapDesktopFailureToRecovery({
      kind: "desktop_control",
      cause: readiness.reason,
      clipAvailable: false,
    });

    expect(readiness).toMatchObject({
      controlAvailable: false,
      hotkeyRegistered: false,
      deliveryAvailable: false,
      backgroundModeAvailable: false,
    });
    expect(readiness.reason).toBe("Shortcut conflict with Authorization: Bearer [REDACTED]");
    expect(recovery.recoveryAction.kind).toBe("inspect_setup");
  });
});

describe("DesktopDictationController recovery integration", () => {
  it("records capture setup failure as redacted record-again guidance", async () => {
    const controller = createController({
      capture: {
        start: vi.fn(async () => {
          throw new Error("Microphone unavailable; API_KEY=gsk_secret_capture");
        }),
        stop: vi.fn(async () => ({ captureId: "should-not-exist" })),
      },
    });

    const failed = await controller.handleControl(createControlEvent({ action: "start" }));

    expect(failed).toMatchObject({
      state: "error",
      error: {
        code: "capture-start-failed",
        message: "Microphone unavailable; API_KEY=[REDACTED]",
      },
      recoveryAction: {
        kind: "record_again",
        label: "Check microphone setup",
        reason: "Check microphone permission or device setup, then record again.",
        clipAvailable: false,
      },
    });
  });

  it("treats managed preflight failure as fail-closed setup guidance with no direct fallback", async () => {
    const captureArtifact = { captureId: "clip-managed-preflight" };
    const controller = createController({
      capture: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => captureArtifact),
      },
      runtime: {
        transcribe: vi.fn(async () => {
          throw new Error("Managed preflight failed: quota denied for token ghp_secret_preflight");
        }),
      },
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    const failed = await controller.handleControl(
      createControlEvent({ action: "stop", id: "stop-managed-preflight" }),
    );

    expect(failed).toMatchObject({
      state: "error",
      capture: captureArtifact,
      error: {
        code: "managed-preflight-failed",
        message: "Managed preflight failed: quota denied for token [REDACTED]",
      },
      recoveryAction: {
        kind: "inspect_setup",
        label: "Inspect managed cloud setup",
        reason: "Fix managed cloud, quota, or backend readiness before retrying; direct BYOK fallback is never automatic.",
        clipAvailable: true,
      },
    });
    expect(JSON.stringify(failed)).not.toMatch(/direct fallback|ghp_secret_preflight/);
  });

  it("downgrades an injected unverified paste observation to failed review evidence", async () => {
    const delivery: DesktopDeliveryGateway = {
      deliver: vi.fn(async () => ({
        status: "paste_observed",
        output: "overclaimed transcript",
        strategy: "paste_send",
        message: "Fake adapter overclaimed insertion.",
      })),
    };
    const controller = createController({
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "overclaimed transcript",
          output: "overclaimed transcript",
        })),
      },
      delivery,
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    const reviewed = await controller.handleControl(
      createControlEvent({ action: "stop", id: "stop-overclaimed-delivery" }),
    );

    expect(reviewed).toMatchObject({
      state: "reviewing",
      delivery: {
        status: "failed",
        output: "overclaimed transcript",
        strategy: "review_only",
        reason: "paste_observed is forbidden without a verified desktop observer.",
      },
      recoveryAction: {
        kind: "copy_manually",
      },
    });
    expect(JSON.stringify(reviewed)).not.toContain('"status":"paste_observed"');
  });

  it("keeps transcript review available when delivery throws after text is produced", async () => {
    const delivery: DesktopDeliveryGateway = {
      deliver: vi.fn(async () => {
        throw new Error("Clipboard denied with token github_pat_secret_delivery");
      }),
    };
    const controller = createController({
      runtime: {
        transcribe: vi.fn(async () => ({
          transcript: "delivery recovery transcript",
          output: "delivery recovery transcript",
        })),
      },
      delivery,
    });

    await controller.handleControl(createControlEvent({ action: "start" }));
    const reviewed = await controller.handleControl(
      createControlEvent({ action: "stop", id: "stop-delivery-failure" }),
    );

    expect(reviewed).toMatchObject({
      state: "reviewing",
      delivery: {
        status: "failed",
        output: "delivery recovery transcript",
        strategy: "review_only",
        reason: "Clipboard denied with token [REDACTED]",
      },
      recoveryAction: {
        kind: "copy_manually",
        label: "Copy transcript manually",
        reason: "Transcript text is still available in review even though automatic delivery failed.",
        clipAvailable: true,
      },
    });
    expect(JSON.stringify(reviewed)).not.toMatch(/github_pat_secret_delivery|paste_observed/);
  });
});

function createController(input: {
  capture?: DesktopCaptureGateway;
  runtime?: DesktopRuntimeGateway;
  delivery?: DesktopDeliveryGateway;
} = {}) {
  return new DesktopDictationController({
    capture: input.capture ?? {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => ({ captureId: "clip-default" })),
      cancel: vi.fn(async () => undefined),
    },
    runtime: input.runtime ?? {
      transcribe: vi.fn(async () => ({ transcript: "default transcript" })),
    },
    delivery: input.delivery,
    createSessionId: () => "desktop-session-001",
    now: () => "2026-06-22T10:00:05.000Z",
  });
}
