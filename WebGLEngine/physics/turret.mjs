// WebGLEngine/physics/turret.mjs -- v4588 (task 77): a turret on the race car's roof, with its own contract
//
// THE COPILOT'S SEAT. physics/raceCar.mjs gives the driver a chassis and a contract { throttle, steer, brake }; this gives the
// gunner a mount on that chassis and a contract of its own, { yaw, pitch, fire } -- yaw and pitch are RATE commands in [-1, 1]
// (a full command turns the turret at TURRET.yawRate / pitchRate), fire is 0 or 1 and does nothing while the gun is reloading.
// Nothing here steps box3d: the turret is JS state carried beside a car (createTurret), read from the car's pose (carPose), and
// the shells it fires are vacuum ballistics stepped by physics/ballistics.mjs's stepShell with the world's own gravity. A hit is
// an EVENT the caller turns into an impulse on the target's chassis; this module never touches a body.
//
// *** THE TREE HAD TURRETS THAT DRAW AND TURRETS THAT WEIGH, AND NONE THAT MOUNT. *** render/turretRenderer.js is a yaw-only
// instanced visual bound to OgreScenario; simulation/multiPartVehicle.js's tank turret is a separate voxel entity with a yaw of
// its own; brain/rl/driveEnv.js's ROOF_TURRET is a 400 kg mass at [0, 2.4, 0] that changes rollover and aims at nothing;
// physics/ballistics.mjs has the elevation solve and the lead with no owner. This is the first turret on a Box3D body, and the
// first with a controller contract a policy can drive (brain/gunnerPolicy.mjs is that policy).
//
// THE AIM SOLUTION IS EXACT FOR A MOVING GUN AND A MOVING TARGET IN VACUUM, AND IT IS NOT leadMoving PLUS AN ELEVATION.
// ballistics.leadMoving solves the straight-line intercept (no gravity) and launchAngles solves the drop for a gun at rest; bolting
// the two together aims above a lead point and gets the time of flight wrong by the cosine of the elevation, which at 20 m and
// 28 m/s is a 0.3 m vertical miss on a 0.35 m half-height target. aimSolution solves the one equation both are special cases of:
// the shell leaves the muzzle at u + v_gun with |u| = v, falls g t^2 / 2, and must meet the target at p_t + v_t t, so
//     u t = (p_t - muzzle) + (v_t - v_gun) t + [0, g t^2 / 2, 0]  =: w(t),   |w(t)| = v t.
// The first positive root of |w(t)|^2 - v^2 t^2 (a quartic, scanned then bisected) is the time of flight; u = w / t gives the
// world yaw and the pitch. Solved again from the muzzle each solution implies, to a fixed point, so the shell leaves from where
// the solution says it does (two passes left 0.03 deg against the closed form at 20 m, measured; the fixed point takes four or five).
// UNREACHABLE is a null: a target that outruns the shell, or one the shell cannot climb to, has no root and the gunner's feature
// says so -- which is where the shell-speed knob's adjudicator refuses (brain/gunnerPolicy.mjs).
//
// THE HIT TEST IS SWEPT. A shell at 28 m/s moves 0.47 m per 60 Hz tick and the chassis is 1.5 m wide, so a point test at the end
// of the tick would pass through a car at a grazing angle. Each tick samples HIT_SAMPLES points along the shell's segment and tests
// them in the target's body frame against the chassis half-extents inflated by the shell radius.
//
// MEASURED (physics/turret-selfcheck.mjs, this box): see the gate's header and reportLines() below; every number there is re-derived
// by the gate, none is typed in.
"use strict";
import { rotateQ } from "../render/voxelBodies.mjs";
import { qMul, qConj, yawQuat, yawOf } from "./raceCar.mjs";
import { stepShell } from "./ballistics.mjs";

