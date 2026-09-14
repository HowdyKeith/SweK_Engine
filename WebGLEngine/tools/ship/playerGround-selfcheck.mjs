// WebGLEngine/tools/ship/playerGround-selfcheck.mjs -- v4545
//
// Run: node tools/ship/playerGround-selfcheck.mjs
//
// GATES camera/camera.js's ground query -- the controller the HUMAN drives, which until v4545 asked for the
// topmost solid in the column and took no account of where the body was.
//
// *** THE LAST FIVE ROUNDS WERE ABOUT BOTS. *** v4542 gave world/surfaceProbe.mjs's standHeightAt the body;
// v4543 did the same for meshes; v4544 gave the airborne half a fall. simulation/BotManager.js reads all
// three. The PLAYER reads none of them: camera/camera.js is a separate controller with its own gravity, its
// own step-up, its own cliff rule, its own collision test and its own ground query, and it had the defect
// v4542 repaired, untouched, on 54.8% of this world's columns.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the body argument dropped at the call site, topmost-in-column again      4 RED
//   B  the shim's isAir inverted                                               10 RED
//   C  the reach changed from STEP_UP_MAX to 0                                  7 RED
//   D  the bilinear sampler stops forwarding the body to its four corners       5 RED
//   E  a not-found made to fall back to the topmost rather than to 0            2 RED
//   F  STEP_UP_MAX read back as a literal inside _moveFP                        1 RED, the wiring row
//   G  the blend averages a NOT-FOUND corner in as 0 instead of dropping it     2 RED
//   H  _standYAt reports not-found as 0, so null never reaches the blend        2 RED
//
// None crashes. *** E AND F WENT ZERO ON THE FIRST BATTERY AND EACH ADDED A ROW. *** E was invisible
// because its only fixture was an EMPTY world, where the topmost scan ALSO answers 0 and the two arms agree
// by accident; section 5 now drives a body under a floating slab, which a fallback would teleport six
// voxels up through solid stone. F is NOT a defect -- swapping Camera.STEP_UP_MAX for the literal 1.2 in
// _moveFP changes no behaviour, because the wall branch it feeds cannot fire (section 8 measures that) --
// so the row for it is a WIRING row, anchored on the two functions' own text with comments stripped.
//
// *** THE REPAIR'S FIRST DRAFT DID NOT APPLY AT ALL AND EVERY FIXTURE WENT ON SHOWING THE DEFECT. *** It
// gated on hasVoxels(this.world) and called standHeightAt directly -- and the camera's world interface has
// always been `voxelAt` while surfaceProbe's is `isAir` plus `chunkHeight`, so the branch was never entered.
// A repair that silently does not apply to the worlds its own caller supports is "a check nothing reaches"
// in code. Section 5 drives the shim on a voxelAt-only world for exactly that reason.
//
// *** AND THE SECOND DRAFT SHIPPED THIS ROUND'S OWN DEFECT ONE METHOD OVER, WITH SIX SABOTAGES GREEN. ***
// The bilinear blend averaged a NOT-FOUND corner in as 0, which parked the body inside the floor and locked
// it there. Every fixture here walked UPHILL into a cave; none walked DOWN off anything, so the case never
// arose. What caught it was tools/ship/voxelAvatar-selfcheck.mjs -- a gate in another round's subject,
// green at HEAD and red here -- which the ship ritual's SWEEP ROTATION brought back under the 3,000 ms
// budget in this same round. Section 9 is that defect, and G and H are its sabotages.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Camera, PLAYER_GROUND_AT_V4545 as R } from "../../camera/camera.js";
import { standablesAt } from "../../world/surfaceProbe.mjs";
import { census as recordCensus, sources as recordSources, RECORD_RE } from "./frozenRecords.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

/** A world the CAMERA supports: voxelAt only, no isAir and no chunkHeight. */
const voxelWorld = (solidAt) => ({ voxelAt: (x, y, z) => (solidAt(Math.floor(x), y, Math.floor(z)) ? 1 : 0) });

/** A cave with a rising floor under a hill cap -- the fixture that separates a frozen body from a walking one. */
const caveWorld = voxelWorld((fx, y) => {
    if (fx < 10) return y === 0;
    const floorTop = Math.floor((fx - 10) / 4);
    return y <= floorTop || y === 8 || y === 9 || y === 20;
});

/** A two-voxel ledge: floor at 2 below x=12, ledge top at 4 from x=12 up. Walked DOWN, in -x. */
const ledgeWorld = voxelWorld((fx, y) => y === 1 || (fx >= 12 && (y === 2 || y === 3)));

