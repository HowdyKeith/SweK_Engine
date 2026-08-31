// FILE: world/fireworkShell.mjs -- v4209
//
// A FIREWORK IS ONE OBJECT THAT BECOMES MANY, AND THAT IS THE WHOLE IDEA. A shell is a single ballistic
// body -- physics/ballistics.mjs, v4205 -- that flies, decides a moment, and turns into stars. Every star is
// then a ballistic body in its own right, which is what lets a crossette break AGAIN.
//
// *** THE ALTERNATIVE, WHICH EVERY PARTICLE SYSTEM DOES BY DEFAULT, IS TO SPAWN THE BURST AT A POINT AND
// FORGET THE SHELL. *** ui/gestureVfx.js's spawnBurst does exactly that, correctly, because a gesture burst
// has no flight. A firework does: it is launched, it rises, it slows, and where it bursts is a consequence of
// the launch rather than a coordinate somebody picked. Fuse it at altitude and the height comes out of the
// physics; fuse it on a timer and a short fuse bursts low, which is how a real one fails.
//
// *** THE STARS INHERIT THE SHELL'S VELOCITY, AND FORGETTING THAT IS THE COMMONEST TELL. *** A shell still
// rising at burst carries every star upward with it, so the sphere drifts as it expands and the whole flower
// leans along the flight path. Spawning the stars at rest around a point gives a burst that hangs pinned in
// the air like a decal, and it reads as wrong before anyone can say why.
"use strict";

import { stepShell, GRAVITY, FUSE, fuseFires } from "../physics/ballistics.mjs";

/**
 * A uniformly distributed direction on the sphere. Marsaglia's method: uniform z, uniform azimuth.
 *
 * *** THE OBVIOUS VERSION IS VISIBLY WRONG AND THIS IS THE MEASUREMENT. *** Drawing three numbers in
 * [-1,1] and normalising samples a CUBE and then projects it, which piles stars toward the eight corners.
 * MEASURED over 240,000 directions binned into 120 equal-solid-angle cells: chi-squared 27,996 against the
 * ~119 a uniform sample gives, and the fullest cell holds 2.92x the stars of the emptiest. A burst built
 * that way has visible lumps at the corners of an invisible box.
 *
 * Rejection sampling fixes it (chi-squared 140) but loops an unbounded number of times. Marsaglia is exact,
 * costs exactly two random numbers, and never loops -- which matters when a shell breaks into 600 stars.
 */
export function randomDirection(rand) {
    const z = rand() * 2 - 1;
    const a = rand() * 2 * Math.PI;
    const s = Math.sqrt(Math.max(0, 1 - z * z));
    return [s * Math.cos(a), s * Math.sin(a), z];
}

/**
 * `n` directions evenly spaced around a circle, tilted out of the horizontal plane.
 *
 * A ring shell is not a sphere with the middle removed -- it is a PLANE of stars, and the evenness is the
 * effect. Random azimuths would give a ring with gaps and clumps, which reads as a failed sphere.
 */
export function ringDirections(n, { tilt = 0, roll = 0, phase = 0 } = {}) {
    const out = [];
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (let i = 0; i < n; i++) {
        const a = phase + (i / n) * 2 * Math.PI;
        // In-plane unit vector, then tilt about x and roll about z.
        let x = Math.cos(a), y = Math.sin(a), z = 0;
        [y, z] = [y * ct - z * st, y * st + z * ct];
        [x, y] = [x * cr - y * sr, x * sr + y * cr];
        out.push([x, y, z]);
    }
    return out;
}

/**
 * The shell types. Each says how the stars are aimed, how fast, how long they burn, and how heavy they are.
 *
 * `drag` and `gravity` are per-star because that is what actually distinguishes them: a WILLOW is not a
 * differently-coloured peony, it is a peony whose stars are heavy and long-burning, so they arc over and
 * trail down. Encoding that as a colour would be decoration; encoding it as physics makes it behave.
 */
