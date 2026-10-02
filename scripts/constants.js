export const MODULE_ID = "dxcufgbs-scenario-soundtrack";

export const SETTINGS = {
  library: "library",
  state: "state",
  spotifyClientId: "spotifyClientId",
  showToPlayers: "showToPlayers",
  enabled: "enabled",
  spotifyAuth: "spotifyAuth",
  expandedFolders: "expandedFolders"
};

/** Scenarios every world starts with. Names come from the language file until the GM renames them. */
export const DEFAULT_SCENARIOS = [
  { id: "exploration", icon: "fa-solid fa-compass" },
  { id: "combat", icon: "fa-solid fa-swords" },
  { id: "boss", icon: "fa-solid fa-dragon" },
  { id: "town", icon: "fa-solid fa-city" },
  { id: "tavern", icon: "fa-solid fa-beer-mug-empty" },
  { id: "dungeon", icon: "fa-solid fa-dungeon" },
  { id: "tension", icon: "fa-solid fa-eye" },
  { id: "rest", icon: "fa-solid fa-campground" },
  { id: "victory", icon: "fa-solid fa-trophy" }
];

export const SOURCE_ICONS = {
  spotify: "fa-brands fa-spotify",
  youtube: "fa-brands fa-youtube",
  youtubeMusic: "fa-solid fa-circle-play"
};

export function localize(key, data) {
  const full = `SST.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}
