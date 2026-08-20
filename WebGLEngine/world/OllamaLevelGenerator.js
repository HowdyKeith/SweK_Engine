// =============================================================================
// FILE: /world/OllamaLevelGenerator.js
// ROUND: 213
// =============================================================================
//
// Ollama-driven voxel level generation. The WAD arc start: ask an LLM
// for a structured room layout, parse the JSON, paint voxels into the
// world, spawn props as entities. No download required — every level
// is hallucinated fresh from a natural-language description.
//
// JSON schema returned by Ollama:
//   {
//     "name": "small dungeon",
//     "rooms": [
//       { "id": "main", "x": -10, "z": -10, "w": 20, "d": 20, "h": 6,
//         "floor": "stone", "wall": "stone", "ceiling": null }
//     ],
//     "corridors": [
//       { "from": "main", "to": "side", "width": 3 }
//     ],
//     "props": [
//       { "x": 0, "z": 0, "kind": "pillar" },
//       { "x": 5, "z": 5, "kind": "torch" }
//     ]
//   }
//
// Voxel ID mapping (uses world's existing block palette):
//   stone   → 1
//   dirt    → 2
//   wood    → 3
//   metal   → 4
//   glass   → 5
//
// Console:
//   window.ollamaLevel.generate("a small dungeon with a central pillar")
//   window.ollamaLevel.generate("a forest temple maze", { y: 10 })
//   window.ollamaLevel.preview("a tavern with two side rooms")  // shows plan, no voxels
//   window.ollamaLevel.clear()  // wipe last generated level
// =============================================================================

const MATERIAL_TO_VOXEL = {
    stone: 1,
    dirt:  2,
    wood:  3,
    metal: 4,
    glass: 5,
    snow:  5,   // v501 — winter dungeons (SNOW voxel)
    ice:   13,  // v501 — frozen floors/walls (ICE voxel, walkable)
};

const PROMPT_TEMPLATE = `You are a level designer for a voxel dungeon crawler. Given a description, output a JSON layout with rooms, corridors, stairs, props, pickups, spawns, pools, portals, and an exit.

REQUIREMENTS:
- Output ONLY valid JSON. No prose, no markdown fences, no explanation.
- Coordinates are in voxels (integer). Rooms are axis-aligned rectangles in the XZ plane.
- Optional top-level field "time_of_day" pins the dungeon's lighting to a fixed time. Values: a number 0-24 (hours, fractional allowed), or one of "dawn" | "morning" | "noon" | "afternoon" | "dusk" | "twilight" | "night" | "midnight" | "pre_dawn". OMIT this field for most dungeons so the day/night cycle keeps running. Pin it when the description calls for atmospheric fixed lighting — e.g. "haunted catacombs at midnight" → "midnight"; "sun-drenched temple" → "noon"; "blood-red dusk arena" → "dusk".
- Optional top-level field "weather" overrides the time-of-day-derived weather. Values: "clear" | "rain" | "mist" | "snow". OMIT this field for most dungeons so weather follows time-of-day defaults (mist at dawn, rain at dusk, clear otherwise). Set explicitly when the description calls for it — "snow" for ice/tundra/winter dungeons, "rain" for storm/swamp/coastal scenes, "mist" for haunted/foggy/marshland scenes, "clear" to force fair weather even at dusk.
- Each room has: id (string), x (left), z (front), w (width 8-32), d (depth 8-32), h (height 4-10), wall (material), floor (material), ceiling (material or null for open), y (vertical offset in voxels, default 0, range -4 to +6 for UPPER FLOORS, BASEMENTS, RAISED PLATFORMS), water (depth 0-6; 0=dry, 1-2=ankle/knee FLOODED CORRIDOR, 3-4=waist-deep WADE, 5-6=FULLY SUBMERGED SWIM ROOM — only set when the room is described as flooded/cistern/sewer/aquatic; reserve 5-6 for rooms that should require swimming), gravity (multiplier in range 0.4 - 1.8; default 1.0; use 0.4-0.7 for ZERO-G CHAMBERS, AIR SHAFTS, ASTRAL VOIDS; use 1.4-1.8 for FORGES, GRAVITY WELLS, COLLAPSED ROOMS — only set when the description calls for it), atmosphere ("normal" | "thin" | "vacuum"; default "normal"; use "vacuum" for SPACE / MOON / VOID rooms and "thin" for MARTIAN / HIGH-ALTITUDE / DESOLATE rooms — these drain the player's suit oxygen), terrain ("flat" | "hills" | "rough"; default "flat"; "hills" gives gentle ±2 voxel bumps for a CAVERN, GARDEN, or NATURAL CHAMBER feel; "rough" gives chaotic ±3 voxel terrain for COLLAPSED RUINS, GROTTO, or BROKEN MINE rooms — only set when the room is described as natural, cavern, garden, ruin, or otherwise non-architectural), platforming (boolean; default false; when true, ~40% of floor cells are dug 4 voxels deep, forming an ISLAND PATTERN of platforms separated by pits — the player must use JETPACK (hold F), JUMP PADS, or KAIJU MODE to cross. Combine with exit.height for vertical challenges; combine with water>=3 to fill pits as pools. Only set when description calls for platforming: "pit of platforms", "scattered ledges over a chasm", "stepping stones across the void".)
- Materials: "stone", "dirt", "wood", "metal", "glass", "snow", "ice". Use "snow" and "ice" for FROZEN / TUNDRA / WINTER / GLACIER dungeons (snow = soft white floors/walls; ice = pale-blue frozen floors, slick frozen lakes). Pair winter material with weather:"snow".
- Corridors connect two room ids by id; corridor width 2-4 voxels (between rooms at SAME y)
- Stairs connect rooms at DIFFERENT y; {from, to, width 2-3}
- Props are decorative: kind in ["pillar", "torch", "altar", "chest", "fountain", "throne"]
- Pickups: kind in ["health", "ammo", "gravity", "kaiju", "o2_regulator", "bullet_pen", "key_red", "key_blue", "key_yellow"], placed inside rooms. The "gravity" pickup is a rare powerup. The "kaiju" pickup is a VERY rare powerup that scales the player up to building-size for 12 seconds (use AT MOST ONE per dungeon, only in dramatic boss-level or finale rooms). The "o2_regulator" pickup HALVES suit oxygen drain for 60 seconds — place 1-2 in vacuum / space / submerged dungeons where O₂ matters. The "bullet_pen" pickup grants 30 seconds of ARMOR-PIERCING ammo that breaks STONE walls too (normally bullets only break wood/glass) — place 1 per dungeon in fortress / vault / collapsed-mine themes where structural destruction matters. The KEY colors (red/blue/yellow) match against doors with the same color requirement — use keys when the dungeon has locked passages.
- Spawns are enemy hints: kind in ["grunt", "sniper", "heavy", "kaiju_sky", "kaiju_space", "kaiju_cave", "kaiju_underground", "kaiju_water", "kaiju_hell", "kaiju_tech"]. The kaiju kinds are LARGER, scarier enemies with themed visuals (red for hell, violet for space, blue for water, etc). Use kaiju kinds when the dungeon description matches their origin — "infernal" / "abyssal" / "haunted" → hell or underground; "frozen" / "crystal" → water; "starlit" / "void" → space; "rusted" / "automaton" → tech. Mix 1-2 kaiju with regular grunts in atmospheric dungeons.
- POOLS are explicit water or lava placements within a room: {x, z, w, d, kind, depth} — kind in ["water", "lava"], depth 1-3 voxels deep, used for moats, fountains, lava pits, cisterns. Optional — only include when the dungeon description calls for water/lava features.
- PORTALS are paired teleporters that let the player skip between two locations in the SAME dungeon. Schema: [{a:{x,z,roomId?}, b:{x,z,roomId?}}]. Each portal pair has two endpoints; stepping onto one teleports the player to the other. Use sparingly (0-2 pairs) and only when the dungeon would benefit from a shortcut (e.g. between distant rooms, or between floors as an alternative to stairs).
- JUMP PADS are floor-mounted launchers. Schema: [{x, z}]. Stepping onto one shoots the player upward — in low-gravity rooms this can launch them many voxels high; in normal gravity it's a strong jump. Use jump pads to reach UPPER ALCOVES, MEZZANINES, or PORTALS placed at height. Optional (0-3 pads per level).
- PRESSURE PLATES are floor triggers that fire an action when the player steps on them. One-shot — each plate triggers exactly once per level. Schema: [{x, z, action, target?}] where action is one of:
    "open_wall"     → carve a 3×3 voxel wall opening at target {x, z}
    "spawn_bots"    → spawn 2-3 hostile bots in a target room (target {roomId} or center xz)
    "reveal_pickup" → drop a health pack at target {x, z}
    "drop_floor"    → carve a 3×3 floor pit at target {x, z}
  Use plates to create AMBUSH SETUPS (player steps on plate → bots spawn), HIDDEN ROOMS (open_wall reveals a passage), or REWARD TRADES (plate near exit → revealed pickup). Optional (0-3 plates per level). Place plates somewhere the player will plausibly walk; place targets sensibly (open_wall targets a wall voxel position, not air).
- DOORS are voxel wall segments that block passage between rooms until unlocked by the matching key. Schema: [{x, z, w?, h?, color}] where color is in ["red","blue","yellow"]. The door is carved automatically when the player approaches with the matching key. Use 0-3 doors per level, paired with keys placed in earlier rooms.
- Exit marks where the player advances to the next level — at a room id, defaults to the LAST room if omitted. Optional field "requires_keys": ["red","blue"] means the exit portal stays SEALED until all listed keys have been collected, even if all enemies are killed. Optional field "height": N lifts the exit portal N voxels above the room floor (range 0-5, clamped to room.h-1) — use this when the dungeon description calls for VERTICAL PLATFORMING ("the exit hangs near the ceiling", "a shaft above a pit") so the player must use the JETPACK (hold F), a jump pad, or kaiju mode to reach it.
- Keep level compact: 2-5 rooms total, world center around (0,0,0)
- For MULTI-FLOOR dungeons, mix room y values (some at 0, some at +3 or -3) connected via stairs.
- Aim for 2-4 pickups, 3-6 spawns. The exit should be reachable only after fighting through the others.
- Schema example (flooded crypt with a teleporter, a lava moat, and a low-gravity shaft):
{
  "name": "the drowned crypt",
  "rooms": [
    {"id":"entry","x":-8,"z":-8,"w":16,"d":16,"h":5,"y":0,"floor":"stone","wall":"stone","ceiling":"stone"},
    {"id":"cistern","x":12,"z":-6,"w":12,"d":12,"h":5,"y":0,"floor":"stone","wall":"stone","ceiling":null,"water":2},
    {"id":"shaft","x":-6,"z":12,"w":10,"d":10,"h":8,"y":3,"floor":"wood","wall":"stone","ceiling":null,"gravity":0.5}
  ],
  "corridors": [{"from":"entry","to":"cistern","width":3}],
  "stairs":    [],
  "pools":     [{"x":2,"z":2,"w":4,"d":4,"kind":"lava","depth":2}],
  "portals":   [{"a":{"x":18,"z":0,"roomId":"cistern"},"b":{"x":-1,"z":17,"roomId":"shaft"}}],
  "jump_pads": [{"x":-1,"z":13}],
  "props":     [{"x":0,"z":0,"kind":"pillar"},{"x":-5,"z":-5,"kind":"torch"}],
  "pickups":   [{"x":-4,"z":4,"kind":"health"},{"x":-1,"z":17,"kind":"ammo"}],
  "spawns":    [{"x":0,"z":4,"kind":"grunt"},{"x":18,"z":-2,"kind":"sniper"}],
  "exit":      {"roomId":"shaft"}
}

Description: `;

