// FILE: physics/ballistics.mjs -- v4205
//
// A SHELL: a projectile that FALLS. Gravity, drag, a launch-angle solution with its two roots, and a lead for
// a shooter that is itself moving.
//
// *** THE TREE HAD NO BALLISTICS AT ALL, AND THE ONE PLACE THAT ADVERTISED SOME WAS A LERP. ***
// battleship3d.html's cannon says "arcing shell" and draws:
//
//     shell.position.lerpVectors(from, target, u); shell.position.y += Math.sin(u*Math.PI)*peak;
//
// -- a straight line with a sine hump added on top, with `peak` and `dur` as CONSTANTS. Same arc height and
// same time of flight whether the target is one cell away or across the board. It cannot miss, cannot be
// intercepted, cannot be dodged, and has no launch angle, so there is no lob-versus-flat choice -- which is
// the entire tactical content of a gun. ev/shots.js, the only other projectile system, is 2D straight-line
// or homing with NO GRAVITY ANYWHERE IN IT.
//
// *** THE TWO ROOTS ARE THE POINT. *** For any reachable target there are normally TWO elevations that hit
// it: a FLAT one that arrives fast and flat, and a LOB that goes high and drops steeply. Artillery picks the
// lob to clear a ridge or to come down on a deck; a railgun picks the flat one because time of flight is
// survival. They coincide exactly at maximum range, which is how you know you are at the edge of it.
//
// *** AND THE CLOSED FORM IS ONLY EXACT IN VACUUM, WHICH IS WHY math/inverseSolve.mjs IS HERE. *** With drag
// there is no closed form at all -- the trajectory is a differential equation. v4201 shipped a solver that
// inverts a pure function using only evaluations of it, built for exactly this shape of problem: you can
// SIMULATE a shot and measure where it lands, and that is enough to solve for the angle that lands it on the
// target. The vacuum solution below is the closed form AND the starting guess for the drag one.
"use strict";

import { solve } from "../math/inverseSolve.mjs";

/** m/s^2. Earth. A shell on the Moon is the same maths with a different number, which is the point of it being one. */
export const GRAVITY = 9.80665;

/** Below this the launch solution is treated as degenerate -- the target is on top of the gun. */
export const MIN_RANGE = 1e-9;

/**
 * The two launch elevations that put a shell of speed `v` on a target `range` away and `rise` above.
 *
 * *** DERIVED, NOT LOOKED UP, BECAUSE THE HEIGHT DIFFERENCE MATTERS AND MOST QUOTED FORMULAS DROP IT. ***
 * The flat-ground form R = v^2 sin(2t)/g only holds when the target is at the gun's own height. A naval gun
 * firing across water is that case; a mortar on a hill is not, and a shell aimed with the flat-ground angle
 * lands long or short by the amount the ground moved. Writing y as a function of x and solving for tan(t):
 *
 *     rise = range*tan(t) - g*range^2 / (2 v^2 cos^2(t))          and 1/cos^2 = 1 + tan^2
 *     => k*tan^2(t) - range*tan(t) + (rise + k) = 0,  where k = g*range^2 / (2 v^2)
 *
 * A plain quadratic in tan(t). Its discriminant is exactly the in-range test: negative means no elevation
 * whatsoever reaches, which is a different answer from "aim at 45 degrees and hope".
 *
 * @returns {{flat:number, lob:number, grazing:boolean}|null} radians, or null when out of range
 */
export function launchAngles(range, rise, v, g = GRAVITY) {
    if (!(range > MIN_RANGE) || !(v > 0)) return null;
    const k = (g * range * range) / (2 * v * v);
    const disc = range * range - 4 * k * (rise + k);
    if (disc < 0) return null;                       // unreachable at this muzzle velocity, at ANY elevation
    const sq = Math.sqrt(disc);
    const t1 = (range - sq) / (2 * k), t2 = (range + sq) / (2 * k);
    return { flat: Math.atan(t1), lob: Math.atan(t2), grazing: disc === 0 };
}

