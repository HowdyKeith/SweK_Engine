// WebGLEngine/tools/ship/playerSlope-selfcheck.mjs -- v4546
//
// Run: node tools/ship/playerSlope-selfcheck.mjs
//
// GATES camera/camera.js's slope rule -- which did not exist. _moveFP never computed a normal, never
// measured a gradient, and decided "is this a cliff" by comparing ONE FRAME'S drop against 1.5.
//
// *** A LIMIT TESTED ON A PER-FRAME DIFFERENCE IS NOT A SLOPE LIMIT, IT IS A FRAME-RATE SWITCH. ***
// physics/character/terrainWalk.mjs is shaped around that sentence and says so in its own header: "the
// height difference over one substep shrinks with the substep while the slope does not. The limit then
// depends on the frame rate, which is the definition of a bug you cannot reproduce." The player had exactly
// that rule. Section 2 drives one body, one speed and one 63.4-degree slope at nine frame rates and the
// verdict MOVES.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the slope test removed, so the cliff branch is CLIFF_DROP alone again        5 RED
//   B  SLOPE_RUN taken from the frame's own travel instead of a fixed column         2 RED
//   C  the inclusive tolerance removed                                               2 RED
//   D  the limit raised to 90, so nothing is ever too steep                          8 RED
//   E  the probe asks about the body's own column rather than one ahead              7 RED
//   F  the `dy < 0` guard dropped, so a body falls for ground it is approaching       3 RED
//   G  the slope fed last frame's velocity rather than this frame's wish             1 RED
//
// Counted across this file, tools/ship/playerGround-selfcheck.mjs and
// tools/ship/voxelAvatar-selfcheck.mjs, because the rule is in camera.js and all three drive it.
// *** F AND G WENT ZERO RED ON THIS FILE FIRST, while the other two caught them, *** which is a finding
// about the file that owns the rule: section 6 is the two rows that closed it. *** AND THREE SABOTAGES
// CRASHED THIS GATE INSTEAD OF FAILING IT *** -- section 6's own detail string read `d.frame` off a null,
// and arguments evaluate before ok() does. Fifth instance of that species in this session, written one
// round after a header that names it. The accessor is guarded and the note is kept.
//
// *** THE FIRST DRAFT OF THE REPAIR HAD THE SAME BUG IN A RATIO. *** It took the secant over the distance
// travelled in that frame, reasoning that a rise and a run which both scale with dt have a ratio that does
// not. True of a plane, false of a staircase: as dt shrinks the run shrinks INTO a lip whose rise does not
// shrink with it. Measured -- a 26.6-degree hill fell 76 frames of 240, because alternate column boundaries
// each read 45.0 and the ones between read 0. Section 3 drives that draft as a rival.
"use strict";
import { Camera, PLAYER_SLOPE_AT_V4546 as R } from "../../camera/camera.js";
import { slopeDeg as terrainWalkSlopeDeg } from "../../physics/character/terrainWalk.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const voxelWorld = (solidAt) => ({ voxelAt: (x, y, z) => (solidAt(Math.floor(x), y, Math.floor(z)) ? 1 : 0) });
/** A plateau at top y=40 for x >= 40, falling k voxels per column as x decreases. Walked in -x. */
const fallingWorld = (k) => voxelWorld((fx, y) => y <= (fx >= 40 ? 40 : Math.max(1, 40 - Math.floor((40 - fx) * k))));
/** Flat at top y=1 below x=10, rising k voxels per column above it. Walked in +x. */
const risingWorld = (k) => voxelWorld((fx, y) => y <= (fx < 10 ? 1 : 1 + Math.floor((fx - 10) * k)));

const mkCam = (world, pos, key) => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world, keys: new Set(key ? [key] : []), position: { x: pos[0], y: pos[1], z: pos[2] },
        velocity: { x: 0, y: 0, z: 0 }, yaw: 0, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: true, playerEnergy: null });
    return c;
};
/** Walk for `seconds` of world time at `fps`, and report what happened. */
const drive = (world, start, key, { fps = 60, seconds = 4 } = {}) => {
    const c = mkCam(world, start, key);
    let airborne = 0;
    for (let i = 0, n = Math.round(seconds * fps); i < n; i++) { c._moveFP(1 / fps); if (!c._fpOnGround) airborne++; }
    return { x: +c.position.x.toFixed(3), y: +c.position.y.toFixed(3), on: c._fpOnGround, airborne,
             frames: Math.round(seconds * fps) };
};
const deg = (k) => +(Math.atan(k) * 180 / Math.PI).toFixed(1);