/** The turret: where it sits on the chassis (body frame, metres), how fast it turns, what it fires. */
export const TURRET = Object.freeze({
    mount: Object.freeze([0, 0.75, -0.3]),   // on the roof, behind the cab: half[1] = 0.35 plus 0.4 of pedestal
    barrel: 0.9,                              // muzzle distance from the pivot
    yawRate: 3.0,                             // rad/s at a full yaw command
    pitchRate: 1.5,                           // rad/s at a full pitch command
    pitchMin: -0.15, pitchMax: 0.6,           // rad, the gun cannot point at its own roof or straight up
    shellSpeed: 28,                           // m/s from the muzzle, relative to the gun -- the knob brain/gunnerPolicy.mjs proposes
    reloadTicks: 45,                          // 0.75 s at 60 Hz
    shellLife: 4,                             // s before a shell that hit nothing is dropped
    shellRadius: 0.12,
    hitImpulse: 900,                          // N s along the shell's direction on a hit: 0.75 m/s on a 1200 kg chassis
    gravity: 9.81,                            // the race world's gravity (worldFromModule(m, [0, -9.81, 0]))
});
export const HIT_SAMPLES = 4;
export const ALIGN_TOL = 0.03;                // rad: a gunner feature says "aligned" inside this, both axes

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The clamped gunner contract: yaw and pitch rates in [-1, 1], fire 0 or 1. */
export const clampGun = (u = {}) => ({ yaw: clamp(+u.yaw || 0, -1, 1), pitch: clamp(+u.pitch || 0, -1, 1), fire: +u.fire > 0 ? 1 : 0 });

/** A pitch about the local x axis; positive raises a barrel that points along +z (the rotation is right-handed about -x). */
export const pitchQuat = (p) => [-Math.sin(p / 2), 0, 0, Math.cos(p / 2)];

/** A turret at rest on a car: yaw and pitch in the chassis frame, a reload counter, tallies. */
export function createTurret(spec = TURRET) { return { spec, yaw: 0, pitch: 0, reload: 0, shots: 0, hits: 0 }; }

/** The turret's world placement from the chassis pose: { pivot, quat, dir, pos (the muzzle), yaw (world) }. */
export function muzzle(pose, turret) {
    const spec = turret.spec, m = rotateQ(pose.quat, spec.mount), pivot = [pose.pos[0] + m[0], pose.pos[1] + m[1], pose.pos[2] + m[2]];
    const quat = qMul(pose.quat, qMul(yawQuat(turret.yaw), pitchQuat(turret.pitch))), dir = rotateQ(quat, [0, 0, 1]);
    return { pivot, quat, dir, pos: [pivot[0] + dir[0] * spec.barrel, pivot[1] + dir[1] * spec.barrel, pivot[2] + dir[2] * spec.barrel], yaw: yawOf(quat) };
}

/** One tick of the mount: integrate the rate commands, count the reload down. Returns whether the fire command can be honoured now. */
export function stepTurret(turret, cmd, dt) {
    const u = clampGun(cmd), spec = turret.spec;
    turret.yaw = wrap(turret.yaw + u.yaw * spec.yawRate * dt);
    turret.pitch = clamp(turret.pitch + u.pitch * spec.pitchRate * dt, spec.pitchMin, spec.pitchMax);
    if (turret.reload > 0) turret.reload--;
    const fires = u.fire === 1 && turret.reload === 0;
    if (fires) { turret.reload = spec.reloadTicks; turret.shots++; }
    return { ...u, fires };
}

/** A shell leaves the muzzle at the gun's speed plus the chassis velocity. `owner` is the firing car's index. */
export function fireShell(shells, pose, turret, owner, t = 0) {
    const mz = muzzle(pose, turret), v = turret.spec.shellSpeed;
    const s = { x: mz.pos[0], y: mz.pos[1], z: mz.pos[2], vx: mz.dir[0] * v + pose.vel[0], vy: mz.dir[1] * v + pose.vel[1], vz: mz.dir[2] * v + pose.vel[2], t: 0, born: t, owner };
    shells.push(s); return s;
}