export const PATTERNS = Object.freeze({
    peony:         { n: 220, speed: 26, spread: "sphere", life: 2.2, drag: 0.06, gravity: GRAVITY, trail: false },
    chrysanthemum: { n: 260, speed: 24, spread: "sphere", life: 3.0, drag: 0.05, gravity: GRAVITY, trail: true },
    willow:        { n: 140, speed: 16, spread: "sphere", life: 5.0, drag: 0.015, gravity: GRAVITY, trail: true },
    palm:          { n: 40,  speed: 30, spread: "sphere", life: 3.4, drag: 0.02, gravity: GRAVITY, trail: true },
    ring:          { n: 72,  speed: 28, spread: "ring",   life: 2.0, drag: 0.05, gravity: GRAVITY, trail: false },
    crossette:     { n: 24,  speed: 22, spread: "sphere", life: 1.2, drag: 0.05, gravity: GRAVITY, trail: false,
                     // *** THE ONE THAT NEEDS THE SHELL-NOT-PARTICLE MODEL. *** Each star carries its own
                     // fuse and breaks into four more. A particle system that only knows how to spawn at a
                     // point cannot express this; a star that IS a shell can.
                     breakAfter: 0.9, breakInto: 4, breakSpeed: 9, breakLife: 1.1 },
});

export const PATTERN_NAMES = Object.freeze(Object.keys(PATTERNS));

/**
 * Burst a shell into stars.
 *
 * @param shell { x, y, z, vx, vy, vz, t } -- the ballistic body at the moment the fuse fires
 * @param pattern a key of PATTERNS, or an object of the same shape
 * @param opts { rand, inheritVelocity (default 1), speedJitter, tilt, roll }
 */
export function burst(shell, pattern = "peony", opts = {}) {
    const p = typeof pattern === "string" ? PATTERNS[pattern] : pattern;
    if (!p) throw new RangeError(`fireworkShell: no pattern "${pattern}"`);
    const rand = opts.rand || Math.random;
    // *** A NUMBER, NOT A BOOLEAN. *** 1 is physical. 0 is the pinned-decal burst, kept reachable so a
    // caller can choose it deliberately and so the gate can measure what it costs.
    const inherit = opts.inheritVelocity ?? 1;
    const jitter = opts.speedJitter ?? 0.25;
    const dirs = p.spread === "ring"
        ? ringDirections(p.n, { tilt: opts.tilt ?? 0.35, roll: opts.roll ?? 0 })
        : Array.from({ length: p.n }, () => randomDirection(rand));
    const stars = [];
    for (let i = 0; i < dirs.length; i++) {
        const [dx, dy, dz] = dirs[i];
        const sp = p.speed * (1 - jitter / 2 + rand() * jitter);
        stars.push({
            x: shell.x || 0, y: shell.y || 0, z: shell.z || 0,
            vx: (shell.vx || 0) * inherit + dx * sp,
            vy: (shell.vy || 0) * inherit + dy * sp,
            vz: (shell.vz || 0) * inherit + dz * sp,
            t: 0,
            life: p.life * (0.85 + rand() * 0.3),
            drag: p.drag, gravity: p.gravity, trail: !!p.trail,
            breakAfter: p.breakAfter ?? null, breakInto: p.breakInto ?? 0,
            breakSpeed: p.breakSpeed ?? 0, breakLife: p.breakLife ?? 0,
            generation: (shell.generation || 0) + 1,
        });
    }
    return stars;
}

/**
 * Advance every star, drop the dead, and break the ones whose own fuse fires.
 *
 * Returns a NEW array. The secondary stars appear in the SAME step their parent breaks, so a crossette's
 * four children are already flying on the frame the parent disappears rather than a frame later.
 */
export function stepStars(stars, dt, opts = {}) {
    const rand = opts.rand || Math.random;
    const maxGeneration = opts.maxGeneration ?? 3;
    const step = Math.max(0, Math.min(dt, opts.maxStep ?? 0.05));
    const out = [];
    for (const s of stars) {
        const n = stepShell(s, step, { gravity: s.gravity ?? GRAVITY, drag: s.drag ?? 0, wind: opts.wind });
        n.life = s.life - step;
        if (n.life <= 0) continue;
        // *** THE SECONDARY BREAK. *** A star with a fuse is a shell, so it bursts through the same code
        // path -- which is what stops a crossette being a special case bolted onto the side.
        if (n.breakAfter !== null && n.t >= n.breakAfter && n.generation < maxGeneration) {
            const kids = burst(n, { n: n.breakInto, speed: n.breakSpeed, spread: "sphere",
                                    life: n.breakLife, drag: n.drag, gravity: n.gravity, trail: true },
                               { rand, inheritVelocity: 1, speedJitter: 0.3 });
            for (const k of kids) out.push(k);
            continue;                                        // the parent is consumed by its own break
        }
        out.push(n);
    }
    return out;
}

