# WAD level host + game modes

- `multiplayer/wadLevelHost.js` — reusable first-person WAD-level host. Loads a
  level via WadLevelRenderer, runs the FP camera/controller + render loop, draws
  mode entities as billboards, drives a pluggable mode. Now also: builds wall
  triangles from the level for `losClear()` (line-of-sight occlusion), uses the
  WAD's real `playerStarts` for spawns, and posts `/api/wad/select {map}` on
  start so a room can be chosen.
- `simulation/arenaBot.js` — arena combatant; only acquires/fires on targets it
  has line of sight to (via the host's losClear).
- `demos_code/wadModes.js` — modes: deathmatch / tdm (red vs blue + you, LoS-gated
  combat, WAD spawns, respawn), **Capture the Flag in the room** (flags at team
  starts, carry/drop/return, bot objectives, capture scoring), bomb delegates to
  CSBotManager (Counter-Strike, CS-format maps).
- `demos_code/wadModePicker.js` — room (map) + mode picker; Launch mounts the host.

  import { mountWadModePicker } from "./wadModePicker.js";
  mountWadModePicker({ bridgeUrl });

Bridge: `POST /api/wad/select { map }` rebuilds level geometry for that map;
`GET /api/wad/info` now returns `maps`.

Verify in Chrome (untested here): LoS is ray-vs-wall-triangle from the level's
3D wallVerts; CTF flag/home points come from WAD player starts (may need spacing
tuning per map); room switch reloads geometry + textures after select.
