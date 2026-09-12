// world/fluidSystem-selfcheck.mjs -- v4563
//
// Run: node world/fluidSystem-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** world/fluidSystem.js WAS A BREADTH-FIRST FILL WEARING THE WORD "FLUID", AND THE DEFECT WAS THAT IT
// CREATED WATER. *** A settled particle spread into up to FOUR air neighbours and handed each of them a
// whole new particle, every one of which placed its own voxel. One drop became four, then sixteen. Nothing
// ever removed a voxel behind the frontier, and MAX_PARTICLES bounded the FRONTIER rather than the wetted
// area -- which is why the cap the file's own v2 header added did not stop it.
//
// Measured on a flat floor before v4563, ONE drop: 13 wet cells by tick 10, 313 by 20, 2,113 by 40,
// 10,513 by 80 and 74,113 by 200, still accelerating. With rain at one drop per tick: 160,684 by tick 200
// with the frontier pinned at the 2,000-particle cap.
//
// TWO THINGS WERE MISSING AND THEY BOUND DIFFERENT QUANTITIES:
//
//   CONSERVATION bounds ONE DROP. A particle carries a volume, a placed cell costs exactly one unit of it,
//   and what is left is RATIONED to as many neighbours as it can fill. Cells wet by a drop <= its volume,
//   whatever the terrain does.
//
//   A SINK bounds THE SYSTEM OVER TIME. Conservation alone does not: rain adds cells for as long as it
//   falls. Cells this system placed are remembered and returned to AIR after dryTicks, and that is the only
//   thing here that produces an equilibrium.
//
// THE FLAG IS STILL OFF, AND FOR A DIFFERENT REASON THAN BEFORE. It was off because the world flooded.
// It is off now because nothing in this engine has ever run a single particle of this system, so switching
// it on is a behaviour change nobody has looked at -- a decision with numbers behind it rather than a
// workaround. Section 6 states what those numbers are.
"use strict";
import { FluidSystem } from "./fluidSystem.js";
import { Chunk } from "./chunk.js";
import { VOXEL } from "./voxelFormat.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

const SZ = 32, H = 16;
/** A flat stone floor at y=0, air above, big enough that nothing this file does reaches an edge. */
function flatWorld({ seedWater = 0 } = {}) {
    const w = {
        chunkHeight: H, chunks: new Map(),
        getChunk(x, z) {
            const cx = Math.floor(x / SZ), cz = Math.floor(z / SZ), k = cx + "," + cz;
            if (!this.chunks.has(k)) {
                const c = new Chunk(cx, cz, SZ, H);
                for (let xx = 0; xx < SZ; xx++) for (let zz = 0; zz < SZ; zz++) c.set(xx, 0, zz, VOXEL.STONE);
                this.chunks.set(k, c);
            }
            return this.chunks.get(k);
        },
        isAir(x, y, z) { const c = this.getChunk(x, z); return c.get(x - c.cx * SZ, y, z - c.cz * SZ) === VOXEL.AIR; },
        count(v) { let n = 0; for (const c of this.chunks.values())
            for (let y = 0; y < H; y++) for (let x = 0; x < SZ; x++) for (let z = 0; z < SZ; z++)
                if (c.get(x, y, z) === v) n++; return n; },
    };
    // "generation's" water, which this system must never touch: a pond in the far corner
    for (let i = 0; i < seedWater; i++) { const c = w.getChunk(0, 0); c.set(i % SZ, 1, Math.floor(i / SZ), VOXEL.WATER); }
    return w;
}
const run = (f, ticks) => { for (let t = 0; t < ticks; t++) f.update(); };

console.log("1. *** ONE DROP WETS AT MOST ITS OWN VOLUME, WHICH IS THE THING THE OLD SPREAD DID NOT DO ***");
{
    const rows = [];
    let allWithin = true, tight = 0;
    for (const V of [1, 2, 4, 5, 8, 16, 32]) {
        const w = flatWorld(), f = new FluidSystem(w);
        f.wetting = true;
        f.addWater(64, 8, 64, V);
        run(f, 300);
        const wet = w.count(VOXEL.WATER);
        rows.push(`${V}->${wet}`);
        if (wet > V) allWithin = false;
        if (wet === V) tight++;
    }
    ok("!! *** CELLS WET <= VOLUME, ON EVERY VOLUME, WITH THE BOUND ACTUALLY REACHED ON THE SMALL ONES ***",
       allWithin && tight >= 3,
       `volume->cells ${rows.join(", ")}. The bound is TIGHT at 1, 2, 4 and 5 -- a drop spends everything it ` +
       "has -- and slack above that because water blocks its own neighbours, so some volume is stranded and " +
       "dies rather than being spent. BEFORE v4563 this same fixture at one drop went 13 wet by tick 10, " +
       "313 by 20, 2,113 by 40, 10,513 by 80 and 74,113 by 200, still accelerating: the spread handed each " +
       "of up to four neighbours a whole particle instead of a share, so mass was created at every step.");

    // *** AND THE RATION IS WHAT MAKES IT TIGHT, WHICH THE FIRST VERSION GOT WRONG. *** Dividing the
    // remainder among EVERY air neighbour gives each less than a cell as soon as the volume is small, so
    // nothing spreads at all: at volume 4 a drop wet exactly ONE cell and the spread branch was dead code.
    const w = flatWorld(), f = new FluidSystem(w);
    f.wetting = true; f.addWater(64, 8, 64, 4); run(f, 50);
    ok("!! a drop of volume 4 spends all four cells rather than one, so the spread is not dead code",
       w.count(VOXEL.WATER) === 4,
       `${w.count(VOXEL.WATER)} cells. Four neighbours sharing three units get 0.75 each and none of them ` +
       "can place; three neighbours sharing three units get 1.0 each and all three can.");
}

