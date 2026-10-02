/**
 * Export the whole soundtrack setup (folders, playlists, scenarios and themes with their bound
 * playlists, combat automation, and which scenario each scene uses) to a JSON file, and import
 * it into another world - either merged into what is there or replacing it.
 */

import { MODULE_ID, localize } from "./constants.js";
import { getLibrary, normalizeLibrary, saveLibrary, sameSource, scenarioName } from "./library.js";

export const EXPORT_FORMAT = "dxcufgbs-scenario-soundtrack";
export const EXPORT_VERSION = 1;

/* -------------------------------------------- */
/*  Export                                       */
/* -------------------------------------------- */

/**
 * The export file's content.
 * @param {object} lib                    A library (see library.js).
 * @param {{name: string, scenario: string}[]} scenes  Scene bindings, by scene name.
 */
export function buildExport(lib, scenes = []) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    world: game.world?.title ?? "",
    library: {
      folders: lib.folders.map(({ id, name, parent, suggested }) => ({ id, name, parent: parent ?? null, ...(suggested ? { suggested } : {}) })),
      lists: lib.lists.map(({ id, name, url, folder, shuffle, volume }) => ({ id, name, url, folder: folder ?? null, shuffle, volume })),
      scenarios: lib.scenarios.map(({ id, name, icon, builtin, mode, lists }) => ({ id, name, icon, builtin: !!builtin, mode, lists: [...lists] })),
      automation: { ...lib.automation }
    },
    scenes
  };
}

/** Scene bindings of this world, by scene name. */
export function sceneBindings() {
  return game.scenes
    .filter(scene => typeof scene.getFlag(MODULE_ID, "scenario") === "string")
    .map(scene => ({ name: scene.name, scenario: scene.getFlag(MODULE_ID, "scenario") }));
}

/** Download the current setup as a JSON file. */
export function exportToFile() {
  const data = buildExport(getLibrary(), sceneBindings());
  const world = (game.world?.id ?? "world").replace(/[^\w-]+/g, "-");
  foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", `scenario-soundtracks-${world}.json`);
  return data;
}

/* -------------------------------------------- */
/*  Reading an export                            */
/* -------------------------------------------- */

const text = (value, max = 500) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const validId = value => typeof value === "string" && /^[\w-]{1,64}$/.test(value);

/**
 * Check and clean an export file's content. Throws when it isn't a soundtrack export.
 * @returns {{library: object, scenes: {name: string, scenario: string}[], world: string, exportedAt: string}}
 */
export function parseExport(data) {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error(localize("Transfer.NotJson"));
    }
  }
  if (data?.format !== EXPORT_FORMAT || !data.library || typeof data.library !== "object") {
    throw new Error(localize("Transfer.WrongFile"));
  }
  if (Number(data.version) > EXPORT_VERSION) throw new Error(localize("Transfer.NewerVersion"));
  const raw = data.library;

  const folders = (Array.isArray(raw.folders) ? raw.folders : [])
    .filter(f => validId(f?.id))
    .map(f => ({
      id: f.id,
      name: text(f.name, 200) || localize("Library.NewFolder"),
      parent: validId(f.parent) ? f.parent : null,
      ...(validId(f.suggested) ? { suggested: f.suggested } : {})
    }));
  // Drop parents that don't exist or would loop.
  const folderIds = new Set(folders.map(f => f.id));
  for (const folder of folders) {
    if (folder.parent && !folderIds.has(folder.parent)) folder.parent = null;
    const seen = new Set([folder.id]);
    let parent = folders.find(f => f.id === folder.parent);
    while (parent) {
      if (seen.has(parent.id)) {
        folder.parent = null;
        break;
      }
      seen.add(parent.id);
      parent = folders.find(f => f.id === parent.parent);
    }
  }

  const lists = (Array.isArray(raw.lists) ? raw.lists : [])
    .filter(l => validId(l?.id) && text(l.url, 2000))
    .map(l => ({
      id: l.id,
      name: text(l.name, 200) || localize("Library.NewList"),
      url: text(l.url, 2000),
      folder: validId(l.folder) && folderIds.has(l.folder) ? l.folder : null,
      shuffle: l.shuffle !== false,
      volume: Math.clamp(Number(l.volume) || 1, 0.05, 1)
    }));

  const scenarios = (Array.isArray(raw.scenarios) ? raw.scenarios : [])
    .filter(s => validId(s?.id))
    .map(s => ({
      id: s.id,
      name: text(s.name, 200),
      icon: /^[\w\s-]{1,100}$/.test(s.icon ?? "") ? s.icon : "fa-solid fa-music",
      builtin: !!s.builtin,
      mode: s.mode === "sequence" ? "sequence" : "random",
      lists: Array.isArray(s.lists) ? s.lists.filter(validId) : []
    }));

  const automation = {
    combat: validId(raw.automation?.combat) || raw.automation?.combat === "" ? raw.automation.combat : "combat",
    restoreAfterCombat: raw.automation?.restoreAfterCombat !== false
  };

  const scenes = (Array.isArray(data.scenes) ? data.scenes : [])
    .filter(s => text(s?.name) && (s.scenario === "" || validId(s.scenario)))
    .map(s => ({ name: text(s.name), scenario: s.scenario }));

  return {
    library: normalizeLibrary({ folders, lists, scenarios, automation }),
    scenes,
    world: text(data.world, 200),
    exportedAt: text(data.exportedAt, 50)
  };
}

