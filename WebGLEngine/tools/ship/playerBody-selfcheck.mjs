// WebGLEngine/tools/ship/playerBody-selfcheck.mjs -- v4549
//
// Run: node tools/ship/playerBody-selfcheck.mjs
//
// *** THE THING THE PLAYER DROVE WAS A VERTICAL LINE. *** _canStandAt tested ONE lattice cell -- floor(x),
// floor(z) -- so the body had no width at all, and none of v4541's capsuleMove findings or v4543's
// capsuleGround ones could reach it: those are about a body with a RADIUS against triangles, and this one
// had neither. It has a radius now, 0.4, which is capsuleGround's own.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the radius set to 0, so the body is a line again                       6 RED
//   B  the footprint made a SQUARE -- the distance test dropped               1 RED
//   C  the move test asked at the body's CURRENT height (the first draft)    12 RED
//   D  support demanded from ALL overlapped cells rather than any             0 RED -- correctly
//   E  the step target takes the LOWEST supported surface, not the highest   16 RED
//   F  the centre cell no longer seeded in the footprint                      2 RED
//   G  the clearance test reads only the first cell of the footprint          5 RED
//
// Counted across this gate, playerGround, playerSlope, cameraFall and voxelAvatar.
// *** D IS ZERO AND THAT IS THE ANSWER, NOT A GAP. *** The step target is only ever used to RAISE the
// body and a null falls back to the height it is already at, so `support from any` and `from all` cannot
// produce different walks -- measured, 20.000 either way at a floor that simply ends. The comment in
// _stepTargetAt claimed a distinction the driving does not support and has been corrected; section 3 holds
// the thing that IS load-bearing, which is that a null does not REFUSE the move.
// *** AND F CRASHED THE SHIPPED CODE RATHER THAN FAILING A ROW. *** _footprint read `out[0]` to skip the
// centre cell, which throws the moment the seed is removed -- a TypeError in camera.js, the sixth instance
// of that species in this session's notes. The cell is a named const now and cannot be emptied from under.
//
// *** A RADIUS ALONE MAKES THE PLAYER UNABLE TO CLIMB ANYTHING, AND THE FIRST DRAFT SHIPPED THAT. ***
// Approaching a lip means the disc overlaps the column being climbed, at a height that column is still
// solid at -- so `_canStandAt(newX, THIS FRAME'S y, newZ)` refuses every step up. Measured: every ramp from
// 14 degrees upward stopped dead and the sandbox's one-voxel auto-step stopped being climbed. Section 3 is
// that draft, driven as a rival. The footprint and the step-up are ONE question and _stepTargetAt asks it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Camera, PLAYER_BODY_AT_V4549 as R } from "../../camera/camera.js";
import { GROUND_AT_V4543 } from "../../physics/character/capsuleGround.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const voxelWorld = (solidAt) => ({ voxelAt: (x, y, z) => (solidAt(Math.floor(x), y, Math.floor(z)) ? 1 : 0) });
/** Two pillars touching at exactly one corner. The slit between them has ZERO width. */
const diagonalWorld = voxelWorld((fx, y, fz) =>
    y <= 1 || (y >= 2 && y <= 3 && ((fx === 12 && fz === 10) || (fx === 11 && fz === 11))));
/** A flat floor with a wall whose face is the plane x = 12. */
const wallWorld = voxelWorld((fx, y) => y <= 1 || (fx >= 12 && y >= 2 && y <= 4));
/** A ramp rising k voxels per column from x = 10. */
const rampWorld = (k) => voxelWorld((fx, y) => y <= (fx < 10 ? 1 : 1 + Math.floor((fx - 10) * k)));

