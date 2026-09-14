// WebGLEngine/tools/ship/walkGround-selfcheck.mjs -- v4552
//
// Run: node tools/ship/walkGround-selfcheck.mjs
//
// *** THE WALK STOOD THE BODY INSIDE SOLID ROCK, AND IT HAD DONE SINCE v404 MADE THE GROUND BILINEAR. ***
// _terrainTopAtBilinear blends up to four columns, so it answers heights NEITHER of them has; _moveFP
// assigned one to position.y and nothing ever asked _canStandAt whether a body fits there -- that predicate
// has exactly one shipping call site and it is the HORIZONTAL move. Measured on the generated world with an
// instrument sharing no code with the fix: 56.56% of grounded frames and 36.13% of distinct standing
// positions had the body inside rock, and 67 of 128 ordinary walks ended frozen in it. After: 1.51%, 2.77%,
// 2 of 128.
//
// ---- THE FINDING THAT DECIDED THE SHAPE: NO GROUND RULE IS BOTH LEGAL AND SMOOTH -----------------------
//
// A sub-voxel walking height on a unit lattice is BY CONSTRUCTION a height no column has, so the blend's
// smoothness IS its illegality. Four candidate rules were driven on 26.6-degree ramps in all four compass
// directions, up and back down, grounded-frame-to-grounded-frame |dy|:
//
//     rule                      +z / +x ramps          -z / -x ramps
//     the blend (v404..v4551)   0 steps, max 0.0833    0 steps, max 0.0833   <- smooth, and inside the rock
//     the clamp (this round)    12 steps, max 1.0000   12 steps, max 1.0000  <- legal, uniform stairs
//     max(blend, clamp)         0 steps, max 0.4167    12 steps, max 1.0000  <- LEGAL BUT DIRECTION-DEPENDENT
//
// *** max(blend, clamp) LOOKED LIKE THE FREE LUNCH AND IS AN ARTEFACT OF A STENCIL BUG. ***
// _terrainTopAtBilinear samples (ix,iz)..(ix+1,iz+1) -- the body's own cell and the three cells in +x/+z
// ONLY -- so the blend LEADS the terrain by half a cell in +x/+z, which happens to cancel the r=0.4
// footprint lookahead one way and DOUBLE it the other. A hill that glides walking north and stairs walking
// south is a new defect, not a fix. Section 3 is the four-direction row that catches it; no prior round had
// one, and a one-direction fixture passes the hybrid.
//
// So the smoothness cannot come from the ground rule, and is taken from TIME: the body stands on real
// surfaces and the EYE eases toward it. Section 4 holds the thing that keeps that honest -- the smoother
// writes _eyeRenderY and NOTHING else, so camera.position.y is bit-identical with it on and off.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   S1  revert the ground to the blend (the shipped defect)                    18 RED
//   S2  clamp the walk but leave the slope secant on the blend                 10 RED
//   S3  the hybrid: _walkGroundAt returns max(blend, legal)                     6 RED
//   S4  null conflated with 0 when nothing supports the disc                     2 RED
//   S5  zero the step-up reach inside _stepTargetAt                            15 RED
//   S6  BODY_RADIUS = 0, so the footprint is one cell again                    15 RED
//   S7  the footprint quantifier ANY -> ALL                                     6 RED
//   S8  ease the BODY instead of the eye                                        3 RED
//   S9  delete the eye's snap guard                                             1 RED
//   S10 mistune EYE_SMOOTH_RATE to 30                                           4 RED
//   S11 centre the blend's half-cell stencil                                    2 RED
//
// Counted across this gate, playerGround, playerSlope, controllerAgreement, cameraFall, playerBody,
// playerWater and voxelAvatar.
//
// *** S8 AND S9 WENT ZERO RED ON THE FIRST BATTERY AND BOTH WERE THIS GATE'S FAULT. *** Section 4 had
// re-implemented the eye ease inside the gate, because update() wants a canvas -- so breaking the shipped
// smoother changed nothing the gate could see. THAT IS A CHECK GRADING ITS OWN COPY, v4541's sabotage B,
// in the round that keeps naming the species. camera.js grew _stepRenderEye so the gate could drive what
// ships, and S8 went to 3. S9 then still read 0 because the fixture had no discontinuity: MEASURED, a body
// falling off a 19-voxel cliff never moves more than 0.45 in a frame at 60 Hz and gravity 18, so a natural
// fall NEVER reaches the snap guard. The guard is for the ten external writers of position.y -- a lock, a
// cinematic, an eject, a respawn -- and the fixture now teleports the body 40 voxels, which is what it is
// actually for.
//
// *** S6 CARRIED A DECLARED STOP CONDITION AND DID NOT TRIP IT -- IT SHARPENED THE ANSWER INSTEAD. *** The
// design said: if removing the body's radius reddens the BURIAL row, the model of the fix is wrong and the
// round should stop. It does not. With BODY_RADIUS = 0 the burial residual goes to 0.00% of grounded frames
// against the shipped 1.51%, and the row that reddens is the one asserting the residual is NOT zero. So the
// clamp's entire residual is the RADIUS meeting _stepTargetAt's reach limit: a footprint cell whose surface
// is more than STEP_UP_MAX above the feet answers null, drops out of the max, and the body stands below it.
// A zero-width body has no neighbouring cell to be too high. The attribution is now measured from both
// ends rather than traced from one.
//
// *** AND S11 FALSIFIED THE ROUND'S OWN PREDICTION, WHICH IS WHY IT WAS RUN. *** The design expected that
// taking the walk off the blend would ORPHAN the blend's half-cell stencil shift -- 0 RED, with the round
// recording that it had left a known defect unguarded. It goes 2 RED: playerSlope and cameraFall both drive
// the blend directly. The shift keeps its keepers. Section 8 says so with the numbers.
//
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Camera, WALK_GROUND_AT_V4552 as R } from "../../camera/camera.js";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const src = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const CAM = src("camera/camera.js"), CAMCODE = noComments(CAM);

