// WebGLEngine/tools/ship/kaijuGround-selfcheck.mjs -- v4554
//
// Run: node tools/ship/kaijuGround-selfcheck.mjs
//
// *** THE KAIJU'S HEIGHT IS WRITTEN TWICE EVERY FRAME BY TWO DIFFERENT RULES, AND THE ONE THAT WINS IS THE
// ONE NOBODY DESIGNED TO WIN. *** main.js's loop calls camera.update() at :29660 and kaijuManager.tick(dt)
// at :29931 -- same frame, camera first. camera/camera.js's _moveKaijuDrive integrates a fall through
// physics/character/fallBody.mjs's fallStep and writes k.position.y. simulation/KaijuManager.js:280 then
// assigns `k.position.y = gy` outright, guarded only by `k.state !== "spawning" && k.state !== "dying"`.
// There is no _isPlayerDriven guard on it. So the drive camera's vertical physics -- gravity, the fall, the
// jump at _kaijuDriveVelY = 11, all of v4548's work on this path -- IS DISCARDED ON EVERY FRAME IT RUNS.
//
// ---- AND THE REDUNDANT WRITE IS THE ONLY THING KEEPING THE CREATURE IN THE WORLD -----------------------
//
// This is why the round does NOT close the double write, and the number is the whole argument:
//
//     AI clamp ON  (the real frame order)                   0 of 60 kaiju below y = -20
//     AI clamp OFF (guarded by _isPlayerDriven, the
//                   "obvious" one-line cleanup)            56 of 60 kaiju below y = -20
//
// Five seconds of holding W on the generated world. The drive path cannot stand alone: unlike _moveFP it
// has NO step-up (its probe is _fallSurface(), reach 0, so it can never name a surface above the body) and
// NO horizontal collision at all (`k.position.x += mx * speed * dt` is unguarded; _canStandAt has exactly
// one call site in the tree and it is the OTHER controller in the same class). It walks into a hillside,
// the probe answers null, and it never grounds again. The AI clamp rescues it every frame by accident.
//
// *** SO THE ONE-LINE FIX IS A CATASTROPHE AND THIS GATE EXISTS TO SAY SO BEFORE SOMEBODY SHIPS IT. ***
// "Two writers for one quantity, add a guard" is the correct instinct and it is wrong here until the drive
// path can hold a body up on its own -- which is the player's v4545..v4552 arc repeated for a second body.
//
// ---- WHAT ELSE IS MEASURED HERE AND NOT FIXED ----------------------------------------------------------
//
// _terrainTop returns world._heightAt(x,z) + 1. MEASURED over 2,240 non-water samples of a generated world:
// _heightAt is the FIRST AIR index in 2,240 of 2,240, never the topmost solid, so the + 1 is one voxel too
// high by the model's own convention -- and _terrainTop reads ABOVE the voxel stand height in 2,240 of
// 2,304 samples. NOT FIXED: gy feeds the flyers' cruise altitude (gy + clearance), the swimmers' water line
// (Math.max(gy, 8)) and the wake test (gy <= 8), so a one-voxel correction moves every kaiju in the game.
// That is a gameplay change and this round does not make it; section 4 holds the measurement so the next
// round has the number rather than the impression.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   K1  guard the clamp with _isPlayerDriven (the "obvious" one-line fix)      1 RED
//   K2  _terrainTop drops its `+ 1`                                            1 RED
//   K3  the drive stops writing k.position.y at all                            5 RED
//   K4  the drive is given a step-up (reach 1.2 instead of 0)                  4 RED
//   K5  the false comment put back                                             2 RED
//
// Counted across this gate, walkGround, playerGround, playerSlope, controllerAgreement, cameraFall,
// playerBody, playerWater and voxelAvatar.
//
// *** K2 WENT ZERO RED AGAINST THIS GATE'S FIRST DRAFT AND THE REASON IS THIS GATE'S OWN FAULT. ***
// Sections 2 to 4 drive a TRANSCRIPTION of KaijuManager._terrainTop, because the manager wants a live
// world and a full tick to instantiate -- so editing the real method changed nothing the gate could see.
// A check grading its own copy, for the third time in five rounds (v4541's sabotage B, v4552's eye
// smoother, this). The transcription is now PINNED to the source's own text in section 1, and K2 reddens.
//
// *** K1 IS THE ROUND'S WHOLE POINT AND IT REDDENS BY DESIGN. *** It is the correct instinct -- two writers
// for one quantity, add a guard -- and it drops 56 of 60 driven kaiju out of the world, because the write
// it removes is the only thing holding them up. The row exists so the cleanup is refused with a number.
//
// *** AND K4 SHOWS THE REAL FIX IS NOT FREE EITHER: *** giving the drive the step-up it lacks reddens FOUR
// rows across three gates, including cameraFall's frozen fall readings. The direction is right and the
// round declines to take it here rather than taking it carelessly.
//
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Camera, KAIJU_GROUND_AT_V4554 as R } from "../../camera/camera.js";
import { standHeightAt } from "../../world/surfaceProbe.mjs";
import { noComments, prose } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const src = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const KM = src("simulation/KaijuManager.js"), KMCODE = noComments(KM);
const CAM = src("camera/camera.js"), CAMCODE = noComments(CAM);
const MAIN = noComments(src("main.js"));

