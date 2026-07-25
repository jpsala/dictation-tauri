export const dockSkinIds = ["classic-7", "compact-5", "wispr-flow"] as const;

export type DockSkinId = (typeof dockSkinIds)[number];

export type DockSkinDefinition = {
  id: DockSkinId;
  label: string;
  dotIndexes: readonly number[];
  width: number;
  height: number;
};

export const classicDockSkin: DockSkinDefinition = {
  id: "classic-7",
  label: "Classic 7",
  dotIndexes: [0, 1, 2, 3, 4, 5, 6],
  width: 164,
  height: 42,
};

export const compactDockSkin: DockSkinDefinition = {
  id: "compact-5",
  label: "Compact 5",
  dotIndexes: [0, 2, 3, 4, 6],
  width: 132,
  height: 36,
};

export const wisprFlowDockSkin: DockSkinDefinition = {
  id: "wispr-flow",
  label: "Wispr Flow",
  dotIndexes: [0, 0, 1, 2, 2, 3, 4, 4, 5, 6, 6],
  width: 98,
  height: 32,
};

export const defaultDockSkinId: DockSkinId = "compact-5";

export function normalizeDockSkinId(value: unknown): DockSkinId {
  if (value === "classic-7" || value === "wispr-flow") {
    return value;
  }
  return defaultDockSkinId;
}

export function getDockSkin(id: DockSkinId): DockSkinDefinition {
  if (id === "classic-7") {
    return classicDockSkin;
  }
  return id === "wispr-flow" ? wisprFlowDockSkin : compactDockSkin;
}
