// FILE: world/treeSpawner.js
//
// Round 19 — scatter trees across the spawn region as ECS mesh
// entities. Each placement is a router.exec("entity:spawnMesh"...)
// referencing tree_oak / tree_pine / tree_palm asset names — if the
// matching GLB is loaded the tree renders as textured mesh, otherwise
// the entity falls back to per-id-colored cube placeholders.
//
// Tree kind selection (round 29):
//   1. biomeMap.biomeAt(x, z) → biome name (tundra/desert/jungle/...)
//   2. Biome-tagged density multiplier (jungle dense, desert sparse, etc.)
//   3. If surface material is grass (3) → tree_oak
//      If sand (4)                      → tree_palm
//      If snow (5)                      → tree_pine
//   4. Round 90: each base kind picks a deterministic variant (tree_oak_1,
//      _2, _3, _4) so 60 placements yield ~5 distinct tree shapes
//      instead of 60 copies of the same OBJ.
import { pickVariant } from "../gpu/assetVariants.js";
// v2825 -- the Worley biome spawn table (world/biomeSpawns.js, gated 13/13 since v2788 and until now wired
// into nothing). Used ONLY when the world has Worley biomes enabled; the legacy single-axis path below is
// untouched otherwise, so this cannot change what an existing session looks like.
import { biomeSpawnPlan } from "./biomeSpawns.js";
// Round 321 — shared easing module.
import { easeOutQuad } from "../simulation/easing.js";
// VERSION: v1
//
// Scatters trees across the world as ECS mesh entities. Each tree is
// an entity:spawnMesh router call referencing tree_oak / tree_pine /
// tree_palm asset names — if the matching GLB is loaded the tree
// renders with that mesh, otherwise the EntityCubeRenderer fallback
// shows a colored cube (still visible, just unstyled).
//
// Placement strategy:
//   1. Sample N positions in a region around the spawn area
//   2. For each (x,z), scan terrain top down from y=60
//   3. If surface material is grass (3) → tree_oak
//      If sand (4)                      → tree_palm
//      If stone or anything else        → skip (no trees on rock)
//   4. Spawn ECS entity at (x, top+1, z) with a random scale jitter
//
// Seed-based pseudo-random keeps positions consistent across reloads
// — trees spawn at the same locations every session, so the world
// feels stable rather than reshuffling each load.

const VOXEL_GRASS = 3;
const VOXEL_SAND  = 4;
const VOXEL_SNOW  = 5;   // Round 29
const VOXEL_ASH   = 6;   // Round 29
const VOXEL_STONE = 1;

export class TreeSpawner {
    constructor({ world, router, biomeMap = null, seed = 1337, count = 60, region = 120, center = { x: 0, z: 30 } }) {
        this.world = world;
        this.router = router;
        this.biomeMap = biomeMap;       // Round 29 — bias placement
        // v2825 -- follow the WORLD's decision rather than re-reading the URL: world.js already resolves
        // ?biomes=1 / window.__swekBiomes / localStorage into useWorleyBiomes, and two places parsing the same
        // flag independently is how they end up disagreeing.
        this._useBiomeSpawns = !!(world && world.useWorleyBiomes);
        this.seed = seed;
        this.count = count;
        this.region = region;
        this.center = center;
        this.spawned = [];   // ECS entity ids — for diagnostic / future cleanup
        // Round 21 — registry of live trees keyed by entity id, value
        // is { x, y, z, assetId, scale }. Kaiju grab logic queries
        // findAndConsumeNearest() to pick a tree to hurl.
        this._registry = new Map();
        // Round 276 — regrowth. After a tree is consumed (hurled by a
        // kaiju, chopped by the player), a counter ticks down on the
        // empty slot and eventually a new sapling sprouts. Keeps the
        // forest density roughly constant over long sessions. The
        // counters are paused while the consumed-count is at or below
        // target so we don't infinitely over-spawn.
        this._consumedSlots = [];   // [{ x, z, atMs }]
        this._lastRegrowthMs = 0;
        this._targetCount = count;        // restored at construction; spawn() may change it
        // Round 90 — auto-re-place trees when the world regenerates so
        // OGRE cycle transitions / demo switches don't strand the player
        // in a treeless world. Bump the seed each respawn so the layout
        // also feels fresh (otherwise every regen would put trees in
        // the same spots).
        if (this.world?.onRegenerate) {
            this._regenCount = 0;
            this.world.onRegenerate(() => {
                // v550 — despawn the OLD tree entities first. This was the leak:
                // the registry was cleared but the ECS entities were never
                // despawned, so trees from prior demos accumulated on screen.
                // v690 — same loop now handles sprite-tree billboards. Positive
                // ids are ECS mesh entities; negative ids are sprite-tree
                // tracking ids whose real billboard id lives in the registry.
                for (const [id, rec] of this._registry) {
                    try {
                        if (rec?.sprite && rec.bbId != null) {
                            window._spriteBillboards?.despawn?.(rec.bbId);
                        } else {
                            this.router?.exec?.({ type: "entity:despawn", id });
                        }
                    } catch {}
                }
                this._registry.clear();
                this.spawned = [];
                this._regenCount += 1;
                // v550 — abstract demos (no `terrain` flag) stay treeless;
                // only terrain demos (kaiju/ogre/…) re-grow the forest.
                if (typeof window !== "undefined" && window._demoWantsTerrain === false) return;
                // Bias seed by regen count for layout variety
                const prevSeed = this.seed;
                this.seed = prevSeed + this._regenCount * 9973;
                this.spawn();
                this.seed = prevSeed;       // restore so manual reseeding still works
            });
        }
    }

