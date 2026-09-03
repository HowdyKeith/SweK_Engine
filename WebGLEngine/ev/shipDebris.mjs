// WebGLEngine/ev/shipDebris.mjs -- v4421
//
// *** A SHIP'S DEATH WAS ONE ADDITIVE POINT SPRITE, AND ITS COLOUR WAS THE ONE FIRE IN THIS TREE NO CENSUS
// COULD SEE. ***
//
// MEASURED FIRST, in ev/flightView.js at HEAD. A kill pushes exactly this:
//
//     explosions.push({ x: k.x, y: k.y, t: 0, life: 0.55, big: true });          // line 666
//
// and the draw is one quad growing 16 -> 86 px over 0.55 s:
//
//     arr.set([e.x, e.y, f, 0.6 * f, 0.25 * f, 4, 0, sz], o);                    // line 415
//
// The hull never leaves. `grep -n debris ev/flightView.js` returns NOTHING -- there is no fragment of any
// kind in the whole flight view, so "the ship blew up" and "a dot got bigger and faded" are the same event.
//
// ---- AND THE COLOUR IS A FIFTH FIRE THAT v4412'S CENSUS IS STRUCTURALLY BLIND TO --------------------------
//
// v4412 built render/fireColour.mjs to answer "what colour is fire at heat h?" across every fire in the tree,
// and its SOURCES table is four entries of {file, symbol, sample} -- it walks NAMED RAMP FUNCTIONS. The three
// numbers above are not a ramp and have no symbol: they are expressions inside an argument list, written
// straight into a vertex buffer. *** A CENSUS THAT ENUMERATES NAMED FUNCTIONS CANNOT SEE A COLOUR TYPED INTO
// A DRAW CALL, *** which is the same species as v4413's substring rule that could not see a path built by
// path.join, and v4418's furnace that could not see the material.
//
// MEASURED RATHER THAN ASSERTED, across the twelve files in the tree that blend additively:
//
//     file                       named-ramp refs   inline-colour buffer writes
//     star_gas.html                     4                 0
//     face/avatarStage.js               0                 1
//     ev/flightView.js                  0                 3
//     the other nine                    0                 0
//
// So the population is SMALL and it is named rather than guessed at: flightView is the only file that writes
// more than one, and the only fire in the tree with no ramp to sample is this one.
//
// *** THE FIX IS TO GIVE IT A NAME, NOT TO BUILD A SCANNER FOR INLINE COLOURS. *** explosionSample below is
// the SAME function the draw call already computed -- r = h, g = 0.6h, b = 0.25h -- extracted rather than
// invented, so the port is bit-identical at every h and the picture does not move. Once it has a symbol the
// census can hold it, which is the whole point: the fifth fire stops being invisible by construction.
//
// ---- WHAT THIS DOES NOT CLAIM -------------------------------------------------------------------------------
//
// That the explosion ramp is physically right: it is an artistic orange and v4412's own vocabulary has a word
// for that (blackbodyCandidate: false), so it is registered as one rather than held to monotonicity it never
// claimed. That the debris is a rigid-body simulation -- it is ballistic with drag and spin, no collisions,
// no mass properties; box3d exists and this deliberately does not reach for it, because a 2D flight view that
// spawns rigid bodies on every kill is a different and much larger round. And that the hull FRAGMENTS
// correctly along its geometry: the ship is drawn as a sprite or a triangle here, so the pieces are derived
// from its heading and size rather than cut from its mesh.
"use strict";

/** The colour the draw call already used, now with a name so a census can hold it. r = h, g = 0.6h, b = 0.25h. */
export const EXPLOSION_TINT = Object.freeze({ r: 1, g: 0.6, b: 0.25 });
export const explosionSample = (h) => [EXPLOSION_TINT.r * h, EXPLOSION_TINT.g * h, EXPLOSION_TINT.b * h];

/** The fade the sprite has always used: 1 at birth, 0 at `life`, clamped. */
export const fadeAt = (t, life) => Math.max(0, 1 - t / life);

/** The sprite's size curve, extracted from the same line for the same reason. */
export const spriteSize = (t, life, big) => (big ? 16 : 8) + (t / life) * (big ? 70 : 28);

