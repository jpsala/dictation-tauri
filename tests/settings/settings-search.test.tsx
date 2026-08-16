import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  groupSettingsSearchResults,
  highlightSettingsSearch,
  moveSettingsSearchIndex,
  rankSettingsSearch,
  reduceSettingsSearchEscape,
} from "../../src/settings/shared/SettingsSearch";
import { settingsSearchIndex } from "../../src/settings/settings-registry";

describe("Settings search", () => {
  it("ranks labels before keyword-only matches and keeps registry order for ties", () => {
    const results = rankSettingsSearch("dock");
    expect(results[0]).toMatchObject({ id: "application-dock", label: "Dock" });
    expect(results.every((target) => target.sectionLabel.length > 0)).toBe(true);
    expect(new Set(results.map((target) => target.targetId)).size).toBe(results.length);
  });

  it("matches diacritics without changing the registered labels", () => {
    expect(rankSettingsSearch("accion")[0]?.label).toBe("Acciones de texto");
    expect(rankSettingsSearch("diagnostico")[0]?.label).toBe("Diagnóstico");
    expect(settingsSearchIndex.find((target) => target.id === "actions-list")?.label).toBe("Acciones de texto");
  });
  it("groups ranked results by their owning section", () => {
    const candidates = [
      settingsSearchIndex.find((target) => target.id === "actions-list")!,
      settingsSearchIndex.find((target) => target.id === "dictation-listening")!,
      settingsSearchIndex.find((target) => target.id === "application-dock")!,
    ];
    const groups = groupSettingsSearchResults(rankSettingsSearch("o", candidates));
    expect(groups.map((group) => group.sectionId)).toEqual(["actions", "application", "dictation"]);
    expect(groups.every((group) => group.results.every((target) => target.sectionId === group.sectionId))).toBe(true);
  });

  it("highlights text as safe React nodes and exposes optional current values", () => {
    const target = { ...settingsSearchIndex[0], valueSummary: "Cuenta conectada" };
    const markup = renderToStaticMarkup(<>{highlightSettingsSearch("Acción <segura>", "accion")}</>);
    expect(markup).toContain("<mark>Acción</mark>");
    expect(markup).toContain("&lt;segura&gt;");
    expect(target.valueSummary).toBe("Cuenta conectada");
  });

  it("keeps keyboard transitions deterministic, including two-stage Escape", () => {
    expect(moveSettingsSearchIndex(-1, 1, 3)).toBe(0);
    expect(moveSettingsSearchIndex(-1, -1, 3)).toBe(2);
    expect(moveSettingsSearchIndex(2, 1, 3)).toBe(0);
    const firstEscape = reduceSettingsSearchEscape({ query: "acción", activeIndex: 1, dismissed: false });
    expect(firstEscape).toEqual({ query: "acción", activeIndex: -1, dismissed: true });
    expect(reduceSettingsSearchEscape(firstEscape)).toEqual({ query: "", activeIndex: -1, dismissed: false });
  });
});