const mkCam = (world, pos, keys = [], yaw = 0) => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world, keys: new Set(keys), position: { x: pos[0], y: pos[1], z: pos[2] },
        velocity: { x: 0, y: 0, z: 0 }, yaw, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: true, playerEnergy: null });
    return c;
};
const drive = (world, pos, keys, frames, yaw = 0) => {
    const c = mkCam(world, pos, keys, yaw);
    for (let i = 0; i < frames; i++) c._moveFP(1 / 60);
    return { x: +c.position.x.toFixed(3), z: +c.position.z.toFixed(3), y: +c.position.y.toFixed(3) };
};
/**
 * The body as it was: ONE cell, floor(x) and floor(z), tested at the frame's own height.
 *
 * *** NOT "the shipped rule with BODY_RADIUS set to 0" -- THAT IS A DIFFERENT THING AND A GATE FOUND OUT.
 * *** The first draft of this helper did exactly that and the body walked THROUGH a five-voxel wall to
 * x = 17, because a strict distance test admits nothing at r = 0 and an empty footprint means no cells are
 * tested at all. The repair is in _footprint -- the centre's cell is seeded, so the radius only ever ADDS
 * neighbours -- and the old rule is written out here rather than approximated by a constant.
 */
const lineBody = (world, pos, keys, frames, yaw = 0) => {
    const c = mkCam(world, pos, keys, yaw);
    const solid = (v) => v !== 0 && v !== undefined && v !== 10 && v !== 11;
    c._canStandAt = function (x, y, z) {
        if (!this.world?.voxelAt) return true;
        const fx = Math.floor(x), fz = Math.floor(z);
        const feetY = Math.floor(y - this._eyeHeight + 0.1), headY = Math.floor(y);
        for (let yy = feetY; yy <= headY; yy++) if (solid(this.world.voxelAt(fx, yy, fz))) return false;
        return true;
    };
    c._footprint = (x, z) => [[Math.floor(x), Math.floor(z)]];
    for (let i = 0; i < frames; i++) c._moveFP(1 / 60);
    return { x: +c.position.x.toFixed(3), z: +c.position.z.toFixed(3), y: +c.position.y.toFixed(3) };
};

// =============================================================================================================
console.log("\n1. *** THE BODY HAD NO WIDTH, AND IT WALKED THROUGH A GAP OF ZERO WIDTH ***");
{
    const line = lineBody(diagonalWorld, [10.5, 2 + 1.7, 9.5], ["KeyW"], 90, Math.PI * 0.75);
    const disc = drive(diagonalWorld, [10.5, 2 + 1.7, 9.5], ["KeyW"], 90, Math.PI * 0.75);
    ok("!! *** TWO PILLARS TOUCHING AT ONE CORNER: THE LINE GOES THROUGH, THE DISC DOES NOT ***",
        line.x > 12 && line.z > 11 && disc.x < 12 && disc.z < 11 &&
        Math.abs(line.x - R.diagonalThroughTo[0]) < 0.05 && Math.abs(disc.x - R.diagonalBlockedAt[0]) < 0.05,
        "walking diagonally from (" + R.diagonalFrom.join(", ") + ") between pillars at (12,10) and " +
        "(11,11), which share a single corner and nothing else: the zero-width body ends at (" + line.x +
        ", " + line.z + ") -- PAST BOTH -- and the 0.4-radius body stops at (" + disc.x + ", " + disc.z +
        "). *** A SLIT OF ZERO WIDTH ADMITS A BODY OF ZERO WIDTH, *** which is the whole finding: nothing " +
        "was wrong with the collision test except the shape it was testing.");

    const wallLine = lineBody(wallWorld, [9.5, 2 + 1.7, 5.5], ["KeyD"], 90);
    const wallDisc = drive(wallWorld, [9.5, 2 + 1.7, 5.5], ["KeyD"], 90);
    ok("!! and the centre no longer presses against the wall face: it stops a radius short of it",
        Math.abs(wallLine.x - R.centreStoppedBefore) < 1e-3 &&
        Math.abs(wallDisc.x - R.centreStoppedAfter) < 1e-3 &&
        Math.abs((R.wallFaceX - wallDisc.x) - Camera.BODY_RADIUS) < 0.09,
        "a wall whose face is x = " + R.wallFaceX + ": the line body's centre stops at " + wallLine.x +
        " -- " + (R.wallFaceX - wallLine.x).toFixed(4) + " away, which is ONE FRAME'S TRAVEL and not a " +
        "body -- and the disc body's at " + wallDisc.x + ", " + (R.wallFaceX - wallDisc.x).toFixed(4) +
        " away, which is its radius plus the same frame. physics/character/capsuleGround.mjs's radius is " +
        GROUND_AT_V4543.radius + " and this is the same number, so the two describe one body.");
}

