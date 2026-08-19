// FILE: simulation/CSMapGenerator.js
// VERSION: v1 — round 323
//
// Generates Counter-Strike-style competitive bombsite map layouts in
// the same JSON schema OllamaLevelGenerator consumes, then hands off
// painting to that generator's public applyLayout(). Post-processes
// cover blocks (CS-style boxes/crates) via direct voxel writes.
//
// Layout (de_ style, 5 rooms, 8 corridors):
//
//                        ┌────────┐
//                        │CT SPAWN│    (north)
//                        └───┬────┘
//        ┌────┐              │              ┌────┐
//        │  B │     ─────────┤─────────     │ A  │
//        │SITE│ ←(B mid)  ┌──┴─────┐ (A mid)│SITE│
//        └─┬──┘           │  MID   │        └─┬──┘
//          │              └────┬───┘          │
//          │                   │              │
//          │ (T-B long)        │  (T-A long)  │
//          │                   │              │
//          │              ┌────┴───┐          │
//          └──────────────┤T SPAWN ├──────────┘
//                         └────────┘    (south)
//
// Console:
//   cs.preview()                     — paint the map, don't enter FPS
//   cs.play({ side: "t" | "ct" })    — paint + enter FPS at chosen spawn
//   cs.clear()                       — wipe last-generated map
//   cs.layout()                      — return last layout JSON
//   cs.regenerate({ seed: 42 })      — paint again with new seed
//
// CS gameplay semantics (bomb plant/defuse, team AI, weapon spawns)
// are deferred to a follow-up round. v1 ships geometry only.

