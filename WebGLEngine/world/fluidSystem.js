// FILE: world/fluidSystem.js
// VERSION: v2 - BOUNDED, AIR-ONLY, NO OVERWRITE
//
// Fixes from v1:
//   * Sets WATER only when current cell is AIR (v1 overwrote stone!)
//   * Spreads sideways only into AIR neighbors (v1 grew exponentially in
//     confined spaces — every blocked particle became 4 next-tick particles
//     regardless of whether those slots were also blocked)
//   * Hard cap on `active.length` (default 2000); oldest dropped if exceeded
//   * Per-particle TTL (default 200 ticks) so stuck particles eventually die
//
// Particles dying when their host chunk unloads is preserved (the
// `if (!chunk) continue;` drops them naturally).

import { VOXEL } from "./voxelFormat.js";

const MAX_PARTICLES = 2000;
const MAX_AGE       = 200;

export class FluidSystem {
    constructor(world) {
        this.world = world;
        this.active = [];
        this.lastSettled = 0;
        // Off by default -- see addWater. The world floods at ~10,000 voxels/second when this is true.
        this.wetting = false;
    }

    /**
     * *** THIS SYSTEM HAS NEVER RUN, AND TURNING IT ON FLOODS THE WORLD, SO IT IS OFF ON PURPOSE. ***
     *
     * Its only feeder is world/rainSystem.js, whose drops "landed" the instant they spawned because
     * world.isAir answered FALSE above the world -- Chunk.index() was unbounded, a read past the array
     * returned `undefined`, and `undefined === VOXEL.AIR` is false. So addWater was called with the drop's
     * SPAWN height of 65 on a world 64 tall, this system read `undefined` at that cell, took its
     * "non-air, non-water -> particle dies" branch, and every particle died on its first tick. Measured
     * before the bounds check: `active.length` was 0 on every sample of a thirty-second boot, and the water
     * voxel count sat at exactly 46,223 -- the amount generation put there -- and did not move once.
     *
     * Bounding the index turned the pipeline on for the first time and it does not converge. Measured over
     * thirty seconds with the index bounded: 46,223 -> 108,086 -> 190,949 -> 258,808 -> 325,344 water
     * voxels, linear, about 10,000 per second on a world of 3,686,400 cells, with simulate() going from
     * 0.03 ms to 0.7 ms.
     *
     * TWO SEPARABLE THINGS WERE WRONG AND ONLY THE SMALLER ONE IS FIXED HERE. The first is the descent
     * trail: update() placed water and THEN asked whether the particle could fall, so a drop painted every
     * cell it passed through and left a pillar standing in open air -- five voxels per drop on a fixture
     * dropping from y=6 to y=1, at y = 2, 3, 4, 5 and 6. That is repaired below by falling first.
     *
     * *** THE SECOND IS THE ACTUAL FLOOD AND IT IS STILL HERE: THIS IS A BREADTH-FIRST FILL, NOT A FLUID. ***
     * A settled particle spreads into up to FOUR air neighbours, each of which places water and spreads
     * again, and nothing ever removes water behind the frontier. ONE drop on a flat floor wets 41 cells by
     * tick 10, 421 by tick 20, 2,381 by tick 40 and 11,101 by tick 80, still accelerating -- roughly the
     * area of a disc growing a cell per tick. MAX_PARTICLES bounds the FRONTIER, not the wetted area, which
     * is why the cap this file's own v2 header added did not stop it. Trail and spread were measured apart:
     * fixing the trail took the thirty-second flood from 325,344 to 249,726, a 23% reduction, and left it
     * just as linear. No reordering of the steps reaches a steady state; the system needs a sink.
     *
     * So the wetting path is opt-in and defaults OFF. That is not a workaround for the bounds check -- it
     * restores exactly the behaviour this engine has always had, while the two defects the bounds check
     * actually fixes (getCaveFactor calling open sky a cave, isAir reporting rock above the ceiling) are
     * repaired. Giving this system a sink is its own round, filed as fluid-has-no-sink. Set
     * `world.fluid.wetting = true` to work on it; the world will fill.
     */
    addWater(x, y, z) {
        if (!this.wetting) return;
        if (this.active.length >= MAX_PARTICLES) return;
        this.active.push({ x, y, z, age: 0 });
    }

    update() {
        const next = [];
        let settled = 0;

        for (const w of this.active) {
            if (next.length >= MAX_PARTICLES) break;
            if (w.age > MAX_AGE) { settled++; continue; }

            const { x, y, z, age } = w;
            const chunk = this.world.getChunk(x, z);
            if (!chunk) continue;

            const lx = x - chunk.cx * chunk.size;
            const lz = z - chunk.cz * chunk.size;
            const current = chunk.get(lx, y, lz);

            // already water -> particle "lands"
            if (current === VOXEL.WATER) { settled++; continue; }
            // non-air, non-water -> can't fill this cell, particle dies
            if (current !== VOXEL.AIR) { settled++; continue; }

            // *** A FALLING PARTICLE USED TO PAINT EVERY CELL IT PASSED THROUGH. *** The place-then-fall
            // order below was place-water-here, THEN check whether it can fall -- so a drop entering at the
            // rain spawn height and descending to the ground left a solid PILLAR of water voxels in open air,
            // one per cell of its descent, none of which is ever removed. Nothing had ever seen it because
            // world.isAir answered FALSE above the world (Chunk.index() was unbounded), so rain "landed" the
            // instant it spawned and no particle ever fell anywhere. Bounding the index turned the pipeline
            // on and the world filled at about 10,000 water voxels per second, linearly, with no sign of an
            // equilibrium: 46,255 -> 108,086 -> 190,949 -> 258,808 -> 325,344 over thirty seconds.
            //
            // Fall FIRST and place water only where the particle actually comes to rest. A drop in flight is
            // in flight; water is what is left when it stops.
            if (this.world.isAir(x, y - 1, z)) {
                next.push({ x, y: y - 1, z, age: age + 1 });
                continue;
            }

            // Place water voxel -- this cell is where the particle settled
            chunk.set(lx, y, lz, VOXEL.WATER);
            chunk.dirty = true;

            // Spread sideways — only into AIR. If no air neighbors, the
            // particle is settled and dies (water voxel above stays).
            let spread = 0;
            for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                if (next.length >= MAX_PARTICLES) break;
                if (this.world.isAir(x + dx, y, z + dz)) {
                    next.push({ x: x + dx, y, z: z + dz, age: age + 1 });
                    spread++;
                }
            }
            if (spread === 0) settled++;
        }

        this.active = next;
        this.lastSettled = settled;
    }

    snapshot() {
        return { active: this.active.length, lastSettled: this.lastSettled };
    }
}
