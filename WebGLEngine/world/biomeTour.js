// FILE: world/biomeTour.js
// VERSION: v1 (round 29)
//
// Round 29 — biome tour and teleport API. The biome system has been
// shipped piecemeal across rounds 29/214/280: surface painting,
// per-biome particle ambient, kpop announcements on entry. But the
// player typically spawns in plains and rarely walks far enough to
// see tundra/mountains/volcano (their nearest cells can be 60-200
// world units from origin).
//
// This module closes the loop: a single `biomes.tour()` flies the
// camera through every named biome in turn, pausing for ambient
// particles + announcement at each stop. `biomes.goto("volcano")`
// is the teleport version — instant jump.
//
// Search strategy: scan in widening rings from origin until a cell
// matching the requested biome is found. Caches results so repeat
// goto calls are cheap. The biome map is deterministic for a given
// seed, so cached cells stay valid until world.seed changes.
//
// API (registered on window.biomes):
//   biomes.goto(name)            — teleport to nearest cell of that biome
//   biomes.tour({stopMs=4000})   — fly through all 5 named biomes
//   biomes.status()              — print biome at current camera pos
//   biomes.regenerate({seed?})   — clear painted flag + re-paint
//
// Console:
//   biomes.tour();
//   biomes.goto("mountains");

const TOUR_BIOMES = ["plains", "jungle", "tundra", "mountains", "volcano"];
const SEARCH_MAX_RADIUS = 400;   // world cells — covers BiomePainter's 200x200 region + margin
const SEARCH_STEP = 4;           // cells per scan step; fine enough to not skip a biome patch

export class BiomeTour {
    constructor({ camera, biomeMap, world = null, kpop = null }) {
        this.camera = camera;
        this.biomeMap = biomeMap;
        this.world = world;
        this.kpop = kpop;
        this._cache = new Map();          // biome name -> {x, z} of nearest cell
        this._tourHandle = null;
    }

    // Find the nearest cell of the given biome, scanning outward from
    // origin. Cached after first hit. Returns {x, z} or null.
    findNearest(name) {
        if (this._cache.has(name)) return this._cache.get(name);
        const cam = this.camera;
        const cx = cam?.position?.x ?? 0;
        const cz = cam?.position?.z ?? 0;
        for (let r = 0; r <= SEARCH_MAX_RADIUS; r += SEARCH_STEP) {
            // Scan the perimeter of a ring at radius r
            for (let dx = -r; dx <= r; dx += SEARCH_STEP) {
                for (let dz = -r; dz <= r; dz += SEARCH_STEP) {
                    // Only scan the ring perimeter, not its interior
                    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                    const x = (cx | 0) + dx;
                    const z = (cz | 0) + dz;
                    if (this.biomeMap.getBiomeAt(x, z) === name) {
                        const hit = { x, z };
                        this._cache.set(name, hit);
                        return hit;
                    }
                }
            }
        }
        return null;
    }

    // Instant teleport. y is computed from world surface so we land
    // on the terrain top rather than buried or floating.
    goto(name) {
        const hit = this.findNearest(name);
        if (!hit) {
            console.warn(`[biomes] no "${name}" cell within ${SEARCH_MAX_RADIUS} of camera`);
            try { this.kpop?.info?.("Biome Tour", `No "${name}" found nearby`); } catch {}
            return null;
        }
        const cam = this.camera;
        if (!cam?.position) {
            console.warn("[biomes] no camera to teleport");
            return null;
        }
        // Land 8u above the surface so the player has a moment to see
        // the biome from a slight aerial perspective before settling.
        let groundY = 8;
        try { groundY = (this.world?._heightAt?.(hit.x, hit.z) ?? 8); } catch {}
        cam.position.x = hit.x;
        cam.position.y = groundY + 8;
        cam.position.z = hit.z;
        // Pitch down a bit so the player sees the surface they just
        // teleported to instead of staring at the horizon.
        if (typeof cam.pitch === "number") cam.pitch = -0.35;
        try { this.kpop?.info?.("Biome", `Teleported to ${name} at (${hit.x}, ${hit.z})`); } catch {}
        console.log(`[biomes] teleported to "${name}" at (${hit.x}, ${groundY + 8}, ${hit.z})`);
        return { x: hit.x, y: groundY + 8, z: hit.z };
    }

    // Fly through every named biome. Each stop: teleport, hold for
    // stopMs so particles + announcement land, then move on. Use
    // biomes.tourCancel() to abort mid-flight.
    tour({ stopMs = 4000 } = {}) {
        if (this._tourHandle) {
            console.log("[biomes] tour already running — call biomes.tourCancel() first");
            return;
        }
        let idx = 0;
        try { this.kpop?.info?.("Biome Tour", `Visiting ${TOUR_BIOMES.length} biomes`); } catch {}
        const visit = () => {
            if (idx >= TOUR_BIOMES.length) {
                this._tourHandle = null;
                console.log("[biomes] tour complete");
                try { this.kpop?.info?.("Biome Tour", "Tour complete"); } catch {}
                return;
            }
            const name = TOUR_BIOMES[idx++];
            this.goto(name);
            this._tourHandle = setTimeout(visit, stopMs);
        };
        visit();
    }

    tourCancel() {
        if (this._tourHandle) {
            clearTimeout(this._tourHandle);
            this._tourHandle = null;
            console.log("[biomes] tour cancelled");
        }
    }

    status() {
        const cam = this.camera;
        const x = cam?.position?.x ?? 0;
        const z = cam?.position?.z ?? 0;
        const biome = this.biomeMap.getBiomeAt(x | 0, z | 0);
        let wet = 0;
        try { wet = this.biomeMap.getWetness?.(x | 0, z | 0) ?? 0; } catch {}
        let overlay = "";
        if (wet > 0.85)      overlay = " (LAKE overlay)";
        else if (wet > 0.65) overlay = " (SWAMP overlay)";
        console.log(`[biomes] camera at (${x.toFixed(1)}, ${z.toFixed(1)}) → ${biome}${overlay}`);
        return { x, z, biome, wetness: wet };
    }

    // Force a fresh biome paint pass. Clears localStorage flag so
    // BiomePainter re-runs. If seed is provided, also re-seed the
    // biome map (which invalidates this tour's cell cache).
    regenerate({ seed = null } = {}) {
        try {
            // Clear the painted flag — biomePainter.js uses the v2 key
            localStorage.removeItem("voxelengine.biomes_v2_applied");
            console.log("[biomes] cleared painted flag — next biomePainter.paint() will re-run");
        } catch (e) {
            console.warn("[biomes] localStorage clear failed:", e.message);
        }
        if (seed != null && this.biomeMap) {
            this.biomeMap.seed = seed | 0;
            this.biomeMap._cache?.clear?.();
            this._cache.clear();
            console.log(`[biomes] re-seeded to ${seed | 0}`);
        }
        // Trigger an actual repaint if window.biomePainter is exposed
        try {
            if (window.biomePainter?.paint) {
                const r = window.biomePainter.paint({ force: true });
                console.log(`[biomes] repainted ${r.painted} voxels`);
                return r;
            }
        } catch (e) {
            console.warn("[biomes] repaint failed:", e.message);
        }
        return null;
    }
}