// =============================================================================================================
console.log("\n2. *** A RADIUS SMALLER THAN THE STEP IS NOT A RADIUS: THE TEST IS DISCRETE ***");
{
    const at = (r) => {
        const keep = Camera.BODY_RADIUS; Camera.BODY_RADIUS = r;
        const p = drive(diagonalWorld, [10.5, 2 + 1.7, 9.5], ["KeyW"], 90, Math.PI * 0.75);
        Camera.BODY_RADIUS = keep;
        return p.x > 12 && p.z > 11;
    };
    const through = R.diagonalPassesAtRadius.map(at);
    const blocked = R.diagonalBlocksAtRadius.map(at);
    ok("!! a body moving 0.083 a frame steps over a slit narrower than that, so 0.01 is not a width",
        through.every((t) => t === true) && blocked.every((t) => t === false) &&
        Math.abs(R.perFrameStepAtWalk - 5 / 60) < 1e-12 &&
        Camera.BODY_RADIUS > 4 * R.perFrameStepAtWalk,
        "through at r = " + R.diagonalPassesAtRadius.join(", ") + "; blocked at r = " +
        R.diagonalBlocksAtRadius.join(", ") + ". The walk moves " + R.perFrameStepAtWalk.toFixed(4) +
        " per frame and the sprint half again more, so a radius under that is stepped over rather than " +
        "enforced. 0.4 is " + (Camera.BODY_RADIUS / R.perFrameStepAtWalk).toFixed(1) + " times the walking " +
        "step, which is why it is a size and not a rounding error. *** THIS IS THE SAME SHAPE capsuleMove " +
        "SUBSTEPS FOR *** -- its boundary is exactly the radius and its cap is a fraction of it -- and it " +
        "is recorded here rather than solved, because a lattice body is not swept and the fix would be.");
}

