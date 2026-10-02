/**
 * Scenario Soundtracks (dxcufgbs-scenario-soundtrack) - Foundry VTT V13
 * Spotify, YouTube and YouTube Music playlists for scenarios such as exploration and combat.
 */

import { MODULE_ID, SETTINGS, localize } from "./constants.js";
import * as library from "./library.js";
import * as playback from "./state.js";
import { SoundtrackEngine } from "./engine.js";
import { ControlPanel } from "./apps/control-panel.js";
import { injectBar, refreshSidebar } from "./sidebar.js";

let engine = null;
let panel = null;

function openPanel() {
  if (!game.user.isGM) return ui.notifications.warn(localize("Notify.GMOnly"));
  panel ??= new ControlPanel();
  return panel.render({ force: true });
}

/** Something changed: update what is shown and what is played. */
function onChange({ play = true } = {}) {
  if (play) engine?.sync();
  if (engine) refreshSidebar(engine);
  if (panel?.rendered) panel.render();
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.library, {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => onChange()
  });
  game.settings.register(MODULE_ID, SETTINGS.state, {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => onChange()
  });
  game.settings.register(MODULE_ID, SETTINGS.spotifyClientId, {
    name: "SST.Settings.SpotifyClientId.Name",
    hint: "SST.Settings.SpotifyClientId.Hint",
    scope: "world", config: true, type: String, default: "",
    onChange: () => onChange()
  });
  game.settings.register(MODULE_ID, SETTINGS.showToPlayers, {
    name: "SST.Settings.ShowToPlayers.Name",
    hint: "SST.Settings.ShowToPlayers.Hint",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => onChange({ play: false })
  });
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: "SST.Settings.Enabled.Name",
    hint: "SST.Settings.Enabled.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => onChange()
  });
  game.settings.register(MODULE_ID, SETTINGS.spotifyAuth, {
    scope: "client", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, SETTINGS.expandedFolders, {
    scope: "client", config: false, type: Array, default: []
  });

  game.keybindings.register(MODULE_ID, "openPanel", {
    name: "SST.Keybindings.OpenPanel",
    restricted: true,
    editable: [],
    onDown: () => {
      openPanel();
      return true;
    }
  });
});

Hooks.once("ready", () => {
  engine = new SoundtrackEngine();

  // Macro / module API, e.g. game.modules.get("dxcufgbs-scenario-soundtrack").api.playScenario("Combat")
  game.modules.get(MODULE_ID).api = {
    playScenario: playback.playScenario,
    playList: playback.playList,
    stop: playback.stop,
    pause: playback.pause,
    resume: playback.resume,
    togglePause: playback.togglePause,
    skipTrack: playback.skipTrack,
    nextList: playback.nextList,
    getState: playback.getState,
    getLibrary: library.getLibrary,
    openPanel,
    engine
  };

  if (ui.playlists?.rendered) injectBar(ui.playlists, ui.playlists.element, engine, openPanel);
  engine.sync();
});

/* -------------------------------------------- */
/*  Music volume                                 */
/* -------------------------------------------- */

// Fires when the Music slider in the Playlists tab is released (and the setting saved).
Hooks.on("globalPlaylistVolumeChanged", volume => engine?.setMusicVolume(Number(volume)));

// Follow the slider while it is being dragged too, so it feels like Foundry's own playlists.
document.addEventListener("input", event => {
  // The slider may be a <range-picker name="globalPlaylistVolume"> wrapping an unnamed <input type="range">.
  const target = event.target;
  if (!engine || !target?.closest?.('[name="globalPlaylistVolume"]')) return;
  const value = Number(target.value);
  if (!Number.isFinite(value)) return;
  const toVolume = foundry.audio?.AudioHelper?.inputToVolume;
  engine.setMusicVolume(toVolume ? toVolume(value) : value);
}, true);

/* -------------------------------------------- */
/*  Playlists tab                                */
/* -------------------------------------------- */

Hooks.on("renderPlaylistDirectory", (app, html) => {
  if (engine) injectBar(app, html, engine, openPanel);
});

/* -------------------------------------------- */
/*  Combat automation                            */
/* -------------------------------------------- */

/** Combats the music already switched for, so a manual change during the fight sticks. */
const switchedCombats = new Set();

Hooks.on("updateCombat", (combat, changed) => {
  if (!playback.isResponsibleGM() || changed.round !== 1 || switchedCombats.has(combat.id)) return;
  switchedCombats.add(combat.id);
  const lib = library.getLibrary();
  const scenarioId = lib.automation.combat;
  const scenario = lib.scenarios.find(s => s.id === scenarioId);
  if (!scenario?.lists.length) return;
  const state = playback.getState();
  // Leave the music alone when the GM already picked this scenario by hand.
  if (state.scenarioId === scenarioId && !state.auto) return;
  const previous = state.auto ? state.previous : { scenarioId: state.scenarioId ?? null, listId: state.listId ?? null };
  playback.playScenario(scenarioId, { auto: combat.id, previous });
});

Hooks.on("deleteCombat", combat => {
  if (!playback.isResponsibleGM()) return;
  const state = playback.getState();
  if (state.auto !== combat.id) return;
  if (library.getLibrary().automation.restoreAfterCombat) playback.restorePrevious(state.previous);
  else playback.stop();
});
