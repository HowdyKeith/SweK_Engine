// FILE: simulation/weapons.js
//
// Weapon stats shared by the player and bots. Hitscan with per-pellet spread;
// rockets carry a splash radius. Used by wadModes' shootEnemyBot and by ArenaBot.
//
//   damage     per hit (per pellet for shotgun)
//   range      max engagement distance
//   fireCd     seconds between shots
//   hitChance  probability a pellet that's on-target actually lands
//   pellets    shots per trigger pull (shotgun > 1)
//   spread     half-angle jitter (radians) applied per pellet
//   splash     optional radius for area damage (rocket)

export const WEAPONS = {
  pistol:   { name: "Pistol",   damage: 30,   range: 45,  fireCd: 0.35, hitChance: 0.80, pellets: 1, spread: 0.015 },
  rifle:    { name: "Rifle",    damage: 16,   range: 55,  fireCd: 0.11, hitChance: 0.65, pellets: 1, spread: 0.030 },
  shotgun:  { name: "Shotgun",  damage: 11,   range: 20,  fireCd: 0.85, hitChance: 0.85, pellets: 8, spread: 0.130 },
  sniper:   { name: "Sniper",   damage: 95,   range: 130, fireCd: 1.30, hitChance: 0.95, pellets: 1, spread: 0.004 },
  rocket:   { name: "Rocket",   damage: 55,   range: 70,  fireCd: 1.00, hitChance: 1.00, pellets: 1, spread: 0.0, splash: 6 },
  rail:     { name: "Railgun",  damage: 100,  range: 200, fireCd: 1.40, hitChance: 1.00, pellets: 1, spread: 0.0 },
  instagib: { name: "Instagib", damage: 1000, range: 300, fireCd: 1.10, hitChance: 1.00, pellets: 1, spread: 0.0 },
};

// Default player loadout (number keys 1..N select these).
export const DEFAULT_LOADOUT = ["pistol", "rifle", "shotgun", "sniper", "rocket", "rail"];

// Gun Game progression — each kill bumps you up the ladder; finish it to win.
export const GUNGAME_LADDER = ["pistol", "shotgun", "rifle", "sniper", "rocket", "rail"];

// Bot baseline (matches the original ArenaBot constants for unchanged feel).
export const BOT_DEFAULT = { name: "Bot Rifle", damage: 18, range: 35, fireCd: 0.7, hitChance: 0.55, pellets: 1, spread: 0.04 };
