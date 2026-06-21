import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const artifactRoot = "artifacts/microphone-capture";
const audioRoot = `${artifactRoot}/audio`;
const transcriptRoot = `${artifactRoot}/transcripts`;
const reportRoot = `${artifactRoot}/reports`;
const preferredBackendUrl = "https://auth-fixvox.jpsala.dev";
const staleBackendUrl = "https://fixvox-api.jpsala.dev";
const defaultPostprocessPrompt =
  "Clean Spanish/bilingual dictation with minimal edits. Preserve wording, language mix, technical tokens, and intent. Return only the cleaned transcript.";

type DeviceState = {
  installId: string;
  deviceId?: string;
  lastRegisterOk: boolean;
  lastRegisterErrorCode?: string;
  lastRegisterErrorMessage?: string;
  policyId?: string;
  policyLabel?: string;
  transportPolicy?: unknown;
};

type RegisterResponse = {
  ok: boolean;
  deviceId: string;
  policyId: string;
  policyLabel: string;
  transportPolicy?: unknown;
};

function requireApproval(): void {
  if (!process.argv.includes("--allow-provider-call")) {
    throw new Error(
      "Fixvox managed smoke calls real cloud/provider paths. Re-run with --allow-provider-call after explicit approval.",
    );
  }
}

async function main() {
  requireApproval();

  const audioPath = readArg("--audio") ?? (await requireLatestAudioArtifact());
  const runId = `fixvox-managed-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const backendBaseUrl = resolveBackendBaseUrl();
  const statePath = resolveDeviceStatePath();
  const state = await ensureRegisteredDevice({ backendBaseUrl, statePath });
  const model =
    envValue("FIXVOX_STT_MODEL") ??
    envValue("GROQ_STT_MODEL") ??
    envValue("GROQ-STT-MODEL") ??
    envValue("FIXVOX_SPEECH_MODEL_OVERRIDE") ??
    "whisper-large-v3";
  const postprocessModel =
    envValue("FIXVOX_POSTPROCESS_MODEL") ??
    envValue("FIXVOX_LLM_POST_PROCESS_MODEL_OVERRIDE") ??
    "openai/gpt-oss-120b";
  const postprocessPrompt = readPostprocessPrompt();
  const language = envValue("FIXVOX_STT_LANGUAGE") ?? envValue("GROQ_STT_LANGUAGE");

  const preflight = await callPreflight({ backendBaseUrl, state, usageKind: "transcription" });
  if (!preflight.ok) {
    const reportPath = await writeEvidence({
      runId,
      ok: false,
      status: "preflight-denied",
      backendBaseUrl,
      state,
      statePath,
      audioPath,
      model,
      error: {
        code: preflight.code ?? "FIXVOX_PREFLIGHT_DENIED",
        message: "Fixvox managed preflight denied transcription before provider execution.",
        redacted: true,
      },
    });
    console.log(
      JSON.stringify(
        {
          ok: false,
          status: "preflight-denied",
          model,
          reportPath,
          rawProviderPayloadStored: false,
          redacted: true,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const started = performance.now();
  const form = new FormData();
  form.append(
    "file",
    new Blob([await Bun.file(audioPath).arrayBuffer()], { type: "audio/wav" }),
    basename(audioPath),
  );
  form.append("model", model);
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);

  const response = await fetch(`${backendBaseUrl}/v1/audio/transcriptions`, {
    method: "POST",
    headers: {
      "X-Device-Id": state.deviceId,
    },
    body: form,
  });
  const latencyMs = Math.round(performance.now() - started);
  const metadata = readFixvoxMetadata(response.headers);
  const bodyText = await response.text();

  if (!response.ok) {
    const reportPath = await writeEvidence({
      runId,
      ok: false,
      status: `http-${response.status}`,
      backendBaseUrl,
      state,
      statePath,
      audioPath,
      model,
      latencyMs,
      metadata,
      error: {
        code: `FIXVOX_HTTP_${response.status}`,
        message: `Fixvox managed transcription returned HTTP ${response.status}.`,
        redacted: true,
      },
    });
    console.log(
      JSON.stringify(
        {
          ok: false,
          status: response.status,
          model,
          latencyMs,
          requestIdPresent: Boolean(metadata.fixvoxRequestId || metadata.providerRequestId),
          reportPath,
          rawProviderPayloadStored: false,
          redacted: true,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = { text: bodyText };
  }
  const transcript =
    typeof payload === "object" &&
    payload !== null &&
    "text" in payload &&
    typeof (payload as { text?: unknown }).text === "string"
      ? (payload as { text: string }).text.trim()
      : "";
  if (!transcript) {
    const reportPath = await writeEvidence({
      runId,
      ok: false,
      status: "empty",
      backendBaseUrl,
      state,
      statePath,
      audioPath,
      model,
      latencyMs,
      metadata,
      error: {
        code: "EMPTY_TRANSCRIPT",
        message: "Fixvox managed transcription returned no usable text.",
        redacted: true,
      },
    });
    console.log(JSON.stringify({ ok: false, status: "empty", model, latencyMs, reportPath }, null, 2));
    process.exit(1);
  }

  let postprocess: Awaited<ReturnType<typeof callManagedPostprocess>> | undefined;
  if (postprocessPrompt) {
    const postprocessPreflight = await callPreflight({
      backendBaseUrl,
      state,
      usageKind: "aiAction",
    });
    if (!postprocessPreflight.ok) {
      postprocess = {
        ok: false,
        status: "preflight-denied",
        model: postprocessModel,
        error: {
          code: postprocessPreflight.code ?? "FIXVOX_POSTPROCESS_PREFLIGHT_DENIED",
          message: "Fixvox managed post-process preflight denied execution.",
          redacted: true,
        },
      };
    } else {
      postprocess = await callManagedPostprocess({
        backendBaseUrl,
        state,
        transcript,
        model: postprocessModel,
        prompt: postprocessPrompt,
      });
    }
  }

  const transcriptPath = `${transcriptRoot}/${runId}.txt`;
  await mkdir(dirname(transcriptPath), { recursive: true });
  await writeFile(transcriptPath, `${transcript}\n`, "utf8");
  const processedTranscriptPath =
    postprocess?.ok === true ? `${transcriptRoot}/${runId}.postprocessed.txt` : undefined;
  if (processedTranscriptPath && postprocess?.output) {
    await writeFile(processedTranscriptPath, `${postprocess.output}\n`, "utf8");
  }
  const reportPath = await writeEvidence({
    runId,
    ok: true,
    status: "ok",
    backendBaseUrl,
    state,
    statePath,
    audioPath,
    model,
    latencyMs,
    metadata,
    transcriptLength: transcript.length,
    transcriptPath,
    postprocess,
    processedTranscriptPath,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        status: "ok",
        provider: "fixvox-cloud",
        model,
        latencyMs,
        requestIdPresent: Boolean(metadata.fixvoxRequestId || metadata.providerRequestId),
        fixvoxMetadataPresent: Object.values(metadata).some((value) => value !== undefined),
        transcriptLength: transcript.length,
        transcriptPath,
        postprocessStatus: postprocess?.status,
        postprocessModel: postprocess?.model,
        postprocessOutputLength: postprocess?.ok === true ? postprocess.output.length : undefined,
        processedTranscriptPath,
        reportPath,
        rawProviderPayloadStored: false,
        redacted: true,
      },
      null,
      2,
    ),
  );
}

async function ensureRegisteredDevice(input: {
  backendBaseUrl: string;
  statePath: string;
}): Promise<DeviceState & { registeredNow: boolean }> {
  const persisted = await readDeviceState(input.statePath);
  const installId =
    envValue("FIXVOX_INSTALL_ID") ??
    persisted?.installId ??
    `dictation-tauri-smoke-${Date.now().toString(36)}`;
  const existingDeviceId = envValue("FIXVOX_DEVICE_ID") ?? persisted?.deviceId;

  if (existingDeviceId) {
    return {
      ...(persisted ?? { installId, lastRegisterOk: true }),
      installId,
      deviceId: existingDeviceId,
      registeredNow: false,
    };
  }

  const body = {
    installId,
    deviceId: null,
    version: "0.1.0",
    platform: process.platform,
    arch: process.arch,
    hostname: "dictation-tauri-smoke",
    ts: new Date().toISOString(),
  };
  const response = await fetch(`${input.backendBaseUrl}/v2/device/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Partial<RegisterResponse>;
  if (!response.ok || !json.deviceId) {
    const state: DeviceState = {
      installId,
      lastRegisterOk: false,
      lastRegisterErrorCode: `FIXVOX_DEVICE_REGISTER_HTTP_${response.status}`,
      lastRegisterErrorMessage: "Fixvox device register failed; response body omitted.",
    };
    await writeDeviceState(input.statePath, state);
    throw new Error(`Fixvox device register failed with HTTP ${response.status}`);
  }

  const state: DeviceState & { registeredNow: boolean } = {
    installId,
    deviceId: json.deviceId,
    lastRegisterOk: json.ok === true,
    policyId: json.policyId,
    policyLabel: json.policyLabel,
    transportPolicy: json.transportPolicy,
    registeredNow: true,
  };
  await writeDeviceState(input.statePath, state);
  return state;
}

