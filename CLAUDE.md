# Dxcufgb's Scenario Soundtracks

FoundryVTT v13 module (id `dxcufgbs-scenario-soundtrack`, singular, unlike the repository name; the install folder
must have the same name). The GM binds Spotify, YouTube and YouTube Music playlists to scenarios (exploration,
combat, ...) and custom themes in a control panel. Every client plays what the GM picks, at the volume of its own
Music slider (`core.globalPlaylistVolume`). Scenes can carry a scenario, and combat can switch it automatically. No
build step and no npm dependencies.

## Layout
- `scripts/main.js` – settings, keybinding, the module API (`game.modules.get(...).api`), the
  `dxcufgbs-scenario-soundtrack.changed` hook (from the `state` setting's `onChange`), music-slider tracking, the
  Playlists tab bar hook, combat automation (`updateCombat` / `deleteCombat`).
- `scripts/constants.js` – `MODULE_ID`, `SETTINGS` keys, `DEFAULT_SCENARIOS`, `SOURCE_ICONS`, `localize`,
  `escapeHTML`.
- `scripts/library.js` – the GM's library in the `library` world setting (folders, lists, scenarios, automation):
  `parseSource` (link → `{source, kind, id}`), `fetchTitle` (oEmbed), `normalizeLibrary`, CRUD helpers,
  `addSuggestions`.
- `scripts/state.js` – what is playing, in the `state` world setting (`scenarioId`, `listId`, `token`, `paused`,
  `skip`, `rotation`, `auto`, `previous`): `playScenario`, `playList`, `stop`, `pause`, `skipTrack`, `nextList`,
  `restorePrevious`, `isResponsibleGM`.
- `scripts/engine.js` – `SoundtrackEngine`, runs on every client: follows `state` (`sync`, queued) and plays it
  through the matching backend, fading out on stop.
- `scripts/backends/spotify.js` – `SpotifyAuth` (Authorization Code + PKCE login in a popup, token refresh) and
  `SpotifyBackend` (Web Playback SDK device, Web API calls).
- `scripts/backends/youtube.js` – `YouTubeBackend`: one hidden YouTube IFrame player for YouTube and YouTube Music.
- `auth/spotify-callback.html` – static page Spotify redirects to; hands `code` / `state` / `error` back to the
  Foundry window (`postMessage` to the same origin, plus a `localStorage` entry for a lost `window.opener`).
- `scripts/apps/control-panel.js` + `templates/control-panel.hbs` – the GM control panel (library tree, scenarios,
  drag and drop, automation, Spotify Client ID, suggestions, export/import).
- `scripts/sidebar.js` – the bar in the Playlists tab (now playing, Spotify connect for everyone, GM controls).
- `scripts/scenes.js` – scene ↔ scenario binding (scene flag `scenario`), the "which soundtrack?" prompt, playing
  on scene activation, scene context-menu entries.
- `scripts/transfer.js` – export / import of the whole setup (`parseExport` validates and cleans the file,
  `mergeLibrary`, `applyImport`). `scripts/suggestions.js` – `SUGGESTIONS`, the built-in suggested playlists.
- `styles/soundtracks.css`, `lang/en.json` (`SST.*`).
- `.github/workflows/ci.yml` / `release.yml` – thin callers of `dxcufgb/foundry-module-ci` (checks, packaging,
  release); identical in every module, do not edit them here. `claude.yml` – the Claude review.

## Conventions
- `MODULE_ID` must equal `id` in `module.json`; CI checks it.
- Every visible setting needs a Name and Hint in `lang/en.json`; CI checks it.
- Settings: `library`, `state` (world, hidden), `spotifyClientId`, `showToPlayers` (world, visible); `enabled`
  (client, visible), `askOnNewScene` (client, registered in `setup`, visible only to GMs), `spotifyAuth`,
  `expandedFolders` (client, hidden).
- HTML built in strings goes through `escapeHTML`; the panel template uses `{{ }}` only (no `{{{ }}}`).
- Update `README.md` when behaviour, settings or the Spotify setup steps change.

## Review focus
- **Spotify tokens** live only in the `spotifyAuth` setting: `scope: "client"`, `config: false`, i.e. this browser's
  `localStorage`, one login per person and browser. Value `{clientId, accessToken, refreshToken, expiresAt}`; tokens
  count only for the Client ID they were issued for (`SpotifyAuth.tokens`); `logout` and an `invalid_grant` refresh
  clear them. Never move them to a `world` setting, a flag, a document, a chat message, a socket or a log line (the
  `getOAuthToken` callback logs only the error), and never add a client secret: the flow is PKCE (`S256`) with the
  Client ID only. The access token goes only to `accounts.spotify.com` / `api.spotify.com` and the SDK callback.
- **Login callback contract**: `auth/spotify-callback.html`, `CALLBACK_TYPE` and `CALLBACK_STORAGE_KEY` must stay in
  step with `spotify.js`. The redirect URI is built from that file's path (`SpotifyAuth.redirectUri`) and every GM
  has registered it in their Spotify app, so do not move or rename it. `login` must keep checking `event.origin` and
  the random `state`, remove the `localStorage` entry before and after use, and the callback page must never put
  URL values into HTML (it uses `textContent`). It ships in `module.zip`, so it may contain no secrets.
- **Only the GM changes playback**: `setState` refuses non-GMs; library, scene flags and the Client ID are written
  only from GM-only UI (`openPanel`, `restricted` keybinding, `game.user.isGM` checks), and by default Foundry refuses
  world-setting writes from players. Automations (combat, scene
  activation) run only where `isResponsibleGM()` is true; every client merely follows `state` in `engine.sync`.
- **Players can read world settings**: `library` and `state` reach every client. `showToPlayers` only hides the
  names in the players' bar; it is not a secret store, so never put anything private there.
- **Links and ids**: players are only ever created from `parseSource` output (Spotify ids `[A-Za-z0-9]+`, YouTube
  ids `[\w-]`), never from the raw URL. Spotify URIs and API paths are built from those ids; `parseExport` validates
  ids (`validId`), icons and lengths of an import. Keep these checks when adding sources or fields.
- **Network**: only `accounts.spotify.com`, `api.spotify.com`, the SDK at `sdk.scdn.co`, `www.youtube.com`
  (IFrame API, oEmbed) and `open.spotify.com/oembed`. These URLs are constants; never make them configurable.
- **Escaping**: playlist, folder, scenario and scene names, URLs and icons from settings or imports must be escaped
  (`escapeHTML` or `{{ }}`) wherever they reach HTML, including attribute values.
- **Audio**: playback waits for `game.audio.unlock`; volume is always the Music slider × the list's own `volume`
  (clamped 0–1); `enabled` off stops playback on that client only.
