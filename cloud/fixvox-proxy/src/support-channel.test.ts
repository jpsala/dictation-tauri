// @ts-nocheck
import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  buildSupportAssistantMessages,
  buildSupportChannelAdapter,
  buildSupportFallbackReply,
  buildSupportHandledKey,
  shouldHandleSupportMessage,
} from "./support-channel";

mock.module("cloudflare:workers", () => ({
  DurableObject: class DurableObject {},
}));

const { default: worker } = await import("./index");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

class MemoryKv {
  values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

function createEnv(store = new MemoryKv(), overrides: Record<string, unknown> = {}) {
  return {
    GROQ_API_KEY: "test-groq-key",
    GOOGLE_CLOUD_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLOUD_CLIENT_SECRET: "test-google-client-secret",
    ADMIN_API_KEY: "test-admin-key",
    DISCORD_APPLICATION_ID: "bot-app",
    DISCORD_BOT_TOKEN: "test-discord-token",
    DISCORD_SUPPORT_CHANNEL_IDS: "help-channel",
    USAGE: store,
    USAGE_COUNTERS: {},
    ...overrides,
  };
}

function adminScanRequest() {
  return new Request("https://example.com/admin/discord/scan-support", {
    method: "POST",
    headers: { Authorization: "Bearer test-admin-key" },
  });
}

function telegramWebhookRequest(body: unknown) {
  return new Request("https://example.com/telegram/webhook", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("support-channel", () => {
  test("builds platform-specific assistant messages", () => {
    const messages = buildSupportAssistantMessages({
      platformLabel: "Discord",
      channelName: "help",
      userName: "jp",
      content: "How do I report a bug?",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0]?.content).toContain("helpful Discord assistant");
    expect(messages[0]?.content).toContain("under 120 words");
    expect(messages[1]).toMatchObject({ role: "user" });
    expect(messages[1]?.content).toContain("Channel: help");
    expect(messages[1]?.content).toContain("Username: jp");
    expect(messages[1]?.content).toContain("How do I report a bug?");
  });

  test("formats bugs and general support fallbacks", () => {
    expect(buildSupportFallbackReply("bugs")).toContain("what happened instead");
    expect(buildSupportFallbackReply("help")).toContain("whether this is a bug or a usage question");
  });

  test("names handled keys by support channel kind", () => {
    expect(buildSupportHandledKey("discord", "123")).toBe("discord:support-handled:123");
    expect(buildSupportHandledKey("telegram", "abc")).toBe("telegram:support-handled:abc");
    expect(buildSupportHandledKey("zulip", "m-1")).toBe("zulip:support-handled:m-1");
  });

  test("applies shared support message handling rules", () => {
    const base = {
      messageId: "m1",
      channelName: "help",
      userName: "jp",
      content: "hello",
      authorId: "u1",
    };

    expect(shouldHandleSupportMessage(base, "bot")).toBe(true);
    expect(shouldHandleSupportMessage({ ...base, authorId: "bot" }, "bot")).toBe(false);
    expect(shouldHandleSupportMessage({ ...base, authorIsBot: true }, "bot")).toBe(false);
    expect(shouldHandleSupportMessage({ ...base, authorId: "" }, "bot")).toBe(false);
    expect(shouldHandleSupportMessage({ ...base, content: "" }, "bot")).toBe(false);
    expect(shouldHandleSupportMessage({ ...base, content: "", mentionUserIds: [" bot "] }, "bot")).toBe(true);
    expect(shouldHandleSupportMessage({ ...base, content: "", roleMentioned: true }, "bot")).toBe(true);
    expect(shouldHandleSupportMessage({ ...base, content: "", textMentionsTarget: true }, "bot")).toBe(true);
  });

  test("builds a minimal adapter boundary", () => {
    const adapter = buildSupportChannelAdapter<{ text: string }>({
      kind: "discord",
      platformLabel: "Discord",
      toSupportMessage: (raw) => ({
        messageId: "m1",
        channelName: "bugs",
        userName: "jp",
        content: raw.text,
        authorId: "u1",
      }),
    });
    const message = adapter.toSupportMessage({ text: "bug report" });

    expect(adapter.handledKey(message.messageId)).toBe("discord:support-handled:m1");
    expect(adapter.shouldHandle(message, "bot")).toBe(true);
    expect(adapter.assistantMessages(message)[0]?.content).toContain("helpful Discord assistant");
    expect(adapter.fallbackReply(message).content).toContain("what happened instead");
  });

  test("Telegram webhook skeleton stays disabled without config or token", async () => {
    globalThis.fetch = async () => {
      throw new Error("Telegram disabled skeleton must not call network");
    };

    for (const env of [
      createEnv(),
      createEnv(undefined, { TELEGRAM_SUPPORT_ENABLED: "true", TELEGRAM_BOT_TOKEN: "" }),
    ]) {
      const response = await worker.fetch(
        telegramWebhookRequest("not-json"),
        env as never,
        {} as ExecutionContext,
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        platform: "telegram",
        enabled: false,
        handled: false,
        reason: "disabled",
      });
    }
  });

  test("Telegram webhook skeleton parses command updates without sending replies", async () => {
    globalThis.fetch = async () => {
      throw new Error("Telegram stub must not call network");
    };

    const response = await worker.fetch(
      telegramWebhookRequest({
        update_id: 11,
        message: {
          message_id: 7,
          text: "/fixvox help",
          chat: { id: 42, username: "alpha" },
          from: { id: 9, username: "jp" },
        },
      }),
      createEnv(undefined, { TELEGRAM_SUPPORT_ENABLED: "true", TELEGRAM_BOT_TOKEN: "test-telegram-token" }) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      platform: "telegram",
      enabled: true,
      handled: false,
      reason: "command_stub",
      messageId: "42:7",
      command: "/fixvox",
    });
  });

  test("Discord support scan posts an AI reply through the adapter without real network", async () => {
    const store = new MemoryKv();
    const calls: Array<{ url: string; init?: RequestInit; body: unknown }> = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ url, init, body });

      if (url === "https://discord.com/api/v10/channels/help-channel/messages?limit=20") {
        return Response.json([
          { id: "bot-message", channel_id: "help-channel", content: "ignored", author: { id: "bot-app", username: "Fixvox", bot: true } },
          { id: "m1", channel_id: "help-channel", content: "How do I start?", author: { id: "u1", username: "alice" } },
        ]);
      }
      if (url === "https://api.groq.com/openai/v1/chat/completions") {
        expect(body.messages[0].content).toContain("helpful Discord assistant");
        expect(body.messages[1].content).toContain("Channel: help");
        expect(body.messages[1].content).toContain("Username: alice");
        expect(body.messages[1].content).toContain("How do I start?");
        return Response.json({ choices: [{ message: { content: "Use /fixvox help first." } }] });
      }
      if (url === "https://discord.com/api/v10/channels/help-channel/messages") {
        expect(body).toMatchObject({
          content: "Use /fixvox help first.",
          message_reference: { message_id: "m1", channel_id: "help-channel", fail_if_not_exists: false },
          allowed_mentions: { replied_user: false },
        });
        return Response.json({ id: "reply-1" });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const response = await worker.fetch(adminScanRequest(), createEnv(store) as never, {} as ExecutionContext);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, scannedChannels: ["help-channel"], repliedMessageIds: ["m1"] });
    expect(await store.get("discord:support-handled:m1")).toBe("1");
    expect(calls.map((call) => call.url)).toEqual([
      "https://discord.com/api/v10/channels/help-channel/messages?limit=20",
      "https://api.groq.com/openai/v1/chat/completions",
      "https://discord.com/api/v10/channels/help-channel/messages",
    ]);
  });

  test("Discord support scan falls back without Groq when handled content is empty", async () => {
    const store = new MemoryKv();
    const urls: string[] = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;

      if (url === "https://discord.com/api/v10/channels/1485636540402110515/messages?limit=20") {
        return Response.json([
          { id: "m-bug", channel_id: "1485636540402110515", content: "", mentions: [{ id: "bot-app" }], author: { id: "u2", username: "bob" } },
        ]);
      }
      if (url === "https://discord.com/api/v10/channels/1485636540402110515/messages") {
        expect(body.content).toContain("what happened instead");
        expect(body.message_reference.message_id).toBe("m-bug");
        return Response.json({ id: "reply-bug" });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const response = await worker.fetch(
      adminScanRequest(),
      createEnv(store, { DISCORD_SUPPORT_CHANNEL_IDS: "1485636540402110515" }) as never,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, scannedChannels: ["1485636540402110515"], repliedMessageIds: ["m-bug"] });
    expect(await store.get("discord:support-handled:m-bug")).toBe("1");
    expect(urls).not.toContain("https://api.groq.com/openai/v1/chat/completions");
  });
});
