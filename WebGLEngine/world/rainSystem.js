// FILE: world/rainSystem.js
// VERSION: v2 - CAPPED + CAMERA-FOLLOWING + RATE LIMITED
//
// Fixes from v1:
//   * `update()` no longer spawns 20 drops on every call — instead it
//     spawns at most `spawnPerTick` (default 5) and only if the active
//     drop count is under `maxDrops` (default 300).
//   * Rain area follows the camera so drops fall over the player rather
//     than hard-coded (0, 0). Set via `setCenter(x, z)` from main.js
//     each frame, or rain's centered around (0,0) by default.
//   * Drop's `velocity` actually applies (was set but never modified).
//
// step() is unchanged in spirit: drops fall, hit ground, become a fluid
// particle via world.fluid.addWater. Now also respects `world.fluid`
// existence (in case fluid system is disabled).

const DEFAULT_SPAWN_PER_TICK = 5;
const DEFAULT_MAX_DROPS      = 300;

export class RainSystem {
    constructor(world) {
        this.world = world;
        this.drops = [];

        this.intensity     = 1.0;     // global multiplier for spawn rate
        this.areaSize      = 80;      // box around `center` to spawn within
        this.center        = { x: 0, z: 0 };

        this.spawnPerTick  = DEFAULT_SPAWN_PER_TICK;
        this.maxDrops      = DEFAULT_MAX_DROPS;
        this.spawnHeight   = 65;      // above typical terrain max

        this.totalSpawned  = 0;
        this.totalLanded   = 0;
    }

    setCenter(x, z) {
        this.center.x = x;
        this.center.z = z;
    }

    // Called each tick. Bounded; doesn't spawn if at cap.
    update() {
        const target = Math.min(
            this.drops.length + Math.ceil(this.spawnPerTick * this.intensity),
            this.maxDrops
        );
        while (this.drops.length < target) {
            const dx = (Math.random() - 0.5) * this.areaSize;
            const dz = (Math.random() - 0.5) * this.areaSize;
            this.drops.push({
                x: Math.floor(this.center.x + dx),
                y: this.spawnHeight,
                z: Math.floor(this.center.z + dz),
                velocity: 1.0,
            });
            this.totalSpawned++;
        }
    }

    // Fall + hit detection. Drops that hit ground become fluid.addWater()
    // and probabilistically also seed hydraulic erosion (so visible river
    // channels carve over time). Probability gate is intentional — every
    // drop seeding hydraulic would saturate its 500-particle cap fast.
    step() {
        const next = [];
        for (const d of this.drops) {
            const ny = d.y - d.velocity;

            // Hit ground or block (or fell below world)
            if (ny < 0 || !this.world.isAir(d.x, ny, d.z)) {
                if (this.world.fluid) {
                    this.world.fluid.addWater(d.x, d.y, d.z);
                }
                if (this.world.hydraulic && Math.random() < 0.15) {
                    this.world.hydraulic.add(d.x, d.y, d.z);
                }
                this.totalLanded++;
                continue;
            }

            // Still falling
            next.push({ x: d.x, y: ny, z: d.z, velocity: d.velocity });
        }
        this.drops = next;
    }

    snapshot() {
        return {
            drops: this.drops.length,
            spawned: this.totalSpawned,
            landed: this.totalLanded,
        };
    }
}