    // Run the placement sweep. Idempotent — calling spawn() twice will
    // place trees twice (so don't). Caller should run once after
    // world chunks are loaded.
    spawn() {
        if (!this.world || !this.router) return 0;

        const rand = this._seededRand(this.seed);
        let placed = 0;
        let attempts = 0;
        // Round 29 — biomes with no/sparse trees (volcano, tundra) need
        // more attempts to reach target count when the region cuts
        // through them. Push attempts higher to compensate.
        const maxAttempts = this.count * 8;

        while (placed < this.count && attempts < maxAttempts) {
            attempts++;
            // Sample uniformly in the square region
            const dx = (rand() - 0.5) * this.region;
            const dz = (rand() - 0.5) * this.region;
            const x = Math.floor(this.center.x + dx);
            const z = Math.floor(this.center.z + dz);

            const top = this._terrainTop(x, z);
            if (!top) continue;

            let assetId = null;

            if (this._useBiomeSpawns) {
                // v2825 -- WORLEY PATH. biomeSpawnPlan classifies the column with the same Worley classifier the
                // terrain height uses, then consults the BIOME_SPAWNS table: density AND kind come from one
                // place instead of a hardcoded if-chain that only knew five biome names. It returns null for
                // most columns -- that IS the density, so a null is a skip, not a failure.
                const plan = biomeSpawnPlan(x, z, this.seed);
                if (!plan || plan.category !== "tree") continue;      // decor is the decor planner's job
                assetId = plan.kind;
                // The surface still has a veto: a tree the table wants cannot stand on lava or ash. The table
                // decides WHAT grows where; the terrain decides whether anything can grow here at all.
                if (top.material !== VOXEL_GRASS && top.material !== VOXEL_SAND && top.material !== VOXEL_SNOW) continue;
            } else {
                // Round 29 — LEGACY single-axis path, untouched. Reached whenever Worley biomes are off, so an
                // existing session keeps exactly the forest it had.
                const biome = this.biomeMap ? this.biomeMap.getBiomeAt(x, z) : "plains";
                let densityMul = 1;
                let preferredKind = null;
                if (biome === "volcano")   { continue; }    // no trees
                if (biome === "tundra")    { densityMul = 0.10; preferredKind = "tree_pine"; }
                if (biome === "plains")    { densityMul = 1.00; }
                if (biome === "jungle")    { densityMul = 3.00; preferredKind = "tree_oak"; }
                if (biome === "mountains") { densityMul = 0.40; preferredKind = "tree_pine"; }
                // Probabilistic skip — densityMul=0.1 means 90% rejection
                if (densityMul < 1.0 && rand() > densityMul) continue;
                // densityMul > 1: just don't reject (more attempts succeed at this column)

                // Pick tree kind: biome preference if set, else by surface
                assetId = preferredKind;
                if (!assetId) {
                    if (top.material === VOXEL_GRASS) assetId = "tree_oak";
                    else if (top.material === VOXEL_SAND) assetId = "tree_palm";
                    else continue;   // not a valid tree surface
                }
            }
            // Round 90 — variant selection. base "tree_oak" becomes
            // "tree_oak_1" / "_2" / "_3" / "_4" deterministically by
            // grid position. Each variant has a distinct Ollama
            // description (gnarled / young / weathered / lightning-split)
            // so a forest reads as varied even when 60 trees share the
            // same base type.
            const variantSeed = `${Math.floor(x)},${Math.floor(z)}`;
            assetId = pickVariant(assetId, variantSeed);
            // Trees can grow on snow (mountain peaks below cap line) +
            // grass + sand. Reject ash + lava + water surfaces.
            if (top.material === VOXEL_ASH || top.material === 12 || top.material === 10) continue;

            // Skip if too close to the showcase row (y=14, z=30, x∈[-25,25])
            if (Math.abs(z - 30) < 6 && x >= -25 && x <= 25) continue;

            // Random scale jitter ± 30% so the forest doesn't read as cloned
            const scale = 1.5 + rand() * 1.0;   // 1.5 to 2.5

            // v690 — Sprite-tree mode (per-entity-kind, opt-in via SETTINGS).
            // When window._spriteTreesEnabled is true, register a 2D billboard
            // sprite instead of a 3D mesh. The wadBillboardRenderer draws them
            // as camera-facing alpha-tested quads (NEAREST filtering = crisp
            // pixel-art). Mixed mode: trees flip to sprites but kaiju / civ /
            // other entities still render as 3D rigged meshes. The hook is
            // delayed-resolved (window._spriteBillboards.spawn at runtime) so
            // the spawner doesn't import the loader directly — keeps the
            // sprite system fully opt-in and module-graph-light.
            if (typeof window !== "undefined" && window._spriteTreesEnabled && window._spriteBillboards?.spawn) {
                const bbId = window._spriteBillboards.spawn({
                    x,
                    // Center the billboard at trunk-base + halfHeight, so the
                    // bottom of the sprite sits on the terrain. The renderer
                    // draws the quad symmetric around (x,y,z); a 96×128 sprite
                    // at scale~2 has worldHalfHeight ≈ 2.0, so push the
                    // center up by that amount.
                    y: top.y + 1 + scale * 1.0,
                    z,
                    name: assetId,            // e.g. "tree_oak_2" — must match registered frame
                    scale,
                });
                if (bbId > 0) {
                    // Track sprite IDs under a sentinel negative key in
                    // _registry so the regen-cleanup logic above can
                    // distinguish them from entity ids (positive).
                    const trackingId = -bbId;
                    this.spawned.push(trackingId);
                    this._registry.set(trackingId, {
                        x, y: top.y + 1, z,
                        assetId, scale,
                        sprite: true,
                        bbId,
                    });
                    placed++;
                }
                continue;
            }

            const result = this.router.exec({
                type: "entity:spawnMesh",
                assetId,
                x, y: top.y + 1, z,
                scale,
                kind: assetId,    // entityVisuals.colorFor falls back to "other"
                                  // for unknown kinds → per-id hue. Trees won't
                                  // be solid-green this way, which is OK as a
                                  // fallback when GLBs are missing.
            });
            if (result?.ok && result.id != null) {
                this.spawned.push(result.id);
                this._registry.set(result.id, {
                    x, y: top.y + 1, z,
                    assetId, scale,
                });
                placed++;
            }
        }
        console.log(`[TreeSpawner] placed ${placed} trees (${attempts} attempts) — ${this.spawned.length} entities`);
        return placed;
    }

