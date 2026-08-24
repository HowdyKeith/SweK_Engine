// tools/roundhouse/sensitivity.mjs
//
// v3436 -- WHICH KNOB MOVES WHICH OBSERVABLE, ACROSS THE WHOLE LAB.
//
// sweepDevice varies ONE knob and reports the shape of the response. Nothing asks the matrix question: for every
// knob and every observable, does turning that knob move that number? Two findings fall out of it that no
// single-knob sweep can reach --
//
//   A DEAD KNOB is a configuration parameter that moves nothing in any mode. Either it is unwired, or it belongs
//   to a code path the device no longer takes. This tree has found five silently-ignored config keys by hand;
//   this asks the same question of all of them at once.
//
//   AN INERT OBSERVABLE responds to no knob at all. Sometimes that is correct -- a defined constant SHOULD be
//   constant -- and sometimes it means a number is being reported that nothing in the device actually computes.
//
// *** TWO MEASUREMENT ERRORS WERE MADE BUILDING THIS AND BOTH ARE WORTH KEEPING. ***
//
//   FIRST: testing only the device's FIRST mode while passing its FULL default config. Knobs belonging to other
//   modes then look dead -- 37 of 101 by that method against 14 of 102 when every mode is tried. A knob is dead
//   only if it moves nothing ANYWHERE.
//
//   SECOND, and worse: counting only NUMERIC observables. acoustics:c came back dead, and c is the speed of
//   sound feeding the pipe-mode frequencies -- which are returned as an ARRAY. The knob moved
//   [171.5, 343, 514.5] to [188.65, 377.3, 565.95] and the scan could not see it. A scan that ignores a value
//   TYPE reports absence of response where there is response, which is the most misleading result a sensitivity
//   analysis can produce.

// *** A THIRD LIMITATION, FOUND BY READING THE DEAD LIST INSTEAD OF TRUSTING IT. ***
//
// inspiral:plantedPower appeared dead. It is not: the device reads it only when `planted` is true, and with
// that set it moves EIGHT observables. A knob whose effect is GATED BY ANOTHER KNOB looks dead to a scan that
// varies one at a time from the defaults, and this scan does exactly that.
//
// So a dead verdict means "moves nothing when varied alone from the declared defaults", which is weaker than
// "unused". The instrument reports the list and a person reads it -- and the first entry read turned out to be
// a false positive, which is the right rate to expect from a one-at-a-time scan over a lab with conditional
// parameters.
//
// The general fix is a two-at-a-time sweep over enabling flags, which costs quadratically and is a separate job.

/**
 * v3438 -- A MULTIPLICATIVE PERTURBATION IS WRONG FOR A COUNT.
 *
 * whitedwarf:points came back dead. It is not: the default is 8, the scan tried 8 * 1.1 = 8.8, and the device
 * floors that straight back to 8. Perturbing an INTEGER knob by a small factor can leave it unchanged, and the
 * scan then reports that nothing moved -- which is true and entirely uninformative.
 *
 * Integer-valued knobs are stepped by an ADDITIVE amount instead. points + 3 moves slopeMeasured, slopeErrAbs
 * and r2, which is what it was always going to do.
 *
 * That is the THIRD limitation this instrument has had, and all three had the same shape: the scan reported no
 * response where there was one, because of how it looked rather than what was there. Numeric-only comparison
 * missed an array; one-at-a-time missed a gated knob; a multiplicative step missed an integer.
 */
export function perturb(value) {
    if (Number.isInteger(value)) return value + Math.max(1, Math.round(Math.abs(value) * 0.25));
    return value * 1.1;
}

/** Deep-ish equality that survives arrays and nested plain objects, so a moved array is not invisible. */
export function changed(a, b) {
    if (a === b) return false;
    if (typeof a === "number" && typeof b === "number") {
        return !(Number.isNaN(a) && Number.isNaN(b)) && a !== b;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length !== b.length || a.some((v, i) => changed(v, b[i]));
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
        const ka = Object.keys(a), kb = Object.keys(b);
        return ka.length !== kb.length || ka.some((k) => changed(a[k], b[k]));
    }
    return a !== b;
}

/** Observables a device reports that are worth watching -- anything not undefined. */
const watchable = (out) => Object.keys(out || {}).filter((k) => out[k] !== undefined);

/**
 * The sensitivity matrix for one device, across ALL its modes.
 * Returns which knobs moved which observables, plus the two roll-ups.
 */
