import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("effective runtime plan ownership", () => {
  it("does not let React hardcode Fixvox postprocess policy for real dictation", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(appSource).not.toContain("DEFAULT_V2_VOICE_POST_PROCESS_PROMPT");
    expect(appSource).not.toContain("pro-post-process");
    expect(appSource).not.toContain("fixvoxManagedPostProcessPolicy");
  });
});
