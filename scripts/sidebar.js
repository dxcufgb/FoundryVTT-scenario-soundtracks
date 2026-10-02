/**
 * A small bar at the top of the Playlists tab: what is playing, Spotify connect for everyone,
 * and for the GM quick scenario buttons plus the control panel button.
 */

import { MODULE_ID, SETTINGS, localize, escapeHTML } from "./constants.js";
import { getLibrary, scenarioName, parseSource, sourceIcon } from "./library.js";
import * as playback from "./state.js";
import { SpotifyAuth } from "./backends/spotify.js";

const BAR_CLASS = "sst-bar";

function button(action, icon, tooltip, { active = false, data = "" } = {}) {
  return `<button type="button" class="sst-icon-button${active ? " active" : ""}" data-sst-action="${action}" ${data}
    data-tooltip="${escapeHTML(tooltip)}" aria-label="${escapeHTML(tooltip)}"><i class="${escapeHTML(icon)}"></i></button>`;
}

function buildBar(engine) {
  const lib = getLibrary();
  const state = playback.getState();
  const isGM = game.user.isGM;
  const list = lib.lists.find(l => l.id === state.listId);
  const scenario = lib.scenarios.find(s => s.id === state.scenarioId);
  const showNow = isGM || game.settings.get(MODULE_ID, SETTINGS.showToPlayers);

  let now = `<span class="sst-now-idle">${escapeHTML(localize("Bar.Idle"))}</span>`;
  if (list && showNow) {
    const title = scenario ? scenarioName(scenario) : list.name;
    const subtitle = scenario ? list.name : "";
    now = `<i class="${sourceIcon(parseSource(list.url))}"></i>
      <span class="sst-now-text"><strong>${escapeHTML(title)}</strong>${subtitle ? ` <span>${escapeHTML(subtitle)}</span>` : ""}</span>
      ${state.paused ? `<span class="sst-paused">${escapeHTML(localize("Bar.Paused"))}</span>` : ""}`;
  } else if (list) {
    now = `<i class="fa-solid fa-music"></i> <span class="sst-now-text">${escapeHTML(localize(state.paused ? "Bar.Paused" : "Bar.Playing"))}</span>`;
  }

  const controls = [];
  if (SpotifyAuth.configured) {
    const connected = engine.spotify.auth.connected;
    controls.push(button(connected ? "spotifyDisconnect" : "spotifyConnect", "fa-brands fa-spotify",
      localize(connected ? "Spotify.Disconnect" : "Spotify.Connect"), { active: connected }));
  }
  if (isGM) {
    if (list) {
      controls.push(button("togglePause", state.paused ? "fa-solid fa-play" : "fa-solid fa-pause", localize(state.paused ? "Panel.Resume" : "Panel.Pause")));
      controls.push(button("skipTrack", "fa-solid fa-forward-step", localize("Panel.SkipTrack")));
      controls.push(button("stop", "fa-solid fa-stop", localize("Panel.Stop")));
    }
    controls.push(button("openPanel", "fa-solid fa-sliders", localize("Panel.Title")));
  }

  let needsSpotify = "";
  const parsed = list ? parseSource(list.url) : null;
  if (parsed?.source === "spotify" && SpotifyAuth.configured && !engine.spotify.auth.connected) {
    needsSpotify = `<p class="sst-hint">${escapeHTML(localize("Spotify.ConnectToHear"))}</p>`;
  }

  let scenarios = "";
  if (isGM) {
    const buttons = lib.scenarios.filter(s => s.lists.length).map(s => `
      <button type="button" class="sst-scenario-chip${s.id === state.scenarioId ? " active" : ""}" data-sst-action="playScenario"
        data-scenario-id="${s.id}" data-tooltip="${escapeHTML(scenarioName(s))}">
        <i class="${escapeHTML(s.icon)}"></i><span>${escapeHTML(scenarioName(s))}</span></button>`).join("");
    scenarios = buttons ? `<div class="sst-chips">${buttons}</div>` : "";
  }

  return `
    <div class="sst-bar-row">
      <span class="sst-bar-title" data-tooltip="${escapeHTML(localize("Module.Title"))}"><i class="fa-solid fa-compact-disc${list && !state.paused ? " fa-spin" : ""}"></i></span>
      <div class="sst-now">${now}</div>
      <div class="sst-bar-controls">${controls.join("")}</div>
    </div>
    ${needsSpotify}${scenarios}`;
}

async function onBarClick(event, engine, openPanel) {
  const target = event.target.closest("[data-sst-action]");
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const action = target.dataset.sstAction;
  try {
    switch (action) {
      case "spotifyConnect":
        await engine.spotify.auth.login();
        engine.spotify.activate();
        ui.notifications.info(localize("Spotify.Connected"));
        refreshSidebar(engine);
        engine.sync();
        break;
      case "spotifyDisconnect":
        await engine.spotify.disconnect();
        refreshSidebar(engine);
        break;
      case "playScenario": return playback.playScenario(target.dataset.scenarioId);
      case "togglePause": return playback.togglePause();
      case "skipTrack": return playback.skipTrack();
      case "stop": return playback.stop();
      case "openPanel": return openPanel();
    }
  } catch (err) {
    console.error(`${MODULE_ID} |`, err);
    ui.notifications.error(err.message);
  }
}

/** Add the bar to a freshly rendered Playlists tab. */
export function injectBar(app, html, engine, openPanel) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  root.querySelector(`.${BAR_CLASS}`)?.remove();
  const bar = document.createElement("section");
  bar.className = BAR_CLASS;
  bar.innerHTML = buildBar(engine);
  bar.addEventListener("click", event => onBarClick(event, engine, openPanel));
  const header = root.querySelector(".directory-header");
  if (header) header.after(bar);
  else root.prepend(bar);
}

/** Update every bar on the page (sidebar and popped-out Playlists tabs). */
export function refreshSidebar(engine) {
  for (const bar of document.querySelectorAll(`.${BAR_CLASS}`)) bar.innerHTML = buildBar(engine);
}
