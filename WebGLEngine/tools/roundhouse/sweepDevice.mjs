// tools/roundhouse/sweepDevice.mjs
//
// v3304 -- AN INSTRUMENT, NOT A NUMBER. The roundhouse can run ONE device at ONE configuration. It cannot ask
// "vary this and show me where the physics changes" without someone writing a bespoke script, and the tree
// contains four of those -- shedOnset, zeroRangeSweep, defaultPlacementSweep, floorAtlas -- each welded to the
// one question that prompted it. This is the general tool those four are instances of.
//
//   sweepDevice("wolff", "magnetisation", { knob: "T", values: [1.8, 2.0, 2.2, 2.4] })
//
// WHAT IT ADDS BEYOND A FOR-LOOP, and it is the part worth building rather than writing inline each time:
//
//   1. MONOTONICITY IS MEASURED, NOT ASSUMED. Most physics observables should move one way as a knob turns. A
//      sweep that reports the values leaves the reader to eyeball it; this reports whether each observable is
//      monotone, and where it turns. A non-monotone error metric usually means the sweep crossed a regime
//      boundary the device does not know about.
//
//   2. AN OBSERVABLE THAT NEVER MOVES IS THE FINDING. If a knob is swept across its whole range and an
//      observable does not change AT ALL, either the knob is not wired (this tree has found that five times in
//      one session -- swapRule, sigmaWRONG, msdFn, stepFn, workFn all silently ignored) or the observable does
//      not depend on it. Both are worth knowing and neither is visible from a table of numbers you skim.
//
//   3. NON-FINITE RESULTS ARE KEPT, NOT DROPPED. A NaN at one end of a sweep is where the stable envelope ends,
//      which is a measurement -- twoFExperiment recorded a divergence as "a measurement of the envelope, not a
//      failed attempt". Silently skipping them turns a boundary into a gap in a table.
//
// It grades NOTHING. A sweep is data; what the shape means is the caller's judgement, exactly as a probe is data
// in render-qa.

import { getDevice } from "./devices.mjs";

/**
 * v3305 -- SPAN OVER TOTAL VARIATION: does this series GO somewhere, or does it WANDER?
 *
 * trend() reports null for anything non-monotone, and the first fleet run showed that is too blunt. wolff's
 * magErr turns because the sweep crosses T_c -- a real regime boundary. percolation's crossing probability also
 * "turns", and it is binomial noise scattering around an exact 0.5 with every point inside 0.85 sigma. Both
 * report trend null and they are completely different findings.
 *
 * span = |max - min| is how far the series travelled NET. Total variation is how far it travelled ALTOGETHER.
 * Their ratio is 1 for a clean monotone run, near 1 for a trend with one genuine turn, and falls toward 0 as a
 * series doubles back on itself -- which is what noise does.
 *
 * Measured: wolff magErr 0.685 (crosses T_c), percolation prob 0.408 (noise around an exact value). It is a
 * DISCRIMINATOR, not a verdict: no threshold is set here, because what counts as a boundary depends on how many
 * points were swept and how noisy the device is.
 */
export function directness(values) {
    const v = values.filter(Number.isFinite);
    if (v.length < 2) return null;
    const span = Math.max(...v) - Math.min(...v);
    let tv = 0;
    for (let i = 1; i < v.length; i++) tv += Math.abs(v[i] - v[i - 1]);
    return tv === 0 ? null : span / tv;
}

/** Direction of a numeric series: +1 rising, -1 falling, 0 flat, null non-monotone. */
export function trend(values, eps = 0) {
    const v = values.filter((x) => Number.isFinite(x));
    if (v.length < 2) return { dir: null, turns: 0, flat: v.length > 0 };
    let up = 0, down = 0, turns = 0, last = 0;
    for (let i = 1; i < v.length; i++) {
        const d = v[i] - v[i - 1];
        if (Math.abs(d) <= eps) continue;
        const s = d > 0 ? 1 : -1;
        if (s > 0) up++; else down++;
        if (last !== 0 && s !== last) turns++;
        last = s;
    }
    if (up === 0 && down === 0) return { dir: 0, turns: 0, flat: true };
    if (up > 0 && down > 0) return { dir: null, turns, flat: false };
    return { dir: up > 0 ? 1 : -1, turns: 0, flat: false };
}

