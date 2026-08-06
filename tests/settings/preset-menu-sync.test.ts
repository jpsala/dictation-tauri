import { describe, expect, it } from "vitest";
import {
  createHostPresetMenuSnapshot,
  createPresetMenuCollectionAdapter,
  hostPresetMenuMaxIdChars,
  hostPresetMenuMaxItems,
  hostPresetMenuMaxNameChars,
  hostPresetMenuSyncEventName,
  normalizeHostPresetMenuSnapshot,
  syncHostPresetMenuSnapshot,
} from "../../src/settings/preset-menu-sync";

describe("host-owned preset menu snapshot", () => {
  it("projects the enabled collection with current names and stable order", () => {
    const adapter = createPresetMenuCollectionAdapter(() => [
      { id: "first", name: "Renamed first" },
      { id: "disabled", name: "Hidden", enabled: false },
      { id: "first", name: "Duplicate" },
      { id: "second", name: "Second" },
    ]);

    expect(createHostPresetMenuSnapshot(adapter, "first")).toEqual({
      schemaVersion: 1,
      presets: [
        { id: "first", name: "Renamed first" },
        { id: "second", name: "Second" },
      ],
      activePresetId: "first",
    });
  });

  it("keeps a stale active id in the renderer contract for host-side clearing", () => {
    const snapshot = createHostPresetMenuSnapshot(
      createPresetMenuCollectionAdapter(() => [{ id: "current", name: "Current" }]),
      "deleted",
    );

    expect(snapshot.activePresetId).toBe("deleted");
    expect(snapshot.presets).toEqual([{ id: "current", name: "Current" }]);
  });

  it("normalizes renderer snapshots without changing active intent", () => {
    expect(normalizeHostPresetMenuSnapshot({
      schemaVersion: 1,
      presets: [
        { id: "  current ", name: "  Current  " },
        { id: "current", name: "Duplicate" },
        { id: "", name: "ignored" },
      ],
      activePresetId: "  deleted ",
    })).toEqual({
      schemaVersion: 1,
      presets: [{ id: "current", name: "Current" }],
      activePresetId: "deleted",
    });
  });

  it("sends one host-owned sync command through the adapter boundary", async () => {
    const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
    const result = await syncHostPresetMenuSnapshot({
      adapter: createPresetMenuCollectionAdapter(() => [{ id: "current", name: "Current" }]),
      activePresetId: "current",
      invokeImpl: async (command, args) => {
        calls.push({ command, args });
        return {
          snapshot: (args?.snapshot as unknown),
          activePresetCleared: false,
        };
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("sync_host_preset_menu_snapshot");
    expect((calls[0].args?.snapshot as { activePresetId?: string }).activePresetId).toBe("current");
    expect(result?.activePresetCleared).toBe(false);
    expect(hostPresetMenuSyncEventName).toBe("desktop-control://preset-menu-sync");
  });

  it("drops oversized mixed entries while preserving a valid active item", () => {
    const tooLongId = "i".repeat(hostPresetMenuMaxIdChars + 1);
    const tooLongName = "n".repeat(hostPresetMenuMaxNameChars + 1);
    const snapshot = createHostPresetMenuSnapshot(
      createPresetMenuCollectionAdapter(() => [
        { id: "valid", name: "Valid" },
        { id: tooLongId, name: "Ignored ID" },
        { id: "too-long-name", name: tooLongName },
        { id: "recover", name: tooLongName },
        { id: "recover", name: "Recovered" },
        { id: "active", name: " Active name " },
      ]),
      "active",
    );

    expect(snapshot.activePresetId).toBe("active");
    expect(snapshot.presets).toEqual([
      { id: "valid", name: "Valid" },
      { id: "recover", name: "Recovered" },
      { id: "active", name: "Active name" },
    ]);
  });

  it("caps an excessive collection before native menu construction", () => {
    const snapshot = createHostPresetMenuSnapshot(
      createPresetMenuCollectionAdapter(() => Array.from(
        { length: hostPresetMenuMaxItems + 16 },
        (_, index) => ({ id: `preset-${index}`, name: `Preset ${index}` }),
      )),
      `preset-${hostPresetMenuMaxItems - 1}`,
    );

    expect(snapshot.presets).toHaveLength(hostPresetMenuMaxItems);
    expect(snapshot.activePresetId).toBe(`preset-${hostPresetMenuMaxItems - 1}`);
    expect(snapshot.presets.at(-1)).toEqual({
      id: `preset-${hostPresetMenuMaxItems - 1}`,
      name: `Preset ${hostPresetMenuMaxItems - 1}`,
    });
    expect(snapshot.presets.every((preset) => (
      Array.from(preset.id).length <= hostPresetMenuMaxIdChars &&
      Array.from(preset.name).length <= hostPresetMenuMaxNameChars
    ))).toBe(true);
  });
});