export class OllamaLevelGenerator {
    constructor({ ollama, world, router, assetLoader }) {
        this.ollama = ollama;
        this.world = world;
        this.router = router;
        this.assetLoader = assetLoader;
        this._lastLevel = null;
        this._lastSpawnedEntityIds = [];
        this._lastTouchedVoxels = [];   // [{x,y,z}] for clear()
        this._propsInstalled = false;
    }

    async generate(description, opts = {}) {
        if (!description) {
            console.warn("[OllamaLevel] generate() requires a description");
            return null;
        }
        if (!this.ollama) {
            console.warn("[OllamaLevel] no Ollama client available");
            return null;
        }
        await this._ensurePropsInstalled();
        const prompt = PROMPT_TEMPLATE + description;
        console.log(`[OllamaLevel] requesting layout for: "${description}"`);
        let response;
        try {
            response = await this.ollama.generate(prompt, { temperature: 0.7 });
        } catch (err) {
            console.error("[OllamaLevel] Ollama generate failed:", err);
            return null;
        }
        if (!response) {
            console.warn("[OllamaLevel] empty response from Ollama");
            return null;
        }
        const layout = this._parseLayout(response);
        if (!layout) {
            console.warn("[OllamaLevel] failed to parse layout JSON. Raw response:", response.slice(0, 200));
            return null;
        }
        const baseY = opts.y ?? this._defaultBaseY();
        await this.clear();
        this._applyLayout(layout, baseY);
        this._lastLevel = layout;
        // Round 259 — broadcast newly-acquired level to the OLLAMA PIP
        // panel as a thought bubble (auto-fades after 2s). Engine wires
        // window.pip in main.js.
        try {
            if (typeof window !== "undefined" && window.pip?.thought) {
                const label = layout.name || description || "new level";
                window.pip.thought(label);
            }
        } catch {}
        console.log(`[OllamaLevel] built level "${layout.name || description}": ${layout.rooms?.length || 0} rooms, ${layout.corridors?.length || 0} corridors, ${layout.props?.length || 0} props`);
        return layout;
    }

    // Returns parsed layout without applying voxels. Useful for plan-mode.
    async preview(description) {
        if (!this.ollama) return null;
        const prompt = PROMPT_TEMPLATE + description;
        const response = await this.ollama.generate(prompt, { temperature: 0.7 });
        return response ? this._parseLayout(response) : null;
    }

    async clear() {
        // Restore voxels touched by the last generation back to air (0).
        // Note: this only undoes the LAST generate. For full reset, call
        // world.regenerate().
        if (this.world?.setVoxel) {
            for (const v of this._lastTouchedVoxels) {
                try { this.world.setVoxel(v.x, v.y, v.z, 0); } catch {}
            }
        }
        for (const id of this._lastSpawnedEntityIds) {
            try { this.router?.exec({ type: "entity:despawn", id }); } catch {}
        }
        this._lastTouchedVoxels = [];
        this._lastSpawnedEntityIds = [];
    }

    // Round 323 — public apply path for layouts produced outside Ollama.
    // CSMapGenerator (and future hand-authored levels) build the same
    // JSON schema and call this method. Wraps the private painter and
    // sets _lastLevel so FPSShooter._pickSpawn(roomId) can resolve
    // spawn rooms by id.
    async applyLayout(layout, opts = {}) {
        if (!layout || !Array.isArray(layout.rooms)) {
            console.warn("[OllamaLevel] applyLayout: missing rooms[]");
            return null;
        }
        // Default safe ranges for missing fields so external callers can
        // omit them.
        layout.corridors = Array.isArray(layout.corridors) ? layout.corridors : [];
        layout.stairs    = Array.isArray(layout.stairs)    ? layout.stairs    : [];   // v325
        layout.props     = Array.isArray(layout.props)     ? layout.props     : [];
        layout.spawns    = Array.isArray(layout.spawns)    ? layout.spawns    : [];
        layout.pickups   = Array.isArray(layout.pickups)   ? layout.pickups   : [];
        const baseY = opts.y ?? this._defaultBaseY();
        if (opts.clearFirst !== false) await this.clear();
        this._applyLayout(layout, baseY);
        this._lastLevel = layout;
        return layout;
    }

    // -------------------------------------------------------------------------

