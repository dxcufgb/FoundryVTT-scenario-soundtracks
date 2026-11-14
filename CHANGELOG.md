# Changelog

## Unreleased

- The current song is shown next to the scenario and the list, in the Playlists tab bar and in the control panel. Everyone sees the song their own browser is playing (with shuffle, listeners hear different songs).
- The Playlists tab bar shows scenario, list and song on a line each; a line that does not fit scrolls.

## 1.2.2

- Optional support for Dxcufgb's Debug Recorder: while a GM records, the module adds a snapshot of its runtime state (library counts, what is playing, player and Spotify connection state) and breadcrumbs for playback, scene, combat, import/export and player errors. It holds only counts, on/off values and the module's own fixed options, never playlist, scene or theme names, links or Spotify logins. Without the recorder nothing changes.