/** Is a world point inside a chassis box (half-extents) inflated by `pad`, in the box's own frame? */
export function insideBox(p, pose, half, pad = 0) {
    const d = [p[0] - pose.pos[0], p[1] - pose.pos[1], p[2] - pose.pos[2]], l = rotateQ(qConj(pose.quat), d);
    return Math.abs(l[0]) <= half[0] + pad && Math.abs(l[1]) <= half[1] + pad && Math.abs(l[2]) <= half[2] + pad;
}

/**
 * One tick of every shell: vacuum flight under the world's gravity, then a swept test against each target { index, pose, half }.
 * A shell that hits, lands (y < groundY) or expires is removed. Returns the hit events [{ owner, target, point, dir }] in shell order.
 */
export function stepShells(shells, targets, dt, { groundY = 0, gravity = TURRET.gravity, spec = TURRET } = {}) {
    const events = [];
    for (let i = shells.length - 1; i >= 0; i--) {
        const s0 = shells[i], s1 = stepShell(s0, dt, { gravity, drag: 0 });
        let hit = null;
        for (const tg of targets) {
            if (tg.index === s0.owner) continue;
            for (let k = 1; k <= HIT_SAMPLES && !hit; k++) {
                const f = k / HIT_SAMPLES, p = [s0.x + (s1.x - s0.x) * f, s0.y + (s1.y - s0.y) * f, s0.z + (s1.z - s0.z) * f];
                if (insideBox(p, tg.pose, tg.half, spec.shellRadius)) hit = { owner: s0.owner, target: tg.index, point: p, dir: unit([s1.vx, s1.vy, s1.vz]) };
            }
            if (hit) break;
        }
        if (hit) { events.push(hit); shells.splice(i, 1); continue; }
        if (s1.y < groundY || s1.t >= spec.shellLife) { shells.splice(i, 1); continue; }
        shells[i] = s1;
    }
    return events;
}

const unit = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };

/**
 * THE AIM: the world yaw, pitch and time of flight that put a shell of speed v from this gun onto a target moving at targetVel,
 * exact for vacuum flight with the gun's own velocity carried by the shell. null when no time of flight exists (the target outruns
 * the shell, or the shell cannot climb to it). `tMax` bounds the search; the first root is the flat solution.
 */
export function aimSolution(pose, turret, targetPos, targetVel, { tMax = 6, scan = 0.02, passes = 12 } = {}) {
    const spec = turret.spec, v = spec.shellSpeed, g = spec.gravity, pivot = muzzle(pose, turret).pivot;
    let from = pivot, out = null;
    for (let pass = 0; pass < passes; pass++) {
        const d = [targetPos[0] - from[0], targetPos[1] - from[1], targetPos[2] - from[2]];
        const rel = [targetVel[0] - pose.vel[0], targetVel[1] - pose.vel[1], targetVel[2] - pose.vel[2]];
        const w = (t) => [d[0] + rel[0] * t, d[1] + rel[1] * t + 0.5 * g * t * t, d[2] + rel[2] * t];
        const f = (t) => { const q = w(t); return dot(q, q) - v * v * t * t; };
        let lo = 0, hi = null;
        for (let t = scan; t <= tMax + 1e-9; t += scan) { if (f(t) <= 0) { hi = t; break; } lo = t; }
        if (hi === null) return null;
        for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (f(mid) <= 0) hi = mid; else lo = mid; }
        const t = 0.5 * (lo + hi), q = w(t), u = [q[0] / t, q[1] / t, q[2] / t];
        const yaw = Math.atan2(u[0], u[2]), pitch = Math.atan2(u[1], Math.hypot(u[0], u[2]));
        out = { t, yaw, pitch, u, aim: [targetPos[0] + targetVel[0] * t, targetPos[1] + targetVel[1] * t, targetPos[2] + targetVel[2] * t], passes: pass + 1 };
        // the muzzle sits `barrel` along the solved direction, so the shell does not leave from the pivot: solve again from
        // where this solution puts the muzzle, until the muzzle stops moving (two passes left a 0.03 deg gap against the
        // closed form at 20 m, measured; the fixed point is reached to 1e-12 m in four or five)
        const dir = unit(u), next = pivot.map((c, i) => c + dir[i] * spec.barrel);
        const moved = Math.hypot(next[0] - from[0], next[1] - from[1], next[2] - from[2]);
        from = next;
        if (moved < 1e-12) break;
    }
    return out;
}

