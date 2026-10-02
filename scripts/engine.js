/**
 * Runs on every client: follows the playback state the GM sets and plays it through the matching
 * backend, at the volume of Foundry's own "Music" slider (core.globalPlaylistVolume).
 */

import { MODULE_ID, SETTINGS, localize } from "./constants.js";
import { getLibrary, parseSource } from "./library.js";
import { getState } from "./state.js";
import { YouTubeBackend } from "./backends/youtube.js";
import { SpotifyBackend } from "./backends/spotify.js";

const FADE_MS = 800;

/** Foundry's music volume (0..1), as set by the slider in the Playlists tab. */
export function getMusicVolume() {
  return Number(game.settings.get("core", "globalPlaylistVolume") ?? 0.5);
}

export class SoundtrackEngine {
  youtube = new YouTubeBackend();
  spotify = new SpotifyBackend();

  /** What this client is playing: { token, listId, backend, skip, paused, started, listVolume } */
  current = null;

  #musicVolume = getMusicVolume();
  #queue = Promise.resolve();

  get enabled() {
    return game.settings.get(MODULE_ID, SETTINGS.enabled);
  }

  get backends() {
    return [this.youtube, this.spotify];
  }

  /** Volume for the current list: music slider x the list's own volume. */
  get volume() {
    return Math.clamp(this.#musicVolume * (this.current?.listVolume ?? 1), 0, 1);
  }

  /** Called while the music slider moves and when the setting changes. */
  setMusicVolume(volume) {
    if (!Number.isFinite(volume)) return;
    this.#musicVolume = Math.clamp(volume, 0, 1);
    this.current?.backend?.setVolume(this.volume);
  }

  /** Re-read the state and catch up. Calls are queued so they never overlap. */
  sync() {
    this.#queue = this.#queue.then(() => this.#sync()).catch(err => {
      console.error(`${MODULE_ID} | playback failed`, err);
      if (game.user.isGM) ui.notifications.error(localize("Notify.PlaybackFailed", { error: err.message }));
    });
    return this.#queue;
  }

  async #sync() {
    const state = getState();
    const list = state.listId ? getLibrary().lists.find(l => l.id === state.listId) : null;
    const source = list ? parseSource(list.url) : null;
    if (!this.enabled || !list || !source) {
      await this.#stopCurrent();
      return;
    }

    // A new token (or an edited link) means a fresh start.
    if (this.current?.token !== state.token || this.current?.url !== list.url) {
      await this.#stopCurrent();
      const backend = source.source === "spotify" ? this.spotify : this.youtube;
      this.current = {
        token: state.token, listId: list.id, url: list.url, backend, source,
        skip: state.skip ?? 0, paused: !!state.paused, started: false, listVolume: list.volume ?? 1
      };
    }

    const current = this.current;
    current.listVolume = list.volume ?? 1;

    if (state.paused) {
      if (current.started && !current.paused) current.backend.pause();
      current.paused = true;
      return;
    }

    if (!current.started) {
      // Browsers only allow sound after the user has clicked somewhere on the page.
      await game.audio.unlock;
      if (this.current !== current) return;
      current.started = await current.backend.play(current.source, { shuffle: list.shuffle, volume: this.volume });
      current.paused = false;
      current.skip = state.skip ?? 0;
      return;
    }

    if (current.paused) {
      current.backend.resume();
      current.paused = false;
    }
    if ((state.skip ?? 0) !== current.skip) {
      current.skip = state.skip ?? 0;
      current.backend.next();
    }
    current.backend.setVolume(this.volume);
  }

  async #stopCurrent() {
    const current = this.current;
    this.current = null;
    if (!current?.started) return;
    if (!current.paused) await this.#fadeOut(current.backend, this.#musicVolume * current.listVolume);
    current.backend.stop();
  }

  async #fadeOut(backend, from) {
    const steps = 10;
    for (let i = steps - 1; i >= 0; i--) {
      backend.setVolume((from * i) / steps);
      await new Promise(resolve => setTimeout(resolve, FADE_MS / steps));
    }
  }
}