const mkCam = (world, pos, key = "KeyD") => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world, keys: new Set(key ? [key] : []), position: { x: pos[0], y: pos[1], z: pos[2] },
        velocity: { x: 0, y: 0, z: 0 }, yaw: 0, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: true, playerEnergy: null });
    return c;
};
const walk = (world, pos, frames) => {
    const c = mkCam(world, pos);
    for (let f = 0; f < frames; f++) c._moveFP(1 / 60);
    return { x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(3), onGround: c._fpOnGround };
};

// =============================================================================================================
console.log("\n1. *** THE TOPMOST SOLID IS NOT WHERE A BODY STANDS, AND ONE y PER COLUMN CANNOT SAY SO ***");
{
    ok("!! the live census is self-consistent, and the right-answer count IS the column count",
        R.topmostRight === R.columns && R.topmostRight < R.bodyPlaces &&
        Math.abs(100 * R.topmostRight / R.bodyPlaces - R.topmostRightPct) < 0.01 &&
        R.multiSurface < R.columns && R.multiSurfacePct > R.multiSurfaceFloorPct &&
        Math.abs(100 * R.multiSurface / R.columns - R.multiSurfacePct) < 0.1 && R.worstGap > 8,
        R.multiSurface + " of " + R.columns + " columns (" + R.multiSurfacePct + "%) hold more than one " +
        "place a body can stand, giving " + R.bodyPlaces + " such places; the topmost answer is right in " +
        R.topmostRight + " of them (" + R.topmostRightPct + "%) -- *** EXACTLY THE COLUMN COUNT, WHICH IS " +
        "THE FINDING RATHER THAN A COINCIDENCE. *** Worst gap " + R.worstGap + " voxels. The percentage is " +
        "REPORTED and only a floor of " + R.multiSurfaceFloorPct + "% is asserted, because the running " +
        "simulation edits voxels and the same census reads differently every boot.");
    report("the scan also started at y=" + R.scannedFrom + " on a world whose chunkHeight is " +
           R.worldChunkHeight + ". That is NOT a defect and is checked in section 6: the loop's own " +
           "`v !== undefined` guard skips the out-of-range reads that make this world answer SOLID above " +
           "its own ceiling.");
}

// =============================================================================================================
console.log("\n2. *** THE SYMPTOM IS NOT A TELEPORT. THE PLAYER GETS STUCK IN A CAVE. ***");
{
    const surfaces = standablesAt({ chunkHeight: 64, isAir: (x, y, z) => caveWorld.voxelAt(x, y, z) === 0 }, 15, 5);
    const far = walk(caveWorld, [5.5, 1 + 1.7, 5.5], 260);
    ok("!! *** THE BODY FOLLOWS THE CAVE FLOOR UP INSTEAD OF STOPPING DEAD FOUR UNITS IN ***",
        far.x > R.stuckAtX + 10 && Math.abs(far.x - R.repairedX) < 0.05 &&
        Math.abs(far.y - R.repairedY) < 0.05 && surfaces.length > 1,
        "walking east into a cave whose floor rises one voxel every four units, 260 frames: the body ends " +
        "at x=" + far.x + ", y=" + far.y + ", having tracked 2.70 -> 3.70 -> 4.70 -> 5.70 -> 6.70. Before " +
        "the repair it stopped at x=" + R.stuckAtX + ", y=" + R.stuckAtY + " AND STAYED THERE. *** IT IS " +
        "NOT MERELY THE HEIGHT THAT FROZE: *** _moveFP's `dy > STEP_UP_MAX` guard held, so the body was " +
        "never lifted onto the hillside -- it kept the height it entered with, the rising floor grew into " +
        "it, and _canStandAt then refused every further move. A frozen body in a cave is a STUCK PLAYER.");
    report("the column at x=15 is standable at " + surfaces.join(", ") + " -- the cave floor, the top of " +
           "the cave's roof and the hilltop, THREE places a body fits in one column -- and the topmost " +
           "query named the hilltop for all three.");
}

