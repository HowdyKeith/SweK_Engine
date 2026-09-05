// WebGLEngine/world/explosionRecipe.mjs -- v4430
//
// *** #69 SAYS THE SPACE EXPLOSIONS ARE A RECIPE AND NOT A PORT. THE COMPARISON THAT SETTLES IT HAS NEVER
// BEEN RUN, AND IT DOES NOT COME OUT AS A TOLERANCE. ***
//
// The tree holds both halves and they have never been put beside each other:
//
//     world/spellBook.mjs   burstFor() -- a RECIPE. Six numbers per spell (count, speed, ttl, size, colour,
//                           gravity) expanded into particles. The cast site draws them and nothing else.
//     ev/shipDebris.mjs     shatter() + stepDebris() -- a PORT. Real code: stratified headings, inherited
//                           hull velocity, per-frame drag, spin, a colour that is a function of the fade, a
//                           sprite that grows, and a SECOND population (the fireball) with its own life.
//
// The question is whether the recipe can express what the port does. Measured, TWO OF THE GAPS ARE
// CATEGORICAL RATHER THAN APPROXIMATE, which is the shape of answer that decides a round.
//
// ---- *** GAP 1: NO VALUE OF `gravity` CAN SLOW A PARTICLE, AND THE PORT'S ONLY VELOCITY TERM SLOWS. *** ----
//
// The recipe's motion is x + v*t with v.y accumulating `gravity`. Start a particle at (v0, 0) and the speed
// at time t is sqrt(v0^2 + (g t)^2) -- MONOTONICALLY NON-DECREASING IN |g| AND IN t, for every g. The port's
// stepDebris multiplies velocity by (1 - drag*dt) every frame, so its speed is monotonically DECREASING.
//
// This was fitted before it was proved, and the fit says the same thing more loudly: sweeping g over
// [-60, 0] against the port's speed curve, the least-bad gravity is EXACTLY 0 -- "do nothing" beats every
// value on offer -- and the residual is 35.19 px/s RMS against a 55 px/s launch, 64.0% of the launch speed.
// A best fit that chooses the identity is not a poor fit, it is a statement that the family is wrong.
//
//     port speed over one 1.35 s life:   55.0 -> 35.7 -> 23.2 -> 15.0 -> 9.8 -> 6.3
//     recipe, at its best-fit gravity:   55.0 -> 55.0 -> 55.0 -> 55.0 -> 55.0 -> 55.0
//
// ---- *** GAP 2: THE RECIPE HOLDS CONSTANT WHAT THE PORT MAKES A FUNCTION OF TIME. *** ---------------------
//
// Colour and size are single values in the recipe and curves in the port. Over one debris life:
//
//     colour       port 1.000,0.600,0.250  ->  0.007,0.004,0.002        recipe: one triple, fixed
//     sprite       port 8.0 px             ->  35.8 px                  recipe: one size, fixed
//     fireball     port 26 px              ->  150 px  (its own 0.9 s)   recipe: no second population at all
//
// A constant is not a badly-tuned function. There is no assignment of `colour` or `size` that varies.
//
// ---- *** GAP 3: THE PORT STRATIFIES ITS HEADINGS AND THE RECIPE DRAWS THEM INDEPENDENTLY -- AND shatter's
// COMMENT ABOUT THIS HAS NEVER BEEN CHECKED. *** -------------------------------------------------------------
//
// shatter says "evenly spaced headings with a jitter, so the pieces cannot all leave in one direction by
// luck". That is a claim with a bound in it: heading i is (i/n)*TAU plus a jitter of at most half a slot
// either way, so no gap between neighbours can reach 2*(TAU/n). Measured over 20,000 seeds at n = 7:
//
//     port, evenly spaced + jitter    mean worst gap 1.4257   max 1.7923   over the bound: 0 of 20,000
//     independent uniform draws       mean worst gap 2.3278   max 5.7787   over the bound: 16,015 of 20,000
//     the bound 2*(TAU/7)                                     1.7952
//
// *** THE COMMENT IS EXACTLY TRUE AND THE MAXIMUM SITS 0.0029 UNDER A BOUND NOTHING HAD DERIVED. *** And the
// recipe's draw, which is independent, breaks it 80.1% of the time -- so "the pieces cannot all leave in one
// direction by luck" is a property the recipe does not have and cannot be given by choosing numbers.
//
// ---- AND ONE GAP THAT MEASURED AS NOT A GAP, WHICH IS WHAT MAKES THE PORT PORTABLE ------------------------
//
// stepDebris applies drag as a PER-FRAME multiply, so its trajectory could in principle depend on the frame
// rate, and a recipe -- which is integrated analytically at the cast site -- could not reproduce it. Checked
// before it was assumed: mean reach over one life is 30.44 px at 15 fps and 29.74 px at 240 fps, 2.4% across
// a sixteenfold range, and at 60 fps every one of the seven pieces sits 0.4% above the closed form
// v0*(1 - exp(-drag*t))/drag. *** SO THE CONTINUOUS LAW IS A FAITHFUL STATEMENT OF THE PORT'S DRAG *** and
// the recipe can carry drag as a number without importing a frame-rate dependence. A negative result, and
// the one that says the extension is honest rather than a re-implementation.
//
// ---- THE TRANSLATION IS DERIVED FROM THE PAGE, NEVER TYPED ------------------------------------------------
//
// The port is in PIXELS and the book is in world units, so a port-derived spell needs a scale -- and a typed
// scale would be exactly the second source of truth spellBook.mjs exists to refuse. spellbook.html draws
// every particle at `p.size * scale` with `scale = 16`, so the page itself states the conversion, and
// pxPerUnit() reads it out of the page the way v4427's wgslSmin reads the shader out of its own file.
//
// *** AND IT LANDS ON A NUMBER THE BOOK ALREADY HAS. *** The port's debris sprite is 3.2 px; 3.2 / 16 is
// 0.2000, which is quake's particle size exactly. The two halves were already drawing the same sized speck
// and nobody had noticed, because nothing had ever converted between them.
"use strict";