/**
 * *** A DETERMINISTIC GENERATOR, BECAUSE DEBRIS THAT CANNOT BE REPRODUCED CANNOT BE GRADED. *** The same
 * Lehmer/LCG furnace.mjs uses and v4290 proved portable, so a seeded kill produces the same fragments every
 * run and a gate can assert on their positions rather than on their statistics.
 */
export function rng(seed = 1) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export const DEFAULTS = Object.freeze({
    pieces: 7,          // how many fragments a hull breaks into
    speed: 55,          // px/s outward, before the per-piece spread
    spread: 0.55,       // +/- fraction of `speed` each piece varies by
    drag: 1.6,          // per-second velocity decay -- debris slows, it does not fly forever
    life: 1.35,         // seconds; longer than the 0.55 s fireball so the pieces outlive the flash
    spin: 6.0,          // max radians/s, signed
    size: 3.2,          // px
});

/**
 * Break a hull into fragments. Pure: the ship and a seed in, an array out, nothing mutated and no clock read.
 *
 * *** THE PIECES INHERIT THE SHIP'S VELOCITY AND THEN ADD THEIR OWN. *** A ship dying at speed whose debris
 * fell straight down would read as the explosion happening to a different, stationary object -- momentum is
 * what makes the wreck belong to the ship that died.
 */
export function shatter(ship, { seed = 1, ...opt } = {}) {
    const o = { ...DEFAULTS, ...opt };
    const rand = rng(seed);
    const out = [];
    for (let i = 0; i < o.pieces; i++) {
        // Evenly spaced headings with a jitter, so the pieces cannot all leave in one direction by luck.
        const a = (i / o.pieces) * Math.PI * 2 + (rand() - 0.5) * (Math.PI * 2 / o.pieces);
        const sp = o.speed * (1 + (rand() * 2 - 1) * o.spread);
        out.push({
            x: ship.x, y: ship.y,
            vx: (ship.vx || 0) + Math.cos(a) * sp,
            vy: (ship.vy || 0) + Math.sin(a) * sp,
            ang: rand() * Math.PI * 2,
            spin: (rand() * 2 - 1) * o.spin,
            t: 0, life: o.life, size: o.size * (0.6 + rand() * 0.8),
            x0: ship.x, y0: ship.y,
        });
    }
    return out;
}

/** Advance debris. Returns the survivors, so a caller assigns rather than filtering twice. */
export function stepDebris(list, dt, { drag = DEFAULTS.drag } = {}) {
    const k = Math.max(0, 1 - drag * dt);
    for (const p of list) {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= k; p.vy *= k;
        p.ang += p.spin * dt;
        p.t += dt;
    }
    return list.filter((p) => p.t < p.life);
}

/** How far each piece has travelled from where the ship died -- the measurement "the hull never leaves" needs. */
export const reach = (list) => list.map((p) => Math.hypot(p.x - p.x0, p.y - p.y0));

/**
 * *** THE FIREBALL IS BIGGER AND SLOWER THAN THE OLD FLASH, AND THAT IS THE ONLY THING ABOUT IT THAT IS NEW.
 * *** Same ramp, same fade, same sprite path; a kill now pushes a second, larger, longer-lived sprite behind
 * the original so the flash reads as a fireball rather than a spark. Stated as numbers rather than as taste.
 */
export const FIREBALL = Object.freeze({ life: 0.9, sizeFrom: 26, sizeTo: 150 });
export const fireballSize = (t) => FIREBALL.sizeFrom + (t / FIREBALL.life) * (FIREBALL.sizeTo - FIREBALL.sizeFrom);

/** What v4421 measured. Re-take with: node ev/shipDebris-selfcheck.mjs */
export const MEASURED_AT_V4421 = Object.freeze({
    before: Object.freeze({ spritesPerDeath: 1, debrisPieces: 0, hullReachPx: 0,
                            colourSymbol: null, censusSources: 4 }),
    after: Object.freeze({ spritesPerDeath: 2, debrisPieces: DEFAULTS.pieces,
                           colourSymbol: "explosionSample", censusSources: 5 }),
    additiveFiles: 12, filesWithInlineColourWrites: 2, flightViewInlineWrites: 3,
});
