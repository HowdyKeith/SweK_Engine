// WebGLEngine/render/fireSpread.mjs -- v4422
//
// *** #163 COMPARED THE FIRES ON COLOUR AND SAID THE SPREAD RULES WERE STILL UNCOMPARED. THIS IS THAT. ***
//
// v4412 found the axis on which a cellular automaton, a ray-marched volume and a voxel spread rule are
// actually comparable -- "what colour is fire at heat h" -- and closed with the limit written down: "that the
// six fires were compared AS FIRES: the spread rules are still uncompared, which is what is left of the item."
//
// The axis here is not pixels either. It is the two questions every spread rule answers whether or not its
// author wrote them down:
//
//     1. DOES THE FIRE CONSUME WHAT IT BURNS?
//     2. WHAT DOES ITS FRONT DO -- travel, or settle?
//
// ---- THE ANSWER, AND THE TWO RULES ARE NOT TWO IMPLEMENTATIONS OF ONE IDEA ---------------------------------
//
//                          render/doomFire.mjs                world/fireSystem.js
//     fuel model           NONE. The source row is held       GRASS -> ASH. Finite, and consumed.
//                          lit and never changes.
//     front               SETTLES at ~39 rows, and that       TRAVELS at 1 cell per step until the
//                          height is a property of the        fuel runs out.
//                          decay rate, not of the grid.
//     goes out by itself   NEVER, while lit.                  ALWAYS. 40 of 40 cells to ash at t = 5.9 s.
//     after extinguish()   dark in 46 steps, by decay          n/a -- it had already gone out
//
// *** ONE IS A STEADY-STATE INTENSITY FIELD WITH A STATIONARY FRONT. THE OTHER IS A TRAVELLING FRONT THAT
// EATS ITS SUBSTRATE. *** They are not two takes on one idea and they cannot be swapped: a wildfire drawn
// with doomFire's rule would never stop, and a thruster plume drawn with fireSystem's rule would consume the
// engine. The tree has been calling both "fire", which is true and is the whole reason the comparison had to
// be made on something other than the name.
//
// ---- *** AND THE FIRST MEASUREMENT OF THE PLATEAU WAS THE GRID CEILING. *** ---------------------------------
//
// Measured on an 8x40 grid, doomFire's flame height read 34-40 rows and looked like a clean steady state. IT
// WAS THE TOP OF THE GRID. Only running it taller separates "the rule settles here" from "the array ended":
//
//     grid height   steady flame height (mean of steps 601-1200)   ceiling-limited
//        40                    37.8  (min 33, max 40)                   YES
//       100                    38.6  (min 32, max 46)                   no
//       200                    38.8  (min 33, max 47)                   no
//       400                    39.1  (min 32, max 49)                   no
//
// The height converges to ~39 and stops moving as the grid grows, so it is a PROPERTY OF THE DECAY RATE. A
// measurement taken at one size and called a plateau would have been a claim about the container -- the same
// species as v4418's threshold tuned on one frame size, two rounds ago.
"use strict";

import { DoomFire } from "./doomFire.mjs";

/**
 * *** A FAKE WORLD, BECAUSE world/fireSystem.js HAS NEVER HAD A GATE AND CANNOT GET ONE THROUGH A BROWSER. ***
 * It needs exactly three methods -- getChunk, voxelAt, setVoxel -- and a line of fuel is enough to ask both
 * questions. Arithmetic, not a page: v4412 named this file's subject as unfinished and the reason it stayed
 * unfinished is that one of the two fires lives inside a voxel world nobody had stubbed.
 */
export function lineWorld(n, VOXEL, { fuel = null } = {}) {
    const cells = new Map();
    const key = (x, y, z) => x + "," + y + "," + z;
    const F = fuel === null ? VOXEL.GRASS : fuel;
    for (let x = 0; x < n; x++) cells.set(key(x, 1, 0), F);
    return {
        chunks: new Map(),
        getChunk: (x, z) => (x >= -1 && x <= n && z === 0 ? { height: 8 } : null),
        voxelAt: (x, y, z) => (cells.has(key(x, y, z)) ? cells.get(key(x, y, z)) : VOXEL.AIR),
        setVoxel: (x, y, z, t) => cells.set(key(x, y, z), t),
        key, cells, length: n,
    };
}

/**
 * Run world/fireSystem.js on a line of fuel and report what its front and its substrate did.
 * `dt` and the params are the caller's, so a gate can state them rather than inherit a default it cannot see.
 */