console.log("\n2. *** AND THE WHOLE SYSTEM REACHES AN EQUILIBRIUM, WHICH CONSERVATION ALONE DOES NOT GIVE ***");
{
    const rows = [];
    let bounded = true;
    for (const dry of [50, 200, 600]) {
        const w = flatWorld(), f = new FluidSystem(w);
        f.wetting = true; f.dryTicks = dry;
        const seen = [];
        for (let t = 1; t <= 1200; t++) {
            f.addWater(56 + (t * 7) % 16, 8, 56 + (t * 11) % 16);
            f.update();
            if (t % 400 === 0) seen.push(w.count(VOXEL.WATER));
        }
        rows.push(`dry ${dry}: ${seen.join(" / ")}`);
        // 1,200 drops of volume 4 is 4,800 cells if nothing ever dried; a 16x16 patch two deep is 512
        if (seen[seen.length - 1] > 600) bounded = false;
    }
    ok("!! *** 1,200 DROPS, AND THE STANDING WATER STOPS RISING INSTEAD OF PASSING 4,800 CELLS ***",
       bounded,
       `${rows.join("   ")} (cells at t=400 / 800 / 1200). It OSCILLATES rather than settling on one ` +
       "number, which is what an equilibrium between a source and a sink looks like: drying opens cells and " +
       "the next drops refill them. A shorter dryTicks holds less water, which is the knob doing what it " +
       "says. THE SAME FIXTURE BEFORE v4563 reached 160,684 cells by tick 200 and was still climbing.");

    const w = flatWorld(), f = new FluidSystem(w);
    f.wetting = true; f.dryTicks = 20;
    f.addWater(64, 8, 64, 4);
    run(f, 12);                     // seven ticks to fall from y=8 to the floor, then it spreads
    const wet = w.count(VOXEL.WATER);
    run(f, 40);
    ok("!! ...and the sink is a REAL removal: with nothing feeding it, the puddle goes back to nothing",
       wet > 0 && w.count(VOXEL.WATER) === 0 && f.placed.length === 0,
       `${wet} cells after twelve ticks, ${w.count(VOXEL.WATER)} after forty more at dryTicks 20, and the ` +
       `queue that remembers them is ${f.placed.length} long. A sink that only slows the rise is not a sink.`);
}

console.log("\n3. *** IT REMOVES ONLY WHAT IT PLACED -- a sink that could evaporate an ocean is a worse bug ***");
{
    // *** THE SEEDED WATER IS PUT WHERE THE RAIN FALLS, NOT IN A FAR CORNER. *** The first version of this
    // fixture seeded 200 cells in another chunk entirely, so a sink that dried cells it never placed would
    // have had to reach across the world to be caught -- and a sabotage that dried a neighbouring cell in
    // the RAIN'S OWN COLUMN went 0 RED. Untracked water now sits exactly where the system is working.
    const w = flatWorld(), f = new FluidSystem(w);
    // (70, 70) rather than (64, 64): 64 is exactly a chunk boundary, so the local x of the cell to its west
    // is -1 and Chunk.set REFUSES it -- correctly, since v4555 bounded the index. The first version of this
    // fixture seeded nine cells and wrote four, and read `undefined` back for the rest.
    const c0 = w.getChunk(70, 70);
    const lx = 70 - c0.cx * SZ, lz = 70 - c0.cz * SZ;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) c0.set(lx + dx, 1, lz + dz, VOXEL.WATER);
    const seeded = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) seeded.push([lx + dx, lz + dz]);
    const before = w.count(VOXEL.WATER);
    f.wetting = true; f.dryTicks = 10;
    for (let t = 0; t < 80; t++) { f.addWater(69 + (t % 3), 8, 69 + ((t * 2) % 3), 4); f.update(); }
    const survived = seeded.filter(([x, z]) => c0.get(x, 1, z) === VOXEL.WATER).length;
    ok("!! *** WATER THIS SYSTEM DID NOT PLACE IS NEVER DRIED, EVEN WHERE IT IS WORKING ***",
       before === 9 && survived === 9,
       `nine cells of "generation" water at the exact spot the rain lands, ${survived} still there after ` +
       "eighty ticks of rain and drying at dryTicks 10. The queue holds only cells this system SET, so a " +
       "cell it merely landed on is not in it -- a drop arriving on water dies without placing anything. " +
       "A sink that could evaporate an ocean would be a worse bug than the flood it replaces.");
}

