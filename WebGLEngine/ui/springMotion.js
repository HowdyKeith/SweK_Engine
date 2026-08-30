// WebGLEngine/ui/springMotion.js -- v4114
//
// A SPRING, NOT AN EASE -- ONE INTEGRATOR, SHARED BY EVERY SURFACE THAT WANTS PHYSICAL MOTION.
//
// Keith, pointing at hiaaryan/sileo ("an opinionated, PHYSICS-BASED toast component"): could our toasts move
// like that. *** NONE OF SILEO'S CODE IS USED HERE, AND NONE COULD BE: *** it is a React component library
// (this tree ships no React), and its repository carries NO LICENSE FILE -- checked, 404 -- which makes it
// all-rights-reserved and unusable in a tree that publishes public release zips. What is adopted is the IDEA,
// which is not sileo's to own anyway: a damped harmonic oscillator is how iOS, react-spring and framer-motion
// have all animated for years.
//
// *** WHY A MODULE AND NOT TWO SPRINGS. *** This tree has TWO in-engine toast surfaces already -- ui/toast.js
// (centre-top, fade + 6px rise) and ui/toaster.js (top-right, 380px slide) -- plus confirmToast.js. Writing
// the integrator into whichever one was upgraded first, then again into the second, is the second-copy defect
// this session has now watched land repeatedly. The physics lives here once; a surface supplies its own
// numbers and reads a position back.
//
// *** AND BECAUSE IT IS PURE, IT IS GRADED LIKE THE REST OF THIS TREE'S PHYSICS. *** step() takes a state and
// a dt and returns the next state. No DOM, no rAF, no timers. So the gate can settle a thousand springs,
// measure the OVERSHOOT AGAINST THE DAMPING RATIO THAT PREDICTS IT, and prove a backgrounded tab cannot
// teleport a toast across the screen -- none of which a person watching an animation can tell you.
"use strict";

/**
 * A spring is (stiffness, damping, mass). The behaviour that matters to a reader is the DAMPING RATIO:
 *
 *     zeta = damping / (2 * sqrt(stiffness * mass))
 *
 *     zeta <  1  underdamped   -- overshoots the target and comes back. The "bouncy" feel.
 *     zeta == 1  critical      -- fastest approach with NO overshoot.
 *     zeta >  1  overdamped    -- slow, no overshoot.
 *
 * Exported so a caller can ASK rather than guess, and so the gate can check the implementation actually
 * behaves the way the ratio predicts instead of merely storing the number.
 */
export function dampingRatio({ stiffness, damping, mass = 1 }) {
    const denom = 2 * Math.sqrt(Math.max(1e-9, stiffness * mass));
    return damping / denom;
}

/**
 * Named presets, each with the ratio it is aiming for stated rather than left to be derived by eye.
 * `gentle` and `snappy` are deliberately just under critical -- a small, quick overshoot is what makes a
 * spring read as physical rather than as a slow ease -- and `stiff` is critical for surfaces where any
 * overshoot would look like a bug (a toast that must not cross a screen edge).
 */
// *** THE FIRST TUNING WAS MEASURED AND REJECTED, WHICH IS WHY THESE NUMBERS ARE WHAT THEY ARE. *** The
// opening draft used zeta ~= 0.81, and settling it reported an overshoot of 0.6-0.8% of travel -- on a 380px
// slide that is under three pixels, VISUALLY INDISTINGUISHABLE FROM AN EASE. A spring nobody can see is an
// ease with extra arithmetic, so it would have been the whole feature failing quietly while every check
// passed. Retuned to zeta ~= 0.59, which the standard overshoot relation exp(-pi*z/sqrt(1-z^2)) puts near 10%
// and settling MEASURES at 8.9-9.2% -- 34-35px on that same slide, which reads as physical.
export const PRESETS = {
    gentle: { stiffness: 120, damping: 13, mass: 1 },   // zeta 0.593, MEASURED 8.9% overshoot, settles 0.98s
    snappy: { stiffness: 260, damping: 19, mass: 1 },   // zeta 0.589, MEASURED 9.2% overshoot, settles 0.68s
    stiff:  { stiffness: 210, damping: 29, mass: 1 },   // zeta 1.001, MEASURED 0.0% overshoot, settles 0.72s -- for edges that must not be crossed
};

