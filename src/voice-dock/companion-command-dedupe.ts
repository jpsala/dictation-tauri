export const DEFAULT_COMPANION_COMMAND_DEDUPE_MAX_ENTRIES = 128;
export const DEFAULT_COMPANION_COMMAND_DEDUPE_TTL_MS = 5 * 60 * 1000;

export type CompanionCommandDedupeOptions = {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
};

export type CompanionCommandDedupe = {
  /** Claim an ID before invoking the handler; false means it was already claimed. */
  claim: (commandId: string) => boolean;
  /** Release a claim when the handler throws so a later fallback may retry. */
  release: (commandId: string) => void;
  /** Exposed for deterministic tests and bounded-cache diagnostics. */
  size: () => number;
};

type SeenCommand = {
  seenAt: number;
};

export function createCompanionCommandDedupe(
  options: CompanionCommandDedupeOptions = {},
): CompanionCommandDedupe {
  const maxEntries = Math.max(
    1,
    Math.floor(options.maxEntries ?? DEFAULT_COMPANION_COMMAND_DEDUPE_MAX_ENTRIES),
  );
  const ttlMs = Math.max(1, options.ttlMs ?? DEFAULT_COMPANION_COMMAND_DEDUPE_TTL_MS);
  const now = options.now ?? (() => Date.now());
  const seen = new Map<string, SeenCommand>();

  const prune = (currentTime: number): void => {
    for (const [commandId, entry] of seen) {
      if (currentTime - entry.seenAt >= ttlMs) {
        seen.delete(commandId);
      }
    }

    while (seen.size > maxEntries) {
      const oldest = seen.keys().next().value;
      if (typeof oldest !== "string") {
        break;
      }
      seen.delete(oldest);
    }
  };

  return {
    claim(commandId) {
      if (!commandId) {
        return true;
      }

      const currentTime = now();
      prune(currentTime);
      if (seen.has(commandId)) {
        return false;
      }

      seen.set(commandId, { seenAt: currentTime });
      prune(currentTime);
      return true;
    },

    release(commandId) {
      if (commandId) {
        seen.delete(commandId);
      }
    },

    size() {
      prune(now());
      return seen.size;
    },
  };
}
