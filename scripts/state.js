/**
 * What is playing, stored in a world setting so every client follows the GM:
 *   { scenarioId, listId, token, paused, skip, rotation, auto, previous }
 * A new token means "start this list from the top"; skip counts "next track" presses.
 * Only GMs change it (world settings are GM-only).
 */

import { MODULE_ID, SETTINGS, localize } from "./constants.js";
import { getLibrary, findScenario, findList, scenarioName } from "./library.js";

export function getState() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.state) ?? {});
}

async function setState(next) {
  if (!game.user.isGM) {
    ui.notifications.warn(localize("Notify.GMOnly"));
    return false;
  }
  await game.settings.set(MODULE_ID, SETTINGS.state, next);
  return true;
}

/** Pick which bound playlist a scenario plays next. */
function pickList(scenario, state) {
  const lists = scenario.lists;
  if (!lists.length) return null;
  if (lists.length === 1) return lists[0];
  if (scenario.mode === "sequence") {
    const index = ((state.rotation?.[scenario.id] ?? -1) + 1) % lists.length;
    return lists[index];
  }
  const others = lists.filter(id => id !== state.listId);
  return others[Math.floor(Math.random() * others.length)];
}

/**
 * Play a scenario (by id or name). Picks one of its playlists unless listId is given.
 * @param {string} idOrName
 * @param {object} [options]
 * @param {string} [options.listId]  Play this bound playlist.
 * @param {string} [options.auto]    Set by automation (e.g. the combat id) so it can be undone later.
 * @param {object} [options.previous] What to go back to when the automation ends.
 */
export async function playScenario(idOrName, { listId, auto = null, previous = null } = {}) {
  const lib = getLibrary();
  const scenario = findScenario(lib, idOrName);
  if (!scenario) {
    ui.notifications.warn(localize("Notify.NoScenario", { name: idOrName }));
    return false;
  }
  const state = getState();
  const chosen = listId && scenario.lists.includes(listId) ? listId : pickList(scenario, state);
  if (!chosen) {
    ui.notifications.warn(localize("Notify.NoListsBound", { name: scenarioName(scenario) }));
    return false;
  }
  const rotation = { ...(state.rotation ?? {}), [scenario.id]: scenario.lists.indexOf(chosen) };
  return setState({
    scenarioId: scenario.id, listId: chosen, token: foundry.utils.randomID(),
    paused: false, skip: 0, rotation, auto, previous
  });
}

/** Play one playlist on its own (by id or name), outside any scenario. */
export async function playList(idOrName) {
  const list = findList(getLibrary(), idOrName);
  if (!list) {
    ui.notifications.warn(localize("Notify.NoList", { name: idOrName }));
    return false;
  }
  const state = getState();
  return setState({
    scenarioId: null, listId: list.id, token: foundry.utils.randomID(),
    paused: false, skip: 0, rotation: state.rotation ?? {}, auto: null, previous: null
  });
}

export async function stop() {
  const state = getState();
  return setState({ scenarioId: null, listId: null, token: null, paused: false, skip: 0, rotation: state.rotation ?? {}, auto: null, previous: null });
}

export async function pause() {
  const state = getState();
  if (!state.listId) return false;
  return setState({ ...state, paused: true });
}

export async function resume() {
  const state = getState();
  if (!state.listId) return false;
  return setState({ ...state, paused: false });
}

export async function togglePause() {
  return getState().paused ? resume() : pause();
}

/** Skip to the next track on every client. */
export async function skipTrack() {
  const state = getState();
  if (!state.listId) return false;
  return setState({ ...state, skip: (state.skip ?? 0) + 1, paused: false });
}

/** Switch to another playlist of the current scenario. */
export async function nextList() {
  const state = getState();
  if (!state.scenarioId) return false;
  return playScenario(state.scenarioId, { auto: state.auto, previous: state.previous });
}

/** Go back to what was playing before an automation took over. */
export async function restorePrevious(previous) {
  if (previous?.scenarioId) return playScenario(previous.scenarioId, { listId: previous.listId });
  if (previous?.listId) return playList(previous.listId);
  return stop();
}

/** The one GM client that runs automations. */
export function isResponsibleGM() {
  return game.user.isGM && (game.users.activeGM ? game.users.activeGM.isSelf : true);
}
