// WebGLEngine/world/surfaceProbe-selfcheck.mjs -- v4554
//
// Run: node world/surfaceProbe-selfcheck.mjs
//
// GATES world/surfaceProbe.mjs -- the second opinion the pathfinder and the character controller were both
// missing. Both read world._heightAt, which is the terrain MODEL's column height out of an erosion cache;
// world.voxelAt is what is actually solid. Measured in six real boots of index.html they disagree in 6.0 to
// 9.4% of columns, by up to 17 voxels, with the model landing INSIDE rock -- and the COUNT moves boot to
// boot from a fixed seed, because the running simulation edits voxels that _heightAt can never see.
//
// *** THE FIXTURES HERE ARE HAND-BUILT VOXEL COLUMNS WITH KNOWN ANSWERS, AND THAT IS DELIBERATE. *** The
// engine reading needs a browser and minutes; what a gate must establish is that the probe returns the right
// y for a column somebody can read off the page, and that it does NOT pay the scan when the model is right.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as SP from "./surfaceProbe.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("surfaceProbe-selfcheck -- the terrain model against the voxels\n");

/**
 * A world whose voxels are declared as solid RUNS per column, and whose _heightAt can be made to lie by any
 * amount. Counting its isAir calls is what lets the cost claim be a number rather than a stopwatch reading.
 */
function fakeWorld({ columns, model, chunkHeight = 64 }) {
    const w = {
        chunkHeight, airCalls: 0, heightCalls: 0,
        isAir(x, y, z) {
            w.airCalls++;
            const runs = columns(x, z);
            for (const [lo, hi] of runs) if (y >= lo && y <= hi) return false;
            return true;
        },
        _heightAt(x, z) { w.heightCalls++; return model(x, z); },
    };
    return w;
}

// =============================================================================================================
console.log("1. *** A COLUMN A READER CAN CHECK BY EYE, AND THE ANSWER THE MODEL GETS WRONG ***");
{
    // This is the engine's own worst column, transcribed: a cave, a slab above it, and the model answering
    // INSIDE the slab. SOLID 0..1 / air 2..4 / SOLID 5..13 / air 14 / SOLID 15..21 / air 22..63.
    const runs = [[0, 1], [5, 13], [15, 21]];
    const w = fakeWorld({ columns: () => runs, model: () => 9 });
    say("column SOLID 0..1 / air 2..4 / SOLID 5..13 / air 14 / SOLID 15..21 / air 22..63, model says 9");
    ok("!! *** THE TOPMOST SOLID IS 21, SO A BODY STANDS AT 22 -- AND THE MODEL SAID 9, INSIDE THE 5..13 SLAB ***",
        SP.topSolidAt(w, 0, 0) === 21 && SP.standHeightAt(w, 0, 0) === 22,
        `topSolidAt ${SP.topSolidAt(w, 0, 0)}, standHeightAt ${SP.standHeightAt(w, 0, 0)}, model 9. This is the ` +
        `engine's column at (-40, -38) transcribed; three of its neighbours read the same, so the world really ` +
        `does have regions where the terrain model is thirteen voxels below the ground.`);
    ok("...and the pocket of air at 2..4 is not mistaken for a surface, because there is no support pattern there",
        SP.standHeightAt(w, 0, 0) !== 2 && SP.standHeightAt(w, 0, 0) !== 5,
        "a scan that stopped at the first air it met from the bottom would answer 2, which is a cave floor " +
        "with nine voxels of rock over it -- the probe searches DOWN from the top for exactly this reason.");
}

