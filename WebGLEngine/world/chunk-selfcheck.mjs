// WebGLEngine/world/chunk-selfcheck.mjs -- v4555
//
// Run: node world/chunk-selfcheck.mjs
//
// GATES world/chunk.js's bounds check, and the two systems that were standing on the missing one.
//
// Chunk.index(x, y, z) is `x + size * (z + size * y)` over a flat byte array of size * height * size, and
// it had NO RANGE CHECK. The layout puts x fastest and y slowest, so the three axes fail differently: an
// out-of-range x or z ALIASES into a neighbouring voxel and stays inside the array, while an out-of-range y
// walks off the end -- where a typed array answers `undefined` for a read and silently discards a write.
//
// *** MEASURED IN A NINE-SECOND BOOT OF index.html: 36,754 OF 100,982 VOXEL READS (36.4%) WERE OUT OF
// RANGE. *** Every one of them on Y, and every one off the end of the array; x and z were in range on all
// 100,982, so the aliasing case is real in the arithmetic and does not arise in this engine. The reads came
// from getLavaProximity (21,600), getWaterProximity (13,122), HydraulicErosion (1,441), getCaveFactor
// (1,350), RainSystem (270) and FluidSystem (270).
//
// The fixtures here are hand-built chunks with answers a reader can check by eye, plus the two consumers'
// own arithmetic transcribed, because what a gate must establish is that the boundary behaves and that the
// interior did not move.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Chunk } from "./chunk.js";
import { FluidSystem } from "./fluidSystem.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const AIR = 0, STONE = 1, WATER = 10;

console.log("chunk-selfcheck -- the bounds check, and the two systems standing on the missing one\n");

// =============================================================================================================
console.log("1. *** OUTSIDE THE CHUNK IS EMPTY SPACE, NOT ROCK -- WHICH IS WHAT EVERY CONSUMER READ IT AS ***");
{
    const c = new Chunk(0, 0, 4, 8);            // 4x8x4, 128 cells
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) c.set(x, y, z, STONE);
    say(`a 4x8x4 chunk, solid 0..2, air 3..7; the array is ${c.voxels.length} cells`);
    const above = [8, 9, 12, 40].map((y) => c.get(0, y, 0));
    ok("!! *** A READ ABOVE THE CEILING ANSWERS AIR, WHERE IT USED TO ANSWER `undefined` ***",
        above.every((v) => v === AIR) && c.get(0, 7, 0) === AIR && c.get(0, 2, 0) === STONE,
        `y = 8, 9, 12 and 40 on a chunk 8 tall all read ${above.join(", ")}. *** THE OLD ANSWER WAS ` +
        `undefined, AND undefined IS NOT VOXEL.AIR (0), *** so world.isAir -- which is ` +
        `\`voxelAt(...) === VOXEL.AIR\` -- reported SOLID ROCK above the world, all the way up. Measured in ` +
        `the engine: isAir(0, y, 0) was false at y = 64, 65, 69 and 84 on a world whose chunkHeight is 64.`);
    ok("...and below the floor too, which nothing in the engine was measured asking for",
        c.get(0, -1, 0) === AIR && c.get(0, -20, 0) === AIR,
        "y < 0 returns AIR as well. NOT CLAIMED to be exercised: every out-of-range read observed in the " +
        "engine was ABOVE the ceiling, so this half of the bound is the arithmetic being consistent rather " +
        "than a measured repair, and it is stated that way.");
    // *** THE ALIASING IS PROVED ON index() ITSELF, NOT ASSERTED IN PROSE. *** An earlier draft said in its
    // detail text that index() stays pure arithmetic so this fixture can demonstrate the aliasing, and
    // nothing checked it: adding a bounds check INSIDE index() was a sabotage that went ZERO-RED against
    // thirteen green rows. These two equalities are what make that claim a claim.
    ok("!! ...and an out-of-range x or z is refused even though it never LEFT the array",
        c.index(4, 0, 0) === c.index(0, 0, 1) && c.index(0, 0, 4) === c.index(0, 1, 0) &&
        c.index(4, 0, 0) < c.voxels.length && c.index(0, 0, 4) < c.voxels.length &&
        c.get(4, 0, 0) === AIR && c.get(-1, 0, 0) === AIR && c.get(0, 0, 4) === AIR,
        `index(4,0,0) is ${c.index(4, 0, 0)} and so is index(0,0,1); index(0,0,4) is ${c.index(0, 0, 4)} ` +
        `and so is index(0,1,0). Both are INSIDE an array of ${c.voxels.length}, so an out-of-range x or z ` +
        `returns A NEIGHBOURING VOXEL, indistinguishable from a real read -- the silent half of this bug, ` +
        `and the reason the check is on all three axes even though the engine was measured never to do it. ` +
        `The check lives in get/set and NOT in index(), so those two equalities keep holding; guarding ` +
        `index() instead would hide the very thing this row demonstrates.`);
}