/**
 * Fly a shell from launch until its fuse fires, then burst it. The whole life of a firework in one call.
 *
 * @returns { burstAt, stars, path, why } -- `why` is non-null when it never burst, which is a real outcome
 */
export function launch(from, velocity, { pattern = "peony", fuse = FUSE.ALTITUDE, altitude = 120, time = 3,
                                          dt = 1 / 240, gravity = GRAVITY, drag = 0.01, maxTime = 30,
                                          keepPath = false, ...opts } = {}) {
    let s = { x: from[0] || 0, y: from[1] || 0, z: from[2] || 0,
              vx: velocity[0] || 0, vy: velocity[1] || 0, vz: velocity[2] || 0, t: 0, generation: 0 };
    const path = keepPath ? [s] : null;
    let apex = s.y;
    while (s.t < maxTime) {
        const n = stepShell(s, dt, { gravity, drag });
        if (n.y > apex) apex = n.y;
        // *** AN ALTITUDE FUSE FIRES ON THE WAY DOWN, WHICH v4205 ALREADY GOT RIGHT AND IS WORTH REPEATING:
        // a naive `y >= altitude` fires on the way UP and puts the burst below its intended height on a
        // shell that would have gone higher.
        if (fuseFires(n, fuse, { time, altitude, distance: Infinity })) {
            if (path) path.push(n);
            // *** A SHELL THAT NEVER REACHED ITS FUSE ALTITUDE STILL BURSTS, AND THAT HAS TO BE SAID OUT
            // LOUD. *** An altitude fuse fires when y <= altitude AND the shell is descending. If the shell
            // could never climb that high, y <= altitude was true the whole flight and the fuse fires the
            // instant the shell tips over -- so it bursts at APEX, not at the height that was asked for.
            // MEASURED: launched at 55 m/s with drag 0.01 and fused at 120 m, it bursts at 69.6 m, which is
            // its apex. That is the right behaviour and the wrong silence: a caller who asked for 120 and
            // got 70 should be told, not left to wonder why the show looks low.
            // *** THE TEST IS THE APEX, NOT THE BURST HEIGHT, AND MY FIRST VERSION USED THE BURST HEIGHT. ***
            // The integrator finds the fuse at the first step where y has ALREADY dipped below the altitude,
            // so a shell that cleared 40 m perfectly well bursts at 39.9 and `n.y < altitude` calls it short.
            // That is a discretisation artefact, not a shell that failed to climb. What actually distinguishes
            // the two is whether the shell ever GOT there: apex >= altitude means it reached the fuse height
            // and the burst is legitimate wherever the step landed.
            const shortOfFuse = fuse === FUSE.ALTITUDE && apex < altitude;
            return { burstAt: n, stars: burst(n, pattern, opts), path, apex, why: null,
                     shortOfFuse,
                     shortBy: shortOfFuse ? altitude - apex : 0 };
        }
        s = n;
        if (path) path.push(s);
        if (s.y < (from[1] || 0) && s.vy < 0 && fuse !== FUSE.IMPACT) {
            return { burstAt: null, stars: [], path, apex, why: "the shell fell back to the launcher without its fuse firing -- a dud" };
        }
    }
    return { burstAt: null, stars: [], path, apex, why: `no burst within ${maxTime}s` };
}

/** The centroid of a star cloud. What tells you whether the burst is drifting with the shell. */
export function centroid(stars) {
    if (!stars.length) return [0, 0, 0];
    let x = 0, y = 0, z = 0;
    for (const s of stars) { x += s.x; y += s.y; z += s.z; }
    return [x / stars.length, y / stars.length, z / stars.length];
}

/** Mean distance of the stars from their own centroid -- the visible radius of the flower. */
export function spreadRadius(stars) {
    if (!stars.length) return 0;
    const [cx, cy, cz] = centroid(stars);
    let sum = 0;
    for (const s of stars) sum += Math.hypot(s.x - cx, s.y - cy, s.z - cz);
    return sum / stars.length;
}