// =============================================================================================================
console.log("\n2. *** IT ACCEPTS THE MODEL WHEN THE MODEL IS RIGHT, AND THAT IS WHERE THE SPEED COMES FROM ***");
{
    const runs = [[0, 30]];                                     // plain ground, surface at 31
    const right = fakeWorld({ columns: () => runs, model: () => 31 });
    const a0 = right.airCalls;
    const got = SP.standHeightAt(right, 0, 0);
    say(`plain column solid 0..30: model says 31, probe says ${got}, using ${right.airCalls - a0} isAir calls`);
    ok("!! *** A CORRECT MODEL COSTS THREE VOXEL READS, NOT A COLUMN SCAN ***",
        got === 31 && right.airCalls - a0 <= 4,
        `${right.airCalls - a0} isAir calls for a 64-tall column. The verification is support below the feet ` +
        `plus ${SP.DEFAULT_BODY} cells of air above them -- three reads -- and the scan is skipped entirely. ` +
        `Measured in the engine this is why the hybrid costs 1.8 ms per 1,681 columns against a full scan's 7.6.`);

    const wrong = fakeWorld({ columns: () => runs, model: () => 9 });
    const b0 = wrong.airCalls;
    const fixed = SP.standHeightAt(wrong, 0, 0);
    ok("!! ...and a WRONG model pays the scan and gets the right answer anyway",
        fixed === 31 && wrong.airCalls - b0 > 4,
        `model 9 -> probe ${fixed}, using ${wrong.airCalls - b0} isAir calls. The cost is paid exactly where ` +
        `the answer was going to be wrong, which is the whole shape of the thing.`);
}

// =============================================================================================================
console.log("\n3. *** THE MODEL RUNNING HIGH IS ALSO AN ERROR, AND CHECKING ONLY FOR AIR WOULD MISS IT ***");
{
    // The engine's error distribution runs -7 as well as +17: the model floats above the real surface too.
    const runs = [[0, 20]];                                     // surface at 21
    const high = fakeWorld({ columns: () => runs, model: () => 28 });
    const got = SP.standHeightAt(high, 0, 0);
    say(`solid 0..20 (surface 21), model says 28 -- seven voxels of air below the model's answer`);
    ok("!! *** A STAND HEIGHT WITH NOTHING UNDER IT IS REFUSED: the probe requires SUPPORT, not just clearance ***",
        got === 21,
        `probe says ${got}. A verification that asked only "is there air at h and h+1" would have ACCEPTED 28 ` +
        `-- it is empty sky -- and the body would have been placed floating seven voxels up. The engine's ` +
        `measured error runs to -7 on this side, so this is not a hypothetical branch.`);
}

// =============================================================================================================
console.log("\n4. *** AN OVERHANG IS NOT A DEFECT, AND THE PROBE MUST NOT INVENT ONE ***");
{
    // Ground at 10, a canopy at 30..32 with clear air between. A body stands at 11 and walks UNDER the canopy.
    const runs = [[0, 9], [30, 32]];
    const w = fakeWorld({ columns: () => runs, model: () => 10 });
    ok("!! a canopy overhead leaves the model's answer alone -- topSolid is 32 but the body still stands at 10",
        SP.standHeightAt(w, 0, 0) === 10 && SP.topSolidAt(w, 0, 0) === 32,
        `standHeightAt ${SP.standHeightAt(w, 0, 0)}, topSolidAt ${SP.topSolidAt(w, 0, 0)}. THE TWO ARE DIFFERENT ` +
        `QUESTIONS: a probe that always answered topSolid + 1 would put the body on the ROOF at 33, which is ` +
        `worse than the defect it was built to fix. The model is accepted because the body fits where it says.`);
    // ...and when the model is ALSO wrong under a canopy, the scan's answer is the roof -- stated, not hidden.
    const w2 = fakeWorld({ columns: () => runs, model: () => 5 });
    ok("...and when the model is wrong under a canopy the probe answers the ROOF, which is this file's known limit",
        SP.standHeightAt(w2, 0, 0) === 33,
        `model 5 (inside the 0..9 slab) -> probe ${SP.standHeightAt(w2, 0, 0)}, the roof. MULTI-LAYER GROUND IS ` +
        `NOT SOLVED HERE and physics/character/terrainWalk.mjs says the same of itself: the oracle is a ` +
        `function of (x, z) and an overhang has two surfaces over one point. Stated rather than papered over.`);
}