    _parseLayout(text) {
        // Strip markdown fences and try to extract JSON. Ollama models
        // sometimes ignore our "no fences" instruction.
        let s = String(text).trim();
        s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
        // Find the first '{' and last '}' to be tolerant of leading prose
        const first = s.indexOf("{");
        const last  = s.lastIndexOf("}");
        if (first === -1 || last === -1 || last <= first) return null;
        s = s.slice(first, last + 1);
        try {
            const j = JSON.parse(s);
            // Validate minimal shape
            if (!Array.isArray(j.rooms)) return null;
            for (const r of j.rooms) {
                if (typeof r.x !== "number" || typeof r.z !== "number" ||
                    typeof r.w !== "number" || typeof r.d !== "number" ||
                    typeof r.h !== "number") return null;
                if (!r.id) r.id = `room_${Math.random().toString(36).slice(2,6)}`;
                if (!r.floor) r.floor = "stone";
                if (!r.wall)  r.wall = "stone";
                if (r.ceiling === undefined) r.ceiling = null;
                // Round 222 — vertical offset for multi-floor dungeons
                if (typeof r.y !== "number") r.y = 0;
                r.y = Math.max(-6, Math.min(8, r.y | 0));
                // Round 223 — flooded rooms (0=dry, 1-2=knee-deep)
                if (typeof r.water !== "number") r.water = 0;
                // Round 241 — water depth cap extended to 6 so dungeons
                // can be fully submerged (5-6 = swim rooms).
                r.water = Math.max(0, Math.min(6, r.water | 0));
                // Round 224 — per-room gravity multiplier (0.4=low-G, 1.0=normal, 1.8=high-G)
                if (typeof r.gravity !== "number") r.gravity = 1.0;
                r.gravity = Math.max(0.4, Math.min(1.8, r.gravity));
                // Round 236 — per-room atmosphere. Normalize to one of
                // three values; bad input → "normal". Empty string also
                // becomes "normal" so the field is genuinely optional.
                if (r.atmosphere !== "vacuum" && r.atmosphere !== "thin") {
                    r.atmosphere = "normal";
                }
                // Round 246 — procedural floor terrain. Default "flat"
                // preserves all prior behavior; "hills"/"rough" turn on
                // a per-cell heightmap stamp at room-build time.
                if (r.terrain !== "hills" && r.terrain !== "rough") {
                    r.terrain = "flat";
                }
                // Round 247 — platforming pits. Default false (legacy
                // behavior preserved). When true, room build phase will
                // carve ~40% of interior floor cells into 4-deep pits.
                r.platforming = (r.platforming === true);
            }
            j.corridors = Array.isArray(j.corridors) ? j.corridors : [];
            j.stairs    = Array.isArray(j.stairs)    ? j.stairs    : [];   // round 222
            j.props     = Array.isArray(j.props)     ? j.props     : [];
            j.pickups   = Array.isArray(j.pickups)   ? j.pickups   : [];   // round 219
            j.spawns    = Array.isArray(j.spawns)    ? j.spawns    : [];   // round 219
            j.pools     = Array.isArray(j.pools)     ? j.pools     : [];   // round 223
            j.portals   = Array.isArray(j.portals)   ? j.portals   : [];   // round 223
            j.jump_pads = Array.isArray(j.jump_pads) ? j.jump_pads : [];   // round 224
            j.doors     = Array.isArray(j.doors)     ? j.doors     : [];   // round 229
            j.plates    = Array.isArray(j.plates)    ? j.plates    : [];   // round 232
            // Round 238 — optional time_of_day pin. Accepted as either a
            // number 0-24 or a named alias; pass-through is fine, the
            // DayNightCycle resolves it on first tick after layout load.
            if (j.time_of_day != null && typeof j.time_of_day !== "number" && typeof j.time_of_day !== "string") {
                j.time_of_day = null;   // drop bad values silently
            }
            // Round 245 — optional weather override. Validated against
            // enum; bad values → null so Weather falls back to the
            // time-of-day default.
            const WEATHER_KINDS = ["clear", "rain", "mist", "snow"];
            if (typeof j.weather === "string" && WEATHER_KINDS.includes(j.weather)) {
                // keep as-is
            } else {
                j.weather = null;
            }
            // Round 219 — exit defaults to last room if missing
            if (!j.exit || typeof j.exit !== "object") {
                j.exit = { roomId: j.rooms[j.rooms.length - 1].id };
            } else if (!j.exit.roomId) {
                j.exit.roomId = j.rooms[j.rooms.length - 1].id;
            }
            // Round 229 — exit may carry a key-lock list
            if (!Array.isArray(j.exit.requires_keys)) j.exit.requires_keys = [];
            // Round 244 — exit.height clamped to [0, 5]; non-numeric → 0
            if (typeof j.exit.height === "number" && isFinite(j.exit.height)) {
                j.exit.height = Math.max(0, Math.min(5, j.exit.height | 0));
            } else {
                j.exit.height = 0;
            }
            return j;
        } catch {
            return null;
        }
    }

    _applyLayout(layout, baseY) {
        // Build a room lookup for corridor resolution
        const byId = {};
        for (const r of layout.rooms) byId[r.id] = r;

        // 1. Paint each room at its own baseY + room.y offset (round 222 — multi-floor)
        for (const r of layout.rooms) {
            this._paintRoom(r, baseY + (r.y | 0));
        }

        // 2. Carve corridors. We carve a horizontal slab connecting the
        //    centers of two rooms — overrides walls. Use only between
        //    rooms at the SAME y; if the model uses a corridor between
        //    floors we degrade gracefully by carving at the LOWER y.
        for (const c of layout.corridors) {
            const a = byId[c.from], b = byId[c.to];
            if (!a || !b) continue;
            const width = Math.max(2, Math.min(4, c.width | 0 || 2));
            const corridorY = baseY + Math.min(a.y | 0, b.y | 0);
            this._carveCorridor(a, b, width, corridorY);
        }

        // 3. Round 222 — carve stairs between rooms at different y. A
        //    stepped ramp 2-3 voxels wide and one voxel taller each step
        //    connects the two room centers. Carves air above each step
        //    so the player has headroom.
        for (const s of (layout.stairs || [])) {
            const a = byId[s.from], b = byId[s.to];
            if (!a || !b) continue;
            const width = Math.max(2, Math.min(3, s.width | 0 || 2));
            this._carveStairs(a, b, width, baseY);
        }

        // 4. Spawn props
        // Round 227 — reset torch tracker so a fresh dungeon doesn't
        // inherit torches from the previous level
        this._lastTorches = [];
        for (const p of layout.props) {
            this._spawnProp(p, baseY);
        }

        // 4b. Round 223 — apply pool placements (water/lava pits inside rooms)
        for (const pool of (layout.pools || [])) {
            this._addPool(pool, layout, baseY);
        }

        // 5. Round 219 — spawn pickups. Round 222 — each pickup lands
        //    at its owning room's vertical offset (so upper-floor
        //    pickups sit on the upper floor, not at baseY).
        this._lastPickupIds = [];
        for (const pu of (layout.pickups || [])) {
            const owner = this._findOwningRoom(pu, layout.rooms);
            const pickupY = baseY + (owner?.y | 0);
            const result = this._spawnPickup(pu, pickupY);
            if (result) this._lastPickupIds.push(result);
        }

        // 6. Round 219 — spawn the exit portal at the chosen room's
        //    center. The portal sits at the exit room's floor level
        //    (round 222 — honors room.y offset).
        this._lastExit = null;
        if (layout.exit?.roomId) {
            const r = byId[layout.exit.roomId];
            if (r) {
                this._lastExit = this._spawnExit(r, baseY + (r.y | 0), layout.exit);
            }
        }

        // 7. Round 223 — spawn teleporter portal pairs. Each pair is two
        //    entities. The pair info is recorded so main.js can register
        //    them with the FPS shooter; collision teleports the player
        //    to the other side (after a brief cooldown).
        this._lastPortalPairs = [];
        let portalPairIdx = 0;
        for (const pair of (layout.portals || [])) {
            if (!pair?.a || !pair?.b) continue;
            const pairId = `pp_${portalPairIdx++}`;
            const aResult = this._spawnPortal(pair.a, layout, baseY, pairId, "a");
            const bResult = this._spawnPortal(pair.b, layout, baseY, pairId, "b");
            if (aResult && bResult) {
                this._lastPortalPairs.push({ pairId, a: aResult, b: bResult });
            }
        }

        // 8. Round 224 — spawn jump pads (gravity launchers). Each pad
        //    lands at its owning room's floor level. Pads are recorded
        //    so FPSShooter can do proximity-trigger collision and
        //    launch the camera upward.
        this._lastJumpPads = [];
        for (const pad of (layout.jump_pads || [])) {
            const result = this._spawnJumpPad(pad, layout, baseY);
            if (result) this._lastJumpPads.push(result);
        }

        // 9. Round 229 — paint doors. A door is a small voxel wall
        //    segment (default 2 wide × 3 tall) that blocks a passage
        //    until the player has the matching key. The voxels are
        //    placed here; FPSShooter "opens" the door by carving them
        //    back to air when the player approaches with the right key.
        //    Door descriptor (with voxel coordinate list) is recorded
        //    so the open-action knows exactly which voxels to remove.
        this._lastDoors = [];
        let doorIdx = 0;
        for (const door of (layout.doors || [])) {
            const result = this._paintDoor(door, layout, baseY, doorIdx++);
            if (result) this._lastDoors.push(result);
        }

        // 10. Round 232 — spawn pressure plates. Each plate is a flat
        //     floor pad with an associated trigger action. Plates are
        //     entities for the renderer + descriptors held in
        //     _lastPlates so FPSShooter can do proximity detection,
        //     fire actions, and mark plates as consumed.
        this._lastPlates = [];
        let plateIdx = 0;
        for (const plate of (layout.plates || [])) {
            const result = this._spawnPlate(plate, layout, baseY, plateIdx++);
            if (result) this._lastPlates.push(result);
        }
    }