const voxelWorld = (solidAt) => ({ chunkHeight: 80,
    voxelAt: (x, y, z) => (solidAt(Math.floor(x), y, Math.floor(z)) ? 1 : 0) });
/** A ramp rising k voxels per column from x = 10, along the named axis and sign. */
const rampWorld = (k, axis, sign) => voxelWorld((fx, y, fz) => {
    const u = axis === "x" ? (sign > 0 ? fx : -fx) : (sign > 0 ? fz : -fz);
    return y <= (u < 10 ? 1 : 1 + Math.floor((u - 10) * k));
});
/** The sandbox's own hand world: floor top 1, slab top 3 for z in [4,40), walls, a step, a tower. */
const handWorld = () => {
    const solid = new Set();
    const set = (x, y, z) => solid.add(x + "," + y + "," + z);
    for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) {
        set(x, 1, z); if (z >= 4 && z < 40) { set(x, 3, z); set(x, 2, z); } }
    for (let x = 0; x < 48; x++) for (let y = 4; y < 7; y++) set(x, y, 10);
    for (let x = 4; x < 12; x++) for (let z = 16; z < 18; z++) set(x, 4, z);
    for (let x = 4; x < 12; x++) for (let z = 20; z < 22; z++) { set(x, 4, z); set(x, 5, z); }
    for (let y = 4; y < 9; y++) set(30, y, 30);
    return voxelWorld((fx, y, fz) => solid.has(fx + "," + y + "," + fz));
};

const mk = (world, pos, keys = [], yaw = 0) => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world, keys: new Set(keys), position: { x: pos[0], y: pos[1], z: pos[2] },
        velocity: { x: 0, y: 0, z: 0 }, yaw, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: true, playerEnergy: null });
    return c;
};
const drive = (world, pos, keys, frames, yaw = 0) => {
    const c = mk(world, pos, keys, yaw);
    for (let i = 0; i < frames; i++) c._moveFP(1 / 60);
    return { x: +c.position.x.toFixed(3), y: +c.position.y.toFixed(3), z: +c.position.z.toFixed(3),
             feet: +(c.position.y - c._eyeHeight).toFixed(3), onGround: c._fpOnGround };
};
/**
 * *** THE BURIAL PROBE, WRITTEN WITHOUT REFERENCE TO _canStandAt, _footprint, _stepTargetAt OR _standYAt.
 * *** A legality instrument built out of the fix's own machinery would be measuring the fix through itself
 * -- the vacuous-by-construction species this session has shipped twice. This one walks the disc's own
 * cells and reads raw voxelAt. It answers how far the feet are BELOW the top face of the solid under them.
 */
const buriedDepth = (world, x, feetY, z, r = Camera.BODY_RADIUS) => {
    let worst = 0;
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++)
        for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
            const nx = Math.min(Math.max(x, cx), cx + 1), nz = Math.min(Math.max(z, cz), cz + 1);
            const inDisc = (nx - x) * (nx - x) + (nz - z) * (nz - z) < r * r;
            if (!inDisc && !(cx === Math.floor(x) && cz === Math.floor(z))) continue;
            for (let yy = Math.floor(feetY + 1.999); yy >= Math.floor(feetY); yy--)
                if ((world.voxelAt(cx, yy, cz) || 0) !== 0) { const d = (yy + 1) - feetY; if (d > worst) worst = d; break; }
        }
    return worst;
};

