/**
 * Suggested playlists for the built-in scenarios: for each one an instrumental D&D playlist on
 * YouTube Music and a companion YouTube playlist with long mixes and YouTube-only videos.
 * The GM can add them from the control panel ("Suggested playlists"); each lands in a
 * "Suggested playlists / <scenario>" folder and is bound to that scenario.
 *
 * The videos in them are other people's uploads, so one may go private or block playing outside YouTube
 * at any time. The YouTube player skips such videos inside a playlist.
 */

export const SUGGESTIONS = [
  // Exploration
  { scenario: "exploration", name: "D&D Exploration Ambience", url: "https://music.youtube.com/playlist?list=PLAh71KPTTdcE" },
  { scenario: "exploration", name: "D&D Exploration Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLEQpiSU_zQek" },

  // Combat
  { scenario: "combat", name: "D&D Combat Ambience", url: "https://music.youtube.com/playlist?list=PLSR8bD9FUb4M" },
  { scenario: "combat", name: "D&D Combat Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLUljcl3ChSMA" },

  // Boss fight
  { scenario: "boss", name: "D&D BBEG Ambience", url: "https://music.youtube.com/playlist?list=PLSsnOiicEydI" },
  { scenario: "boss", name: "D&D BBEG Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLWOscPupd48g" },

  // Town
  { scenario: "town", name: "D&D Town Ambience", url: "https://music.youtube.com/playlist?list=PLWIFQrc4hKz8" },
  { scenario: "town", name: "D&D Town Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLelEgrunLmdE" },

  // Tavern
  { scenario: "tavern", name: "D&D Tavern Ambience", url: "https://music.youtube.com/playlist?list=PLHvssN1otLkQ" },
  { scenario: "tavern", name: "D&D Tavern Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLDCOwK1QizRM" },

  // Dungeon
  { scenario: "dungeon", name: "D&D Dungeon", url: "https://music.youtube.com/playlist?list=PLVALMCEJKgVg" },
  { scenario: "dungeon", name: "D&D Dungeon (YouTube)", url: "https://www.youtube.com/playlist?list=PLecHjjoovntw" },

  // Tension
  { scenario: "tension", name: "D&D Suspense Ambience", url: "https://music.youtube.com/playlist?list=PLfizLpek1fnE" },
  { scenario: "tension", name: "D&D Suspense Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLT13j4s58deM" },

  // Rest
  { scenario: "rest", name: "D&D Downtime Ambience", url: "https://music.youtube.com/playlist?list=PLNiMzgcYKx1Q" },
  { scenario: "rest", name: "D&D Downtime Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLb4ZYlHdgnb8" },

  // Victory
  { scenario: "victory", name: "D&D Victory Ambience", url: "https://music.youtube.com/playlist?list=PLYhDPaFgZBRU" },
  { scenario: "victory", name: "D&D Victory Ambience (YouTube)", url: "https://www.youtube.com/playlist?list=PLaaut1JTtctQ" }
];
