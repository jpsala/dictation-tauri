import { describe, expect, it } from "vitest";
import {
  checkFixvoxCapability,
  fixvoxPolicyTemplates,
  fixvoxProductCapabilities,
  getFixvoxPolicyTemplate,
  serializeFixvoxPolicyTemplate,
} from "../../src/fixvox-auth/policy-groups";

describe("Fixvox auth policy groups", () => {
  it("defines stable product capabilities for cloud-managed groups", () => {
    expect(fixvoxProductCapabilities).toEqual([
      "translate",
      "dictation",
      "postprocess",
      "selection_transform",
      "assistant_actions",
      "custom_prompts",
      "advanced_settings",
      "debug_tools",
      "managed_stt",
      "managed_llm",
    ]);
  });

  it("keeps anonymous basic limited and signed-in templates progressively stronger", () => {
    const anonymous = getFixvoxPolicyTemplate("basic-anonymous");
    const translateOnly = getFixvoxPolicyTemplate("translate-only");
    const pro = getFixvoxPolicyTemplate("pro");
    const power = getFixvoxPolicyTemplate("power-admin");

    expect(anonymous.accessMode).toBe("anonymous");
    expect(anonymous.capabilities.has("dictation")).toBe(false);
    expect(anonymous.capabilities.has("managed_stt")).toBe(false);

    expect(translateOnly.accessMode).toBe("signed_in");
    expect(translateOnly.capabilities.has("translate")).toBe(true);
    expect(translateOnly.capabilities.has("dictation")).toBe(false);

    expect(pro.capabilities.has("assistant_actions")).toBe(true);
    expect(pro.capabilities.has("debug_tools")).toBe(false);

    expect(power.capabilities.size).toBe(fixvoxProductCapabilities.length);
  });

  it("fails closed when a runtime operation requires a missing capability", () => {
    expect(checkFixvoxCapability(fixvoxPolicyTemplates["translate-only"], "dictation"))
      .toEqual({
        allowed: false,
        required: ["dictation", "managed_stt"],
        missing: ["dictation", "managed_stt"],
        error: "capability_not_allowed",
      });

    expect(checkFixvoxCapability(fixvoxPolicyTemplates["dictation-basic"], "dictation"))
      .toEqual({
        allowed: true,
        required: ["dictation", "managed_stt"],
      });

    expect(checkFixvoxCapability(fixvoxPolicyTemplates["dictation-basic"], "assistant_action"))
      .toMatchObject({
        allowed: false,
        missing: ["assistant_actions"],
      });
  });

  it("serializes templates without leaking tokens, ids, audio, or transcript fields", () => {
    const serialized = serializeFixvoxPolicyTemplate(getFixvoxPolicyTemplate("pro"));
    const payload = JSON.stringify(serialized);

    expect(serialized).toMatchObject({
      id: "pro",
      label: "Pro",
      accessMode: "signed_in",
    });
    expect(serialized.capabilities).toContain("dictation");
    expect(payload).not.toContain("token");
    expect(payload).not.toContain("deviceId");
    expect(payload).not.toContain("transcript");
    expect(payload).not.toContain("audio");
  });
});
