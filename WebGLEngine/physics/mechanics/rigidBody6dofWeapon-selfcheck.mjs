// WebGLEngine/physics/mechanics/rigidBody6dofWeapon-selfcheck.mjs
//
// Run: node physics/mechanics/rigidBody6dofWeapon-selfcheck.mjs
//
// THE SIBLING GATE OF physics/mechanics/rigidBody6dofWeapon.mjs. SECTION 5 is the load-bearing one, TWICE OVER:
// an earlier version of this module sampled a fixed number of points along a tick's travel to avoid tunnelling
// (the same technique physics/turret.mjs's own HIT_SAMPLES uses) -- and an adversarial review found that fix
// itself still tunnels through a realistically small target, because a target narrower than the sample
// spacing can sit entirely between two samples and never get tested (WEAPON.speed's 30 units/tick travel at 4
// samples spaces them 7.5 units apart, wider than every ship half-extent this file's own demos use). The
// module now uses an EXACT segment-vs-OBB slab intersection (segmentHitsOBB(), Ericson's "Real-Time Collision
// Detection" 5.3.3) instead of sampling at all, which has no spacing for a target to hide inside -- section 5
// reconstructs the review's own tunnelling case and proves the exact test catches it where a fixed sample grid
// would not.
//
// SABOTAGE LOG -- each applied to physics/mechanics/rigidBody6dofWeapon.mjs, the gate run, the module restored
// (diffed to confirm byte-identical):
//   A  segmentHitsOBB()'s tmin clipping direction flipped (tmin = Math.min(tmin, t1) instead of Math.max, so
//      the entry bound never tightens toward the segment's actual start) -> 4 red across section 5 (the exact-
//      entry-point check now reads t=0 instead of 0.51; the "starts inside" check reads a negative,
//      out-of-segment t; the "clean miss far away" check now reports a hit) and section 6 (the nearest-hit
//      test now credits the FAR target, since every entry point collapses toward whichever bound the flipped
//      min/max produces first).
//   B  fireProjectile()'s muzzle offset rotated by the IDENTITY instead of the shooter's own orientation
//      (pos = add3(shooter.pos, spec.muzzleBody) instead of rotateByQuat(shooter.q, spec.muzzleBody)) -> red:
//      section 2's rotated-shooter geometry check (a 90-degree-yawed shooter's muzzle point lands on the
//      un-rotated body-frame offset instead of the correctly rotated world position).
//   C  stepShots()'s team filter's equality flipped (=== changed to !==, so SAME-team shots hit and opposing
//      ones pass through) -> 6 red: section 6's team-filtering checks (an enemy shot that should hit now
//      passes through as a miss; a same-team shot that should pass through now registers a hit; both new
//      nearest-target-wins checks also use team-B-vs-team-A shots, so the inverted filter drops them to no
//      event at all) and the front door (reportLines' own team-A-vs-team-B shot is filtered out under the
//      inverted rule).
//   D  stepShots()'s "nearest hit wins" comparison inverted (res.t < best.res.t changed to >) -- found by the
//      same review, which noted the ORIGINAL code took the first array match regardless of distance -> red:
//      section 6's nearest-target-wins check (a shot whose path reaches a near target first now credits the
//      far one instead).
"use strict";
import { pathToFileURL } from "node:url";
import { createBody, boxInertia, rotateByQuat } from "./rigidBody6dof.mjs";
import { bodyOBB } from "./rigidBody6dofCollision.mjs";
import * as W from "./rigidBody6dofWeapon.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const near3 = (a, b, eps = 1e-9) => near(a[0], b[0], eps) && near(a[1], b[1], eps) && near(a[2], b[2], eps);

console.log("rigidBody6dofWeapon-selfcheck -- straight-line projectiles + an EXACT segment-vs-OBB hit test\n");

