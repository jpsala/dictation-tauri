import { DurableObject } from "cloudflare:workers";

import {
  getDashboardSummary,
  getUsageSummary,
  listRequestEvents,
  persistRequestEvent,
  type AdminRequestEvent,
  type KvNamespaceLike,
} from "./admin-store";
import {
  activateDevice,
  assignControlPlaneAdminDevicePolicy,
  buildFeedbackEvent,
  evaluateExecutionPreflight,
  listControlPlaneAdminDevices,
  listFeedbackEvents,
  parseExecutionMode,
  persistFeedbackEvent,
  registerDevice,
  type DeviceInviteDefinition,
  type DeviceActivatePayload,
  type DeviceRegisterPayload,
  type ExecutionPreflightPayload,
} from "./control-plane-store";
import { buildControlPlaneAdminPage } from "./control-plane-admin-page";
import { isProvider, listProviderModels } from "./provider-model-catalog";
import {
  buildDefaultRuntimePolicy,
  getRuntimePolicy,
  putRuntimePolicy,
  resetRuntimePolicy,
} from "./runtime-policy-store";
import {
  buildDefaultRecipePolicy,
  getRecipePolicy,
  putRecipePolicy,
  resetRecipePolicy,
} from "./recipe-policy-store";
import {
  getPricingAdminSnapshot,
  refreshPricingAdmin,
  updateManualPricingAdminWatchlist,
} from "./pricing-admin";
import { buildScheduledTaskDeps, runScheduledTasks } from "./scheduled-tasks";

interface Env {
  GROQ_API_KEY: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  XAI_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  GOOGLE_CLOUD_CLIENT_ID: string;
  GOOGLE_CLOUD_CLIENT_SECRET: string;
  AUTH_PUBLIC_BASE_URL?: string;
  DEVICE_ACCESS_INVITE_CODES?: string;
  ALPHA_INVITE_CODE_BASIC?: string;
  ALPHA_INVITE_CODE_FULL?: string;
  ADMIN_API_KEY?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_ALPHA_GUILD_ID?: string;
  DISCORD_SUPPORT_CHANNEL_IDS?: string;
  DISCORD_SUPPORT_SCAN_ENABLED?: string;
  USAGE: KvNamespaceLike;
  USAGE_COUNTERS: DurableObjectNamespace<UsageCounterDurableObject>;
}

function normalizeInviteCode(value: string | undefined): string | null {
  const candidate = value?.trim().toUpperCase();
  return candidate ? candidate : null;
}

function resolveDeviceInviteCodes(env: Env): Record<string, DeviceInviteDefinition> {
  const resolved: Record<string, DeviceInviteDefinition> = {};
  const basicCode = normalizeInviteCode(env.ALPHA_INVITE_CODE_BASIC);
  const fullCode = normalizeInviteCode(env.ALPHA_INVITE_CODE_FULL);

  if (basicCode) {
    resolved[basicCode] = { policyId: "alpha-basic", policyLabel: "Alpha Basic" };
  }
  if (fullCode) {
    resolved[fullCode] = { policyId: "alpha-full", policyLabel: "Alpha Full" };
  }

  const rawJson = env.DEVICE_ACCESS_INVITE_CODES?.trim();
  if (!rawJson) {
    return resolved;
  }

  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    for (const [rawCode, value] of Object.entries(parsed)) {
      const code = normalizeInviteCode(rawCode);
      if (!code) continue;
      if (typeof value === "string" && value.trim()) {
        resolved[code] = {
          policyId: value.trim(),
          policyLabel: value.trim() === "alpha-full" ? "Alpha Full" : value.trim() === "alpha-basic" ? "Alpha Basic" : value.trim(),
        };
        continue;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const record = value as Record<string, unknown>;
      const policyId = typeof record.policyId === "string" && record.policyId.trim() ? record.policyId.trim() : null;
      const policyLabel = typeof record.policyLabel === "string" && record.policyLabel.trim() ? record.policyLabel.trim() : null;
      if (!policyId) continue;
      resolved[code] = {
        policyId,
        policyLabel: policyLabel ?? (policyId === "alpha-full" ? "Alpha Full" : policyId === "alpha-basic" ? "Alpha Basic" : policyId),
      };
    }
  } catch {
    return resolved;
  }

  return resolved;
}

type UsageWindow = {
  key: string;
  used: number;
  remaining: number;
  limit: number;
  resetAt: string;
};

type UsageConsumePayload = {
  key: string;
  limit: number;
  amount: number;
  resetAt: string;
};

type UsageReservePayload = {
  key: string;
  limit: number;
  reserve: number;
  resetAt: string;
};

type UsageReserveResponse = {
  ok: true;
  key: string;
  granted: number;
  used: number;
  remaining: number;
  limit: number;
  resetAt: string;
};

type LocalUsageLease = {
  key: string;
  limit: number;
  resetAt: string;
  backendRemaining: number;
  localRemaining: number;
};

type ChatRequestMeta = {
  model: string | null;
  stream: boolean;
  context: string;
  inputChars: number;
};

type ProxyTelemetry = {
  backendRequestId: string;
  providerRequestId: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  pricingSource: string | null;
};

type ProxyTiming = {
  parseMs: number | null;
  usageMs: number | null;
  upstreamMs: number | null;
  initMs: number | null;
  totalMs: number | null;
};

type GroqUsagePayload = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type GoogleAuthState = {
  state: string;
  deviceId: string;
  codeVerifier: string;
  returnTo: string | null;
  createdAt: string;
};

type DesktopLoginState = {
  state: string;
  handoffId: string;
  flow: "device-code";
  client: string;
  createdAt: string;
  expiresAt: string;
};

type DesktopLoginDeviceLinkPayload = DeviceRegisterPayload & {
  state?: string | null;
};

type GoogleAuthResult =
  | {
      status: "success";
      state: string;
      deviceId: string;
      createdAt: string;
      completedAt: string;
      profile: Record<string, unknown> | null;
      token: Record<string, unknown>;
    }
  | {
      status: "error";
      state: string;
      deviceId: string;
      createdAt: string;
      completedAt: string;
      error: string;
      errorDescription: string;
    };

type DiscordCommandOption = {
  name?: string;
  type?: number;
  value?: string | number | boolean;
  options?: DiscordCommandOption[];
};

type DiscordInteraction = {
  id?: string;
  type?: number;
  token?: string;
  guild_id?: string;
  channel_id?: string;
  data?: {
    name?: string;
    options?: DiscordCommandOption[];
  };
  member?: {
    user?: {
      id?: string;
      username?: string;
      global_name?: string | null;
    };
  };
  user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
  };
};

type DiscordMessage = {
  id?: string;
  channel_id?: string;
  content?: string;
  mention_roles?: string[];
  mentions?: Array<{ id?: string }>;
  author?: {
    id?: string;
    bot?: boolean;
    username?: string;
  };
};

type TelemetryBatchEventInput = {
  id?: string;
};

type TelemetryBatchRequest = {
  installId?: string | null;
  sentAt?: string | null;
  events?: TelemetryBatchEventInput[] | null;
};

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const ALPHA_USAGE_LIMITS_ENABLED = false;
const REPLACE_LIMIT_PER_DAY = 30;
const VOICE_LIMIT_SECONDS_PER_DAY = 600;
const DISABLED_USAGE_LIMIT = Number.MAX_SAFE_INTEGER;
const DAY_TTL_SECONDS = 60 * 60 * 24;
const AUTH_STATE_TTL_SECONDS = 60 * 10;
const AUTH_RESULT_TTL_SECONDS = 60 * 15;
const REPLACE_LEASE_RESERVE = 5;
const VOICE_LEASE_RESERVE_SECONDS = 120;
const GROQ_CHAT_PRICING_PER_MILLION_USD: Record<string, { prompt: number; completion: number }> = {
  "moonshotai/kimi-k2-instruct": { prompt: 1, completion: 3 },
  "llama-3.1-8b-instant": { prompt: 0.05, completion: 0.08 },
  "llama3-8b-8192": { prompt: 0.05, completion: 0.08 },
  "llama-3.3-70b-versatile": { prompt: 0.59, completion: 0.79 },
  "llama-3.3-70b-specdec": { prompt: 0.59, completion: 0.99 },
  "gpt-oss-120b": { prompt: 0.15, completion: 0.75 },
  "gpt-oss-20b": { prompt: 0.1, completion: 0.5 },
};
const GROQ_AUDIO_PRICING_PER_HOUR_USD: Record<string, number> = {
  "whisper-large-v3": 0.111,
  "whisper-large-v3-turbo": 0.04,
};
const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const DISCORD_INTERACTION_PING = 1;
const DISCORD_INTERACTION_APPLICATION_COMMAND = 2;
const DISCORD_RESPONSE_PONG = 1;
const DISCORD_RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE = 4;
const DISCORD_EPHEMERAL_FLAG = 1 << 6;
const DISCORD_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const DISCORD_SUPPORT_MODEL = "llama-3.1-8b-instant";
const usageLeaseCache = new Map<string, LocalUsageLease>();
let discordPublicKeyPromise: Promise<CryptoKey | null> | null = null;

