import { describe, expect, it } from "vitest";
import {
  createCompanionCommandDedupe,
} from "../../src/voice-dock/companion-command-dedupe";

describe("companion command cross-route dedupe", () => {
  it("converges event-first plus ack-timeout storage replay to one handler claim", () => {
    const dedupe = createCompanionCommandDedupe({ now: () => 1_000 });

    expect(dedupe.claim("ack-lost-command")).toBe(true);
    // The storage fallback carries the same envelope after the event ack was
    // lost. Main may acknowledge it again, but must not execute it again.
    expect(dedupe.claim("ack-lost-command")).toBe(false);
    expect(dedupe.size()).toBe(1);
  });

  it("allows a failed handler to be retried by the fallback route", () => {
    const dedupe = createCompanionCommandDedupe({ now: () => 1_000 });

    expect(dedupe.claim("retryable-command")).toBe(true);
    dedupe.release("retryable-command");
    expect(dedupe.claim("retryable-command")).toBe(true);
  });

  it("expires IDs by TTL and bounds the cache", () => {
    let currentTime = 1_000;
    const dedupe = createCompanionCommandDedupe({
      maxEntries: 2,
      ttlMs: 100,
      now: () => currentTime,
    });

    expect(dedupe.claim("one")).toBe(true);
    currentTime += 1;
    expect(dedupe.claim("two")).toBe(true);
    expect(dedupe.claim("three")).toBe(true);
    expect(dedupe.size()).toBe(2);
    expect(dedupe.claim("one")).toBe(true);

    currentTime += 100;
    expect(dedupe.claim("two")).toBe(true);
    expect(dedupe.size()).toBeLessThanOrEqual(2);
  });
});