// =============================================================================================================
console.log("\n3. the guard that said this was unreachable, and the test it named");
{
    // The cave floor at x=15 is y=2: floor((15-10)/4) = 1, so voxels 0 and 1 are solid and 2..7 are air.
    // Every expected value in this file is derived from caveWorld's own arithmetic, because the first draft
    // of this gate carried expectations from a scratch fixture whose floor was one voxel lower and FOUR ROWS
    // WENT RED AGAINST CORRECT CODE. A gate that asserts a number it did not derive grades the fixture.
    const c = mkCam(caveWorld, [15.5, 2 + 1.7, 5.5], null);
    const standsInCave = c._canStandAt(15.5, 2 + 1.7, 5.5);
    ok("!! *** _canStandAt RETURNS TRUE AT A CAVE FLOOR, SO IT NEVER BLOCKED THE MOVE THE GUARD CREDITED IT WITH ***",
        standsInCave === true,
        "the guard's comment read '_canStandAt already blocked the XZ move, so this should be unreachable. " +
        "Defensive: stay.' -- and it is " + standsInCave + " here. The branch was reachable on " +
        R.multiSurfacePct + "% of columns and the comment had been wrong since it was written. A defensive " +
        "branch with a false reason is worse than no branch: it tells the next reader not to look.");
}

// =============================================================================================================
console.log("\n4. the reach is the WALKING allowance, and it is one number rather than two that must agree");
{
    const c = mkCam(caveWorld, [15.5, 0, 5.5], null);
    const feetOnFloor = c._terrainTopAt(15, 5, 2);
    ok("!! the body-aware query answers the cave floor where the bodyless one answers the hilltop",
        c._terrainTopAt(15, 5) === 21 && feetOnFloor === 2 && Camera.STEP_UP_MAX === R.stepUpMax,
        "bodyless " + c._terrainTopAt(15, 5) + ", body-aware with feet at 2 -> " + feetOnFloor + ". The " +
        "reach is Camera.STEP_UP_MAX = " + Camera.STEP_UP_MAX + " because this is the WALKING query -- a " +
        "walker may step up -- where physics/character/fallBody.mjs's FALLING query takes no reach at all, " +
        "and v4544's note is entirely about that difference. It is a static now, read by _moveFP's own " +
        "rule and by the probe's reach, which are the same question asked twice.");
    const onRoof = c._terrainTopAt(15, 5, 10), justAbove = c._terrainTopAt(15, 5, 11);
    ok("   ...and a body on the roof's top is told the roof's top, from on it and from just above it",
        onRoof === 10 && justAbove === 10,
        "feet at 10 -> " + onRoof + ", feet at 11 -> " + justAbove + ", against " + c._terrainTopAt(15, 5) +
        " bodyless. ONE QUERY, THREE BODIES IN ONE COLUMN, THE SURFACE EACH IS ACTUALLY ON: the thing a " +
        "single y per column cannot do however good it is. The second reading is the reach doing its work " +
        "-- a body a voxel clear of the roof is still told the roof, because " + Camera.STEP_UP_MAX + " of " +
        "step-up is scanned from before the descent starts.");
}

// =============================================================================================================
console.log("\n5. *** IT WORKS ON A voxelAt-ONLY WORLD, WHICH THE FIRST DRAFT DID NOT ***");
{
    const c = mkCam(caveWorld, [15.5, 0, 5.5], null);
    const hasNeither = caveWorld.isAir === undefined && caveWorld.chunkHeight === undefined;
    ok("!! *** THE FIXTURE SUPPLIES NEITHER isAir NOR chunkHeight, AND THE BODY-AWARE PATH STILL RUNS ***",
        hasNeither && c._terrainTopAt(15, 5, 2) === 2 && c._terrainTopAt(15, 5) === 21,
        "the camera's world interface has always been `voxelAt`; world/surfaceProbe.mjs's is `isAir` plus " +
        "`chunkHeight`. The first draft gated on hasVoxels(this.world) and was therefore NEVER ENTERED -- " +
        "every fixture in this file went on showing the defect while the repair sat there looking correct. " +
        "*** A REPAIR THAT SILENTLY DOES NOT APPLY IS 'A CHECK NOTHING REACHES', IN CODE. *** A four-line " +
        "shim adapts one interface to the other, so the gated rule runs and no third copy of it is written.");
    ok("   a column with nothing under the body answers 0, which is what it always answered",
        mkCam(voxelWorld(() => false), [0, 5, 0], null)._terrainTopAt(0, 0, 5) === 0,
        "an empty world: 0 either way, so _moveFP's cliff branch sees the same very negative dy it saw " +
        "before and falls exactly as it did. The not-found answer is not a new invention.");
    // *** THE ROW ABOVE CANNOT SEE THE not-found FALLBACK, AND THE SABOTAGE BATTERY IS WHAT SAID SO. ***
    // Sabotage E -- `return found === null ? 0 : found` changed to fall through to the topmost scan -- went
    // ZERO RED against it, because an EMPTY world's topmost scan also answers 0, so both arms agree by
    // accident. The discriminating fixture is a column that is not empty and still has nothing standable
    // UNDER the body: a slab hanging overhead with open air beneath it.
    {
        const slab = voxelWorld((fx, y) => y === 5 || y === 6);
        const u = mkCam(slab, [3.5, 0, 3.5], null);
        ok("!! a body under a floating slab is told 0 and FALLS, not the top of the thing over its head",
            u._terrainTopAt(3, 3, 1) === 0 && u._terrainTopAt(3, 3) === 7,
            "feet at 1 with a slab at 5-6 overhead: body-aware " + u._terrainTopAt(3, 3, 1) + ", bodyless " +
            u._terrainTopAt(3, 3) + ". *** A not-found THAT FELL BACK TO THE TOPMOST WOULD TELEPORT THAT " +
            "BODY SIX VOXELS UP THROUGH A SOLID SLAB, *** which is the defect this round is about, wearing " +
            "a fallback's clothes. 0 is what an empty column always answered and it is what this one " +
            "answers: the cliff branch sees a very negative dy and gravity takes it.");
    }
}

