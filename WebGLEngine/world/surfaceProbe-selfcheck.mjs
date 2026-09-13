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
//
// ---- v4542: SECTIONS 8 TO 13, AND WHAT THIS FILE'S OWN TAIL USED TO SAY ---------------------------------
//
// Since v4554 the last paragraph of this file has read "NOT FIXED HERE: ... multi-layer ground, where an
// overhang gives two surfaces over one point and this probe answers the roof." On the engine's own world
// that is MORE THAN HALF OF IT -- 863 of 1,681 columns hold more than one standable surface, up to 47
// voxels apart -- and standHeightAt returns one number, so it is right in 1,681 of the 2,644 places a body
// could actually be standing. 63.58%. The repair is an argument: pass the body's feet and its own step
// allowance, and the answer is the surface THAT body is on, 2,644 of 2,644.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the body-aware branch removed, back to the pre-v4542 function    4 RED here + 1 in groundProbe
//   B  the scan started at the body's feet, ignoring its reach          1 RED, section 9
//   C  the reach hardcoded to 1.2 instead of the caller's allowance     1 RED, section 9
//      -- B and C redden the SAME row and nothing else, which is stated rather than
//      dressed up: one fixture separates a probe that reads the allowance from one
//      that does not, and it is the only place in this file where the allowance varies.
//   D  standablesAt made to report only the topmost surface             4 RED, sections 8, 9, 11
//   E  BotManager's oracle stops passing the body                       1 RED, section 12
//   F  the pathfinder snapshot stops carrying the level                 1 RED, section 12
//   G  the body-aware path taken even when no body is passed            4 RED, sections 8, 10 AND TWO v4554
//      ROWS -- the cost row and the canopy row. *** THAT IS THE ONE WORTH READING: *** the
//      backward-compatibility guarantee in section 10 is not a courtesy, it is what holds
//      up readings taken two rounds before this one, and breaking it reddens rows nobody
//      wrote with this change in mind.
//   H  standablesAt made to ignore the body's height, accepting a one-voxel gap   1 RED, section 11
//
// NONE CRASHED. The first run of this battery reported all eight as crashing, which was the DETECTOR and not
// the gates: it grepped the output for "TypeError", and section 6's own prose tells the story of a lost
// receiver that threw one. A crash test that matches a passing row's evidence string is a crash test that
// cannot tell a green run from a stack trace -- the v4541 shape, one level up.
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

// =============================================================================================================
console.log("\n8. *** MULTI-LAYER GROUND: THE PROBE ANSWERED THE ROOF, AND THIS FILE FILED THAT ITSELF ***");
{
    // A cave with a hillside over it: floor at y=1, ceiling of the cave at 5..8, hillside top at 21.
    const w = fakeWorld({ columns: () => [[0, 0], [5, 8], [18, 20]], model: () => 21 });
    const all = SP.standablesAt(w, 0, 0);
    const blind = SP.standHeightAt(w, 0, 0);
    const inCave = SP.standHeightAt(w, 0, 0, { y: 1, stepUp: 1.2 });
    const onHill = SP.standHeightAt(w, 0, 0, { y: 21, stepUp: 1.2 });
    ok("!! *** A BODY ON THE CAVE FLOOR WAS TOLD THE GROUND WAS TWENTY VOXELS UP, ON THE HILLSIDE ***",
        all.join(",") === "1,9,21" && blind === 21 && inCave === 1 && onHill === 21,
        "the column is solid 0, 5..8 and 18..20, so a body of " + SP.DEFAULT_BODY + " stands at " +
        all.join(", ") + ". With no body the probe answers " + blind + " -- and it is RIGHT to, because it " +
        "was asked which surface this COLUMN has and the column has three. Told where the body is, it " +
        "answers " + inCave + " on the cave floor and " + onHill + " on the hill. *** THE DEFECT WAS NEVER " +
        "IN THE ARITHMETIC, IT WAS IN THE SIGNATURE: *** there was nowhere to put the body, so the function " +
        "could only ever be right about one of the three.");
    say("this gate's own tail has said 'NOT FIXED HERE: multi-layer ground, where an overhang gives two " +
        "surfaces over one point and this probe answers the roof' since v4554. That sentence is deleted by " +
        "this round rather than argued with.");

    // *** AND THE FALLBACK IS NOT WHERE THE LIVE DEFECT LIVES, WHICH THE v4539 FIXTURE GOT WRONG. ***
    const modelAgrees = fakeWorld({ columns: () => [[0, 0], [5, 8], [18, 20]], model: () => 21 });
    const before = modelAgrees.airCalls;
    const ansA = SP.standHeightAt(modelAgrees, 0, 0);
    const scanned = modelAgrees.airCalls - before;
    ok("!! ...and on the live world the MODEL names the upper surface, so the topSolidAt fallback never runs",
        ansA === 21 && scanned <= 1 + SP.DEFAULT_BODY,
        "the model says 21, fits(21) passes, and the probe returns it after " + scanned + " voxel reads -- " +
        "it never reaches topSolidAt at all. v4539's fixture drove this with _heightAt returning NaN, which " +
        "forces the fallback, and concluded the fallback was the bug. *** ON THE ENGINE'S OWN WORLD THE " +
        "EXAMPLE COLUMNS READ (-42,-60) surfaces [2, 19] with _heightAt = 19, *** so the model agrees with " +
        "the roof and the fallback is never entered. A repair aimed at topSolidAt would have fixed a path " +
        "the live defect does not take.");
}