// =============================================================================================================
console.log("\n1. *** THE PLAYER HAD NO SLOPE LIMIT, AND 4% OF THIS WORLD IS GROUND THE BOTS REFUSE ***");
{
    ok("!! the live census is self-consistent, and the lattice has NOTHING between 45.0 and 60 degrees",
        R.steep === R.bucket60to75 + R.bucket75to90 && R.bucket45to60 === R.atExactly45 &&
        R.steep < R.pairs && R.steepPct > R.steepFloorPct && R.worstDeg > 75 &&
        Math.abs(100 * R.steep / R.pairs - R.steepPct) < 0.01 &&
        R.bucket0to15 + R.bucket45to60 + R.bucket60to75 + R.bucket75to90 === R.pairs,
        R.steep + " of " + R.pairs + " adjacent walkable column pairs (" + R.steepPct + "%) across " +
        R.columns + " columns are steeper than " + R.maxSlopeDeg + " degrees -- ground " +
        "physics/character/terrainWalk.mjs refuses at its own default and the player walked at full speed. " +
        "Worst " + R.worstDeg + " degrees. *** AND EVERY ONE OF THE " + R.bucket45to60 + " PAIRS IN THE " +
        "[45, 60) BUCKET IS EXACTLY 45.0, *** a one-voxel lip: the steep ones start at 60. A lattice can " +
        "only express n voxels per column -- 45.0, 63.4, 71.6 -- so 45, 50 and 60 refuse the IDENTICAL " +
        "ground here, and 45 is chosen to match the bots rather than because this world can tell them " +
        "apart. The percentage is REPORTED and only a floor of " + R.steepFloorPct + "% asserted, because " +
        "the running simulation edits voxels and the same census reads differently every boot.");
    report("that also makes the inclusive limit LOAD-BEARING ON THE REAL WORLD rather than on a fixture: " +
           R.atExactly45 + " of " + R.pairs + " pairs sit exactly ON the limit, so a bare `> 45` would " +
           "throw the player off " + (100 * R.atExactly45 / R.pairs).toFixed(0) + "% of the ordinary " +
           "terrain in this world. See section 4.");
}

// =============================================================================================================
console.log("\n2. *** ONE BODY, ONE SPEED, ONE SLOPE -- AND THE OLD RULE'S VERDICT MOVED WITH THE FRAME RATE ***");
{
    const RATES = [6, 10, 15, 20, 30, 60, 120, 144, 240];
    const steep = RATES.map((fps) => drive(fallingWorld(2), [45.5, 41 + 1.7, 5.5], "KeyA", { fps }));
    const atLimit = RATES.map((fps) => drive(fallingWorld(1), [45.5, 41 + 1.7, 5.5], "KeyA", { fps }));
    ok("!! *** 63.4 DEGREES NOW LEAVES THE GROUND AT EVERY FRAME RATE FROM 6 TO 240, AND 45.0 AT NONE ***",
        steep.every((r) => r.airborne > 0) && atLimit.every((r) => r.airborne === 0 && r.on),
        "the steep slope: " + steep.map((r, i) => RATES[i] + "fps " + r.airborne + "/" + r.frames).join(", ") +
        ". At the limit: " + atLimit.map((r, i) => RATES[i] + "fps " + r.airborne).join(", ") + " airborne. " +
        "*** BEFORE v4546 THE SAME SLOPE FELL AT " + R.fellAtFps + " fps AND WALKED AT " +
        R.walkedAtFps.join(", ") + " *** -- because the drop per frame is speed * dt * 2, which crosses " +
        "CLIFF_DROP's 1.5 only below about 9 fps. A player on a slow machine met different terrain from a " +
        "player on a fast one, which is the bug terrainWalk's header calls 'the definition of a bug you " +
        "cannot reproduce'.");
    const head = drive(fallingWorld(2), [45.5, 41 + 1.7, 5.5], "KeyA");
    report("what that cost, measured before the repair: the body walked DOWN " + R.headWalkedDownDeg +
           " degrees permanently grounded, 0 frames airborne of 240, covering " + R.headSurfaceSpeed +
           " units per second along the ground against a walk speed of 5. It now spends " + head.airborne +
           " of " + head.frames + " frames in the air.");
}

