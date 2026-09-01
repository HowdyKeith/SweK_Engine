// FILE: ui/odometerModel.mjs -- v4181
//
// The arithmetic behind an odometer roll, ported from coderitual/bounty (MIT (c) 2017 coderitual).
// No DOM, no SVG -- so every part of it is gradeable in node, which is the point of splitting it out.
//
// *** WHERE THIS MAY BE USED WAS ALREADY DECIDED IN THIS TREE, AND THE RULE IS NOT MINE. *** I reasoned my
// way to "an odometer must not drive the FPS gauge" and then found ui/morphDigits.js had settled it at v3531,
// after Keith asked whether server.html's CPU gauge could count with the morph. Its rule, quoted rather than
// restated: *** A NUMBER MAY MORPH ONLY IF A READER WOULD NEVER NEED TO TRUST IT MID-TRANSITION. *** That
// admits numbers changing slowly and discretely, where the transition itself is the information -- a gate
// count ticking once a round, a version marker, a peer count -- and excludes every live gauge.
//
// An odometer is subject to it for a second reason of its own: a roll is three full rotations and about three
// and a half seconds. The dock gauges poll FPS, CPU and MEM from engine/SystemPerfMonitor.js on a per-frame
// basis, so a roll would never finish before
// the next value arrived, and the digits would blur permanently. Arriving independently at a rule this tree
// had already written down is corroboration, not a discovery, and the citation belongs here.
//
// *** AND THE ODOMETER IS NOT A DUPLICATE OF morphDigits, THOUGH IT SERVES THE SAME CLASS OF NUMBER. ***
// morphDigits interpolates the GLYPH STROKES -- a 3 bends into a 7 -- so its intermediate frames show shapes
// that are not valid digits, which is precisely the objection its own header raises. An odometer scrolls a
// strip of REAL digits past a window, so every intermediate frame is a valid digit that happens to be moving.
// They are siblings with different things to say: 420ms of reveal against three and a half seconds of "this
// counted up to here". Which one a number wants is a decision, so neither is made the default for the other's
// elements -- see the disjoint selectors in ui/odometer.js.
//
// ---- THE THREE PIECES ---------------------------------------------------------------------------------
// 1. ALIGNMENT. Two values of different lengths must be padded so digit i of one faces digit i of the other,
//    and the padding goes at the DIGIT position rather than the string start, so "999" against "1,000" gives
//    "0,999" -- pad naively and the comma lands under a digit and the columns shear.
// 2. THE ROLL. Each strip travels from its start digit to (ROTATIONS * 10 + its end digit) steps, so it spins
//    whole turns before landing. The rendered offset is that distance modulo ten steps, which is what lets an
//    eleven-cell strip (0..9 then 0 again) wrap with no seam.
// 3. THE BLUR. See blurAt() -- it is a triangle, and the original writes it as three nested absolutes.
"use strict";

import { staggerDelays } from "./stagger.mjs";

export const DIGITS = 10;
/** Whole turns before landing. The original's constant; fewer reads as a jump, more as a slot machine. */
export const ROTATIONS = 3;

export const DEFAULTS = Object.freeze({
    lineHeight: 1.35,
    duration: 3000,
    animationDelay: 100,
    letterAnimationDelay: 100,
});

/**
 * Pad `value` so it aligns digit-for-digit with `other`. Non-digits (comma, minus, currency) are carried
 * across rather than replaced by zeros.
 */
export function alignValues(value, other) {
    const chars = String(value).split("");
    const otherStr = String(other);
    const digitIndex = String(value).search(/\d/);
    if (digitIndex < 0) return chars;
    while (otherStr.length > chars.length) {
        const ch = otherStr[otherStr.length - chars.length - 1 + digitIndex];
        chars.splice(digitIndex, 0, isNaN(parseInt(ch, 10)) ? ch : "0");
    }
    return chars;
}

/** The travel for one digit, in STEPS. Always spins forward through whole turns. */
export function rollFor(from, to) {
    const f = Number(from) || 0, t = Number(to) || 0;
    return { fromSteps: f, toSteps: ROTATIONS * DIGITS + t };
}

