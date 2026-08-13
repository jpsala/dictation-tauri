import { MANAGED_POSTPROCESS_SAFETY_PROMPT } from "../../fixvox-core/src/control-plane/evaluation-recipes";

export type ProviderRequest = {
  kind: "chat" | "audio";
  request: Request;
  signal: AbortSignal;
  /** Resolved server-side from the active device profile; never from client JSON. */
  policy: { profileId: string; capability: string; engine: Record<string, unknown> };
};

export interface ProviderProxy {
  proxy(input: ProviderRequest): Promise<Response>;
}

type ProviderTarget = { url: URL; apiKey: string; model: string };
type ProviderKeys = Readonly<Record<"groq" | "openrouter", string | undefined>>;
function providerUrl(value: string): URL { try { return new URL(value); } catch (cause) { throw new Error("provider_url_invalid", { cause }); } }

const MANAGED_TRANSCRIPTION_PROMPT = [
  "Transcribí en español rioplatense.",
  "Puede incluir términos técnicos, comandos y nombres de modelos.",
  "Conservá exactamente comandos, paquetes, modelos, archivos, URLs, emails, números, guiones, puntos y mayúsculas cuando formen parte del término.",
  "Si el hablante dice palabras de puntuación o lista como punto y aparte, coma, dos puntos, primero, segundo o tercero, transcribilas literalmente para que otro paso las formatee.",
  "Devolvé solo la transcripción final.",
].join(" ");


function policyPrompt(policy: ProviderRequest["policy"]): string {
  const value = policy.engine.prompt;
  return typeof value === "string" ? value.trim() : "";
}

function applyServerOwnedChatPrompt(payload: Record<string, unknown>, policy: ProviderRequest["policy"]): void {
  if (policy.capability === "assistant") return;
  const prompt = policyPrompt(policy);
  if (!prompt && policy.capability !== "postprocess") return;
  const content = policy.capability === "postprocess"
    ? [MANAGED_POSTPROCESS_SAFETY_PROMPT, prompt].filter(Boolean).join("\n\n")
    : prompt;
  const messages = Array.isArray(payload.messages) ? [...payload.messages] : [];
  const system = { role: "system", content };
  if (messages[0] && typeof messages[0] === "object" && (messages[0] as Record<string, unknown>).role === "system") messages[0] = system;
  else messages.unshift(system);
  payload.messages = messages;
}

/** Test-only provider: it never contacts a network and never retains request content. */
export function createMockProviderProxy(): ProviderProxy {
  return {
    async proxy({ kind }) {
      if (kind === "audio") return Response.json({ text: "fixture provider transcription" });
      return Response.json({
        id: "fixture-provider-chat", object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "fixture provider response" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      });
    },
  };
}

/** Real provider boundary. Target selection comes from effective profile policy, never client payload. */
export function createHttpProviderProxy(resolveTarget: (input: Pick<ProviderRequest, "kind" | "policy">) => ProviderTarget, fetchImplementation: typeof fetch = fetch): ProviderProxy {
  return {
    async proxy({ kind, request, signal, policy }) {
      const target = resolveTarget({ kind, policy });
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${target.apiKey}`);
      headers.delete("host");
      headers.delete("x-device-id");
      headers.delete("content-length");
      let body: BodyInit | null = request.body;
      if (kind === "chat") {
        let payload: unknown;
        try { payload = await request.json(); } catch { throw new Error("provider_request_invalid"); }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("provider_request_invalid");
        const upstream = { ...payload as Record<string, unknown>, model: target.model };
        applyServerOwnedChatPrompt(upstream, policy);
        body = JSON.stringify(upstream);
        headers.set("content-type", "application/json");
      } else {
        let source: FormData;
        try { source = await request.formData(); } catch { throw new Error("provider_request_invalid"); }
        const audio = source.get("audio") ?? source.get("file");
        if (!(audio instanceof Blob) || !audio.type.toLowerCase().startsWith("audio/")) throw new Error("provider_request_invalid");
        const metadataPart = source.get("metadata");
        let language: string | undefined;
        let evaluationRecipe: Record<string, unknown> | undefined;
        if (typeof metadataPart === "string") {
          try {
            const metadata = JSON.parse(metadataPart) as unknown;
            if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
              const candidate = (metadata as Record<string, unknown>).language;
              if (typeof candidate === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(candidate.trim())) language = candidate.trim();
              const recipe = (metadata as Record<string, unknown>).evaluationRecipe;
              if (recipe && typeof recipe === "object" && !Array.isArray(recipe)) {
                evaluationRecipe = recipe as Record<string, unknown>;
              }
            }
          } catch { throw new Error("provider_request_invalid"); }
        } else {
          const candidate = source.get("language");
          if (typeof candidate === "string" && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(candidate.trim())) language = candidate.trim();
        }
        const upstream = new FormData();
        const filename = audio instanceof File && audio.name.trim() ? audio.name.trim() : "audio.wav";
        upstream.set("file", audio, filename);
        const evaluationModel = evaluationRecipe?.model;
        upstream.set(
          "model",
          typeof evaluationModel === "string" && evaluationModel.trim()
            ? evaluationModel.trim()
            : target.model,
        );
        if (language) upstream.set("language", language);
        const evaluationPrompt = evaluationRecipe?.prompt;
        const prompt =
          typeof evaluationPrompt === "string" && evaluationPrompt.trim()
            ? evaluationPrompt.trim()
            : policyPrompt(policy) || MANAGED_TRANSCRIPTION_PROMPT;
        upstream.set("prompt", prompt);
        upstream.set("response_format", "verbose_json");
        upstream.append("timestamp_granularities[]", "word");
        upstream.append("timestamp_granularities[]", "segment");
        upstream.set("temperature", "0");
        body = upstream;
        headers.delete("content-type");
      }
      return await fetchImplementation(target.url, { method: "POST", headers, body, signal });
    },
  };
}

/** Local/VPS composition for supported real chat providers. No retries or traffic mirroring. */
export function createConfiguredProviderProxy(keys: ProviderKeys, fetchImplementation: typeof fetch = fetch): ProviderProxy {
  if (!keys.groq && !keys.openrouter) throw new Error("provider_api_key_missing");
  return createHttpProviderProxy(({ kind, policy }) => {
    const provider = String(policy.engine.provider ?? "").trim().toLowerCase();
    const model = String(policy.engine.model ?? "").trim();
    if (!model) throw new Error("provider_model_missing");
    if (provider === "groq" && keys.groq) {
      const path = kind === "audio" ? "audio/transcriptions" : "chat/completions";
      return { url: providerUrl(`https://api.groq.com/openai/v1/${path}`), apiKey: keys.groq, model };
    }
    if (kind === "chat" && provider === "openrouter" && keys.openrouter) return { url: providerUrl("https://openrouter.ai/api/v1/chat/completions"), apiKey: keys.openrouter, model };
    throw new Error("provider_not_configured");
  }, fetchImplementation);
}

/** Bounds response streams without materializing their contents in application memory. */
export function limitResponseBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): ReadableStream<Uint8Array> | null {
  if (!body) return null;
  let received = 0;
  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > maxBytes) { controller.error(new Error("provider_response_too_large")); return; }
      controller.enqueue(chunk);
    },
  }));
}