/** The errors a gunner steers by: world-yaw and pitch from the current turret to the solution (null solution: no errors, unreachable). */
export function aimErrors(pose, turret, targetPos, targetVel) {
    const sol = aimSolution(pose, turret, targetPos, targetVel);
    if (!sol) return { reachable: false, bearing: 0, pitch: 0, t: null, aligned: false };
    const bearing = wrap(sol.yaw - (pose.yaw + turret.yaw)), pitchErr = clamp(sol.pitch, turret.spec.pitchMin, turret.spec.pitchMax) - turret.pitch;
    return { reachable: true, bearing, pitch: pitchErr, t: sol.t, aligned: Math.abs(bearing) < ALIGN_TOL && Math.abs(pitchErr) < ALIGN_TOL };
}

/** A hash of the turret and shell state for a lockstep fingerprint: yaw and pitch to a micro-radian, the reload, the tallies, the shells. */
export function turretHash(h, turrets, shells, fold) {
    for (const t of turrets) { h = fold(h, Math.round(t.yaw * 1e6) | 0); h = fold(h, Math.round(t.pitch * 1e6) | 0); h = fold(h, t.reload); h = fold(h, t.hits); h = fold(h, t.shots); }
    h = fold(h, shells.length);
    for (const s of shells) { h = fold(h, Math.round(s.x * 1e3) | 0); h = fold(h, Math.round(s.y * 1e3) | 0); h = fold(h, Math.round(s.z * 1e3) | 0); }
    return h;
}

/** The front door: what a turret is, in the numbers the gate re-derives. */
export function reportLines() {
    const pose = { pos: [0, 1, 0], quat: [0, 0, 0, 1], yaw: 0, vel: [0, 0, 0] }, t = createTurret();
    const m0 = muzzle(pose, t); t.pitch = 0.3; const m1 = muzzle(pose, t); t.pitch = 0;
    const still = aimSolution(pose, t, [0, 1, 20], [0, 0, 0]), crossing = aimSolution(pose, t, [0, 1, 20], [6, 0, 0]), gone = aimSolution(pose, t, [0, 1, 20], [0, 0, 40]);
    return [
        "[turret] a turret on the race car's roof: the mount, the muzzle transform, the contract { yaw, pitch, fire }, vacuum shells, a swept hit test",
        `  mount ${TURRET.mount.join(", ")} on the chassis, barrel ${TURRET.barrel} m, yaw ${TURRET.yawRate} rad/s, pitch ${TURRET.pitchRate} rad/s in [${TURRET.pitchMin}, ${TURRET.pitchMax}]`,
        `  shell ${TURRET.shellSpeed} m/s, reload ${TURRET.reloadTicks} ticks, life ${TURRET.shellLife} s, radius ${TURRET.shellRadius}; hit impulse ${TURRET.hitImpulse} N s`,
        `  muzzle at yaw 0 pitch 0 points ${m0.dir.map((c) => c.toFixed(3)).join(", ")}; at pitch 0.3 its y is ${m1.dir[1].toFixed(3)} (= sin 0.3, ${Math.sin(0.3).toFixed(3)})`,
        `  aim at a still target 20 m ahead: pitch ${still ? (still.pitch * 180 / Math.PI).toFixed(2) + " deg" : "none"}, time of flight ${still ? still.t.toFixed(3) + " s" : "-"}`,
        `  aim at one crossing at 6 m/s: yaw ${crossing ? (crossing.yaw * 180 / Math.PI).toFixed(2) + " deg" : "none"}; at one fleeing at 40 m/s: ${gone ? "reachable" : "UNREACHABLE (null): the shell never catches it"}`,
        "  the lead is exact for a moving gun and target in vacuum (one quartic), not leadMoving plus an elevation; brain/gunnerPolicy.mjs steers by its errors",
    ];
}