console.log("== walkGround-selfcheck (v4552) ==");

// ---- 1. THE DEFECT, ON THE FIXTURE THAT NAMED IT -------------------------------------------------------
console.log("\n-- 1. task #30's own fixture: the two-voxel ledge at z=40");
{
    const w = handWorld();
    const c = mk(w, [40.5, 5.7, 38.5], ["KeyW"], Math.PI);
    let illegal = 0, landedFeet = null, wentAirborne = false;
    for (let i = 0; i < 72; i++) {
        c._moveFP(1 / 60);
        const feet = c.position.y - 1.7;
        if (buriedDepth(w, c.position.x, feet, c.position.z) > 1e-9) illegal++;
        if (!c._fpOnGround) wentAirborne = true;
        if (wentAirborne && c._fpOnGround && landedFeet === null) landedFeet = +feet.toFixed(3);
    }
    report(`72 frames: ends z ${c.position.z.toFixed(3)} feet ${(c.position.y - 1.7).toFixed(3)}, ` +
           `airborne on the way: ${wentAirborne}, landed at feet ${landedFeet}`);
    ok("*** the body is never inside the rock, on any frame of the walk ***", illegal === 0,
       `${illegal} illegal frames of 72. *** IT READ z 39.667 FEET 2.000 AT v4551, INSIDE A CELL WHOSE ` +
       `SURFACE IS y=4, GROUNDED, AND NEVER MOVED AGAIN. ***`);
    ok("!! it holds the real surface out past the lip, then falls, then lands legally",
       wentAirborne && landedFeet === 2 && c._fpOnGround && c.position.z > 44 && c.position.z < 45);
    ok("the record carries the before-reading so the repair is falsifiable",
       R.taskFixtureBeforeZ === 39.667 && R.taskFixtureBeforeFeet === 2 && R.taskFixtureBeforeStuck === true);
}

// ---- 2. THE CENSUS, ON AN INSTRUMENT THAT SHARES NO CODE WITH THE FIX -----------------------------------
console.log("\n-- 2. a generated world, 128 walks, burial measured on raw voxelAt");
{
    const { VoxelWorld } = await import("../../world/world.js");
    const { standHeightAt } = await import("../../world/surfaceProbe.mjs");
    const w = new VoxelWorld();
    for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.generateChunk(cx, cz);
    let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const starts = [];
    while (starts.length < 128) {
        const x = Math.floor(rnd() * 100) - 50, z = Math.floor(rnd() * 100) - 50;
        const h = standHeightAt(w, x, z, {}); if (h !== null) starts.push([x + 0.5, h + 1.7, z + 0.5]);
    }
    let gframes = 0, buried = 0, frozenInSolid = 0, worst = 0;
    const distinct = new Map();
    for (let i = 0; i < starts.length; i++) {
        const c = mk(w, starts[i], ["KeyW"], (i % 8) * Math.PI / 4);
        let last = null, still = 0;
        for (let f = 0; f < 300; f++) {
            c._moveFP(1 / 60);
            const feet = c.position.y - 1.7;
            const d = buriedDepth(w, c.position.x, feet, c.position.z);
            const key = `${c.position.x.toFixed(2)},${feet.toFixed(2)},${c.position.z.toFixed(2)}`;
            if (!distinct.has(key)) distinct.set(key, d > 1e-9);
            if (c._fpOnGround) { gframes++; if (d > 1e-9) { buried++; if (d > worst) worst = d; } }
            if (last === key) still++; else { still = 0; last = key; }
        }
        if (still > 30 && buriedDepth(w, c.position.x, c.position.y - 1.7, c.position.z) > 1e-9) frozenInSolid++;
    }
    const dv = [...distinct.values()], dpct = 100 * dv.filter(Boolean).length / dv.length;
    const fpct = 100 * buried / gframes;
    report(`grounded frames ${gframes}, buried ${fpct.toFixed(2)}%; distinct standing positions ` +
           `${dv.length}, buried ${dpct.toFixed(2)}%; walks frozen inside solid ${frozenInSolid} of 128; ` +
           `worst depth ${worst.toFixed(3)}`);
    report(`the SAME instrument on v4551: ${R.beforeGroundedBuriedPct}% of grounded frames, ` +
           `${R.beforeDistinctBuriedPct}% of distinct positions, ${R.beforeFrozenInSolid} of 128 frozen`);
    // *** CEILINGS, NOT FIGURES: the walk is deterministic here but the grid is a choice, and two prior
    // rounds showed these digits move by 2-3 points between grids. The direction and the order of
    // magnitude are the claim; the second decimal is not. ***
    ok("*** burial is down by more than an order of magnitude on every measure ***",
       fpct < 5 && dpct < 6 && frozenInSolid <= 5,
       `ceilings 5% / 6% / 5 walks; measured ${fpct.toFixed(2)}% / ${dpct.toFixed(2)}% / ${frozenInSolid}`);
    ok("!! and the before-figures are recorded, so the ratio is checkable rather than asserted",
       R.beforeGroundedBuriedPct > 40 && R.beforeDistinctBuriedPct > 25 && R.beforeFrozenInSolid > 50,
       `${(R.beforeGroundedBuriedPct / fpct).toFixed(0)}x fewer buried frames, ` +
       `${(R.beforeFrozenInSolid / Math.max(1, frozenInSolid)).toFixed(0)}x fewer frozen walks`);
    ok("the residual is REPORTED and not claimed to be zero", R.residualIsNotZero === true && fpct > 0);
}