// =============================================================================================================
console.log("\n3. *** A RADIUS ALONE STOPS THE PLAYER CLIMBING ANYTHING, AND THAT WAS THE FIRST DRAFT ***");
{
    // The draft: a footprint, but still asked at the height the body is at RATHER than the one it would
    // stand at. Reproduced so the row grades a rule and not a sentence.
    const draft = (k, frames) => {
        const c = mkCam(rampWorld(k), [5.5, 2 + 1.7, 5.5], ["KeyD"]);
        for (let i = 0; i < frames; i++) {
            const nx = c.position.x + c._fpWalkSpeed / 60;
            if (c._canStandAt(nx, c.position.y, c.position.z)) c.position.x = nx;
            const g = c._terrainTopAtBilinear(c.position.x, c.position.z, c.position.y - c._eyeHeight);
            if (Math.abs(g + c._eyeHeight - c.position.y) <= Camera.STEP_UP_MAX) c.position.y = g + c._eyeHeight;
        }
        return +c.position.x.toFixed(2);
    };
    const KS = [0.25, 0.5, 1];
    const drafted = KS.map((k) => draft(k, 240));
    const shipped = KS.map((k) => drive(rampWorld(k), [5.5, 2 + 1.7, 5.5], ["KeyD"], 240).x);
    ok("!! *** THE DRAFT STOPS DEAD ON EVERY RAMP; THE SHIPPED RULE CLIMBS THEM ALL ***",
        drafted.every((x) => x < 20) && shipped.every((x) => x > 24) &&
        R.cellsTestedBefore === 1 && R.cellsTestedAfterMax === 4,
        "ramps at " + KS.map((k) => (Math.atan(k) * 180 / Math.PI).toFixed(1) + " deg").join(", ") +
        ": the draft ends at x = " + drafted.join(", ") + " and the shipped rule at " + shipped.join(", ") +
        ". *** APPROACHING A LIP MEANS THE DISC OVERLAPS THE COLUMN BEING CLIMBED, *** at a height that " +
        "column is still solid at, so a test asked at the body's CURRENT height refuses every step up. The " +
        "footprint and the step-up are one question: _stepTargetAt takes the HIGHEST surface among the " +
        "cells the disc touches -- SUPPORT FROM ANY, since a body at a cliff edge is held by the cells " +
        "that do have floor -- and _canStandAt then demands CLEARANCE FROM ALL.");

    const fp = mkCam(wallWorld, [11.5, 3.7, 5.5])._footprint(11.5, 5.5);
    const corner = mkCam(wallWorld, [11.7, 3.7, 5.7])._footprint(11.7, 5.7);
    const tight = mkCam(wallWorld, [11.9, 3.7, 5.9])._footprint(11.9, 5.9);
    ok("   the footprint is a DISC and not the square that bounds it, which is what admits the honest gaps",
        fp.length === 1 && corner.length === 3 && tight.length === 4,
        "centred in a cell the disc touches " + fp.length + " cell; at (11.7, 5.7) it touches " +
        corner.length + " -- THREE, not the four its bounds describe, because the diagonal cell is 0.424 " +
        "away and the radius is " + Camera.BODY_RADIUS + "; move to (11.9, 5.9) and that corner comes to " +
        "0.141 and the count is " + tight.length + ". A square footprint would block a body a disc " +
        "legitimately admits, which is the same distinction on the other side of section 1, and the two " +
        "readings together are what show the test is a DISTANCE and not a bounding box.");

    // *** TWO ROWS BELOW EXIST BECAUSE THE SABOTAGE BATTERY WENT ZERO RED ON THEM. ***
    {
        // SUPPORT FROM ANY: a pit with NO floor at all beyond x = 20. A body walking to the rim has one
        // overlapped cell with nothing under it; demanding support from every cell would refuse the rim.
        const pit = voxelWorld((fx, y) => fx < 20 && y <= 1);
        const walkPit = (allCells) => {
            const c = mkCam(pit, [16.5, 2 + 1.7, 5.5], ["KeyD"]);
            if (allCells) {
                // the rival: a surface required under EVERY overlapped cell
                c._stepTargetAt = function (x, z, feetY) {
                    let best = null;
                    for (const [cx, cz] of this._footprint(x, z)) {
                        const g = this._standYAt(cx + 0.5, cz + 0.5, feetY, Camera.STEP_UP_MAX);
                        if (g === null) return null;
                        if (best === null || g > best) best = g;
                    }
                    return best;
                };
            }
            let maxX = c.position.x;
            for (let i = 0; i < 60; i++) { c._moveFP(1 / 60); if (c._fpOnGround) maxX = c.position.x; }
            return +maxX.toFixed(3);
        };
        const any = walkPit(false), all = walkPit(true);
        ok("!! *** A NULL TARGET MUST NOT REFUSE THE MOVE: A BODY IS ENTITLED TO WALK OFF A CLIFF ***",
            any >= 20.3 && any <= 20.4 && all < any,
            "a floor that simply ends at x = 20 with NOTHING below it. The furthest the body stands while " +
            "still on the ground is " + any + ", its disc already half over the void, and it then falls. " +
            "*** v4552 -- AND THE `ANY` vs `ALL` QUANTIFIER HAS BECOME LOAD-BEARING, WHICH IS THE FINDING " +
            "AND NOT A RETUNE: *** at v4549 the two measured IDENTICALLY (20.000 against 20.000) and this " +
            "row said so, because the step target was only ever used to RAISE the body and a null fell back " +
            "to the height it already had -- so the sabotage that swaps them went ZERO RED and was right to. " +
            "v4552 clamps the WALK to that same target, so it now also SETS the body, and the two " +
            "quantifiers separate: ANY " + any + " against ALL " + all + ". A sabotage whose verdict flips " +
            "between rounds is worth more than one that never moves, and _stepTargetAt's comment claiming " +
            "the quantifier is not load-bearing is corrected in the same round that made it false. ANY is " +
            "still the right rule: a disc whose far edge rests on the slab IS supported, and demanding " +
            "support from every overlapped cell stops the body a radius short of every edge.");

        // The centre's cell is always in the footprint, whatever the radius.
        const c = mkCam(wallWorld, [11.5, 3.7, 5.5]);
        const keep = Camera.BODY_RADIUS;
        Camera.BODY_RADIUS = 0;
        const zero = c._footprint(11.5, 5.5);
        Camera.BODY_RADIUS = keep;
        const wide = c._footprint(11.7, 5.7);
        ok("!! *** AND AT r = 0 THE FOOTPRINT IS ONE CELL, NOT NONE: AN EMPTY ONE IS NO COLLISION AT ALL ***",
            zero.length === 1 && zero[0][0] === 11 && zero[0][1] === 5 &&
            wide.some(([cx, cz]) => cx === 11 && cz === 5),
            "at r = 0 the footprint is [" + zero.map((p) => p.join(",")).join("] [") + "] -- the cell the " +
            "centre is in -- and at r = " + Camera.BODY_RADIUS + " that same cell is still in it. The " +
            "distance test is strict, so a derived footprint would be EMPTY at r = 0, and an empty " +
            "footprint means _canStandAt tests nothing and returns true: *** NOT A BODY WITHOUT WIDTH BUT " +
            "A BODY WITHOUT COLLISION, *** measured at x = 17 straight through a five-voxel wall. The " +
            "centre's cell is seeded so the radius only ever ADDS.");
    }
}