// =============================================================================================================
console.log("\n2. *** THE SAME undefined MET TWO COMPARISONS AND ONLY ONE OF THEM WAS SAFE ***");
{
    // world._proximityScan asks `v === VOXEL.WATER`; world.getCaveFactor asks `v !== VOXEL.AIR`.
    // Transcribed here against the OLD behaviour (raw array read) and the NEW one (bounded get).
    const c = new Chunk(0, 0, 4, 8);
    const rawGet = (x, y, z) => c.voxels[x + c.size * (z + c.size * y)];      // the unbounded original
    const oldV = rawGet(0, 20, 0), newV = c.get(0, 20, 0);
    say(`above the ceiling the old read gives ${String(oldV)}, the bounded read gives ${newV}`);
    ok("!! *** `=== WATER` IS SAFE ON undefined AND `!== AIR` IS NOT, WHICH IS WHY ONE CONSUMER WAS FINE ***",
        (oldV === WATER) === false && (oldV !== AIR) === true &&
        (newV === WATER) === false && (newV !== AIR) === false,
        "_proximityScan tests `v === VOXEL.WATER`, which undefined fails, so an out-of-range sample is " +
        "simply ignored and lava/water proximity was never wrong. getCaveFactor tests `v !== VOXEL.AIR`, " +
        "which undefined PASSES, so every out-of-range sample counted as SOLID. *** 34,722 OF THE 36,754 " +
        "OUT-OF-RANGE READS WENT TO THE HARMLESS ONE, which is exactly why this survived: the loud consumer " +
        "was quiet and the quiet one was wrong.***");
}