/** The furthest a shell of speed v can be thrown onto ground `rise` above the gun. */
export function maxRange(v, rise = 0, g = GRAVITY) {
    // At maximum range the two roots meet, so the discriminant is zero. Solving that for range gives the
    // standard result v^2/g when rise is 0, and shrinks it correctly when firing uphill.
    const s = v * v - 2 * g * rise * 0;             // rise enters through the discriminant, below
    if (!(v > 0)) return 0;
    // disc(range) = range^2 - 4k(rise + k) with k = g range^2/(2v^2). Substituting and solving for range:
    //   range^2 * (1 - g^2 range^2 / v^4) = 2 g range^2 rise / v^2
    //   => 1 - g^2 range^2 / v^4 = 2 g rise / v^2      => range^2 = (v^4 - 2 g rise v^2) / g^2
    const r2 = (v * v * v * v - 2 * g * rise * v * v) / (g * g);
    return r2 > 0 ? Math.sqrt(r2) : 0;
}

/** Where a vacuum shell is at time t, given a launch elevation. Flat ground assumed at y=0. */
export function positionAt(t, v, elevation, g = GRAVITY) {
    return { x: v * Math.cos(elevation) * t, y: v * Math.sin(elevation) * t - 0.5 * g * t * t };
}

/** Time for a vacuum shell to travel `range` horizontally at this elevation. */
export function flightTime(range, v, elevation) {
    const vx = v * Math.cos(elevation);
    return Math.abs(vx) < 1e-12 ? Infinity : range / vx;
}

/** Highest point of a vacuum trajectory, above the muzzle. What tells you whether it clears the ridge. */
export function apex(v, elevation, g = GRAVITY) {
    const vy = v * Math.sin(elevation);
    return vy <= 0 ? 0 : (vy * vy) / (2 * g);
}

/**
 * One integration step of a shell WITH drag. Semi-implicit Euler: velocity first, then position.
 *
 * *** QUADRATIC DRAG, NOT LINEAR, BECAUSE A SHELL IS NOT A DUST MOTE. *** Drag force goes as v^2 in the
 * regime any gun operates in; using -k*v instead is a different physics that happens to also slow things
 * down, and it gets the shape of the trajectory wrong -- the descending branch of a real shell is much
 * steeper than the ascending one, and linear drag barely shows that.
 *
 * `drag` is the combined coefficient (0.5 * Cd * rho * A / m) in 1/m, so drag=0 is exactly vacuum.
 */
export function stepShell(s, dt, { gravity = GRAVITY, drag = 0, wind = [0, 0, 0] } = {}) {
    const rvx = s.vx - wind[0], rvy = s.vy - wind[1], rvz = (s.vz || 0) - wind[2];
    const speed = Math.hypot(rvx, rvy, rvz);
    const a = drag > 0 && speed > 0 ? -drag * speed : 0;
    const vx = s.vx + a * rvx * dt;
    const vy = s.vy + (a * rvy - gravity) * dt;
    const vz = (s.vz || 0) + a * rvz * dt;
    return { ...s, vx, vy, vz, x: s.x + vx * dt, y: s.y + vy * dt, z: (s.z || 0) + vz * dt, t: (s.t || 0) + dt };
}

/**
 * Fly a shell until it falls back to `groundY` (or runs out of time). Returns the landing state and the path.
 *
 * The final step is INTERPOLATED to the ground plane rather than reported at whatever height the last whole
 * step happened to end on -- otherwise the measured range depends on dt, and a solver built on it would be
 * chasing the integrator's step size instead of the physics.
 */
export function flyShell(shell, { dt = 1 / 240, groundY = 0, maxTime = 300, keepPath = false, ...opts } = {}) {
    let s = { x: 0, y: 0, z: 0, vz: 0, t: 0, ...shell };
    const path = keepPath ? [s] : null;
    let peak = s.y;
    while (s.t < maxTime) {
        const n = stepShell(s, dt, opts);
        if (n.y > peak) peak = n.y;
        if (n.y <= groundY && n.vy < 0) {
            // *** THIS INTERPOLATION BLEW UP WHEN THE TRAJECTORY GRAZES THE TARGET HEIGHT, WHICH IS EXACTLY
            // THE CASE THAT MATTERS. *** Firing 500 m at ground 200 m up, the solved angle gives an apex of
            // 200.004 m -- four millimetres of clearance. The step that trips the test then has s.y and n.y
            // both within 1e-7 of the ground, so (s.y - groundY) / (s.y - n.y) is a tiny number over a tiny
            // number: catastrophic cancellation. MEASURED before the clamp: x = -6429 m at t = -82.47 s,
            // from a shell fired forwards. The true crossing is always INSIDE this step, so a fraction
            // outside [0,1] is arithmetic noise and nothing else; clamping is not papering over it, it is
            // the statement of what f means.
            const dy = s.y - n.y;
            const f = dy > 1e-12 ? Math.min(1, Math.max(0, (s.y - groundY) / dy)) : 0;
            const hit = { ...n, x: s.x + (n.x - s.x) * f, y: groundY, z: s.z + (n.z - s.z) * f, t: s.t + dt * f };
            if (path) path.push(hit);
            return { landed: true, ...hit, range: Math.hypot(hit.x - (shell.x || 0), hit.z - (shell.z || 0)), apex: peak, path };
        }
        s = n;
        if (path) path.push(s);
    }
    return { landed: false, ...s, range: Math.hypot(s.x - (shell.x || 0), s.z - (shell.z || 0)), apex: peak, path };
}

