import type {
  DockCompanionCommandAck,
  DockCompanionCommandEnvelope,
  DockCompanionCommandPayload,
} from "./companion-state";

export const COMPANION_COMMAND_ACK_TIMEOUT_MS = 600;

type TimerHandle = ReturnType<typeof setTimeout>;

export type CompanionCommandBridgeRoute =
  | "tauri_event"
  | "global_event"
  | "storage_fallback";

export type CompanionCommandBridge = {
  send: (payload: DockCompanionCommandPayload) => Promise<CompanionCommandBridgeRoute>;
  acknowledge: (ack: DockCompanionCommandAck) => boolean;
  dispose: () => void;
};

export type CompanionCommandBridgeOptions = {
  emitToMain: (payload: DockCompanionCommandEnvelope) => Promise<void>;
  emitGlobal: (payload: DockCompanionCommandEnvelope) => Promise<void>;
  writeStorageFallback: (payload: DockCompanionCommandEnvelope) => void;
  timeoutMs?: number;
  createCommandId?: () => string;
  setTimer?: (callback: () => void, timeoutMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

function defaultCommandId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createCompanionCommandBridge(
  options: CompanionCommandBridgeOptions,
): CompanionCommandBridge {
  const timeoutMs = options.timeoutMs ?? COMPANION_COMMAND_ACK_TIMEOUT_MS;
  const setTimer = options.setTimer ?? ((callback, timeout) => setTimeout(callback, timeout));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  const createCommandId = options.createCommandId ?? defaultCommandId;
  const pending = new Map<string, TimerHandle>();

  const clearPending = (commandId: string): boolean => {
    const timer = pending.get(commandId);
    if (!timer) {
      return false;
    }
    pending.delete(commandId);
    clearTimer(timer);
    return true;
  };

  const fallback = (payload: DockCompanionCommandEnvelope): void => {
    if (!clearPending(payload.commandId)) {
      return;
    }
    try {
      options.writeStorageFallback(payload);
    } catch {
      // The caller owns privacy-safe fallback handling; an unavailable storage
      // channel cannot make the already-failed event route throw again.
    }
  };

  return {
    async send(payload) {
      const envelope: DockCompanionCommandEnvelope = {
        ...payload,
        commandId: createCommandId(),
      };
      const timer = setTimer(() => fallback(envelope), timeoutMs);
      pending.set(envelope.commandId, timer);

      try {
        await options.emitToMain(envelope);
        return "tauri_event";
      } catch {
        try {
          await options.emitGlobal(envelope);
          return "global_event";
        } catch {
          fallback(envelope);
          return "storage_fallback";
        }
      }
    },

    acknowledge(ack) {
      return ack.handled === true && clearPending(ack.commandId);
    },

    dispose() {
      for (const timer of pending.values()) {
        clearTimer(timer);
      }
      pending.clear();
    },
  };
}