console.log("1. fireProjectile() -- MUZZLE POSITION AND VELOCITY, IDENTITY ORIENTATION");
{
    const shooter = createBody({ mass: 5, I: [1, 1, 1], pos: [2, 3, 4], vel: [10, 0, 0] });
    const shot = W.fireProjectile(shooter, { ownerId: "s1", team: "A" });
    ok("!! muzzle position = shooter.pos + muzzleBody (identity orientation)", near3(shot.pos, [2 + W.WEAPON.muzzleBody[0], 3, 4]), `${shot.pos}`);
    ok("!! muzzle velocity = shooter.vel + forward*speed", near3(shot.vel, [10 + W.WEAPON.speed, 0, 0]), `${shot.vel}`);
    ok("ownerId/team pass through, age starts at 0, life starts at the spec's", shot.ownerId === "s1" && shot.team === "A" && shot.age === 0 && shot.life === W.WEAPON.life);
}

console.log("\n2. fireProjectile() -- A ROTATED SHOOTER, REAL GEOMETRY NOT JUST IDENTITY");
{
    // 90 deg about +Y: freeRotation.mjs's [qw,qx,qy,qz] convention -> local +X (forward) becomes world +Z... or
    // -Z depending on handedness; whichever it is, it must match rotateByQuat's OWN answer, not a hand guess.
    const q = [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0];
    const shooter = createBody({ mass: 5, I: [1, 1, 1], pos: [0, 0, 0], vel: [0, 0, 0], q });
    const shot = W.fireProjectile(shooter, {});
    const expectDir = rotateByQuat(q, W.FORWARD_BODY), expectMuzzle = rotateByQuat(q, W.WEAPON.muzzleBody);
    ok("!! muzzle position rotates with the shooter's own orientation (matches rotateByQuat directly, not assumed)", near3(shot.pos, expectMuzzle), `${shot.pos} vs ${expectMuzzle}`);
    ok("!! fired velocity direction rotates the same way", near3(shot.vel, expectDir.map((v) => v * W.WEAPON.speed)), `${shot.vel}`);
}

console.log("\n3. stepProjectile() -- STRAIGHT-LINE MOTION IS EXACT, LIFE DECREMENTS, EXPIRY RETURNS null");
{
    let shot = { pos: [0, 0, 0], prevPos: [0, 0, 0], vel: [10, -5, 2], life: 1, radius: 0.1, ownerId: null, team: null, age: 0 };
    for (let i = 0; i < 29; i++) shot = W.stepProjectile(shot, 1 / 30);
    ok("!! after 29 ticks of dt=1/30 (0.9667s), position matches pos0 + vel*t EXACTLY (no forces, plain sum)", near3(shot.pos, [10 * 29 / 30, -5 * 29 / 30, 2 * 29 / 30], 1e-9), `${shot.pos}`);
    ok("prevPos trails the previous tick's position, not the current one", !near3(shot.prevPos, shot.pos, 1e-6));
    const expired = W.stepProjectile(shot, 1);
    ok("!! a tick that exhausts life returns null (the shot is gone)", expired === null, `life left before: ${shot.life.toFixed(4)}`);
}

console.log("\n4. pointInOBB() -- HAND-VERIFIABLE INSIDE/OUTSIDE/BOUNDARY, AXIS-ALIGNED AND ROTATED");
{
    const body = createBody({ mass: 1, I: [1, 1, 1], pos: [5, 0, 0] });
    const obb = bodyOBB(body, [1, 2, 3]);
    ok("centre is inside", W.pointInOBB([5, 0, 0], obb));
    ok("just inside the x face (5.99 < 5+1)", W.pointInOBB([5.99, 0, 0], obb));
    ok("!! just outside the x face (6.01 > 5+1)", !W.pointInOBB([6.01, 0, 0], obb));
    ok("inside on y/z despite being at the x face's very edge, with pad covering the boundary", W.pointInOBB([6.0, 1.9, 2.9], obb, 0.05));
    ok("!! pad does not swallow a point genuinely far outside", !W.pointInOBB([9, 0, 0], obb, 0.05));

    const rotBody = createBody({ mass: 1, I: [1, 1, 1], pos: [0, 0, 0], q: [Math.cos(Math.PI / 8), 0, Math.sin(Math.PI / 8), 0] });   // 45deg about Y
    const rotObb = bodyOBB(rotBody, [1, 1, 1]);
    ok("!! a point at world [1,0,0] is now on the rotated box's edge region, correctly read via its OWN (rotated) axes, not world axes", W.pointInOBB([1, 0, 0], rotObb, 1e-6));
    ok("!! and world [1.5,0,1.5] -- outside an AXIS-ALIGNED unit box -- is inside once the box itself is rotated 45deg to face that corner", W.pointInOBB([Math.SQRT2 * 0.9, 0, 0], rotObb));
}