export async function deviceSensitivity(device, getDevice, { factor = 1.1 } = {}) {
    let d; try { d = await getDevice(device); } catch { return null; }
    const def = d.defaults ? d.defaults({}) : null;
    const cfg = (def && def.config) || {};
    const knobs = Object.keys(cfg).filter((k) => typeof cfg[k] === "number" && cfg[k] !== 0);
    if (!knobs.length) return { device, knobs: [], observables: [], dead: [], inert: [], untestable: true };

    const knobMoves = {}, obsMoved = {}, allObs = new Set();
    for (const mode of (d.modes || [null])) {
        let base; try { base = await d.build(mode ? { mode } : {}); } catch { continue; }
        const keys = watchable(base);
        keys.forEach((k) => allObs.add(k));
        for (const knob of knobs) {
            let out;
            try { out = await d.build({ mode, config: { ...cfg, [knob]: perturb(cfg[knob]) } }); } catch { continue; }
            const moved = keys.filter((o) => changed(base[o], out[o]));
            if (moved.length) {
                knobMoves[knob] = (knobMoves[knob] || new Set());
                moved.forEach((o) => { knobMoves[knob].add(o); obsMoved[o] = true; });
            }
        }
    }
    return {
        device,
        knobs,
        observables: [...allObs],
        matrix: Object.fromEntries(Object.entries(knobMoves).map(([k, s]) => [k, [...s]])),
        dead: knobs.filter((k) => !knobMoves[k]),
        inert: [...allObs].filter((o) => !obsMoved[o]),
        untestable: false,
    };
}

/** Roll the matrix up across the lab. */
export async function labSensitivity(deviceNames, getDevice, skip = {}) {
    const rows = [];
    for (const n of deviceNames) {
        if (skip[n]) continue;
        const r = await deviceSensitivity(n, getDevice);
        if (r) rows.push(r);
    }
    const dead = rows.flatMap((r) => r.dead.map((k) => `${r.device}:${k}`));
    const inert = rows.flatMap((r) => r.inert.map((o) => `${r.device}.${o}`));
    return {
        devices: rows.length,
        knobs: rows.reduce((s, r) => s + r.knobs.length, 0),
        observables: rows.reduce((s, r) => s + r.observables.length, 0),
        dead, inert, rows,
    };
}

// =====================================================================================================================
// v3438 -- THE TWO-AT-A-TIME SWEEP, SCOPED SO IT IS NOT QUADRATIC.
// =====================================================================================================================
//
// The one-at-a-time scan calls a knob dead when it moves nothing from the declared defaults, and
// inspiral:plantedPower proved that too weak -- it moves eight observables once `planted` is true. The general
// fix is pairs, and pairs over all 188 declared keys would be quadratic and pointless.
//
// IT DOES NOT NEED TO BE. Only a small set of keys GATE other keys, and they are identifiable: they appear in
// the bind sources as `config.X` and are declared in NO device's defaults. That is what makes them switches
// rather than settings -- a default run must never be a planted run, so `planted` is deliberately absent from
// every defaults() in the lab. Measured: 188 declared keys, and `planted` is not one of them.
//
// So the sweep is DEAD KNOBS x FLAGS, which is linear in the thing that matters. Ten dead knobs against a
// handful of flags is a few hundred builds, not tens of thousands.

/** Keys that switch a code path on rather than parameterise one. Registered, with the reason each is here. */
export const ENABLING_FLAGS = {
    planted: "the planted-error switch -- used in 23 binds and declared in NO defaults, so a default run is never planted",
    dynamicIsco: "selects a dynamically-located ISCO instead of the closed form",
    bSweep: "switches an impact-parameter sweep on",
    maxStrain: "enables a strain ceiling that otherwise does not apply",
};

/**
 * Re-test knobs that looked dead, with each enabling flag switched on in turn.
 * A knob that moves something under a flag was never dead -- it was GATED, and the two verdicts call for
 * completely different responses: a gated knob is working as designed, an unused one is a defect.
 */
export async function pairedSensitivity(deadList, getDevice, { factor = 1.1 } = {}) {
    const rescued = [], stillDead = [];
    for (const entry of deadList) {
        const [device, knob] = entry.split(":");
        let d; try { d = await getDevice(device); } catch { stillDead.push({ entry, reason: "device would not build" }); continue; }
        const def = d.defaults ? d.defaults({}) : null;
        const cfg = (def && def.config) || {};
        if (!(knob in cfg)) { stillDead.push({ entry, reason: "knob not in defaults" }); continue; }

        let found = null;
        for (const flag of Object.keys(ENABLING_FLAGS)) {
            for (const mode of (d.modes || [null])) {
                let a, b;
                try {
                    a = await d.build({ mode, config: { ...cfg, [flag]: true } });
                    b = await d.build({ mode, config: { ...cfg, [flag]: true, [knob]: perturb(cfg[knob]) } });
                } catch { continue; }
                const moved = Object.keys(a || {}).filter((o) => changed(a[o], b[o]));
                if (moved.length) { found = { flag, mode, moved }; break; }
            }
            if (found) break;
        }
        if (found) rescued.push({ entry, ...found });
        else stillDead.push({ entry, reason: "moves nothing under any registered flag either" });
    }
    return { rescued, stillDead, flagsTried: Object.keys(ENABLING_FLAGS).length };
}