export function runVoxelLine(FireSystem, VOXEL, { n = 40, dt = 0.1, steps = 200,
                                                  params = { spreadRate: 1, burnSeconds: 2, igniteChance: 1.0, waterStops: false } } = {}) {
    const world = lineWorld(n, VOXEL);
    const sys = new FireSystem(world);
    sys.setParams(params);
    sys.ignite(0, 1, 0);
    const front = [], active = [];
    let wentOutAt = null;
    for (let s = 1; s <= steps; s++) {
        const r = sys.update(dt);
        let f = -1;
        for (let x = 0; x < n; x++) if (sys.cells.has(world.key(x, 1, 0))) f = x;
        front.push(f); active.push(r.active);
        if (r.active === 0) { wentOutAt = s; break; }
    }
    let ash = 0, fuelLeft = 0;
    for (let x = 0; x < n; x++) {
        const v = world.voxelAt(x, 1, 0);
        if (v === VOXEL.ASH) ash++;
        if (v === VOXEL.GRASS) fuelLeft++;
    }
    return Object.freeze({ n, dt, front, active, wentOutAt, ash, fuelLeft,
                           consumesFuel: ash > 0, terminates: wentOutAt !== null });
}

/**
 * Run render/doomFire.mjs and report the same two things.
 *
 * *** `settleFrom` DEFAULTS TO HALF THE RUN, so the steady height is read after the transient rather than
 * through it. *** Reading the mean over the whole run would mix the climb into the plateau and report a
 * number that is neither.
 */
export function runDoomColumn({ width = 8, height = 200, seed = 1, steps = 1200, settleFrom = null } = {}) {
    const fire = new DoomFire({ width, height, seed });
    const src = () => { let s = 0; for (let x = 0; x < width; x++) s += fire.at(x, height - 1); return s; };
    const sourceAtStart = src();
    const topLit = () => { for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (fire.at(x, y) > 0) return y; return height; };
    const flame = [];
    for (let s = 1; s <= steps; s++) { fire.step(); flame.push(height - topLit()); }
    const from = settleFrom === null ? Math.floor(steps / 2) : settleFrom;
    const tail = flame.slice(from);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    return Object.freeze({
        width, height, steps, flame,
        settled: Object.freeze({ mean, min: Math.min(...tail), max: Math.max(...tail) }),
        // *** THE CEILING TEST, WHICH IS THE ONE THE FIRST DRAFT OF THIS FILE FAILED TO DO. ***
        ceilingLimited: Math.max(...tail) >= height - 1,
        sourceAtStart, sourceAtEnd: src(),
        consumesFuel: src() !== sourceAtStart,
        terminates: flame[flame.length - 1] === 0,
    });
}

/** How many steps a doom fire takes to go dark once the source stops being held lit. */
export function doomDecayToDark({ width = 8, height = 200, seed = 1, warm = 400, cap = 2000 } = {}) {
    const fire = new DoomFire({ width, height, seed });
    for (let s = 0; s < warm; s++) fire.step();
    fire.extinguish();
    for (let s = 1; s <= cap; s++) {
        fire.step();
        let lit = false;
        for (let y = 0; y < height && !lit; y++) for (let x = 0; x < width; x++) if (fire.at(x, y) > 0) { lit = true; break; }
        if (!lit) return s;
    }
    return null;
}

/** What v4422 measured. Re-take with: node render/fireSpread-selfcheck.mjs */
export const MEASURED_AT_V4422 = Object.freeze({
    doom: Object.freeze({
        // Steady flame height by grid height. The 40-row reading is the CEILING and is kept to show the trap.
        settledByHeight: Object.freeze({ 40: 37.8, 100: 38.6, 200: 38.8, 400: 39.1 }),
        ceilingLimitedAt: 40, gridIndependentFrom: 100,
        consumesFuel: false, terminates: false,
        // Steps to dark after extinguish(). HEIGHT-TAGGED, because 46 was measured on the 8x40 grid and
        // 48 on 8x200 -- an untagged number here would be the ceiling trap wearing a different hat.
        decayToDarkSteps: Object.freeze({ 40: 46, 200: 48 }),
    }),
    voxel: Object.freeze({
        n: 40, frontCellsPerStep: 1, wentOutAtStep: 59, wentOutSeconds: 5.9,
        ash: 40, fuelLeft: 0, consumesFuel: true, terminates: true,
    }),
});