    _terrainTop(x, z) {
        const get = this.world.voxelAt
            ? (xx, yy, zz) => this.world.voxelAt(xx, yy, zz)
            : this.world.getVoxel
                ? (xx, yy, zz) => this.world.getVoxel(xx, yy, zz)
                : null;
        if (!get) return null;
        for (let y = 60; y >= 0; y--) {
            const v = get(x, y, z);
            if (v !== 0) return { y, material: v };
        }
        return null;
    }

    // Linear congruential — quick deterministic source. Returns a
    // function that produces 0..1 floats.
    _seededRand(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 16807) % 2147483647;
            return s / 2147483647;
        };
    }

    // Round 21 — find the nearest live tree to (x, z) within maxDist
    // and remove it from the registry + despawn its ECS entity.
    // Returns { x, y, z, assetId, scale } so the caller can build a
    // matching projectile, or null if no tree is in range.
    findAndConsumeNearest(x, z, maxDist) {
        let bestId = null;
        let bestD2 = maxDist * maxDist;
        let bestEntry = null;
        for (const [id, info] of this._registry) {
            const dx = info.x - x;
            const dz = info.z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) {
                bestD2 = d2;
                bestId = id;
                bestEntry = info;
            }
        }
        if (bestId == null) return null;

        this._registry.delete(bestId);
        // Round 276 — record the slot so regrowth can re-seed it later.
        this._consumedSlots.push({
            x: bestEntry.x, z: bestEntry.z,
            atMs: (typeof performance !== "undefined") ? performance.now() : Date.now(),
        });
        if (this.router) {
            this.router.exec({ type: "entity:despawn", id: bestId });
        }
        return bestEntry;
    }

    // Round 280 — sapling growth animation state. After tickRegrowth
    // sprouts a new sapling at scale 0.5, we track it in _saplings
    // and tickSaplingGrowth() ramps its scale up to 1.0 over GROW_S
    // seconds. Decoupled from regrowth so the growth animation can
    // run independently (called every frame, while regrowth is 1Hz).
    GROW_S = 4.0;
    _ensureSaplingsList() { if (!this._saplings) this._saplings = []; }
    tickSaplingGrowth(dt) {
        this._ensureSaplingsList();
        if (this._saplings.length === 0) return;
        const remaining = [];
        for (const s of this._saplings) {
            s.t += dt;
            const u = Math.min(1, s.t / this.GROW_S);
            // Ease-out (sapling grows fast at first, slows near full size)
            const ease = easeOutQuad(u);
            const scale = s.fromScale + (s.toScale - s.fromScale) * ease;
            if (this.router) {
                try { this.router.exec({ type: "entity:rescale", id: s.id, scale }); } catch {}
            }
            // Keep the registry in sync so later kaiju picks reflect
            // current scale (matters for throw projectile scale).
            const reg = this._registry.get(s.id);
            if (reg) reg.scale = scale;
            if (u < 1) remaining.push(s);
        }
        this._saplings = remaining;
    }

    // Round 276 — regrowth tick. Call from the engine main loop ~1Hz
    // (cheap enough we don't worry about throttling). Walks the
    // consumed-slot queue and replaces slots whose age exceeds the
    // regrowth period with a fresh tree at roughly the same position
    // (+/- 2 voxels jitter so the forest pattern doesn't look
    // mechanical). Keeps total tree count at or near the original
    // target — never over-spawns past it.
    REGROWTH_MS = 25 * 1000;      // 25s per tree — long enough to feel "natural"
    tickRegrowth(nowMs = null) {
        nowMs = nowMs ?? ((typeof performance !== "undefined") ? performance.now() : Date.now());
        // Throttle to ~once per second
        if (nowMs - this._lastRegrowthMs < 1000) return 0;
        this._lastRegrowthMs = nowMs;
        if (!this.router || !this.world) return 0;
        if (this._registry.size >= this._targetCount) return 0;
        let regrown = 0;
        const remaining = [];
        const TREE_KINDS = ["tree_pine", "tree_oak", "tree_birch"];
        const rand = this._seededRand((this.seed + Math.floor(nowMs / 1000)) >>> 0);
        for (const slot of this._consumedSlots) {
            if (nowMs - slot.atMs < this.REGROWTH_MS) {
                remaining.push(slot);
                continue;
            }
            // Time to regrow. Jitter +/- 2 voxels so the new tree
            // isn't perfectly on the old stump.
            const x = slot.x + (Math.floor(rand() * 5) - 2);
            const z = slot.z + (Math.floor(rand() * 5) - 2);
            const y = (this.world._heightAt?.(x, z) ?? 0) + 0.5;
            const kind = TREE_KINDS[Math.floor(rand() * TREE_KINDS.length)];
            try {
                // Round 280 — sapling starts at 0.5, grows to 0.75
                // over GROW_S seconds via tickSaplingGrowth.
                const startScale = 0.5;
                const finalScale = 0.75;
                const r = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: kind, kind,
                    x, y, z,
                    scale: startScale,
                });
                if (r?.ok && r.id != null) {
                    this._registry.set(r.id, { x, y, z, assetId: kind, scale: startScale });
                    this.spawned.push(r.id);
                    regrown++;
                    this._ensureSaplingsList();
                    this._saplings.push({
                        id: r.id, t: 0,
                        fromScale: startScale, toScale: finalScale,
                    });
                }
            } catch {}
            if (this._registry.size >= this._targetCount) {
                // Done — push the rest of the queue back as "still
                // pending" so the next tick gets them in priority order.
                continue;
            }
        }
        this._consumedSlots = remaining;
        if (regrown > 0) {
            console.log(`[TreeSpawner] regrew ${regrown} tree(s), ${this._registry.size}/${this._targetCount} alive, ${this._consumedSlots.length} pending`);
        }
        return regrown;
    }

    snapshot() {
        return { live: this._registry.size, total: this.spawned.length };
    }
}
