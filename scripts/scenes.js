/**
 * Scenario soundtracks bound to scenes.
 * - When the GM views a scene nobody has decided about yet, a small dialog asks which scenario
 *   (if any) belongs to it. The answer is stored on the scene, so it is asked only once.
 * - When a scene with a bound scenario is activated, that scenario plays for everyone.
 * - Scene context menus (directory and navigation bar) can change the binding later.
 */

import { MODULE_ID, SETTINGS, localize, escapeHTML } from "./constants.js";
import { getLibrary, scenarioName } from "./library.js";
import * as playback from "./state.js";

const { DialogV2 } = foundry.applications.api;
const FLAG = "scenario";

/** Scenes the GM chose "Ask later" for, so they aren't asked again until the next reload. */
const postponed = new Set();

/** Words in a scene name that hint at a built-in scenario. */
const KEYWORDS = {
  tavern: ["tavern", "inn", "pub", "alehouse", "bar", "saloon"],
  town: ["town", "city", "village", "market", "square", "port", "harbor", "harbour", "street", "castle", "keep"],
  dungeon: ["dungeon", "cave", "cavern", "crypt", "tomb", "catacomb", "sewer", "mine", "lair", "vault", "ruin"],
  boss: ["boss", "throne", "arena", "final"],
  rest: ["camp", "campfire", "rest", "home"],
  combat: ["battle", "fight", "ambush", "skirmish", "encounter"],
  tension: ["haunted", "manor", "graveyard", "cemetery", "swamp", "mist"],
  exploration: ["forest", "road", "wilderness", "mountain", "coast", "plains", "desert", "travel", "world", "map", "overworld"]
};

/** The scenario id bound to a scene: "" means "no soundtrack", undefined means "not decided yet". */
export function sceneScenario(scene) {
  return scene?.getFlag(MODULE_ID, FLAG);
}

/** Best guess at a fitting scenario for a scene, from its name. */
function guessScenario(scene, lib) {
  const name = (scene.navName || scene.name || "").toLowerCase();
  const byName = lib.scenarios.find(s => name.includes(scenarioName(s).toLowerCase()));
  if (byName) return byName.id;
  for (const [id, words] of Object.entries(KEYWORDS)) {
    if (words.some(word => new RegExp(`\\b${word}s?\\b`).test(name)) && lib.scenarios.some(s => s.id === id)) return id;
  }
  return "";
}

/**
 * Ask the GM which scenario soundtrack belongs to a scene, and store the answer.
 * @param {Scene} scene
 * @param {object} [options]
 * @param {boolean} [options.change]  Opened on purpose (context menu) rather than automatically.
 */
export async function promptSceneScenario(scene, { change = false } = {}) {
  if (!game.user.isGM || !scene) return;
  const lib = getLibrary();
  const current = sceneScenario(scene);
  const selected = current || (current === undefined ? guessScenario(scene, lib) : "");

  const options = [`<option value="">${escapeHTML(localize("SceneBinding.NoSoundtrack"))}</option>`, ...lib.scenarios.map(s => {
    const count = s.lists.length ? localize("SceneBinding.ListCount", { count: s.lists.length }) : localize("SceneBinding.NoLists");
    return `<option value="${escapeHTML(s.id)}"${s.id === selected ? " selected" : ""}>${escapeHTML(scenarioName(s))} (${escapeHTML(count)})</option>`;
  })].join("");

  const content = `<div class="sst-dialog sst-scene-dialog">
    <p>${localize("SceneBinding.Question", { scene: `<strong>${escapeHTML(scene.navName || scene.name)}</strong>` })}</p>
    <div class="form-group">
      <label>${escapeHTML(localize("SceneBinding.Scenario"))}</label>
      <div class="form-fields"><select name="scenario">${options}</select></div>
    </div>
    <p class="hint">${escapeHTML(localize("SceneBinding.Hint"))}</p>
  </div>`;

  const buttons = [
    { action: "bind", label: localize("SceneBinding.Bind"), icon: "fa-solid fa-link", default: true,
      callback: (event, button) => button.form.elements.scenario.value },
    { action: "none", label: localize("SceneBinding.NoSoundtrack"), icon: "fa-solid fa-volume-xmark", callback: () => "" }
  ];
  if (!change) buttons.push({ action: "later", label: localize("SceneBinding.Later"), icon: "fa-solid fa-clock", callback: () => null });

  const result = await DialogV2.wait({
    window: { title: localize("SceneBinding.Title"), icon: "fa-solid fa-compact-disc" },
    position: { width: 420 },
    content,
    buttons,
    rejectClose: false
  });
  if (result === null || result === undefined || result === "later") {
    postponed.add(scene.id);
    return;
  }

  await scene.setFlag(MODULE_ID, FLAG, result);
  if (result && scene.active) await playSceneScenario(scene);
}

/** Play the scenario bound to a scene, unless it is already playing. */
export async function playSceneScenario(scene) {
  const scenarioId = sceneScenario(scene);
  if (!scenarioId) return;
  const lib = getLibrary();
  const scenario = lib.scenarios.find(s => s.id === scenarioId);
  if (!scenario?.lists.length) return;
  if (playback.getState().scenarioId === scenarioId) return;
  await playback.playScenario(scenarioId);
}

function contextEntry() {
  const sceneFrom = target => {
    const element = target instanceof HTMLElement ? target : target?.[0];
    const id = element?.dataset.entryId ?? element?.dataset.sceneId ?? element?.dataset.documentId;
    return game.scenes.get(id);
  };
  return {
    name: "SST.SceneBinding.ContextMenu",
    icon: '<i class="fa-solid fa-compact-disc"></i>',
    condition: target => game.user.isGM && !!sceneFrom(target),
    callback: target => promptSceneScenario(sceneFrom(target), { change: true })
  };
}

export function registerSceneHooks() {
  // The GM looks at a scene: ask once per scene.
  Hooks.on("canvasReady", canvas => {
    const scene = canvas.scene;
    if (!game.user.isGM || !scene) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.askOnNewScene)) return;
    if (sceneScenario(scene) !== undefined || postponed.has(scene.id)) return;
    promptSceneScenario(scene);
  });

  // A scene is activated: play its soundtrack for everyone.
  Hooks.on("updateScene", (scene, changed) => {
    if (changed.active !== true || !playback.isResponsibleGM()) return;
    playSceneScenario(scene);
  });

  // "Scenario soundtrack…" in the scene directory and navigation bar context menus.
  const addEntry = (app, entries) => {
    if (!Array.isArray(entries) || entries.some(e => e.name === "SST.SceneBinding.ContextMenu")) return;
    entries.push(contextEntry());
  };
  Hooks.on("getSceneContextOptions", addEntry);
  Hooks.on("getSceneDirectoryEntryContext", addEntry);
  Hooks.on("getSceneNavigationContext", addEntry);
}