// =============================================================================================================
console.log("\n6. what does NOT change, which is what lets this ship");
{
    const flat = voxelWorld((fx, y) => y === 0);
    const before = walk(flat, [5.5, 1 + 1.7, 5.5], 140);
    const c = mkCam(flat, [5.5, 0, 5.5], null);
    const guarded = c._terrainTopAt(5, 5);
    ok("!! open ground is untouched -- the common case walks exactly as it did",
        Math.abs(before.y - 2.7) < 1e-9 && before.onGround === true && before.x > 17,
        "a flat world, 140 frames east: y=" + before.y + ", onGround=" + before.onGround + ", x=" +
        before.x + ". Every column with ONE surface answers the same thing either way, by construction: " +
        "the body-aware scan and the topmost scan meet at the only surface there is.");
    ok("   and the out-of-range reads above the world's ceiling are still skipped, not believed",
        guarded === 1,
        "the loop scans from y=" + R.scannedFrom + " on a world whose chunkHeight is " + R.worldChunkHeight +
        ", and v4553 measured that this world answers SOLID above its own ceiling because Chunk.index() has " +
        "no range check. The `v !== undefined` guard skips it. *** THAT IS A GUARD AND NOT LUCK, *** and it " +
        "is checked here because a reader who tidies the condition would re-open a defect filed elsewhere.");
}

// =============================================================================================================
console.log("\n7. the record is what the code reports now");
{
    const far = walk(caveWorld, [5.5, 1 + 1.7, 5.5], 260);
    ok("!! every field re-derived above rather than typed here",
        Math.abs(far.x - R.repairedX) < 0.05 && Math.abs(far.y - R.repairedY) < 0.05 &&
        Camera.STEP_UP_MAX === R.stepUpMax && Object.isFrozen(R),
        "cave walk ends " + far.x + "/" + far.y + " against a record of " + R.repairedX + "/" + R.repairedY +
        "; STEP_UP_MAX " + Camera.STEP_UP_MAX + ".");
}

