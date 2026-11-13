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
import { registerSceneHooks, promptSceneScenario, playSceneScenario, sceneBindingCounts } from "./scenes.js";
import * as transfer from "./transfer.js";
import { crumb, registerDebugRecorder, scenarioTag } from "./debug-recorder.js";

let engine = null;
let panel = null;
/** The playback state as this client last saw it, for the `previous` argument of the changed hook. */
let lastState = null;

function openPanel() {
  if (!game.user.isGM) return ui.notifications.warn(localize("Notify.GMOnly"));
  panel ??= new ControlPanel();
  panel.track = engine?.track ?? "";
  crumb("app.render", { app: "controlPanel", wasOpen: !!panel.rendered });
  return panel.render({ force: true });
}

/** Something changed: update what is shown and what is played. */
function onChange({ play = true } = {}) {
  if (play) engine?.sync();
  if (engine) refreshSidebar(engine);
  if (panel?.rendered) panel.render();
}

/**
 * The playback state changed: tell other modules on this client.
 * Hooks.callAll("dxcufgbs-scenario-soundtrack.changed", state, previous), both plain copies.
 */
function onStateChange() {
  try {
    const state = playback.getState();
    const previous = lastState ?? {};
    lastState = foundry.utils.deepClone(state);
    Hooks.callAll(`${MODULE_ID}.changed`, state, previous);
  } catch (err) {
    console.error(`${MODULE_ID} | changed hook failed`, err);
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.library, {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => onChange()
  });
  game.settings.register(MODULE_ID, SETTINGS.state, {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => {
      onChange();
      onStateChange();
    }
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

// Registered in "setup" because game.user is not known yet during "init",
// and only the GM should see this setting in the settings menu.
Hooks.once("setup", () => {
  game.settings.register(MODULE_ID, SETTINGS.askOnNewScene, {
    name: "SST.Settings.AskOnNewScene.Name",
    hint: "SST.Settings.AskOnNewScene.Hint",
    scope: "client", config: game.user.isGM, type: Boolean, default: true
  });
});

Hooks.once("ready", () => {
  engine = new SoundtrackEngine();
  // The song is this client's own (shuffle differs per listener), so only the display follows it.
  engine.onTrackChange = title => {
    refreshSidebar(engine);
    panel?.setTrack(title);
  };
  lastState = playback.getState();

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
    bindScene: scene => promptSceneScenario(scene ?? canvas.scene, { change: true }),
    playSceneScenario,
    exportSetup: transfer.exportToFile,
    /** Import an export (object or JSON text). options: { mode: "merge"|"replace", scenes: boolean } */
    importSetup: (data, options) => transfer.applyImport(transfer.parseExport(data), options)
  };

  if (ui.playlists?.rendered) injectBar(ui.playlists, ui.playlists.element, engine, openPanel);
  engine.sync();
  registerDebugRecorder(debugSnapshot);
});

/* -------------------------------------------- */
/*  Debug Recorder (optional)                    */
/* -------------------------------------------- */

/**
 * Runtime state for Dxcufgb's Debug Recorder: counts, booleans and this module's own fixed ids only.
 * No playlist, folder, scenario or scene names, no links or playlist/video ids, no Spotify tokens.
 */
function debugSnapshot() {
  const lib = library.getLibrary();
  const state = playback.getState();
  const bySource = { spotify: 0, youtube: 0, youtubeMusic: 0, invalid: 0 };
  const byKind = {};
  for (const list of lib.lists) {
    const parsed = library.parseSource(list.url);
    if (!parsed) bySource.invalid++;
    else {
      bySource[parsed.source === "spotify" ? "spotify" : parsed.music ? "youtubeMusic" : "youtube"]++;
      byKind[parsed.kind] = (byKind[parsed.kind] ?? 0) + 1;
    }
  }
  const currentList = lib.lists.find(l => l.id === state.listId);
  const currentSource = currentList ? library.parseSource(currentList.url) : null;
  const current = engine?.current;
  return {
    ready: !!engine,
    isGM: game.user.isGM,
    responsibleGM: playback.isResponsibleGM(),
    library: {
      folders: lib.folders.length,
      suggestedFolders: lib.folders.filter(f => f.suggested).length,
      lists: lib.lists.length,
      listsBySource: bySource,
      listsByKind: byKind,
      listsNotShuffled: lib.lists.filter(l => l.shuffle === false).length,
      listsWithOwnVolume: lib.lists.filter(l => (l.volume ?? 1) !== 1).length,
      scenariosBuiltin: lib.scenarios.filter(s => s.builtin).length,
      scenariosCustom: lib.scenarios.filter(s => !s.builtin).length,
      scenariosWithLists: lib.scenarios.filter(s => s.lists.length).length,
      scenariosSequence: lib.scenarios.filter(s => s.mode === "sequence").length,
      bindings: lib.scenarios.reduce((sum, s) => sum + s.lists.length, 0),
      automation: {
        combatScenario: scenarioTag(lib.automation.combat),
        restoreAfterCombat: !!lib.automation.restoreAfterCombat
      }
    },
    state: {
      playing: !!state.listId,
      listFound: !!currentList,
      source: currentSource ? (currentSource.source === "spotify" ? "spotify" : currentSource.music ? "youtubeMusic" : "youtube") : null,
      kind: currentSource?.kind ?? null,
      scenario: scenarioTag(state.scenarioId),
      paused: !!state.paused,
      skip: state.skip ?? 0,
      auto: !!state.auto,
      hasPrevious: !!(state.previous?.scenarioId || state.previous?.listId),
      rotations: Object.keys(state.rotation ?? {}).length
    },
    engine: engine ? {
      enabled: engine.enabled,
      current: current ? {
        backend: current.backend?.name ?? null,
        kind: current.source?.kind ?? null,
        started: !!current.started,
        paused: !!current.paused,
        inStep: current.token === state.token
      } : null,
      hasTrack: !!engine.track,
      volume: Math.round(engine.volume * 100) / 100,
      syncFailures: engine.failures,
      lastError: engine.lastError,
      youtube: engine.youtube.debugState,
      spotify: engine.spotify.debugState
    } : null,
    scenes: sceneBindingCounts(),
    combatsSwitched: switchedCombats.size,
    panelOpen: !!panel?.rendered,
    bars: document.querySelectorAll(".sst-bar").length,
    secureContext: !!window.isSecureContext,
    exportVersion: transfer.EXPORT_VERSION
  };
}

registerSceneHooks();

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
  if (!scenario?.lists.length) {
    crumb("combat.start", { result: scenarioId ? "noLists" : "off", scenario: scenarioTag(scenarioId) });
    return;
  }
  const state = playback.getState();
  // Leave the music alone when the GM already picked this scenario by hand.
  if (state.scenarioId === scenarioId && !state.auto) {
    crumb("combat.start", { result: "alreadyPlaying", scenario: scenarioTag(scenarioId) });
    return;
  }
  crumb("combat.start", { result: "switch", scenario: scenarioTag(scenarioId), chained: !!state.auto });
  const previous = state.auto ? state.previous : { scenarioId: state.scenarioId ?? null, listId: state.listId ?? null };
  playback.playScenario(scenarioId, { auto: combat.id, previous });
});

Hooks.on("deleteCombat", combat => {
  if (!playback.isResponsibleGM()) return;
  const state = playback.getState();
  if (state.auto !== combat.id) return;
  const restore = !!library.getLibrary().automation.restoreAfterCombat;
  crumb("combat.end", { result: restore ? "restore" : "stop", hasPrevious: !!(state.previous?.scenarioId || state.previous?.listId) });
  if (restore) playback.restorePrevious(state.previous);
  else playback.stop();
});