// =============================================================================================================
console.log("\n9. the reach is the CALLER'S step allowance, and a probe with its own would answer a different question");
{
    //  floor at 1, a lip one voxel up at 2, and a ledge four up at 5
    const w = fakeWorld({ columns: () => [[0, 0], [1, 1], [4, 4]], model: () => NaN });
    const all = SP.standablesAt(w, 0, 0);
    const rows = [0, 0.5, 1.2, 4].map((stepUp) => ({ stepUp, y: SP.standHeightAt(w, 0, 0, { y: 2, stepUp }) }));
    ok("!! *** THE SAME BODY IN THE SAME COLUMN GETS A DIFFERENT SURFACE FOR A DIFFERENT ALLOWANCE ***",
        all.join(",") === "2,5" && rows[0].y === 2 && rows[1].y === 2 && rows[2].y === 2 && rows[3].y === 5,
        "surfaces at " + all.join(" and ") + "; a body standing at 2 reads " +
        rows.map((r) => "stepUp " + r.stepUp + " -> " + r.y).join(", ") + ". *** A PROBE THAT PICKED ITS OWN " +
        "REACH WOULD BE ANSWERING A QUESTION THE CONTROLLER IS NOT ASKING, *** and BotManager walks its bots " +
        "at stepHeight " + "1.2" + " -- so it passes that same named constant rather than a second copy of " +
        "the number. Sabotage C is aimed here: hardcoding the reach passes every other row in this file.");
    ok("   ...and with no surface under the body at all the answer is null rather than an invented floor",
        SP.standHeightAt(fakeWorld({ columns: () => [], model: () => 12 }), 0, 0, { y: 30, stepUp: 1.2 }) === null,
        "an empty column and a body at y=30: nothing to stand on, and saying so is the only honest answer. " +
        "The bodyless path returns the model's 12 here, which is a guess this one declines to repeat.");
    ok("   a body in the air is told what it is falling TOWARDS, not what is above it",
        SP.standHeightAt(w, 0, 0, { y: 40, stepUp: 1.2 }) === 5,
        "from y=40 the scan starts at 41 and walks down to the first surface, 5 -- the ledge, not the " +
        "floor under it. Nothing above a body's reach can be stood on and the first thing below it is what " +
        "it meets, which is one rule covering standing, stepping and falling.");
}