// ---- 3. THE ROW THAT KILLS THE HYBRID: FOUR DIRECTIONS MUST READ THE SAME --------------------------------
console.log("\n-- 3. a 26.6-degree ramp, walked up and down, in all four compass directions");
{
    const steps = (world, pos, keys, yaw, frames) => {
        const c = mk(world, pos, keys, yaw); let prev = null, max = 0, over = 0;
        for (let i = 0; i < frames; i++) {
            const wasG = c._fpOnGround; c._moveFP(1 / 60);
            if (wasG && c._fpOnGround && prev !== null) {
                const d = Math.abs(c.position.y - prev); if (d > max) max = d; if (d >= 0.5) over++;
            }
            prev = c.position.y;
        }
        return { max: +max.toFixed(4), over };
    };
    const K = 0.5;   // 26.565 degrees
    const runs = {
        "+x": steps(rampWorld(K, "x", +1), [9.5, 2 + 1.7, 5.5], ["KeyD"], 0, 240),
        "-x": steps(rampWorld(K, "x", -1), [-9.5, 2 + 1.7, 5.5], ["KeyA"], 0, 240),
        "+z": steps(rampWorld(K, "z", +1), [5.5, 2 + 1.7, 9.5], ["KeyW"], Math.PI, 240),
        "-z": steps(rampWorld(K, "z", -1), [5.5, 2 + 1.7, -9.5], ["KeyW"], 0, 240),
    };
    for (const k of Object.keys(runs)) report(`${k}: max grounded |dy| ${runs[k].max}, steps >= 0.5: ${runs[k].over}`);
    const maxima = Object.values(runs).map((r) => r.max);
    ok("*** the walk reads the SAME in all four compass directions ***",
       maxima.every((m) => Math.abs(m - maxima[0]) < 1e-9),
       `[${maxima.join(", ")}] -- *** THIS IS THE ROW max(blend, clamp) FAILS, AND NO PRIOR ROUND HAD ONE. ` +
       `*** That hybrid reads 0.4167 on +x/+z-facing ramps and 1.0000 on -x/-z-facing ones, because ` +
       `_terrainTopAtBilinear's stencil is shifted half a cell into +x/+z: the shift cancels the footprint ` +
       `lookahead one way and doubles it the other. A one-direction fixture passes it.`);
    ok("!! and the step is a whole voxel, which is the cost this round accepts out loud",
       maxima[0] === 1, `max grounded |dy| = ${maxima[0]}. The lattice has no smaller riser; the SMOOTHNESS ` +
       `is taken in the picture instead (section 4) and NOT by standing the body between two surfaces.`);
}