// =============================================================================================================
console.log("\n8. ONE number, read live by both -- and what that number turns out to be FOR");
{
    // Read from the FUNCTIONS' OWN TEXT with comments stripped, not from a file window and not from prose.
    // v4544 shipped a wiring row anchored on a comment that the same round rewrote, and then on a 900-char
    // window the repair pushed to 2,585; both are the same mistake, so the anchor here is the function.
    const bare = (f) => f.toString().replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    const walkAssigns = bare(Camera.prototype._moveFP).match(/STEP_UP_MAX\s*=\s*[^;]+/g) || [];
    // The reach is spelled ONCE, as _standYAt's default, and every probe reaches the world through it.
    // *** v4548 MADE IT A PARAMETER AND THAT IS A STRONGER STATEMENT, NOT A WEAKER ONE. *** A falling body
    // must get NO reach -- the walking allowance belongs to the walker -- so there is now exactly one caller
    // that overrides the default, and it passes 0, and it is the fall. The row checks the default, the
    // count of overrides, and that the only override is zero: a second override, or a non-zero one, is a
    // second policy about the same number and reddens this.
    const probeSig    = bare(Camera.prototype._standYAt).match(/reach\s*=\s*([A-Za-z_.]+)/) || [];
    const probeReach  = bare(Camera.prototype._standYAt).match(/stepUp\s*:\s*[^ ,}]+/g) || [];
    const overrides   = ["_moveFP", "_moveKaijuDrive", "_fallSurface", "_terrainTopAt", "_terrainTopAtBilinear"]
        .flatMap((m) => (bare(Camera.prototype[m]).match(/_(?:standYAt|terrainTopAt|terrainTopAtBilinear)\([^)]*,\s*(-?[\w.]+)\s*\)/g) || [])
            .filter((c) => /,\s*-?[\d]/.test(c)).map((c) => m + ": " + c.trim()));
    ok("!! the reach is Camera.STEP_UP_MAX once, and the only caller that overrides it passes ZERO",
        walkAssigns.length === 1 && /=\s*Camera\.STEP_UP_MAX\s*$/.test(walkAssigns[0]) &&
        probeSig[1] === "Camera.STEP_UP_MAX" && probeReach.length === 1 && probeReach[0] === "stepUp: reach" &&
        overrides.length === 1 && /,\s*0\s*\)/.test(overrides[0]) && /_fallSurface/.test(overrides[0]),
        "_moveFP: `" + walkAssigns.join(" | ") + "`; _standYAt(x, z, fromY, reach = " + probeSig[1] +
        ") and `" + probeReach.join(" | ") + "`; overrides: " + (overrides.join(", ") || "none") + ". *** THE " +
        "ONE OVERRIDE IS THE FALL, AND IT IS ZERO, *** which is physics/character/fallBody.mjs's rule -- " +
        "'the walking allowance belongs to the walker' -- applied here at v4548. Two copies of a number " +
        "that must agree is the shape v4542 removed from BotManager.");

    // ...and read LIVE, which a text match cannot say. Both are re-driven with the static moved.
    const keep = Camera.STEP_UP_MAX;
    const probeAt = (m) => { Camera.STEP_UP_MAX = m;
        const r = mkCam(caveWorld, [19.5, 0, 5.5], null)._terrainTopAt(19, 5, 2); Camera.STEP_UP_MAX = keep;
        return r; };
    const oneFrame = (m) => { Camera.STEP_UP_MAX = m;
        const c = mkCam(caveWorld, [15.5, 1 + 1.7, 5.5], null); c._moveFP(1 / 60);
        Camera.STEP_UP_MAX = keep; return +c.position.y.toFixed(4); };
    // v4552 -- oneFrame(0.5) RE-TAKEN, 1.7 -> 2.7, and the row's claim is untouched by the move. Under the
    // blend a half-voxel reach put the body's feet at 0.0; under the clamp they land at 1.0, because
    // _stepTargetAt names a SURFACE a column has rather than an average of four. The row asserts that
    // moving the static moves the behaviour -- 3.7 against 2.7 still says so, and says it about a legal
    // pair of heights rather than one legal and one invented.
    ok("!! moving the static moves the behaviour, so neither site holds a copy of the value",
        probeAt(1.2) === 3 && probeAt(0) === 0 && oneFrame(1.2) === 3.7 && oneFrame(0.5) === 2.7 &&
        oneFrame(1.2) !== oneFrame(0.5) && Camera.STEP_UP_MAX === keep,
        "the column at x=19 stands at 3 and its floor is one voxel above x=15's: with the reach at 1.2 a " +
        "body with feet at 2 is told " + probeAt(1.2) + " and steps up, with the reach at 0 it is told " +
        probeAt(0) + " -- nothing in range -- and stays. Driven through _moveFP for one frame from the same " +
        "body: " + oneFrame(1.2) + " against " + oneFrame(0.5) + ". The static is restored after each.");

    // What the number is actually FOR, measured rather than assumed.
    // *** v4552 -- THIS HOOK WAS ON _terrainTopAtBilinear AND THE WALK STOPPED CALLING IT, SO THE ROW READ
    // -Infinity RATHER THAN FAILING. *** An instrument going blind is the vacuous-by-construction species on
    // the GATE's own side of the fence, and it is why the walk's ground now has a NAME -- _walkGroundAt --
    // for a gate to hook rather than a method the walk merely happened to use. The row is re-pointed, not
    // relaxed: it still measures the largest rise the wall branch ever sees, and the number it measures is
    // now BIGGER and more honest (1.000000, a whole lip, against the blend's 0.083333).
    const maxDy = (world, start) => {
        const c = mkCam(world, start); let m = -Infinity, fired = 0;
        const real = Camera.prototype._walkGroundAt;
        c._walkGroundAt = function (x, z, fy) {
            const g = real.call(this, x, z, fy);
            if (g !== null) {
                const d = g - (this.position.y - this._eyeHeight);
                if (d > m) m = d; if (d > Camera.STEP_UP_MAX) fired++;
            }
            return g; };
        for (let f = 0; f < 260; f++) c._moveFP(1 / 60);
        return { m: +m.toFixed(6), fired };
    };
    const cave = maxDy(caveWorld, [5.5, 1 + 1.7, 5.5]);
    ok("!! *** THE WALL BRANCH NEVER FIRES, AND AFTER THIS ROUND IT CANNOT: dy <= STEP_UP_MAX BY ARITHMETIC ***",
        cave.fired === 0 && cave.m <= Camera.STEP_UP_MAX && cave.m > 0,
        "over the 260-frame climb of four voxels in section 2 the largest rise `dy > STEP_UP_MAX` ever saw " +
        "was " + cave.m + " against an allowance of " + Camera.STEP_UP_MAX + ", and it fired " + cave.fired +
        " times. It is not luck and not the fixture: _terrainTopAt is GIVEN the feet and cannot answer more " +
        "than the reach above them, the blend of four such corners is bounded by the same number, and both " +
        "read the same number -- so the inequality is closed. *** THE LOAD-BEARING USE OF THIS CONSTANT IS " +
        "THE PROBE'S REACH, NOT THE WALKER'S WALL, *** which is why sabotage C reddens two rows and the " +
        "wall branch's own literal reddens none. The branch keeps its `else` and loses its false reason.");
}