console.log("\n5. *** TUNNELLING: THE EXACT WEAPON.speed CASE A 4-SAMPLE GRID WOULD HAVE MISSED ***");
{
    // Reconstructs an adversarial review's own tunnelling case: a 1.8-unit-wide target (half=0.9) at x=6, a
    // shot travelling x=0->10 this tick (WEAPON.speed's own 30-units/tick order of magnitude). A 4-sample grid
    // (t=0,0.25,0.5,0.75,1 -> x=0,2.5,5,7.5,10, spacing 2.5) never lands inside [5.1,6.9] -- a real miss the
    // earlier sampled sweptHit() would have reported. The exact slab test has no spacing to hide inside.
    const target = createBody({ mass: 1, I: [1, 1, 1], pos: [6, 0, 0] });
    const obb = bodyOBB(target, [0.9, 0.9, 0.9]);
    const shot = { pos: [10, 0, 0], prevPos: [0, 0, 0], vel: [300, 0, 0], life: 1, radius: 0, ownerId: null, team: null, age: 0 };
    const oldSampleGrid = [0, 0.25, 0.5, 0.75, 1].map((t) => 0 + t * 10);
    const wouldSampleHaveCaughtIt = oldSampleGrid.some((x) => x >= 6 - 0.9 && x <= 6 + 0.9);
    report("a 4-sample grid at this spacing would have caught it?", wouldSampleHaveCaughtIt, `samples at x=${oldSampleGrid}, target spans [5.1,6.9]`);
    const res = W.segmentHitsOBB(shot, obb, {});
    ok("!! the earlier sampled approach's own grid would have MISSED this (confirms the case is real, not contrived)", !wouldSampleHaveCaughtIt);
    ok("!! the EXACT slab test CATCHES it anyway", res.hit, res.hit ? `t=${res.t} point=${res.point}` : "");
    ok("!! ...at the algebraically exact entry point: (6-0.9)/10 = 0.51, not a sample fraction", res.hit && near(res.t, 0.51), `t=${res.t}`);

    // a segment starting already inside the box reports t=0, not the box's far face
    const inside = W.segmentHitsOBB({ pos: [6.3, 0, 0], prevPos: [6, 0, 0] }, obb, {});
    ok("!! a segment starting inside the box reports t=0 (already a hit at the start of this tick)", inside.hit && inside.t === 0, `t=${inside.t}`);

    // a segment that clears the box on the same line entirely misses
    const clearMiss = W.segmentHitsOBB({ pos: [-10, 0, 0], prevPos: [-20, 0, 0] }, obb, {});
    ok("!! a segment nowhere near the box (same line, different range) is a clean miss", !clearMiss.hit);
}