/**
 * Run one device across a range of one config knob.
 * Returns the raw points AND a per-observable summary. No verdict.
 */
/**
 * v3306 -- ABSOLUTE AND RELATIVE ERROR CAN MOVE IN OPPOSITE DIRECTIONS OVER THE SAME SWEEP, and a sweep that
 * reads only one of them will report an edge that is not there.
 *
 * Measured on landauzener over v = 1..60: relWorst falls monotonically 7.13% -> 0.020%, matching the module's
 * own documented figures. errMean TURNS at v = 8. Both are correct, because P = exp(-pi D^2 / 2v) shrinks with
 * v -- a fixed relative accuracy on a shrinking quantity is a shrinking absolute error. v3305 read the errMean
 * turn as a validity edge; the module records the opposite and the extended sweep confirms the module.
 *
 * SIX DEVICES expose both kinds at once (kerr, kepler, landauzener, chaos, splat, probe), so this is a hazard of
 * the instrument rather than a quirk of one device. The sweep therefore LABELS which observables look absolute
 * and which look relative, so a reader comparing two shapes can see they are not the same question. It does not
 * prefer one -- an absolute turn is a real fact about the absolute error.
 */
const RELATIVE_NAME = /Frac$|^rel|relWorst|relErr/i;

/**
 * v4477 -- A POINT NOW RECORDS THE VALUE THE DEVICE USED, NOT ONLY THE VALUE IT WAS ASKED FOR.
 *
 * Every device clamps. `sweepDevice` handed `{ [knob]: value }` straight from the request list, so a point that
 * asked for gridN = 2560 against a clamp of 1024 was LABELLED 2560 and MEASURED 1024 -- and the point beside it
 * that asked for 1024 was the same build. Across the live device table 5612 of 17759 swept points are recorded
 * at a value the device did not use, and 1225 knob-ranges contain duplicate effective values: the sweep believes
 * it visited seven points where it visited as few as three.
 *
 * THIS IS NOT COSMETIC, AND IT IS NOT HYPOTHETICAL. v4477 built a mechanism for splat's isoRollDeviation on the
 * reading that it is exactly zero at "sigma >= 1 OR dyadic sigma" -- two disjuncts, one of them unexplained.
 * There is no second disjunct. splat clamps sigma to 1, so every row at sigma 1.05, 1.1, 1.2, 1.3, 1.5, 2 and 3
 * was the sigma = 1 row wearing another label. The sweep's own coordinate manufactured a false mechanism, and
 * that mechanism was one edit away from being planted as a positive control.
 *
 * A knob whose name collides with a point's own keys is REFUSED rather than silently overwritten -- `out` and
 * `error` were already unprotected, and the meta keys added here widen that door if it is left open.
 */
const RESERVED_POINT_KEYS = ["out", "error", "sweptAt"];

/**
 * The value a device will actually use for one knob, asked of the device's own defaults() rather than re-derived
 * from a copy of its clamps. `undefined` means NOT ANSWERABLE -- the device exposes no defaults(), or does not
 * echo the knob back -- and callers must report that as null rather than as "not coerced": an unknown is not a
 * clean bill of health.
 *
 * EXPORTED SO THE UNANSWERABLE BRANCH CAN BE RUN. The only device in the live table without defaults() is lbm,
 * and a single lbm build does not finish in two minutes, so a gate cannot reach that branch by sweeping the
 * device that exercises it in production. Taking the device as an argument lets the gate call THIS function --
 * the one sweepDevice uses -- with a device that has no defaults, instead of asserting the branch from a
 * distance or reimplementing it.
 */
