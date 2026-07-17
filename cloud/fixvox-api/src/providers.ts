export type ProviderRequest = {
  kind: "chat" | "audio";
  request: Request;
  signal: AbortSignal;
  /** Resolved server-side from the active device profile; never from client JSON. */
  policy: { profileId: string; engine: Record<string, unknown> };
};

export interface ProviderProxy {
  proxy(input: ProviderRequest): Promise<Response>;
}

type ProviderTarget = { url: URL; apiKey: string };

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
      return await fetchImplementation(target.url, { method: "POST", headers, body: request.body, signal });
    },
  };
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