/* -------------------------------------------- */
/*  Merging                                      */
/* -------------------------------------------- */

const lower = value => String(value ?? "").trim().toLowerCase();

/**
 * Merge an imported library into the current one without duplicating anything:
 * - folders with the same name in the same place are reused,
 * - playlists with the same link are reused (kept where they are),
 * - built-in scenarios and themes with the same name get the imported playlists added,
 *   other themes are created.
 * @returns {{library: object, scenarioIds: Map<string, string>, counts: {folders: number, lists: number, scenarios: number, bindings: number}}}
 */
export function mergeLibrary(current, imported) {
  const lib = foundry.utils.deepClone(current);
  const counts = { folders: 0, lists: 0, scenarios: 0, bindings: 0 };
  const usedIds = new Set([...lib.folders, ...lib.lists, ...lib.scenarios].map(x => x.id));
  const freshId = id => (id && !usedIds.has(id) ? id : foundry.utils.randomID());

  // Folders, parents first.
  const folderIds = new Map();
  const pending = [...imported.folders];
  while (pending.length) {
    const index = pending.findIndex(f => !f.parent || folderIds.has(f.parent));
    const folder = pending.splice(index === -1 ? 0 : index, 1)[0];
    const parent = folder.parent ? folderIds.get(folder.parent) ?? null : null;
    const existing = lib.folders.find(f => (f.parent ?? null) === parent && lower(f.name) === lower(folder.name));
    if (existing) {
      folderIds.set(folder.id, existing.id);
      continue;
    }
    const id = freshId(folder.id);
    usedIds.add(id);
    lib.folders.push({ ...folder, id, parent });
    folderIds.set(folder.id, id);
    counts.folders++;
  }

  // Playlists.
  const listIds = new Map();
  for (const list of imported.lists) {
    const existing = lib.lists.find(l => l.url === list.url || sameSource(l.url, list.url));
    if (existing) {
      listIds.set(list.id, existing.id);
      continue;
    }
    const id = freshId(list.id);
    usedIds.add(id);
    lib.lists.push({ ...list, id, folder: list.folder ? folderIds.get(list.folder) ?? null : null });
    listIds.set(list.id, id);
    counts.lists++;
  }

  // Scenarios and themes.
  const scenarioIds = new Map();
  for (const scenario of imported.scenarios) {
    let target = scenario.builtin
      ? lib.scenarios.find(s => s.id === scenario.id)
      : lib.scenarios.find(s => !s.builtin && lower(scenarioName(s)) === lower(scenarioName(scenario)));
    if (!target) {
      target = { ...scenario, id: freshId(scenario.id), lists: [] };
      usedIds.add(target.id);
      lib.scenarios.push(target);
      counts.scenarios++;
    }
    scenarioIds.set(scenario.id, target.id);
    for (const listId of scenario.lists) {
      const mapped = listIds.get(listId);
      if (mapped && !target.lists.includes(mapped)) {
        target.lists.push(mapped);
        counts.bindings++;
      }
    }
  }

  return { library: lib, scenarioIds, counts };
}

/** Counts for a full replace, to show in the summary. */
function replaceCounts(imported) {
  return {
    folders: imported.folders.length,
    lists: imported.lists.length,
    scenarios: imported.scenarios.filter(s => !s.builtin).length,
    bindings: imported.scenarios.reduce((sum, s) => sum + s.lists.length, 0)
  };
}

/* -------------------------------------------- */
/*  Import                                       */
/* -------------------------------------------- */

/** Scenes in this world that match imported scene bindings by name. */
export function matchingScenes(scenes) {
  const byName = new Map(scenes.map(s => [lower(s.name), s.scenario]));
  return game.scenes.filter(scene => byName.has(lower(scene.name)))
    .map(scene => ({ scene, scenario: byName.get(lower(scene.name)) }));
}

/**
 * Apply an import.
 * @param {ReturnType<typeof parseExport>} parsed
 * @param {object} options
 * @param {"merge"|"replace"} options.mode
 * @param {boolean} options.scenes  Also bind scenes with the same names.
 */
export async function applyImport(parsed, { mode = "merge", scenes = true } = {}) {
  let library;
  let counts;
  let scenarioIds;
  if (mode === "replace") {
    library = parsed.library;
    counts = replaceCounts(parsed.library);
    scenarioIds = new Map(parsed.library.scenarios.map(s => [s.id, s.id]));
  } else {
    ({ library, counts, scenarioIds } = mergeLibrary(getLibrary(), parsed.library));
  }
  await saveLibrary(library);

  let sceneCount = 0;
  if (scenes) {
    for (const { scene, scenario } of matchingScenes(parsed.scenes)) {
      const id = scenario === "" ? "" : scenarioIds.get(scenario);
      if (id === undefined) continue;
      await scene.setFlag(MODULE_ID, "scenario", id);
      sceneCount++;
    }
  }
  return { ...counts, scenes: sceneCount };
}
