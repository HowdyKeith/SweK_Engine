#!/usr/bin/env node
// WebGLEngine/tools/ship/voxelAvatar-selfcheck.mjs -- v4551
//
// Run: node tools/ship/voxelAvatar-selfcheck.mjs      (~0.11 s -- MEASURED. It was ~2.85 s until v4551.)
//
// THE AVATAR ON THE DEVICE WORLD (sandbox round 6): render/voxelAvatar.mjs over camera/camera.js, the
// sandbox's own first-person camera, driven headless on a hand world (a slab, a wall three high, a
// one-voxel step, a two-voxel ledge, a tower). Section 1, the walk: the eye snaps to the ground plus 1.7;
// a second of W at yaw 0 moves 5 units along -z on the ground; the wall stops the walk short of its voxel
// and a diagonal walk slides along it; the one-voxel step is climbed and the two-voxel wall is not; Space
// jumps to an apex of v^2 / 2g and lands where it left; walking off the ledge falls two voxels and lands;
// Shift sprints at 9; two runs of the same keys give the same positions; the spec is read from the
// instance. Section 2, the matrix: avatarViewProj equals camera/buildViewProj.js element for element on
// several poses (the twin: both column-major, -z forward, +y up), and the forward is buildViewProj's.
//
// ---- *** v4551: THE DEVICE SECTION LEFT, AND THE POINT IS THAT THIS HALF CAME BACK. *** ----------------
//
// This file read 3,063 ms in the v4550 timings against a 3,000 ms ship-time budget, so the quick sweep
// SKIPPED IT -- and the rows below are the ones that have actually caught a camera regression. Timed by
// section: the walk 40 ms, the matrix twin 2 ms, and the both-backends section ~2,800 ms. 42 ms of 2,850
// was CPU. The browser launch and two GPU device initialisations are not compressible, so the device
// section moved to tools/ship/voxelAvatarDevice-selfcheck.mjs and this file now runs in ~0.11 s.
//
// *** NOTHING WAS LOST AND THE COUNTS SAY SO: *** 21 ok() call sites before the split, 17 here and 4
// there; 23 PASS rows before, 17 here and 6 there (two of that file's sites run once per backend). And no
// coverage moved DOWN -- the whole file was over budget before, so both halves were covered only by the
// sweep rotation; now this half runs on every ship and the other half stays where it already was.
//
// *** THE ROW THAT EARNED THE SPLIT IS IN SECTION 1 AND SAYS SO IN ITS OWN COMMENT: *** v4545's repair was
// caught here -- green at HEAD, red against the repair -- by a gate belonging to another round's subject.
// That is the coverage the budget was quietly withholding at ship time, for two rounds.
//
// MEASURED AT v4522 AND STILL READ HERE: the eye snaps to 5.7 on the slab; a second of W walks to z 25.5 at
// velocity -5; the three-high wall stops the walk at z 11.083 and a diagonal walk slides to x 31.57 with
// z 11.02; the one-voxel step is stood on at z 16.5 with the eye at 6.7; the jump apex is +1.50 (v^2 / 2g
// is 1.56 at 60 Hz) with the landing at tick 49; Shift walks 9 units; avatarViewProj is within 1.9e-6 of
// buildViewProj on four poses. Three gate-side corrections from that round: a wall eight voxels wide was
// slid AROUND (it spans the world now); the step was read at z 17.17 where the blend to the next row had
// begun (read at 16.5 now); the ledge walk ran fifteen units and left the floor's own end behind.
//
// SABOTAGE: the v4522 battery, re-run at v4551 across BOTH halves, because the test of a split is that the
// old battery still lands and not that the new file passes. A avatarForward with fz = +cos yaw 5 RED
// (3 here, 2 there); B stepAvatar stepping with dt 0 12 (10 / 2); C avatarCamera not entering fp 13
// (11 / 2); D avatarViewProj looking from the target to the eye 4 (2 / 2). *** EVERY COUNT IS IDENTICAL TO
// v4522's AND EVERY SABOTAGE IS CAUGHT BY BOTH HALVES *** -- a split that had opened a blind spot would
// show as a number that fell, and none did. All four are now caught AT SHIP TIME, which none of them was
// while this file sat over budget. Each restored and the baseline re-run: 0 red.
//
"use strict";
import { avatarCamera, stepAvatar, avatarForward, avatarViewProj, avatarPose, avatarSpec } from "../../render/voxelAvatar.mjs";
import { buildViewProj } from "../../camera/buildViewProj.js";
import * as G from "../../render/gpuDriven.mjs";
import { miniWorld } from "../../render/voxelDevice.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[Camera\]/.test(String(a[0]))) log(...a); }; };
quiet();
/** the hand world: a floor (top y 1) 48 x 48 and a slab (top y 3) for z in [4, 40); a wall 3 high across the whole width at z 10; a step (one
 *  voxel) at z 16..17, x 4..11; a two-voxel wall at z 20..21, x 4..11; a tower at (30, 4..8, 30). The slab's two ends are two-voxel ledges. */
