/**
 * The GM's music library, stored in one world setting:
 *   folders:    [{ id, name, parent }]                         nested folders for playlists
 *   lists:      [{ id, name, url, folder, shuffle, volume }]   Spotify / YouTube / YouTube Music links
 *   scenarios:  [{ id, name, icon, builtin, mode, lists }]     scenarios and custom themes, with bound list ids
 *   automation: { combat, restoreAfterCombat }
 */

import { MODULE_ID, SETTINGS, DEFAULT_SCENARIOS, SOURCE_ICONS, localize } from "./constants.js";

/* -------------------------------------------- */
/*  Links                                        */
/* -------------------------------------------- */

const SPOTIFY_KINDS = ["playlist", "album", "artist", "track"];

/**
 * Work out what a pasted link points at.
 * @returns {{source: "spotify"|"youtube", kind: string, id: string, music?: boolean, video?: string}|null}
 */
export function parseSource(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const uri = text.match(/^spotify:(playlist|album|artist|track):([A-Za-z0-9]+)$/);
  if (uri) return { source: "spotify", kind: uri[1], id: uri[2] };

  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");

  if (host === "open.spotify.com" || host === "play.spotify.com") {
    const parts = url.pathname.split("/").filter(p => p && !p.startsWith("intl-") && p !== "embed");
    const [kind, id] = parts;
    if (SPOTIFY_KINDS.includes(kind) && /^[A-Za-z0-9]+$/.test(id ?? "")) return { source: "spotify", kind, id };
    return null;
  }

  const youtubeHosts = ["youtube.com", "music.youtube.com", "youtube-nocookie.com", "youtu.be"];
  if (youtubeHosts.includes(host)) {
    const music = host === "music.youtube.com";
    const list = url.searchParams.get("list");
    let video = url.searchParams.get("v");
    if (host === "youtu.be") video = url.pathname.split("/").filter(Boolean)[0] ?? null;
    const path = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
    if (path && path[1] !== "videoseries") video = path[1];
    if (list && /^[\w-]+$/.test(list)) return { source: "youtube", kind: "playlist", id: list, video, music };
    if (video && /^[\w-]{6,}$/.test(video)) return { source: "youtube", kind: "video", id: video, music };
  }
  return null;
}

export function sourceIcon(parsed) {
  if (!parsed) return "fa-solid fa-triangle-exclamation";
  if (parsed.source === "spotify") return SOURCE_ICONS.spotify;
  return parsed.music ? SOURCE_ICONS.youtubeMusic : SOURCE_ICONS.youtube;
}

export function sourceLabel(parsed) {
  if (!parsed) return localize("Source.Invalid");
  const service = parsed.source === "spotify" ? "Spotify" : (parsed.music ? "YouTube Music" : "YouTube");
  return `${service} – ${localize(`Kind.${parsed.kind}`)}`;
}

/** Try to read a title for a link (oEmbed). Resolves to null when the service doesn't answer. */
export async function fetchTitle(url) {
  const parsed = parseSource(url);
  if (!parsed) return null;
  const endpoint = parsed.source === "spotify"
    ? `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      parsed.kind === "playlist" ? `https://www.youtube.com/playlist?list=${parsed.id}` : `https://www.youtube.com/watch?v=${parsed.id}`)}`;
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.title ? String(data.title) : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------- */
/*  Reading and saving                           */
/* -------------------------------------------- */

function defaultScenario(def) {
  return { id: def.id, name: "", icon: def.icon, builtin: true, mode: "random", lists: [] };
}

/** A normalized copy of the library; safe to modify and pass to saveLibrary(). */
export function getLibrary() {
  const stored = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.library) ?? {});
  const lib = {
    folders: Array.isArray(stored.folders) ? stored.folders : [],
    lists: Array.isArray(stored.lists) ? stored.lists : [],
    scenarios: Array.isArray(stored.scenarios) ? stored.scenarios : [],
    automation: { combat: "combat", restoreAfterCombat: true, ...(stored.automation ?? {}) }
  };
  for (const def of DEFAULT_SCENARIOS) {
    if (!lib.scenarios.some(s => s.id === def.id)) lib.scenarios.push(defaultScenario(def));
  }
  const listIds = new Set(lib.lists.map(l => l.id));
  for (const scenario of lib.scenarios) {
    scenario.lists = (scenario.lists ?? []).filter(id => listIds.has(id));
    scenario.mode ??= "random";
  }
  for (const list of lib.lists) {
    list.volume ??= 1;
    list.shuffle ??= true;
    list.folder ??= null;
  }
  return lib;
}

export async function saveLibrary(lib) {
  return game.settings.set(MODULE_ID, SETTINGS.library, lib);
}

/** Read, change and save the library in one go. */
export async function editLibrary(fn) {
  const lib = getLibrary();
  const result = await fn(lib);
  await saveLibrary(lib);
  return result;
}

export function scenarioName(scenario) {
  if (!scenario) return "";
  if (scenario.name) return scenario.name;
  return scenario.builtin ? localize(`Scenario.${scenario.id}`) : scenario.id;
}

/** Find a scenario by id or (case-insensitive) name - handy for macros. */
export function findScenario(lib, idOrName) {
  const needle = String(idOrName ?? "").trim().toLowerCase();
  return lib.scenarios.find(s => s.id === idOrName)
    ?? lib.scenarios.find(s => scenarioName(s).toLowerCase() === needle) ?? null;
}