// Tiny seeded PRNG — Mulberry32. Deterministic given a seed.
function makeRng(seed) {
    let state = seed >>> 0;
    return function rng() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class CSMapGenerator {
    constructor({ ollamaLevelGen, world, fpsShooter, camera, roundManager = null, hud = null, botManager = null }) {
        this.ollamaLevelGen = ollamaLevelGen;
        this.world = world;
        this.fpsShooter = fpsShooter;
        this.camera = camera;
        this.roundManager = roundManager;   // optional — wired in main.js
        this.hud = hud;                     // optional — wired in main.js
        this.botManager = botManager;       // v326 — optional CS bot manager
        this._lastLayout = null;
        this._coverVoxels = [];   // tracked for clear()
    }

    /**
     * Build the layout JSON. Pure function (no side effects). Useful
     * for testing without a live world.
     */
    buildLayout(opts = {}) {
        const seed = opts.seed ?? 1337;
        const name = opts.name || "de_engineproject";

        // Anchor origin so the whole map is centered around (20, 0..100).
        // Tweaking these constants shifts everything together.
        const rooms = [
            // South spawn — terrorist side
            { id: "t_spawn",  x:  10, z:   0, w: 20, d: 16, h: 8,
              floor: "stone", wall: "stone", ceiling: null },
            // Middle hub — "mid"
            { id: "mid",      x:  10, z:  42, w: 20, d: 16, h: 8,
              floor: "stone", wall: "stone", ceiling: null },
            // North spawn — counter-terrorist side
            { id: "ct_spawn", x:  10, z:  84, w: 20, d: 16, h: 8,
              floor: "stone", wall: "stone", ceiling: null },
            // West site — B
            { id: "b_site",   x: -30, z:  50, w: 24, d: 20, h: 8,
              floor: "stone", wall: "stone", ceiling: null },
            // East site — A
            { id: "a_site",   x:  46, z:  50, w: 24, d: 20, h: 8,
              floor: "stone", wall: "stone", ceiling: null },
            // v325 — heaven rooms (elevated sniper positions overlooking each site)
            // A heaven: small loft at y+4 over A site's south edge
            { id: "a_heaven", x:  50, z:  44, w: 12, d:  8, h: 5, y: 4,
              floor: "stone", wall: "stone", ceiling: null },
            // B heaven: same idea on west side
            { id: "b_heaven", x: -26, z:  44, w: 12, d:  8, h: 5, y: 4,
              floor: "stone", wall: "stone", ceiling: null },
        ];

        // 8 ground corridors + 2 stairs to heaven.
        const corridors = [
            { from: "t_spawn",  to: "mid",      width: 4 },   // T-mid
            { from: "mid",      to: "ct_spawn", width: 4 },   // CT-mid
            { from: "mid",      to: "a_site",   width: 3 },   // A-mid
            { from: "mid",      to: "b_site",   width: 3 },   // B-mid
            { from: "t_spawn",  to: "a_site",   width: 3 },   // A long (T side)
            { from: "t_spawn",  to: "b_site",   width: 3 },   // B tunnel (T side)
            { from: "ct_spawn", to: "a_site",   width: 3 },   // CT to A
            { from: "ct_spawn", to: "b_site",   width: 3 },   // CT to B
        ];

        // v325 — stairs to heaven rooms (different y, painter handles ramp)
        const stairs = [
            { from: "a_site", to: "a_heaven", width: 3 },
            { from: "b_site", to: "b_heaven", width: 3 },
        ];

        // Bombsite markers (visual only — pillars at the plant spots).
        // Real bomb semantics come in a later round.
        const props = [
            { x:  58, z:  60, kind: "altar" },   // A bomb plant marker
            { x: -18, z:  60, kind: "altar" },   // B bomb plant marker
            { x:  20, z:  92, kind: "torch" },   // CT spawn marker
            { x:  20, z:   8, kind: "torch" },   // T spawn marker
        ];

        // Spawn markers (consumed by FPS spawn logic via _pickSpawn).
        const spawns = [
            { x: 20, z:  8, kind: "team_t"  },
            { x: 20, z: 92, kind: "team_ct" },
        ];

        return {
            name,
            seed,
            rooms,
            corridors,
            stairs,
            props,
            spawns,
            // CS-specific metadata: used by _paintCoverBlocks but not
            // consumed by OllamaLevelGenerator's painter.
            csMeta: {
                style: opts.style || "de",
                tSpawn:  "t_spawn",
                ctSpawn: "ct_spawn",
                sites:   ["a_site", "b_site"],
                heavenRooms: ["a_heaven", "b_heaven"],   // v325
                // Plant zones — central 60% of each bombsite room.
                // Used by CSRoundManager to validate plant location.
                // A site:  x ∈ [46..70], z ∈ [50..70]  → plant zone insets 5 on each side
                // B site:  x ∈ [-30..-6], z ∈ [50..70] → same
                plantZones: {
                    a: { x0: 51, x1: 65, z0: 54, z1: 66 },
                    b: { x0: -25, x1: -11, z0: 54, z1: 66 },
                },
            },
        };
    }

    /**
     * Paint the map into the world. Calls OllamaLevelGenerator.applyLayout
     * for rooms/corridors/props, then adds CS-style cover blocks.
     */
    async paint(opts = {}) {
        if (!this.ollamaLevelGen) {
            console.warn("[cs] no ollamaLevelGen available");
            return null;
        }
        const layout = this.buildLayout(opts);
        await this.ollamaLevelGen.applyLayout(layout);
        this._paintCoverBlocks(layout, opts);
        this._lastLayout = layout;
        console.log(
            `[cs] painted "${layout.name}": ${layout.rooms.length} rooms, ` +
            `${layout.corridors.length} corridors, ${this._coverVoxels.length} cover voxels`
        );
        return layout;
    }

    /**
     * Place CS-style cover blocks (2x2x2 stone cubes at chest height)
     * inside rooms and at corridor midpoints. Seeded for reproducibility.
     */
    _paintCoverBlocks(layout, opts) {
        if (!this.world?.setVoxel) return;
        const rng = makeRng(layout.seed);
        const baseY = this.ollamaLevelGen._defaultBaseY?.() ?? 5;

        // CSE-canonical cover block. 2-wide × 2-tall × 2-deep stone box.
        // v325: floorY parameter accounts for room.y offsets (heaven rooms).
        const placeBox = (cx, cz, floorY, halfSize = 1, height = 2) => {
            for (let dx = -halfSize; dx < halfSize; dx++) {
                for (let dz = -halfSize; dz < halfSize; dz++) {
                    for (let dy = 1; dy <= height; dy++) {
                        const x = cx + dx;
                        const y = floorY + dy;
                        const z = cz + dz;
                        try {
                            this.world.setVoxel(x, y, z, 1);   // stone
                            this._coverVoxels.push({ x, y, z });
                        } catch {}
                    }
                }
            }
        };

        // Per-room cover patterns. Each room gets 2-4 blocks at
        // sightline-breaking positions. Coordinates are room-local
        // offsets from the room's interior center, jittered by the
        // seeded RNG so consecutive seeds produce visibly different
        // cover layouts.
        const COVER_RULES = {
            "t_spawn":  { count: 2, jitter: 2 },
            "ct_spawn": { count: 2, jitter: 2 },
            "mid":      { count: 4, jitter: 3 },   // mid is sightline-heavy
            "a_site":   { count: 3, jitter: 3 },
            "b_site":   { count: 3, jitter: 3 },
            "a_heaven": { count: 1, jitter: 1 },   // v325 — single sniper crate
            "b_heaven": { count: 1, jitter: 1 },
        };

        for (const room of layout.rooms) {
            const rule = COVER_RULES[room.id];
            if (!rule) continue;
            const cx = room.x + (room.w >> 1);
            const cz = room.z + (room.d >> 1);
            // Place `count` blocks in a rough grid pattern around center
            // with seeded jitter. Inset from walls by 2 voxels.
            const innerW = room.w - 6;
            const innerD = room.d - 6;
            // v325 — floor Y depends on the room's vertical offset
            const roomFloorY = baseY + (room.y | 0);
            for (let i = 0; i < rule.count; i++) {
                // Quasi-grid: i % 2 picks left/right of center,
                // i / 2 picks fore/aft.
                const sideX = (i % 2 === 0) ? -1 : 1;
                const sideZ = (Math.floor(i / 2) % 2 === 0) ? -1 : 1;
                const jx = Math.floor((rng() - 0.5) * rule.jitter * 2);
                const jz = Math.floor((rng() - 0.5) * rule.jitter * 2);
                const px = cx + sideX * Math.floor(innerW / 4) + jx;
                const pz = cz + sideZ * Math.floor(innerD / 4) + jz;
                placeBox(px, pz, roomFloorY, 1, 2);
            }
        }
    }

    /**
     * Generate map then enter FPS mode at the requested team spawn.
     * @param {Object} [opts]
     * @param {"t"|"ct"} [opts.side="t"]  team to spawn as
     * @param {number}   [opts.seed=1337]
     */
    async play(opts = {}) {
        const layout = await this.paint(opts);
        if (!layout) return null;
        const side = (opts.side || "t").toLowerCase();
        const spawnRoom = side === "ct" ? "ct_spawn" : "t_spawn";

        // Make sure ollamaLevelGen._lastLevel is what fps.start sees —
        // applyLayout() already set this, but be explicit.
        this.ollamaLevelGen._lastLevel = layout;

        if (this.fpsShooter) {
            await this.fpsShooter.start({ spawnAtRoom: spawnRoom });
        } else if (typeof window !== "undefined" && window.fps?.start) {
            await window.fps.start({ spawnAtRoom: spawnRoom });
        }
        console.log(`[cs] entered FPS as ${side.toUpperCase()} side at room "${spawnRoom}"`);

        // Round 324 — auto-start the match unless suppressed
        if (this.roundManager && opts.noRound !== true) {
            this.roundManager.playerSide = side;
            this.roundManager.plantZones = layout.csMeta.plantZones;
            // v327 — startMatch fires onRoundStart, which (when wired in
            // main.js) handles bot spawn + player reset. Removed the
            // explicit botManager.spawnRound call that used to live here
            // — it duplicated the onRoundStart-driven spawn on round 1.
            this.roundManager.startMatch({ side });
            if (this.hud) this.hud.show();
            console.log("[cs] round started — plant at A or B (T) or defuse (CT). hold E in zone.");
        }
        return layout;
    }

    /** Just paint the map; don't enter FPS. */
    async preview(opts = {}) {
        const layout = await this.paint(opts);
        // Position the camera above the map for an overview shot if free-cam
        if (this.camera && this.camera.position && !this.fpsShooter?.active) {
            this.camera.position.x = 20;
            this.camera.position.y = 60;
            this.camera.position.z = 50;
            if (this.camera.pitch !== undefined) this.camera.pitch = -1.0;
            if (this.camera.yaw !== undefined)   this.camera.yaw = 0;
        }
        return layout;
    }

    /** Wipe the last-generated map (both rooms via OllamaLevelGen.clear,
     *  and our cover blocks via direct setVoxel). */
    async clear() {
        let n = 0;
        if (this.world?.setVoxel) {
            for (const v of this._coverVoxels) {
                try { this.world.setVoxel(v.x, v.y, v.z, 0); n++; } catch {}
            }
        }
        this._coverVoxels = [];
        if (this.ollamaLevelGen) {
            await this.ollamaLevelGen.clear();
        }
        // Round 324 — also stop the round manager + hide HUD
        if (this.roundManager) {
            this.roundManager.state = "idle";
        }
        if (this.hud) this.hud.hide();
        // v326 — despawn bots too
        if (this.botManager) this.botManager.despawnAll();
        this._lastLayout = null;
        console.log(`[cs] cleared map (${n} cover voxels + last-Ollama level)`);
        return n;
    }

    layout() { return this._lastLayout; }

    /** Re-paint with a new seed. Shortcut for `clear() + paint(opts)`. */
    async regenerate(opts = {}) {
        await this.clear();
        return this.paint(opts);
    }
}
