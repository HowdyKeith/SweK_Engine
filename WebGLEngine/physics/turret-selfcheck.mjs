// WebGLEngine/physics/turret-selfcheck.mjs -- v4588
//
// Run: node physics/turret-selfcheck.mjs
//
// THE SIBLING GATE OF physics/turret.mjs: the mount and the muzzle transform, the contract, the reload, the aim solution held to
// physics/ballistics.mjs's closed form where the two overlap (a still gun, a still target: the quartic's root IS the flat root of
// launchAngles), the shells' flight and the swept hit test, the lead against a crossing target, the refusal of an unreachable
// one, and the lockstep hash. Pure: no box3d here; the car is a pose. brain/gunnerPolicy-selfcheck.mjs holds the policy that
// drives this contract and the race it is raced in.
//
// SABOTAGE LOG -- v4588, each applied to physics/turret.mjs, the gate run, the module restored.
//   A  the pitch sign flipped (a positive pitch lowers the barrel)         -> 6 red: the raise, both closed-form rows, the still
//      hit, the lead, the moving gun.
//   B  the hit test at the end of the tick only (HIT_SAMPLES = 1)          -> 1 red: the 4 cm plate stepped over.
//   C  the shell without the gun's velocity                                -> 1 red: the moving gun falls short of the target
//      moving with it. (This row was ADDED for this sabotage: the first draft of section 4 fired only from still guns, so
//      dropping the carried velocity reached no assertion -- a 0-red sabotage, which is a finding, not a pass.)
//   D  the reload never counting down                                      -> 3 red: one shot from two commands, the shot on the
//      tick the counter reaches zero, the hash that an extra (refused) shot should have changed.
//   E  gravity dropped from the aim solution                               -> 7 red: the closed-form rows, every hit, the plate.
//   FINDING, in the first draft of this gate: the hash row's extra fire command was placed at tick 77, inside the reload from
//   the shot at tick 60, where the mount refuses it and the hash does not move -- the gate's own sabotage reached no branch.
//   It fires at tick 50 now, and a second row holds that the refused one changes nothing, which is the reload working.
"use strict";
import * as U from "./turret.mjs";
import * as B from "./ballistics.mjs";
import { foldHash, yawQuat } from "./raceCar.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const deg = (x) => x * 180 / Math.PI;
const DT = 1 / 60, HALF = [0.75, 0.35, 1.4];
const still = (pos, yaw = 0) => ({ pos, quat: yawQuat(yaw), yaw, vel: [0, 0, 0] });
const fly = (shells, targetsAt, maxTicks = 600) => { let ev = [], k = 0; while (shells.length && k < maxTicks) { ev = ev.concat(U.stepShells(shells, targetsAt(k), DT, { groundY: 0 })); k++; } return { events: ev, ticks: k }; };
console.log("turret-selfcheck -- the mount, the muzzle, the contract, the shells, the lead\n");