export function findList(lib, idOrName) {
  const needle = String(idOrName ?? "").trim().toLowerCase();
  return lib.lists.find(l => l.id === idOrName)
    ?? lib.lists.find(l => l.name.toLowerCase() === needle) ?? null;
}

/* -------------------------------------------- */
/*  Folders                                      */
/* -------------------------------------------- */

export function folderPath(lib, folderId) {
  const names = [];
  const seen = new Set();
  let folder = lib.folders.find(f => f.id === folderId);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    names.unshift(folder.name);
    folder = lib.folders.find(f => f.id === folder.parent);
  }
  return names.join(" / ");
}

/** Ids of a folder and every folder inside it. */
export function folderDescendants(lib, folderId) {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of lib.folders) {
      if (folder.parent && ids.has(folder.parent) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Lists in a folder, including its sub-folders. */
export function listsInFolder(lib, folderId) {
  const ids = folderDescendants(lib, folderId);
  return lib.lists.filter(l => ids.has(l.folder));
}

/** Folder options for <select> elements, indented by depth. */
export function folderOptions(lib) {
  const options = [{ id: "", label: localize("Library.Root") }];
  const walk = (parent, depth) => {
    for (const folder of sortByName(lib.folders.filter(f => (f.parent ?? null) === parent))) {
      options.push({ id: folder.id, label: `${" ".repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 1);
  return options;
}

export function sortByName(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang, { numeric: true, sensitivity: "base" }));
}

export async function createFolder(data) {
  return editLibrary(lib => {
    const folder = { id: foundry.utils.randomID(), name: data.name || localize("Library.NewFolder"), parent: data.parent || null };
    lib.folders.push(folder);
    return folder;
  });
}

export async function updateFolder(id, data) {
  return editLibrary(lib => {
    const folder = lib.folders.find(f => f.id === id);
    if (folder) Object.assign(folder, data);
  });
}

/** Delete a folder; its playlists and sub-folders move up to the parent folder. */
export async function deleteFolder(id) {
  return editLibrary(lib => {
    const folder = lib.folders.find(f => f.id === id);
    if (!folder) return;
    for (const f of lib.folders) if (f.parent === id) f.parent = folder.parent ?? null;
    for (const l of lib.lists) if (l.folder === id) l.folder = folder.parent ?? null;
    lib.folders = lib.folders.filter(f => f.id !== id);
  });
}

/** Move a folder into another folder (or the root). Refuses to move a folder into itself. */
export async function moveFolder(id, parent) {
  return editLibrary(lib => {
    const folder = lib.folders.find(f => f.id === id);
    if (!folder) return false;
    if (parent && folderDescendants(lib, id).has(parent)) return false;
    folder.parent = parent || null;
    return true;
  });
}

/* -------------------------------------------- */
/*  Playlists                                    */
/* -------------------------------------------- */

export async function createList(data) {
  return editLibrary(lib => {
    const list = {
      id: foundry.utils.randomID(),
      name: data.name || localize("Library.NewList"),
      url: data.url,
      folder: data.folder || null,
      shuffle: data.shuffle ?? true,
      volume: data.volume ?? 1
    };
    lib.lists.push(list);
    return list;
  });
}

export async function updateList(id, data) {
  return editLibrary(lib => {
    const list = lib.lists.find(l => l.id === id);
    if (list) Object.assign(list, data);
  });
}

export async function deleteList(id) {
  return editLibrary(lib => {
    lib.lists = lib.lists.filter(l => l.id !== id);
    for (const scenario of lib.scenarios) scenario.lists = scenario.lists.filter(l => l !== id);
  });
}

export async function moveList(id, folder) {
  return updateList(id, { folder: folder || null });
}

/* -------------------------------------------- */
/*  Scenarios                                    */
/* -------------------------------------------- */

export async function createScenario(data) {
  return editLibrary(lib => {
    const scenario = {
      id: foundry.utils.randomID(),
      name: data.name || localize("Scenario.NewTheme"),
      icon: data.icon || "fa-solid fa-music",
      builtin: false,
      mode: data.mode || "random",
      lists: []
    };
    lib.scenarios.push(scenario);
    return scenario;
  });
}

export async function updateScenario(id, data) {
  return editLibrary(lib => {
    const scenario = lib.scenarios.find(s => s.id === id);
    if (scenario) Object.assign(scenario, data);
  });
}

export async function deleteScenario(id) {
  return editLibrary(lib => {
    lib.scenarios = lib.scenarios.filter(s => s.id !== id || s.builtin);
    if (lib.automation.combat === id) lib.automation.combat = "";
  });
}

/** Bind one or more playlists to a scenario. */
export async function bindLists(scenarioId, listIds) {
  return editLibrary(lib => {
    const scenario = lib.scenarios.find(s => s.id === scenarioId);
    if (!scenario) return 0;
    let added = 0;
    for (const id of listIds) {
      if (!scenario.lists.includes(id) && lib.lists.some(l => l.id === id)) {
        scenario.lists.push(id);
        added++;
      }
    }
    return added;
  });
}

export async function unbindList(scenarioId, listId) {
  return editLibrary(lib => {
    const scenario = lib.scenarios.find(s => s.id === scenarioId);
    if (scenario) scenario.lists = scenario.lists.filter(id => id !== listId);
  });
}

export async function updateAutomation(data) {
  return editLibrary(lib => {
    Object.assign(lib.automation, data);
  });
}
