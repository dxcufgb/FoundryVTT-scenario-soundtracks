# Dxcufgb's Scenario Soundtracks

[![Foundry v13](https://img.shields.io/github/v/release/dxcufgb/FoundryVTT-scenario-soundtracks?label=Foundry%20v13&logo=foundryvirtualtabletop&color=ff6400)](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/dxcufgb/FoundryVTT-scenario-soundtracks/module.zip?label=downloads&color=blue)](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/releases)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/dxcufgb)\
[![CI](https://img.shields.io/github/actions/workflow/status/dxcufgb/FoundryVTT-scenario-soundtracks/ci.yml?branch=main&label=CI)](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/dxcufgb/FoundryVTT-scenario-soundtracks)](LICENSE)

<a href="https://dxcufgb.github.io/FVTT-dev-showcase/"><img src="https://dxcufgb.github.io/FVTT-dev-showcase/assets/img/workshop-badge.png" alt="Dxcufgb's Workshop: every Foundry VTT project, video and changelog in one place" width="650"></a>

Play **Spotify**, **YouTube** and **YouTube Music** playlists for the scenes at your table, like exploration, combat, a tavern or a boss fight. The GM sets them up in a control panel, and the music plays for everyone at their own **Music** volume.

**Foundry VTT:** v13

## Installation

In Foundry, go to **Add-on Modules → Install Module**, paste this link into **Manifest URL** and click **Install**:

```
https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/releases/latest/download/module.json
```

## How it works

- **Playlists.** The GM adds playlists by pasting links. You can add as many as you like and sort them into folders, and folders can go inside other folders. Supported links:
  - Spotify playlists, albums, artists and tracks (`open.spotify.com/...` or `spotify:playlist:...`)
  - YouTube playlists and videos (`youtube.com/playlist?list=...`, `youtube.com/watch?v=...`, `youtu.be/...`). A single video loops.
  - YouTube Music playlists, albums and songs (`music.youtube.com/playlist?list=...`, `music.youtube.com/watch?v=...`)
- **Scenarios and themes.** The module comes with Exploration, Combat, Boss fight, Town, Tavern, Dungeon, Tension, Rest and Victory. You can add your own themes ("Feywild", "Haunted manor", …). Each scenario or theme can have any number of playlists bound to it. When it starts, one of them is picked, either at random (never the same one twice in a row) or in order.
- **Everyone hears the same music.** When the GM starts a scenario, every connected player's client plays it. Players who join later start it too. The Playlists tab shows players which scenario and playlist is playing; turn off **Configure Settings → Show players what is playing** to keep e.g. a "Boss fight" soundtrack a surprise (players then only see "Soundtrack playing").
- **Volume.** The music follows each person's own **Music** slider in the Playlists tab, the same slider Foundry's own playlists use. A player who wants it quieter just moves that slider. **Play soundtracks on this computer** (Configure Settings) turns it off completely for one person.
- **Scene soundtracks.** When the GM views a scene that hasn't been set up yet, a small dialog asks which scenario soundtrack belongs to it, and suggests one based on the scene's name. Choose a scenario, **No soundtrack**, or **Ask later**. When a scene with a soundtrack is activated, that scenario starts for everyone. To change it later, right-click the scene in the Scenes tab or the navigation bar and choose **Scenario soundtrack…**. Turn the question off under **Configure Settings → Ask for a soundtrack when viewing a new scene**.
- **Import / export.** Save your whole setup to a file from the control panel: folders, playlists, scenarios and themes with their bound playlists, combat automation and scene soundtracks. You can then import it in another world. You can add it to that world's setup (playlists, folders and themes already there aren't duplicated) or replace that setup. Scene soundtracks are applied to scenes with the same name.
- **Combat automation.** In the control panel's **Automation** section you can choose a scenario that starts when combat begins (Combat by default), or **Nothing** to leave the music alone. When the combat is deleted, the music goes back to what was playing before, or stops if you untick **Go back to the previous music when combat ends**. If you start other music by hand during the fight, it is left alone when the combat ends.

## Using it (GM)

1. Open the **Playlists** tab. A Scenario Soundtracks bar is now at the top. Click the sliders button to open the control panel. You can also give the panel a keybinding under **Configure Controls**.
2. Click **Add playlist** and paste a link. Leave the name empty to use the playlist's own title. You can also choose a folder, shuffle and a relative volume for playlists that are louder than the others.

   Or click the wand button (**Suggested playlists**) to start from 18 ready-made instrumental D&D playlists, two for every built-in scenario: one on YouTube Music and a YouTube companion with long mixes and YouTube-only videos. Each one you pick goes into a *Suggested playlists / <scenario>* folder and is bound to its scenario; pick both and the scenario plays from either. The videos in them are other people's uploads and can disappear or stop being playable outside YouTube, so preview them with the ↗ link.
3. Bind playlists to scenarios. Drag a playlist onto a scenario card, or use the **+ Bind a playlist…** menu on the card. Drag a whole folder onto a card to bind every playlist inside it.
4. Click ▶ on a scenario (in the panel, or the scenario buttons in the Playlists tab bar) to play it for everyone. The panel also has pause, next track, "another playlist from this scenario" and stop.

Drag playlists and folders onto folders to reorganise them. The search box filters the library.

### Macros

```js
const sst = game.modules.get("dxcufgbs-scenario-soundtrack").api;
sst.playScenario("Combat");          // by id or name, e.g. a custom theme "Feywild"
sst.playScenario("tavern", { listId: "…" });  // a specific playlist bound to that scenario
sst.playList("Spooky ambience");     // one playlist, by id or name
sst.pause(); sst.resume(); sst.togglePause();
sst.skipTrack(); sst.nextList(); sst.stop();
sst.playSceneScenario(canvas.scene); // play the scenario bound to a scene, unless it is already playing
sst.getState();                      // what is playing: { scenarioId, listId, paused, … }
sst.getLibrary();                    // a copy of { folders, lists, scenarios, automation }
sst.openPanel();
sst.bindScene();                     // ask which scenario belongs to a scene (default: the current one)
sst.exportSetup();                   // download the whole setup as a file
await sst.importSetup(json, { mode: "merge", scenes: true });  // or mode: "replace"
```

Only the GM can change the music. For players, the playback calls (`playScenario`, `playList`, `pause`, `resume`, `togglePause`, `skipTrack`, `nextList`, `stop`, `playSceneScenario`) are refused with the warning "Only the GM can control the soundtrack.", `openPanel` shows the same warning, and `bindScene` does nothing. Every client hears what the GM starts. The playback calls are async; all but `playSceneScenario` resolve to `true` when the music changed, or `false` when nothing happened (unknown name, no playlists bound, nothing playing, not the GM). GM: `importSetup` takes the export as an object or JSON text, throws when it isn't a Scenario Soundtracks export, and resolves to the counts of what was added (`{ folders, lists, scenarios, bindings, scenes }`). `exportSetup` also returns the exported data.

**From another module.** The API is set in the `ready` hook, so use it from `ready` on and check that it is there:

```js
Hooks.once("ready", () => {
  const sst = game.modules.get("dxcufgbs-scenario-soundtrack")?.api;
  if (!sst) return;   // Scenario Soundtracks not installed or not enabled
  // …
});
```

Add `{ "id": "dxcufgbs-scenario-soundtrack", "type": "module" }` to `relationships.recommends` in your `module.json`. The module calls no hooks of its own; to react to the music changing, listen to `updateSetting` (and `createSetting`, the first time) for the setting with key `dxcufgbs-scenario-soundtrack.state`, and read it with `getState()`. A scene's soundtrack is the scene flag `scenario` (`scene.getFlag("dxcufgbs-scenario-soundtrack", "scenario")`): a scenario id, `""` for **No soundtrack**, or `undefined` when nobody has decided yet. `api.engine` is the player running on this client; it is internal and may change.

## YouTube / YouTube Music

YouTube works without any setup or account. A few things to know:

- Some uploads, mostly official music videos from labels, are blocked from playing outside youtube.com. The module skips them and moves to the next video in the playlist.
- Auto-generated "Mix" / "My Mix" playlists (ids starting with `RD`) often won't play outside YouTube. Save the songs to a normal playlist instead.
- Browsers only allow sound after you've clicked somewhere on the page, so music starts after a player's first click in Foundry.

## Spotify setup

Spotify only streams music into other apps through its **Web Playback SDK**. That has some requirements:

- **Everyone who wants to hear Spotify needs their own Spotify Premium account** and must connect it once. Players without Premium hear nothing for Spotify playlists, but YouTube playlists still work for them.
- **Foundry must be opened over `https://`**, for example on The Forge, behind a reverse proxy with a certificate, or on the host machine at `http://127.0.0.1:30000`. Spotify does not accept plain `http://` addresses such as `http://192.168.x.x:30000`.
- It works in **Chrome, Edge and Firefox**. It doesn't work in the **Foundry desktop app**, because the app lacks the DRM component Spotify needs. Join in a browser instead. Safari support depends on Spotify.

One-time setup by the GM:

1. Go to <https://developer.spotify.com/dashboard> and create an app. Tick **Web API** and **Web Playback SDK**.
2. In the control panel's **Spotify** section, copy the **Redirect URI**. It looks like `https://your-foundry/modules/dxcufgbs-scenario-soundtrack/auth/spotify-callback.html`. Add it under **Redirect URIs** in the Spotify app settings.
3. New Spotify apps start in *development mode*, where only listed accounts may log in. Under **User Management**, add the Spotify e-mail of every player (and yourself).
4. Copy the app's **Client ID** into the control panel (or **Configure Settings → Dxcufgb's Scenario Soundtracks**). No client secret is needed.

Each player (and the GM) then clicks the green Spotify button in the Playlists tab bar and logs in. The login is stored in that browser only. Each person's Spotify plays on their own account, so they hear the same playlist but may be on different tracks.

## License

[MIT](LICENSE)

## Releasing

For the maintainer: **Actions → Release module → Run workflow**, type the version (for example `1.2.3`) and run it. The module is checked and packaged first; only then is the release `v1.2.3` published with `module.json` and `module.zip`. CI and releases come from [dxcufgb/foundry-module-ci](https://github.com/dxcufgb/foundry-module-ci), the same for every module.