import { DEFAULTS as PORT_DEFAULTS, FIREBALL, fadeAt, spriteSize, explosionSample, rng as portRng }
    from "../ev/shipDebris.mjs";

export const TAU = Math.PI * 2;

/* ---------------------------------------------------------------------------------------------------------
 * THE SCALE, READ FROM THE CAST SITE
 * ------------------------------------------------------------------------------------------------------ */

/** Pixels per world unit, parsed out of spellbook.html's own draw. A typed copy would be a second truth. */
export function pxPerUnit(src) {
    const m = /cy = cv\.height \* [\d.]+, scale = (\d+(?:\.\d+)?)/.exec(src);
    return m ? Number(m[1]) : NaN;
}

/* ---------------------------------------------------------------------------------------------------------
 * GAP 1 -- GRAVITY CANNOT SLOW ANYTHING. PROVED, THEN FITTED, AND THE FIT AGREES.
 * ------------------------------------------------------------------------------------------------------ */

/** The recipe's speed at time t for a particle launched at v0 along x, under constant `gravity` on y. */
export const recipeSpeed = (v0, gravity, t) => Math.hypot(v0, gravity * t);

/** The port's speed at time t: a per-frame multiply by (1 - drag*dt). */
export function portSpeed(v0, drag, t, dt = 1 / 60) {
    let v = v0;
    for (let s = 0; s + 1e-12 < t; s += dt) v *= Math.max(0, 1 - drag * dt);
    return v;
}

/**
 * *** THE CATEGORICAL FORM OF GAP 1, AS A COMPUTATION RATHER THAN A SENTENCE IN A COMMENT. ***
 * For every gravity in the sweep and every t > 0, is the recipe's speed at least its launch speed? A single
 * counterexample would mean the recipe CAN slow a particle and the whole finding is wrong.
 */
export function gravityNeverSlows(v0 = 55, life = PORT_DEFAULTS.life, steps = 200) {
    let checked = 0, violations = 0;
    for (let g = -60; g <= 60; g += 0.25) {
        for (let i = 1; i <= steps; i++) {
            const t = (i / steps) * life;
            checked++;
            if (recipeSpeed(v0, g, t) < v0 - 1e-12) violations++;
        }
    }
    return { checked, violations };
}

/** The best gravity the recipe can offer against the port's speed curve, and what it still costs. */
export function bestGravityFit(v0 = 55, drag = PORT_DEFAULTS.drag, life = PORT_DEFAULTS.life, dt = 1 / 60) {
    const target = [];
    for (let t = 0; t + 1e-12 < life; t += dt) target.push(portSpeed(v0, drag, t, dt));
    let bestG = NaN, bestErr = Infinity;
    for (let g = -60; g <= 0; g += 0.05) {
        let e = 0;
        for (let i = 0; i < target.length; i++) e += (recipeSpeed(v0, g, i * dt) - target[i]) ** 2;
        if (e < bestErr) { bestErr = e; bestG = g; }
    }
    return { gravity: Math.abs(bestG) < 1e-9 ? 0 : bestG, rms: Math.sqrt(bestErr / target.length),
             rmsFraction: Math.sqrt(bestErr / target.length) / v0, samples: target.length };
}

/* ---------------------------------------------------------------------------------------------------------
 * GAP 3 -- STRATIFIED VERSUS INDEPENDENT HEADINGS, AND THE BOUND shatter's COMMENT IMPLIES
 * ------------------------------------------------------------------------------------------------------ */

/** The largest angular gap between neighbouring headings, wrapping round the circle. */
export function worstGap(angles) {
    const a = angles.map((x) => ((x % TAU) + TAU) % TAU).sort((p, q) => p - q);
    if (a.length < 2) return TAU;
    let w = a[0] + TAU - a[a.length - 1];
    for (let i = 1; i < a.length; i++) w = Math.max(w, a[i] - a[i - 1]);
    return w;
}

/**
 * The bound the port's construction implies, DERIVED rather than observed: neighbouring headings are one slot
 * apart plus the difference of two jitters, each within half a slot, so a gap is strictly under two slots.
 */
export const gapBound = (n) => 2 * (TAU / n);

