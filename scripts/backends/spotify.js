/**
 * Spotify playback with the Spotify Web Playback SDK. Every listener connects their own Spotify
 * Premium account (Spotify only streams full tracks to Premium accounts); this browser then becomes
 * a Spotify device that the module starts playlists on.
 *
 * Login uses the Authorization Code flow with PKCE, so only a Client ID is needed - no secret.
 */

import { MODULE_ID, SETTINGS, localize } from "../constants.js";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const SCOPES = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";
const CALLBACK_TYPE = "dxcufgbs-scenario-soundtrack-spotify-auth";
const CALLBACK_STORAGE_KEY = "dxcufgbs-scenario-soundtrack.spotify-callback";
const LOGIN_TIMEOUT = 5 * 60 * 1000;

/* -------------------------------------------- */
/*  Login                                        */
/* -------------------------------------------- */

function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export class SpotifyAuth {
  #refreshing = null;

  static get clientId() {
    return String(game.settings.get(MODULE_ID, SETTINGS.spotifyClientId) ?? "").trim();
  }

  /** The address Spotify sends people back to; it must be added to the Spotify app's Redirect URIs. */
  static get redirectUri() {
    return new URL(foundry.utils.getRoute(`modules/${MODULE_ID}/auth/spotify-callback.html`), window.location.origin).href;
  }

  static get configured() {
    return !!this.clientId;
  }

  get tokens() {
    const tokens = game.settings.get(MODULE_ID, SETTINGS.spotifyAuth);
    // Tokens belong to the Client ID they were issued for.
    return tokens?.refreshToken && tokens.clientId === SpotifyAuth.clientId ? tokens : null;
  }

  get connected() {
    return !!this.tokens;
  }

  async #save(tokens) {
    await game.settings.set(MODULE_ID, SETTINGS.spotifyAuth, tokens);
  }

  async logout() {
    await this.#save({});
  }

  /** Open the Spotify login in a popup. Must be called from a click. */
  async login() {
    const clientId = SpotifyAuth.clientId;
    if (!clientId) throw new Error(localize("Spotify.NoClientId"));
    if (!window.isSecureContext || !crypto.subtle) throw new Error(localize("Spotify.NeedsHttps"));

    const verifier = randomString(64);
    const state = randomString(16);
    const redirectUri = SpotifyAuth.redirectUri;
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      code_challenge_method: "S256",
      code_challenge: await codeChallenge(verifier)
    });

    try { localStorage.removeItem(CALLBACK_STORAGE_KEY); } catch (err) { /* storage blocked */ }
    const popup = window.open(url.href, "dxcufgbs-scenario-soundtrack-spotify", "width=500,height=760");
    if (!popup) throw new Error(localize("Spotify.PopupBlocked"));

    const result = await new Promise((resolve, reject) => {
      const finish = data => {
        window.removeEventListener("message", onMessage);
        window.removeEventListener("storage", onStorage);
        clearTimeout(timer);
        try { localStorage.removeItem(CALLBACK_STORAGE_KEY); } catch (err) { /* storage blocked */ }
        resolve(data);
      };
      const onMessage = event => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === CALLBACK_TYPE && event.data.state === state) finish(event.data);
      };
      const onStorage = event => {
        if (event.key !== CALLBACK_STORAGE_KEY || !event.newValue) return;
        try {
          const data = JSON.parse(event.newValue);
          if (data?.state === state) finish(data);
        } catch (err) { /* not ours */ }
      };
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        window.removeEventListener("storage", onStorage);
        reject(new Error(localize("Spotify.LoginTimeout")));
      }, LOGIN_TIMEOUT);
      window.addEventListener("message", onMessage);
      window.addEventListener("storage", onStorage);
    });

    if (result.error || !result.code) throw new Error(localize("Spotify.LoginFailed", { error: result.error ?? "no code" }));
    const data = await this.#requestToken({
      client_id: clientId,
      grant_type: "authorization_code",
      code: result.code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    });
    await this.#storeTokenResponse(data, clientId);
  }

  async #requestToken(params) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error_description || data.error || `HTTP ${response.status}`);
      error.code = data.error;
      throw error;
    }
    return data;
  }

  async #storeTokenResponse(data, clientId, previousRefresh) {
    const tokens = {
      clientId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || previousRefresh,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000
    };
    await this.#save(tokens);
    return tokens;
  }

  /** A valid access token, refreshed when needed. */
  async getAccessToken({ force = false } = {}) {
    const tokens = this.tokens;
    if (!tokens) throw new Error(localize("Spotify.NotConnected"));
    if (!force && tokens.accessToken && tokens.expiresAt > Date.now()) return tokens.accessToken;
    this.#refreshing ??= this.#requestToken({
      client_id: tokens.clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken
    }).then(data => this.#storeTokenResponse(data, tokens.clientId, tokens.refreshToken))
      .catch(async err => {
        // A revoked or expired refresh token means logging in again.
        if (err.code === "invalid_grant") await this.logout();
        throw err;
      })
      .finally(() => { this.#refreshing = null; });
    return (await this.#refreshing).accessToken;
  }
}

/* -------------------------------------------- */
/*  Player                                       */
/* -------------------------------------------- */

let sdkPromise = null;

function loadSdk() {
  if (window.Spotify?.Player) return Promise.resolve();
  sdkPromise ??= new Promise((resolve, reject) => {
    const previous = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("The Spotify player could not be loaded."));
    };
    document.head.append(script);
  });
  return sdkPromise;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class SpotifyBackend {
  name = "spotify";
  auth = new SpotifyAuth();

  /** @type {Spotify.Player|null} */
  player = null;
  deviceId = null;

  #ready = null;
  #volume = 0;
  #playing = false;
  #warned = new Set();

  get available() {
    return SpotifyAuth.configured && this.auth.connected;
  }

  /** Show a warning once per session. */
  warnOnce(key, message) {
    if (this.#warned.has(key)) return;
    this.#warned.add(key);
    ui.notifications.warn(message, { permanent: key !== "notConnected" });
  }

  async api(method, path, { query, body } = {}, retry = true) {
    const url = new URL(`${API_URL}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) if (value != null) url.searchParams.set(key, value);
    const token = await this.auth.getAccessToken();
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (retry && response.status === 401) {
      await this.auth.getAccessToken({ force: true });
      return this.api(method, path, { query, body }, false);
    }
    if (retry && response.status === 429) {
      await sleep((Number(response.headers.get("Retry-After")) || 2) * 1000);
      return this.api(method, path, { query, body }, false);
    }
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (err) { /* not JSON */ }
    if (!response.ok) {
      const error = new Error(data?.error?.message || `Spotify: HTTP ${response.status}`);
      error.status = response.status;
      error.reason = data?.error?.reason;
      throw error;
    }
    return data;
  }

  #ensurePlayer() {
    this.#ready ??= (async () => {
      await loadSdk();
      const player = new window.Spotify.Player({
        name: `Foundry VTT – ${game.user.name}`,
        volume: this.#volume,
        getOAuthToken: callback => {
          this.auth.getAccessToken().then(callback).catch(err => console.error("dxcufgbs-scenario-soundtrack | Spotify token", err));
        }
      });
      const ready = new Promise((resolve, reject) => {
        player.addListener("ready", ({ device_id }) => {
          this.deviceId = device_id;
          resolve();
        });
        player.addListener("not_ready", () => { this.deviceId = null; });
        player.addListener("initialization_error", ({ message }) => {
          this.warnOnce("init", localize("Spotify.InitError", { message }));
          reject(new Error(message));
        });
        player.addListener("authentication_error", ({ message }) => {
          this.warnOnce("auth", localize("Spotify.AuthError", { message }));
          reject(new Error(message));
        });
        player.addListener("account_error", ({ message }) => {
          this.warnOnce("account", localize("Spotify.PremiumRequired"));
          reject(new Error(message));
        });
        player.addListener("playback_error", ({ message }) => console.warn("dxcufgbs-scenario-soundtrack | Spotify playback error", message));
      });
      if (!(await player.connect())) throw new Error("Spotify player could not connect.");
      this.player = player;
      await Promise.race([ready, sleep(20000).then(() => { throw new Error("Spotify player did not become ready."); })]);
      return player;
    })().catch(err => {
      this.player?.disconnect();
      this.player = null;
      this.#ready = null;
      throw err;
    });
    return this.#ready;
  }

  /** Number of tracks in a playlist/album, to start a shuffled list at a random track. */
  async #contextSize(source) {
    try {
      if (source.kind === "album") return (await this.api("GET", `/albums/${source.id}`))?.total_tracks ?? null;
      if (source.kind === "playlist") {
        const data = await this.api("GET", `/playlists/${source.id}`, { query: { fields: "tracks.total" } });
        return data?.tracks?.total ?? data?.items?.total ?? null;
      }
    } catch (err) {
      console.debug("dxcufgbs-scenario-soundtrack | could not read Spotify list size", err);
    }
    return null;
  }

  async play(source, { shuffle = true, volume = 0 } = {}) {
    if (!SpotifyAuth.configured) return false;
    if (!this.auth.connected) {
      this.warnOnce("notConnected", localize("Spotify.ConnectToHear"));
      return false;
    }
    this.#volume = Math.clamp(volume, 0, 1);
    const player = await this.#ensurePlayer();
    await player.setVolume(this.#volume);

    const body = source.kind === "track"
      ? { uris: [`spotify:track:${source.id}`] }
      : { context_uri: `spotify:${source.kind}:${source.id}` };
    if (shuffle && (source.kind === "playlist" || source.kind === "album")) {
      const total = await this.#contextSize(source);
      if (total > 1) body.offset = { position: Math.floor(Math.random() * total) };
    }

    // The device can take a moment to be known to Spotify after "ready".
    for (let attempt = 0; ; attempt++) {
      try {
        await this.api("PUT", "/me/player/play", { query: { device_id: this.deviceId }, body });
        break;
      } catch (err) {
        if (err.status === 404 && attempt < 2) {
          await sleep(1500);
          continue;
        }
        if (err.status === 403 && err.reason === "PREMIUM_REQUIRED") this.warnOnce("account", localize("Spotify.PremiumRequired"));
        throw err;
      }
    }
    this.#playing = true;
    const device_id = this.deviceId;
    await Promise.allSettled([
      this.api("PUT", "/me/player/shuffle", { query: { state: String(!!shuffle), device_id } }),
      this.api("PUT", "/me/player/repeat", { query: { state: source.kind === "track" ? "track" : "context", device_id } })
    ]);
    return true;
  }

  stop() {
    if (!this.#playing) return;
    this.#playing = false;
    this.player?.pause().catch(() => {});
  }

  pause() {
    this.player?.pause().catch(() => {});
  }

  resume() {
    if (this.#playing) this.player?.resume().catch(() => {});
  }

  next() {
    if (this.#playing) this.player?.nextTrack().catch(() => {});
  }

  /** @param {number} volume 0..1 */
  setVolume(volume) {
    this.#volume = Math.clamp(volume, 0, 1);
    this.player?.setVolume(this.#volume).catch(() => {});
  }

  /** Helps browsers that only allow audio after a click (Safari, mobile). Call from a click handler. */
  activate() {
    this.player?.activateElement?.();
  }

  async disconnect() {
    this.#playing = false;
    this.player?.disconnect();
    this.player = null;
    this.deviceId = null;
    this.#ready = null;
    await this.auth.logout();
  }
}