// ---------------------------------------------------------------------------------------------------------------
// v4158 -- THE SAME SPRING, SOLVED RATHER THAN STEPPED, AS A CSS easing FUNCTION
// ---------------------------------------------------------------------------------------------------------------
//
// *** WHY BOTH FORMS EXIST, BECAUSE THEY ARE NOT ALTERNATIVES. *** step() above is a NUMERICAL integrator: it
// takes a state and a dt and can be RETARGETED MID-FLIGHT, which is what a toast that gets interrupted needs.
// It also runs on the main thread, one call per frame. springToCssLinear solves the same differential equation
// IN CLOSED FORM and samples it into a CSS `linear(...)` easing, so the browser animates it ON THE COMPOSITOR
// and a busy main thread cannot make it stutter -- at the cost of being a BAKED CURVE that cannot be
// interrupted or retargeted. Fire-and-forget motion wants this one; anything that can change its mind wants
// step(). The idea is lochie/torph's (MIT), which packages a spring as an easing string; the damped harmonic
// oscillator itself is textbook, and this file's own header already makes that argument about sileo.
//
// *** THE PARAMETERS ARE THE SAME PRESETS, ON PURPOSE. *** A CSS transition and a JS toast that disagree about
// what "snappy" means is the second-declaration defect this module was created to end, arriving by a new door.
//
// *** AND THE CRITICAL BAND IS HANDLED SEPARATELY, WHICH THE OBVIOUS IMPLEMENTATION GETS WRONG. *** The
// overdamped solution divides by (r2 - r1), and those roots COINCIDE at zeta == 1 -- so the general form is a
// division by zero exactly at critical damping and loses precision to catastrophic cancellation on either side
// of it. THIS TREE'S `stiff` PRESET IS zeta 1.001, which is inside that band, so it is not a hypothetical edge:
// it is the preset meant for surfaces where overshoot would look like a bug.
const CRITICAL_BAND = 1e-3;

/** Exact position of a unit-step spring at time t (seconds), starting at rest. Returns 0..~1. */
export function springPosition(t, omega0, zeta) {
    if (!(t > 0)) return 0;
    if (Math.abs(zeta - 1) < CRITICAL_BAND) {                       // critically damped: the closed form, no division
        return 1 - (1 + omega0 * t) * Math.exp(-omega0 * t);
    }
    if (zeta < 1) {                                                  // underdamped: oscillates, overshoots
        const wd = omega0 * Math.sqrt(1 - zeta * zeta);
        return 1 - Math.exp(-zeta * omega0 * t) * (Math.cos(wd * t) + (zeta * omega0 / wd) * Math.sin(wd * t));
    }
    const sq = Math.sqrt(zeta * zeta - 1);                           // overdamped: two real roots, no overshoot
    const r1 = -omega0 * (zeta + sq), r2 = -omega0 * (zeta - sq);
    const B = -r1 / (r2 - r1), A = 1 - B;
    return 1 - A * Math.exp(r1 * t) - B * Math.exp(r2 * t);
}

/**
 * How long until it is settled, in ms.
 *
 * *** SETTLED MEANS "STAYED INSIDE THE TOLERANCE", NOT "TOUCHED IT". *** An underdamped spring crosses its
 * target on every oscillation, so a test that stops at the first crossing reports a spring as finished while it
 * is still visibly ringing. step() above does not need this rule because it has a VELOCITY to consult and
 * checks both; a closed-form position has no velocity to hand, so the dwell is what replaces it.
 */
export function springDuration(omega0, zeta, precision = 0.001, { step: dt = 0.001, max = 10, dwell = 0.1 } = {}) {
    let inside = 0;
    for (let t = 0; t < max; t += dt) {
        if (Math.abs(springPosition(t, omega0, zeta) - 1) > precision) inside = 0;
        else { inside += dt; if (inside > dwell) return Math.ceil((t - inside + dt) * 1000); }
    }
    return Math.ceil(max * 1000);
}

const _linearCache = new Map();

/**
 * A preset (or raw {stiffness, damping, mass}) as a CSS `linear()` easing plus its duration in ms.
 *
 * @returns { easing, durationMs, zeta, points }  -- `easing` drops straight into a transition-timing-function
 */