// ---- 3b. null IS NOT 0, AND THE CLIFF BRANCH HIDES IT -- SO THE PROPERTY IS ASSERTED DIRECTLY ----------
console.log("\n-- 3b. a column nothing supports answers null, not zero");
{
    const holeWorld = voxelWorld((fx, y) => fx < 20 && y <= 3);   // a floor at top 3 that simply ENDS
    const c = mk(holeWorld, [17.5, 4 + 1.7, 5.5], ["KeyD"], 0);
    ok("*** _walkGroundAt answers null over the hole and a real surface over the floor ***",
       c._walkGroundAt(25.5, 5.5, 4) === null && c._walkGroundAt(17.5, 5.5, 4) === 4,
       "v4545 paid for this distinction: a column this body cannot stand in is not a column whose ground " +
       "is ZERO, and averaging a not-found corner in as 0 put the body a whole voxel inside the floor and " +
       "locked it there at z 3.250.");
    // *** AND THE DRIVEN CONSEQUENCE IS MASKED, WHICH IS WHY THE ROW ABOVE IS A UNIT ROW AND SAYS SO. ***
    // Replacing the null with 0 does NOT change the walk: dy comes out at -4, which trips CLIFF_DROP, so
    // the body goes airborne on the same frame it would have anyway and is never GROUNDED at a dragged
    // height. Measured both ways: lowest feet while still grounded is 4.000 with the null and 4.000 with
    // the zero. The sabotage that conflates them reddens ONE row in this battery, and it is a source-level
    // row in playerGround rather than a driven one here. Recorded rather than dressed up as a catch.
    let minGroundedFeet = Infinity;
    const d = mk(holeWorld, [17.5, 4 + 1.7, 5.5], ["KeyD"], 0);
    for (let i = 0; i < 40; i++) { d._moveFP(1 / 60); if (d._fpOnGround) minGroundedFeet = Math.min(minGroundedFeet, d.position.y - 1.7); }
    ok("!! and walking off it, the body is never grounded below the floor it left",
       minGroundedFeet === 4, `lowest feet while grounded ${minGroundedFeet} -- the cliff branch takes the ` +
       `body before any dragged height can be stood at, which is why the row above is the one that matters.`);
}