/**
 * A point's coordinate record. `coerced` is null -- never false -- when the effective value is unanswerable.
 * EXPORTED for the same reason as effectiveKnob: the unanswerable case belongs to lbm, which cannot be swept
 * inside a gate's budget, and a branch nothing runs is a branch nothing guards.
 */
export function sweptAtOf(knob, requested, effective) {
    return { knob, requested, effective, coerced: effective === undefined ? null : effective !== requested };
}

/**
 * How much of a sweep is not where it says it is. Derived from the points, so it cannot drift from them.
 * `distinctEffective` is null unless EVERY point could answer: counting a Set of undefineds would report one
 * distinct configuration -- a maximally collapsed sweep -- for a device that simply cannot say.
 */
export function coercionSummary(points, values) {
    const effs = points.map((p) => p.sweptAt.effective);
    const answerable = effs.filter((e) => e !== undefined).length;
    return {
        points: points.length,
        answerable,
        coerced: points.filter((p) => p.sweptAt.coerced === true).length,
        distinctRequested: new Set(values).size,
        distinctEffective: answerable === points.length ? new Set(effs).size : null,
    };
}

export function effectiveKnob(dev, mode, config, knob, value) {
    if (!dev || typeof dev.defaults !== "function") return undefined;
    try {
        const d = dev.defaults({ mode, config: { ...config, [knob]: value } });
        return d && d.config ? d.config[knob] : undefined;
    } catch { return undefined; }
}

export async function sweepDevice(deviceName, mode, { knob, values, config = {} } = {}) {
    if (!knob || !Array.isArray(values) || values.length < 2) {
        throw new Error("sweepDevice needs a knob name and at least two values");
    }
    if (RESERVED_POINT_KEYS.includes(knob)) {
        throw new Error("sweepDevice: knob name '" + knob + "' collides with a point's own key (" + RESERVED_POINT_KEYS.join(", ") + ")");
    }
    const dev = await getDevice(deviceName);
    const effectiveOf = (value) => effectiveKnob(dev, mode, config, knob, value);
    const points = [];
    for (const value of values) {
        let out = null, error = null;
        try { out = await dev.build({ mode, config: { ...config, [knob]: value } }); }
        catch (e) { error = String((e && e.message) || e); }
        points.push({ [knob]: value, out, error, sweptAt: sweptAtOf(knob, value, effectiveOf(value)) });
    }
    const coercion = coercionSummary(points, values);

    // collect every numeric observable that appeared anywhere in the sweep
    const names = new Set();
    for (const p of points) if (p.out) for (const [k, v] of Object.entries(p.out)) if (typeof v === "number") names.add(k);

    const observables = {};
    for (const name of names) {
        const series = points.map((p) => (p.out && typeof p.out[name] === "number" ? p.out[name] : NaN));
        const finite = series.filter(Number.isFinite);
        const t = trend(series);
        observables[name] = {
            series,
            trend: t.dir, turns: t.turns,
            // 1 = went straight there; toward 0 = doubled back repeatedly. Separates a regime boundary from noise.
            directness: directness(series),
            // "never moved" is reported explicitly: an unwired knob and an independent observable look identical
            // in a table of numbers and are very different findings.
            constant: finite.length > 1 && Math.max(...finite) === Math.min(...finite),
            min: finite.length ? Math.min(...finite) : null,
            max: finite.length ? Math.max(...finite) : null,
            nonFinite: series.length - finite.length,
            // labelled, not preferred: comparing an absolute shape against a relative one is comparing two
            // different questions, and the landauzener case shows they can point opposite ways.
            kind: RELATIVE_NAME.test(name) ? "relative" : (/err/i.test(name) ? "absolute" : null),
        };
    }

    return {
        device: deviceName, mode, knob, values,
        points, observables, coercion,
        failedRuns: points.filter((p) => p.error).length,
        // an observable that moved for NO knob value is the unwired-knob signature
        constantObservables: Object.entries(observables).filter(([, o]) => o.constant).map(([k]) => k),
    };
}
