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
// *** THE THREE NUMBERS THAT MAKE THIS A FLUID RATHER THAN A FILL, AND WHAT EACH ONE BOUNDS. ***
//
// DROP_VOLUME bounds ONE DROP. A particle carries a volume, placing a water voxel costs exactly one unit of
// it, and whatever is left is SPLIT among the neighbours it spreads into -- so the cells a drop can ever wet
// is at most its volume, however many times it spreads. That is the defect: the old spread turned one
// particle into up to FOUR, each of which placed its own voxel, so mass was created at every step. Measured
// on a flat floor before this change, one drop reached 313 wet cells by tick 20, 10,513 by tick 80 and
// 74,113 by tick 200, still accelerating.
//
// DRY_TICKS bounds THE WHOLE SYSTEM OVER TIME. Conservation alone does not: rain at r drops per tick adds
// r * DROP_VOLUME cells per tick forever. Cells this system placed are remembered and returned to AIR after
// DRY_TICKS, which is the sink the system never had -- and it is the ONLY thing that gives an equilibrium,
// at about r * DROP_VOLUME * DRY_TICKS standing cells.
//
// MAX_TRACKED bounds THE MEMORY. The sink's queue is one entry per placed cell; over the cap the oldest is
// dried early, so a downpour costs a shallower puddle rather than an unbounded array.
const DROP_VOLUME = 4;
const DRY_TICKS   = 600;
const MAX_TRACKED = 20000;

export class FluidSystem {
    constructor(world) {
        this.world = world;
        this.active = [];
        this.lastSettled = 0;
        // the sink: every cell this system set to WATER, oldest first, with the tick it was placed on
        this.placed = [];
        this.tick = 0;
        this.lastDried = 0;
        this.dropVolume = DROP_VOLUME;
        this.dryTicks = DRY_TICKS;
        this.maxTracked = MAX_TRACKED;
        // Off by default -- see addWater. Bounded since v4563; off because nothing has ever run it.
        this.wetting = false;
    }

    /**
     * *** THIS SYSTEM HAS NEVER RUN A SINGLE PARTICLE IN THE ENGINE, AND IT IS STILL OFF -- FOR A DIFFERENT
     * REASON THAN BEFORE. ***
     *
     * Its only feeder is world/rainSystem.js, whose drops "landed" the instant they spawned because
     * world.isAir answered FALSE above the world -- Chunk.index() was unbounded, a read past the array
     * returned `undefined`, and `undefined === VOXEL.AIR` is false. So addWater was called with the drop's
     * SPAWN height of 65 on a world 64 tall, this system read `undefined` at that cell, took its
     * "non-air, non-water -> particle dies" branch, and every particle died on its first tick. Measured
     * before the bounds check: `active.length` was 0 on every sample of a thirty-second boot, and the water
     * voxel count sat at exactly 46,223 -- the amount generation put there -- and did not move once.
     *
     * Bounding the index at v4555 turned the pipeline on for the first time and it did not converge:
     * 46,223 -> 108,086 -> 190,949 -> 258,808 -> 325,344 water voxels over thirty seconds, linear, about
     * 10,000 per second on a world of 3,686,400 cells, with simulate() going from 0.03 ms to 0.7 ms. So the
     * wetting path was made opt-in and left OFF, and giving this system a sink was filed as its own round.
     *
     * *** v4563 IS THAT ROUND, AND THE DEFECT WAS THAT THIS CODE CREATED WATER. *** Three things were wrong
     * and they bound different quantities:
     *
     *   THE DESCENT TRAIL (fixed at v4555). update() placed water and THEN asked whether the particle could
     *   fall, so a drop painted every cell it passed through and left a pillar standing in open air. Falling
     *   first fixed it, and measured apart it was worth 23% of the flood -- the spread was the other 77%.
     *
     *   CONSERVATION (v4563), which bounds ONE DROP. The spread handed each of up to four air neighbours a
     *   whole new particle, every one of which placed its own voxel: one drop became four, then sixteen.
     *   A particle carries a VOLUME now, a placed cell costs one unit of it, and what is left is rationed to
     *   as many neighbours as it can actually fill. Cells wet by a drop <= its volume, always, and the bound
     *   is reached exactly at volumes 1, 2, 4 and 5 on a flat floor.
     *
     *   THE SINK (v4563), which bounds THE SYSTEM OVER TIME. Conservation alone does not: rain adds cells
     *   for as long as it falls. Cells THIS SYSTEM placed are remembered and returned to AIR after
     *   `dryTicks`, so standing water oscillates around an equilibrium instead of rising. Only tracked cells
     *   are dried, so the world's own water is never touched.
     *
     * MEASURED ON A FLAT FLOOR, one drop: 13 wet cells by tick 10, 313 by 20, 2,113 by 40, 10,513 by 80 and
     * 74,113 by 200 BEFORE; exactly its volume AFTER. With rain at one drop per tick: 160,684 cells by tick
     * 200 and still climbing BEFORE; about 512 standing at dryTicks 600 and 143 at dryTicks 50 AFTER, over
     * 1,200 drops that would be 4,800 cells if nothing ever dried.
     *
     * *** SO WHY IS IT STILL OFF? *** Not because it floods -- that is fixed and the fix is gated in
     * world/fluidSystem-selfcheck.mjs. Because no particle of this system has ever run in the engine, so
     * switching it on is a behaviour change nobody has looked at, and this file is not the place to take
     * that decision. Set `world.fluid.wetting = true` to run it; it is bounded now.
     */
    addWater(x, y, z, volume = this.dropVolume) {
        if (!this.wetting) return;
        if (this.active.length >= MAX_PARTICLES) return;
        this.active.push({ x, y, z, age: 0, vol: volume });
    }