const { VoxelWorld } = await import("../../world/world.js");
const W = new VoxelWorld();
for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) W.generateChunk(cx, cz);

/**
 * simulation/KaijuManager.js:2418 _terrainTop, TRANSCRIBED -- and a transcription is a copy, which is the
 * thing this session keeps convicting. Section 1 pins the copy against the source's own text, so an edit to
 * the real method reddens this file instead of leaving it grading a snapshot. Sabotage K2 -- drop the `+ 1`
 * from the real _terrainTop -- went 0 RED against the first draft of this gate for exactly that reason.
 */
const terrainTop = (x, z) => {
    const h = W._heightAt(Math.floor(x), Math.floor(z));
    if (Number.isFinite(h) && h > 0) return h + 1;
    const ix = Math.floor(x), iz = Math.floor(z);
    for (let y = 60; y >= 0; y--) if (W.voxelAt(ix, y, iz) !== 0) return y + 1;
    return 1;
};
const mkKaiju = (x, z) => ({ id: 1, kind: "ground", state: "idle", isAlive: () => true,
    config: { scale: 3 }, position: { x: x + 0.5, y: terrainTop(x, z), z: z + 0.5 },
    _stamina: 1, _weaponEnergy: 1 });
const mkDrive = (k, yaw = Math.PI / 2, keys = ["KeyW"]) => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world: W, keys: new Set(keys), position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 }, yaw, pitch: 0, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _kaijuDriveVelY: 0, _kaijuDriveOnGround: true, mode: "kaiju_drive", _kaijuTarget: k, _lmbHeld: false });
    return c;
};
/** One frame of main.js's real order: camera.update() ... then kaijuManager.tick(). */
const frame = (c, k, clampOn) => {
    c._moveKaijuDrive(1 / 60);
    const afterDrive = k.position.y;
    if (clampOn) { const gy = terrainTop(k.position.x, k.position.z); if (gy > 0) k.position.y = gy; }
    return { afterDrive, afterClamp: k.position.y };
};
let seed = 99; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const starts = []; while (starts.length < 60) {
    const x = Math.floor(rnd() * 120) - 60, z = Math.floor(rnd() * 120) - 60;
    if (terrainTop(x, z) > 0) starts.push([x, z]);
}

console.log("== kaijuGround-selfcheck (v4554) ==");