// =============================================================================================================
console.log("\n3. *** getCaveFactor CALLED OPEN SKY A CAVE, ON A RAMP THAT IS PURE GEOMETRY ***");
{
    // The engine's own loop: dx -4..4 step 2, dy -3..5 step 2, dz -4..4 step 2 = 5*5*5 = 125 samples,
    // solid / (total * 0.7), clamped at 1. Run against a world that is EMPTY, so every `solid` is spurious.
    const CH = 64;
    const caveFactor = (y, read) => {
        let solid = 0, total = 0;
        for (let dx = -4; dx <= 4; dx += 2) for (let dy = -3; dy <= 5; dy += 2) for (let dz = -4; dz <= 4; dz += 2) {
            if (read(y + dy) !== AIR) solid++;
            total++;
        }
        return Math.min(1, solid / (total * 0.7));
    };
    const oldRead = (y) => (y >= CH ? undefined : AIR);      // unbounded: undefined above the ceiling
    const newRead = (y) => AIR;                              // bounded: air is air
    const rows = [54, 59, 62, 64].map((y) => [y, +caveFactor(y, oldRead).toFixed(3), +caveFactor(y, newRead).toFixed(3)]);
    for (const [y, o, n] of rows) say(`listener at y=${y} in EMPTY air: old ${o}, new ${n}`);
    ok("!! *** A LISTENER IN CLEAR AIR WAS TOLD IT WAS IN A CAVE, AND THE NUMBERS ARE THE ENGINE'S OWN ***",
        rows[0][1] === 0 && rows[1][1] === 0.286 && rows[2][1] === 0.571 && rows[3][1] === 0.857 &&
        rows.every((r) => r[2] === 0),
        "0, 0.286, 0.571, 0.857 at y = 54, 59, 62, 64 -- and getCaveFactor's own comment says 0 is open sky " +
        "and 1 is fully enclosed, driving reverb toward cave. The ramp is exactly the fraction of the 9x9x9 " +
        "sample box that has crossed the ceiling: at y=59 one of five dy layers is out, at y=62 two, at y=64 " +
        "three. *** THESE FOUR NUMBERS WERE ALSO READ OUT OF A RUNNING index.html ON A COLUMN WHOSE HIGHEST " +
        "SOLID VOXEL IS AT y=24, and they matched this arithmetic exactly *** -- which is what says the " +
        "fixture is the engine and not a story about it.");
    ok("...and the fix does not flatten a REAL cave, which is the control that makes the row mean something",
        (() => { const solidRead = (y) => (y >= 0 && y < CH ? STONE : AIR); return caveFactor(30, solidRead) === 1; })(),
        "the same loop over genuinely solid surroundings still returns 1. In the engine the control was a " +
        "listener at y=27 over terrain topping out at 24: 0.331 before the fix and 0.331 after it. A repair " +
        "that took every caveFactor to zero would pass the row above and be worse than the defect.");
}

// =============================================================================================================
console.log("\n4. *** A WRITE OUTSIDE THE CHUNK IS DROPPED -- AS IT ALWAYS WAS -- AND NO LONGER DIRTIES ***");
{
    const c = new Chunk(0, 0, 4, 8);
    c.dirty = false;
    c.set(0, 20, 0, STONE);
    const dirtiedByOob = c.dirty;
    const snapshot = Array.from(c.voxels);
    c.set(1, 1, 1, STONE);
    ok("!! an out-of-range write changes nothing AND leaves the chunk clean",
        dirtiedByOob === false && snapshot.every((v) => v === AIR) && c.get(1, 1, 1) === STONE && c.dirty === true,
        "the write was always discarded -- a typed array ignores an index past its end -- but it used to set " +
        "dirty = true on the way out. *** NOT CLAIMED: THAT THIS SAVES A RE-MESH. *** All 1,891 such writes " +
        "in the measured boot landed on a chunk that was ALREADY dirty, so zero rebuilds were added by them " +
        "and none are removed by this. An earlier draft of this round asserted the rebuild cost and the " +
        "instrument said 0 dirty transitions; the claim is dropped rather than softened.");
    ok("...and an in-range write still behaves exactly as it did, including the no-op guard",
        (() => { const d = new Chunk(0, 0, 4, 8); d.set(2, 3, 1, STONE); d.dirty = false;
                 d.set(2, 3, 1, STONE); return d.dirty === false && d.get(2, 3, 1) === STONE; })(),
        "writing the value a cell already holds does not dirty the chunk, which is the behaviour the file " +
        "had before this round and the thing a bounds check must not disturb.");
}