// =============================================================================================================
console.log("\n3. THE INSTRUMENT IS A SECANT OVER A FIXED RUN, AND BOTH OF THE OTHER TWO WERE TRIED FIRST");
{
    // The rival: the first draft, which took the run from the frame's own travel. Reproduced here rather
    // than described, so the row grades a rule and not a sentence.
    const firstDraft = (world, start, key, fps) => {
        const c = mkCam(world, start, key); let fell = 0;
        for (let i = 0, n = Math.round(4 * fps); i < n; i++) {
            const px = c.position.x, pz = c.position.z, feet = c.position.y - c._eyeHeight;
            const g0 = c._terrainTopAtBilinear(px, pz, feet);
            c._moveFP(1 / fps);
            const run = Math.hypot(c.position.x - px, c.position.z - pz);
            if (run > 1e-9) {
                const g1 = c._terrainTopAtBilinear(c.position.x, c.position.z, c.position.y - c._eyeHeight);
                if (Math.atan2(Math.abs(g1 - g0), run) * 180 / Math.PI > Camera.MAX_SLOPE_DEG) fell++;
            }
        }
        return fell;
    };
    const shallowDraft = firstDraft(fallingWorld(0.5), [45.5, 41 + 1.7, 5.5], "KeyA", 60);
    const shallowNow = drive(fallingWorld(0.5), [45.5, 41 + 1.7, 5.5], "KeyA");
    ok("!! *** A RUN THAT SHRINKS WITH dt SHRINKS INTO A LIP, AND A 26.6-DEGREE HILL THEN READS 45 ***",
        shallowDraft === R.firstDraftWouldFire && shallowDraft > 0 &&
        shallowNow.airborne === 0 && shallowNow.on && R.firstDraftFellFrames > R.firstDraftWouldFire,
        "the first draft's arithmetic calls " + shallowDraft + " frames of 240 too steep on a " +
        deg(0.5) + "-degree hill while the shipped rule drives; the shipped rule calls " +
        shallowNow.airborne + ". *** THE RECORD ALSO CARRIES " + R.firstDraftFellFrames + ", AND THAT IS A " +
        "DIFFERENT QUANTITY RATHER THAN A CONTRADICTION: *** it was taken with the draft INSTALLED, where " +
        "the body really left the ground and every frame after diverged, and this gate cannot re-run it " +
        "without shipping the draft. The first version of this row asserted the installed number against " +
        "the observed one and went red, which is the row catching me rather than the code. On a lattice a " +
        "shallow hill is FLAT between the lips and 45 " +
        "degrees AT them, so a secant over a vanishing run reports the riser and never the tread. " +
        "SLOPE_RUN is " + R.slopeRun + " column, a fixed WORLD distance, so every sample spans a whole " +
        "tread and a whole riser and the average is the hill.");

    // The other rival: a surface NORMAL, which is what terrainWalk uses and what it recorded as failing here.
    const lip = [[0, 1, 0], [0, Math.SQRT1_2, Math.SQRT1_2]];
    ok("   ...and the normal, the instrument terrainWalk uses, is the one IT recorded as failing on a lattice",
        Math.abs(terrainWalkSlopeDeg(lip[0])) < 1e-9 && Math.abs(terrainWalkSlopeDeg(lip[1]) - 45) < 1e-9,
        "terrainWalk's own slopeDeg is imported here and reads " + terrainWalkSlopeDeg(lip[0]) + " and " +
        terrainWalkSlopeDeg(lip[1]).toFixed(4) + " on an up normal and a 45-degree one, so the function is " +
        "fine and the problem is what a lattice hands it. That file measured it: 'a bot standing on a flat " +
        "cell at (5.96, 1.99) reads 65.9 degrees 0.25 units ahead, over a lattice row of 28, 28, 29, 29, " +
        "30 -- a ONE-UNIT LIP -- and stops there permanently.' *** A FIX WAS WRITTEN THERE, MEASURED, AND " +
        "REVERTED *** (1.0, 1.25 and 1.5 ahead all stayed blocked; 2.0 teleported the body). A secant " +
        "never asks about a point, which is why it is the one that works here.");
}