// ---- 1. THE TWO WRITERS, IN THE SOURCE ------------------------------------------------------------------
console.log("\n-- 1. two writers, one quantity, one frame");
{
    const camIdx = MAIN.indexOf("camera.update()"), kmIdx = MAIN.indexOf("kaijuManager.tick(");
    ok("*** main.js calls camera.update() and THEN kaijuManager.tick() in the same frame ***",
       camIdx > 0 && kmIdx > camIdx,
       "camera first, the manager second, no early return between them -- so whatever the drive writes, " +
       "the manager's clamp gets the last word.");
    ok("!! the drive writes k.position.y through fallBody's fallStep",
       /k\.position\.y = kr\.pos\[1\];/.test(CAMCODE) && /fallStep\(\{/.test(CAMCODE));
    ok("*** and the manager's clamp is guarded by STATE ALONE, with no _isPlayerDriven test ***",
       /k\.state !== "spawning" && k\.state !== "dying"/.test(KMCODE) &&
       /k\.position\.y = gy;/.test(KMCODE) &&
       !/_isPlayerDriven[\s\S]{0,400}?k\.position\.y = gy;/.test(KMCODE),
       "simulation/KaijuManager.js:257 and :280.");
    // *** THE TRANSCRIPTION IS PINNED TO THE SOURCE, BECAUSE SECTIONS 2-4 DRIVE A COPY OF _terrainTop. ***
    ok("!! *** this file's copy of _terrainTop still matches the method it copies ***",
       /_terrainTop\(x, z\) \{/.test(KMCODE) &&
       /if \(Number\.isFinite\(h\) && h > 0\) return h \+ 1;/.test(KMCODE) &&
       /for \(let y = 60; y >= 0; y--\)/.test(KMCODE) &&
       /return 1;/.test(KMCODE),
       "sections 2, 3 and 4 drive a TRANSCRIPTION of KaijuManager's ground rule, because the manager wants " +
       "a live world and a full tick to instantiate. A transcription is a copy and a copy goes stale in " +
       "silence -- the sabotage that drops the `+ 1` from the real method went 0 RED against this gate's " +
       "first draft, which is v4541's sabotage B for the third time in five rounds. This row is the pin.");

    // *** v4560 -- THIS ROW SAID THE FLAG GUARDS NO PHYSICS, AND THAT WAS THE FINDING RATHER THAN THE
    // DESIGN. *** v4554 measured exactly one use of _isPlayerDriven in the manager, an animation clip, and
    // convicted camera.js's comment claiming the flag makes "AI tick skip". v4560 added the second use and
    // it is the ground clamp, so the flag now guards precisely the physics v4554 recorded that it did not.
    // The row holds the SHAPE rather than the count: the clip is still there, and the new one is the clamp.
    const driven = (KMCODE.match(/_isPlayerDriven/g) || []).length;
    ok("!! *** _isPlayerDriven GUARDS THE GROUND CLAMP NOW, AND AT v4554 IT GUARDED NO PHYSICS AT ALL ***",
       driven === 2 && driven === R.isPlayerDrivenUsesInManager &&
       /else if \(k\._isPlayerDriven\)/.test(KMCODE),
       `${driven} uses: the animation clip v4554 found, and the clamp guard this round added. The one-line ` +
       "cleanup that dropped 56 of 60 kaiju out of the world is the SAME line -- what changed is that the " +
       "drive can now hold a body up without it.");
}

// ---- 2. THE DRIVE'S FALL IS COMPUTED AND THROWN AWAY -----------------------------------------------------
console.log("\n-- 2. what the drive computes, and what survives the frame");
{
    const k = mkKaiju(...starts[0]), c = mkDrive(k);
    let frames = 0, discarded = 0, everDiffered = 0;
    for (let f = 0; f < 300; f++) {
        const r = frame(c, k, true);
        frames++;
        if (Math.abs(r.afterDrive - r.afterClamp) > 1e-9) { discarded++; everDiffered++; }
    }
    report(`300 frames: the clamp overwrote the drive's answer on ${discarded} of them`);
    ok("*** the drive's vertical result does not survive a single frame it differs on ***",
       discarded > 250 && discarded === everDiffered,
       `${discarded}/300. v4548 routed this path through fallBody so the kaiju would stop being a fourth ` +
       `copy of "fall until you land" -- and the result is assigned, then overwritten, every frame. The ` +
       `work is correct and it is DEAD in the shipping frame order.`);
    ok("the record carries it", R.framesDriveDiscardedOf300 >= 250);
}

// ---- 3. *** AND THE OBVIOUS FIX IS A CATASTROPHE *** ----------------------------------------------------
console.log("\n-- 3. what happens if you just guard the clamp");
{
    let gainedHeight = 0, maxGain = 0, inRockFrames = 0, totalFrames = 0;
    const drive5s = (clampOn) => {
        let lost = 0;
        for (const [x, z] of starts) {
            const k = mkKaiju(x, z), c = mkDrive(k);
            const y0 = k.position.y;
            for (let f = 0; f < 300; f++) {
                frame(c, k, clampOn);
                if (clampOn) continue;                      // the drive alone is what these count
                totalFrames++;
                const fx = Math.floor(k.position.x), fz = Math.floor(k.position.z);
                const fy = Math.floor(k.position.y + 0.1);
                for (let yy = fy; yy <= fy + 1; yy++) if (W.voxelAt(fx, yy, fz) !== 0) { inRockFrames++; break; }
            }
            if (k.position.y < -20) lost++;
            if (!clampOn) { const g = k.position.y - y0; if (g > 0.01) gainedHeight++; if (g > maxGain) maxGain = +g.toFixed(3); }
        }
        return lost;
    };
    const withClamp = drive5s(true), without = drive5s(false);
    const inRockPct = +(100 * inRockFrames / Math.max(1, totalFrames)).toFixed(2);
    report(`five seconds of holding W, 60 starts: clamp ON ${withClamp} lost, clamp OFF ${without} lost`);
    ok("*** with the clamp, no driven kaiju leaves the world ***", withClamp === 0);
    // *** v4560 -- THIS ROW USED TO ASSERT `without >= 50` AND IT WAS RIGHT TO. *** v4554 measured 56 of 60
    // driven kaiju dropping out of the world when the clamp was guarded, and wrote the row so that nobody
    // would ship the tidy-up. The tidy-up is now correct, because the two absences it named were built:
    // the drive has a grounded branch reading the WALKING query (so it can climb) and a horizontal step
    // through _stepHorizontal (so it cannot enter terrain). The row is INVERTED rather than deleted -- the
    // property worth holding is the same one, "the drive can hold its own body up", and the number that
    // expresses it has moved from 56 to 0.
    ok("!! *** AND WITHOUT IT THEY STAY IN THE WORLD NOW -- 56 of 60 at v4554, 0 at v4560 ***",
       without === 0 && without === R.lostWithoutClampAfterV4560,
       `${without} of 60 below y = -20 with the clamp guarded, against v4554's ${R.lostWithoutClamp}. THE ` +
       "ONE-LINE CLEANUP THAT WAS A CATASTROPHE IS NOW THE FIX, and the difference is not the cleanup -- it " +
       "is the two mechanisms v4554 recorded as what closing this would require.");
    ok("!! and the drive can CLIMB, which no measurement of it had ever shown",
       gainedHeight > 0 && gainedHeight === R.gainedHeightOf60AfterV4560,
       `${gainedHeight} of 60 end higher than they started under their own power, best ${maxGain}. AT v4554 ` +
       "IT WAS 0 OF 60 WITH A MAXIMUM GAIN OF 0.000: the drive's only vertical path was fallBody, whose " +
       "probe takes no reach by contract, so it could not name a surface above the body and every unit of " +
       "height a driven kaiju ever gained came from the manager's clamp.");
    ok("!! and it no longer walks through terrain: 28.03% of frames inside rock, now none",
       inRockPct === 0 && inRockPct === R.insideRockPctAfterV4560,
       `${inRockPct}% of frames with the body inside a solid cell, against ${R.insideRockPctBeforeV4560}% ` +
       "at v4554. The horizontal move was `k.position.x += mx * speed * dt` with nothing asked.");
    ok("!! the two absences v4554 named are both filled, in SHARED code rather than a second copy",
       /_stepHorizontal\(/.test(CAMCODE) && /_bodyFitsAt\(/.test(CAMCODE) &&
       /static walkStep\(/.test(CAMCODE) &&
       (CAMCODE.match(/this\._stepHorizontal\(/g) || []).length === 2 &&
       (CAMCODE.match(/Camera\.walkStep\(/g) || []).length === 2,
       "_stepHorizontal and Camera.walkStep each have TWO call sites -- _moveFP and _moveKaijuDrive -- " +
       "which is the whole point: v4548 removed the FOURTH copy of the fall from this same method, and a " +
       "second copy of the walk would have been that defect again with a different name.");
    // *** SABOTAGE M5 WENT 0 RED AND THE BRANCH IS THE REASON. *** Deleting Camera.walkStep's `blocked`
    // arm -- the one that refuses a climb taller than STEP_UP_MAX -- reddened nothing across six gates,
    // because NEITHER CALLER CAN REACH IT from the voxel path: both read their ground through
    // _standYAt(..., STEP_UP_MAX), so the probe cannot name a surface further above the body than the
    // allowance, and dy <= stepUp identically. _moveFP's own note has said so since v4545 and kept the
    // branch anyway, for a reason that is still good -- _extMove and the kaiju path can set position.y from
    // OUTSIDE either function, and then dy is whatever the outside writer made it.
    //
    // A BRANCH THAT IS UNREACHABLE FROM THE SHIPPED PATH AND KEPT ON PURPOSE HAS TO BE DRIVEN DIRECTLY, or
    // it is a rule nothing grades -- which is what M5 proved. walkStep is pure and static exactly so that
    // this row can exist.
    {
        const climb = Camera.walkStep(Camera.STEP_UP_MAX + 0.001);
        const step  = Camera.walkStep(Camera.STEP_UP_MAX);
        const walk  = Camera.walkStep(-0.2);
        const cliff = Camera.walkStep(-1.6);
        const steep = Camera.walkStep(-0.2, { tooSteep: true });
        const wide  = Camera.walkStep(-1.6, { cliffDrop: Camera.KAIJU_CLIFF_DROP });
        ok("!! *** all three of walkStep's outcomes are driven, because the shipped path reaches only two ***",
           climb === "blocked" && step === "track" && walk === "track" && cliff === "leave" &&
           steep === "leave" && wide === "track",
           `dy just over STEP_UP_MAX -> ${climb}; exactly STEP_UP_MAX -> ${step} (the limit is INCLUSIVE); ` +
           `ordinary downhill -> ${walk}; past the cliff drop -> ${cliff}; too steep -> ${steep}; and the ` +
           `same drop under the kaiju's wider ${Camera.KAIJU_CLIFF_DROP} -> ${wide}. THE PROBE'S REACH AND ` +
           "THE WALKER'S ALLOWANCE ARE THE SAME NUMBER, so `blocked` cannot fire from a voxel ground -- it " +
           "is for a caller that wrote position.y from outside, and this row is the only thing grading it.");
    }
    ok("the record carries both numbers",
       R.lostWithClamp === 0 && R.lostWithoutClamp >= 50 && R.naiveFixIsACatastrophe === true &&
       R.closedAtV4560 === true);
}

// ---- 4. THE OFF-BY-ONE, MEASURED AND NOT FIXED ----------------------------------------------------------
console.log("\n-- 4. _terrainTop adds a voxel the model does not have");
{
    let n = 0, firstAir = 0, topSolid = 0, above = 0, exact = 0, below = 0;
    for (let x = -64; x <= 79; x += 3) for (let z = -64; z <= 79; z += 3) {
        const h = W._heightAt(x, z); if (!Number.isFinite(h) || h <= 0) continue;
        let top = -1; for (let y = 63; y >= 0; y--) if (W.voxelAt(x, y, z) !== 0) { top = y; break; }
        if (top < 0) continue;
        const v = W.voxelAt(x, top, z); if (v === 10 || v === 11) continue;   // water: the model and the voxels
        n++;                                                                  // genuinely differ there
        if (top === h) topSolid++; else if (top === h - 1) firstAir++;
        const truth = standHeightAt(W, x, z, { body: 2 });
        if (truth !== null) { const ai = h + 1; if (ai > truth) above++; else if (ai === truth) exact++; else below++; }
    }
    report(`${n} non-water samples: _heightAt is the first AIR index in ${firstAir}, the topmost SOLID in ${topSolid}`);
    report(`_terrainTop vs the voxel stand height: above ${above}, exact ${exact}, below ${below}`);
    ok("*** _heightAt is the first AIR index, so `return h + 1` is one voxel too high ***",
       firstAir === n && topSolid === 0,
       "the stand height IS h by the model's own convention, and _terrainTop adds one to it.");
    ok("!! and it reads above the voxels almost everywhere it is asked", above > exact + below);
    ok("*** NOT FIXED, and the reason is a gameplay one this round declines to make ***",
       R.offByOneFixed === false &&
       /const target = gy \+ clr;/.test(KMCODE) && /Math\.max\(gy, 8\)/.test(KMCODE),
       "gy feeds the flyers' cruise altitude, the swimmers' water line and the wake test, so a one-voxel " +
       "correction moves EVERY kaiju in the game, not only the driven one. Measured here, filed, declined.");
}

// ---- 5. THE COMMENT THAT SAYS THE OPPOSITE OF THE CODE --------------------------------------------------
console.log("\n-- 5. a false reason, which is worse than no reason");
{
    // *** AND THIS ROW CAUGHT ITSELF THE SAME WAY v4550's DID. *** Its first draft asserted the phrase was
    // ABSENT from the prose -- and the corrected comment QUOTES the old sentence in order to disown it, so
    // the row went red against the very repair it was written to confirm. Matching on absence is wrong when
    // the fix is a retraction; what must hold is that the phrase appears ONCE and is disowned where it does.
    const claim = prose(CAM), hits = (claim.match(/so AI\s*tick\s*skips/g) || []).length;
    const disowned = /USED TO SAY "so AI tick skips" AND THAT HALF WAS FALSE/.test(claim);
    ok("*** camera.js no longer CLAIMS the flag makes the AI tick skip -- it records that it does not ***",
       hits === 1 && disowned,
       `the phrase survives ${hits} time and is disowned where it appears. The sentence read: 'set ` +
       "persistent player-drive flag so AI tick skips and mesh-sync can pick velocity-based clip.' The " +
       "second half is true -- KaijuManager.js:394 " +
       "picks a velocity-based clip off exactly that flag. The FIRST half is false, and it is the half a " +
       "reader would rely on when deciding whether the drive owns the creature's physics. v4545 convicted " +
       "the same species one method over: '_canStandAt already blocked the XZ move' blocked nothing.");
    ok("!! and the corrected text says what the flag actually reaches",
       /velocity-based clip/.test(prose(CAM)) && /KaijuManager/.test(prose(CAM)));
}

// ---- 6. the record --------------------------------------------------------------------------------------
console.log("\n-- 6. the record");
{
    ok("frozen and stamped", Object.isFrozen(R) && R.at === "v4554");
    ok("!! it names what closing the double write would first require", R.closingItRequires.length >= 2);
    report("closing it requires: " + R.closingItRequires.join(" | "));
    ok("the round names what it did not close", R.notClosed.length >= 2);
}

console.log("\n" + (fails ? "FAIL " + fails : "PASS") + "  kaijuGround-selfcheck");
process.exit(fails ? 1 : 0);