async function callPreflight(input: {
  backendBaseUrl: string;
  state: DeviceState;
  usageKind: "transcription" | "aiAction";
}) {
  const response = await fetch(`${input.backendBaseUrl}/v2/execution/preflight`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": input.state.deviceId ?? "",
    },
    body: JSON.stringify({
      mode: "managed",
      deviceId: input.state.deviceId,
      installId: input.state.installId,
      usageKind: input.usageKind,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    ok: response.ok && payload.ok !== false && payload.allowed !== false,
    code: typeof payload.code === "string" ? payload.code : undefined,
  };
}

async function callManagedPostprocess(input: {
  backendBaseUrl: string;
  state: DeviceState;
  transcript: string;
  model: string;
  prompt: string;
}): Promise<
  | {
      ok: true;
      status: "ok";
      output: string;
      model: string;
      latencyMs: number;
      metadata: Record<string, unknown>;
    }
  | {
      ok: false;
      status: string;
      model: string;
      latencyMs?: number;
      metadata?: Record<string, unknown>;
      error: unknown;
    }
> {
  const started = performance.now();
  const response = await fetch(`${input.backendBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": input.state.deviceId ?? "",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: "system", content: input.prompt },
        { role: "user", content: input.transcript },
      ],
      max_tokens: Math.max(256, Math.min(4096, Math.ceil(input.transcript.length / 2))),
      stream: false,
    }),
  });
  const latencyMs = Math.round(performance.now() - started);
  const metadata = readFixvoxMetadata(response.headers);
  const bodyText = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: `http-${response.status}`,
      model: input.model,
      latencyMs,
      metadata,
      error: {
        code: `FIXVOX_CHAT_HTTP_${response.status}`,
        message: `Fixvox managed post-processing returned HTTP ${response.status}.`,
        redacted: true,
      },
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = undefined;
  }
  const output =
    typeof body === "object" &&
    body !== null &&
    Array.isArray((body as { choices?: unknown }).choices) &&
    typeof (body as { choices: Array<{ message?: { content?: unknown } }> }).choices[0]?.message
      ?.content === "string"
      ? (body as { choices: Array<{ message: { content: string } }> }).choices[0].message.content.trim()
      : "";
  if (!output) {
    return {
      ok: false,
      status: "empty",
      model: input.model,
      latencyMs,
      metadata,
      error: {
        code: "FIXVOX_CHAT_RESPONSE_TEXT_MISSING",
        message: "Fixvox managed post-processing returned no usable text.",
        redacted: true,
      },
    };
  }

  return {
    ok: true,
    status: "ok",
    output,
    model:
      typeof body === "object" &&
      body !== null &&
      typeof (body as { model?: unknown }).model === "string"
        ? (body as { model: string }).model
        : input.model,
    latencyMs,
    metadata,
  };
}

async function writeEvidence(input: {
  runId: string;
  ok: boolean;
  status: string;
  backendBaseUrl: string;
  state: DeviceState & { registeredNow?: boolean };
  statePath: string;
  audioPath: string;
  model: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  transcriptLength?: number;
  transcriptPath?: string;
  processedTranscriptPath?: string;
  postprocess?: Awaited<ReturnType<typeof callManagedPostprocess>>;
  error?: unknown;
}) {
  const reportPath = `${reportRoot}/${input.runId}.json`;
  await mkdir(dirname(reportPath), { recursive: true });
  const report = {
    ok: input.ok,
    runId: input.runId,
    status: input.status,
    provider: "fixvox-cloud",
    model: input.model,
    backendBaseUrl: input.backendBaseUrl,
    registeredNow: input.state.registeredNow === true,
    installIdRedacted: redactIdentifier(input.state.installId),
    deviceIdRedacted: input.state.deviceId ? redactIdentifier(input.state.deviceId) : undefined,
    deviceStatePath: input.statePath,
    audioFile: basename(input.audioPath),
    latencyMs: input.latencyMs,
    requestIdPresent: Boolean(input.metadata?.fixvoxRequestId || input.metadata?.providerRequestId),
    fixvoxMetadataPresent: input.metadata
      ? Object.values(input.metadata).some((value) => value !== undefined)
      : false,
    fixvoxMetadata: input.metadata,
    transcriptLength: input.transcriptLength ?? 0,
    transcriptPath: input.transcriptPath,
    postprocess: input.postprocess
      ? {
          ok: input.postprocess.ok,
          status: input.postprocess.status,
          model: input.postprocess.model,
          latencyMs: input.postprocess.latencyMs,
          requestIdPresent: Boolean(
            input.postprocess.metadata?.fixvoxRequestId ||
              input.postprocess.metadata?.providerRequestId,
          ),
          fixvoxMetadataPresent: input.postprocess.metadata
            ? Object.values(input.postprocess.metadata).some((value) => value !== undefined)
            : false,
          fixvoxMetadata: input.postprocess.metadata,
          outputLength: input.postprocess.ok ? input.postprocess.output.length : 0,
          outputPreviewRedacted: input.postprocess.ok,
          processedTranscriptPath: input.processedTranscriptPath,
          error: input.postprocess.ok ? undefined : input.postprocess.error,
        }
      : undefined,
    error: input.error,
    rawProviderPayloadStored: false,
    transcriptTextStoredSeparately: Boolean(input.transcriptPath),
    transcriptPreviewRedacted: Boolean(input.transcriptLength),
    redacted: true,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}

function readFixvoxMetadata(headers: Headers) {
  return {
    fixvoxRequestId: redactRequestId(headers.get("x-fixvox-request-id")),
    providerRequestId: redactRequestId(headers.get("x-provider-request-id")),
    costUsd: headers.get("x-fixvox-cost-usd") ?? undefined,
    pricingSource: headers.get("x-fixvox-pricing-source") ?? undefined,
    limit: headers.get("x-fixvox-limit") ?? undefined,
    remaining: headers.get("x-fixvox-remaining") ?? undefined,
    resetAt: headers.get("x-fixvox-reset-at") ?? undefined,
    usageKey: headers.get("x-fixvox-usage-key") ? "[REDACTED]" : undefined,
    proxyParseMs: headers.get("x-fixvox-proxy-parse-ms") ?? undefined,
    proxyUsageMs: headers.get("x-fixvox-proxy-usage-ms") ?? undefined,
    proxyUpstreamMs: headers.get("x-fixvox-proxy-upstream-ms") ?? undefined,
    proxyInitMs: headers.get("x-fixvox-proxy-init-ms") ?? undefined,
    proxyTotalMs: headers.get("x-fixvox-proxy-total-ms") ?? undefined,
    serverTiming: headers.get("server-timing") ?? undefined,
  };
}

async function requireLatestAudioArtifact() {
  const names = await readdir(audioRoot);
  const entries = await Promise.all(
    names
      .filter((name) => /\.(wav|webm|m4a|mp3|ogg|flac)$/i.test(name))
      .map(async (name) => {
        const path = join(audioRoot, name).replace(/\\/g, "/");
        return { path, mtimeMs: (await stat(path)).mtimeMs };
      }),
  );
  const latest = entries.sort((left, right) => right.mtimeMs - left.mtimeMs)[0];
  if (!latest) {
    throw new Error(`Missing audio artifact under ${audioRoot}/`);
  }
  return latest.path;
}

async function readDeviceState(path: string): Promise<DeviceState | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as DeviceState;
  } catch {
    return undefined;
  }
}

async function writeDeviceState(path: string, state: DeviceState) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function resolveBackendBaseUrl() {
  const value =
    envValue("FIXVOX_BACKEND_URL") ?? envValue("FIXVOX_API_BASE_URL") ?? envValue("PROXY_BASE_URL");
  const normalized = (value ?? preferredBackendUrl).replace(/\/+$/, "");
  if (normalized === staleBackendUrl) {
    throw new Error("Configured Fixvox backend URL is stale; use auth/proxy backend.");
  }
  return normalized;
}

function resolveDeviceStatePath() {
  const base =
    process.env.APPDATA ?? process.env.LOCALAPPDATA ?? process.env.XDG_DATA_HOME ?? process.env.HOME;
  if (!base) throw new Error("No app data directory available for Fixvox device state.");
  return join(base, "dictation-tauri", "fixvox-device-state.json");
}

function envValue(key: string) {
  const direct = process.env[key]?.trim();
  if (direct) return unquote(direct);
  for (const path of [".env", "src-tauri/.env", "../.env"]) {
    const value = readDotEnv(path, key);
    if (value) return value;
  }
  return undefined;
}

function readDotEnv(path: string, key: string) {
  try {
    const text = Bun.file(path).textSync();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 0) continue;
      if (trimmed.slice(0, index).trim() !== key) continue;
      return unquote(trimmed.slice(index + 1).trim());
    }
  } catch {
    // Missing .env files are expected in CI and clean clones.
  }
  return undefined;
}

function unquote(value: string) {
  return value.replace(/^['\"]|['\"]$/g, "").trim() || undefined;
}

function readPostprocessPrompt() {
  const explicit = readArg("--postprocess-prompt") ?? envValue("FIXVOX_POSTPROCESS_PROMPT");
  if (explicit) return explicit;
  return process.argv.includes("--postprocess") ? defaultPostprocessPrompt : undefined;
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function redactIdentifier(value: string) {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function redactRequestId(value: string | null) {
  if (!value) return undefined;
  return redactIdentifier(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