// ---- 4. THE EYE SMOOTHER IS NOT A SECOND PHYSICS AUTHORITY ----------------------------------------------
console.log("\n-- 4. the render eye writes _eyeRenderY and nothing else");
{
    const w = rampWorld(0.5, "x", +1);
    const run = (rate) => {
        const keep = Camera.EYE_SMOOTH_RATE; Camera.EYE_SMOOTH_RATE = rate;
        const c = mk(w, [9.5, 2 + 1.7, 5.5], ["KeyD"], 0);
        const body = []; let prevEye = null, maxEyeStep = 0, overHalf = 0, maxOffset = 0;
        for (let i = 0; i < 240; i++) {
            c._moveFP(1 / 60);
            // *** THE SHIPPED METHOD, NOT A COPY OF IT. *** The first draft of this section re-implemented
            // the ease here because update() wants a canvas, and sabotages S8 (smooth the BODY instead of
            // the eye) and S9 (delete the snap guard) then went ZERO RED against a gate grading its own
            // copy -- v4541's sabotage B, in the round that keeps naming the species. camera.js's
            // _stepRenderEye exists so this line can call the thing that ships.
            c.mode = "fp";
            c._stepRenderEye(1 / 60);
            body.push(+c.position.y.toFixed(9));
            const off = Math.abs(c._eyeRenderY - c.position.y); if (off > maxOffset) maxOffset = off;
            if (prevEye !== null) { const d = Math.abs(c._eyeRenderY - prevEye);
                if (d > maxEyeStep) maxEyeStep = d; if (d >= 0.5) overHalf++; }
            prevEye = c._eyeRenderY;
        }
        Camera.EYE_SMOOTH_RATE = keep;
        return { body, maxEyeStep: +maxEyeStep.toFixed(4), overHalf, maxOffset: +maxOffset.toFixed(4) };
    };
    const shipped = run(Camera.EYE_SMOOTH_RATE), fast = run(30);
    const noSmoother = (() => { const c = mk(w, [9.5, 2 + 1.7, 5.5], ["KeyD"], 0); const b = [];
        for (let i = 0; i < 240; i++) { c._moveFP(1 / 60); b.push(+c.position.y.toFixed(9)); } return b; })();
    ok("*** camera.position.y is BIT-IDENTICAL with the smoother running and not running ***",
       shipped.body.length === noSmoother.length && shipped.body.every((v, i) => v === noSmoother[i]),
       "the smoother writes _eyeRenderY alone. If this row ever fails the eye has become a second vertical " +
       "authority, which is the defect this round is fixing, wearing a time constant.");
    report(`k=${Camera.EYE_SMOOTH_RATE}: max per-frame eye |dy| ${shipped.maxEyeStep}, steps >= 0.5: ` +
           `${shipped.overHalf}, max eye-to-body offset ${shipped.maxOffset}`);
    report(`k=30 (the mistune): max ${fast.maxEyeStep}, steps >= 0.5: ${fast.overHalf}`);
    ok("!! at the shipped rate the eye never steps half a voxel in one frame", shipped.overHalf === 0);
    ok("*** and the eye never gets more than EYE_SMOOTH_SNAP from the body ***",
       shipped.maxOffset <= Camera.EYE_SMOOTH_SNAP,
       `${shipped.maxOffset} against ${Camera.EYE_SMOOTH_SNAP}. The option this replaced -- hand the ` +
       `RENDERER the bilinear blend -- measured 10.69 and 12.95 voxels of PERMANENT disagreement.`);
    ok("!! a mistuned rate is visible rather than silent", fast.maxEyeStep > shipped.maxEyeStep);

    // *** THE SNAP GUARD IS FOR DISCONTINUITIES THAT ARE NOT PHYSICS, AND FINDING THAT OUT COST A WRONG
    // FIXTURE. *** The first draft walked the body off a 19-voxel cliff expecting the guard to fire. It does
    // not: at 60 Hz and gravity 18 a falling body moves at most 0.45 in a frame, so a natural fall NEVER
    // exceeds EYE_SMOOTH_SNAP and the sabotage that deletes the guard went ZERO RED against it. Measured,
    // not assumed. What the guard is actually for is the ten per-frame EXTERNAL writers of position.y --
    // GravityWarp's lock, the cinematics, EjectSequence, respawn, a mode change -- each of which can move
    // the body metres between frames with no velocity at all. That is the fixture.
    {
        const flat = voxelWorld((fx, y) => y <= 1);
        const c = mk(flat, [5.5, 2 + 1.7, 5.5], [], 0); c.mode = "fp";
        c._stepRenderEye(1 / 60);                       // settle: the eye starts on the body
        const before = c._eyeRenderY;
        c.position.y += 40;                             // an external writer teleports the body, as several do
        c._stepRenderEye(1 / 60);
        const offAfterTeleport = Math.abs(c._eyeRenderY - c.position.y);
        // and an ordinary walking step must still be EASED rather than snapped
        const d = mk(flat, [5.5, 2 + 1.7, 5.5], [], 0); d.mode = "fp"; d._stepRenderEye(1 / 60);
        d.position.y += 1;                              // a one-voxel lip, inside the guard
        d._stepRenderEye(1 / 60);
        const offAfterStep = Math.abs(d._eyeRenderY - d.position.y);
        report(`teleport of 40: eye-to-body offset after one step ${offAfterTeleport.toFixed(6)} (snapped); ` +
               `a 1-voxel step: ${offAfterStep.toFixed(4)} (eased, so still catching up)`);
        ok("*** a teleport is CUT and a walking step is EASED, which is the whole of the guard ***",
           before === 3.7 && offAfterTeleport === 0 && offAfterStep > 0.5 && offAfterStep < 1,
           `without the guard the teleport would ease too and drag the eye 40 voxels behind the body, ` +
           `smearing a respawn across the picture. A natural FALL never reaches the guard at 60 Hz -- ` +
           `gravity 18 moves the body at most 0.45 a frame -- which is measured above and is why this ` +
           `fixture writes position.y directly rather than dropping the body off a cliff.`);
    }
}

// ---- 5. THE THREE CONSTANTS ARE ORDERED, AND THE ORDER IS WHAT MAKES THE GUARD MEAN ANYTHING -------------
console.log("\n-- 5. STEP_UP_MAX < EYE_SMOOTH_SNAP < CLIFF_DROP");
{
    const CLIFF_DROP = 1.5;   // local to _moveFP; read here as a literal and checked against the source
    ok("*** the ordering holds ***",
       Camera.STEP_UP_MAX < Camera.EYE_SMOOTH_SNAP && Camera.EYE_SMOOTH_SNAP < CLIFF_DROP,
       `${Camera.STEP_UP_MAX} < ${Camera.EYE_SMOOTH_SNAP} < ${CLIFF_DROP}: a walking step is EASED and a ` +
       `fall, a teleport or an external writer's jump is SNAPPED rather than smeared across the picture.`);
    ok("!! and CLIFF_DROP is still that number in the source, so this row cannot drift off it",
       /const CLIFF_DROP\s*=\s*1\.5;/.test(CAMCODE));
    ok("the record carries all three", R.stepUpMax === Camera.STEP_UP_MAX &&
       R.eyeSmoothSnap === Camera.EYE_SMOOTH_SNAP && R.cliffDrop === CLIFF_DROP);
}