    // Round 232 — spawn a pressure plate entity + record the trigger
    // descriptor so FPSShooter can fire it on proximity.
    _spawnPlate(plate, layout, baseY, plateIdx) {
        if (!this.router) return null;
        const x = plate.x ?? 0;
        const z = plate.z ?? 0;
        const owner = this._findOwningRoom({ x, z }, layout.rooms);
        const padY = baseY + (owner?.y | 0) + 0.05;   // just above the floor
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "wad_plate",
            kind: "wad_plate",
            x, y: padY, z,
            scale: 1, yaw: 0,
        });
        if (!r?.ok || r.id == null) return null;
        this._lastSpawnedEntityIds.push(r.id);
        // Normalize the action + target. Default to "spawn_bots" if
        // the model emitted something we don't recognize so the plate
        // still does *something* when stepped on.
        const allowed = new Set(["open_wall", "spawn_bots", "reveal_pickup", "drop_floor"]);
        const action = allowed.has(plate.action) ? plate.action : "spawn_bots";
        const target = plate.target ?? null;
        return {
            id: `plate_${plateIdx}`,
            entityId: r.id,
            x, z,
            action,
            target,
            triggered: false,
        };
    }

    // Round 232 — accessor for plate descriptors
    getLastPlates() { return this._lastPlates || []; }

    // Round 229 — paint a door's voxel wall segment. Returns a
    // descriptor { id, color, voxels:[{x,y,z}], opened } so FPSShooter
    // can later open it by setting each voxel back to air.
    _paintDoor(door, layout, baseY, doorIdx) {
        if (!this.world?.setVoxel) return null;
        const w = Math.max(1, Math.min(4, door.w | 0 || 2));
        const h = Math.max(2, Math.min(5, door.h | 0 || 3));
        const x0 = door.x | 0;
        const z0 = door.z | 0;
        // Find owning room for the door's base Y
        const owner = this._findOwningRoom({ x: x0, z: z0 }, layout.rooms);
        const startY = baseY + (owner?.y | 0) + 1;
        const color = (door.color === "blue" || door.color === "yellow")
            ? door.color : "red";
        const voxels = [];
        // Doors run along whichever axis they appear horizontally narrow on
        // — default to X-axis if dimensions are ambiguous (single column).
        // For width w we sweep along X.
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const x = x0 + dx;
                const y = startY + dy;
                const z = z0;
                this._setVoxel(x, y, z, MATERIAL_TO_VOXEL.wood);
                voxels.push({ x, y, z });
            }
        }
        return {
            id: `door_${doorIdx}`,
            color,
            voxels,
            x: x0 + w / 2,
            z: z0 + 0.5,
            opened: false,
        };
    }

    // Round 229 — accessor: door descriptors for the current level
    getLastDoors() { return this._lastDoors || []; }

    // Round 222 — carve a stepped ramp between two rooms at different
    // vertical offsets. Each step is one voxel high. We go from the
    // lower room's edge to the upper room's edge in a straight line,
    // stepping up (or down) one voxel per stride. Carves air above
    // each step so the player has headroom.
    _carveStairs(a, b, width, baseY) {
        const ay = baseY + (a.y | 0);
        const by = baseY + (b.y | 0);
        const dy = by - ay;
        if (dy === 0) {
            // Same floor — degrade to corridor
            return this._carveCorridor(a, b, width, ay);
        }
        const ax = (a.x + a.w / 2) | 0;
        const az = (a.z + a.d / 2) | 0;
        const bx = (b.x + b.w / 2) | 0;
        const bz = (b.z + b.d / 2) | 0;
        const halfW = Math.max(1, Math.floor(width / 2));
        // Walk a straight line from a-center to b-center. Vary y linearly.
        const dx = bx - ax, dz = bz - az;
        const steps = Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dy));
        if (steps < 1) return;
        const stoneVox = MATERIAL_TO_VOXEL.stone;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = (ax + dx * t) | 0;
            const z = (az + dz * t) | 0;
            const y = (ay + dy * t) | 0;
            // Place stone for the step (across the width)
            for (let off = -halfW; off <= halfW; off++) {
                // Horizontal — step is at +Z if step runs along X, else at +X
                const isXMajor = Math.abs(dx) >= Math.abs(dz);
                const sx = isXMajor ? x : x + off;
                const sz = isXMajor ? z + off : z;
                this._setVoxel(sx, y, sz, stoneVox);
                // Carve 3 air voxels above each step (headroom)
                for (let h = 1; h <= 3; h++) {
                    this._setVoxel(sx, y + h, sz, 0);
                }
            }
        }
    }

    // Round 222 — find which room contains an (x,z) point. Used for
    // multi-floor pickup placement so upper-floor pickups sit on the
    // upper floor instead of falling through to baseY.
    _findOwningRoom(point, rooms) {
        for (const r of rooms) {
            if (point.x >= r.x && point.x < r.x + r.w &&
                point.z >= r.z && point.z < r.z + r.d) return r;
        }
        return null;
    }

    // Round 222 — accessor for total height span of generated level
    // (used by HUD / lore so deeper dungeons feel different)
    getLastLevelDepth() {
        if (!this._lastLevel?.rooms?.length) return 0;
        let minY = Infinity, maxY = -Infinity;
        for (const r of this._lastLevel.rooms) {
            const y = r.y | 0;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        return maxY - minY;
    }

    // Round 219 — spawn a pickup entity. Pickup positions are reported
    // back so callers (main.js) can register them with FPSShooter via
    // fps.registerPickup(id, {kind, value, x, z}).
    _spawnPickup(pu, baseY) {
        if (!this.router) return null;
        // Round 225 — gravity power-up is a third pickup kind
        // Round 229 — key colors are fourth/fifth/sixth pickup kinds
        let kind, value, color = null;
        if (pu.kind === "ammo") {
            kind  = "wad_pickup_ammo";
            value = 15;
        } else if (pu.kind === "gravity") {
            kind  = "wad_pickup_gravity";
            value = 6;
        } else if (pu.kind === "kaiju") {
            // Round 237 — kaiju mode power-up: scales player to giant
            // size for ~12 seconds. Value carries the duration (sec).
            kind  = "wad_pickup_kaiju";
            value = 12;
        } else if (pu.kind === "o2_regulator") {
            // Round 244 — halves suit O₂ drain for 60 seconds. Pairs
            // with vacuum/submerged dungeons where O₂ matters.
            kind  = "wad_pickup_o2";
            value = 60;
        } else if (pu.kind === "bullet_pen") {
            // Round 250 — armor-piercing ammo for 30 seconds. Lets
            // bullets break STONE walls (normally only wood/glass).
            kind  = "wad_pickup_bullet_pen";
            value = 30;
        } else if (pu.kind === "key_red" || pu.kind === "key_blue" || pu.kind === "key_yellow") {
            color = pu.kind.slice(4);   // "red" / "blue" / "yellow"
            kind  = `wad_pickup_key_${color}`;
            value = 1;
        } else {
            kind  = "wad_pickup_health";
            value = 0.30;
        }
        const x = pu.x ?? 0;
        const z = pu.z ?? 0;
        // Round 237 — kaiju pickup is slightly larger so it reads as
        // "important power-up"
        const scale = (pu.kind === "kaiju") ? 0.95 : 0.7;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: kind,
            kind,
            x, y: baseY + 1, z,
            scale, yaw: 0,
        });
        if (!r?.ok || r.id == null) return null;
        this._lastSpawnedEntityIds.push(r.id);
        const out = { id: r.id, kind, value, x, z };
        if (color) out.color = color;
        return out;
    }

    // Round 219 — spawn the level exit portal. Initially "inactive"
    // (semi-transparent visual, no collision trigger). Activated when
    // FPSShooter fires onLevelCleared(). The portal is a single entity
    // placed at the center of the designated room, just above the floor.
    _spawnExit(room, baseY, exitData = null) {
        if (!this.router) return null;
        const cx = room.x + room.w / 2;
        const cz = room.z + room.d / 2;
        // Round 244 — optional exit.height lifts the portal off the floor.
        // Combined with room.h, this forces vertical traversal (jetpack /
        // jump pad / kaiju mode / swim) to reach the exit. Clamped to
        // [0, room.h - 1] so it stays inside the room.
        const requestedHeight = Math.max(0, exitData?.height | 0);
        const maxHeight = Math.max(0, (room.h | 0) - 1);
        const exitH = Math.min(requestedHeight, maxHeight);
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "wad_exit_portal",
            kind: "wad_exit_portal",
            x: cx, y: baseY + 1 + exitH, z: cz,
            scale: 1.0, yaw: 0,
        });
        if (!r?.ok || r.id == null) return null;
        this._lastSpawnedEntityIds.push(r.id);
        // Round 229 — propagate key requirements so FPSShooter can
        // keep the exit sealed until the matching keys are collected.
        // Round 244 — also propagate exit height so debug/HUD can show
        // "exit is N voxels up" if anyone wants it later.
        return {
            id: r.id, x: cx, z: cz, y: baseY + 1 + exitH, roomId: room.id,
            height: exitH,
            requires_keys: Array.isArray(exitData?.requires_keys) ? exitData.requires_keys : [],
        };
    }

    // Round 219 — accessor for the just-generated pickup list (used by
    // main.js to register them with FPSShooter).
    getLastPickups() { return this._lastPickupIds || []; }
    getLastExit()    { return this._lastExit; }
    getLastSpawnHints() { return this._lastLevel?.spawns || []; }
    // Round 223 — paired teleporter portals
    getLastPortalPairs() { return this._lastPortalPairs || []; }
    // Round 224 — jump pads (gravity launchers)
    getLastJumpPads() { return this._lastJumpPads || []; }

    // Round 224 — spawn a jump pad at the given xz inside its owning
    // room. The pad's collision is handled by FPSShooter._checkJumpPads;
    // visually it's a small puck-shaped mesh.
    _spawnJumpPad(pad, layout, baseY) {
        if (!this.router) return null;
        const x = pad.x ?? 0;
        const z = pad.z ?? 0;
        const owner = this._findOwningRoom({ x, z }, layout.rooms);
        const padY = baseY + (owner?.y | 0) + 1;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "wad_jump_pad",
            kind: "wad_jump_pad",
            x, y: padY, z,
            scale: 0.9, yaw: 0,
        });
        if (!r?.ok || r.id == null) return null;
        this._lastSpawnedEntityIds.push(r.id);
        return { id: r.id, x, z };
    }

    // Round 223 — spawn one side of a portal pair. Returns descriptor
    // { id, x, z, side, pairId } so main.js can register with FPSShooter
    // and wire the teleport callback.
    _spawnPortal(endpoint, layout, baseY, pairId, side) {
        if (!this.router) return null;
        const x = endpoint.x ?? 0;
        const z = endpoint.z ?? 0;
        // Honor explicit roomId hint, else find owning room by xz
        const owner = endpoint.roomId
            ? layout.rooms.find(r => r.id === endpoint.roomId)
            : this._findOwningRoom({ x, z }, layout.rooms);
        const portalY = baseY + (owner?.y | 0) + 1;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: "wad_portal_teleport",
            kind: "wad_portal_teleport",
            x, y: portalY, z,
            scale: 0.6,       // smaller than exit portal
            yaw: 0,
        });
        if (!r?.ok || r.id == null) return null;
        this._lastSpawnedEntityIds.push(r.id);
        return { id: r.id, x, z, side, pairId };
    }

    _paintRoom(r, baseY) {
        const floorVox   = MATERIAL_TO_VOXEL[r.floor]   ?? 1;
        const wallVox    = MATERIAL_TO_VOXEL[r.wall]    ?? 1;
        const ceilingVox = r.ceiling ? (MATERIAL_TO_VOXEL[r.ceiling] ?? 1) : 0;
        const x0 = r.x | 0, z0 = r.z | 0;
        const w = Math.max(4, Math.min(32, r.w | 0));
        const d = Math.max(4, Math.min(32, r.d | 0));
        const h = Math.max(3, Math.min(12, r.h | 0));
        // Floor
        for (let x = x0; x < x0 + w; x++) {
            for (let z = z0; z < z0 + d; z++) {
                this._setVoxel(x, baseY, z, floorVox);
            }
        }
        // Walls (4 sides, full height)
        for (let y = baseY + 1; y < baseY + h; y++) {
            for (let x = x0; x < x0 + w; x++) {
                this._setVoxel(x, y, z0, wallVox);
                this._setVoxel(x, y, z0 + d - 1, wallVox);
            }
            for (let z = z0 + 1; z < z0 + d - 1; z++) {
                this._setVoxel(x0, y, z, wallVox);
                this._setVoxel(x0 + w - 1, y, z, wallVox);
            }
        }
        // Carve interior to air (preserves any pre-existing voxels)
        for (let y = baseY + 1; y < baseY + h; y++) {
            for (let x = x0 + 1; x < x0 + w - 1; x++) {
                for (let z = z0 + 1; z < z0 + d - 1; z++) {
                    this._setVoxel(x, y, z, 0);
                }
            }
        }
        // Round 246 — procedural floor terrain. For "hills"/"rough"
        // rooms, stamp a per-cell heightmap of FLOOR voxels rising
        // above baseY. We compute height via _terrainHeightAt with a
        // seed derived from room origin so adjacent rooms don't look
        // identical. The bumps stack ON TOP of the flat floor we
        // already laid down (so anything walking on it has solid
        // support all the way down to baseY). Amplitude is clamped to
        // leave AT LEAST 3 voxels of headroom above the highest peak
        // — otherwise short rooms (h=4) would have bumps reaching the
        // ceiling and the player couldn't traverse.
        const requestedAmp = r.terrain === "hills" ? 2 :
                             r.terrain === "rough" ? 3 : 0;
        const terrainAmp = Math.min(requestedAmp, Math.max(0, h - 3));
        const terrainSeed = (x0 * 31 + z0 * 17) | 0;   // stable per-room
        const _heightCache = new Map();
        const cellHeight = (x, z) => {
            const key = (x << 16) ^ z;
            if (_heightCache.has(key)) return _heightCache.get(key);
            const hh = terrainAmp === 0 ? 0
                : this._terrainHeightAt(x, z, terrainSeed, terrainAmp, r.terrain);
            _heightCache.set(key, hh);
            return hh;
        };
        if (terrainAmp > 0) {
            // Avoid stamping inside walls so we don't bury the corners;
            // also leave a small inset so doorways stay clean.
            for (let x = x0 + 1; x < x0 + w - 1; x++) {
                for (let z = z0 + 1; z < z0 + d - 1; z++) {
                    const ch = cellHeight(x, z);
                    for (let y = baseY + 1; y <= baseY + ch; y++) {
                        this._setVoxel(x, y, z, floorVox);
                    }
                }
            }
        }
        // Round 247 — platforming pits. Forty percent of interior floor
        // cells become 4-voxel-deep pits; the survivors form an island
        // pattern of platforms the player must jet/jump between. Uses
        // the same noise pattern as terrain (same seed) so pit edges
        // align with terrain valleys — feels deliberate, not noisy.
        //
        // Pit cells: floor at baseY is deleted (set to air), and the
        // 3 voxels BELOW are also air. Net effect: a 4-voxel-deep
        // pit gap. Player falling in takes fall damage unless water
        // fills the pit (see water section below).
        //
        // We leave a 2-cell perimeter around all 4 walls solid so
        // doorways and pickup-edges remain accessible. Without that,
        // entry corridors would feel hostile.
        const PIT_DEPTH = 4;
        const PIT_THRESHOLD = 0.40;    // ~40% of cells become pits
        const isPitCell = new Set();
        if (r.platforming) {
            for (let x = x0 + 2; x < x0 + w - 2; x++) {
                for (let z = z0 + 2; z < z0 + d - 2; z++) {
                    const u = (x + terrainSeed) * 0.55;
                    const v = (z + terrainSeed * 1.7) * 0.51;
                    // Same shape language as terrain but cheaper — one
                    // octave is enough to make organic islands.
                    const n = 0.5 + 0.5 * Math.sin(u) * Math.cos(v)
                                  + 0.4 * Math.sin(u * 1.3 + v * 0.9 + terrainSeed * 0.07);
                    // Higher n = more "valley" = pit
                    if (n > 1.0 - PIT_THRESHOLD) {
                        isPitCell.add((x << 16) ^ z);
                        // Erase floor and dig down PIT_DEPTH voxels
                        for (let y = baseY; y > baseY - PIT_DEPTH; y--) {
                            this._setVoxel(x, y, z, 0);
                        }
                        // Also wipe any terrain bumps we just stamped
                        // (shouldn't have any since we use the same
                        // noise, but defensively clear them):
                        for (let y = baseY + 1; y < baseY + h; y++) {
                            if (this.world?.voxelAt) {
                                try {
                                    if (this.world.voxelAt(x, y, z) === floorVox) {
                                        this._setVoxel(x, y, z, 0);
                                    }
                                } catch {}
                            }
                        }
                    }
                }
            }
        }
        // Round 223 — flood the room with water if room.water > 0. The
        // floor stays solid; we just fill the bottom N voxels of the
        // interior with WATER (voxel id 10) so the player wades through
        // ankle/knee-deep water without falling. The engine's audio
        // proximity hook (setWaterProximity) picks this up automatically.
        // Round 246 — when the room has procedural terrain, water only
        // fills cells where the terrain is BELOW the surface line —
        // so peaks emerge as islands instead of being buried.
        // Round 247 — when a cell is a pit, water also fills downward
        // INTO the pit, creating a pool. Surface level stays at
        // baseY + waterDepth across the whole room; the pit just gives
        // the water somewhere extra to go.
        const floodDepth = Math.max(0, Math.min(h - 1, r.water | 0));
        if (floodDepth > 0) {
            const VOXEL_WATER = 10;
            for (let x = x0 + 1; x < x0 + w - 1; x++) {
                for (let z = z0 + 1; z < z0 + d - 1; z++) {
                    const isPit = isPitCell.has((x << 16) ^ z);
                    const ch = (terrainAmp > 0 && !isPit) ? cellHeight(x, z) : 0;
                    // Start one above whatever terrain peak is here
                    // (for pits, start at the pit bottom to fill it fully)
                    const startY = isPit
                        ? baseY - (PIT_DEPTH - 1)
                        : baseY + 1 + ch;
                    const endY = baseY + floodDepth;
                    for (let y = startY; y <= endY; y++) {
                        this._setVoxel(x, y, z, VOXEL_WATER);
                    }
                }
            }
        }
        // Ceiling
        if (ceilingVox) {
            for (let x = x0; x < x0 + w; x++) {
                for (let z = z0; z < z0 + d; z++) {
                    this._setVoxel(x, baseY + h, z, ceilingVox);
                }
            }
        }
    }

    // Round 223 — explicit pool placement (moat, fountain, lava pit).
    // Carves a rectangular pit DOWN into the room's floor (replacing
    // the stone) and fills it with water or lava voxels. Pool depth
    // determines how deep below the floor the pit goes.
    _addPool(pool, layout, baseY) {
        const x0 = pool.x | 0;
        const z0 = pool.z | 0;
        const w = Math.max(1, Math.min(20, pool.w | 0 || 3));
        const d = Math.max(1, Math.min(20, pool.d | 0 || 3));
        const depth = Math.max(1, Math.min(4, pool.depth | 0 || 1));
        const kind = (pool.kind === "lava") ? 12 : 10;     // 12=LAVA, 10=WATER
        // Find the owning room to know the surface y of the pool
        const owner = this._findOwningRoom({ x: x0 + (w >> 1), z: z0 + (d >> 1) }, layout.rooms);
        const surfaceY = baseY + (owner?.y | 0);   // floor of the room
        for (let dy = 0; dy < depth; dy++) {
            const y = surfaceY - dy;
            for (let x = x0; x < x0 + w; x++) {
                for (let z = z0; z < z0 + d; z++) {
                    this._setVoxel(x, y, z, kind);
                }
            }
        }
    }

    _carveCorridor(a, b, width, baseY) {
        const ax = a.x + (a.w / 2) | 0;
        const az = a.z + (a.d / 2) | 0;
        const bx = b.x + (b.w / 2) | 0;
        const bz = b.z + (b.d / 2) | 0;
        const minH = Math.min(a.h, b.h);
        // L-shaped path: first along X to bx, then along Z to bz, at room
        // interior height (clearing walls in between)
        const halfW = Math.max(1, Math.floor(width / 2));
        // X segment
        const xStart = Math.min(ax, bx), xEnd = Math.max(ax, bx);
        for (let x = xStart; x <= xEnd; x++) {
            for (let y = baseY; y < baseY + minH; y++) {
                for (let dz = -halfW; dz <= halfW; dz++) {
                    if (y === baseY) {
                        this._setVoxel(x, y, az + dz, MATERIAL_TO_VOXEL.stone);
                    } else {
                        this._setVoxel(x, y, az + dz, 0);    // air
                    }
                }
            }
        }
        // Z segment
        const zStart = Math.min(az, bz), zEnd = Math.max(az, bz);
        for (let z = zStart; z <= zEnd; z++) {
            for (let y = baseY; y < baseY + minH; y++) {
                for (let dx = -halfW; dx <= halfW; dx++) {
                    if (y === baseY) {
                        this._setVoxel(bx + dx, y, z, MATERIAL_TO_VOXEL.stone);
                    } else {
                        this._setVoxel(bx + dx, y, z, 0);
                    }
                }
            }
        }
    }

    _spawnProp(p, baseY) {
        if (!this.router) return;
        const assetId = `wad_prop_${p.kind}`;
        // Round 222 — props sit at their owning room's floor level so
        // an upper-floor torch doesn't end up on the ground floor
        const owner = this._findOwningRoom(p, this._lastLevel?.rooms ?? []);
        const propY = baseY + (owner?.y | 0) + 1;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId,
            kind: assetId,
            x: p.x ?? 0,
            y: propY,
            z: p.z ?? 0,
            scale: 1,
            yaw: 0,
        });
        if (r?.ok && r.id != null) {
            this._lastSpawnedEntityIds.push(r.id);
            // Round 227 — torches get tracked separately so TorchLighter
            // can emit flame particles each frame. The torch top is ~1.5
            // voxels above its base, matching the OBJ mesh.
            if (p.kind === "torch") {
                this._lastTorches = this._lastTorches || [];
                this._lastTorches.push({
                    id: r.id,
                    x: p.x ?? 0, y: propY + 1.5, z: p.z ?? 0,
                });
            }
        }
    }

    // Round 227 — accessor for torch positions so the renderer/emitter
    // can attach flame particles to each torch.
    getLastTorches() { return this._lastTorches || []; }

    _setVoxel(x, y, z, id) {
        if (!this.world?.setVoxel) return;
        try {
            this.world.setVoxel(x, y, z, id);
            this._lastTouchedVoxels.push({ x, y, z });
        } catch {}
    }

    // Round 246 — deterministic per-cell heightmap for room.terrain.
    // No Perlin dep; sum-of-sines noise, seeded per-room so adjacent
    // rooms don't look identical. Returns an int in [0, amplitude].
    //
    // "hills" mode uses smoother low-frequency components — rolling
    // mounds and depressions, ~2-cell features.
    // "rough" mode adds a higher-frequency octave so the surface looks
    // broken and chaotic — collapsed-ruin or shattered-grotto feel.
    _terrainHeightAt(x, z, seed, amplitude, kind) {
        const sx = (x + seed) * 0.42;
        const sz = (z + seed * 1.7) * 0.38;
        // Two base octaves
        let n = 0.55 * Math.sin(sx) * Math.cos(sz)
              + 0.30 * Math.sin(sx * 1.7 + sz * 0.9);
        if (kind === "rough") {
            // Add a chaotic high-frequency octave
            n += 0.45 * Math.sin(sx * 3.1 + sz * 2.6 + seed * 0.13);
        }
        // Normalize sum to [0, 1] with a TIGHTER denominator than the
        // theoretical max — the worst-case sum can't be reached in
        // practice (sin terms peak at different (x,z)), so using the
        // theoretical max leaves the heightmap underutilizing the high
        // end. We clamp so the few cells that DO exceed bound to 1.0.
        const maxMag = (kind === "rough") ? 0.95 : 0.62;
        const norm = Math.max(0, Math.min(1, (n + maxMag) / (2 * maxMag)));
        return Math.round(amplitude * norm);
    }

    _defaultBaseY() {
        // Find ground level near origin so the level sits ON the terrain.
        if (this.world?._heightAt) {
            try { return Math.round(this.world._heightAt(0, 0)) + 1; } catch {}
        }
        return 5;
    }

    // -------------------------------------------------------------------------

    async _ensurePropsInstalled() {
        if (this._propsInstalled) return;
        if (!this.assetLoader?.installOBJText) return;
        // Procedural prop meshes — minimal blocky representations
        const tasks = [
            this.assetLoader.installOBJText("wad_prop_pillar", PROP_OBJS.pillar),
            this.assetLoader.installOBJText("wad_prop_torch",  PROP_OBJS.torch),
            this.assetLoader.installOBJText("wad_prop_altar",  PROP_OBJS.altar),
            this.assetLoader.installOBJText("wad_prop_chest",  PROP_OBJS.chest),
            this.assetLoader.installOBJText("wad_prop_fountain", PROP_OBJS.fountain),
            this.assetLoader.installOBJText("wad_prop_throne", PROP_OBJS.throne),
            // Round 219 — pickup + exit meshes
            this.assetLoader.installOBJText("wad_pickup_health", PROP_OBJS.pickup_health),
            this.assetLoader.installOBJText("wad_pickup_ammo",   PROP_OBJS.pickup_ammo),
            // Round 225 — gravity power-up
            this.assetLoader.installOBJText("wad_pickup_gravity", PROP_OBJS.pickup_gravity),
            // Round 237 — kaiju mode power-up totem
            this.assetLoader.installOBJText("wad_pickup_kaiju",   PROP_OBJS.pickup_kaiju),
            // Round 244 — O₂ regulator canister
            this.assetLoader.installOBJText("wad_pickup_o2",      PROP_OBJS.pickup_o2),
            // Round 250 — armor-piercing ammo pickup
            this.assetLoader.installOBJText("wad_pickup_bullet_pen", PROP_OBJS.pickup_bullet_pen),
            // Round 229 — colored key pickups for locked doors / sealed exits
            this.assetLoader.installOBJText("wad_pickup_key_red",    PROP_OBJS.pickup_key),
            this.assetLoader.installOBJText("wad_pickup_key_blue",   PROP_OBJS.pickup_key),
            this.assetLoader.installOBJText("wad_pickup_key_yellow", PROP_OBJS.pickup_key),
            this.assetLoader.installOBJText("wad_exit_portal",   PROP_OBJS.exit_portal),
            // Round 223 — paired teleporter portal mesh
            this.assetLoader.installOBJText("wad_portal_teleport", PROP_OBJS.portal_teleport),
            // Round 224 — jump pad mesh (gravity launcher)
            this.assetLoader.installOBJText("wad_jump_pad",      PROP_OBJS.jump_pad),
            // Round 232 — pressure plate mesh
            this.assetLoader.installOBJText("wad_plate",          PROP_OBJS.plate),
        ];
        await Promise.all(tasks);
        this._propsInstalled = true;
        console.log("[OllamaLevel] installed 6 prop + 9 pickup + 1 exit + 1 teleport-portal + 1 jump-pad + 1 plate procedural meshes");
    }
}

