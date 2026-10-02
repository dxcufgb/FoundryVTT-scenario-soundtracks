/**
 * YouTube and YouTube Music playback through a hidden YouTube IFrame player.
 * YouTube Music links are played by their playlist/video id, which the normal player understands.
 */

import { localize } from "../constants.js";

const API_URL = "https://www.youtube.com/iframe_api";
const MAX_ERRORS_IN_A_ROW = 10;

let apiPromise = null;

function loadApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("The YouTube player could not be loaded."));
    };
    document.head.append(script);
  });
  return apiPromise;
}

/** The invisible element the players live in. It stays on screen (but transparent) so browsers keep it playing. */
export function getPlayerHost() {
  let host = document.getElementById("scenario-soundtracks-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "scenario-soundtracks-host";
    host.setAttribute("aria-hidden", "true");
    document.body.append(host);
  }
  return host;
}

export class YouTubeBackend {
  name = "youtube";

  /** @type {YT.Player|null} */
  player = null;

  #ready = null;
  #source = null;
  #shuffle = false;
  #shuffled = false;
  #volume = 0;
  #errors = 0;
  #wantPlaying = false;

  get available() {
    return true;
  }

  #ensurePlayer() {
    this.#ready ??= loadApi().then(YT => new Promise(resolve => {
      const element = document.createElement("div");
      getPlayerHost().append(element);
      this.player = new YT.Player(element, {
        width: 200,
        height: 200,
        playerVars: {
          autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3,
          playsinline: 1, rel: 0, origin: window.location.origin
        },
        events: {
          onReady: () => resolve(this.player),
          onStateChange: event => this.#onStateChange(event),
          onError: event => this.#onError(event)
        }
      });
    })).catch(err => {
      this.#ready = null;
      throw err;
    });
    return this.#ready;
  }

  async play(source, { shuffle = true, volume = 0 } = {}) {
    const player = await this.#ensurePlayer();
    this.#source = source;
    this.#shuffle = shuffle;
    this.#shuffled = false;
    this.#errors = 0;
    this.#wantPlaying = true;
    this.setVolume(volume);
    if (source.kind === "playlist") {
      player.loadPlaylist({ list: source.id, listType: "playlist", index: 0 });
    } else {
      player.loadVideoById({ videoId: source.id });
    }
    return true;
  }

  stop() {
    this.#source = null;
    this.#wantPlaying = false;
    try { this.player?.stopVideo?.(); } catch (err) { /* player not ready */ }
  }

  pause() {
    this.#wantPlaying = false;
    try { this.player?.pauseVideo?.(); } catch (err) { /* player not ready */ }
  }

  resume() {
    if (!this.#source) return;
    this.#wantPlaying = true;
    try { this.player?.playVideo?.(); } catch (err) { /* player not ready */ }
  }

  next() {
    if (!this.#source || !this.player) return;
    if (this.#source.kind === "playlist") this.player.nextVideo();
    else this.player.seekTo(0, true);
  }

  /** @param {number} volume 0..1 */
  setVolume(volume) {
    this.#volume = Math.clamp(volume, 0, 1);
    if (!this.player?.setVolume) return;
    this.player.setVolume(Math.round(this.#volume * 100));
    if (this.#volume > 0) this.player.unMute?.();
  }

  #onStateChange(event) {
    const YT = window.YT;
    const player = this.player;
    if (!this.#source || !player) return;
    switch (event.data) {
      case YT.PlayerState.PLAYING: {
        this.#errors = 0;
        // YouTube sometimes forgets the volume when a new video starts.
        this.setVolume(this.#volume);
        if (!this.#wantPlaying) {
          player.pauseVideo();
          break;
        }
        if (this.#source.kind !== "playlist") break;
        player.setLoop(true);
        if (this.#shuffle && !this.#shuffled) {
          const length = player.getPlaylist()?.length ?? 0;
          this.#shuffled = true;
          if (length > 1) {
            player.setShuffle(true);
            player.playVideoAt(Math.floor(Math.random() * length));
          }
        }
        break;
      }
      case YT.PlayerState.ENDED:
        // Single videos loop; playlists loop by themselves (setLoop).
        if (this.#source.kind === "video" && this.#wantPlaying) {
          player.seekTo(0, true);
          player.playVideo();
        }
        break;
    }
  }

  #onError(event) {
    // 2: bad id, 5: HTML5 error, 100: removed/private, 101/150: owner doesn't allow embedding.
    console.warn(`scenario-soundtracks | YouTube error ${event.data}`, this.#source);
    if (!this.#source) return;
    this.#errors++;
    if (this.#source.kind === "playlist" && this.#errors < MAX_ERRORS_IN_A_ROW) {
      this.player.nextVideo();
      return;
    }
    if (game.user.isGM) ui.notifications.warn(localize("Notify.YouTubeError", { code: event.data }));
  }
}