const DISCORD_GLOBAL_COMMANDS = [
  {
    name: "fixvox",
    description: "Fixvox alpha commands",
    options: [
      {
        type: 1,
        name: "help",
        description: "Show Fixvox alpha help",
      },
      {
        type: 1,
        name: "status",
        description: "Show current alpha support status",
      },
      {
        type: 1,
        name: "feedback",
        description: "Send structured feedback to the Fixvox alpha team",
        options: [
          {
            type: 3,
            name: "type",
            description: "Feedback type",
            required: true,
            choices: [
              { name: "bug", value: "bug" },
              { name: "confusing", value: "confusing" },
              { name: "idea", value: "idea" },
              { name: "love-it", value: "love-it" },
            ],
          },
          {
            type: 3,
            name: "message",
            description: "Short feedback message",
            required: true,
          },
          {
            type: 3,
            name: "device_id",
            description: "Optional Fixvox device ID if you want us to correlate this feedback",
            required: false,
          },
        ],
      },
    ],
  },
];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "fixvox-proxy",
        date: buildDayKey(new Date()),
        });
    }

    if (request.method === "GET" && url.pathname === "/control-plane-admin") {
      return buildControlPlaneAdminPage(request);
    }

    if (url.pathname.startsWith("/admin/")) {
      if (request.method === "OPTIONS") {
        return buildAdminPreflightResponse(request);
      }

      const authError = authorizeAdminRequest(request, env);
      if (authError) {
        return withAdminCors(request, authError);
      }

      if (request.method === "GET" && url.pathname === "/admin/dashboard/summary") {
        return withAdminCors(request, json(await getDashboardSummary(env.USAGE)));
      }

      if (request.method === "GET" && url.pathname === "/admin/requests") {
        const items = await listRequestEvents(env.USAGE, {
          provider: url.searchParams.get("provider"),
          model: url.searchParams.get("model"),
          context: url.searchParams.get("context"),
          status: url.searchParams.get("status"),
          deviceId: url.searchParams.get("deviceId"),
          q: url.searchParams.get("q"),
          limit: Number(url.searchParams.get("limit") ?? "50"),
          cursor: url.searchParams.get("cursor"),
        });
        return withAdminCors(request, json(items));
      }

      if (request.method === "GET" && url.pathname === "/admin/usage/summary") {
        return withAdminCors(request, json(await getUsageSummary(env.USAGE, 30)));
      }

      if (request.method === "GET" && url.pathname === "/admin/feedback") {
        const items = await listFeedbackEvents(env.USAGE, {
          type: url.searchParams.get("type"),
          source: url.searchParams.get("source"),
          deviceId: url.searchParams.get("deviceId"),
          q: url.searchParams.get("q"),
          limit: Number(url.searchParams.get("limit") ?? "50"),
          cursor: url.searchParams.get("cursor"),
        });
        return withAdminCors(request, json(items));
      }

      if (request.method === "GET" && url.pathname === "/admin/control-plane/policy") {
        const runtimePolicy = await getRuntimePolicy(env.USAGE);
        return withAdminCors(request, json({
          ok: true,
          source: runtimePolicy.source,
          updatedAt: runtimePolicy.updatedAt,
          policy: runtimePolicy.policy,
          defaultPolicy: buildDefaultRuntimePolicy(),
        }));
      }

      if (request.method === "GET" && url.pathname === "/admin/control-plane/devices") {
        return withAdminCors(request, json(await listControlPlaneAdminDevices(env.USAGE, {
          limit: Number(url.searchParams.get("limit") ?? "50"),
          cursor: url.searchParams.get("cursor"),
        })));
      }

      if (request.method === "POST" && url.pathname === "/admin/control-plane/devices/policy") {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return withAdminCors(request, json({ error: { message: "Invalid device policy payload." } }, 400));
        }

        try {
          return withAdminCors(request, json(await assignControlPlaneAdminDevicePolicy(env.USAGE, payload as never)));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to update device policy.";
          const status = message === "device not found" ? 404 : 400;
          return withAdminCors(request, json({ error: { message } }, status));
        }
      }

      if (request.method === "POST" && url.pathname === "/admin/control-plane/policy") {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return withAdminCors(request, json({ error: { message: "Invalid runtime policy payload." } }, 400));
        }

        try {
          const stored = await putRuntimePolicy(env.USAGE, payload);
          return withAdminCors(request, json({
            ok: true,
            updatedAt: stored.updatedAt,
            policy: stored.policy,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to persist runtime policy.";
          return withAdminCors(request, json({ error: { message } }, 400));
        }
      }

      if (request.method === "POST" && url.pathname === "/admin/control-plane/policy/reset") {
        try {
          const stored = await resetRuntimePolicy(env.USAGE);
          return withAdminCors(request, json({
            ok: true,
            updatedAt: stored.updatedAt,
            policy: stored.policy,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to reset runtime policy.";
          return withAdminCors(request, json({ error: { message } }, 500));
        }
      }

      if (request.method === "GET" && url.pathname === "/admin/control-plane/recipe-policy") {
        const recipePolicy = await getRecipePolicy(env.USAGE);
        return withAdminCors(request, json({
          ok: true,
          source: recipePolicy.source,
          updatedAt: recipePolicy.updatedAt,
          policy: recipePolicy.policy,
          defaultPolicy: buildDefaultRecipePolicy(),
        }));
      }

      if (request.method === "POST" && url.pathname === "/admin/control-plane/recipe-policy") {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return withAdminCors(request, json({ error: { message: "Invalid recipe policy payload." } }, 400));
        }

        try {
          const stored = await putRecipePolicy(env.USAGE, payload);
          return withAdminCors(request, json({
            ok: true,
            updatedAt: stored.updatedAt,
            policy: stored.policy,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to persist recipe policy.";
          return withAdminCors(request, json({ error: { message } }, 400));
        }
      }

      if (request.method === "POST" && url.pathname === "/admin/control-plane/recipe-policy/reset") {
        try {
          const stored = await resetRecipePolicy(env.USAGE);
          return withAdminCors(request, json({
            ok: true,
            updatedAt: stored.updatedAt,
            policy: stored.policy,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to reset recipe policy.";
          return withAdminCors(request, json({ error: { message } }, 500));
        }
      }

      if (request.method === "GET" && url.pathname === "/admin/control-plane/models") {
        const provider = url.searchParams.get("provider");
        if (!isProvider(provider)) {
          return withAdminCors(request, json({ error: { message: "Invalid provider." } }, 400));
        }

        return withAdminCors(request, json(await listProviderModels(provider, {
          groq: env.GROQ_API_KEY,
          openai: env.OPENAI_API_KEY,
          anthropic: env.ANTHROPIC_API_KEY,
          openrouter: env.OPENROUTER_API_KEY,
          xai: env.XAI_API_KEY,
          cerebras: env.CEREBRAS_API_KEY,
        })));
      }

      if (request.method === "GET" && url.pathname === "/admin/pricing") {
        return withAdminCors(request, json(await getPricingAdminSnapshot(env.USAGE)));
      }

      if (request.method === "POST" && url.pathname === "/admin/pricing/watchlist") {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return withAdminCors(request, json({ error: { message: "Invalid pricing watchlist payload." } }, 400));
        }
        const targets = Array.isArray((payload as { targets?: unknown })?.targets)
          ? (payload as { targets: Array<{ provider?: unknown; model?: unknown }> }).targets.map((target) => ({
              provider: typeof target.provider === "string" ? target.provider : "",
              model: typeof target.model === "string" ? target.model : "",
            }))
          : [];
        return withAdminCors(request, json(await updateManualPricingAdminWatchlist(env.USAGE, targets)));
      }

      if (request.method === "POST" && url.pathname === "/admin/pricing/refresh") {
        return withAdminCors(request, json(await refreshPricingAdmin(env.USAGE, {
          groqApiKey: env.GROQ_API_KEY,
          openrouterApiKey: env.OPENROUTER_API_KEY,
        })));
      }

      if (request.method === "GET" && url.pathname === "/admin/discord/config") {
        return withAdminCors(request, json({
          ok: true,
          applicationIdConfigured: Boolean(env.DISCORD_APPLICATION_ID?.trim()),
          botTokenConfigured: Boolean(env.DISCORD_BOT_TOKEN?.trim()),
          publicKeyConfigured: Boolean(env.DISCORD_PUBLIC_KEY?.trim()),
          interactionEndpoint: buildDiscordInteractionEndpoint(request, env),
          commands: DISCORD_GLOBAL_COMMANDS.map((command) => command.name),
        }));
      }

      if (request.method === "POST" && url.pathname === "/admin/discord/sync-commands") {
        try {
          const guildId = url.searchParams.get("guildId")?.trim() || null;
          return withAdminCors(request, json(await syncDiscordCommands(env, guildId)));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to sync Discord commands.";
          return withAdminCors(request, json({ error: { message } }, 500));
        }
      }

      if (request.method === "POST" && url.pathname === "/admin/discord/scan-support") {
        try {
          return withAdminCors(request, json(await scanDiscordSupportMentions(env)));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to scan Discord support channels.";
          return withAdminCors(request, json({ error: { message } }, 500));
        }
      }

      if (request.method === "POST" && url.pathname === "/admin/benchmark/chat/completions") {
        const requestStartedAt = performance.now();
        const parseStartedAt = performance.now();
        const chatMeta = await readChatRequestMeta(request);
        const parseMs = roundTimingMs(performance.now() - parseStartedAt);

        const upstreamStartedAt = performance.now();
        const upstream = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: buildChatHeaders(request, env.GROQ_API_KEY),
          body: request.body,
        });
        const upstreamMs = roundTimingMs(performance.now() - upstreamStartedAt);

        return withAdminCors(request, buildThinBenchmarkChatCompletionResponse(upstream, {
          parseMs,
          usageMs: 0,
          upstreamMs,
          initMs: roundTimingMs(performance.now() - requestStartedAt),
          totalMs: null,
        }));
      }
    }

    if (request.method === "POST" && url.pathname === "/discord/interactions") {
      return handleDiscordInteraction(request, env);
    }

    if (request.method === "POST" && url.pathname === "/v2/device/register") {
      let payload: DeviceRegisterPayload;
      try {
        payload = await request.json() as DeviceRegisterPayload;
      } catch {
        return json({ error: { message: "Invalid device register payload." } }, 400);
      }

      try {
        return json(await registerDevice(env.USAGE, payload, {
          authProviders: ["google"],
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to register device.";
        return json({ error: { message } }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/v2/device/activate") {
      let payload: DeviceActivatePayload;
      try {
        payload = await request.json() as DeviceActivatePayload;
      } catch {
        return json({ error: { message: "Invalid device activate payload." } }, 400);
      }

      try {
        return json(await activateDevice(env.USAGE, payload, resolveDeviceInviteCodes(env)));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to activate device.";
        return json({ error: { message } }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/v2/execution/preflight") {
      let payload: ExecutionPreflightPayload;
      try {
        const raw = await request.json();
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          throw new Error("invalid_execution_preflight_payload");
        }
        payload = raw as ExecutionPreflightPayload;
      } catch {
        return json({ error: { message: "Invalid execution preflight payload." } }, 400);
      }

      if (!parseExecutionMode(payload.mode)) {
        return json({ error: { message: "Invalid execution preflight payload." } }, 400);
      }

      return json(await evaluateExecutionPreflight(env.USAGE, payload));
    }

    if (request.method === "POST" && url.pathname === "/v2/telemetry/events/batch") {
      let payload: TelemetryBatchRequest;
      try {
        payload = await request.json() as TelemetryBatchRequest;
      } catch {
        return json({ error: { message: "Invalid telemetry batch payload." } }, 400);
      }

      const acceptedIds = Array.isArray(payload.events)
        ? payload.events
          .map((event) => typeof event?.id === "string" ? event.id.trim() : "")
          .filter(Boolean)
        : [];

      return json({
        ok: true,
        acceptedIds,
        received: acceptedIds.length,
      });
    }

    if (request.method === "POST" && url.pathname === "/v2/feedback/submit") {
      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return json({ error: { message: "Invalid feedback payload." } }, 400);
      }

      try {
        const event = buildFeedbackEvent(payload);
        await persistFeedbackEvent(env.USAGE, event);
        return json({
          ok: true,
          id: event.id,
          ts: event.ts,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to persist feedback.";
        return json({ error: { message } }, 400);
      }
    }

    if (request.method === "GET" && url.pathname === "/desktop/login") {
      return startDesktopLogin(env, url);
    }

    if (request.method === "GET" && url.pathname === "/desktop/google/start") {
      return startDesktopGoogleAuth(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/desktop/login/status") {
      return getDesktopLoginStatus(env, url);
    }

    if (request.method === "POST" && url.pathname === "/desktop/login/link-device") {
      return linkDesktopLoginDevice(request, env);
    }

    if (request.method === "GET" && url.pathname === "/auth/google/start") {
      return startGoogleAuth(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/auth/google/result") {
      return getGoogleAuthResult(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/callback") {
      return handleGoogleCallback(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/v1/chat/completions") {
      const deviceId = getDeviceId(request);
      if (!deviceId) {
        return missingDeviceIdResponse();
      }

      const requestStartedAt = performance.now();
      const parseStartedAt = performance.now();
      const chatMeta = await readChatRequestMeta(request);
      const parseMs = roundTimingMs(performance.now() - parseStartedAt);

      const usageStartedAt = performance.now();
      const usage = ALPHA_USAGE_LIMITS_ENABLED
        ? await consumeUsage(env, "replace", deviceId, REPLACE_LIMIT_PER_DAY, 1)
        : createUnlimitedUsageWindow("replace", deviceId);
      const usageMs = roundTimingMs(performance.now() - usageStartedAt);
      if (!usage) {
        return limitResponse(
          "replace",
          REPLACE_LIMIT_PER_DAY,
          "Daily free replace limit reached. Try again tomorrow.",
        );
      }

      const upstreamStartedAt = performance.now();
      const upstream = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: buildChatHeaders(request, env.GROQ_API_KEY),
        body: request.body,
      });
      const upstreamMs = roundTimingMs(performance.now() - upstreamStartedAt);

      return proxyChatCompletionResponse(env, ctx, upstream, usage, chatMeta, deviceId, {
        parseMs,
        usageMs,
        upstreamMs,
        initMs: roundTimingMs(performance.now() - requestStartedAt),
        totalMs: null,
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/usage/prewarm") {
      const deviceId = getDeviceId(request);
      if (!deviceId) {
        return missingDeviceIdResponse();
      }

      const startedAt = performance.now();
      const replaceStartedAt = performance.now();
      const replace = ALPHA_USAGE_LIMITS_ENABLED
        ? await prewarmUsageLease(env, "replace", deviceId, REPLACE_LIMIT_PER_DAY)
        : createUnlimitedUsageWindow("replace", deviceId);
      const replaceMs = roundTimingMs(performance.now() - replaceStartedAt);

      const voiceStartedAt = performance.now();
      const voice = ALPHA_USAGE_LIMITS_ENABLED
        ? await prewarmUsageLease(env, "voice", deviceId, VOICE_LIMIT_SECONDS_PER_DAY)
        : createUnlimitedUsageWindow("voice", deviceId);
      const voiceMs = roundTimingMs(performance.now() - voiceStartedAt);

      return json({
        ok: true,
        deviceId,
        replace,
        voice,
        timing: {
          replaceMs,
          voiceMs,
          totalMs: roundTimingMs(performance.now() - startedAt),
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/audio/transcriptions") {
      const deviceId = getDeviceId(request);
      if (!deviceId) {
        return missingDeviceIdResponse();
      }

      const requestStartedAt = performance.now();
      const parseStartedAt = performance.now();
      const seconds = await resolveAudioDurationSeconds(request);
      const audioModel = await readAudioModel(request);
      const parseMs = roundTimingMs(performance.now() - parseStartedAt);

      const usageStartedAt = performance.now();
      const usage = ALPHA_USAGE_LIMITS_ENABLED
        ? await consumeUsage(env, "voice", deviceId, VOICE_LIMIT_SECONDS_PER_DAY, seconds)
        : createUnlimitedUsageWindow("voice", deviceId);
      const usageMs = roundTimingMs(performance.now() - usageStartedAt);
      if (!usage) {
        return limitResponse(
          "voice",
          VOICE_LIMIT_SECONDS_PER_DAY,
          "Daily free voice limit reached. Try again tomorrow.",
        );
      }

      const upstreamStartedAt = performance.now();
      const upstream = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: buildAudioHeaders(request, env.GROQ_API_KEY),
        body: request.body,
      });
      const upstreamMs = roundTimingMs(performance.now() - upstreamStartedAt);

      return proxyAudioTranscriptionResponse(env, ctx, upstream, usage, audioModel, seconds, deviceId, {
        parseMs,
        usageMs,
        upstreamMs,
        initMs: roundTimingMs(performance.now() - requestStartedAt),
        totalMs: null,
      });
    }

    return json({ error: { message: "Not found" } }, 404);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    runScheduledTasks(env, ctx, buildScheduledTaskDeps(env, async () => {
      await scanDiscordSupportMentions(env).catch((error) => {
        console.error("[discord][support_scan_failed]", error instanceof Error ? error.message : String(error));
      });
    }));
  },
};

export class UsageCounterDurableObject extends DurableObject<Env> {
  private initialized = false;
  private used = 0;
  private alarmAt: number | null = null;
  private readonly initialization: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.initialization = this.ctx.blockConcurrencyWhile(async () => {
      this.used = Number(await this.ctx.storage.get<number>("used") ?? 0);
      this.alarmAt = await this.ctx.storage.getAlarm();
      this.initialized = true;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialization;
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/reserve") {
      return this.reserve(request);
    }
    if (request.method === "POST" && url.pathname === "/consume") {
      return this.consume(request);
    }
    return json({ error: { message: "Not found" } }, 404);
  }

  async alarm(): Promise<void> {
    this.used = 0;
    this.alarmAt = null;
    await this.ctx.storage.deleteAll();
  }

  private async consume(request: Request): Promise<Response> {
    let payload: UsageConsumePayload;
    try {
      payload = await request.json() as UsageConsumePayload;
    } catch {
      return json({ error: { message: "Invalid usage payload." } }, 400);
    }

    const key = typeof payload.key === "string" ? payload.key.trim() : "";
    const limit = Number(payload.limit);
    const amount = Number(payload.amount);
    const resetAt = typeof payload.resetAt === "string" ? payload.resetAt : "";
    if (!key || !Number.isFinite(limit) || !Number.isFinite(amount) || amount <= 0 || !resetAt) {
      return json({ error: { message: "Incomplete usage payload." } }, 400);
    }

    const current = this.used;
    const nextUsed = current + amount;
    if (nextUsed > limit) {
      return json({
        ok: false,
        key,
        used: current,
        remaining: Math.max(0, limit - current),
        limit,
        resetAt,
      }, 429);
    }

    await this.ctx.storage.put("used", nextUsed);
    this.used = nextUsed;
    const resetAtMs = Date.parse(resetAt);
    if (Number.isFinite(resetAtMs)) {
      if (this.alarmAt === null || this.alarmAt !== resetAtMs) {
        await this.ctx.storage.setAlarm(resetAtMs);
        this.alarmAt = resetAtMs;
      }
    }

    return json({
      ok: true,
      key,
      used: nextUsed,
      remaining: Math.max(0, limit - nextUsed),
      limit,
      resetAt,
    });
  }

  private async reserve(request: Request): Promise<Response> {
    let payload: UsageReservePayload;
    try {
      payload = await request.json() as UsageReservePayload;
    } catch {
      return json({ error: { message: "Invalid usage reserve payload." } }, 400);
    }

    const key = typeof payload.key === "string" ? payload.key.trim() : "";
    const limit = Number(payload.limit);
    const reserve = Number(payload.reserve);
    const resetAt = typeof payload.resetAt === "string" ? payload.resetAt : "";
    if (!key || !Number.isFinite(limit) || !Number.isFinite(reserve) || reserve <= 0 || !resetAt) {
      return json({ error: { message: "Incomplete usage reserve payload." } }, 400);
    }

    const current = this.used;
    const available = Math.max(0, limit - current);
    const granted = Math.min(reserve, available);
    if (granted <= 0) {
      return json({
        ok: false,
        key,
        granted: 0,
        used: current,
        remaining: available,
        limit,
        resetAt,
      }, 429);
    }

    const nextUsed = current + granted;
    await this.ctx.storage.put("used", nextUsed);
    this.used = nextUsed;
    const resetAtMs = Date.parse(resetAt);
    if (Number.isFinite(resetAtMs)) {
      if (this.alarmAt === null || this.alarmAt !== resetAtMs) {
        await this.ctx.storage.setAlarm(resetAtMs);
        this.alarmAt = resetAtMs;
      }
    }

    return json({
      ok: true,
      key,
      granted,
      used: nextUsed,
      remaining: Math.max(0, limit - nextUsed),
      limit,
      resetAt,
    } satisfies UsageReserveResponse);
  }
}

async function startDesktopLogin(env: Env, url: URL): Promise<Response> {
  const flow = (url.searchParams.get("flow") ?? "").trim().toLowerCase();
  const client = (url.searchParams.get("client") ?? "").trim();
  const state = (url.searchParams.get("state") ?? "").trim();

  if (flow !== "device-code" || client !== "fixvox-tauri" || !state) {
    return json({ error: { message: "Invalid desktop login request." } }, 400);
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + AUTH_STATE_TTL_SECONDS * 1000);
  const handoffId = crypto.randomUUID();
  const payload: DesktopLoginState = {
    state,
    handoffId,
    flow: "device-code",
    client,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await env.USAGE.put(desktopLoginStateKey(state), JSON.stringify(payload), {
    expirationTtl: AUTH_STATE_TTL_SECONDS,
  });
  await env.USAGE.put(desktopLoginHandoffKey(handoffId), state, {
    expirationTtl: AUTH_STATE_TTL_SECONDS,
  });

  return renderDesktopLoginPage(handoffId, expiresAt.toISOString());
}

async function startDesktopGoogleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  const configError = validateGoogleOAuthConfig(env);
  if (configError) {
    return renderOAuthPage("Fixvox OAuth unavailable", configError, false);
  }

  const handoffId = (url.searchParams.get("handoff") ?? "").trim();
  const desktopState = handoffId ? await readDesktopLoginStateByHandoff(env, handoffId) : null;
  if (!desktopState) {
    return renderOAuthPage("Expired desktop login", "Start sign-in again from Fixvox.", false);
  }

  const codeVerifier = generateOAuthCodeVerifier();
  await env.USAGE.put(authStateKey(desktopState.state), JSON.stringify({
    state: desktopState.state,
    deviceId: desktopState.client,
    codeVerifier,
    returnTo: null,
    createdAt: new Date().toISOString(),
  } satisfies GoogleAuthState), {
    expirationTtl: AUTH_STATE_TTL_SECONDS,
  });

  const authorizeUrl = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GOOGLE_CLOUD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", buildCallbackUrl(request, env));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", desktopState.state);
  authorizeUrl.searchParams.set("code_challenge", await createPkceChallenge(codeVerifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");

  return Response.redirect(authorizeUrl.toString(), 302);
}

async function getDesktopLoginStatus(env: Env, url: URL): Promise<Response> {
  const state = (url.searchParams.get("state") ?? "").trim();
  if (!state) {
    return json({ error: { message: "Missing state query parameter." } }, 400);
  }

  const desktopState = await readDesktopLoginState(env, state);
  if (!desktopState) {
    return json({ status: "not_found", message: "Unknown or expired desktop login state.", redacted: true }, 404);
  }

  const rawResult = await env.USAGE.get(authResultKey(state));
  if (!rawResult) {
    return json({
      status: "pending",
      flow: desktopState.flow,
      provider: null,
      stateRedacted: redactIdentifier(state),
      expiresAt: desktopState.expiresAt,
      redacted: true,
    });
  }

  try {
    const result = JSON.parse(rawResult) as GoogleAuthResult;
    if (result.status === "success") {
      return json({
        status: "success",
        flow: desktopState.flow,
        provider: "google",
        stateRedacted: redactIdentifier(state),
        userRedacted: redactGoogleProfile(result.profile),
        completedAt: result.completedAt,
        redacted: true,
      });
    }
    return json({
      status: "error",
      flow: desktopState.flow,
      provider: "google",
      stateRedacted: redactIdentifier(state),
      completedAt: result.completedAt,
      error: result.error,
      errorDescription: result.errorDescription,
      redacted: true,
    });
  } catch {
    return json({ error: { message: "Invalid desktop login result." } }, 500);
  }
}

async function linkDesktopLoginDevice(request: Request, env: Env): Promise<Response> {
  let payload: DesktopLoginDeviceLinkPayload;
  try {
    payload = await request.json() as DesktopLoginDeviceLinkPayload;
  } catch {
    return json({ error: { message: "Invalid desktop login device link payload.", redacted: true } }, 400);
  }

  const state = (payload.state ?? "").trim();
  if (!state) {
    return json({ error: { message: "Missing desktop login state.", redacted: true } }, 400);
  }

  const desktopState = await readDesktopLoginState(env, state);
  if (!desktopState) {
    return json({ error: { message: "Unknown or expired desktop login state.", redacted: true } }, 404);
  }

  const rawResult = await env.USAGE.get(authResultKey(state));
  if (!rawResult) {
    return json({ error: { message: "Desktop login is still pending.", redacted: true } }, 409);
  }

  let result: GoogleAuthResult;
  try {
    result = JSON.parse(rawResult) as GoogleAuthResult;
  } catch {
    return json({ error: { message: "Invalid desktop login result.", redacted: true } }, 500);
  }

  if (result.status !== "success") {
    return json({ error: { message: "Desktop login did not complete successfully.", redacted: true } }, 409);
  }

  try {
    const registered = await registerDevice(env.USAGE, payload, {
      authProviders: ["google"],
      accountId: buildGoogleAccountId(result.profile),
    });
    const userRedacted = redactGoogleProfile(result.profile);
    return json({
      ...registered,
      accountId: null,
      auth: {
        ...registered.auth,
        required: false,
        providers: ["google"],
        accessMode: "signed_in",
        provider: "google",
        userId: userRedacted,
        userRedacted,
        groupLabel: registered.policyLabel ?? "Basic",
        policyTemplateId: registered.policyId ?? "basic-anonymous",
        policyTemplateLabel: registered.policyLabel ?? "Basic",
        redacted: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to link desktop login device.";
    return json({ error: { message, redacted: true } }, 400);
  }
}

async function startGoogleAuth(request: Request, env: Env, url: URL): Promise<Response> {
  const configError = validateGoogleOAuthConfig(env);
  if (configError) {
    return json({ error: { message: configError } }, 500);
  }

  const deviceId = url.searchParams.get("device_id")?.trim() ?? "";
  const codeVerifier = url.searchParams.get("code_verifier")?.trim() ?? "";
  const providedState = url.searchParams.get("state")?.trim() ?? "";
  const returnTo = normalizeReturnTo(url.searchParams.get("return_to"));
  const mode = (url.searchParams.get("mode") ?? "").trim().toLowerCase();

  if (!deviceId) {
    return json({ error: { message: "Missing device_id query parameter." } }, 400);
  }
  if (!isValidCodeVerifier(codeVerifier)) {
    return json({ error: { message: "Missing or invalid code_verifier query parameter." } }, 400);
  }

  const state = providedState || crypto.randomUUID();
  const codeChallenge = await createPkceChallenge(codeVerifier);
  const payload: GoogleAuthState = {
    state,
    deviceId,
    codeVerifier,
    returnTo,
    createdAt: new Date().toISOString(),
  };

  await env.USAGE.put(authStateKey(state), JSON.stringify(payload), {
    expirationTtl: AUTH_STATE_TTL_SECONDS,
  });

  const authorizeUrl = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GOOGLE_CLOUD_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", buildCallbackUrl(request, env));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");

  if (mode === "json") {
    return json({
      ok: true,
      state,
      authorizeUrl: authorizeUrl.toString(),
      redirectUri: buildCallbackUrl(request, env),
    });
  }

  return Response.redirect(authorizeUrl.toString(), 302);
}

async function getGoogleAuthResult(_request: Request, env: Env, url: URL): Promise<Response> {
  const state = url.searchParams.get("state")?.trim() ?? "";
  const deviceId = url.searchParams.get("device_id")?.trim() ?? "";
  if (!state || !deviceId) {
    return json({ error: { message: "Missing state or device_id query parameter." } }, 400);
  }

  const authState = await readGoogleAuthState(env, state);
  if (!authState) {
    return json({ status: "not_found", message: "Unknown or expired auth state." }, 404);
  }
  if (authState.deviceId !== deviceId) {
    return json({ error: { message: "Device ID mismatch." } }, 403);
  }

  const rawResult = await env.USAGE.get(authResultKey(state));
  if (!rawResult) {
    return json({ status: "pending", state, deviceId }, 200);
  }

  return new Response(rawResult, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function handleGoogleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const configError = validateGoogleOAuthConfig(env);
  if (configError) {
    return renderOAuthPage("Fixvox OAuth unavailable", configError, false);
  }

  const state = url.searchParams.get("state")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const googleError = url.searchParams.get("error")?.trim() ?? "";
  const googleErrorDescription = url.searchParams.get("error_description")?.trim() ?? "";

  if (!state) {
    return renderOAuthPage("Missing state", "Google returned no state parameter.", false);
  }

  const authState = await readGoogleAuthState(env, state);
  if (!authState) {
    return renderOAuthPage("Expired login", "This login request expired. Start again from the app.", false);
  }

  if (googleError) {
    await storeGoogleAuthResult(env, state, {
      status: "error",
      state,
      deviceId: authState.deviceId,
      createdAt: authState.createdAt,
      completedAt: new Date().toISOString(),
      error: googleError,
      errorDescription: googleErrorDescription || "Google login was cancelled or denied.",
    });
    return finalizeOAuthResponse(
      authState.returnTo,
      state,
      "error",
      googleError,
      googleErrorDescription || "Google login was cancelled or denied.",
    );
  }

  if (!code) {
    await storeGoogleAuthResult(env, state, {
      status: "error",
      state,
      deviceId: authState.deviceId,
      createdAt: authState.createdAt,
      completedAt: new Date().toISOString(),
      error: "missing_code",
      errorDescription: "Google did not return an authorization code.",
    });
    return finalizeOAuthResponse(
      authState.returnTo,
      state,
      "error",
      "missing_code",
      "Google did not return an authorization code.",
    );
  }

  try {
    const token = await exchangeGoogleCode(env, request, code, authState.codeVerifier);
    const profile = await fetchGoogleProfile(token.access_token);
    await storeGoogleAuthResult(env, state, {
      status: "success",
      state,
      deviceId: authState.deviceId,
      createdAt: authState.createdAt,
      completedAt: new Date().toISOString(),
      profile,
      token,
    });
    return finalizeOAuthResponse(
      authState.returnTo,
      state,
      "success",
      null,
      "Google login completed. You can return to Fixvox.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await storeGoogleAuthResult(env, state, {
      status: "error",
      state,
      deviceId: authState.deviceId,
      createdAt: authState.createdAt,
      completedAt: new Date().toISOString(),
      error: "token_exchange_failed",
      errorDescription: message,
    });
    return finalizeOAuthResponse(
      authState.returnTo,
      state,
      "error",
      "token_exchange_failed",
      message,
    );
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function buildAdminCorsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin")?.trim() ?? "";
  headers.set("Access-Control-Allow-Origin", origin || "*");
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function withAdminCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = buildAdminCorsHeaders(request);
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildAdminPreflightResponse(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: buildAdminCorsHeaders(request),
  });
}

async function handleDiscordInteraction(request: Request, env: Env): Promise<Response> {
  const signature = request.headers.get("x-signature-ed25519")?.trim() ?? "";
  const timestamp = request.headers.get("x-signature-timestamp")?.trim() ?? "";
  const body = await request.text();

  const verified = await verifyDiscordRequest(env, signature, timestamp, body);
  if (!verified) {
    return new Response("invalid request signature", { status: 401 });
  }

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(body) as DiscordInteraction;
  } catch {
    return json({ error: { message: "Invalid Discord interaction payload." } }, 400);
  }

  if (interaction.type === DISCORD_INTERACTION_PING) {
    return json({ type: DISCORD_RESPONSE_PONG });
  }

  if (interaction.type !== DISCORD_INTERACTION_APPLICATION_COMMAND) {
    return discordMessageResponse("This interaction type is not supported yet.");
  }

  const commandName = interaction.data?.name?.trim().toLowerCase() ?? "";
  if (commandName !== "fixvox") {
    return discordMessageResponse("Unknown Fixvox command.");
  }

  const rootOptions = Array.isArray(interaction.data?.options) ? interaction.data?.options ?? [] : [];
  const subcommand = rootOptions.find((option) => option?.type === 1 && typeof option.name === "string");
  const subcommandName = subcommand?.name?.trim().toLowerCase() ?? "";
  const subOptions = Array.isArray(subcommand?.options) ? subcommand?.options ?? [] : [];

  if (subcommandName === "help") {
    return discordMessageResponse(buildDiscordHelpMessage());
  }

  if (subcommandName === "status") {
    return discordMessageResponse(buildDiscordStatusMessage(env));
  }

  if (subcommandName === "feedback") {
    const feedbackType = getDiscordStringOption(subOptions, "type");
    const message = getDiscordStringOption(subOptions, "message");
    const deviceId = getDiscordStringOption(subOptions, "device_id");

    if (!feedbackType || !message) {
      return discordMessageResponse("`type` and `message` are required for `/fixvox feedback`.");
    }

    try {
      const event = buildFeedbackEvent({
        type: feedbackType,
        source: "discord-slash",
        message,
        deviceId,
        loggedIn: false,
        context: {
          discordUserId: getDiscordUser(interaction)?.id ?? null,
          discordUsername: getDiscordDisplayName(interaction),
          discordChannelId: interaction.channel_id ?? null,
          discordGuildId: interaction.guild_id ?? null,
          command: "fixvox feedback",
        },
      });
      await persistFeedbackEvent(env.USAGE, event);
      return discordMessageResponse(
        [
          "Thanks. Your Fixvox alpha feedback is recorded.",
          `Feedback ID: \`${event.id}\``,
          deviceId ? `Device ID: \`${deviceId}\`` : "Tip: add `device_id` next time if you want tighter correlation with app-side feedback.",
        ].join("\n"),
      );
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unable to store feedback right now.";
      return discordMessageResponse(`I couldn't store that feedback yet: ${messageText}`);
    }
  }

  return discordMessageResponse("Try `/fixvox help`, `/fixvox status`, or `/fixvox feedback`.");
}

function authorizeAdminRequest(request: Request, env: Env): Response | null {
  const expected = env.ADMIN_API_KEY?.trim() ?? "";
  if (!expected) {
    return json({
      error: {
        message: "ADMIN_API_KEY is not configured in the Worker.",
        type: "configuration_error",
        code: "missing_admin_api_key",
      },
    }, 503);
  }

  const authHeader = request.headers.get("Authorization")?.trim() ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token || token !== expected) {
    return json({
      error: {
        message: "Unauthorized admin request.",
        type: "authentication_error",
        code: "invalid_admin_token",
      },
    }, 401);
  }

  return null;
}

function missingDeviceIdResponse(): Response {
  return json({
    error: {
      message: "Missing X-Device-Id header.",
      type: "invalid_request_error",
      code: "missing_device_id",
    },
  }, 400);
}

function limitResponse(kind: "replace" | "voice", limit: number, message: string): Response {
  return json({
    error: {
      message,
      type: "rate_limit_error",
      code: `${kind}_daily_limit_reached`,
      limit,
    },
  }, 429);
}

function getDeviceId(request: Request): string {
  return request.headers.get("X-Device-Id")?.trim() ?? "";
}

function buildDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function buildDiscordInteractionEndpoint(request: Request, env: Env): string {
  const baseUrl = env.AUTH_PUBLIC_BASE_URL?.trim() || new URL(request.url).origin;
  return `${baseUrl.replace(/\/+$/, "")}/discord/interactions`;
}

async function scanDiscordSupportMentions(env: Env): Promise<{
  ok: true;
  scannedChannels: string[];
  repliedMessageIds: string[];
}> {
  const applicationId = env.DISCORD_APPLICATION_ID?.trim() ?? "";
  const botToken = env.DISCORD_BOT_TOKEN?.trim() ?? "";
  const channelIds = parseCommaSeparatedValues(env.DISCORD_SUPPORT_CHANNEL_IDS);
  if (!applicationId || !botToken || channelIds.length === 0) {
    return {
      ok: true,
      scannedChannels: channelIds,
      repliedMessageIds: [],
    };
  }

  const repliedMessageIds: string[] = [];
  for (const channelId of channelIds) {
    const messages = await listDiscordChannelMessages(botToken, channelId, 20);
    for (const message of [...messages].reverse()) {
      const messageId = message.id?.trim() ?? "";
      if (!messageId) continue;
      if (!shouldHandleDiscordSupportMessage(message, applicationId)) continue;
      if (await hasHandledDiscordSupportMessage(env.USAGE, messageId)) continue;

      const replyContent = await buildDiscordSupportReply(env, channelId, message);
      const posted = await createDiscordChannelMessage(botToken, channelId, {
        content: replyContent,
        message_reference: {
          message_id: messageId,
          channel_id: channelId,
          fail_if_not_exists: false,
        },
        allowed_mentions: {
          replied_user: false,
        },
      });

      if (posted?.id) {
        repliedMessageIds.push(messageId);
        await markDiscordSupportMessageHandled(env.USAGE, messageId);
      }
    }
  }

  return {
    ok: true,
    scannedChannels: channelIds,
    repliedMessageIds,
  };
}

async function syncDiscordCommands(env: Env, guildId: string | null): Promise<{
  ok: true;
  scope: "global" | "guild";
  guildId: string | null;
  commandCount: number;
  commands: string[];
}> {
  const applicationId = env.DISCORD_APPLICATION_ID?.trim() ?? "";
  const botToken = env.DISCORD_BOT_TOKEN?.trim() ?? "";
  if (!applicationId) {
    throw new Error("DISCORD_APPLICATION_ID is not configured in the Worker.");
  }
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is not configured in the Worker.");
  }

  const path = guildId
    ? `${DISCORD_API_BASE_URL}/applications/${applicationId}/guilds/${guildId}/commands`
    : `${DISCORD_API_BASE_URL}/applications/${applicationId}/commands`;
  const response = await fetch(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(DISCORD_GLOBAL_COMMANDS),
  });

  const payload = await response.json().catch(() => null) as Array<{ name?: string }> | { message?: string } | null;
  if (!response.ok) {
    const message = payload && !Array.isArray(payload) && typeof payload.message === "string"
      ? payload.message
      : `Discord API error (${response.status})`;
    throw new Error(message);
  }

  const commands = Array.isArray(payload)
    ? payload.map((command) => (typeof command?.name === "string" ? command.name : "")).filter(Boolean)
    : DISCORD_GLOBAL_COMMANDS.map((command) => command.name);

  return {
    ok: true,
    scope: guildId ? "guild" : "global",
    guildId,
    commandCount: commands.length,
    commands,
  };
}

async function verifyDiscordRequest(
  env: Env,
  signature: string,
  timestamp: string,
  body: string,
): Promise<boolean> {
  if (!signature || !timestamp || !body) {
    return false;
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > DISCORD_SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const key = await getDiscordPublicKey(env);
  if (!key) {
    return false;
  }

  try {
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToBytes(signature),
      new TextEncoder().encode(`${timestamp}${body}`),
    );
  } catch {
    return false;
  }
}

async function getDiscordPublicKey(env: Env): Promise<CryptoKey | null> {
  if (discordPublicKeyPromise) {
    return discordPublicKeyPromise;
  }

  const publicKey = env.DISCORD_PUBLIC_KEY?.trim() ?? "";
  if (!publicKey) {
    return null;
  }

  discordPublicKeyPromise = crypto.subtle.importKey(
    "raw",
    hexToBytes(publicKey),
    "Ed25519",
    false,
    ["verify"],
  ).catch(() => null);

  return discordPublicKeyPromise;
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length % 2 !== 0) {
    throw new Error("Invalid hex value.");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function discordMessageResponse(content: string): Response {
  return json({
    type: DISCORD_RESPONSE_CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: DISCORD_EPHEMERAL_FLAG,
      content,
    },
  });
}

function buildDiscordHelpMessage(): string {
  return [
    "Fixvox alpha quick help",
    "",
    "Use the channels like this:",
    "- #help for usage questions",
    "- #bugs for problems and regressions",
    "- #ideas for product suggestions",
    "- #alpha-builds for updates",
    "",
    "Slash commands:",
    "- `/fixvox help`",
    "- `/fixvox status`",
    "- `/fixvox feedback type:<...> message:<...>`",
  ].join("\n");
}

function buildDiscordStatusMessage(env: Env): string {
  return [
    "Fixvox alpha status",
    "",
    `- Feedback backend: ${env.DISCORD_PUBLIC_KEY?.trim() ? "ready" : "bot not fully configured"}`,
    "- Structured feedback: available through `/fixvox feedback`",
    "- Community channels: ready",
    "",
    "If something breaks, post in #bugs and include your device ID if you have it from the app.",
  ].join("\n");
}

function getDiscordStringOption(options: DiscordCommandOption[], name: string): string | null {
  const option = options.find((entry) => entry?.name === name);
  if (!option) return null;
  return typeof option.value === "string" && option.value.trim() ? option.value.trim() : null;
}

function getDiscordUser(interaction: DiscordInteraction): DiscordInteraction["user"] {
  return interaction.member?.user ?? interaction.user ?? null;
}

function getDiscordDisplayName(interaction: DiscordInteraction): string | null {
  const user = getDiscordUser(interaction);
  if (!user) return null;
  return user.global_name?.trim() || user.username?.trim() || null;
}

function parseCommaSeparatedValues(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function listDiscordChannelMessages(
  botToken: string,
  channelId: string,
  limit: number,
): Promise<DiscordMessage[]> {
  const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages?limit=${limit}`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Discord messages API error (${response.status})`);
  }
  const payload = await response.json().catch(() => []) as unknown;
  return Array.isArray(payload) ? payload as DiscordMessage[] : [];
}

async function createDiscordChannelMessage(
  botToken: string,
  channelId: string,
  payload: Record<string, unknown>,
): Promise<{ id?: string } | null> {
  const response = await fetch(`${DISCORD_API_BASE_URL}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Discord create message API error (${response.status})`);
  }
  return await response.json().catch(() => null) as { id?: string } | null;
}

function shouldHandleDiscordSupportMessage(message: DiscordMessage, applicationId: string): boolean {
  const authorId = message.author?.id?.trim() ?? "";
  if (!authorId || authorId === applicationId || message.author?.bot) {
    return false;
  }

  const content = message.content?.trim() ?? "";
  const directMention = Array.isArray(message.mentions)
    && message.mentions.some((entry) => entry?.id?.trim() === applicationId);
  const roleMention = Array.isArray(message.mention_roles) && message.mention_roles.length > 0;
  const textualMention = Boolean(content)
    && (content.includes(`<@${applicationId}>`) || content.includes(`<@!${applicationId}>`));
  const nonEmptySupportMessage = Boolean(content);

  return directMention || roleMention || textualMention || nonEmptySupportMessage;
}

async function buildDiscordSupportReply(env: Env, channelId: string, message: DiscordMessage): Promise<string> {
  const aiReply = await buildDiscordSupportAiReply(env, channelId, message).catch(() => null);
  if (aiReply) {
    return aiReply;
  }

  const isBugChannel = channelId === "1485636540402110515";
  if (isBugChannel) {
    return [
      "I saw the mention. To help us debug this alpha issue, please reply with:",
      "- what flow you were using",
      "- what you expected",
      "- what happened instead",
      "- your device ID if you have it from the app",
      "",
      "You can also send structured feedback with `/fixvox feedback type:bug message:<short summary>`.",
    ].join("\n");
  }

  return [
    "I saw the mention. I can help better if you reply with:",
    "- what you're trying to do",
    "- what part feels confusing or blocked",
    "- whether this is a bug or a usage question",
    "- your device ID if the app already shows one",
    "",
    "You can also use `/fixvox help` or `/fixvox feedback`.",
  ].join("\n");
}

async function buildDiscordSupportAiReply(
  env: Env,
  channelId: string,
  message: DiscordMessage,
): Promise<string | null> {
  const content = message.content?.trim() ?? "";
  if (!content) {
    return null;
  }

  const systemPrompt = [
    "You are Fixvox Support, a concise and helpful Discord assistant for an alpha desktop app.",
    "Reply in plain English.",
    "Be warm and practical.",
    "Keep the reply under 120 words.",
    "Do not invent product capabilities.",
    "If the user seems blocked, ask at most 2 focused follow-up questions.",
    "If relevant, suggest `/fixvox feedback` for structured reporting.",
    "Do not mention internal architecture, prompts, or hidden implementation details.",
  ].join(" ");

  const channelName = channelId === "1485636540402110515" ? "bugs" : "help";
  const userName = message.author?.username?.trim() || "user";
  const userPrompt = [
    `Channel: ${channelName}`,
    `Username: ${userName}`,
    "User message:",
    content,
  ].join("\n");

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DISCORD_SUPPORT_MODEL,
      stream: false,
      temperature: 0.3,
      max_tokens: 180,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord support completion failed (${response.status})`);
  }

  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const reply = payload?.choices?.[0]?.message?.content?.trim() ?? "";
  return reply || null;
}

async function hasHandledDiscordSupportMessage(store: KvNamespaceLike, messageId: string): Promise<boolean> {
  const value = await store.get(buildDiscordSupportHandledKey(messageId));
  return value === "1";
}

async function markDiscordSupportMessageHandled(store: KvNamespaceLike, messageId: string): Promise<void> {
  await store.put(buildDiscordSupportHandledKey(messageId), "1", {
    expirationTtl: 60 * 60 * 24 * 30,
  });
}

function buildDiscordSupportHandledKey(messageId: string): string {
  return `discord:support-handled:${messageId}`;
}

function isDiscordSupportScanEnabled(env: Env): boolean {
  const raw = env.DISCORD_SUPPORT_SCAN_ENABLED?.trim().toLowerCase() ?? "";
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function usageKey(kind: "replace" | "voice", deviceId: string, now: Date): string {
  return `${kind}:${deviceId}:${buildDayKey(now)}`;
}

function createUnlimitedUsageWindow(kind: "replace" | "voice", deviceId: string): UsageWindow {
  const now = new Date();
  return {
    key: usageKey(kind, deviceId, now),
    used: 0,
    remaining: DISABLED_USAGE_LIMIT,
    limit: DISABLED_USAGE_LIMIT,
    resetAt: new Date(now.getTime() + DAY_TTL_SECONDS * 1000).toISOString(),
  };
}

async function consumeUsage(
  env: Env,
  kind: "replace" | "voice",
  deviceId: string,
  limit: number,
  amount: number,
): Promise<UsageWindow | null> {
  const now = new Date();
  const key = usageKey(kind, deviceId, now);
  const resetAt = new Date(now.getTime() + DAY_TTL_SECONDS * 1000).toISOString();
  if ((kind === "replace" && amount === 1) || kind === "voice") {
    return consumeUsageWithLease(env, kind, key, limit, amount, resetAt);
  }

  const id = env.USAGE_COUNTERS.idFromName(key);
  const stub = env.USAGE_COUNTERS.get(id);
  const response = await stub.fetch("https://usage-counter/consume", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      limit,
      amount,
      resetAt,
    } satisfies UsageConsumePayload),
  });

  if (response.status === 429) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`usage counter failed (${response.status})`);
  }
  return await response.json() as UsageWindow;
}

async function prewarmUsageLease(
  env: Env,
  kind: "replace" | "voice",
  deviceId: string,
  limit: number,
): Promise<UsageWindow | null> {
  const now = new Date();
  const key = usageKey(kind, deviceId, now);
  const resetAt = new Date(now.getTime() + DAY_TTL_SECONDS * 1000).toISOString();
  return await consumeUsageWithLease(env, kind, key, limit, 0, resetAt);
}

function getValidUsageLease(key: string, now: number): LocalUsageLease | null {
  const lease = usageLeaseCache.get(key) ?? null;
  if (!lease) return null;
  const resetAtMs = Date.parse(lease.resetAt);
  if (!Number.isFinite(resetAtMs) || resetAtMs <= now || lease.localRemaining <= 0) {
    usageLeaseCache.delete(key);
    return null;
  }
  return lease;
}

function buildUsageWindowFromLease(lease: LocalUsageLease): UsageWindow {
  const remaining = Math.max(0, lease.backendRemaining + lease.localRemaining);
  return {
    key: lease.key,
    used: Math.max(0, lease.limit - remaining),
    remaining,
    limit: lease.limit,
    resetAt: lease.resetAt,
  };
}

async function consumeUsageWithLease(
  env: Env,
  kind: "replace" | "voice",
  key: string,
  limit: number,
  amount: number,
  resetAt: string,
): Promise<UsageWindow | null> {
  const now = Date.now();
  const cachedLease = getValidUsageLease(key, now);
  if (cachedLease && cachedLease.localRemaining >= amount) {
    cachedLease.localRemaining -= amount;
    if (cachedLease.localRemaining <= 0) {
      usageLeaseCache.delete(key);
    } else {
      usageLeaseCache.set(key, cachedLease);
    }
    return buildUsageWindowFromLease(cachedLease);
  }

  const reserve = getLeaseReserveAmount(kind, amount, cachedLease?.localRemaining ?? 0);
  const id = env.USAGE_COUNTERS.idFromName(key);
  const stub = env.USAGE_COUNTERS.get(id);
  const response = await stub.fetch("https://usage-counter/reserve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      limit,
      reserve,
      resetAt,
    } satisfies UsageReservePayload),
  });

  if (response.status === 429) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`usage lease reserve failed (${response.status})`);
  }

  const reserved = await response.json() as UsageReserveResponse;
  const granted = Math.max(0, Math.floor(reserved.granted));
  const carriedLocalRemaining = cachedLease?.localRemaining ?? 0;
  const availableLocal = carriedLocalRemaining + granted;
  if (availableLocal < amount) {
    usageLeaseCache.delete(key);
    return null;
  }

  const lease: LocalUsageLease = {
    key,
    limit: reserved.limit,
    resetAt: reserved.resetAt,
    backendRemaining: reserved.remaining,
    localRemaining: Math.max(0, availableLocal - amount),
  };
  if (lease.localRemaining > 0) {
    usageLeaseCache.set(key, lease);
  } else {
    usageLeaseCache.delete(key);
  }

  return buildUsageWindowFromLease(lease);
}

function getLeaseReserveAmount(kind: "replace" | "voice", amount: number, currentLocalRemaining: number): number {
  const baseline = kind === "voice" ? VOICE_LEASE_RESERVE_SECONDS : REPLACE_LEASE_RESERVE;
  const needed = Math.max(0, amount - currentLocalRemaining);
  return Math.max(baseline, needed);
}

function buildChatHeaders(request: Request, apiKey: string): Headers {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", request.headers.get("Content-Type") ?? "application/json");
  headers.set("Accept", request.headers.get("Accept") ?? "text/event-stream");
  return headers;
}

function buildThinBenchmarkChatCompletionResponse(
  upstream: Response,
  timing: ProxyTiming,
): Response {
  const headers = new Headers(upstream.headers);
  headers.set("X-Fixvox-Benchmark-Proxy", "thin");
  headers.set("X-Fixvox-Proxy-Parse-Ms", String(timing.parseMs ?? 0));
  headers.set("X-Fixvox-Proxy-Usage-Ms", String(timing.usageMs ?? 0));
  headers.set("X-Fixvox-Proxy-Upstream-Ms", String(timing.upstreamMs ?? 0));
  headers.set("X-Fixvox-Proxy-Init-Ms", String(timing.initMs ?? 0));
  if (timing.totalMs !== null) {
    headers.set("X-Fixvox-Proxy-Total-Ms", String(timing.totalMs));
  } else {
    headers.delete("X-Fixvox-Proxy-Total-Ms");
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function readChatRequestMeta(request: Request): Promise<ChatRequestMeta> {
  try {
    const payload = await request.clone().json() as {
      model?: unknown;
      stream?: unknown;
      messages?: unknown;
    };
    return {
      model: typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : null,
      stream: payload.stream !== false,
      context: normalizeRequestContext(request.headers.get("X-Fixvox-Request-Context")),
      inputChars: estimateOpenAiMessageChars(payload.messages),
    };
  } catch {
    return {
      model: null,
      stream: true,
      context: normalizeRequestContext(request.headers.get("X-Fixvox-Request-Context")),
      inputChars: 0,
    };
  }
}

function normalizeRequestContext(value: string | null): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || "other";
}

function stripVisibleReasoningText(value: string): string {
  const stripped = value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .trim();
  return stripped || value;
}

function shouldStripReasoningFromChatContext(context: string): boolean {
  return context.startsWith("preset.");
}

function sanitizeChatPayloadContent(payload: Record<string, unknown>, context: string): string | null {
  if (!shouldStripReasoningFromChatContext(context)) {
    return null;
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : null;
  const firstChoice = choices?.[0];
  const message = firstChoice && typeof firstChoice === "object"
    ? (firstChoice as { message?: unknown }).message
    : null;
  const content = message && typeof message === "object"
    ? (message as { content?: unknown }).content
    : null;
  if (typeof content !== "string" || !content.trim()) {
    return null;
  }

  const sanitized = stripVisibleReasoningText(content);
  if (sanitized === content) {
    return null;
  }

  (message as { content: string }).content = sanitized;
  return sanitized;
}

function estimateOpenAiMessageChars(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  return messages.reduce((sum, entry) => {
    const message = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return sum + estimateContentChars(message.content);
  }, 0);
}

function estimateContentChars(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum, part) => {
    if (typeof part === "string") return sum + part.length;
    if (!part || typeof part !== "object") return sum;
    const record = part as Record<string, unknown>;
    if (typeof record.text === "string") return sum + record.text.length;
    return sum;
  }, 0);
}

function buildAudioHeaders(request: Request, apiKey: string): Headers {
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", request.headers.get("Content-Type") ?? "multipart/form-data");
  headers.set("Accept", request.headers.get("Accept") ?? "application/json");
  return headers;
}

async function readAudioModel(request: Request): Promise<string | null> {
  try {
    const form = await request.clone().formData();
    const value = form.get("model");
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

async function resolveAudioDurationSeconds(request: Request): Promise<number> {
  const headerDuration = Number.parseFloat(request.headers.get("X-Audio-Duration") ?? "");
  if (Number.isFinite(headerDuration) && headerDuration > 0) {
    return Math.max(1, Math.ceil(headerDuration));
  }

  const cloned = request.clone();
  const payload = await cloned.arrayBuffer();
  return estimateDurationFromWavBytes(payload.byteLength);
}

function estimateDurationFromWavBytes(byteLength: number): number {
  const payloadBytes = Math.max(0, byteLength - 44);
  const bytesPerSecond = 32000;
  return Math.max(1, Math.ceil(payloadBytes / bytesPerSecond));
}

function roundUsd(value: number): number {
  return Number(value.toFixed(8));
}

function roundTimingMs(value: number): number {
  return Number(value.toFixed(1));
}

function parseNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractGroqUsage(value: unknown): {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
} {
  const usage = value && typeof value === "object" ? value as GroqUsagePayload : {};
  return {
    promptTokens: parseNumber(usage.prompt_tokens),
    completionTokens: parseNumber(usage.completion_tokens),
    totalTokens: parseNumber(usage.total_tokens),
  };
}

function estimateGroqChatCostUsd(
  model: string | null,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  const normalizedModel = normalizeGroqPricingModel(model);
  if (!normalizedModel) return null;
  const pricing = GROQ_CHAT_PRICING_PER_MILLION_USD[normalizedModel];
  if (!pricing) return null;
  if (promptTokens === null && completionTokens === null) return null;
  const promptCost = ((promptTokens ?? 0) / 1_000_000) * pricing.prompt;
  const completionCost = ((completionTokens ?? 0) / 1_000_000) * pricing.completion;
  return roundUsd(promptCost + completionCost);
}

function estimateGroqTranscriptionCostUsd(model: string | null, audioSeconds: number): number | null {
  const normalizedModel = normalizeGroqPricingModel(model);
  if (!normalizedModel || !Number.isFinite(audioSeconds) || audioSeconds <= 0) return null;
  const pricePerHour = GROQ_AUDIO_PRICING_PER_HOUR_USD[normalizedModel];
  if (!pricePerHour) return null;
  return roundUsd((audioSeconds / 3600) * pricePerHour);
}

function normalizeGroqPricingModel(model: string | null): string {
  const normalized = model?.trim().toLowerCase() ?? "";
  if (!normalized) return "";

  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex >= 0 && slashIndex < normalized.length - 1) {
    return normalized.slice(slashIndex + 1);
  }

  return normalized;
}

function createTelemetryHeaders(
  upstream: Response,
  usage: UsageWindow,
  telemetry: Partial<ProxyTelemetry>,
  timing?: Partial<ProxyTiming>,
): Headers {
  const headers = new Headers(upstream.headers);
  headers.set("X-Fixvox-Usage-Key", usage.key);
  headers.set("X-Fixvox-Limit", String(usage.limit));
  headers.set("X-Fixvox-Remaining", String(usage.remaining));
  headers.set("X-Fixvox-Reset-At", usage.resetAt);
  if (telemetry.backendRequestId) headers.set("X-Fixvox-Request-Id", telemetry.backendRequestId);
  if (telemetry.providerRequestId) headers.set("X-Provider-Request-Id", telemetry.providerRequestId);
  if (telemetry.promptTokens !== null && telemetry.promptTokens !== undefined) headers.set("X-Fixvox-Prompt-Tokens", String(telemetry.promptTokens));
  if (telemetry.completionTokens !== null && telemetry.completionTokens !== undefined) headers.set("X-Fixvox-Completion-Tokens", String(telemetry.completionTokens));
  if (telemetry.totalTokens !== null && telemetry.totalTokens !== undefined) headers.set("X-Fixvox-Total-Tokens", String(telemetry.totalTokens));
  if (telemetry.costUsd !== null && telemetry.costUsd !== undefined) headers.set("X-Fixvox-Cost-Usd", String(telemetry.costUsd));
  if (telemetry.pricingSource) headers.set("X-Fixvox-Pricing-Source", telemetry.pricingSource);
  applyTimingHeaders(headers, timing);
  return headers;
}

function applyTimingHeaders(headers: Headers, timing?: Partial<ProxyTiming>): void {
  if (!timing) return;
  const serverTiming: string[] = [];
  setTimingHeader(headers, serverTiming, "X-Fixvox-Proxy-Parse-Ms", "parse", timing.parseMs);
  setTimingHeader(headers, serverTiming, "X-Fixvox-Proxy-Usage-Ms", "usage", timing.usageMs);
  setTimingHeader(headers, serverTiming, "X-Fixvox-Proxy-Upstream-Ms", "upstream", timing.upstreamMs);
  setTimingHeader(headers, serverTiming, "X-Fixvox-Proxy-Init-Ms", "init", timing.initMs);
  setTimingHeader(headers, serverTiming, "X-Fixvox-Proxy-Total-Ms", "total", timing.totalMs);
  if (serverTiming.length > 0) {
    headers.set("Server-Timing", serverTiming.join(", "));
  }
}

function setTimingHeader(
  headers: Headers,
  serverTiming: string[],
  headerName: string,
  metricName: string,
  value: number | null | undefined,
): void {
  if (value === null || value === undefined) return;
  headers.set(headerName, String(value));
  serverTiming.push(`${metricName};dur=${value}`);
}

function buildTelemetryChunk(telemetry: ProxyTelemetry): string {
  return JSON.stringify({
    x_fixvox: {
      backend_request_id: telemetry.backendRequestId,
      provider_request_id: telemetry.providerRequestId,
      prompt_tokens: telemetry.promptTokens,
      completion_tokens: telemetry.completionTokens,
      total_tokens: telemetry.totalTokens,
      cost_usd: telemetry.costUsd,
      pricing_source: telemetry.pricingSource,
    },
  });
}

function parseChatOutputCharsFromPayload(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const payload = value as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  let total = 0;
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const record = choice as Record<string, unknown>;
    const message = record.message && typeof record.message === "object" ? record.message as Record<string, unknown> : {};
    total += estimateContentChars(message.content);
  }
  return total;
}

function buildRequestEvent(input: {
  backendRequestId: string;
  deviceId: string;
  provider: string;
  model: string | null;
  context: string;
  status: "success" | "error";
  inputChars: number;
  outputChars: number;
  inputSeconds: number | null;
  outputSeconds: number | null;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  pricingSource: string | null;
  providerRequestId: string | null;
  usage: UsageWindow | null;
  errorMessage?: string | null;
}): AdminRequestEvent {
  return {
    id: input.backendRequestId,
    ts: new Date().toISOString(),
    deviceId: input.deviceId,
    provider: input.provider,
    model: input.model ?? "unknown",
    context: input.context,
    status: input.status,
    transportMode: "proxied",
    costAuthority: "backend-reported",
    inputChars: input.inputChars,
    outputChars: input.outputChars,
    inputSeconds: input.inputSeconds,
    outputSeconds: input.outputSeconds,
    durationMs: input.durationMs,
    ttftMs: null,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens: input.totalTokens,
    actualCostUsd: input.costUsd,
    billedCostUsd: input.costUsd,
    pricingSource: input.pricingSource,
    providerRequestId: input.providerRequestId,
    backendRequestId: input.backendRequestId,
    usageKey: input.usage?.key ?? null,
    usageLimit: input.usage?.limit ?? null,
    usageRemaining: input.usage?.remaining ?? null,
    usageResetAt: input.usage?.resetAt ?? null,
    errorMessage: input.errorMessage ?? null,
  };
}

async function proxyChatCompletionResponse(
  env: Env,
  ctx: ExecutionContext,
  upstream: Response,
  usage: UsageWindow,
  meta: ChatRequestMeta,
  deviceId: string,
  timing: ProxyTiming,
): Promise<Response> {
  const backendRequestId = crypto.randomUUID();
  const responseStartedAt = performance.now();
  if (!meta.stream || !upstream.body) {
    return proxyNonStreamingChatCompletionResponse(env, ctx, upstream, usage, meta, backendRequestId, deviceId, responseStartedAt, timing);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();
  const providerRequestIdFromHeaders = upstream.headers.get("x-request-id")?.trim() || null;
  let providerRequestId: string | null = null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  let buffer = "";
  let telemetryInjected = false;
  let outputChars = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              if (buffer.length > 0) {
                controller.enqueue(encoder.encode(buffer));
                buffer = "";
              }
              controller.close();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data:")) {
                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") {
                  if (!telemetryInjected) {
                    telemetryInjected = true;
                    const telemetry: ProxyTelemetry = {
                      backendRequestId,
                      providerRequestId: providerRequestId ?? providerRequestIdFromHeaders,
                      promptTokens,
                      completionTokens,
                      totalTokens,
                      costUsd: estimateGroqChatCostUsd(meta.model, promptTokens, completionTokens),
                      pricingSource: "groq-proxy-pricing",
                    };
                    controller.enqueue(encoder.encode(`data: ${buildTelemetryChunk(telemetry)}\n\n`));
                  }
                } else {
                  try {
                    const payload = JSON.parse(data) as Record<string, unknown> & {
                      id?: unknown;
                      x_groq?: { id?: unknown };
                      usage?: unknown;
                      choices?: Array<{ delta?: { content?: unknown } }>;
                    };
                    if (typeof payload.id === "string" && payload.id.trim()) {
                      providerRequestId = payload.id.trim();
                    }
                    if (payload.x_groq && typeof payload.x_groq === "object" && typeof payload.x_groq.id === "string" && payload.x_groq.id.trim()) {
                      providerRequestId = payload.x_groq.id.trim();
                    }
                    const usagePayload = extractGroqUsage(payload.usage);
                    promptTokens = usagePayload.promptTokens ?? promptTokens;
                    completionTokens = usagePayload.completionTokens ?? completionTokens;
                    totalTokens = usagePayload.totalTokens ?? totalTokens;
                    const choices = Array.isArray(payload.choices) ? payload.choices : [];
                    for (const choice of choices) {
                      const delta = choice && typeof choice === "object" ? choice.delta : null;
                      if (!delta || typeof delta !== "object") continue;
                      outputChars += estimateContentChars((delta as Record<string, unknown>).content);
                    }
                  } catch {
                    // preserve opaque SSE chunks unchanged
                  }
                }
              }

              controller.enqueue(encoder.encode(`${line}\n`));
            }
          }
        } catch (error) {
          ctx.waitUntil(persistRequestEvent(env.USAGE, buildRequestEvent({
            backendRequestId,
            deviceId,
            provider: "groq",
            model: meta.model,
            context: meta.context,
            status: "error",
            inputChars: meta.inputChars,
            outputChars,
            inputSeconds: null,
            outputSeconds: null,
            durationMs: roundTimingMs((timing.initMs ?? 0) + (performance.now() - responseStartedAt)),
            promptTokens,
            completionTokens,
            totalTokens,
            costUsd: estimateGroqChatCostUsd(meta.model, promptTokens, completionTokens),
            pricingSource: "groq-proxy-pricing",
            providerRequestId: providerRequestId ?? providerRequestIdFromHeaders,
            usage,
            errorMessage: error instanceof Error ? error.message : String(error),
          })));
          controller.error(error);
        } finally {
          if (telemetryInjected) {
            ctx.waitUntil(persistRequestEvent(env.USAGE, buildRequestEvent({
              backendRequestId,
              deviceId,
              provider: "groq",
              model: meta.model,
              context: meta.context,
              status: upstream.ok ? "success" : "error",
              inputChars: meta.inputChars,
              outputChars,
              inputSeconds: null,
              outputSeconds: null,
              durationMs: roundTimingMs((timing.initMs ?? 0) + (performance.now() - responseStartedAt)),
              promptTokens,
              completionTokens,
              totalTokens,
              costUsd: estimateGroqChatCostUsd(meta.model, promptTokens, completionTokens),
              pricingSource: "groq-proxy-pricing",
              providerRequestId: providerRequestId ?? providerRequestIdFromHeaders,
              usage,
              errorMessage: upstream.ok ? null : upstream.statusText,
            })));
          }
          reader.releaseLock();
        }
      })();
    },
    cancel() {
      void reader.cancel();
    },
  });

  const headers = createTelemetryHeaders(upstream, usage, {
    backendRequestId,
    providerRequestId: providerRequestIdFromHeaders,
  }, timing);
  return new Response(stream, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyNonStreamingChatCompletionResponse(
  env: Env,
  ctx: ExecutionContext,
  upstream: Response,
  usage: UsageWindow,
  meta: ChatRequestMeta,
  backendRequestId: string,
  deviceId: string,
  responseStartedAt: number,
  timing: ProxyTiming,
): Promise<Response> {
  const text = await upstream.text();
  let providerRequestId = upstream.headers.get("x-request-id")?.trim() || null;
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let totalTokens: number | null = null;
  let outputChars = 0;

  try {
    const payload = JSON.parse(text) as Record<string, unknown> & {
      id?: unknown;
      x_groq?: { id?: unknown };
      usage?: unknown;
    };
    if (typeof payload.id === "string" && payload.id.trim()) {
      providerRequestId = payload.id.trim();
    }
    if (payload.x_groq && typeof payload.x_groq === "object" && typeof payload.x_groq.id === "string" && payload.x_groq.id.trim()) {
      providerRequestId = payload.x_groq.id.trim();
    }
    const usagePayload = extractGroqUsage(payload.usage);
    promptTokens = usagePayload.promptTokens;
    completionTokens = usagePayload.completionTokens;
    totalTokens = usagePayload.totalTokens;
    sanitizeChatPayloadContent(payload, meta.context);
    outputChars = parseChatOutputCharsFromPayload(payload);
    const sanitizedText = JSON.stringify(payload);
    return finalizeNonStreamingChatCompletionResponse(
      env,
      ctx,
      upstream,
      usage,
      meta,
      backendRequestId,
      deviceId,
      responseStartedAt,
      timing,
      sanitizedText,
      providerRequestId,
      promptTokens,
      completionTokens,
      totalTokens,
      outputChars,
    );
  } catch {
    // preserve upstream body as-is
  }

  return finalizeNonStreamingChatCompletionResponse(
    env,
    ctx,
    upstream,
    usage,
    meta,
    backendRequestId,
    deviceId,
    responseStartedAt,
    timing,
    text,
    providerRequestId,
    promptTokens,
    completionTokens,
    totalTokens,
    outputChars,
  );
}

function finalizeNonStreamingChatCompletionResponse(
  env: Env,
  ctx: ExecutionContext,
  upstream: Response,
  usage: UsageWindow,
  meta: ChatRequestMeta,
  backendRequestId: string,
  deviceId: string,
  responseStartedAt: number,
  timing: ProxyTiming,
  responseText: string,
  providerRequestId: string | null,
  promptTokens: number | null,
  completionTokens: number | null,
  totalTokens: number | null,
  outputChars: number,
): Response {
  const costUsd = estimateGroqChatCostUsd(meta.model, promptTokens, completionTokens);
  const totalMs = roundTimingMs((timing.initMs ?? 0) + (performance.now() - responseStartedAt));
  ctx.waitUntil(persistRequestEvent(env.USAGE, buildRequestEvent({
    backendRequestId,
    deviceId,
    provider: "groq",
    model: meta.model,
    context: meta.context,
    status: upstream.ok ? "success" : "error",
    inputChars: meta.inputChars,
    outputChars,
    inputSeconds: null,
    outputSeconds: null,
    durationMs: totalMs,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    pricingSource: "groq-proxy-pricing",
    providerRequestId,
    usage,
    errorMessage: upstream.ok ? null : upstream.statusText,
  })));

  const headers = createTelemetryHeaders(upstream, usage, {
    backendRequestId,
    providerRequestId,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    pricingSource: "groq-proxy-pricing",
  }, {
    ...timing,
    totalMs,
  });
  return new Response(responseText, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyAudioTranscriptionResponse(
  env: Env,
  ctx: ExecutionContext,
  upstream: Response,
  usage: UsageWindow,
  model: string | null,
  audioSeconds: number,
  deviceId: string,
  timing: ProxyTiming,
): Promise<Response> {
  const backendRequestId = crypto.randomUUID();
  const responseStartedAt = performance.now();
  const text = await upstream.text();
  const providerRequestId = upstream.headers.get("x-request-id")?.trim() || null;
  const costUsd = estimateGroqTranscriptionCostUsd(model, audioSeconds);
  let outputChars = 0;
  try {
    const payload = JSON.parse(text) as { text?: unknown };
    outputChars = typeof payload.text === "string" ? payload.text.length : 0;
  } catch {
    outputChars = 0;
  }
  const totalMs = roundTimingMs((timing.initMs ?? 0) + (performance.now() - responseStartedAt));

  ctx.waitUntil(persistRequestEvent(env.USAGE, buildRequestEvent({
    backendRequestId,
    deviceId,
    provider: "groq",
    model,
    context: "voice-transcription",
    status: upstream.ok ? "success" : "error",
    inputChars: 0,
    outputChars,
    inputSeconds: audioSeconds,
    outputSeconds: null,
    durationMs: totalMs,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    costUsd,
    pricingSource: "groq-proxy-pricing",
    providerRequestId,
    usage,
    errorMessage: upstream.ok ? null : upstream.statusText,
  })));

  const headers = createTelemetryHeaders(upstream, usage, {
    backendRequestId,
    providerRequestId,
    costUsd,
    pricingSource: "groq-proxy-pricing",
  }, {
    ...timing,
    totalMs,
  });
  return new Response(text, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function validateGoogleOAuthConfig(env: Env): string | null {
  if (!env.GOOGLE_CLOUD_CLIENT_ID?.trim()) {
    return "GOOGLE_CLOUD_CLIENT_ID is not configured in the Worker.";
  }
  if (!env.GOOGLE_CLOUD_CLIENT_SECRET?.trim()) {
    return "GOOGLE_CLOUD_CLIENT_SECRET is not configured in the Worker.";
  }
  return null;
}

function desktopLoginStateKey(state: string): string {
  return `auth:desktop:state:${state}`;
}

function desktopLoginHandoffKey(handoffId: string): string {
  return `auth:desktop:handoff:${handoffId}`;
}

function authStateKey(state: string): string {
  return `auth:google:state:${state}`;
}

function authResultKey(state: string): string {
  return `auth:google:result:${state}`;
}

async function readDesktopLoginState(env: Env, state: string): Promise<DesktopLoginState | null> {
  const raw = await env.USAGE.get(desktopLoginStateKey(state));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DesktopLoginState;
    return parsed?.state === state ? parsed : null;
  } catch {
    return null;
  }
}

async function readDesktopLoginStateByHandoff(env: Env, handoffId: string): Promise<DesktopLoginState | null> {
  const state = await env.USAGE.get(desktopLoginHandoffKey(handoffId));
  if (!state) return null;
  const parsed = await readDesktopLoginState(env, state);
  return parsed?.handoffId === handoffId ? parsed : null;
}

async function readGoogleAuthState(env: Env, state: string): Promise<GoogleAuthState | null> {
  const raw = await env.USAGE.get(authStateKey(state));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GoogleAuthState;
  } catch {
    return null;
  }
}

async function storeGoogleAuthResult(env: Env, state: string, result: GoogleAuthResult): Promise<void> {
  await env.USAGE.put(authResultKey(state), JSON.stringify(result, null, 2), {
    expirationTtl: AUTH_RESULT_TTL_SECONDS,
  });
}

function normalizeReturnTo(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if ((url.protocol === "http:" || url.protocol === "https:") && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return url.toString();
    }
    if (url.protocol === "assistant:" || url.protocol === "fixvox:") {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function buildCallbackUrl(request: Request, env: Env): string {
  const publicBaseUrl = (env.AUTH_PUBLIC_BASE_URL ?? "").trim();
  const url = new URL(publicBaseUrl || request.url);
  url.pathname = "/callback";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isValidCodeVerifier(value: string): boolean {
  return value.length >= 43 && value.length <= 128;
}

function generateOAuthCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

async function createPkceChallenge(codeVerifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function exchangeGoogleCode(
  env: Env,
  request: Request,
  code: string,
  codeVerifier: string,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams();
  body.set("client_id", env.GOOGLE_CLOUD_CLIENT_ID);
  body.set("client_secret", env.GOOGLE_CLOUD_CLIENT_SECRET);
  body.set("code", code);
  body.set("code_verifier", codeVerifier);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", buildCallbackUrl(request, env));

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const payload = await response.json() as Record<string, unknown> & {
    error?: string;
    error_description?: string;
    access_token?: string;
  };

  if (!response.ok || !payload.access_token) {
    const description = typeof payload.error_description === "string" ? payload.error_description : "";
    const error = typeof payload.error === "string" ? payload.error : "google_token_exchange_failed";
    throw new Error(description || error);
  }

  return payload;
}

async function fetchGoogleProfile(accessToken: unknown): Promise<Record<string, unknown> | null> {
  if (typeof accessToken !== "string" || !accessToken.trim()) return null;

  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return null;
  }
  return await response.json() as Record<string, unknown>;
}

function finalizeOAuthResponse(
  returnTo: string | null,
  state: string,
  status: "success" | "error",
  error: string | null,
  message: string,
): Response {
  const target = buildReturnToUrl(returnTo, state, status, error);
  if (target && (target.startsWith("http://") || target.startsWith("https://"))) {
    return Response.redirect(target, 302);
  }
  if (target) {
    return renderOAuthRedirectPage(target, status === "success" ? "Fixvox login complete" : "Fixvox login failed", message);
  }
  return renderOAuthPage(status === "success" ? "Fixvox login complete" : "Fixvox login failed", message, status === "success", state);
}

function buildReturnToUrl(
  returnTo: string | null,
  state: string,
  status: "success" | "error",
  error: string | null,
): string | null {
  if (!returnTo) return null;
  const separator = returnTo.includes("?") ? "&" : "?";
  const parts = [
    `state=${encodeURIComponent(state)}`,
    `status=${encodeURIComponent(status)}`,
  ];
  if (error) {
    parts.push(`error=${encodeURIComponent(error)}`);
  }
  return `${returnTo}${separator}${parts.join("&")}`;
}

function redactIdentifier(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length <= 8) return `${trimmed.slice(0, 1)}…${trimmed.slice(-1)}`;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

function redactEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!name || !domain) return redactIdentifier(value) ?? "Google account";
  return `${name.slice(0, 1)}…@${domain}`;
}

function redactGoogleProfile(profile: Record<string, unknown> | null): string {
  const email = typeof profile?.email === "string" ? profile.email.trim() : "";
  if (email) return redactEmail(email);
  const sub = typeof profile?.sub === "string" ? profile.sub.trim() : "";
  return redactIdentifier(sub) ?? "Google account";
}

function buildGoogleAccountId(profile: Record<string, unknown> | null): string | null {
  const sub = typeof profile?.sub === "string" ? profile.sub.trim() : "";
  if (sub) return `google:${sub}`;
  const email = typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : "";
  if (email) return `google:${email}`;
  return null;
}

function renderDesktopLoginPage(handoffId: string, expiresAt: string): Response {
  const googleStartPath = `/desktop/google/start?handoff=${encodeURIComponent(handoffId)}`;
  const body = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fixvox Cloud desktop login</title>
    <style>
      body { font-family: Segoe UI, sans-serif; background: #08111f; color: #e2e8f0; margin: 0; min-height: 100vh; display: grid; place-items: center; }
      main { width: min(620px, 92vw); background: #111827; border: 1px solid #243244; border-radius: 20px; padding: 30px; box-shadow: 0 18px 44px rgba(0,0,0,0.38); }
      h1 { margin: 14px 0 10px; font-size: 30px; }
      p { line-height: 1.55; color: #cbd5e1; }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #2563eb; color: white; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
      .card { margin-top: 18px; padding: 16px; border-radius: 14px; background: #0b1220; border: 1px solid #1f2937; }
      .actions { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 12px; }
      .button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border-radius: 12px; background: #f8fafc; color: #0f172a; text-decoration: none; font-weight: 800; }
      .button.secondary { background: transparent; color: #cbd5e1; border: 1px solid #334155; }
      strong { color: #f8fafc; }
      code { background: #050b14; border: 1px solid #1f2937; border-radius: 6px; padding: 2px 6px; }
    </style>
  </head>
  <body>
    <main>
      <div class="badge">Desktop login</div>
      <h1>Fixvox Cloud sign-in is ready</h1>
      <p>Your Fixvox desktop app opened this page with a host-owned device-code session. The desktop app keeps session secrets out of React and only tracks redacted status.</p>
      <div class="card">
        <p><strong>Status:</strong> browser handoff received.</p>
        <p><strong>Flow:</strong> <code>device-code</code></p>
        <p><strong>Expires:</strong> ${escapeHtml(expiresAt)}</p>
      </div>
      <div class="actions">
        <a class="button" href="${escapeHtml(googleStartPath)}">Continue with Google</a>
        <a class="button secondary" href="/health">Cancel</a>
      </div>
      <p>After Google finishes, return to Fixvox. The desktop app will keep polling this device-code session without exposing tokens to React.</p>
    </main>
  </body>
</html>`;
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderOAuthPage(title: string, message: string, success: boolean, state?: string): Response {
  const accent = success ? "#1f9d55" : "#c2410c";
  const stateHtml = state ? `<p><strong>State:</strong> <code>${escapeHtml(redactIdentifier(state) ?? "redacted")}</code></p>` : "";
  const body = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Segoe UI, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; min-height: 100vh; display: grid; place-items: center; }
      main { width: min(560px, 92vw); background: #111827; border: 1px solid #1f2937; border-radius: 18px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
      h1 { margin-top: 0; font-size: 28px; }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: ${accent}; color: white; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
      p { line-height: 1.5; }
      code { background: #0b1220; border: 1px solid #1f2937; border-radius: 6px; padding: 2px 6px; }
    </style>
  </head>
  <body>
    <main>
      <div class="badge">${success ? "Success" : "Error"}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${stateHtml}
      <p>You can close this window and return to Fixvox.</p>
    </main>
  </body>
</html>`;
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderOAuthRedirectPage(target: string, title: string, message: string): Response {
  const body = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${escapeHtml(target)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <p>${escapeHtml(message)}</p>
    <p><a href="${escapeHtml(target)}">Continue</a></p>
    <script>window.location.replace(${JSON.stringify(target)});</script>
  </body>
</html>`;
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
