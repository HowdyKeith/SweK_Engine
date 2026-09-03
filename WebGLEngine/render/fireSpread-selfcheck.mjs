// WebGLEngine/render/fireSpread-selfcheck.mjs -- v4422
//
// Run: node render/fireSpread-selfcheck.mjs
//
// Grades render/fireSpread.mjs -- and it is THE FIRST GATE world/fireSystem.js HAS EVER HAD. v4412 recorded
// that the voxel wildfire carried no gate of its own; the reason it stayed that way is that it needs a world,
// and nobody had stubbed one. render/fireSpread.mjs's lineWorld is that stub, in ninety lines of arithmetic.
//
// *** SECTION 3 IS A CHECK ON A MEASUREMENT I GOT WRONG. *** doomFire's flame height on an 8x40 grid reads
// 34-40 rows and looks like a steady state. It is the top of the array. The check therefore does not assert
// "the height settles" -- it asserts that the height settles AND that the reading is not ceiling-limited, and
// it asserts the 40-row case IS ceiling-limited so the trap stays visible instead of being tidied away.
"use strict";

import * as F from "./fireSpread.mjs";
import { FireSystem } from "../world/fireSystem.js";
import { VOXEL } from "../world/voxelFormat.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- 1. THE VOXEL WILDFIRE CONSUMES, AND THEREFORE STOPS -----------------------------------------------------
{
    say("world/fireSystem.js on a 40-cell line of GRASS, ignited at one end, igniteChance 1.0");
    const r = F.runVoxelLine(FireSystem, VOXEL, { n: 40, dt: 0.1, steps: 300 });
    for (const s of [10, 20, 30, 40, 50])
        if (r.front[s - 1] !== undefined)
            say(`  t=${(s * r.dt).toFixed(1)}s  front x=${r.front[s - 1]}  active=${r.active[s - 1]}`);
    say(`  went out at step ${r.wentOutAt} (t=${(r.wentOutAt * r.dt).toFixed(1)}s), ash ${r.ash}, fuel left ${r.fuelLeft}`);

    ok("!! *** it CONSUMES its fuel -- every cell is ash ***", r.consumesFuel && r.ash === r.n && r.fuelLeft === 0,
        `${r.ash} of ${r.n} ash, ${r.fuelLeft} fuel remaining`);
    ok("!! *** and it GOES OUT BY ITSELF, with nothing switching it off ***", r.terminates,
        `active reached 0 at t=${(r.wentOutAt * r.dt).toFixed(1)}s. A fire that eats a finite substrate must ` +
        "end; this is the half of 'fire' doomFire's rule does not have");
    ok("its front TRAVELS -- monotone, and it reaches the far end",
        r.front.slice(0, r.wentOutAt - 1).every((v, i, a) => i === 0 || v >= a[i - 1]) &&
        Math.max(...r.front) === r.n - 1,
        `front reaches x=${Math.max(...r.front)} of ${r.n - 1}`);
}

// ---- 2. THE DOOM AUTOMATON CONSUMES NOTHING, AND THEREFORE CANNOT STOP ---------------------------------------
{
    say("");
    const d = F.runDoomColumn({ width: 8, height: 200, seed: 1, steps: 1200 });
    say(`render/doomFire.mjs 8x200: source row sum ${d.sourceAtStart} at step 0, ${d.sourceAtEnd} at step ${d.steps}`);
    ok("!! *** it consumes NOTHING -- the source row is bit-for-bit what it started as ***",
        !d.consumesFuel && d.sourceAtEnd === d.sourceAtStart,
        "there is no fuel model at all. This is not a defect: it is an intensity transport, and the whole " +
        "point of the comparison is that the two rules answer different questions");
    ok("!! ...and it never goes out while lit, over 1200 steps", !d.terminates,
        `flame height at the last step: ${d.flame[d.flame.length - 1]} rows`);
    const dark = F.doomDecayToDark({ height: 200, seed: 1 });
    ok("but extinguishing the source DOES end it, by decay rather than by burning out",
        dark !== null && dark < 200, `dark ${dark} steps after extinguish()`);
    ok("the two rules disagree on termination WITH FUEL PRESENT, which is the whole finding",
        F.MEASURED_AT_V4422.voxel.terminates === true && F.MEASURED_AT_V4422.doom.terminates === false);
}

// ---- 3. *** THE PLATEAU IS A PROPERTY OF THE RULE, NOT OF THE ARRAY -- AND I MEASURED THAT WRONG FIRST *** ----
{
    say("");
    say("doomFire steady flame height by grid height (mean of the second half of a 1200-step run)");
    const rows = [40, 100, 200].map((h) => [h, F.runDoomColumn({ width: 8, height: h, seed: 1, steps: 1200 })]);
    for (const [h, d] of rows)
        say(`  height ${String(h).padStart(3)}: mean ${d.settled.mean.toFixed(1)} (min ${d.settled.min}, max ${d.settled.max})  ceiling-limited: ${d.ceilingLimited}`);

    const small = rows.find(([h]) => h === 40)[1];
    const tall = rows.filter(([h]) => h >= 100).map(([, d]) => d);
    ok("!! *** the 8x40 reading IS ceiling-limited, and the check says so rather than hiding it ***",
        small.ceilingLimited === true,
        "the first measurement of this round called 34-40 rows a steady state. It was the top of the array. " +
        "KEEPING THIS ASSERTION is what stops the trap being tidied away once the taller runs look tidy");
    ok("!! ...and at 100 rows and above it is NOT ceiling-limited",
        tall.every((d) => d.ceilingLimited === false),
        tall.map((d) => `${d.height}:${d.ceilingLimited}`).join(" "));
    const means = tall.map((d) => d.settled.mean);
    ok("!! and the settled height CONVERGES as the grid grows -- so it belongs to the decay rate",
        Math.max(...means) - Math.min(...means) < 1.5,
        `means ${means.map((m) => m.toFixed(1)).join(", ")}; spread ${(Math.max(...means) - Math.min(...means)).toFixed(2)} rows. ` +
        "A number that kept climbing with the container would be a claim about the container");
    ok("the recorded heights agree with the run",
        Math.abs(rows.find(([h]) => h === 200)[1].settled.mean - F.MEASURED_AT_V4422.doom.settledByHeight[200]) < 1.0,
        `measured ${rows.find(([h]) => h === 200)[1].settled.mean.toFixed(1)}, recorded ${F.MEASURED_AT_V4422.doom.settledByHeight[200]}`);
}

// ---- 4. THE STUB IS A STUB AND NOT A SECOND WORLD --------------------------------------------------------------
{
    say("");
    const w = F.lineWorld(5, VOXEL);
    ok("lineWorld answers the three methods FireSystem actually calls",
        typeof w.getChunk === "function" && typeof w.voxelAt === "function" && typeof w.setVoxel === "function");
    ok("it is fuel everywhere on the line and air off it",
        w.voxelAt(0, 1, 0) === VOXEL.GRASS && w.voxelAt(4, 1, 0) === VOXEL.GRASS && w.voxelAt(0, 2, 0) === VOXEL.AIR);
    ok("!! and it has NO fire logic of its own -- it stores voxels and nothing else",
        !/ignite|spread|burn|ASH/.test(F.lineWorld.toString()),
        "a stub that decided anything about fire would be a second implementation of the rule under test, " +
        "which is how a harness starts agreeing with itself");
}

console.log("fireSpread-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