/** shatter's headings, transcribed so the gate can compare the transcription to the original. */
export const stratifiedHeadings = (n, rand) =>
    Array.from({ length: n }, (_, i) => (i / n) * TAU + (rand() - 0.5) * (TAU / n));

/** What an independent draw gives -- the family burstFor belongs to. */
export const independentHeadings = (n, rand) => Array.from({ length: n }, () => rand() * TAU);

/** Both families over many seeds, so the comparison is a distribution and not one lucky picture. */
export function headingCensus(n = PORT_DEFAULTS.pieces, trials = 20000) {
    const bound = gapBound(n);
    const acc = { stratified: { sum: 0, max: 0, over: 0 }, independent: { sum: 0, max: 0, over: 0 } };
    for (let s = 1; s <= trials; s++) {
        for (const [key, make, seed] of [["stratified", stratifiedHeadings, s], ["independent", independentHeadings, s + 1e6]]) {
            const g = worstGap(make(n, portRng(seed)));
            const a = acc[key];
            a.sum += g; if (g > a.max) a.max = g; if (g > bound) a.over++;
        }
    }
    return {
        n, trials, bound, uniform: TAU / n,
        stratified: { mean: acc.stratified.sum / trials, max: acc.stratified.max, over: acc.stratified.over },
        independent: { mean: acc.independent.sum / trials, max: acc.independent.max, over: acc.independent.over },
    };
}

/* ---------------------------------------------------------------------------------------------------------
 * THE NEGATIVE RESULT -- THE PORT'S DISCRETE DRAG IS THE CONTINUOUS LAW, SO A NUMBER CAN CARRY IT
 * ------------------------------------------------------------------------------------------------------ */

/** How far a piece travels under dv/dt = -drag*v. Closed form: no frame rate appears in it. */
export const analyticReach = (v0, drag, t) => v0 * (1 - Math.exp(-drag * t)) / drag;

/** How far the port's per-frame multiply actually carries it, at a given dt. */
export function discreteReach(v0, drag, life, dt) {
    let v = v0, x = 0;
    for (let t = 0; t + 1e-12 < life; t += dt) { x += v * dt; v *= Math.max(0, 1 - drag * dt); }
    return x;
}

/** The spread across frame rates, which is the thing that would make drag unportable if it were large. */
export function dragFrameRateSpread(v0 = 55, drag = PORT_DEFAULTS.drag, life = PORT_DEFAULTS.life,
                                    rates = [15, 24, 30, 60, 120, 240]) {
    const by = rates.map((fps) => ({ fps, reach: discreteReach(v0, drag, life, 1 / fps) }));
    const lo = by[0].reach, hi = by[by.length - 1].reach;
    const analytic = analyticReach(v0, drag, life);
    return { by, spread: lo / hi - 1, analytic, at60: discreteReach(v0, drag, life, 1 / 60),
             at60Error: discreteReach(v0, drag, life, 1 / 60) / analytic - 1 };
}

/* ---------------------------------------------------------------------------------------------------------
 * THE SPELL, DERIVED FROM THE PORT RATHER THAN TYPED BESIDE IT
 * ------------------------------------------------------------------------------------------------------ */

/**
 * ev/shipDebris.mjs's own numbers, converted at the page's own scale, as a spell-book burst.
 *
 * *** EVERY FIELD HERE IS AN EXPRESSION OVER THE PORT, NOT A LITERAL. *** That is the whole argument of
 * spellBook.mjs applied one level up: the book refuses a typed COST because it would drift from the work,
 * and a port-derived spell must refuse typed NUMBERS because they would drift from the port. Change
 * DEFAULTS.speed in ev/ and this spell changes with it.
 */
export function novaFromPort(px, port = PORT_DEFAULTS, fire = FIREBALL) {
    return {
        count: port.pieces,
        speed: port.speed / px,
        spread: port.spread,
        ttl: port.life,
        size: port.size / px,
        colour: explosionSample(1),                    // the tint at full brightness; `fade` carries the rest
        gravity: 0,                                    // there is no gravity in space, and none in the port
        drag: port.drag,
        stratify: true,
        fade: true,                                    // colour *= remaining life, as explosionSample(fadeAt)
        grow: spriteSize(port.life, port.life, false) / spriteSize(0, port.life, false),
        flash: { life: fire.life, sizeFrom: fire.sizeFrom / px, sizeTo: fire.sizeTo / px },
    };
}

/** What v4430 measured. Re-take with: node tools/ship/explosionRecipe-selfcheck.mjs */
export const MEASURED_AT_V4430 = Object.freeze({
    pxPerUnit: 16,
    portDebrisSizeInBookUnits: 0.2,
    quakeParticleSize: 0.2,
    bestFitGravity: 0,
    bestFitRmsFraction: 0.64,
    gravityNeverSlowsViolations: 0,
    headingBoundAt7: 1.7951958020513104,
    stratifiedMaxGap: 1.7923,
    stratifiedOverBound: 0,
    independentOverBound: 16015,
    independentTrials: 20000,
    dragSpread15to240: 0.024,
    dragAt60ErrorVsAnalytic: 0.004,
});