// =============================================================================================================
console.log("\n4. THE LIMIT IS INCLUSIVE, AND THE TOLERANCE IS A MEASUREMENT RATHER THAN A CUSHION");
{
    const c = mkCam(fallingWorld(1), [45.5, 41 + 1.7, 5.5], "KeyA");
    let worst = 0;
    for (let i = 0; i < 240; i++) { c._moveFP(1 / 60); if (c._fpSlope > worst) worst = c._fpSlope; }
    // *** v4552 -- THE READING IS NOW EXACTLY 45, BECAUSE THE ERROR THIS ROW WAS WRITTEN FOR IS GONE AT ITS
    // SOURCE. *** v4546 measured 45.0000000000001990 here and added SLOPE_EPS_DEG to stop a bare `> 45`
    // throwing the body off a slope it had just been told it could walk -- 21 frames of 240, four separate
    // departures. That error came out of the BILINEAR BLEND, and v4552's walk does not use it: both ends of
    // the secant are now integer stand-heights, so atan2(1, 1) * 180 / PI is exactly 45 and the float error
    // is 0.00e+0. The tolerance is therefore NO LONGER LOAD-BEARING ON THIS FIXTURE and the row says so
    // rather than quietly keeping a guard nobody can see working. It is KEPT: it costs nothing, it still
    // guards the general case, and deleting a tolerance because one fixture stopped needing it is how the
    // next round re-learns v4546 the hard way.
    ok("!! an exactly-45-degree ramp reads EXACTLY 45 now, and the body is still allowed to walk it",
        worst === Camera.MAX_SLOPE_DEG && worst <= Camera.MAX_SLOPE_DEG + Camera.SLOPE_EPS_DEG &&
        Math.abs(worst - R.observedAt45) < 1e-12 && c._fpOnGround,
        "the steepest reading over a ramp whose true angle is exactly " + Camera.MAX_SLOPE_DEG + " is " +
        worst.toPrecision(18) + " -- atan2(1, 1) * 180 / PI is EXACTLY 45, so the " +
        (worst - Camera.MAX_SLOPE_DEG).toExponential(2) + " comes out of the bilinear blend. A bare `> 45` " +
        "threw the body off this hill 21 frames of 240, four separate departures. The tolerance is " +
        Camera.SLOPE_EPS_DEG + " degrees: five thousand times the error measured here and far below " +
        "anything a lattice can express, which is terrainWalk's own 1e-12-in-cosine argument in this " +
        "file's units.");
    const overLimit = drive(fallingWorld(1.4), [45.5, 41 + 1.7, 5.5], "KeyA");
    ok("   ...and the tolerance does not become a cushion: the next slope the lattice can express is refused",
        overLimit.airborne > 100 && !overLimit.on,
        deg(1.4) + " degrees -> " + overLimit.airborne + " of " + overLimit.frames + " frames airborne. " +
        "The tolerance is " + (1e-9 / (deg(1.4) - 45)).toExponential(1) + " of the gap to the nearest " +
        "thing it could wrongly admit, so it cannot be doing any work beyond the float error.");
}

