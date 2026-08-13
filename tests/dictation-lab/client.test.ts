import { describe, expect, it } from "vitest";

import { DictationLabUnavailableError, parseProfilesResponse } from "../../src/dictation-lab/client";

describe("dictation laboratory profile responses", () => {
  it("projects server-owned version metadata into editable recipe definitions", () => {
    const response = parseProfilesResponse({
      ok: true,
      profiles: [{
        profileId: "daily-dictation",
        label: "Daily dictation",
        revision: 4,
        activePublishedVersion: 2,
        currentDraftVersion: 3,
        versions: [
          { version: 1, status: "historical", definition: { schemaVersion: 1, label: "Initial" } },
          { version: 2, status: "published", definition: { schemaVersion: 1, label: "Current", runtime: {} } },
          { version: 3, status: "draft", definition: { schemaVersion: 1, label: "Draft", runtime: {} } },
        ],
      }],
    });

    expect(response.profiles[0]).toMatchObject({
      profileId: "daily-dictation",
      revision: 4,
      published: { version: 2, status: "published", label: "Current" },
      draft: { version: 3, status: "draft", label: "Draft" },
    });
    expect(response.profiles[0]?.history.map((version) => version.version)).toEqual([1, 2]);
  });

  it("rejects responses without the canonical profiles collection", () => {
    expect(() => parseProfilesResponse({ ok: true })).toThrow(DictationLabUnavailableError);
  });
});