    /**
     * Return one placed cell to AIR. Only cells THIS SYSTEM placed are tracked, so the water the world
     * generated is never touched -- a sink that could evaporate an ocean would be a different bug.
     */
    _dry(p) {
        const chunk = this.world.getChunk(p.x, p.z);
        if (!chunk) return false;
        const lx = p.x - chunk.cx * chunk.size, lz = p.z - chunk.cz * chunk.size;
        if (chunk.get(lx, p.y, lz) !== VOXEL.WATER) return false;
        chunk.set(lx, p.y, lz, VOXEL.AIR);
        chunk.dirty = true;
        return true;
    }

    update() {
        const next = [];
        let settled = 0;

        for (const w of this.active) {
            if (next.length >= MAX_PARTICLES) break;
            if (w.age > MAX_AGE) { settled++; continue; }

            const { x, y, z, age } = w;
            const vol = w.vol == null ? this.dropVolume : w.vol;
            // *** A PARTICLE WITH LESS THAN ONE CELL OF WATER IN IT IS NOT A CELL OF WATER. *** This is
            // where the mass creation stopped: the old spread handed each of up to four neighbours a whole
            // new particle, so one drop's worth of water became four, then sixteen. A split divides.
            if (vol < 1) { settled++; continue; }
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
                next.push({ x, y: y - 1, z, age: age + 1, vol });
                continue;
            }

            // Place water voxel -- this cell is where the particle settled. It costs ONE unit of volume and
            // is remembered, because a cell this system placed is a cell this system must be able to remove.
            chunk.set(lx, y, lz, VOXEL.WATER);
            chunk.dirty = true;
            this.placed.push({ x, y, z, t: this.tick });

            // Spread sideways -- only into AIR, and only with what is LEFT after filling this cell, DIVIDED
            // among the neighbours it goes to. Four neighbours do not get four drops; they share one.
            const rest = vol - 1;
            // *** THE OFFSET IS NOT DECORATION. *** A fixed [+x, -x, +z, -z] order means that whenever the
            // volume affords fewer neighbours than there is room for, the same directions win every time and
            // puddles grow east-and-west. Starting the rotation at the cell's own coordinates spreads that
            // choice over the surface without making it random -- the same drop on the same cell always does
            // the same thing, which a gate needs.
            const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const start = ((x + z) % 4 + 4) % 4;
            const dirs = [];
            for (let i = 0; i < 4; i++) {
                const [dx, dz] = DIRS[(start + i) % 4];
                if (this.world.isAir(x + dx, y, z + dz)) dirs.push([dx, dz]);
            }
            // *** THE SPLIT IS RATIONED RATHER THAN DIVIDED FOUR WAYS. *** Dividing what is left among EVERY
            // air neighbour gives each less than a cell as soon as the volume is small, so nothing spreads
            // and the volume is wasted -- at DROP_VOLUME 4 a drop wet exactly one cell and the spread branch
            // was dead code. Handing it to as many neighbours as it can actually fill makes the bound TIGHT:
            // a drop of volume V wets V cells where there is room, and never more.
            let spread = 0;
            const k = Math.min(dirs.length, Math.floor(rest));
            if (k >= 1) {
                const share = rest / k;
                for (let i = 0; i < k; i++) {
                    if (next.length >= MAX_PARTICLES) break;
                    const [dx, dz] = dirs[i];
                    next.push({ x: x + dx, y, z: z + dz, age: age + 1, vol: share });
                    spread++;
                }
            }
            if (spread === 0) settled++;
        }

        this.active = next;
        this.lastSettled = settled;
        this.tick++;
        this.lastDried = this._evaporate();
    }

    /**
     * *** THE SINK, AND IT IS THE ONLY THING HERE THAT PRODUCES AN EQUILIBRIUM. *** Conservation bounds one
     * drop; it does not bound rain, which adds cells for as long as it falls. A cell dries DRY_TICKS after
     * it was placed, so standing water settles at about (drops per tick) * DROP_VOLUME * DRY_TICKS instead
     * of rising forever. Over the cap the oldest dry early, which bounds the queue as well as the puddle.
     */
    _evaporate() {
        let dried = 0, i = 0;
        const over = Math.max(0, this.placed.length - this.maxTracked);
        while (i < this.placed.length) {
            const p = this.placed[i];
            if (i < over || this.tick - p.t >= this.dryTicks) { if (this._dry(p)) dried++; i++; }
            else break;                                    // the queue is in placement order, so this is the end
        }
        if (i) this.placed = this.placed.slice(i);
        return dried;
    }

    snapshot() {
        return { active: this.active.length, lastSettled: this.lastSettled,
                 standing: this.placed.length, lastDried: this.lastDried, tick: this.tick };
    }
}