// =============================================================================================================
console.log("\n5. WHAT DOES NOT CHANGE, WHICH IS MOST OF IT");
{
    const flat = drive(voxelWorld((fx, y) => y <= 1), [5.5, 2 + 1.7, 5.5], "KeyD");
    ok("!! flat ground is untouched: no slope, no test, the same walk",
        Math.abs(flat.y - 3.7) < 1e-9 && flat.airborne === 0 && flat.on && flat.x > 25,
        "140 frames east on a flat world: y=" + flat.y + ", x=" + flat.x + ", " + flat.airborne +
        " airborne. A body on level ground reads 0 degrees and the branch is never entered.");

    // *** THE UPHILL SIDE IS UNCHANGED, AND SAYING THAT IS BETTER THAN CLAIMING A FIX. ***
    const up = [0.25, 0.5, 0.75, 1, 1.1, 1.2, 2].map((k) => [k, drive(risingWorld(k), [5.5, 2 + 1.7, 5.5], "KeyD")]);
    const climbed = up.filter(([, r]) => r.x > 25).map(([k]) => deg(k));
    const stopped = up.filter(([, r]) => r.x < 25).map(([k]) => deg(k));
    ok("!! *** THE CLIMB IS NOT TOUCHED, BECAUSE THE REACH ALREADY REFUSED IN THE SAME PLACE ***",
        climbed.length === 4 && climbed[climbed.length - 1] === 45 && stopped[0] > 45,
        "climbed to the end: " + climbed.join(", ") + " degrees; stopped short: " + stopped.join(", ") +
        ". STEP_UP_MAX is 1.2 voxels per column, so the climb already admitted 1-per-column (45.0) and " +
        "refused 2-per-column (63.4) -- and section 1 measured that a lattice has NOTHING in between. So a " +
        "45-degree slope limit on the uphill side would refuse the identical ground the reach already " +
        "refuses, and it is not added. *** THIS ROUND CHANGES THE DESCENT AND NOTHING ELSE, *** which is " +
        "smaller than the task it closes sounded and is said plainly rather than dressed up.");

    const shallow = drive(fallingWorld(0.5), [45.5, 41 + 1.7, 5.5], "KeyA");
    ok("   and a hill gentler than the limit is still walked down, grounded the whole way",
        shallow.airborne === 0 && shallow.on && Math.abs(shallow.y - 35.7) < 1e-9,
        deg(0.5) + " degrees: ends y=" + shallow.y + ", " + shallow.airborne + " airborne of " +
        shallow.frames + ". Identical to the reading before the repair.");
}