// =============================================================================================================
console.log("\n5. *** RAIN NEVER FELL, BECAUSE THE WORLD SAID THERE WAS ROCK ABOVE IT ***");
{
    // RainSystem.step's own hit test: `if (ny < 0 || !world.isAir(d.x, ny, d.z))` -> the drop has landed.
    const CH = 64, GROUND = 24;
    const isAirOld = (y) => (y >= CH ? false : y > GROUND);   // undefined !== AIR -> "solid" above the world
    const isAirNew = (y) => y > GROUND;                        // bounded: air is air
    const fall = (isAir) => { let y = 65, steps = 0; while (steps < 200) { const ny = y - 1;
        if (ny < 0 || !isAir(ny)) return { landedAt: y, steps }; y = ny; steps++; } return { landedAt: y, steps }; };
    const o = fall(isAirOld), n = fall(isAirNew);
    say(`spawn height 65 on a world 64 tall with ground at ${GROUND}: old lands at y=${o.landedAt} after ` +
        `${o.steps} step(s), new lands at y=${n.landedAt} after ${n.steps}`);
    ok("!! *** EVERY DROP LANDED ON ITS FIRST STEP, IN MID-AIR, AT THE HEIGHT IT SPAWNED ***",
        o.landedAt === 65 && o.steps === 0 && n.landedAt === GROUND + 1 && n.steps === 40,
        `RainSystem spawns at 65 on a world whose chunkHeight is 64, tests isAir at 64, and was told SOLID. ` +
        `Measured in the engine before the fix: 335 spawned, 335 LANDED, none in flight -- and after it, 345 ` +
        `spawned, 84 landed, 261 IN FLIGHT. The drop now falls the 40 cells to the ground it was always ` +
        `meant to reach.`);
}

// =============================================================================================================
console.log("\n6. *** AND WHAT LANDING TURNED ON: A FLUID SYSTEM THAT HAD NEVER RUN A SINGLE PARTICLE ***");
{
    const world = {
        chunkHeight: 8,
        chunks: new Map(),
        getChunk(x, z) { const k = Math.floor(x / 4) + "," + Math.floor(z / 4);
            if (!this.chunks.has(k)) { const c = new Chunk(Math.floor(x / 4), Math.floor(z / 4), 4, 8);
                for (let xx = 0; xx < 4; xx++) for (let zz = 0; zz < 4; zz++) c.set(xx, 0, zz, STONE);
                this.chunks.set(k, c); } return this.chunks.get(k); },
        isAir(x, y, z) { const c = this.getChunk(x, z);
            return c.get(x - c.cx * 4, y, z - c.cz * 4) === AIR; },
    };
    const f = new FluidSystem(world);
    ok("!! *** THE WETTING PATH IS OFF BY DEFAULT, AND THAT IS A DECISION WITH A NUMBER BEHIND IT ***",
        f.wetting === false && (f.addWater(1, 6, 1), f.active.length === 0),
        "addWater is a no-op until `wetting` is set. Bounding the index turned this pipeline on for the " +
        "first time and IT DOES NOT CONVERGE: water voxels are placed and never removed, so over thirty " +
        "seconds the engine went 46,223 -> 108,086 -> 190,949 -> 258,808 -> 325,344 water voxels, linear, " +
        "about 10,000 per second on a world of 3,686,400 cells, with simulate() going 0.03 ms to 0.7 ms. " +
        "*** OFF RESTORES EXACTLY THE BEHAVIOUR THIS ENGINE HAS ALWAYS HAD *** while the two defects the " +
        "bounds check really fixes stay fixed. Giving it a sink is filed as fluid-has-no-sink.");
    // and with it on, the two separable facts: the descent trail (fixed) and the lateral spread (not)
    f.wetting = true;
    f.addWater(1, 6, 1);
    for (let i = 0; i < 10; i++) f.update();
    let placed = 0, aboveRest = 0;
    for (const c of world.chunks.values())
        for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++)
            if (c.get(x, y, z) === WATER) { placed++; if (y >= 2) aboveRest++; }
    say(`one drop from y=6 onto ground at y=0, ten ticks: ${placed} water voxels, ${aboveRest} of them above ` +
        `the height it settled at`);
    ok("!! *** A FALLING PARTICLE NO LONGER PAINTS THE CELLS IT PASSES THROUGH ***",
        aboveRest === 0 && placed > 0,
        `${aboveRest} water voxels above the settle height. The original placed water BEFORE testing whether ` +
        `it could fall, so the same drop left a PILLAR standing in open air -- measured against the ` +
        `unmodified file on this exact fixture, water at y = 2, 3, 4, 5 and 6 in the spawn column, five ` +
        `voxels of it. Fall first, and place water only where the particle comes to rest.`);
    // *** THIS ROW USED TO ASSERT THE DEFECT WAS STILL HERE, AND IT WENT RED THE DAY THE SINK LANDED. ***
    // It read `placed > 20` and said so in its own text: "it goes red when somebody gives the system a
    // sink, and that is the round to write." v4563 wrote it, this row failed, and that is the row working
    // rather than the round breaking it. What it asserts now is the bound, on the same fixture.
    ok("!! *** AND THAT WAS NOT THE FLOOD -- THE SPREAD WAS, AND ONE DROP NOW WETS ITS OWN VOLUME ***",
        placed > 0 && placed <= 4,
        `${placed} voxels from ONE drop of the default volume 4, none of them the trail. BEFORE v4563 a ` +
        `settled particle handed each of up to FOUR air neighbours a whole new particle, every one of which ` +
        `placed its own voxel -- a breadth-first fill of every reachable air cell at that level, with ` +
        `nothing removing water behind it: 41 voxels at tick 10, 421 at 20, 2,381 at 40 and 11,101 at 80 on ` +
        `a flat floor, still accelerating. *** MAX_PARTICLES BOUNDED THE FRONTIER, NOT THE WETTED AREA, *** ` +
        `which is why the cap in that file's own v2 header did not stop it. A particle carries a VOLUME ` +
        `now, a placed cell costs one unit of it, and the remainder is rationed rather than duplicated. The ` +
        `equilibrium, the sink and the conservation bound are graded in world/fluidSystem-selfcheck.mjs.`);
}