console.log("1. THE MOUNT AND THE MUZZLE");
{
    const pose = still([0, 1, 0]), t = U.createTurret();
    const m0 = U.muzzle(pose, t);
    ok("!! at yaw 0 and pitch 0 the barrel points along the chassis's +z", near(m0.dir[0], 0, 1e-12) && near(m0.dir[1], 0, 1e-12) && near(m0.dir[2], 1, 1e-12), m0.dir.map((c) => c.toFixed(6)).join(", "));
    ok("...from the mount on the roof: pivot = pos + mount, muzzle = pivot + barrel along the barrel", m0.pivot.every((c, i) => near(c, pose.pos[i] + U.TURRET.mount[i])) && near(m0.pos[2], U.TURRET.mount[2] + U.TURRET.barrel));
    t.pitch = 0.3; const m1 = U.muzzle(pose, t);
    ok("!! a positive pitch RAISES the barrel: dir.y = sin(pitch), dir.z = cos(pitch)", near(m1.dir[1], Math.sin(0.3), 1e-12) && near(m1.dir[2], Math.cos(0.3), 1e-12), `y ${m1.dir[1].toFixed(6)}`);
    t.pitch = 0; t.yaw = Math.PI / 2; const m2 = U.muzzle(pose, t);
    ok("a turret yaw of +pi/2 points the barrel along +x (raceCar's yawQuat convention), and muzzle.yaw reads it back", near(m2.dir[0], 1, 1e-12) && near(m2.dir[2], 0, 1e-12) && near(m2.yaw, Math.PI / 2, 1e-12));
    t.yaw = 0; const yawed = still([3, 1, 5], Math.PI / 2), m3 = U.muzzle(yawed, t);
    ok("the mount turns with the chassis: a car yawed +pi/2 (its +z now along +x) carries its pivot at pos + [mount.z, mount.y, -mount.x]", near(m3.pivot[0], 3 + U.TURRET.mount[2], 1e-12) && near(m3.pivot[1], 1 + U.TURRET.mount[1], 1e-12) && near(m3.pivot[2], 5 - U.TURRET.mount[0], 1e-12) && near(m3.dir[0], 1, 1e-12), `pivot ${m3.pivot.map((c) => c.toFixed(3)).join(", ")}`);
    const c = U.clampGun({ yaw: 5, pitch: -3, fire: 0.3 }), c0 = U.clampGun({});
    ok("the contract clamps: yaw and pitch to [-1, 1], fire to 0 or 1, nothing to zeros", c.yaw === 1 && c.pitch === -1 && c.fire === 1 && c0.yaw === 0 && c0.pitch === 0 && c0.fire === 0 && U.clampGun({ fire: "0" }).fire === 0);
}
console.log("\n2. THE MOUNT INTEGRATES ITS RATES AND RELOADS");
{
    const t = U.createTurret();
    for (let i = 0; i < 10; i++) U.stepTurret(t, { yaw: 1, pitch: 1 }, DT);
    ok("!! ten ticks of a full yaw command turn the turret yawRate x 10 dt; the pitch stops at pitchMax", near(t.yaw, U.TURRET.yawRate * 10 * DT, 1e-12) && near(t.pitch, Math.min(U.TURRET.pitchMax, U.TURRET.pitchRate * 10 * DT), 1e-12), `yaw ${t.yaw.toFixed(4)} pitch ${t.pitch.toFixed(4)}`);
    for (let i = 0; i < 100; i++) U.stepTurret(t, { pitch: -1 }, DT);
    ok("...and at pitchMin going down", near(t.pitch, U.TURRET.pitchMin, 1e-12));
    const r1 = U.stepTurret(t, { fire: 1 }, DT), r2 = U.stepTurret(t, { fire: 1 }, DT);
    ok("!! two fire commands in a row are ONE shot: the second finds the gun reloading", r1.fires === true && r2.fires === false && t.shots === 1 && t.reload === U.TURRET.reloadTicks - 1);
    let fired = 0; for (let i = 0; i < U.TURRET.reloadTicks; i++) if (U.stepTurret(t, { fire: 1 }, DT).fires) fired++;
    ok("...and holding fire through the reload fires exactly once more, on the tick the counter reaches zero", fired === 1 && t.shots === 2, `reload ${U.TURRET.reloadTicks} ticks`);
    const w = U.createTurret(); for (let i = 0; i < 200; i++) U.stepTurret(w, { yaw: 1 }, DT);
    ok("the yaw wraps to (-pi, pi] rather than winding", w.yaw > -Math.PI && w.yaw <= Math.PI && near(w.yaw, Math.atan2(Math.sin(200 * U.TURRET.yawRate * DT), Math.cos(200 * U.TURRET.yawRate * DT)), 1e-9));
}
console.log("\n3. THE TWO ROUTES TO THE ELEVATION: THE QUARTIC'S ROOT IS launchAngles' FLAT ROOT WHERE BOTH APPLY");
{
    const pose = still([0, 1, 0]), t = U.createTurret(), target = [0, 1, 20];
    const sol = U.aimSolution(pose, t, target, [0, 0, 0]);
    t.yaw = sol.yaw; t.pitch = sol.pitch; const mz = U.muzzle(pose, t);
    const range = Math.hypot(target[0] - mz.pos[0], target[2] - mz.pos[2]), rise = target[1] - mz.pos[1];
    const closed = B.launchAngles(range, rise, U.TURRET.shellSpeed, U.TURRET.gravity);
    ok("!! a still gun at a still target: the solved pitch equals ballistics.launchAngles' FLAT root from the solved muzzle", !!closed && near(sol.pitch, closed.flat, 1e-9), `${deg(sol.pitch).toFixed(4)} vs ${deg(closed.flat).toFixed(4)} deg over ${range.toFixed(3)} m, rise ${rise.toFixed(3)}`);
    ok("...and the time of flight equals ballistics.flightTime at that elevation", near(sol.t, B.flightTime(range, U.TURRET.shellSpeed, closed.flat), 1e-9), `${sol.t.toFixed(4)} s`);
    ok("the solution is the FLAT root, not the lob: the first positive root of the quartic", sol.pitch < closed.lob && sol.t < B.flightTime(range, U.TURRET.shellSpeed, closed.lob));
    report(`the still shot: pitch ${deg(sol.pitch).toFixed(2)} deg, ${sol.t.toFixed(3)} s`);
    const fast = U.aimSolution({ ...pose, vel: [0, 0, 10] }, U.createTurret(), target, [0, 0, 10]);
    ok("a gun and target moving together at 10 m/s solve to the same pitch as at rest (the shell carries the gun's velocity)", !!fast && near(fast.pitch, sol.pitch, 1e-6) && near(fast.t, sol.t, 1e-6));
}
console.log("\n4. THE SHELL FLIES AND THE SWEPT HIT TEST SEES IT");
{
    const pose = still([0, 1, 0]), target = still([0, 1, 20]), tg = () => [{ index: 1, pose: target, half: HALF }];
    const t = U.createTurret(), sol = U.aimSolution(pose, t, target.pos, [0, 0, 0]); t.yaw = sol.yaw; t.pitch = sol.pitch;
    const shells = []; U.fireShell(shells, pose, t, 0, 0); const r = fly(shells, tg);
    ok("!! fired at the solution, the shell HITS the target box: one event naming the target, on its near face", r.events.length === 1 && r.events[0].target === 1 && r.events[0].owner === 0 && Math.abs(r.events[0].point[2] - (20 - HALF[2])) < 0.2, r.events.length ? `at z ${r.events[0].point[2].toFixed(2)} after ${r.ticks} ticks` : "no event");
    const t0 = U.createTurret(), sh0 = []; U.fireShell(sh0, pose, t0, 0, 0); const r0 = fly(sh0, tg);
    ok("...fired flat at pitch 0 it MISSES (it drops 0.7 m over 20 m) and lands: no event, the shell removed at the ground", r0.events.length === 0 && sh0.length === 0 && r0.ticks < 200, `${r0.ticks} ticks`);
    const own = []; U.fireShell(own, pose, t, 0, 0); const rOwn = fly(own, () => [{ index: 0, pose, half: HALF }]);
    ok("a shell never hits the car that fired it", rOwn.events.length === 0);
    const moving = (k) => [{ index: 1, pose: { ...target, pos: [6 * (k + 1) * DT, 1, 20], vel: [6, 0, 0] }, half: HALF }];
    const lead = U.createTurret(), sl = U.aimSolution(pose, lead, [0, 1, 20], [6, 0, 0]); lead.yaw = sl.yaw; lead.pitch = sl.pitch; const shL = []; U.fireShell(shL, pose, lead, 0, 0); const rL = fly(shL, moving);
    const noLead = U.createTurret(), sn = U.aimSolution(pose, noLead, [0, 1, 20], [0, 0, 0]); noLead.yaw = sn.yaw; noLead.pitch = sn.pitch; const shN = []; U.fireShell(shN, pose, noLead, 0, 0); const rN = fly(shN, moving);
    ok("!! THE LEAD: a target crossing at 6 m/s is hit when aimed at the solution and missed when aimed at where it is", rL.events.length === 1 && rN.events.length === 0, `lead yaw ${deg(sl.yaw).toFixed(2)} deg hit; yaw 0 missed`);
    ok("...a target fleeing at 40 m/s has NO solution, and aimErrors says unreachable and not aligned", U.aimSolution(pose, U.createTurret(), [0, 1, 20], [0, 0, 40]) === null && U.aimErrors(pose, U.createTurret(), [0, 1, 20], [0, 0, 40]).reachable === false && U.aimErrors(pose, U.createTurret(), [0, 1, 20], [0, 0, 40]).aligned === false);
    // a gun moving at 10 m/s behind a target moving at 10 m/s: the shell CARRIES the gun's velocity, or it falls short
    const gunV = { pos: [0, 1, 0], quat: yawQuat(0), yaw: 0, vel: [0, 0, 10] }, tv = U.createTurret(), sv = U.aimSolution(gunV, tv, [0, 1, 20], [0, 0, 10]); tv.yaw = sv.yaw; tv.pitch = sv.pitch;
    const shV = []; U.fireShell(shV, gunV, tv, 0, 0); const rV = fly(shV, (k) => [{ index: 1, pose: { ...target, pos: [0, 1, 20 + 10 * (k + 1) * DT], vel: [0, 0, 10] }, half: HALF }]);
    ok("!! a moving gun hits a target moving with it: the shell leaves at the gun's speed PLUS the chassis velocity", rV.events.length === 1, `${rV.events.length} events, ${rV.ticks} ticks`);
    const e = U.aimErrors(pose, lead, [0, 1, 20], [6, 0, 0]);
    ok("aimErrors at the solution reads zero bearing and pitch error, and aligned", e.reachable && Math.abs(e.bearing) < 1e-9 && Math.abs(e.pitch) < 1e-9 && e.aligned);
    // the swept test: a thin plate the end-of-tick point would step over
    const plate = still([0, 1, 12]), thin = [0.75, 0.35, 0.02], tp = U.createTurret(), sp = U.aimSolution(pose, tp, plate.pos, [0, 0, 0]); tp.yaw = sp.yaw; tp.pitch = sp.pitch;
    const shP = []; U.fireShell(shP, pose, tp, 0, 0);
    let endpointOnly = false, sweptHit = false, k = 0;
    while (shP.length && k < 600) { const s0 = shP[0], s1 = B.stepShell(s0, DT, { gravity: U.TURRET.gravity }); if (U.insideBox([s1.x, s1.y, s1.z], plate, thin, U.TURRET.shellRadius)) endpointOnly = true; if (U.stepShells(shP, [{ index: 1, pose: plate, half: thin }], DT, { groundY: 0 }).length) sweptHit = true; k++; }
    ok("!! the hit test is SWEPT: a 4 cm plate is hit by the sampled segment where an end-of-tick point test steps over it", sweptHit && !endpointOnly, `swept ${sweptHit}, endpoint-only ${endpointOnly}`);
}
console.log("\n5. THE LOCKSTEP HASH");
{
    const run = (cmds) => { const pose = still([0, 1, 0]), t = U.createTurret(), shells = []; let h = 0x811c9dc5; for (let k = 0; k < cmds.length; k++) { const r = U.stepTurret(t, cmds[k], DT); if (r.fires) U.fireShell(shells, pose, t, 0, k); U.stepShells(shells, [], DT, { groundY: 0 }); h = U.turretHash(h, [t], shells, foldHash); } return (h >>> 0).toString(16); };
    const a = Array.from({ length: 120 }, (_, k) => ({ yaw: k < 40 ? 1 : 0, pitch: 0.5, fire: k % 30 === 0 ? 1 : 0 }));
    // the extra fire lands at tick 50, AFTER the 45-tick reload from tick 0: the first draft put it at 77, inside the reload
    // from tick 60, where it is refused and changes nothing -- a sabotage that reached no branch, caught by the gate itself
    const b = a.map((c, k) => (k === 50 ? { ...c, fire: 1 } : c));
    ok("!! the same commands give the same hash, one extra fire command (on a reloaded gun) changes it", run(a) === run(a) && run(a) !== run(b), `${run(a)} vs ${run(b)}`);
    const c = a.map((x, k) => (k === 77 ? { ...x, fire: 1 } : x));
    ok("...and one that lands during a reload is refused and changes nothing, which is the reload working", run(a) === run(c));
}
console.log("\n6. THE FRONT DOOR");
{
    const L = U.reportLines();
    ok("reportLines prints the mount, the muzzle check, the still shot, the crossing lead and the unreachable target", L.length === 7 && /mount 0, 0.75, -0.3/.test(L[1]) && /sin 0.3/.test(L[3]) && /pitch [0-9.]+ deg/.test(L[4]) && /UNREACHABLE/.test(L[5]));
}
console.log(fails ? `\nturret-selfcheck: ${fails} FAILED` : "\nturret-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