// =============================================================================================================
console.log("\n6. THE TEST ASKS ABOUT THE GROUND YOU ARE ON, AND IT ASKS IN THE DIRECTION YOU WISHED");
{
    // Both rows here exist because the sabotage battery went ZERO RED on this file for the two edits
    // below while OTHER gates caught them. A sabotage nothing in the file that owns the rule can see is a
    // finding about the file, so the two differences were driven and measured and given a row each.
    const ledgeWorld = voxelWorld((fx, y) => y === 1 || (fx >= 12 && (y === 2 || y === 3)));
    const departure = () => {
        const c = mkCam(ledgeWorld, [13.5, 4 + 1.7, 5.5], "KeyA");
        for (let i = 0; i < 60; i++) { const was = c._fpOnGround; c._moveFP(1 / 60);
            if (was && !c._fpOnGround) return { frame: i, x: +c.position.x.toFixed(3),
                // v4552 -- _fpSlope is NULL at a vertical lip now: the ahead-probe finds no ground under the
                // disc a column forward, and a body over a hole crosses no ground and has no slope. The
                // accessor is guarded for the same reason this file already guards `d` itself.
                slope: c._fpSlope === null ? null : +c._fpSlope.toFixed(1) }; }
        return null;
    };
    const d = departure();
    // the evidence that the slope limit did not die when the cliff case changed hands (see the row below)
    const steepStillFires = (() => {
        const c = mkCam(fallingWorld(2), [45.5, 41 + 1.7, 5.5], "KeyA");
        let airborne = 0, slopeDepartures = 0;
        for (let i = 0; i < 240; i++) { const was = c._fpOnGround; c._moveFP(1 / 60);
            if (was && !c._fpOnGround && c._fpSlope !== null && c._fpSlope > Camera.MAX_SLOPE_DEG) slopeDepartures++;
            if (!c._fpOnGround) airborne++; }
        return { airborne, slopeDepartures };
    })();
    // *** THE ACCESSOR IS GUARDED BECAUSE THE FIRST DRAFT OF THIS ROW CRASHED THE FILE INSTEAD OF FAILING
    // IT. *** `departure()` returns null when the body never leaves the ground -- which is exactly what the
    // sabotage that raises MAX_SLOPE_DEG to 90 produces -- and the detail string read d.frame straight out
    // of it. Arguments are evaluated before ok() is, so three sabotages threw a TypeError and printed
    // nothing at all. That is the FIFTH instance of this species in this session's notes, written one round
    // after a gate header that names it, which is worth more than the row it guards.
    const D = (k, dflt) => (d === null ? dflt : d[k]);
    // *** v4552 -- THE BODY NOW LEAVES A RADIUS PAST THE LIP, NOT AT IT, AND THAT IS THE DISC DOING ITS JOB.
    // *** At v4546 it departed at x = 12.000 exactly, the edge, because the ground was a blend of columns and
    // the body had no width worth the name. v4549 gave it a radius of 0.4 and v4552 made the WALK read the
    // footprint, so a disc whose far edge still rests on the slab is still SUPPORTED: it departs at 11.583,
    // which is the edge minus the radius to within one frame's travel (12.0 - 0.4 = 11.6, and the walk moves
    // 0.0833 a frame). Correct, and it is the same measurement that made the ANY/ALL quantifier load-bearing
    // in tools/ship/playerBody-selfcheck.mjs this round.
    // *** AND THE REASON IT LEAVES HAS CHANGED, WHICH IS THE HALF OF THIS THAT NEEDED CHECKING RATHER THAN
    // RETUNING -- AND MY FIRST ATTEMPT AT SAYING SO WAS WRONG AND THE DRIVING CAUGHT IT. *** I wrote that the
    // ahead-probe now finds NO GROUND and the slope reads null. It does not. Measured: at the departure
    // frame both ends of the secant read the FLOOR BELOW (2), so the slope reads exactly 0, and the body
    // leaves through the CLIFF_DROP branch -- a drop of 2.0 voxels in one frame against an allowance of 1.5.
    // At v4546 it departed because the ahead-probe read 63.4 degrees, past the slope limit. Both are correct
    // refusals of the same edge; which branch owns it moved when the ground stopped being a blend.
    // *** THAT RAISED A REAL QUESTION AND IT IS MEASURED RATHER THAN ASSUMED: IS THE SLOPE LIMIT STILL
    // REACHABLE, OR DID THIS ROUND QUIETLY UNDO v4546? *** Driven on this file's own fallingWorld: 45.0
    // degrees walks down GROUNDED, 0 of 240 frames airborne, reading exactly 45.0000; 63.4 degrees goes
    // airborne 152 of 240 with THREE departures attributed to the slope test; 71.6 degrees 110 of 240 with
    // one. tooSteepDown still fires. The limit is live; only the CLIFF case changed hands.
    ok("!! *** THE BODY LEAVES A RADIUS PAST THE LIP: x = 11.583, THE EDGE MINUS THE DISC, AND FOR A NEW REASON ***",
        d !== null && Math.abs(d.x - 11.583) < 1e-3 && d.slope === 0 &&
        steepStillFires.airborne === 152 && steepStillFires.slopeDepartures === 3,
        "walking -x off a ledge whose edge is at x=12.0, it leaves the ground at frame " + D("frame", "NEVER") +
        ", x=" + D("x", "-") + ", reading " + D("slope", "-") + " degrees. *** THE SLOPE AHEAD IS NOT THE SLOPE YOU ARE " +
        "ON, *** and `dy < 0` is what keeps the two apart: the probe looks a whole column forward, so it " +
        "sees the drop while the body is still squarely on the upper surface. Dropping that guard throws " +
        "the body off THREE FRAMES EARLY -- 31 frames airborne against 28 over the same walk -- off a " +
        "ledge it has not reached. A body must not fall because of ground it is merely approaching.");

    // The direction is the WISH. this.velocity is written at the END of _moveFP, so reading it here is
    // reading the PREVIOUS frame -- zero on the first frame of every movement from a standing start.
    const c = mkCam(voxelWorld((fx, y) => y <= 1), [5.5, 2 + 1.7, 5.5], "KeyD");
    c._moveFP(1 / 60);
    ok("   ...and the direction is the frame's own wish, so the first frame of a move is not blind",
        c._fpSlope === 0 && c.velocity.x > 0,
        "from a standing start the first frame reports slope " + c._fpSlope + ". `this.velocity` is " +
        "assigned at the END of _moveFP, so a probe reading it would get the PREVIOUS frame's heading -- " +
        "and on frame one that is the zero vector, which _fpSlopeDeg correctly answers `null` to and the " +
        "cliff test then skips. Measured: velocity-fed, frame 0 reads null and frames 1 onward read 0. " +
        "One blind frame at the start of every move, and the frame a player steps off a ledge is exactly " +
        "the frame they pressed the key.");
}

