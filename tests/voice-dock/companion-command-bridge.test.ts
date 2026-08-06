import { describe, expect, it, vi } from "vitest";
import {
  createCompanionCommandBridge,
} from "../../src/voice-dock/companion-command-bridge";
import { createCompanionCommandDedupe } from "../../src/voice-dock/companion-command-dedupe";
import type { DockCompanionCommandPayload } from "../../src/voice-dock/companion-state";

const teachCommand: DockCompanionCommandPayload = {
  source: "dock_companion",
  command: "teach_correction",
};

describe("companion command bridge acknowledgement", () => {
  it("reproduces an accepted emit with no listener and falls back after the ack deadline", async () => {
    vi.useFakeTimers();
    try {
      const emitToMain = vi.fn(async () => undefined);
      const emitGlobal = vi.fn(async () => undefined);
      const writeStorageFallback = vi.fn();
      const bridge = createCompanionCommandBridge({
        emitToMain,
        emitGlobal,
        writeStorageFallback,
        timeoutMs: 100,
        createCommandId: () => "gap-command",
      });

      await bridge.send(teachCommand);
      expect(emitToMain).toHaveBeenCalledWith({
        ...teachCommand,
        commandId: "gap-command",
      });
      expect(writeStorageFallback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(99);
      expect(writeStorageFallback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(writeStorageFallback).toHaveBeenCalledWith({
        ...teachCommand,
        commandId: "gap-command",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels fallback when the main handler acknowledges the command", async () => {
    vi.useFakeTimers();
    try {
      const writeStorageFallback = vi.fn();
      const bridge = createCompanionCommandBridge({
        emitToMain: vi.fn(async () => undefined),
        emitGlobal: vi.fn(async () => undefined),
        writeStorageFallback,
        timeoutMs: 100,
        createCommandId: () => "acked-command",
      });

      await bridge.send(teachCommand);
      expect(bridge.acknowledge({
        commandId: "acked-command",
        command: "teach_correction",
        handled: true,
      })).toBe(true);
      vi.advanceTimersByTime(100);
      expect(writeStorageFallback).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not execute twice when an accepted event loses its ack and storage replays it", async () => {
    vi.useFakeTimers();
    try {
      const dedupe = createCompanionCommandDedupe({ now: () => 1_000 });
      const writeStorageFallback = vi.fn();
      const bridge = createCompanionCommandBridge({
        emitToMain: vi.fn(async () => undefined),
        emitGlobal: vi.fn(async () => undefined),
        writeStorageFallback,
        timeoutMs: 100,
        createCommandId: () => "convergent-command",
      });
      let handlerCalls = 0;

      await bridge.send(teachCommand);
      const envelope = {
        ...teachCommand,
        commandId: "convergent-command",
      };
      if (dedupe.claim(envelope.commandId)) {
        handlerCalls += 1;
      }

      vi.advanceTimersByTime(100);
      expect(writeStorageFallback).toHaveBeenCalledWith(envelope);
      if (dedupe.claim(envelope.commandId)) {
        handlerCalls += 1;
      }

      expect(handlerCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