/**
 * The launch elevation that lands a shell on a target WITH drag, found by simulation.
 *
 * *** THIS IS math/inverseSolve.mjs DOING THE JOB IT WAS BUILT FOR. *** There is no closed form once drag is
 * in the equation. v4201's solver needs only evaluations of a function, and "fire at this elevation, see
 * where it lands" is exactly an evaluation. The vacuum answer from launchAngles() is the starting guess,
 * which is what makes it converge in a handful of iterations rather than wandering.
 *
 * @param prefer "flat" or "lob" -- which of the two roots to start from, since both remain valid with drag
 * @returns {{elevation, range, error, iterations, ok, seed}|null}
 */
export function solveElevation(range, rise, v, { drag = 0, prefer = "flat", tolerance = 0.05, g = GRAVITY, dt = 1 / 240 } = {}) {
    const vac = launchAngles(range, rise, v, g);
    if (!vac) return null;                            // out of range even in vacuum; drag only makes it worse
    const seed = prefer === "lob" ? vac.lob : vac.flat;
    if (!(drag > 0)) return { elevation: seed, range, error: 0, iterations: 0, ok: true, seed, exact: true };
    const landedRange = ([elev]) => {
        const r = flyShell({ vx: v * Math.cos(elev), vy: v * Math.sin(elev) }, { dt, groundY: rise, drag, gravity: g });
        return [r.landed ? r.x : NaN];                // a shot that never comes down is a REFUSED probe, not a zero
    };
    const out = solve(landedRange, [range], [seed], { tolerance });
    return {
        elevation: out.x[0], range: out.residual !== null ? range : null,
        error: out.residual, iterations: out.iterations, ok: out.ok, why: out.why, seed, exact: false,
    };
}

/**
 * The furthest a shell can actually be thrown WITH drag, and the elevation that does it.
 *
 * *** THIS EXISTS BECAUSE maxRange() LIES ONCE THERE IS AIR IN THE PROBLEM, AND IT LIES BY MORE THAN HALF. ***
 * MEASURED at v=100 m/s and drag=0.002: vacuum reach 1019.7 m, real reach 445.8 m -- drag takes 56.3% of it.
 * An AI that checks reachability with the closed form will confidently order a shot at a 500 m target that
 * its gun physically cannot reach, and solveElevation() will grind to the top of the range curve and report
 * ok:false rather than pretending. Asking the right question first is cheaper than that.
 *
 * *** AND THE OPTIMUM ELEVATION IS NOT 45 DEGREES. *** It is 38.75 deg in that case, because a shell that
 * spends longer in the air loses more of its speed to drag. Golden-section on a unimodal curve, so it finds
 * the peak without a derivative -- there is no formula to differentiate.
 */
export function maxRangeDrag(v, { drag = 0, g = GRAVITY, dt = 1 / 480, rise = 0, iterations = 60 } = {}) {
    if (!(drag > 0)) { const r = maxRange(v, rise, g); return { range: r, elevation: Math.PI / 4, exact: true }; }
    const reach = (a) => {
        const r = flyShell({ vx: v * Math.cos(a), vy: v * Math.sin(a) }, { dt, groundY: rise, drag, gravity: g });
        return r.landed ? r.x : -Infinity;
    };
    const PHI = (Math.sqrt(5) - 1) / 2;
    let lo = 1e-4, hi = Math.PI / 2 - 1e-4;
    let c = hi - PHI * (hi - lo), d = lo + PHI * (hi - lo);
    let fc = reach(c), fd = reach(d);
    for (let i = 0; i < iterations; i++) {
        if (fc > fd) { hi = d; d = c; fd = fc; c = hi - PHI * (hi - lo); fc = reach(c); }
        else { lo = c; c = d; fc = fd; d = lo + PHI * (hi - lo); fd = reach(d); }
    }
    const a = (lo + hi) / 2;
    return { range: reach(a), elevation: a, exact: false };
}