// =============================================================================================================
console.log("\n5. *** THE CENSUS REPORTS THE SHAPE OF A WORLD'S DISAGREEMENT, AND DISCRIMINATES ***");
{
    const flat = { columns: () => [[0, 20]], model: () => 21 };
    const cAgree = SP.surfaceCensus(fakeWorld(flat), { x0: -9, x1: 9, z0: -9, z1: 9, step: 3 });
    // a world where the model is wrong in a band, exactly like the engine's region
    const banded = {
        columns: (x) => (x < 0 ? [[0, 5], [10, 20]] : [[0, 20]]),
        model: (x) => (x < 0 ? 12 : 21),                       // 12 is inside the 10..20 slab
    };
    const cBand = SP.surfaceCensus(fakeWorld(banded), { x0: -9, x1: 9, z0: -9, z1: 9, step: 3 });
    say(`agreeing world: ${cAgree.insideSolid} inside-solid of ${cAgree.sampled}, error median ${cAgree.error.median}`);
    say(`banded world:   ${cBand.insideSolid} inside-solid of ${cBand.sampled} (${cBand.insideSolidPct}%), ` +
        `error median ${cBand.error.median}, max ${cBand.error.max}, box ${JSON.stringify(cBand.box)}`);
    ok("!! a world whose model agrees with its voxels reports ZERO columns inside solid",
        cAgree.insideSolid === 0 && cAgree.error.median === 0 && cAgree.error.max === 0,
        `${cAgree.insideSolid} inside solid, error ${cAgree.error.min}..${cAgree.error.max}`);
    ok("!! *** AND ONE THAT DISAGREES IN A BAND REPORTS THE BAND, WITH ITS EXTENT ***",
        cBand.insideSolid > 0 && cBand.error.max === 9 && cBand.box.maxX < 0,
        `${cBand.insideSolid} columns inside solid, worst error ${cBand.error.max} (the slab tops at 20, so the ` +
        `true surface is 21 against a model of 12), and the box stops at x=${cBand.box.maxX} -- the census ` +
        `LOCATES the disagreement rather than only counting it, which is how the engine's was found to span ` +
        `the middle of the map rather than its edge.`);
}

