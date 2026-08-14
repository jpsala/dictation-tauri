import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: () => true,
}));

import {
  createDictationLabClient,
  DictationLabUnavailableError,
  diffDefinition,
  parseProfilesResponse,
  stableDefinitionFingerprint,
} from "../../src/dictation-lab/client";

describe("dictation laboratory profile responses", () => {
  it("preserves nested server-owned version metadata outside each canonical definition", () => {
    const response = parseProfilesResponse({
      ok: true,
      profiles: [{
        profileId: "daily-dictation",
        label: "Daily dictation",
        lifecycleStatus: "published",
        revision: 4,
        activePublishedVersion: 2,
        currentDraftVersion: 3,
        published: {
          version: 2,
          status: "published",
          authorityRevision: 4,
          createdAt: "2026-08-12T00:00:00Z",
          publishedAt: "2026-08-12T01:00:00Z",
          definition: {
            schemaVersion: 1,
            label: "Current",
            access: { capabilities: [] },
            limits: {},
            userControls: {},
            defaults: { "transcript.language": "auto" },
            runtime: {
              transcription: { engineId: "stt", promptId: "prompt" },
              postprocess: {},
              selectionTransform: {},
            },
          },
        },
        draft: {
          version: 3,
          status: "draft",
          authorityRevision: 4,
          createdAt: "2026-08-13T00:00:00Z",
          publishedAt: null,
          definition: {
            schemaVersion: 1,
            label: "Draft",
            access: { capabilities: [] },
            limits: {},
            userControls: {},
            defaults: { "transcript.language": "auto" },
            runtime: { transcription: {}, postprocess: {}, selectionTransform: {} },
          },
        },
        versions: [{
          version: 1,
          status: "historical",
          authorityRevision: 2,
          createdAt: "2026-08-10T00:00:00Z",
          publishedAt: "2026-08-10T01:00:00Z",
          definition: { schemaVersion: 1, label: "Initial" },
        }],
      }],
    });

    const profile = response.profiles[0];
    expect(profile).toMatchObject({
      profileId: "daily-dictation",
      revision: 4,
      published: {
        version: 2,
        status: "published",
        authorityRevision: 4,
        definition: {
          label: "Current",
          defaults: { "transcript.language": "auto" },
          runtime: { transcription: { engineId: "stt", promptId: "prompt" } },
        },
      },
      draft: { version: 3, status: "draft", definition: { label: "Draft" } },
    });
    expect(profile?.published).not.toHaveProperty("profileId");
    expect(profile?.history.map((version) => version.version)).toEqual([1]);
  });

  it("produces stable fingerprints and typed add/remove/change diffs", () => {
    const before = {
      schemaVersion: 1,
      label: "Current",
      defaults: { "transcript.language": "auto" },
      runtime: { transcription: { engineId: "stt", promptId: "short" } },
    };
    const reordered = {
      runtime: { transcription: { promptId: "short", engineId: "stt" } },
      defaults: { "transcript.language": "auto" },
      label: "Current",
      schemaVersion: 1,
    };
    const after = {
      ...before,
      defaults: { "transcript.language": "es" },
      runtime: { transcription: { engineId: "stt-new", promptId: "short" } },
      limits: { maxTokens: 512 },
    };
    expect(diffDefinition(before, before)).toEqual([]);
    expect(stableDefinitionFingerprint(before)).toBe(stableDefinitionFingerprint(reordered));
    expect(diffDefinition(before, after)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "defaults.transcript.language", kind: "change" }),
      expect.objectContaining({ path: "runtime.transcription.engineId", kind: "change" }),
      expect.objectContaining({ path: "limits", kind: "add" }),
    ]));
  });

  it("sends profile/version metadata outside the canonical nested definition", async () => {
    const receipt = {
      ok: true,
      data: {
        profile: { key: "daily-dictation", label: "Daily dictation", publishedVersion: 4, revision: 5 },
        publication: { previousVersion: 3, resultingVersion: 4 },
        audit: { id: "audit-redacted", action: "apply", result: "success" },
        idempotentReplay: false,
      },
    };
    invokeMock.mockResolvedValueOnce(receipt);
    const definition = {
      schemaVersion: 1,
      label: "Daily dictation",
      defaults: { "transcript.language": "auto" },
      runtime: {
        transcription: { engineId: "stt-engine", promptId: "stt-prompt" },
        postprocess: { engineId: "postprocess-engine", promptId: "postprocess-prompt" },
      },
    };

    await expect(createDictationLabClient().applyProfile("daily-dictation", 4, definition, "APPLY daily-dictation REV 4")).resolves.toEqual(receipt);
    expect(invokeMock).toHaveBeenCalledWith("request_dictation_lab", {
      request: {
        kind: "applyProfile",
        profileId: "daily-dictation",
        expectedRevision: 4,
        definition,
        confirmation: {
          action: "apply",
          profileKey: "daily-dictation",
          expectedRevision: 4,
          phrase: "APPLY daily-dictation REV 4",
        },
      },
    });
    const request = invokeMock.mock.calls.at(-1)?.[1] as { request: { definition: Record<string, unknown> } };
    expect(request.request.definition).not.toHaveProperty("version");
    expect(request.request.definition).not.toHaveProperty("status");
    expect(request.request.definition).not.toHaveProperty("authorityRevision");
  });

  it("keeps the host-owned provider-free plan available while signed out", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_dictation_lab_local_plan") {
        return Promise.resolve({
          schemaVersion: 1,
          mode: "provider-free-replay",
          corpusId: "synthetic-audio-stt",
          sampleIds: ["en-clean-note", "es-short-reminder"],
          sttRecipes: ["provider-free-manifest-replay"],
          materializations: ["identity"],
          postprocessRecipes: [],
          prosodyModes: ["off"],
          vocabularyModes: ["off"],
          baselineCandidateId: null,
          sourceGateARunId: null,
        });
      }
      if (command === "list_dictation_lab_gate_sources") return Promise.resolve([]);
      return Promise.reject({ code: "SIGNED_OUT" });
    });

    const loaded = await createDictationLabClient().load();
    expect(loaded.session).toBeNull();
    expect(loaded.localReplay.mode).toBe("provider-free-replay");
    expect(loaded.resources.localReplay.status).toBe("available");
    expect(loaded.resources.catalog).toEqual({ status: "unavailable", code: "SIGNED_OUT" });
    expect(loaded.resources.grantAuthority.status).toBe("unavailable");
    expect(loaded.resources.publishCapability.status).toBe("unavailable");
  });

  it("rejects an unknown cloud role without suppressing independent local resource loading", async () => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ ok: true, role: "admin", principalKey: "redacted", recentGoogle: true });

    await expect(createDictationLabClient().load()).rejects.toMatchObject({
      code: "DICTATION_LAB_SESSION_INVALID",
    });
    expect(invokeMock).toHaveBeenCalledWith("get_dictation_lab_local_plan");
    expect(invokeMock).toHaveBeenCalledWith("list_dictation_lab_gate_sources");
  });

  it("rejects responses without the canonical profiles collection", () => {
    expect(() => parseProfilesResponse({ ok: true })).toThrow(DictationLabUnavailableError);
  });
});