// ---- 6. BOTH ENDS OF THE SECANT READ THE SAME GROUND ----------------------------------------------------
console.log("\n-- 6. the slope test, and the thing v4546 paid for");
{
    const fallingWorld = (k) => voxelWorld((fx, y) => y <= (fx >= 40 ? 40 : Math.max(1, 40 - Math.floor((40 - fx) * k))));
    const sweep = (k) => {
        const c = mk(fallingWorld(k), [45.5, 41 + 1.7, 5.5], ["KeyA"], 0);
        let airborne = 0, slopeDepartures = 0, worst = 0;
        for (let i = 0; i < 240; i++) { const was = c._fpOnGround; c._moveFP(1 / 60);
            if (c._fpSlope !== null && c._fpSlope > worst) worst = c._fpSlope;
            if (was && !c._fpOnGround && c._fpSlope !== null && c._fpSlope > Camera.MAX_SLOPE_DEG) slopeDepartures++;
            if (!c._fpOnGround) airborne++; }
        return { airborne, slopeDepartures, worst: +worst.toFixed(10) };
    };
    const at45 = sweep(1), at63 = sweep(2);
    report(`45.0 deg: airborne ${at45.airborne}/240, worst reading ${at45.worst}`);
    report(`63.4 deg: airborne ${at63.airborne}/240, departures attributed to the slope test ${at63.slopeDepartures}`);
    ok("*** an exactly-45-degree ramp now reads EXACTLY 45, because the blend's float error is gone ***",
       at45.worst === 45 && at45.airborne === 0,
       `v4546 measured 45.0000000000001990 here -- 1.99e-13 out of the bilinear blend -- and a bare '> 45' ` +
       `threw the body off a slope it was allowed to walk, 21 frames of 240. Both ends of the secant read ` +
       `integer stand-heights now, so atan2(1,1)*180/PI is exact.`);
    ok("!! *** AND THE SLOPE LIMIT IS STILL LIVE: THIS ROUND DID NOT QUIETLY UNDO v4546 ***",
       at63.airborne > 100 && at63.slopeDepartures > 0,
       `63.4 degrees still throws the body off, ${at63.slopeDepartures} departures attributed to the test. ` +
       `Worth a row because the CLIFF case changed hands this round -- a vertical lip now departs through ` +
       `CLIFF_DROP with the slope reading 0 -- and 'the slope test stopped firing' would look identical ` +
       `from the outside.`);
    ok("*** both ends of the secant read the SAME method, in the source ***",
       /const ahead = this\._walkGroundAt\(/.test(CAMCODE) &&
       /const groundY = this\._walkGroundAt\(/.test(CAMCODE),
       "a secant across two different instruments is not a secant. Changing only _moveFP rebuilds v4546's " +
       "frame-rate bug: the ramp then reads 53.13 degrees and the body is thrown off it at 6 fps alone.");
}

// ---- 7. WHAT MUST NOT BREAK -----------------------------------------------------------------------------
console.log("\n-- 7. the readings prior rounds pinned");
{
    const w = handWorld(), P = Math.PI;
    const step  = drive(w, [8.5, 5.7, 14.5], ["KeyW"], 24, P);
    const slab  = drive(w, [8.5, 5.7, 30.5], ["KeyW"], 60, 0);
    const spr   = drive(w, [40.5, 5.7, 30.5], ["KeyW", "ShiftLeft"], 60, 0);
    const w2p   = drive(w, [8.5, 5.7, 18.5], ["KeyW"], 60, P);
    const w2m   = drive(w, [8.5, 5.7, 23.5], ["KeyW"], 60, 0);
    ok("*** the one-voxel auto-step is still climbed: z 16.500, eye 6.700 ***",
       step.z === 16.5 && step.y === 6.7 && step.onGround,
       `${step.z}, ${step.y} -- this is the reading v4549's first draft broke, when giving the body a ` +
       `radius without a step-aware move test stopped every ramp from 14 degrees up.`);
    ok("a second of W on the slab still walks 5 units: z 25.500", slab.z === 25.5 && slab.y === 5.7);
    ok("Shift still sprints: z 22.500", spr.z === 22.5 && spr.y === 5.7);
    ok("the two-voxel wall is a wall from BOTH sides", w2p.z === 19.583 && w2m.z === 22.417);
    ok("the record pins them", R.autoStepZ === 16.5 && R.autoStepEye === 6.7 && R.slabWalkZ === 25.5 &&
       R.sprintZ === 22.5);
}

// ---- 8. WHAT THIS ROUND ORPHANED, SAID RATHER THAN LEFT ------------------------------------------------
console.log("\n-- 8. the blend is no longer the walk's ground");
{
    // *** THE METHOD BODY IS BRACE-MATCHED, NOT TAKEN AS A FIXED WINDOW. *** v4544 shipped a wiring row
    // anchored on a fixed-length window and this session has named that species three times since; the
    // first draft of THIS row did it again and read the wrong method's text. One extraction, used twice.
    const methodBody = (name) => {
        const i = CAMCODE.indexOf("\n    " + name + "(");
        if (i < 0) return "";
        let j = CAMCODE.indexOf("{", i), depth = 0;
        for (let k = j; k < CAMCODE.length; k++) {
            if (CAMCODE[k] === "{") depth++;
            else if (CAMCODE[k] === "}") { depth--; if (depth === 0) return CAMCODE.slice(i, k + 1); }
        }
        return CAMCODE.slice(i);
    };
    const moveFP = methodBody("_moveFP"), slopeDeg = methodBody("_fpSlopeDeg");
    ok("*** _moveFP no longer calls _terrainTopAtBilinear ***",
       moveFP.length > 500 && !moveFP.includes("_terrainTopAtBilinear") &&
       slopeDeg.length > 200 && !slopeDeg.includes("_terrainTopAtBilinear"),
       "the walk reads _walkGroundAt. The blend is still CALLED -- by _terrainTopAt's own fromY path and " +
       "the orbit clearance -- and is left byte-identical, which is what keeps cameraFall's frozen " +
       "blendLandsFeetAt and playerGround's renormalise rows meaningful.");
    ok("!! but it still EXISTS and is still gated, so the round did not delete a measured thing",
       /_terrainTopAtBilinear\s*\(/.test(CAMCODE) && R.blendStillCalledBy.length > 0,
       "remaining callers: " + R.blendStillCalledBy.join(", "));
    ok("*** and its half-cell stencil shift is FILED, not fixed, with the number that says why it matters ***",
       R.blendStencilShiftPct >= 30 && R.blendStencilShiftFixed === false &&
       R.blendStillGuardedBy.length === 2,
       `${R.blendStencilShiftPct}% of standable columns read BELOW their own surface at their own cell ` +
       `centre, worst shortfall ${R.blendStencilWorstShortfall} voxels. *** AND IT IS STILL GUARDED, WHICH ` +
       `I PREDICTED IT WOULD NOT BE AND MEASURED INSTEAD OF ASSUMING: *** the round's design expected that ` +
       `taking the walk off the blend would orphan it and that a sabotage centring the stencil would go 0 ` +
       `RED. It goes 2 RED, in ${R.blendStillGuardedBy.join(" and ")} -- both of which drive the blend ` +
       `directly rather than through the walk. The defect is filed, not unguarded.`);
}

// ---- 9. the record --------------------------------------------------------------------------------------
console.log("\n-- 9. the record");
{
    ok("frozen and stamped", Object.isFrozen(R) && R.at === "v4552");
    ok("!! the fix's own constants come from the class, not from the record",
       R.stepUpMax === Camera.STEP_UP_MAX && R.eyeSmoothRate === Camera.EYE_SMOOTH_RATE);
    ok("the round names what it did not close", R.notClosed.length >= 3);
    report("not closed: " + R.notClosed.join(" | "));
}

// ---- 10. wiring -----------------------------------------------------------------------------------------
console.log("\n-- 10. wiring");
{
    ok("_walkGroundAt exists and both call sites use it",
       typeof Camera.prototype._walkGroundAt === "function" &&
       (CAMCODE.match(/this\._walkGroundAt\(/g) || []).length >= 2);
    ok("the eye smoother is a METHOD update() calls, guarded by the mode, and it feeds camY",
       typeof Camera.prototype._stepRenderEye === "function" &&
       /this\._stepRenderEye\(dt\);/.test(CAMCODE) &&
       /if \(this\.mode !== "fp"\)/.test(CAMCODE) &&
       /let camY = this\._eyeRenderY;/.test(CAMCODE),
       "a method rather than six lines inside update(), so the gate drives what ships -- see section 4.");
    ok("!! the walk's ground has a NAME for a gate to hook, which is why playerGround stopped going blind",
       /_walkGroundAt\(x, z, feetY\)/.test(CAMCODE) &&
       /_walkGroundAt/.test(src("tools/ship/playerGround-selfcheck.mjs")));
}

console.log("\n" + (fails ? "FAIL " + fails : "PASS") + "  walkGround-selfcheck");
process.exit(fails ? 1 : 0);