/** Can this gun reach that target at all? The question to ask BEFORE solving for an angle. */
export function reachable(range, rise, v, opts = {}) {
    if (!(opts.drag > 0)) return launchAngles(range, rise, v, opts.g || GRAVITY) !== null;
    return range <= maxRangeDrag(v, { ...opts, rise }).range;
}

/**
 * Where to aim so a shell and a MOVING target arrive together, from a MOVING shooter.
 *
 * *** physics/predict/predict.js ALREADY HAS leadIntercept AND IT TAKES THE SHOOTER AS A STATIONARY POINT. ***
 * That is correct for a fixed gun and wrong for a ship, and ev/shots.js compounds it: createShot adds the
 * ship's velocity to every shot it spawns -- correctly, EV launches relative to the hull -- while every
 * turret aims with aimHeading(), a plain bearing to where the target is RIGHT NOW. So the tree has a working
 * firing-lead solver that nothing but its own demo calls, and turrets that inherit ship velocity and then
 * shoot at a stale position.
 *
 * The fix is one substitution: solve the intercept in the SHOOTER'S REST FRAME. Subtract the shooter's
 * velocity from the target's, solve as if the gun were still, and the answer is the direction to point the
 * barrel. The shell's inherited velocity then carries it the rest of the way.
 *
 * @returns {{t, aim, dir}|null} -- aim is the world point, dir the unit vector to point the gun
 */
export function leadMoving(shooterPos, shooterVel, targetPos, targetVel, shellSpeed) {
    const n = shooterPos.length;
    const d = targetPos.map((p, i) => p - shooterPos[i]);
    const rel = targetVel.map((v, i) => v - shooterVel[i]);      // the whole fix, in one line
    const A = dot(rel, rel) - shellSpeed * shellSpeed;
    const B = 2 * dot(d, rel);
    const C = dot(d, d);
    let t = null;
    if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) { const tt = -C / B; if (tt > 0) t = tt; } }
    else {
        const disc = B * B - 4 * A * C;
        if (disc >= 0) { const sq = Math.sqrt(disc);
            for (const tt of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)].sort((x, y) => x - y)) if (tt > 0 && t === null) t = tt; }
    }
    if (t === null) return null;                      // the target outruns the shell
    const aim = targetPos.map((p, i) => p + targetVel[i] * t);
    const rd = new Array(n);
    for (let i = 0; i < n; i++) rd[i] = d[i] + rel[i] * t;
    const L = Math.hypot(...rd) || 1;
    return { t, aim, dir: rd.map((x) => x / L) };
}

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

/**
 * A fuse: does this shell burst in the air, and where?
 *
 * The piece #55 (fireworks) is filed for. A SHELL is not a particle -- it is one object that flies
 * ballistically and then BECOMES particles at a moment it decides. Timed, altitude and proximity are the
 * three real fuses and they answer at different moments, so a shell carries which one it has.
 */
export const FUSE = Object.freeze({ IMPACT: "impact", TIMED: "timed", ALTITUDE: "altitude", PROXIMITY: "proximity" });

export function fuseFires(shell, fuse, { time = 0, altitude = 0, distance = Infinity } = {}) {
    switch (fuse) {
        case FUSE.TIMED: return (shell.t || 0) >= time;
        // Altitude fires on the way DOWN as well as up, which is what an airburst over a deck wants; a naive
        // `y >= altitude` fires on the way up and puts the burst on the wrong side of the target.
        case FUSE.ALTITUDE: return shell.y <= altitude && (shell.vy || 0) < 0;
        case FUSE.PROXIMITY: return distance <= (shell.proximity || 0);
        case FUSE.IMPACT: default: return shell.y <= 0 && (shell.vy || 0) < 0;
    }
}