// =============================================================================================================
console.log("\n7. *** THE INTERIOR DID NOT MOVE, WHICH IS THE HALF A BOUNDS CHECK USUALLY BREAKS ***");
{
    const c = new Chunk(1, -2, 16, 64);
    let n = 0, wrong = 0;
    for (let y = 0; y < 64; y += 7) for (let x = 0; x < 16; x += 3) for (let z = 0; z < 16; z += 3) {
        const v = ((x * 7 + y * 13 + z * 3) % 250) + 1;
        c.set(x, y, z, v); n++;
        if (c.get(x, y, z) !== v) wrong++;
        if (c.index(x, y, z) !== x + 16 * (z + 16 * y)) wrong++;
    }
    ok("!! every in-range cell round-trips, and index() itself is untouched arithmetic",
        n > 300 && wrong === 0,
        `${n} cells written and read back, ${wrong} disagreements, on a chunk at (1, -2) so the local/world ` +
        `offset is exercised too. index() is deliberately NOT the place the check went -- it stays pure ` +
        `arithmetic and get/set do the refusing, because index() is what the fixture above uses to prove the ` +
        `x/z aliasing is real.`);
    ok("...and isSolid follows get, so it answers false above the ceiling rather than true",
        c.isSolid(0, 200, 0) === false && c.isSolid(0, -1, 0) === false,
        "isSolid is `get(...) !== 0`, which is the SAME `!== AIR` shape that made getCaveFactor wrong. It " +
        "reads correctly now because get does; it would have returned true for every cell above the world.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\n*** WHAT THIS ROUND DID NOT DO, STATED BECAUSE THE SCOPE MOVED UNDER IT: *** it did not give " +
    "FluidSystem a sink, and that is why the wetting path ships OFF rather than on -- the bounds check is " +
    "correct and the system it wakes is not ready, and shipping a flooding world to fix a reverb bug would " +
    "be the worse trade. It did not repair HydraulicErosion either: its 1,674 carves per boot at y=65 are " +
    "gone because the reads are bounded, but whether erosion at REAL surface heights converges is unmeasured " +
    "-- solid voxel counts held constant across every window taken here, which is not the same as proven. " +
    "And it did not touch RainSystem's spawnHeight of 65, which is outside a world 64 tall: it works now " +
    "because a drop above the ceiling correctly sees air and falls in, but a spawn height inside the world " +
    "would be the clearer spelling.");
process.exit(fails ? 1 : 0);