export function springToCssLinear(preset = "snappy", { precision = 0.001, maxPoints = 100 } = {}) {
    const p = (typeof preset === "string" ? PRESETS[preset] : preset) || PRESETS.snappy;
    const mass = p.mass || 1;
    const key = p.stiffness + ":" + p.damping + ":" + mass + ":" + precision + ":" + maxPoints;
    const hit = _linearCache.get(key);
    if (hit) return hit;

    const omega0 = Math.sqrt(p.stiffness / mass);
    const zeta = dampingRatio(p);                                    // the SHARED helper, not a second formula
    const durationMs = springDuration(omega0, zeta, precision);
    const n = Math.min(maxPoints, Math.max(32, Math.round(durationMs / 15)));
    const points = [];
    for (let i = 0; i < n; i++) {
        // The LAST point is pinned to exactly 1. Sampling it would leave a curve that ends a fraction short,
        // and CSS would then animate to that fraction and stop -- an element resting a hair off its target,
        // which is the same defect step()'s snap-on-rest exists to prevent, in the other engine.
        const v = i === n - 1 ? 1 : springPosition((i / (n - 1)) * (durationMs / 1000), omega0, zeta);
        points.push(Math.round(v * 10000) / 10000);
    }
    const out = { easing: "linear(" + points.join(", ") + ")", durationMs, zeta, points };
    _linearCache.set(key, out);
    return out;
}

/** Rest thresholds. Both must be met: a spring at the target still MOVING is not at rest. */
const REST_X = 0.001, REST_V = 0.01;

/** A fresh spring state. `x` is the current value, `v` its velocity, `target` where it is heading. */
export function makeSpring(from, to, preset = "snappy") {
    const p = (typeof preset === "string" ? PRESETS[preset] : preset) || PRESETS.snappy;
    return { x: +from || 0, v: 0, target: +to || 0, stiffness: p.stiffness, damping: p.damping, mass: p.mass || 1, done: false };
}

/**
 * Advance one spring by `dt` SECONDS. Returns a NEW state; the input is not mutated.
 *
 * *** dt IS CLAMPED, AND SUBSTEPPED, AND THE TWO DO DIFFERENT JOBS. ***
 * A backgrounded tab hands the next frame a dt of several seconds. Unclamped, semi-implicit Euler on a stiff
 * spring does not merely jump -- IT GOES UNSTABLE, because the integrator's stability limit is roughly
 * dt < 2/sqrt(k/m); past that the velocity grows every step and the toast flies off screen instead of
 * settling. So the clamp bounds the total, and substepping keeps each individual step inside the stable
 * region even for the stiffest preset. gestureVfx.js clamps for the same reason one file over, but a particle
 * only LOOKED wrong when it jumped; a spring genuinely diverges.
 */
export function step(s, dt, opts = {}) {
    if (!s) return s;
    const maxStep = opts.maxStep != null ? opts.maxStep : 0.064;   // ~4 frames at 60Hz
    const total = Math.max(0, Math.min(+dt || 0, maxStep));
    if (total === 0) return { ...s };
    // Keep every substep well inside the stability limit for the stiffness in play.
    const safe = 1 / Math.max(60, Math.sqrt(s.stiffness / Math.max(1e-6, s.mass)) * 8);
    const n = Math.max(1, Math.ceil(total / safe));
    const h = total / n;
    let { x, v } = s;
    for (let i = 0; i < n; i++) {
        const a = (-s.stiffness * (x - s.target) - s.damping * v) / s.mass;
        v += a * h;
        x += v * h;
    }
    const done = Math.abs(x - s.target) < REST_X && Math.abs(v) < REST_V;
    // SNAP ON REST, deliberately: a spring that is done must sit EXACTLY on its target, or a toast settles a
    // thousandth of a pixel off and the browser keeps a composite layer alive for a value nobody can see.
    return done ? { ...s, x: s.target, v: 0, done: true } : { ...s, x, v, done: false };
}

/** Has it arrived? Kept as a function so the rest rule has ONE definition. */
export function atRest(s) { return !!(s && s.done); }

/**
 * Settle a spring to rest with a FIXED timestep and a hard iteration cap, returning the trace.
 *
 * This is the gate's instrument, not a runtime path: it is what makes "does this preset overshoot, and by how
 * much" a measurement rather than an opinion. The cap exists so a mis-specified spring reports a failure
 * instead of hanging the process.
 */
export function settle(s, { dt = 1 / 60, maxSteps = 2000 } = {}) {
    const xs = [s.x];
    let cur = s, steps = 0;
    while (!cur.done && steps < maxSteps) { cur = step(cur, dt); xs.push(cur.x); steps++; }
    const from = s.x, to = s.target, span = to - from;
    // Overshoot as a FRACTION of the travel, signed so direction does not hide it. Zero when it never passes
    // the target. Measured from the trace rather than predicted from the coefficients -- the whole point.
    let overshoot = 0;
    if (span !== 0) for (const x of xs) { const past = (x - to) / span; if (past > overshoot) overshoot = past; }
    return { steps, settled: cur.done, xs, overshoot, final: cur.x };
}
