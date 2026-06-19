import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("provider-free renderer guardrails", () => {
  it("keeps App.tsx from importing provider-specific Groq runtime modules", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(appSource).not.toContain("model-gateway/groq-stt");
    expect(appSource).not.toContain("createGroqSttGateway");
    expect(appSource).not.toContain("GROQ_API_KEY");
    expect(appSource).not.toContain("GROQ-API-KEY");
    expect(appSource).not.toContain("Authorization");
  });
});
