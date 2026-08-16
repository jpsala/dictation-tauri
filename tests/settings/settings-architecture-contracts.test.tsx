import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  parseSettingsDeepLink,
  serializeSettingsDeepLink,
  settingsRegistry,
  settingsSearchIndex,
} from "../../src/settings/settings-registry";
import { SettingsPage } from "../../src/settings/shared/SettingsPage";
import { SettingsGroup } from "../../src/settings/shared/SettingsGroup";
import { SettingRow } from "../../src/settings/shared/SettingRow";
import { getPersistenceMessage, SettingNotice } from "../../src/settings/shared/SettingNotice";
import {
  createEffectiveSettingsSnapshot,
  formatEffectiveSettingsDiagnostic,
} from "../../src/settings/effective-settings";

const expectedSections = [
  "account",
  "dictation",
  "hotkeys",
  "actions",
  "vocabulary",
  "application",
  "privacy",
  "help",
  "advanced",
];

describe("Settings architecture contracts", () => {
  it("keeps one ordered registry with primary and utility navigation", () => {
    expect(settingsRegistry.map((section) => section.id)).toEqual(expectedSections);
    expect(settingsRegistry.filter((section) => section.group === "utility").map((section) => section.id)).toEqual([
      "privacy",
      "help",
      "advanced",
    ]);
    expect(settingsSearchIndex.every((target) => expectedSections.includes(target.sectionId))).toBe(true);
    expect(new Set(settingsSearchIndex.map((target) => target.targetId)).size).toBe(settingsSearchIndex.length);
  });

  it("keeps final labels, boundary summaries, and search aliases without duplicate targets", () => {
    expect(settingsRegistry.find((section) => section.id === "actions")?.label).toBe("Acciones de texto");
    expect(settingsRegistry.find((section) => section.id === "vocabulary")?.label).toBe("Vocabulario y correcciones");
    expect(settingsRegistry.every((section) => section.summary.endsWith(".") && section.summary.split(".").length === 2)).toBe(true);
    expect(settingsRegistry.every((section) => section.summary.includes("pero"))).toBe(true);
    expect(settingsSearchIndex.every((target) => target.sectionLabel.length > 0)).toBe(true);
    expect(new Set(settingsSearchIndex.map((target) => target.id)).size).toBe(settingsSearchIndex.length);
  });

  it("accepts only registered section and target deep-link pairs", () => {
    const target = settingsSearchIndex.find((item) => item.targetId === "settings-application-dock");
    expect(target).toBeDefined();
    const hash = serializeSettingsDeepLink(target);
    expect(hash).toBe("#settings?section=application&target=settings-application-dock");
    expect(parseSettingsDeepLink(hash)?.target).toEqual(target);
    expect(parseSettingsDeepLink("#settings")).toEqual({});
    expect(parseSettingsDeepLink("#settings?section=dictation&target=settings-application-dock")).toBeUndefined();
    expect(parseSettingsDeepLink("#settings?section=unknown&target=settings-application-dock")).toBeUndefined();
    expect(parseSettingsDeepLink("#settings?section=application")).toBeUndefined();
    expect(serializeSettingsDeepLink({ ...target!, targetId: "unknown" })).toBe("#settings");
  });

  it("omits unproven metadata and announces unavailable reasons", () => {
    const plain = renderToStaticMarkup(
      <SettingRow label="Sin autoridad"><input aria-label="Sin autoridad" /></SettingRow>,
    );
    expect(plain).not.toContain("Procedencia:");
    expect(plain).not.toContain("Origen no disponible");

    const disabled = renderToStaticMarkup(
      <SettingRow
        label="Preferencia local"
        provenance={{ source: "local", scope: "device", effect: "immediate" }}
        availability={{ state: "disabled", reason: "La aplicación de escritorio no está disponible." }}
      >
        <input disabled aria-label="Preferencia local" />
      </SettingRow>,
    );
    expect(disabled).toContain("Configuración local");
    expect(disabled).toContain("Esta computadora");
    expect(disabled).toContain("Se aplica de inmediato");
    expect(disabled).toContain("No disponible: La aplicación de escritorio no está disponible.");
    expect(disabled).toContain('aria-disabled="true"');
  });

  it("uses one exact persistence vocabulary", () => {
    expect(getPersistenceMessage({ status: "saving", target: "dock", scope: "device" })).toBe("Guardando…");
    expect(getPersistenceMessage({ status: "saved", target: "dock", scope: "device" })).toBe("Guardado en esta computadora");
    expect(getPersistenceMessage({ status: "dirty", count: 2 })).toBe("2 cambios sin guardar");
    expect(getPersistenceMessage({ status: "error", message: "No pudimos guardar el cambio.", rolledBack: true }))
      .toBe("No pudimos guardar el cambio. Restauramos el valor anterior.");
  });

  it("formats only redacted effective state and preserves honest absence", () => {
    const snapshot = createEffectiveSettingsSnapshot({
      account: [{ label: "Perfil", value: "No disponible", state: "unavailable" }],
      dictation: [{
        label: "Modo",
        value: "Rápido",
        state: "configured",
        provenance: { source: "local", scope: "device", effect: "next-dictation" },
      }],
      application: [
        { label: "sessionPath", value: "C:/private/session.json", state: "configured" },
        { label: "providerDetails", value: "provider-token-123", state: "configured" },
        { label: "transcriptAudio", value: "final transcript and audio", state: "configured" },
      ],
    });
    const diagnostic = formatEffectiveSettingsDiagnostic(snapshot);
    expect(diagnostic).toContain("Perfil: No disponible (No disponible; Origen no disponible)");
    expect(diagnostic).toContain("Modo: Rápido");
    expect(diagnostic).toContain("Configuración local · Esta computadora · Se aplica en el próximo dictado");
    expect(diagnostic).toContain("sessionPath: [redactado]");
    expect(diagnostic).toContain("providerDetails: [redactado]");
    expect(diagnostic).toContain("transcriptAudio: [redactado]");
    expect(diagnostic).not.toContain("provider-token-123");
    expect(diagnostic).not.toContain("final transcript and audio");
    expect(diagnostic).not.toMatch(/token|payload|https?:\/\//i);
  });

  it("renders flat page, group, row and notice semantics", () => {
    const html = renderToStaticMarkup(
      <SettingsPage title="Dictado" summary="Modo, escucha y entrega.">
        <SettingsGroup id="settings-dictation-mode" title="Modo">
          <SettingRow label="Rápido" description="Transcripción literal.">
            <input type="radio" aria-label="Rápido" />
          </SettingRow>
          <SettingNotice tone="warning">Un override temporal reemplaza este modo.</SettingNotice>
        </SettingsGroup>
      </SettingsPage>,
    );

    expect(html).toContain('aria-labelledby="settings-page-title"');
    expect(html).toContain('id="settings-dictation-mode"');
    expect(html).toContain('data-layout="inline"');
    expect(html).toContain('data-tone="warning"');
    expect(html).not.toContain("settings-panel");
  });
});
