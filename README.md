# Scenario Soundtracks

Play **Spotify**, **YouTube** and **YouTube Music** playlists for the scenes at your table, like exploration, combat, a tavern or a boss fight. The GM sets them up in a control panel, and the music plays for everyone at their own **Music** volume.

**Foundry VTT:** v13

## Installation

In Foundry, go to **Add-on Modules → Install Module**, paste this link into **Manifest URL** and click **Install**:

```
https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/releases/latest/download/module.json
```

### Installing from a clone (development)

The folder in `Data/modules` must be named after the module id, `dxcufgbs-scenario-soundtrack`. Otherwise Foundry reports *Invalid module "dxcufgbs-scenario-soundtrack" detected*. Clone it under that name:

```
git clone https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks.git dxcufgbs-scenario-soundtrack
```

## How it works

- **Playlists.** The GM adds playlists by pasting links. You can add as many as you like and sort them into folders, and folders can go inside other folders. Supported links:
  - Spotify playlists, albums, artists and tracks (`open.spotify.com/...` or `spotify:playlist:...`)
  - YouTube playlists and videos (`youtube.com/playlist?list=...`, `youtube.com/watch?v=...`, `youtu.be/...`). A single video loops.
  - YouTube Music playlists, albums and songs (`music.youtube.com/playlist?list=...`, `music.youtube.com/watch?v=...`)
- **Scenarios and themes.** The module comes with Exploration, Combat, Boss fight, Town, Tavern, Dungeon, Tension, Rest and Victory. You can add your own themes ("Feywild", "Haunted manor", …). Each scenario or theme can have any number of playlists bound to it. When it starts, one of them is picked, either at random (never the same one twice in a row) or in order.
- **Everyone hears the same music.** When the GM starts a scenario, every connected player's client plays it. Players who join later start it too.
- **Volume.** The music follows each person's own **Music** slider in the Playlists tab, the same slider Foundry's own playlists use. A player who wants it quieter just moves that slider. **Play soundtracks on this computer** (Configure Settings) turns it off completely for one person.
- **Combat automation.** You can choose a scenario that starts when combat begins (Combat by default). When the combat is deleted, the music goes back to what was playing before.

## Using it (GM)

1. Open the **Playlists** tab. A Scenario Soundtracks bar is now at the top. Click the sliders button to open the control panel. You can also give the panel a keybinding under **Configure Controls**.
2. Click **Add playlist** and paste a link. Leave the name empty to use the playlist's own title. You can also choose a folder, shuffle and a relative volume for playlists that are louder than the others.
3. Bind playlists to scenarios. Drag a playlist onto a scenario card, or use the **+ Bind a playlist…** menu on the card. Drag a whole folder onto a card to bind every playlist inside it.
4. Click ▶ on a scenario (in the panel, or the scenario buttons in the Playlists tab bar) to play it for everyone. The panel also has pause, next track, "another playlist from this scenario" and stop.

Drag playlists and folders onto folders to reorganise them. The search box filters the library.

### Macros

```js
const sst = game.modules.get("dxcufgbs-scenario-soundtrack").api;
sst.playScenario("Combat");          // by id or name, e.g. a custom theme "Feywild"
sst.playScenario("tavern", { listId: "…" });
sst.playList("Spooky ambience");     // one playlist, by id or name
sst.togglePause(); sst.skipTrack(); sst.nextList(); sst.stop();
sst.openPanel();
```

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
4. Copy the app's **Client ID** into the control panel (or **Configure Settings → Scenario Soundtracks**). No client secret is needed.

Each player (and the GM) then clicks the green Spotify button in the Playlists tab bar and logs in. The login is stored in that browser only. Each person's Spotify plays on their own account, so they hear the same playlist but may be on different tracks.

## License

[MIT](LICENSE)