// =============================================================================================================
console.log("\n10. *** WITHOUT A BODY THE ANSWER IS BYTE-IDENTICAL TO THE PRE-v4542 ONE, WHICH IS THE WHOLE ***");
console.log("    REASON THIS SHIPS WITHOUT RE-DERIVING SIX GATES");
{
    // the pre-v4542 function, verbatim, so the comparison is against the code and not against a memory of it
    const legacy = (world, x, z, { body = SP.DEFAULT_BODY, maxY = null } = {}) => {
        const CH = maxY ?? world.chunkHeight;
        const fits = (y) => {
            if (y < 1 || y + body > CH) return false;
            try {
                if (world.isAir(x, y - 1, z)) return false;
                for (let k = 0; k < body; k++) if (!world.isAir(x, y + k, z)) return false;
            } catch { return false; }
            return true;
        };
        let h = null;
        try { h = world._heightAt(x, z); } catch { h = null; }
        if (Number.isFinite(h) && fits(h)) return h;
        const top = SP.topSolidAt(world, x, z, { maxY: CH });
        if (top < 0) return Number.isFinite(h) ? h : null;
        const s = top + 1;
        return s + body <= CH ? s : null;
    };
    const shapes = [
        [[[0, 4]], () => 5], [[[0, 4]], () => 9], [[[0, 4]], () => 2], [[[0, 4]], () => NaN],
        [[[0, 0], [5, 8], [18, 20]], () => 21], [[[0, 0], [5, 8], [18, 20]], () => NaN],
        [[], () => 7], [[[0, 62]], () => 30], [[[0, 62]], () => NaN], [[[3, 3]], () => 4],
    ];
    let same = 0, differ = [];
    for (let i = 0; i < shapes.length; i++) {
        const [cols, model] = shapes[i];
        const a = SP.standHeightAt(fakeWorld({ columns: () => cols, model }), 0, 0);
        const b = legacy(fakeWorld({ columns: () => cols, model }), 0, 0);
        if (Object.is(a, b)) same++; else differ.push(i + ": " + a + " vs " + b);
    }
    ok("!! every column shape gives the SAME answer as the function this replaced, when no body is passed",
        same === shapes.length,
        same + " of " + shapes.length + " identical" + (differ.length ? " -- DIFFER: " + differ.join("; ") : "") +
        ". The legacy function is written out in full here rather than described, so this compares against " +
        "CODE and not a memory of it. It is what lets BotManager's non-voxel branch, every fixture in every " +
        "other gate, and world/surfaceProbe.mjs's own census keep their readings through this round.");
    // *** THE COST ROW IS AN AVERAGE OVER A MIX AND NOT A BEST CASE, BECAUSE THE FIRST DRAFT ASSERTED THE
    // BEST CASE AND WAS WRONG. *** With the model right, the bodyless path costs 3 reads and the body-aware
    // one costs 4 -- it starts at floor(y + stepUp) and tests the lip above the body before the body's own
    // surface. The saving is not there. It is in the columns where the model is WRONG, where the old path
    // scans the whole column and this one stops at the first surface under the body, and the engine
    // measurement is an average over both kinds in their real proportion.
    const mix = [
        [[[0, 4]], () => 5, 5], [[[0, 4]], () => 5, 5],            // model right -- the common case
        [[[0, 4]], () => 5, 5], [[[0, 4]], () => 5, 5],
        [[[0, 4]], () => 40, 5],                                   // model wrong high: old path scans
        [[[0, 0], [5, 8], [18, 20]], () => NaN, 1],                // no model at all: old path scans
    ];
    let oldReads = 0, newReads = 0;
    for (const [cols, model, at] of mix) {
        const a = fakeWorld({ columns: () => cols, model });
        SP.standHeightAt(a, 0, 0); oldReads += a.airCalls;
        const b = fakeWorld({ columns: () => cols, model });
        SP.standHeightAt(b, 0, 0, { y: at, stepUp: 1.2 }); newReads += b.airCalls;
    }
    const one = fakeWorld({ columns: () => [[0, 4]], model: () => 5 });
    SP.standHeightAt(one, 0, 0, { y: 5, stepUp: 1.2 });
    ok("!! *** AND THE BODY-AWARE PATH IS CHEAPER ON AVERAGE, WHICH IS NOT USUALLY HOW A CORRECTNESS FIX GOES ***",
        newReads < oldReads && one.heightCalls === 0,
        "over six columns -- four where the model is right, one where it is 35 voxels high, one with no " +
        "model -- the bodyless path costs " + oldReads + " voxel reads and the body-aware path " + newReads +
        ". *** IN THE BEST CASE IT IS ONE READ WORSE, NOT BETTER, *** and the first draft of this row " +
        "asserted otherwise and went red: with the model right it tests the lip above the body before the " +
        "body's own surface. It also never calls _heightAt at all (" + one.heightCalls + " times), because " +
        "it has no use for a guess. MEASURED IN THE ENGINE over 1,681 columns in their real proportion: " +
        "model alone 0.6 ms / 0 reads per call, BODY-AWARE 1.5 ms / 4.0, as shipped 2.8 ms / 7.4, full " +
        "column scan 7.5 ms / 42.4. Knowing where the body is REMOVES THE SEARCH.");
}