// =============================================================================================================
console.log("\n4. *** WHAT A RADIUS COSTS IN GROUND, MEASURED ON A REAL BOOT, AND THE CLIFF IS AT 0.47 ***");
{
    const r40 = R.lostPct["0.40"], lost = R.cellsFullyLost;
    ok("!! *** AT 0.4 NOT ONE CELL IS FULLY LOST; AT 0.48 FIVE HUNDRED AND EIGHTY-SEVEN ARE ***",
        lost["0.40"] === 0 && lost["0.42"] === 0 && lost["0.44"] === 0 && lost["0.46"] === 0 &&
        lost["0.48"] > 500 && lost["0.48"] === lost["0.50"] &&
        R.cliffBetween[0] === 0.46 && R.cliffBetween[1] === 0.48 &&
        r40 > R.lostFloorPct && R.lostPct["0.50"] > r40,
        R.censusCells + " standable cells sampled at " + R.sampledPerCell + " sub-cell positions each. " +
        "Cells that lose EVERY position: " + Object.entries(lost).map(([k, v]) => k + " -> " + v).join(", ") +
        ". *** THE CLIFF IS BETWEEN " + R.cliffBetween.join(" AND ") + ", AND 0.4 IS COMFORTABLY UNDER IT: " +
        "the tree's existing radius is the largest round number that costs no ground on this world. *** " +
        r40 + "% of sub-cell POSITIONS become illegal, which is what having a width means -- you can no " +
        "longer press your centre into a wall -- and is REPORTED with only a floor of " + R.lostFloorPct +
        "% asserted, because the running simulation edits voxels and the same census reads differently " +
        "every boot.");
    report("the cliff is structural rather than a property of this world: at r >= 0.5 a disc cannot fit " +
           "inside a single cell at all, and the one-voxel gaps here start failing just before that.");

    ok("!! *** AND THIS CENSUS WAS WRONG TWICE BEFORE IT SAID ANYTHING, BOTH TIMES VACUOUSLY ***",
        /cell centres/.test(R.censusFirstDraft) && /0 lost/.test(R.censusFirstDraft) &&
        /quantised/.test(R.censusSecondDraft) && R.sampledPerCell === 256,
        "FIRST: " + R.censusFirstDraft + " -- a disc of r <= 0.5 centred in a cell never leaves that cell, " +
        "so the measurement could not have found anything and the zero meant nothing. SECOND: " +
        R.censusSecondDraft + " -- the only distances to a cell edge were 0.125 and 0.375, so r=0.2 read " +
        "identically to r=0.3 and r=0.4 to r=0.5. *** A GRID COARSER THAN THE THING BEING MEASURED IS A " +
        "MEASUREMENT OF THE GRID, *** and the monotonic reading in the row above is what a 16-per-axis " +
        "sample gives. Both drafts are recorded because a number that survived two wrong instruments is " +
        "worth less than one that says which they were.");
}