// =============================================================================================================
console.log("\n6. *** THE WIRING, AND THE WORLDS IT MUST NOT TOUCH ***");
{
    const pool = fs.readFileSync(path.join(ENG, "simulation", "BotPathfinderPool.js"), "utf8");
    const mgr = fs.readFileSync(path.join(ENG, "simulation", "BotManager.js"), "utf8");
    ok("!! both consumers that plan or place a body now ask the voxels",
        /standHeightAt/.test(pool) && /standHeightAt/.test(mgr),
        "simulation/BotPathfinderPool.js builds its snapshot through it and simulation/BotManager.js builds " +
        "its ground oracle through it. Those are the two readers of _heightAt that answer 'where does a body " +
        "stand'; the cameras, ragdolls and spawns that also read it are asking a different question and are " +
        "deliberately left alone.");
    ok("!! *** AND A WORLD WITH NO VOXEL GRID GETS EXACTLY THE OLD ANSWER, WHICH IS WHAT EVERY FIXTURE IS ***",
        SP.hasVoxels({ _heightAt: () => 5 }) === false &&
        /hasVoxels\(/.test(pool) && /hasVoxels\(/.test(mgr),
        "hasVoxels requires isAir AND a finite chunkHeight. Every fake world in every gate in this tree " +
        "supplies a bare _heightAt, so all of them take the untouched path -- which is why this change does " +
        "not move a single existing fixture, and why that is not evidence it works.");
    // =========================================================================================================
    // *** AND THE WIRING FOUND SOMETHING BIGGER THAN THE CENSUS IT WAS BUILT FOR. *** The line this round
    // replaced was `const hAt = this.world?._heightAt || ((x, z) => 5)`, and world._heightAt is a METHOD that
    // reads this._heightOverride and this._wasmTiles. Detached from its receiver it throws on EVERY call --
    // measured in a real boot: TypeError: Cannot read properties of undefined (reading '_heightOverride') --
    // straight into an empty `catch {}` that leaves y at 0. Over an 11x11 window the old loop produced 121
    // zeros of 121. THE PATHFINDER'S SNAPSHOT WAS A FLAT PLANE AT y=0, for both routes, since the pool was
    // written: _heightmapForJob runs on every job and its output is what the worker builds its navmesh from.
    // NO FIXTURE COULD SEE IT because every fake world in this tree supplies _heightAt as a plain function or
    // an object literal's property, which has no `this` to lose.
    const detached = (() => {
        const w = { _bias: 20, chunkHeight: 64,
                    _heightAt(x, z) { return this._bias + ((x + z) & 1); },
                    isAir(x, y) { return y > this._bias; } };
        const loose = w._heightAt;                      // the shape the pool used to build
        let threw = false, viaLoose = 0;
        for (let i = 0; i < 9; i++) { let y = 0; try { y = loose(i, 0) | 0; } catch { threw = true; } if (y === 0) viaLoose++; }
        const viaProbe = SP.standHeightAt(w, 0, 0);
        return { threw, viaLoose, viaProbe };
    })();
    say(`a world whose _heightAt is a METHOD (the engine's shape): detached it throws ${detached.threw}, ` +
        `giving ${detached.viaLoose}/9 zeros; through the probe it answers ${detached.viaProbe}`);
    ok("!! *** A HEIGHT FUNCTION TAKEN OFF ITS OBJECT THROWS ON EVERY CALL, AND AN EMPTY CATCH TURNS THAT " +
       "INTO A FLAT WORLD AT ZERO ***",
        detached.threw && detached.viaLoose === 9 && detached.viaProbe === 21 &&
        !/=\s*this\.world\?\._heightAt\s*\|\|/.test(pool),
        `9 of 9 columns came back 0 through the detached method and the probe answers ${detached.viaProbe}. ` +
        `Measured in a real boot of index.html, the engine's own world does exactly this: 121 zeros of 121 ` +
        `over an 11x11 window, with the TypeError swallowed by an empty catch. *** THIS WAS NOT THE DEFECT ` +
        `THE ROUND WENT LOOKING FOR AND IT IS THE LARGER ONE: *** the census says the model is wrong in 6 to ` +
        `9% of columns; this says the planner was never reading the model at all. The regex is what keeps ` +
        `the old spelling from coming back.`);
    const M = SP.MEASURED_AT_V4553, D = M.deterministic, V = M.varies;
    ok("...and the recorded engine reading is internally consistent",
        M.column.trueSurface === M.column.topSolid + 1 && D.error.max >= D.error.p90 &&
        M.insideSolid === undefined && V.insideSolid.every((n) => n < M.sampled) &&
        M.cost.hybridMs < M.cost.fullScanMs,
        `column ${M.column.at}: model ${M.column.heightAt}, topSolid ${M.column.topSolid}, surface ` +
        `${M.column.trueSurface}; error median ${D.error.median} p90 ${D.error.p90} max ${D.error.max}; hybrid ` +
        `${M.cost.hybridMs} ms against a full scan's ${M.cost.fullScanMs}`);
    // =========================================================================================================
    ok("!! *** AND THE RECORD SEPARATES WHAT WAS THE SAME IN EVERY BOOT FROM WHAT WAS NOT, BECAUSE THE FIRST " +
       "TAKE DID NOT ***",
        V.boots >= 6 && new Set(V.topSolidSum).size === V.boots && new Set(V.insideSolid).size > 1 &&
        typeof D.heightSum === "number" && typeof M.correction === "string",
        `the MODEL summed to ${D.heightSum} in all ${V.boots} boots; the VOXELS summed to ` +
        `${new Set(V.topSolidSum).size} DISTINCT values in the same ${V.boots}, and the affected-column count ` +
        `ran ${Math.min(...V.insideSolid)}..${Math.max(...V.insideSolid)}. v4553 published one boot's 115 as ` +
        `a constant. *** A RECORD THAT STATES A MOVING QUANTITY AS A FIXED ONE IS THE SAME DEFECT AS A CHECK ` +
        `THAT REPORTS A PROXY FOR A FACT, *** and this row is what would go red if the interval were ever ` +
        `collapsed back to a single number.`);
}

// =============================================================================================================
console.log("\n7. *** THE WORLD CALLS EVERYTHING ABOVE ITS OWN CEILING SOLID, AND THE PROBE MUST NOT BELIEVE IT ***");
{
    // Chunk.index() does no range check, so world.voxelAt(x, y, z) at y >= chunkHeight indexes past the end of
    // a Uint8Array, reads undefined, and isAir compares undefined against VOXEL.AIR (0) and answers FALSE.
    // Measured in the engine: isAir(0, y, 0) is false at y = 64, 65, 69 and 84 on a chunkHeight of 64. This
    // fixture reproduces that exactly, and then asks the probe for a column it MUST refuse.
    const CH = 16;
    const w = {
        chunkHeight: CH, airCalls: 0, oob: 0,
        isAir(x, y, z) { w.airCalls++; if (y >= CH || y < 0) { w.oob++; return false; }   // <-- the engine's bug
                         return y > 7; },                                                 // solid 0..7
        _heightAt() { return CH + 4; },                                                   // model answers ABOVE the world
    };
    say(`ceiling ${CH}, solid 0..7, and isAir answers FALSE for every y at or above the ceiling -- the engine's ` +
        `own unbounded Chunk.index() reproduced`);
    const s0 = SP.standHeightAt(w, 0, 0);
    ok("!! *** A MODEL ANSWER ABOVE THE CEILING IS REFUSED RATHER THAN ACCEPTED AS ROCK TO STAND ON ***",
        s0 === 8,
        `the model said ${CH + 4}, four voxels above a world ${CH} tall, and every probe up there comes back ` +
        `"solid". A fits() that only asked "is there support below and air above" would have taken it: support ` +
        `false-positives above the ceiling. The probe answers ${s0}, on top of the real surface at 7.`);
    ok("...and it never actually reads out of range while doing so",
        w.oob === 0 && SP.topSolidAt(w, 0, 0) === 7,
        `${w.oob} out-of-range reads in ${w.airCalls} calls. topSolidAt starts at chunkHeight - 1 and ` +
        `standHeightAt refuses any y with y + body > chunkHeight, so the bound is stated in the code rather ` +
        `than left to the fixture's luck -- this row is what says so.`);
    ok("...and a column solid all the way to the ceiling has NO stand height, rather than one above the world",
        (() => { const f = { chunkHeight: CH, isAir: (x, y) => (y >= CH ? false : false), _heightAt: () => 8 };
                 return SP.standHeightAt(f, 0, 0) === null; })(),
        "solid 0..15 in a world 16 tall: a body of 2 does not fit anywhere, and the honest answer is null. " +
        "Returning topSolid + 1 = 16 would put the body inside the ceiling, which is where the unbounded " +
        "index would have said there was floor.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\n*** ONE READING THIS ROUND TOOK AND THEN THREW OUT, because the negative is the more useful record: *** " +
    "a real bot walking 600 frames had its feet in a solid voxel on 235 of them, which looked like a bot " +
    "buried in rock. It is not. The depth was ALWAYS exactly 1 and the head was blocked on ZERO frames -- " +
    "that is a bilinear surface sitting inside its own top voxel, which is what a smoothed ground over a " +
    "lattice means. The bot's 600 frames never reached one of the 101-to-158 genuinely wrong columns. " +
    "\nNOT FIXED HERE: world._heightAt itself, which a dozen systems read and which is a legitimate answer " +
    "to a different question; multi-layer ground, where an overhang gives two surfaces over one point and " +
    "this probe answers the roof; and whether the model or the voxels is the one that is WRONG in the affected " +
    "columns -- the probe only asserts that a body stands on what is actually there. AND NOT REPAIRED "
    + "HERE: Chunk.index()'s missing range check, which is what makes the world answer SOLID above "
    + "its own ceiling. The probe is bounded against it; the engine still has it, and it is filed.");
process.exit(fails ? 1 : 0);