function handWorld() {
    const w = miniWorld(); for (let x = 0; x < 48; x++) for (let z = 0; z < 48; z++) { w.setVoxel(x, 1, z, 2); if (z >= 4 && z < 40) { w.setVoxel(x, 3, z, 3); w.setVoxel(x, 2, z, 2); } }
    for (let x = 0; x < 48; x++) for (let y = 4; y < 7; y++) w.setVoxel(x, y, 10, 1);
    for (let x = 4; x < 12; x++) for (let z = 16; z < 18; z++) w.setVoxel(x, 4, z, 4);
    for (let x = 4; x < 12; x++) for (let z = 20; z < 22; z++) { w.setVoxel(x, 4, z, 1); w.setVoxel(x, 5, z, 1); }
    for (let y = 4; y < 9; y++) w.setVoxel(30, y, 30, 1);
    return w;
}
const walk = (cam, keys, ticks, dt = 1 / 60) => { let p = null; for (let i = 0; i < ticks; i++) p = stepAvatar(cam, dt, keys); return p; };

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. the walk, headless, on the hand world");
{
    const w = handWorld(), cam = avatarCamera(w, { x: 8.5, z: 30.5 }), spec = avatarSpec(cam);
    ok("the spec is the sandbox's: eye 1.7, walk 5, sprint 9, jump 7.5, gravity 18", spec.eyeHeight === 1.7 && spec.walk === 5 && spec.sprint === 9 && spec.jump === 7.5 && spec.gravity === 18, JSON.stringify(spec));
    ok("in fp mode the eye snaps to the ground (the slab's top is y 4) plus 1.7", cam.mode === "fp" && near(cam.position.y, 5.7) && avatarPose(cam).onGround);
    const p1 = walk(cam, ["KeyW"], 60);
    ok("a second of W at yaw 0 walks 5 units along -z and stays on the ground", near(p1.z, 25.5, 1e-6) && near(p1.x, 8.5) && near(p1.y, 5.7) && p1.onGround && near(p1.velocity.z, -5), `${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p1.z.toFixed(2)}`);
    const c2 = avatarCamera(w, { x: 24.5, z: 14.5 }); const p2 = walk(c2, ["KeyW"], 120);
    ok("walking into the three-high wall at z 10 stops in the voxel before it (z in [11, 12))", p2.z >= 11 && p2.z < 12 && near(p2.y, 5.7), `z ${p2.z.toFixed(3)}`);
    const c3 = avatarCamera(w, { x: 24.5, z: 14.5, yaw: Math.PI / 4 }); const p3 = walk(c3, ["KeyW"], 120);
    ok("walking diagonally into it slides along the wall: x keeps moving (5 cos 45 a second) while z stays in the voxel before the wall", p3.z >= 11 && p3.z < 12 && p3.x > 24.5 + 5 * Math.SQRT1_2 * 1.5, `x ${p3.x.toFixed(2)}, z ${p3.z.toFixed(3)}`);
    const c4 = avatarCamera(w, { x: 8.5, z: 14.5, yaw: Math.PI }); const p4 = walk(c4, ["KeyW"], 24);
    ok("the one-voxel step at z 16 is climbed (auto-step): standing on it at z 16.5 the eye is 6.7", near(p4.z, 16.5, 1e-6) && near(p4.y, 6.7, 1e-6) && p4.onGround, `z ${p4.z.toFixed(2)}, y ${p4.y.toFixed(2)}`);
    // *** THE SANDBOX'S OWN ASYMMETRY, MEASURED AND RECORDED -- AND HALF OF IT IS CLOSED AT v4545. *** camera.js samples the ground
    // bilinearly between the column it stands in and the columns at +x and +z, so a wall approached going +z was felt as a ramp one
    // voxel early and CLIMBED if the eye could rise past it, while the same wall approached going -z was a wall. Two voxels was
    // climbable one way and not the other; three was a wall both ways. The row below said so and said plainly that it was not fixed
    // here -- and v4545 fixed it somewhere else, by giving camera.js's ground query the body's feet: a column whose only surface is
    // two voxels above this body is now NOT-FOUND rather than a height to blend toward, so it is a wall from either side. The row is
    // REWRITTEN rather than argued with, which is what this file's own header asked for the day the camera got a body.
    // WHAT REMAINS, and is still this file's to carry: a two-voxel ledge walked off toward +z sinks the feet into the last row and
    // STICKS at the lip, because the blend looks toward +x and +z and nothing has made it symmetric. Walked off toward -z it is
    // descended cleanly -- which v4545 very nearly broke, parking the avatar at z 3.250 for good by averaging a NOT-FOUND corner in
    // as zero; THIS FILE IS WHAT CAUGHT THAT, green at HEAD and red against the repair, after the ship ritual's sweep rotation
    // brought it back under budget in the same round. The camera is index.html's; this round carries what is left.
    const c5 = avatarCamera(w, { x: 8.5, z: 18.5, yaw: Math.PI }); const p5 = walk(c5, ["KeyW"], 60);
    ok("*** the two-voxel wall at z 20 is a WALL going +z too, since v4545: the body-aware query cannot name a surface two voxels up ***", p5.z >= 19 && p5.z < 20 && near(p5.y, 5.7), `z ${p5.z.toFixed(3)}, y ${p5.y.toFixed(2)} -- it CLIMBED to z 21.083, y 7.53 before v4545, which this row recorded as the sandbox's asymmetry and said was not fixed here`);
    const c5b = avatarCamera(w, { x: 8.5, z: 23.5, yaw: 0 }); const p5b = walk(c5b, ["KeyW"], 60);
    ok("the same two-voxel wall approached going -z is a wall: the walk stops in the voxel before it", p5b.z >= 22 && p5b.z < 23 && near(p5b.y, 5.7), `z ${p5b.z.toFixed(3)}, y ${p5b.y.toFixed(2)}`);
    const c6 = avatarCamera(w, { x: 8.5, z: 30.5 }); stepAvatar(c6, 1 / 60, ["Space"]); let apex = 0, landed = -1; for (let i = 0; i < 120; i++) { const p = stepAvatar(c6, 1 / 60, []); if (p.y > apex) apex = p.y; if (landed < 0 && p.onGround && i > 5) landed = i; }
    ok("Space jumps: the apex is near v^2 / 2g = 1.56 above the eye and the landing is back at 5.7", apex - 5.7 > 1.3 && apex - 5.7 < 1.7 && landed > 0 && near(c6.position.y, 5.7), `apex +${(apex - 5.7).toFixed(2)} at tick ${landed}`);
    // *** THE +z STICK SURVIVES v4546 AND MOVED, WHICH IS WHY THE ROW CARRIES BOTH READINGS. *** The
    // two-voxel drop is 63.4 degrees over one column, so the slope limit now takes the body OFF the ledge
    // instead of letting the blend sink it into the last row -- and it still does not get past, because it
    // lands on the INTERPOLATED surface between the two columns (feet at 3.0, where the real surfaces are 4
    // and 2) and _canStandAt refuses from there. A bilinear blend of a lattice reports heights that are not
    // ground, which is v404's own bargain and is not this round's to unpick; what is recorded is that the
    // stick is the same defect at a new place, nearer the edge and a voxel lower.
    const c7 = avatarCamera(w, { x: 40.5, z: 38.5, yaw: Math.PI }); const p7 = walk(c7, ["KeyW"], 300);
    // *** v4549 -- AND THE BODY IS STANDING INSIDE THE ROCK, WHICH IT WAS DOING BEFORE THIS FILE HAD A
    // RADIUS TO NOTICE IT WITH. *** Cell z=39 is solid up to y=3. Driven at v4548, with the body still a
    // zero-width line, it stops at z 39.500 with its FEET AT 3.000 -- inside that rock. v4549 gave the body
    // a radius of 0.4 and the reading moved to z 39.67, feet 2.000: the same defect, a voxel deeper, now
    // inside the body's OWN footprint. The cause is v404's bilinear ground, which averages the surfaces of
    // the columns a body straddles and answers a height NEITHER of them has; _canStandAt would refuse that
    // position and is asked on every horizontal move, but the vertical snap never asks it.
    // Not closed here: clamping the walk to a legal height means taking the highest surface under the
    // footprint, which binds at EVERY one-voxel lip and brings back exactly the stairs v404 removed. Filed
    // with its numbers. The row asserts the body is stuck INSIDE the rock rather than pretending otherwise.
    const rockTopAt39 = [0, 1, 2, 3, 4, 5].filter((y) => (w.voxelAt(40, y, 39) || 0) !== 0).pop();
    ok("walking toward +z off the two-voxel ledge at z 40 STILL STICKS, and stands INSIDE the rock while it does", p7.z > 39 && p7.z < 40 && near(p7.y, 3.7, 1e-6) && (p7.y - 1.7) <= rockTopAt39, `z ${p7.z.toFixed(2)}, y ${p7.y.toFixed(2)} at 300 ticks (feet ${(p7.y - 1.7).toFixed(3)}, and cell z=39 is solid to y=${rockTopAt39}) -- it read z 39.50 feet 3.000 at v4548 with NO radius at all, and z 39.08 y 5.53 before v4546. Three readings of one defect that v404 has carried since it was written`);
    // 48 ticks, not 36: the same descent, but v4546 makes the body FALL the two voxels instead of gliding
    // down them, and the fall takes about twelve frames. Four units, so it lands on the floor and is not
    // yet off the world -- the floor's end at z 0 is what the first draft walked past.
    const c7b = avatarCamera(w, { x: 40.5, z: 5.5, yaw: 0 }); const p7b = walk(c7b, ["KeyW"], 48);
    ok("walking toward -z off the ledge at z 4 FALLS the two voxels and lands on the floor (eye 3.7)", near(p7b.z, 1.5, 1e-6) && near(p7b.y, 3.7, 1e-6) && p7b.onGround, `z ${p7b.z.toFixed(2)}, y ${p7b.y.toFixed(2)}; airborne at tick 36 (y 4.94) where before v4546 it was already down at y 3.70`);
    const c8 = avatarCamera(w, { x: 40.5, z: 30.5 }); const p8 = walk(c8, ["KeyW", "ShiftLeft"], 60);
    ok("Shift sprints at 9 units a second", near(p8.z, 21.5, 1e-6) && near(p8.velocity.z, -9), `z ${p8.z.toFixed(2)}`);
    const c9 = avatarCamera(w, { x: 8.5, z: 30.5 }); const r1 = [];  for (let i = 0; i < 90; i++) r1.push(stepAvatar(c9, 1 / 60, i < 30 ? ["KeyW"] : i < 40 ? ["KeyW", "Space"] : ["KeyD"]).z);
    const c10 = avatarCamera(w, { x: 8.5, z: 30.5 }); const r2 = []; for (let i = 0; i < 90; i++) r2.push(stepAvatar(c10, 1 / 60, i < 30 ? ["KeyW"] : i < 40 ? ["KeyW", "Space"] : ["KeyD"]).z);
    ok("two runs of the same keys give the same positions tick for tick", r1.every((v, i) => v === r2[i]));
    ok("no keys, no motion: the pose is what it was after a second", (() => { const c = avatarCamera(w, { x: 8.5, z: 30.5 }); const a = avatarPose(c); const b = walk(c, [], 60); return a.x === b.x && a.y === b.y && a.z === b.z; })());
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. the matrix twin");
{
    const w = handWorld(), W = 200, H = 120;
    let worst = 0; const poses = [[8.5, 30.5, 0, 0], [24.5, 14.5, Math.PI / 4, -0.3], [8.5, 18.5, Math.PI, 0.5], [30.5, 5.5, -2.1, -0.9]];
    for (const [x, z, yaw, pitch] of poses) { const cam = avatarCamera(w, { x, z, yaw, pitch }); const mine = avatarViewProj(cam, W, H, G).viewProj, ref = new Float32Array(16); buildViewProj(ref, cam.position, cam.yaw, cam.pitch, cam.fov, cam.near, cam.far, W / H); for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(mine[i] - ref[i])); }
    ok("*** avatarViewProj equals camera/buildViewProj.js element for element on four poses (within 1e-4 of values up to 1000) ***", worst < 1e-4, `worst ${worst.toExponential(2)}`);
    const f = avatarForward(0, 0), g = avatarForward(Math.PI / 2, 0), h = avatarForward(0, Math.PI / 2);
    ok("the forward is buildViewProj's: yaw 0 looks down -z, yaw pi/2 down +x, pitch pi/2 straight up", near(f[2], -1) && near(f[0], 0) && near(g[0], 1) && near(g[2], 0, 1e-9) && near(h[1], 1));
    const cam = avatarCamera(w, { x: 30.5, z: 40.5, yaw: 0, pitch: 0 }); const vp = avatarViewProj(cam, W, H, G), p = G.project(vp.viewProj, [30.5, 6, 30]);
    ok("the tower ten units ahead projects to the frame's centre column", Math.abs(p[0]) < 0.05 && p[3] > 0, `ndc x ${p[0].toFixed(3)}`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("the DEVICE half is tools/ship/voxelAvatarDevice-selfcheck.mjs, split out at v4551 so this half could "
  + "rejoin the ship sweep: it boots a headless shell and two real GPU devices at ~2.8 s and stays in the "
  + "over-budget pool, where it already was. No coverage moved down. unchecked here: pointer lock itself (a "
  + "user gesture the harness cannot give); the sandbox's sprint energy bar (null here, so sprint is free); "
  + "the observer and kaiju modes (not the avatar's); the page's Walk toggle (eyeballed).");
process.exit(fails ? 1 : 0);