// =====================================================================================================================
// v3973 -- *** THE FOURTH LIMITATION, AND THE LARGEST: A 1.1x NUDGE MEASURES A DERIVATIVE THAT IS ZERO BY DESIGN. ***
// =====================================================================================================================
//
// The dead list had ELEVEN entries and TEN OF THEM WERE FALSE POSITIVES. Measured, not argued: every one of the
// ten moves real observables the moment it is perturbed past its own scale.
//
//     blackhole:onsetTol   a bisection tolerance   moves captureOnsetR at 0.00002
//     blackhole:escSteps   an integration cap      moves escapeV at 600000
//     xpbd:tearStrain      a discrete threshold    moves tearEnd at 0.00106
//     acoustics:N          a grid size             moves propagationError at 200
//     freerotation:steps   an integration cap      moves driftWorldL at 30000
//     refscan:maxDepth     a bounce cap            moves worstAlbedoErrFrac at 1
//     sdfmarch:epsilon     a march tolerance       moves worstAgainstClosedForm at 1e-10
//     sdfmarch:maxSteps    a march cap             moves raysTraced at 1
//     galaxy:zeroTol       an eigenvalue tolerance moves zeroMultiplicity at 1
//     galaxy:maxHops       a walk cap              moves mismatches at 2
//
// THEY ARE ALL THE SAME KIND OF KNOB: tolerances, caps and thresholds, whose entire job is to do NOTHING until
// they are crossed. perturb() moves a knob by 1.1x, which asks for the LOCAL DERIVATIVE -- and for this whole
// family the local derivative is zero BY DESIGN. A cap that is not binding does not begin to bind because it
// rose ten percent; a tolerance already converged does not change its answer because it loosened ten percent.
// The scan was not measuring these knobs badly, it was measuring the wrong thing about them entirely.
//
// That is the FOURTH time this instrument has reported no response where there was one, and every one of the
// four had the same shape -- a limit of HOW IT LOOKED, not of what was there. Numeric-only comparison missed an
// array; one-at-a-time missed a gated knob; a multiplicative step missed an integer; and a small step misses
// everything whose response is a cliff rather than a slope.
//
// *** THE LADDER IS SAFE BY CONSTRUCTION, WHICH IS NOT A DETAIL. *** Integers go strictly DOWN. A slack cap only
// binds when lowered, and lowering a step count strictly REDUCES the work -- so escalation can never turn a
// 200000-step run into a 200-million-step one. Raising an integer would be both the wrong probe and an
// unbounded cost. Floats go three orders each way, which is cheap because a tolerance does not drive a loop.
//
// *** AND ONE RUNG WAS ADDED AFTER A MEASUREMENT, WHICH IS RECORDED RATHER THAN SMOOTHED OVER. *** galaxy:zeroTol
// survived the +/-3-order ladder. Its default is 1e-8 and the answer turns at the FIEDLER VALUE, 0.0564 --
// 5.6 MILLION times the default, further than any fixed order-of-magnitude ladder reaches. The rung added is
// not "whatever makes galaxy pass": a DIMENSIONLESS TOLERANCE BELOW ONE IS MEANINGFUL OVER (0, 1], so a probe
// that does not reach O(1) has not spanned the knob's range at all. It is stated as a property of that kind of
// knob, and it was found by measuring where this one actually turns rather than by widening until green.

/** The values a knob is retried at once a 1.1x nudge has found nothing. Integers strictly downward. */
export function escalations(v) {
    if (!Number.isFinite(v) || v === 0) return [];
    if (Number.isInteger(v)) {
        // Strictly down: cost falls, and a cap that never binds is exactly the thing lowering exposes.
        return [...new Set([Math.floor(v / 2), Math.floor(v / 10), 1])].filter((x) => x >= 1 && x !== v);
    }
    const out = [v * 1e-3, v * 1e3];
    if (Math.abs(v) < 1) out.push(1);   // span the whole meaningful range of a sub-unit tolerance
    return [...new Set(out)].filter((x) => Number.isFinite(x) && x !== v);
}

/**
 * Re-test knobs that STILL look dead after the flag sweep, at magnitudes rather than nudges.
 * A knob rescued here was never dead -- it is a tolerance, a cap or a threshold, and the scan was asking it
 * for a slope when its response is a cliff.
 */
export async function escalatedSensitivity(stillDeadList, getDevice) {
    const rescued = [], stillDead = [];
    for (const item of stillDeadList) {
        const entry = typeof item === "string" ? item : item.entry;
        const [device, knob] = entry.split(":");
        let d; try { d = await getDevice(device); } catch { stillDead.push({ entry, reason: "device would not build" }); continue; }
        const cfg = ((d.defaults ? d.defaults({}) : null) || {}).config || {};
        if (!(knob in cfg)) { stillDead.push({ entry, reason: "knob not in defaults" }); continue; }

        let found = null;
        outer:
        for (const val of escalations(cfg[knob])) {
            for (const mode of (d.modes || [null])) {
                let a, b;
                try {
                    a = await d.build({ mode, config: { ...cfg } });
                    b = await d.build({ mode, config: { ...cfg, [knob]: val } });
                } catch { continue; }
                const moved = Object.keys(a || {}).filter((o) => changed(a[o], b[o]));
                if (moved.length) { found = { value: val, mode, moved }; break outer; }
            }
        }
        if (found) rescued.push({ entry, ...found });
        else stillDead.push({ entry, reason: "moves nothing at three orders either way, or down to a binding cap" });
    }
    return { rescued, stillDead };
}