console.log("\n6. stepShots() -- THE FULL BATCH PATH: TEAM FILTER, SELF-EXCLUSION, EXPIRY, HIT EVENTS");
{
    const I = boxInertia({ m: 4, hx: 3, hy: 3, hz: 3 }), half = [3, 3, 3];
    const targetB = createBody({ mass: 4, I, pos: [20, 0, 0] });
    const targets = [{ id: "shipB", team: "B", body: targetB, half }];
    // pos is THIS tick's start (stepShots calls stepProjectile, which overwrites prevPos from it) -- vel*dt must
    // land inside target B's span [17,23] for these to actually be hit-test cases, not near-misses.
    const mkShot = (team, ownerId) => ({ pos: [15, 0, 0], prevPos: [15, 0, 0], vel: [150, 0, 0], life: 1, radius: 0, ownerId, team, age: 0 });

    const enemyShot = mkShot("A", "shipA");
    const { alive: aliveEnemy, events: hitsEnemy } = W.stepShots([enemyShot], targets, 1 / 30);
    ok("!! an enemy (team A) shot registers a hit on team B's ship", hitsEnemy.length === 1 && hitsEnemy[0].targetId === "shipB", `events=${hitsEnemy.length}`);
    ok("...and does not also survive as an alive shot", aliveEnemy.length === 0);

    const friendlyShot = mkShot("B", "someoneElseOnB");
    const { events: hitsFriendly } = W.stepShots([friendlyShot], targets, 1 / 30);
    ok("!! a SAME-team (team B) shot on team B's own ship does NOT register a hit", hitsFriendly.length === 0);

    const selfShot = mkShot(null, "shipB");
    const { events: hitsSelf } = W.stepShots([selfShot], targets, 1 / 30);
    ok("!! a shot owned by the target itself does not hit its own owner", hitsSelf.length === 0);

    const farMiss = { pos: [-100, 0, 0], prevPos: [-101, 0, 0], vel: [1, 0, 0], life: 1e-6, radius: 0, ownerId: "x", team: "A", age: 0 };
    const { alive: aliveExpired, events: eventsExpired } = W.stepShots([farMiss], targets, 1 / 30);
    ok("a shot whose life expires this tick is dropped (not alive, no event)", aliveExpired.length === 0 && eventsExpired.length === 0);

    // !! the shot's path enters "Near" first (t~0.25) and "Far" second (t~0.75) -- the event must credit
    // whichever the path actually reaches FIRST, not whichever appears first in the targets array. Found by an
    // adversarial review: the original code broke out of the loop on the first array match regardless of t.
    const If = boxInertia({ m: 4, hx: 2, hy: 2, hz: 2 });
    const farTarget = { id: "Far", team: "B", body: createBody({ mass: 4, I: If, pos: [15, 0, 0] }), half: [2, 2, 2] };
    const nearTarget = { id: "Near", team: "B", body: createBody({ mass: 4, I: If, pos: [5, 0, 0] }), half: [2, 2, 2] };
    const throughShot = { pos: [0, 0, 0], prevPos: [0, 0, 0], vel: [600, 0, 0], life: 1, radius: 0, ownerId: "x", team: "A", age: 0 };
    const farListedFirst = W.stepShots([throughShot], [farTarget, nearTarget], 1 / 30);
    const nearListedFirst = W.stepShots([throughShot], [nearTarget, farTarget], 1 / 30);
    ok("!! with Far listed FIRST in the array, the credited hit is still Near (the path reaches it first)", farListedFirst.events.length === 1 && farListedFirst.events[0].targetId === "Near", `got ${JSON.stringify(farListedFirst.events)}`);
    ok("!! ...and array order genuinely doesn't matter: Near listed first gives the SAME answer", nearListedFirst.events.length === 1 && nearListedFirst.events[0].targetId === "Near", `got ${JSON.stringify(nearListedFirst.events)}`);
}

console.log("\n7. THE FRONT DOOR");
{
    const L = W.reportLines();
    ok("reportLines names the module and reports a real hit", L.some((l) => /rigidBody6dofWeapon/.test(l)) && L.some((l) => /hit after flight/.test(l)));
    ok("...and no report line stringifies a missing field as the literal word \"undefined\"", L.every((l) => !/\bundefined\b/.test(l)));
}

console.log(fails ? `\nrigidBody6dofWeapon-selfcheck: ${fails} FAILED` : "\nrigidBody6dofWeapon-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