// =============================================================================================================
console.log("\n9. *** THE BLEND AVERAGED A COLUMN THIS BODY CANNOT STAND IN AS ZERO, AND THAT IS A STUCK PLAYER ***");
{
    // *** THIS ROUND SHIPPED THE DEFECT THIS ROUND IS ABOUT, ONE METHOD OVER, AND SIX SABOTAGES DID NOT SEE
    // IT. *** What saw it was tools/ship/voxelAvatar-selfcheck.mjs -- green at HEAD, red here -- which the
    // ship ritual's sweep rotation brought back under budget in the same round. Every fixture in this file
    // walks UPHILL into a cave; none of them walked DOWN off anything, so the case where a corner column
    // has no surface within the body's reach never arose.
    const c = mkCam(ledgeWorld, [11.75, 1.5 + 1.7, 5.5], null);
    const corners = [c._standYAt(11, 5, 1.5), c._standYAt(12, 5, 1.5)];
    const blend = c._terrainTopAtBilinear(11.75, 5.5, 1.5);
    ok("!! *** A WALL IS NOT A HOLE: the corner that answers NOTHING is dropped, not averaged in as 0 ***",
        corners[0] === 2 && corners[1] === null && Math.abs(blend - 2) < 1e-9,
        "at x=11.75 with the feet at 1.5 the floor column answers " + corners[0] + " and the ledge column " +
        "answers " + corners[1] + " -- NOT-FOUND, because the ledge's own surface at 4 is above this " +
        "body's reach. Read as 0 and weighted at 0.25 that is " + (2 * 0.75).toFixed(2) + ", so targetY " +
        "lands the feet INSIDE THE FLOOR, dy is 0 so the body reads as GROUNDED, and _canStandAt then " +
        "refuses every further step. The blend renormalises over the corners that answered and gets " +
        blend.toFixed(4) + ". null and 0 are different answers and _standYAt exists to keep them apart.");

    const at = (n) => { const k = mkCam(ledgeWorld, [13.5, 4 + 1.7, 5.5], "KeyA");
        for (let i = 0; i < n; i++) k._moveFP(1 / 60);
        return { x: +k.position.x.toFixed(2), y: +k.position.y.toFixed(2), onGround: k._fpOnGround }; };
    const mid = at(30), end = at(120);
    // *** v4546 CHANGED HOW THIS DESCENT HAPPENS AND NOT WHETHER IT DOES. *** A two-voxel drop over one
    // column is 63.4 degrees, past the new slope limit, so the body now LEAVES the ledge and falls where
    // it used to glide down it. The endpoint is the same to the centimetre; only the middle differs, and
    // this row asserts the endpoint plus the leaving, because the endpoint is what "completes" means and
    // the leaving is what v4546 did. Before v4545 it completed NOTHING: it parked at the lip for good.
    ok("!! and the walk DOWN the ledge completes instead of locking at the lip",
        !mid.onGround && mid.y < 5.7 && mid.y > 4.7 &&
        Math.abs(end.y - 3.7) < 1e-9 && end.x < 4 && end.onGround,
        "walking -x off a two-voxel ledge: 5.70 -> " + mid.y + " airborne at 30 frames -> " + end.y +
        " grounded, reaching x=" + end.x + " in 120. The unfixed blend parked the sandbox's own avatar at " +
        "z=3.250, y=3.200 and it never moved again for as long as the walk ran -- THE STUCK PLAYER v4545 " +
        "IS ABOUT, re-introduced by its own repair. A genuine hole still falls: every corner null gives 0, " +
        "and 0 is what the cliff branch has always been handed.");

    // *** v4546 TOOK HALF OF THIS SECTION'S COVERAGE AWAY, AND THE BATTERY IS WHAT SAID SO. *** Sabotages G
    // and H went from 2 RED to 1 the moment the slope limit landed: a not-found corner means a column whose
    // surface is out of the body's 1.2 reach, which over one column is steeper than 50 degrees, which is
    // past the 45-degree limit -- so the body now LEAVES the ledge before the broken blend can park it.
    // Driven rather than argued: with the blend sabotaged, ledges of 1, 2, 3, 4, 6 and 10 voxels ALL let
    // the body get away, every one. The masking is structural and no ledge fixture can undo it.
    // The defect is still there, so the fixture moves to where the body stays GROUNDED and the blend still
    // governs: walking INTO A WALL, where the wall column is not-found and the body is held by _canStandAt
    // rather than dropped. That is also the defect's other face -- it SINKS the body as well as locking it.
    {
        const wallWorld = voxelWorld((fx, y) => y <= 1 || (fx >= 12 && y >= 2 && y <= 6));
        const w = mkCam(wallWorld, [9.5, 2 + 1.7, 5.5]);
        for (let i = 0; i < 90; i++) w._moveFP(1 / 60);
        // v4549 -- the body has a RADIUS now, so it stops 0.4 short of the wall face rather than pressing
        // its centre against it. The row is about the HEIGHT, which is unchanged and is what the v4545
        // blend defect moved; the x bound tracks Camera.BODY_RADIUS so it cannot drift silently.
        ok("!! a body walked into a wall stands ON the floor at the wall, not a voxel inside it",
            Math.abs(w.position.y - 3.7) < 1e-9 && w._fpOnGround &&
            Math.abs((12 - w.position.x) - Camera.BODY_RADIUS) < 0.1,
            "floor top y=2, a five-voxel wall at x=12, 90 frames of walking into it: the body ends at x=" +
            w.position.x.toFixed(3) + " -- " + (12 - w.position.x).toFixed(3) + " from the face, which is " +
            "its radius of " + Camera.BODY_RADIUS + " -- at y=" + w.position.y.toFixed(3) + ". With the not-found corner " +
            "averaged in as 0 it ends at x=11.500, y=2.700 -- *** HALF A UNIT SHORT OF THE WALL AND A " +
            "WHOLE VOXEL INSIDE THE FLOOR, *** standing there for as long as the walk runs. This row " +
            "exists because v4546's slope limit rescued the ledge fixture that used to catch it.");
    }
}