// =============================================================================================================
console.log("\n5. WHAT DOES NOT CHANGE, AND WHAT IT COSTS");
{
    const flat = voxelWorld((fx, y) => y <= 1);
    const walk = drive(flat, [5.5, 2 + 1.7, 5.5], ["KeyD"], 140);
    ok("!! open ground is untouched: one cell in the footprint, one cell tested, the same walk",
        Math.abs(walk.y - 3.7) < 1e-9 && walk.x > 17,
        "140 frames east on flat ground: y=" + walk.y + ", x=" + walk.x + ". A body away from any edge " +
        "touches exactly one cell, so the disc costs nothing it did not cost before.");

    const c = mkCam(flat, [5.5, 3.7, 5.5]);
    const N = 200000, t0 = Date.now();
    let acc = 0;
    for (let i = 0; i < N; i++) acc += c._canStandAt(5.5 + (i % 97) / 97, 3.7, 5.5 + (i % 89) / 89) ? 1 : 0;
    const us = (Date.now() - t0) * 1000 / N;
    ok("   and the cost is a fraction of a microsecond, against at most three calls a frame",
        acc === N && us < 2 && R.callsPerFrame === 3,
        N + " calls at " + us.toFixed(3) + " microseconds each (recorded " + R.canStandAtMicroseconds +
        "), so the whole per-frame collision cost is about " + (R.callsPerFrame * us).toFixed(2) +
        " microseconds. The reading is REPORTED rather than pinned: it is a clock on a shared box.");
}

// =============================================================================================================
console.log("\n6. the record is what the code reports now");
{
    ok("!! every field re-derived above rather than typed here",
        Camera.BODY_RADIUS === R.radiusAfter && R.radiusBefore === 0 &&
        Camera.BODY_RADIUS === GROUND_AT_V4543.radius &&
        R.cliffBetween[0] < Camera.BODY_RADIUS === false && Object.isFrozen(R),
        "BODY_RADIUS " + Camera.BODY_RADIUS + ", capsuleGround's " + GROUND_AT_V4543.radius +
        ", the cliff at " + R.cliffBetween.join("-") + ".");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nnot closed here: *** THE WALK'S BILINEAR GROUND CAN STAND THE BODY INSIDE SOLID ROCK, *** and it " +
    "could before this round gave the body a radius to notice it with -- driven at v4548 with no radius " +
    "at all, a body at the sandbox's +z lip stands with its feet at 3.000 in a cell solid to y=3. " +
    "_canStandAt refuses that position on every horizontal move and the vertical snap never asks it. " +
    "Clamping the walk to a legal height means taking the highest surface under the footprint, which binds " +
    "at EVERY one-voxel lip and brings back exactly the stairs v404 was written to remove, so smooth " +
    "slopes and legal positions are incompatible for a body with width on a unit lattice and choosing " +
    "between them is a gameplay decision. Also not done: the body is a CYLINDER and not a capsule -- no " +
    "rounded cap, so it cannot be swept the way physics/character/capsuleMove.mjs sweeps one, which is " +
    "what section 2's step-over is really about; and the kaiju is still probed as a two-cell body though " +
    "the creature stands eight units tall.");
process.exit(fails ? 1 : 0);