// =============================================================================
// PROP MESHES — simple blocky OBJ for each prop kind.
// =============================================================================

const PROP_OBJS = {
    pillar: `# pillar — tall stone column
v -0.4 0 -0.4
v  0.4 0 -0.4
v  0.4 0  0.4
v -0.4 0  0.4
v -0.4 4 -0.4
v  0.4 4 -0.4
v  0.4 4  0.4
v -0.4 4  0.4
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`,
    torch: `# torch — small post with brazier top
v -0.15 0 -0.15
v  0.15 0 -0.15
v  0.15 0  0.15
v -0.15 0  0.15
v -0.15 1.5 -0.15
v  0.15 1.5 -0.15
v  0.15 1.5  0.15
v -0.15 1.5  0.15
v -0.4 1.5 -0.4
v  0.4 1.5 -0.4
v  0.4 1.5  0.4
v -0.4 1.5  0.4
v -0.4 1.9 -0.4
v  0.4 1.9 -0.4
v  0.4 1.9  0.4
v -0.4 1.9  0.4
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16
`,
    altar: `# altar — low rectangular block
v -1 0 -0.5
v  1 0 -0.5
v  1 0  0.5
v -1 0  0.5
v -1 1.2 -0.5
v  1 1.2 -0.5
v  1 1.2  0.5
v -1 1.2  0.5
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`,
    chest: `# chest — small wooden box
v -0.6 0 -0.4
v  0.6 0 -0.4
v  0.6 0  0.4
v -0.6 0  0.4
v -0.6 0.8 -0.4
v  0.6 0.8 -0.4
v  0.6 0.8  0.4
v -0.6 0.8  0.4
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`,
    fountain: `# fountain — square basin
v -1 0 -1
v  1 0 -1
v  1 0  1
v -1 0  1
v -1 0.6 -1
v  1 0.6 -1
v  1 0.6  1
v -1 0.6  1
v -0.2 0.6 -0.2
v  0.2 0.6 -0.2
v  0.2 0.6  0.2
v -0.2 0.6  0.2
v -0.2 1.5 -0.2
v  0.2 1.5 -0.2
v  0.2 1.5  0.2
v -0.2 1.5  0.2
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16
`,
    throne: `# throne — chair with high back
v -0.7 0 -0.5
v  0.7 0 -0.5
v  0.7 0  0.5
v -0.7 0  0.5
v -0.7 0.6 -0.5
v  0.7 0.6 -0.5
v  0.7 0.6  0.5
v -0.7 0.6  0.5
v -0.7 0.6 -0.5
v  0.7 0.6 -0.5
v  0.7 2.5 -0.5
v -0.7 2.5 -0.5
v -0.7 2.5 -0.3
v  0.7 2.5 -0.3
v  0.7 0.6 -0.3
v -0.7 0.6 -0.3
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 9 10 11 12
f 13 14 11 12
f 9 12 13 16
f 10 15 14 11
`,
    // Round 219 — health pickup: small floating cross/cube
    pickup_health: `# health pack — small cube with cross
v -0.3 0 -0.3
v  0.3 0 -0.3
v  0.3 0  0.3
v -0.3 0  0.3
v -0.3 0.6 -0.3
v  0.3 0.6 -0.3
v  0.3 0.6  0.3
v -0.3 0.6  0.3
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`,
    // Round 219 — ammo pickup: short, wider box
    pickup_ammo: `# ammo box — squat rectangular
v -0.4 0 -0.25
v  0.4 0 -0.25
v  0.4 0  0.25
v -0.4 0  0.25
v -0.4 0.35 -0.25
v  0.4 0.35 -0.25
v  0.4 0.35  0.25
v -0.4 0.35  0.25
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`,
    // Round 219 — exit portal: tall arch (two pillars + lintel)
    exit_portal: `# exit portal — archway frame
v -1.0 0 -0.2
v -0.6 0 -0.2
v -0.6 0  0.2
v -1.0 0  0.2
v -1.0 3.0 -0.2
v -0.6 3.0 -0.2
v -0.6 3.0  0.2
v -1.0 3.0  0.2
v  0.6 0 -0.2
v  1.0 0 -0.2
v  1.0 0  0.2
v  0.6 0  0.2
v  0.6 3.0 -0.2
v  1.0 3.0 -0.2
v  1.0 3.0  0.2
v  0.6 3.0  0.2
v -1.0 2.6 -0.2
v  1.0 2.6 -0.2
v  1.0 2.6  0.2
v -1.0 2.6  0.2
v -1.0 3.4 -0.2
v  1.0 3.4 -0.2
v  1.0 3.4  0.2
v -1.0 3.4  0.2
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16
f 17 20 19 18
f 21 22 23 24
f 17 18 22 21
f 18 19 23 22
f 19 20 24 23
f 20 17 21 24
`,
    // Round 223 — teleporter portal: small octagonal ring on a tiny
    // pedestal. Distinct from the exit portal's tall archway so the
    // player visually distinguishes "go to next level" from
    // "teleport within this level". 8-sided ring with inner radius 0.5,
    // outer radius 0.8, sitting at y=0.2-0.6 on a tiny floor disc.
    portal_teleport: `# teleporter portal — octagonal ring
# outer ring vertices (8 points, radius 0.8, y=0.6)
v  0.80 0.60  0.00
v  0.57 0.60  0.57
v  0.00 0.60  0.80
v -0.57 0.60  0.57
v -0.80 0.60  0.00
v -0.57 0.60 -0.57
v  0.00 0.60 -0.80
v  0.57 0.60 -0.57
# inner ring vertices (8 points, radius 0.5, y=0.6)
v  0.50 0.60  0.00
v  0.35 0.60  0.35
v  0.00 0.60  0.50
v -0.35 0.60  0.35
v -0.50 0.60  0.00
v -0.35 0.60 -0.35
v  0.00 0.60 -0.50
v  0.35 0.60 -0.35
# outer ring bottom (same x/z, y=0.2)
v  0.80 0.20  0.00
v  0.57 0.20  0.57
v  0.00 0.20  0.80
v -0.57 0.20  0.57
v -0.80 0.20  0.00
v -0.57 0.20 -0.57
v  0.00 0.20 -0.80
v  0.57 0.20 -0.57
# inner ring bottom (y=0.2)
v  0.50 0.20  0.00
v  0.35 0.20  0.35
v  0.00 0.20  0.50
v -0.35 0.20  0.35
v -0.50 0.20  0.00
v -0.35 0.20 -0.35
v  0.00 0.20 -0.50
v  0.35 0.20 -0.35
# Top face (annulus made of 8 quads)
f 1 9 10 2
f 2 10 11 3
f 3 11 12 4
f 4 12 13 5
f 5 13 14 6
f 6 14 15 7
f 7 15 16 8
f 8 16 9 1
# Outer skirt
f 1 2 18 17
f 2 3 19 18
f 3 4 20 19
f 4 5 21 20
f 5 6 22 21
f 6 7 23 22
f 7 8 24 23
f 8 1 17 24
# Inner skirt
f 9 25 26 10
f 10 26 27 11
f 11 27 28 12
f 12 28 29 13
f 13 29 30 14
f 14 30 31 15
f 15 31 32 16
f 16 32 25 9
`,
    // Round 225 — gravity power-up: small floating crystal (octahedron),
    // visually distinct from health/ammo cubes so the player sees it as
    // "magic". WadVisualPolish spins it faster than other pickups.
    pickup_gravity: `# gravity power-up — octahedron crystal
v  0.00 0.55  0.00
v  0.30 0.30  0.00
v  0.00 0.30  0.30
v -0.30 0.30  0.00
v  0.00 0.30 -0.30
v  0.00 0.05  0.00
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 2
f 6 3 2
f 6 4 3
f 6 5 4
f 6 2 5
`,
    // Round 229 — door key: small angular shape with a triangular bow
    // (ring end) and a thin rectangular shaft. Visually distinct from
    // the cubic health/ammo pickups so the player reads "key" instantly.
    pickup_key: `# door key — bow + shaft + teeth
# bow (triangular ring at top, 4 verts forming a flat triangle)
v -0.18 0.55  0.00
v  0.18 0.55  0.00
v  0.00 0.85  0.00
v  0.00 0.55  0.05
# shaft (thin rectangular bar descending from bow)
v -0.05 0.55 -0.02
v  0.05 0.55 -0.02
v -0.05 0.10 -0.02
v  0.05 0.10 -0.02
v -0.05 0.55  0.02
v  0.05 0.55  0.02
v -0.05 0.10  0.02
v  0.05 0.10  0.02
# teeth (small notches at the bottom right)
v  0.05 0.25  0.00
v  0.18 0.25  0.00
v  0.18 0.18  0.00
v  0.05 0.18  0.00
# bow triangle face (both sides)
f 1 2 3
f 3 2 1
f 1 4 3
f 3 4 2
# shaft box (8 verts → 6 quad faces as triangles)
f 5 6 8
f 5 8 7
f 9 11 12
f 9 12 10
f 5 7 11
f 5 11 9
f 6 10 12
f 6 12 8
f 5 9 10
f 5 10 6
f 7 8 12
f 7 12 11
# teeth flat panel
f 13 14 15
f 13 15 16
`,
    // Round 224 — jump pad: low octagonal puck on the floor, 1.6 units
    // wide, 0.3 units tall. Visually flat and obvious so the player
    // notices it; WadVisualPolish gives it a rapid pulse to read as
    // "active" / "press X here".
    jump_pad: `# jump pad — flat octagonal puck
v  0.80 0.30  0.00
v  0.57 0.30  0.57
v  0.00 0.30  0.80
v -0.57 0.30  0.57
v -0.80 0.30  0.00
v -0.57 0.30 -0.57
v  0.00 0.30 -0.80
v  0.57 0.30 -0.57
v  0.80 0.00  0.00
v  0.57 0.00  0.57
v  0.00 0.00  0.80
v -0.57 0.00  0.57
v -0.80 0.00  0.00
v -0.57 0.00 -0.57
v  0.00 0.00 -0.80
v  0.57 0.00 -0.57
v  0.00 0.30  0.00
v  0.00 0.00  0.00
# Top face (8 triangles around center vertex 17)
f 1 2 17
f 2 3 17
f 3 4 17
f 4 5 17
f 5 6 17
f 6 7 17
f 7 8 17
f 8 1 17
# Skirt
f 1 9 10 2
f 2 10 11 3
f 3 11 12 4
f 4 12 13 5
f 5 13 14 6
f 6 14 15 7
f 7 15 16 8
f 8 16 9 1
`,
    // Round 232 — pressure plate: 0.9-square slab, lower profile than
    // jump pad, distinct silhouette so the player can tell them apart.
    plate: `# pressure plate — square slab with chamfered edges
# top face (4 verts)
v -0.85 0.12 -0.85
v  0.85 0.12 -0.85
v  0.85 0.12  0.85
v -0.85 0.12  0.85
# bottom face
v -0.95 0.00 -0.95
v  0.95 0.00 -0.95
v  0.95 0.00  0.95
v -0.95 0.00  0.95
# top
f 1 2 3
f 1 3 4
# skirt
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
# bottom
f 5 8 7
f 5 7 6
`,
    // Round 237 — kaiju power-up: tall double-tetrahedron totem. Reads
    // as "ritual artifact" — distinct from the gravity octahedron and
    // the health/ammo cubes. Visibly bigger because spawn scale=0.95.
    pickup_kaiju: `# kaiju mode totem — stacked tetrahedra (bipyramid)
v  0.00 1.00  0.00
v  0.45 0.50  0.00
v  0.00 0.50  0.45
v -0.45 0.50  0.00
v  0.00 0.50 -0.45
v  0.20 0.00  0.20
v -0.20 0.00  0.20
v -0.20 0.00 -0.20
v  0.20 0.00 -0.20
v  0.00 -0.20  0.00
# upper bipyramid (apex 1, ring 2-5)
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 2
# middle waist — wider ring connecting to square base
f 2 6 7 3
f 3 7 8 4
f 4 8 9 5
f 5 9 6 2
# lower pyramid down to base point 10
f 6 10 7
f 7 10 8
f 8 10 9
f 9 10 6
`,
    // Round 244 — O₂ regulator: short cylindrical canister with a
    // stripe band at midline. Reads as "tank / cartridge" — distinct
    // from cubes (health/ammo), crystal (gravity), and totem (kaiju).
    pickup_o2: `# o2 regulator canister — 6-sided low cylinder
v  0.30 0.00  0.00
v  0.15 0.00  0.26
v -0.15 0.00  0.26
v -0.30 0.00  0.00
v -0.15 0.00 -0.26
v  0.15 0.00 -0.26
v  0.30 0.50  0.00
v  0.15 0.50  0.26
v -0.15 0.50  0.26
v -0.30 0.50  0.00
v -0.15 0.50 -0.26
v  0.15 0.50 -0.26
v  0.00 0.00  0.00
v  0.00 0.50  0.00
# bottom (fan from center 13)
f 1 13 2
f 2 13 3
f 3 13 4
f 4 13 5
f 5 13 6
f 6 13 1
# top (fan from center 14)
f 7 8 14
f 8 9 14
f 9 10 14
f 10 11 14
f 11 12 14
f 12 7 14
# side walls (6 quads)
f 1 2 8 7
f 2 3 9 8
f 3 4 10 9
f 4 5 11 10
f 5 6 12 11
f 6 1 7 12
`,
    // Round 250 — bullet penetration pickup: pointed cylindrical
    // canister with conical tip — reads as "armor-piercing round"
    pickup_bullet_pen: `# armor-piercing ammo — cylinder with cone tip
v  0.20 0.00  0.00
v  0.10 0.00  0.17
v -0.10 0.00  0.17
v -0.20 0.00  0.00
v -0.10 0.00 -0.17
v  0.10 0.00 -0.17
v  0.20 0.50  0.00
v  0.10 0.50  0.17
v -0.10 0.50  0.17
v -0.20 0.50  0.00
v -0.10 0.50 -0.17
v  0.10 0.50 -0.17
v  0.00 0.85  0.00
v  0.00 0.00  0.00
# bottom fan
f 1 14 2
f 2 14 3
f 3 14 4
f 4 14 5
f 5 14 6
f 6 14 1
# sides
f 1 2 8 7
f 2 3 9 8
f 3 4 10 9
f 4 5 11 10
f 5 6 12 11
f 6 1 7 12
# cone tip
f 7 8 13
f 8 9 13
f 9 10 13
f 10 11 13
f 11 12 13
f 12 7 13
`,
};