/**
 * *** THE BLUR, AND THE ORIGINAL WRITES IT AS THREE NESTED ABSOLUTES. ***
 *
 *   |( |(|v - origin| - origin)| - S )| / 100,   with origin = (S + T) / 2
 *
 * Worked out, that is a TRIANGLE: zero at both ends of the travel, peaking at (T - S) / 2 / 100 exactly half
 * way. Written here in the form it actually is, because a reader can check a triangle and cannot check three
 * nested absolutes -- and the gate asserts the two expressions agree across the whole range, so the clearer
 * form is PROVEN equivalent rather than believed.
 *
 * The division by 100 turns travel distance into an SVG stdDeviation. It is the original's number and is
 * kept: changing it changes the look, and nothing would report that it had.
 */
export function blurAt(v, fromDist, toDist) {
    const half = Math.abs(toDist - fromDist) / 2;
    const mid = (fromDist + toDist) / 2;
    const b = (half - Math.abs(v - mid)) / 100;
    return b > 0 ? b : 0;
}

/** The original's expression, kept so the gate can prove blurAt() matches it rather than trusting algebra. */
export function blurAtOriginal(v, fromDist, toDist) {
    const origin = (fromDist + toDist) / 2;
    return Math.abs(Math.abs(Math.abs(v - origin) - origin) - fromDist) / 100;
}

/** cubic in-out, the original's easing. */
export const cubicInOut = (t) => ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;

/**
 * Where a digit's strip sits at time t, and how blurred it is.
 * @returns { offsetSteps, blur, progress } -- offsetSteps already reduced modulo ten.
 */
export function digitAt(tMs, digit, opts = {}) {
    const duration = opts.duration ?? DEFAULTS.duration;
    const delay = digit.delay ?? 0;
    const ease = opts.ease || cubicInOut;
    const { fromSteps, toSteps } = rollFor(digit.from, digit.to);
    const p = Math.min(Math.max((tMs - delay) / duration, 0), 1);
    const v = ease(p) * (toSteps - fromSteps) + fromSteps;
    let off = v % DIGITS;
    if (off < 0) off += DIGITS;
    return { offsetSteps: off, blur: blurAt(v, fromSteps, toSteps), progress: p };
}

/**
 * Per-digit start delays. *** THE RIGHTMOST DIGIT MOVES FIRST, WHICH IS WHAT MAKES IT READ AS AN ODOMETER
 * *** RATHER THAN A SCRAMBLE: on a real one the units wheel drives the tens, so units must lead. Reversing
 * it is not subtly wrong -- it is the difference between a counter and a slot machine.
 */
export function delaysFor(digitCount, opts = {}) {
    // v4197 -- the arithmetic moved to ui/stagger.mjs, which this tree had written three times (here,
    // ui/brainTrail.js and ui/peerRadar.js) with different origins. `from: "last"` IS the rule the comment
    // above insists on: the rightmost digit gets the smallest delay and therefore leads. Byte-identical to
    // the loop it replaces -- asserted in tools/ship/inputChain-selfcheck.mjs against the recorded outputs,
    // because "a refactor that changed nothing" is a claim and not a fact until something checks it.
    return staggerDelays(digitCount, {
        step: opts.letterAnimationDelay ?? DEFAULTS.letterAnimationDelay,
        start: opts.animationDelay ?? DEFAULTS.animationDelay,
        from: "last",
    });
}

/** How long the whole roll takes, stagger included -- for a caller that must not start another over it. */
export function totalDuration(digitCount, opts = {}) {
    const d = delaysFor(digitCount, opts);
    return (d.length ? Math.max(...d) : (opts.animationDelay ?? DEFAULTS.animationDelay)) + (opts.duration ?? DEFAULTS.duration);
}

/**
 * The per-digit plan for a transition. Non-digit characters carry through as fixed glyphs.
 * @returns [{ isDigit, char, from, to, delay }]
 */
export function planRoll(fromValue, toValue, opts = {}) {
    const to = alignValues(toValue, fromValue);
    const from = alignValues(fromValue, toValue);
    const isDigitAt = [];
    for (let i = 0; i < to.length; i++) {
        isDigitAt.push(!isNaN(parseInt(to[i], 10)) && !isNaN(parseInt(from[i], 10)));
    }
    const delays = delaysFor(isDigitAt.filter(Boolean).length, opts);
    const plan = [];
    let d = 0;
    for (let i = 0; i < to.length; i++) {
        if (isDigitAt[i]) plan.push({ isDigit: true, char: to[i], from: Number(from[i]), to: Number(to[i]), delay: delays[d++] });
        else plan.push({ isDigit: false, char: to[i], from: null, to: null, delay: 0 });
    }
    return plan;
}