// =============================================================================================================
console.log("\n11. standablesAt is the instrument, and it is checked against a scan rather than trusted");
{
    const cases = [
        [[[0, 0]], "1"], [[], ""], [[[0, 0], [5, 8], [18, 20]], "1,9,21"],
        [[[0, 0], [2, 2]], "3"],                         // a one-voxel gap is not two cells of air
        [[[0, 0], [3, 3]], "1,4"],
    ];
    let agreed = 0;
    for (const [cols, want] of cases) {
        const w = fakeWorld({ columns: () => cols, model: () => NaN });
        if (SP.standablesAt(w, 0, 0).join(",") === want) agreed++;
    }
    ok("!! every standable surface, and a body of 2 does not fit in a gap of 1",
        agreed === cases.length,
        agreed + " of " + cases.length + " columns enumerate exactly as read off the page -- including " +
        "solid 0 and solid 2, where the single air cell at y=1 holds no body of " + SP.DEFAULT_BODY +
        " and the only surface is 3, above the lot.");
    const CH = 64;
    const w = fakeWorld({ columns: () => [[0, 0], [5, 8], [18, 20]], model: () => NaN, chunkHeight: CH });
    const brute = [];
    for (let y = 1; y + SP.DEFAULT_BODY <= CH; y++) {
        let good = !w.isAir(0, y - 1, 0);
        for (let k = 0; k < SP.DEFAULT_BODY && good; k++) if (!w.isAir(0, y + k, 0)) good = false;
        if (good) brute.push(y);
    }
    ok("   ...and it agrees with a scan written separately in this file",
        SP.standablesAt(w, 0, 0).join(",") === brute.join(","),
        "[" + brute.join(",") + "] both ways. Trivial here and not trivial in principle: this is the " +
        "population every claim in section 8 is drawn from, and a census that defines its own population " +
        "is the one shape this tree has been bitten by most.");
    ok("   the ceiling bound holds for the enumeration as well as for the single answer",
        SP.standablesAt(fakeWorld({ columns: () => [[0, 61]], model: () => NaN, chunkHeight: 64 }), 0, 0)
            .join(",") === "62",
        "solid to 61 in a world 64 tall leaves exactly one surface at 62, and nothing at 63 -- where a body " +
        "of 2 would need cells 63 and 64, and the world answers SOLID above its own ceiling.");
}

// =============================================================================================================
console.log("\n12. the wiring: both consumers pass a body, and the level comes from the caller");
{
    const bm = fs.readFileSync(path.join(ENG, "simulation", "BotManager.js"), "utf8");
    const pool = fs.readFileSync(path.join(ENG, "simulation", "BotPathfinderPool.js"), "utf8");
    ok("!! BotManager's oracle is told the body's feet and the walker's own step allowance",
        /standHeightAt\(w, x, z, \{ y: this\._groundY, stepUp: BOT_STEP \}\)/.test(bm) &&
        /this\._groundY = bot\.y - BOT_EYE;/.test(bm) &&
        /stepHeight: BOT_STEP, snapDown: BOT_STEP/.test(bm) &&
        (bm.match(/const BOT_STEP = [\d.]+;/) || []).length === 1,
        "the ground closure stays cached per world -- rebuilding it per frame is the expensive part -- and " +
        "_groundY is the one thing that changes per body, set to the SAME quantity handed to pos[1]. " +
        "BOT_STEP is declared once and read by both the walker and the probe, so the two cannot drift.");
    ok("!! the pathfinder snapshot is built for the level the bot is on",
        /_heightmapForJob\(sx, sz, gx, gz, pad = HM_PADDING, y = null, stepUp = 0\)/.test(pool) &&
        /standHeightAt\(w0, x, z, \{ y, stepUp \}\)/.test(pool) &&
        /this\.pathfinderPool\.plan\(bot\.x, bot\.z, gx, gz, \{ y: bot\.y - BOT_EYE, stepUp: BOT_STEP \}\)/.test(bm),
        "plan() carries the level through to the snapshot, because the pool is the one thing in the chain " +
        "that does NOT know where the bot is. A planner given the hillside over a tunnel plans over the " +
        "hillside.");
    ok("   and a world with no voxel grid still gets exactly the old function, in both files",
        /hasVoxels\(w\)\s*\n?\s*\?/.test(bm) && /hasVoxels\(w0\)/.test(pool),
        "hasVoxels gates both call sites, so every fixture in this tree that supplies a bare _heightAt is " +
        "untouched by this round -- the same guard the v4554 wiring used and for the same reason.");
    say("NOT WIRED: nothing else reads standHeightAt. tools/ship/groundProbe-selfcheck.mjs did, to " +
        "characterise this defect, and that row is DELETED by this round rather than argued with -- it was " +
        "labelled in its own text as a check that goes red on success.");
}