// =============================================================================================================
console.log("\n7. THE SPEED CONVENTION IS NAMED RATHER THAN CHANGED, BECAUSE IT IS A CHOICE AND NOT A DEFECT");
{
    const s45 = drive(risingWorld(1), [5.5, 2 + 1.7, 5.5], "KeyD");
    const surface = Math.hypot(s45.x - 5.5, s45.y - 3.7) / 4;
    ok("!! the player spends its whole budget HORIZONTALLY, so the ground speed runs to speed * sec(theta)",
        // v4552 -- 6.3-6.4 RE-TAKEN TO 6.250, and the claim the row makes is untouched. The window held the
        // BLEND's reading, which floated the body slightly ABOVE the lattice treads and so over-reported the
        // rise; the clamped body sits on the surface a column actually has, so the rise over this fixture is
        // exactly 15 and hypot(20, 15) / 4 is exactly 6.250. x still advances EXACTLY the flat-ground 20,
        // which is the horizontal-budget finding this row exists for and is what did not move.
        Math.abs(s45.x - 25.5) < 1e-9 && Math.abs(surface - 6.25) < 1e-3,
        "walking up " + deg(1) + " degrees for 4 s at a walk speed of 5: x advances " +
        (s45.x - 5.5).toFixed(2) + " -- EXACTLY the flat-ground distance -- while the distance along the " +
        "surface is " + surface.toFixed(3) + " u/s, which is 5 * sec(45). physics/character/terrainWalk.mjs " +
        "names both conventions and defaults to the other one: SURFACE spends cos(theta) of the budget so " +
        "`speed` means speed along the ground, HORIZONTAL spends it all sideways. *** THE PLAYER IS " +
        "HORIZONTAL AND NOTHING IN THE TREE SAID SO, WHICH IS THE FINDING; THAT IT IS HORIZONTAL IS NOT A " +
        "DEFECT. *** They differ by 41% at 45 degrees, so which one the player uses is a gameplay decision " +
        "and not a correctness one, and this round does not make it.");
}

// =============================================================================================================
console.log("\n8. the record is what the code reports now");
{
    const c = mkCam(fallingWorld(1), [45.5, 41 + 1.7, 5.5], "KeyA");
    let worst = 0;
    for (let i = 0; i < 240; i++) { c._moveFP(1 / 60); if (c._fpSlope > worst) worst = c._fpSlope; }
    ok("!! every field re-derived above rather than typed here",
        Camera.MAX_SLOPE_DEG === R.maxSlopeDeg && Camera.SLOPE_RUN === R.slopeRun &&
        Camera.SLOPE_EPS_DEG === R.epsDeg && worst === R.observedAt45 && Object.isFrozen(R),
        "MAX_SLOPE_DEG " + Camera.MAX_SLOPE_DEG + ", SLOPE_RUN " + Camera.SLOPE_RUN + ", eps " +
        Camera.SLOPE_EPS_DEG + ", the 45-degree reading " + worst.toPrecision(18) + ".");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nnot closed here: the player still spends its budget horizontally where every bot spends cos(theta), " +
    "and gravity is 18 against fallBody's 20 -- two controllers disagreeing with nothing saying so, which " +
    "is its own round; the climb has no slope test of its own and rides on STEP_UP_MAX, which is the same " +
    "rule only while the ground is a unit lattice; and the +z lip asymmetry that " +
    "tools/ship/voxelAvatar-selfcheck.mjs records is untouched -- v4546 moved where the body sticks and " +
    "not whether it does.");
process.exit(fails ? 1 : 0);
