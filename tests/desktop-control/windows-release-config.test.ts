// @ts-expect-error Vitest executes this Node-only assertion outside the app tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
};

type TauriConfig = {
  productName?: string;
  identifier?: string;
  app?: {
    security?: {
      csp?: string | Record<string, string> | null;
      devCsp?: string | Record<string, string> | null;
    };
  };
  bundle?: {
    active?: boolean;
    targets?: string | string[];
    publisher?: string;
    icon?: string[];
    windows?: {
      nsis?: {
        installMode?: string;
        installerIcon?: string;
        displayLanguageSelector?: boolean;
      };
    };
  };
};

describe("Fixvox Tauri Windows release bootstrap", () => {
  it("declares a separate Fixvox Tauri NSIS bundle channel", () => {
    const config = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as TauriConfig;

    expect(config.productName).toBe("Fixvox Tauri");
    expect(config.identifier).toBe("dev.jpsala.fixvox-tauri");
    expect(config.bundle).toMatchObject({
      active: true,
      targets: ["nsis"],
      publisher: "JP Sala",
      icon: ["icons/icon.ico"],
    });
    expect(config.bundle?.windows?.nsis).toMatchObject({
      installMode: "currentUser",
      installerIcon: "icons/icon.ico",
      displayLanguageSelector: false,
    });
  });

  it("enforces a restrictive production CSP without renderer cloud access", () => {
    const config = JSON.parse(
      readFileSync("src-tauri/tauri.conf.json", "utf8"),
    ) as TauriConfig;
    const csp = JSON.stringify(config.app?.security?.csp ?? null);

    expect(config.app?.security?.csp).not.toBeNull();
    expect(csp).toContain("default-src");
    expect(csp).toContain("object-src");
    expect(csp).toContain("'none'");
    expect(csp).toContain("ipc:");
    expect(csp).not.toContain("*.jpsala.dev");
    expect(csp).not.toContain("https:");
  });

  it("exposes a local-only release script that builds NSIS without publishing", () => {
    const packageJson = JSON.parse(
      readFileSync("package.json", "utf8"),
    ) as PackageJson;
    const script = packageJson.scripts?.["release:windows"] ?? "";

    expect(script).toContain("scripts/release-windows.ps1");
    expect(script).not.toMatch(/\b(gh(\.exe)?\s+release|git\s+push|npm\s+publish|wrangler\s+deploy)\b/i);

    const releaseScript = readFileSync("scripts/release-windows.ps1", "utf8");
    expect(releaseScript).toContain("--bundles nsis");
    expect(releaseScript).toContain("--ci");
    expect(releaseScript).toContain("--no-sign");
    expect(releaseScript).toContain("target/release/bundle/nsis");
    expect(releaseScript).toContain("cargo test --no-run");
    expect(releaseScript).toContain("does not publish, upload, deploy");
    expect(releaseScript).not.toMatch(/\b(gh(\.exe)?\s+release|git\s+push|npm\s+publish|wrangler\s+deploy)\b/i);
  });
});
