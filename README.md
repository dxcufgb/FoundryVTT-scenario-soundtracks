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

Requirements: see [Installation](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Installation) in the wiki. Spotify needs a one-time setup first: [Spotify Setup](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Spotify-Setup).

## Documentation

The full guide is in the [wiki](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki):

- [Getting Started](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Getting-Started): the control panel and your first soundtrack
- [Playlists](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Playlists): supported links, folders, suggested playlists
- [Scenarios and Themes](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Scenarios-and-Themes): binding and playing playlists
- [Playing for the Table](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Playing-for-the-Table): what players hear and see
- [Scene Soundtracks](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Scene-Soundtracks), [Combat Automation](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Combat-Automation), [Import and Export](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Import-and-Export)
- [YouTube and YouTube Music](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/YouTube-and-YouTube-Music) and [Spotify Setup](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Spotify-Setup)
- [Settings](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Settings): the options in Configure Settings
- [API](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/API): macros, the scene flag and the hook for module authors
- [Troubleshooting](https://github.com/dxcufgb/FoundryVTT-scenario-soundtracks/wiki/Troubleshooting)

## License

[MIT](LICENSE)

## Releasing

For the maintainer: **Actions → Release module → Run workflow**, type the version (for example `1.2.3`) and run it. The module is checked and packaged first; only then is the release `v1.2.3` published with `module.json` and `module.zip`. CI and releases come from [dxcufgb/foundry-module-ci](https://github.com/dxcufgb/foundry-module-ci), the same for every module.