// =============================================================================================================
console.log("\n10. *** THIS ROUND'S OWN RECORD IS INVISIBLE TO THE RECORD CENSUS, AND THAT IS A DEFECT ***");
{
    // Found by the PRE-FLIGHT'S SILENCE rather than by its red: tools/ship/frozenRecords-selfcheck.mjs and
    // tools/ship/recordReach-selfcheck.mjs both stayed green through a round that added a version-stamped
    // frozen record, which is the one thing they exist to notice. frozenRecords.census() walks the tree with
    // treeRead, whose SOURCE_EXT is /\.(mjs|cjs|js)$/ -- and then narrows to `.mjs` alone before looking for
    // records. PLAYER_GROUND_AT_V4545 lives in camera/camera.js, so the census cannot see it.
    const RE = new RegExp(RECORD_RE.source, "g");
    const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const jsFiles = recordSources(ENG).filter((f) => /\.(js|cjs)$/.test(f) && !/\.mjs$/.test(f));
    const inJs = [];
    for (const f of jsFiles) {
        const t = fs.readFileSync(f, "utf8");
        for (const m of t.matchAll(RE))
            inJs.push({ name: m[1], file: path.relative(ENG, f).split(path.sep).join("/") });
    }
    const seen = new Set(recordCensus().records.map((r) => r.name));
    const missed = inJs.filter((r) => !seen.has(r.name));

    // *** v4546 MADE IT FOUR, AND THIS ROW WENT RED THE MOMENT THE RECORD LANDED, WHICH IS THE POINT. ***
    // It was written at v4545 to go red the day somebody FIXES the hole; it also goes red the day somebody
    // WIDENS it, and the next round to add a record beside its code found that out within the hour. Both
    // directions are the row doing its job: the number is pinned, so the hole cannot change size in silence.
    // SIX ROUNDS RUNNING NOW -- v4546 made it four, v4548 five, v4549 six, v4550 seven and v4552 eight -- which is the
    // strongest argument the pin could have made for itself: every round that writes a record beside
    // camera.js widens a hole the record censuses cannot see, and the only thing that says so is this row.
    // *** AND AT v4550 IT CAUGHT A CLAIM RATHER THAN A RECORD. *** That round read this red as one of its
    // own sabotages being caught and wrote so in a gate header; it is not, it fires with or without the
    // sabotage, and the header was corrected before the round shipped. A row that reddens on every run of
    // a neighbouring experiment will be mistaken for that experiment's signal, which is worth the line.
    ok("!! *** THE HOLE IS EIGHT RECORDS WIDE AND TWO OF THEM PREDATE THIS SESSION BY A HUNDRED VERSIONS ***",
        missed.length === 8 && missed.every((r) => /\.(js|cjs)$/.test(r.file)) &&
        missed.some((r) => r.name === "WALK_GROUND_AT_V4552") &&
        missed.some((r) => r.name === "PLAYER_WATER_AT_V4550") &&
        missed.some((r) => r.name === "PLAYER_BODY_AT_V4549") &&
        missed.some((r) => r.name === "PLAYER_GROUND_AT_V4545") &&
        missed.some((r) => r.name === "PLAYER_SLOPE_AT_V4546") &&
        missed.some((r) => r.name === "CAMERA_FALL_AT_V4548") &&
        missed.some((r) => r.name === "ADDED_AT_V4403") &&
        missed.some((r) => r.name === "MEASURED_AT_V4463") && jsFiles.length > 1000,
        missed.map((r) => r.name + " (" + r.file + ")").join(", ") + " -- " + missed.length + " records in " +
        jsFiles.length + " .js/.cjs files the walk DOES visit, dropped by `list.filter(/\\.mjs$/)` one line " +
        "before the record search. ADDED_AT_V4403 and MEASURED_AT_V4463 have been outside every headline " +
        "that module has ever published, including the +7 sweep it was built for. *** THIS ROW ASSERTS A " +
        "DEFECT RATHER THAN A PROPERTY, AND IT IS WRITTEN TO GO RED THE DAY SOMEBODY FIXES IT. ***");

    // 117 at v4545, 118 at v4547: AGREEMENT_AT_V4547 landed in a .mjs, so the census CAN see it and the
    // pinned number moved by exactly one. That is the .mjs/.js line this row is about, drawn from the
    // other side -- a record beside camera.js is invisible and a record in tools/ship/ is not.
    ok("   ...and it is not repaired HERE, because the one-word fix reddens a replay of an OLD commit",
        recordCensus().records.length === 118,
        "widening that filter to /\\.(mjs|js)$/ was driven at v4545: 117 records -> 120, 273 fields -> 284, " +
        "1,687 ms against a 3,000 ms budget, and PLAYER_GROUND_AT_V4545 comes back correctly attributed to " +
        "this gate while MEASURED_AT_V4463 comes back guarded by stereoPanini-selfcheck. It also turns " +
        "frozenRecords-selfcheck RED in three rows, and the first of them is the instructive one: the sweep " +
        "row replays the record population at commit 75f0c033, and under the wider rule today's tree holds " +
        "76 records that existed there against the 74 THE REPLAY COUNTS -- *** BECAUSE THE REPLAY WAS TAKEN " +
        "WITH THE NARROW RULER TOO. *** Closing this means re-taking that replay at that commit, which is a " +
        "round with its own gate and not a line in a round about a camera. The number above is pinned so " +
        "this row cannot quietly stop being about anything.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here. *** EVERY ITEM THIS LINE USED TO CARRY IS NOW CLOSED, AND THE LINE IS REWRITTEN " +
    "RATHER THAN APPENDED TO: *** the slope limit at v4546, the two controllers' gravity at v4547, the " +
    "third copy of the vertical logic at v4548, the body's radius at v4549 and the water predicate at " +
    "v4550. A standing list of open items that nobody prunes becomes a list of closed ones, which reads " +
    "as work outstanding and is not. WHAT IS STILL OPEN AND TOUCHES THIS FILE: the record census reads " +
    ".mjs alone, so the SEVEN records section 10 pins are invisible to it, and widening it reddens a " +
    "replay taken with the same narrow ruler at commit 75f0c033; the walk's bilinear ground can still " +
    "stand the body inside solid rock, which pre-dates the radius and whose clamp brings back v404's " +
    "stairs; and the player spends its speed budget HORIZONTALLY where terrainWalk defaults to SURFACE, " +
    "which is a gameplay choice v4546 named and did not make.");
process.exit(fails ? 1 : 0);