// =============================================================================================================
console.log("\n13. the v4542 record is arithmetic that has to close, and a live figure a gate may not assert");
{
    const B = SP.BODY_AWARE_AT_V4542;
    ok("!! the correctness halves account for every place a body could be, and the rule's is all of them",
        B.bodyAwareCorrect === B.bodyPlaces && B.shippedCorrect === B.columns &&
        B.shippedCorrect < B.bodyPlaces && B.multiSurface < B.columns,
        B.bodyAwareCorrect + " of " + B.bodyPlaces + " for the rule and " + B.shippedCorrect + " of " +
        B.bodyPlaces + " as shipped -- and the second number is exactly the COLUMN count, which is not a " +
        "coincidence and is the whole finding: a function returning one number per column is right once per " +
        "column however good it is. " + B.multiSurface + " of " + B.columns + " columns hold more than one " +
        "surface, up to " + B.worstSpread + " voxels apart.");
    ok("!! *** THE LIVE PERCENTAGE IS NOT ASSERTED, BECAUSE THE VOXELS ARE NOT A FUNCTION OF THE SEED ***",
        B.multiSurfacePct > B.multiSurfaceFloorPct &&
        Math.abs(100 * B.multiSurface / B.columns - B.multiSurfacePct) < 0.1,
        "four boots read " + B.multiSurfacePct + "%, 51.9%, 53.5% and 57.7% from one seed, because the fluid and " +
        "erosion systems write chunk.set() all through the run -- the same non-determinism MEASURED_AT_V4553 " +
        "found and for the same reason. So the record carries a FLOOR of " + B.multiSurfaceFloorPct + "% " +
        "that every boot cleared twice over, and this row checks the stored pair is self-consistent and " +
        "above it. A row asserting 51.3 would be red on the next boot and would be RIGHT to be, which is " +
        "what makes it the wrong row.");
    ok("   the cost ladder is ordered and the correct rung is not the dearest",
        B.readsModelOnly < B.readsBodyAware && B.readsBodyAware < B.readsShipped &&
        B.readsShipped < B.readsFullScan && B.msBodyAware < B.msShipped && B.msShipped < B.msFullScan &&
        Object.isFrozen(B),
        "reads per call " + [B.readsModelOnly, B.readsBodyAware, B.readsShipped, B.readsFullScan].join(" < ") +
        "; milliseconds " + [B.msModelOnly, B.msBodyAware, B.msShipped, B.msFullScan].join(" < ") + ".");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\n*** ONE READING THIS ROUND TOOK AND THEN THREW OUT, because the negative is the more useful record: *** " +
    "a real bot walking 600 frames had its feet in a solid voxel on 235 of them, which looked like a bot " +
    "buried in rock. It is not. The depth was ALWAYS exactly 1 and the head was blocked on ZERO frames -- " +
    "that is a bilinear surface sitting inside its own top voxel, which is what a smoothed ground over a " +
    "lattice means. The bot's 600 frames never reached one of the 101-to-158 genuinely wrong columns. " +
    "\nFIXED AT v4542 AND THIS SENTENCE USED TO SAY OTHERWISE: multi-layer ground. It read 'NOT FIXED " +
    "HERE ... an overhang gives two surfaces over one point and this probe answers the roof', which on the " +
    "engine's own world was 863 columns of 1,681. The probe takes the body now. " +
    "\nSTILL NOT FIXED HERE: world._heightAt itself, which a dozen systems read and which is a legitimate " +
    "answer to a different question; whether a body may MOVE from this column's surface to the next one's, " +
    "which is a swept-volume question and is terrainWalk's step test rather than this probe's; and whether " +
    "the model or the voxels is the one that is WRONG in the affected " +
    "columns -- the probe only asserts that a body stands on what is actually there. AND NOT REPAIRED "
    + "HERE: Chunk.index()'s missing range check, which is what makes the world answer SOLID above "
    + "its own ceiling. The probe is bounded against it; the engine still has it, and it is filed.");
process.exit(fails ? 1 : 0);