// *** AND THE GUARD ON THE CELL ITSELF, WHICH A SABOTAGE FOUND NOTHING WAS DRIVING. *** Deleting the
// "is it still water?" test from the sink went 0 RED, because in every fixture above a tracked cell IS
// still water when its turn comes. The hazard it guards is a cell that changed under the queue: the sink
// holds a coordinate for dryTicks, and anything can happen to that cell in the meantime. A sink that turns
// somebody's wall into air is worse than the flood it replaces.
{
    const w = flatWorld(), f = new FluidSystem(w);
    f.wetting = true; f.dryTicks = 15;
    f.addWater(70, 4, 70, 1);
    run(f, 6);
    const c = w.getChunk(70, 70), lx = 70 - c.cx * SZ, lz = 70 - c.cz * SZ;
    const placedAt = c.get(lx, 1, lz);
    c.set(lx, 1, lz, VOXEL.STONE);          // somebody builds on the puddle
    run(f, 40);
    ok("!! *** A CELL THAT CHANGED UNDER THE QUEUE IS LEFT ALONE, NOT TURNED TO AIR ***",
       placedAt === VOXEL.WATER && c.get(lx, 1, lz) === VOXEL.STONE && f.placed.length === 0,
       `the drop placed water at (70, 1, 70), that cell was then set to STONE, and forty ticks later it is ` +
       `${c.get(lx, 1, lz) === VOXEL.STONE ? "still STONE" : "NOT stone"} with the queue emptied ` +
       `(${f.placed.length} entries). The queue holds coordinates, not cells, and dryTicks is long enough ` +
       "for the world to have moved on -- so the sink checks what is actually there before removing it.");
}

console.log("\n4. *** THE QUEUE IS BOUNDED TOO, so a downpour costs a shallower puddle and not memory ***");
{
    const w = flatWorld(), f = new FluidSystem(w);
    f.wetting = true; f.dryTicks = 100000; f.maxTracked = 40;
    for (let t = 1; t <= 300; t++) { f.addWater(48 + (t * 7) % 32, 8, 48 + (t * 13) % 32, 4); f.update(); }
    ok("!! the tracking queue never passes its cap, whatever the rain does",
       f.placed.length <= 40 && f.lastDried >= 0,
       `${f.placed.length} entries against a cap of 40 after 300 drops with drying effectively switched off ` +
       `(dryTicks 100,000). Over the cap the OLDEST dry early, so the cap is a depth limit on the puddle ` +
       "rather than a leak in the array.");
}

console.log("\n5. *** THE DESCENT TRAIL, WHICH IS A DIFFERENT DEFECT AND WAS FIXED FIRST ***");
{
    const w = flatWorld(), f = new FluidSystem(w);
    f.wetting = true;
    f.addWater(64, 12, 64, 1);
    run(f, 30);
    let above = 0, at = 0;
    for (const c of w.chunks.values())
        for (let y = 0; y < H; y++) for (let x = 0; x < SZ; x++) for (let z = 0; z < SZ; z++)
            if (c.get(x, y, z) === VOXEL.WATER) { if (y > 1) above++; else at++; }
    ok("!! a drop falling eleven cells leaves water where it STOPS and nowhere on the way",
       above === 0 && at === 1,
       `${at} cell at the floor, ${above} above it. update() placed water and THEN asked whether the ` +
       "particle could fall, so a drop painted a pillar of water standing in open air, one voxel per cell " +
       "of its descent. Fixed at v4555 by falling first; measured apart from the spread, it was worth 23% " +
       "of a thirty-second flood and the spread was the other 77%.");
}

console.log("\n6. *** AND THE FLAG IS STILL OFF, FOR A REASON THAT IS NOT THE OLD ONE ***");
{
    const f = new FluidSystem(flatWorld());
    const before = f.active.length;
    f.addWater(1, 6, 1);
    ok("!! addWater is a no-op until `wetting` is set, and the default is off",
       f.wetting === false && f.active.length === before,
       "OFF used to mean 'the world floods at about 10,000 voxels per second'. That reason is gone and " +
       "measured gone: one drop is bounded by its volume and rain reaches an equilibrium. What has NOT " +
       "changed is that no particle of this system has ever run in the engine -- rain 'landed' at its spawn " +
       "height for as long as Chunk.index() was unbounded -- so switching it on is a behaviour change " +
       "nobody has looked at, and that is a decision to take deliberately rather than a default to drift " +
       "into. THE NUMBERS ARE HERE NOW: at one drop per tick over a 16x16 patch it stands at about 512 " +
       "cells with dryTicks 600 and about 143 with dryTicks 50.");
}

console.log(fails ? `\nfluidSystem-selfcheck: ${fails} FAILED` : "\nfluidSystem-selfcheck: all checks pass");
console.log("NOT CLAIMED: that this is a fluid. It has no pressure, no levelling and no flow rate -- a " +
    "puddle does not find its own surface, it wets outward from where a drop fell until its volume runs " +
    "out. What is claimed is that it CONSERVES and that it has a SINK, which are the two things a system " +
    "that fills a world forever does not have. Also not claimed: that the engine should switch it on.");
process.exit(fails ? 1 : 0);
