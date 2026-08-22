// physics/xpbd/modulateKey.mjs
//
// v3462 -- GRADING THE MULTI-PHYSICS SPINE, AND THE KEY IS THE PROPERTY EVERY COUPLING INHERITS FROM IT.
//
// modulate.js is the one pass fluid pressure, plasticity, thermal expansion and neural actuation all plug into:
// before the XPBD projection runs, each constraint's rest length and compliance are rewritten from an external
// field. Its header states the property the whole pipeline rests on -- "modulation ALWAYS recomputes from a
// stored BASE (rest0, compliance0), never from the value it wrote last frame. Read from the live value instead
// and heat compounds every frame." That is a falsifiable statement about the solver, and it has three edges,
// none of which is the tautology of grading a parameter against the formula that produced it:
//
//   ZERO FIELD RETURNS TO BASE   heat the mesh, then drop the field to zero: every parameter is EXACTLY rest0
//                                and compliance0 again. A live-reading spine cannot undo an accumulated dent.
//   NO FRAME COMPOUNDING         under a FIXED field, the parameter after 1 application equals the parameter
//                                after 100. This is frame-count independence -- the correct spine reads the
//                                base each time, so applying it N times is applying it once; the planted
//                                live-read multiplies again every frame and grows as (1 + expansion*T)^N.
//   ORDER FREEDOM                the map is a pure per-constraint function of the field snapshot, so scrambling
//                                the visit order changes nothing to the bit.
//
// *** THE PLANTED FAULT IS THE ONE THE HEADER NAMES, AND IT IS HONEST: at ONE application the base-reading and
// live-reading spines are IDENTICAL (after one pass the live value IS the base value once), and they diverge
// only from the second frame. A plant that differed at frame 1 would be changing something other than the term
// it claims to -- the same honest-plant test compliance.mjs makes at one iteration. *** Measured at
// expansion 0.1, field T = 0.3: correct rest holds 1.030000 at frame 1 and frame 100 (spread 0); the live-read
// plant runs 1.030000, 1.060900, ... , 1.9219e+1 at frame 100, matching (1.03)^100 = 1.9219e+1 to the digit.

import { thermalModulate, initBaseParams } from "./modulate.js";

// The thermal coefficients are a POSITIVE CONTROL, not a graded target: they are here so the field demonstrably
// does something (the mesh swells) rather than the keys reading a spine that never moved. The graded keys below
// are all invariances (return-to-base, frame-count freedom, order freedom), which is why they owe nothing to the
// particular value of these coefficients.
const EXP = 0.1, SOFT = 4.0, RING_N = 12;

function ring(n = RING_N, rest = 1.0, compliance = 1e-4) {
    const cons = [];
    for (let i = 0; i < n; i++) cons.push({ i, j: (i + 1) % n, rest, compliance });
    return cons;
}
const uniform = (n, T) => Float64Array.from({ length: n }, () => T);
// A heterogeneous field, so order-freedom and no-compounding are tested where the constraints actually differ.
const graded = (n) => Float64Array.from({ length: n }, (_, k) => 0.15 + 0.25 * (k / n));
const meanRest = (cons) => cons.reduce((s, c) => s + c.rest, 0) / cons.length;

function worstBaseDrift(cons) {
    let w = 0;
    for (const c of cons) w = Math.max(w, Math.abs(c.rest - c.rest0) / c.rest0,
                                          Math.abs(c.compliance - c.compliance0) / c.compliance0);
    return w;
}

/** Heat the ring off its base, then drop the field to zero: a base-reading spine returns EXACTLY to rest0/compliance0. */
export function zeroFieldReturn({ n = RING_N, T = 0.3 } = {}) {
    const cons = ring(n);
    thermalModulate(cons, uniform(n, T), { expansion: EXP, soften: SOFT });   // params move off base
    const swellWhileHot = meanRest(cons) / cons[0].rest0 - 1;                  // positive control: the field bit
    thermalModulate(cons, uniform(n, 0), { expansion: EXP, soften: SOFT });    // drop the field to zero
    return { zeroFieldErr: worstBaseDrift(cons), swellWhileHot };
}

/** A FIXED field applied once vs many times: the correct spine is frame-count independent, so the spread is zero. */
export function noCompounding({ n = RING_N, T = 0.3, frames = 100 } = {}) {
    const c1 = ring(n), cN = ring(n), field = uniform(n, T);
    thermalModulate(c1, field, { expansion: EXP, soften: SOFT });
    for (let f = 0; f < frames; f++) thermalModulate(cN, field, { expansion: EXP, soften: SOFT });
    let w = 0;
    for (let i = 0; i < c1.length; i++)
        w = Math.max(w, Math.abs(cN[i].rest - c1[i].rest) / c1[i].rest,
                        Math.abs(cN[i].compliance - c1[i].compliance) / c1[i].compliance);
    return { compoundErr: w, frames };
}

/** The map is a pure per-constraint function of the field snapshot: forward vs reversed visit order agree to the bit. */
export function orderIndependence({ n = RING_N } = {}) {
    const cf = ring(n), cr = ring(n), field = graded(n);
    const fwd = Array.from({ length: n }, (_, i) => i), rev = fwd.slice().reverse();
    thermalModulate(cf, field, { expansion: EXP, soften: SOFT }, fwd);
    thermalModulate(cr, field, { expansion: EXP, soften: SOFT }, rev);
    let w = 0;
    for (let i = 0; i < n; i++) w = Math.max(w, Math.abs(cf[i].rest - cr[i].rest),
                                                Math.abs(cf[i].compliance - cr[i].compliance));
    return { orderErr: w };
}

/**
 * THE PLANTED FAULT, kept out of the graded mode and exercised only by the selfcheck: recompute from the LIVE
 * value instead of the stored base. Everything else is identical to thermalModulate. It compounds as
 * (1 + EXP*T)^frames and -- the honest-plant check -- AGREES with the correct spine at exactly one application.
 */
export function livePlantedRun({ n = RING_N, T = 0.3, frames = 100 } = {}) {
    const c = ring(n);
    initBaseParams(c);
    const applyLive = () => { for (const k of c) { k.rest *= (1 + EXP * T); k.compliance *= (1 + SOFT * T); } };
    const at = {};
    for (let f = 1; f <= frames; f++) { applyLive(); if (f === 1 || f === 2 || f === frames) at[f] = c[0].rest; }
    const correct = ring(n);
    thermalModulate(correct, uniform(n, T), { expansion: EXP, soften: SOFT });
    return {
        frames,
        correctAt1: correct[0].rest,
        plantedAt1: at[1], plantedAt2: at[2], plantedAtN: at[frames],
        analyticCompound: 1.0 * Math.pow(1 + EXP * T, frames),
        agreesAtOne: correct[0].rest === at[1],
        compounds: at[frames] > at[2] && at[2] > at[1],
    };
}

/** The three graded keys plus the positive control, in the shape the xpbd device mode reports. */
export function modulateKeys(opts = {}) {
    const z = zeroFieldReturn(opts);
    const nc = noCompounding(opts);
    const oi = orderIndependence(opts);
    return {
        zeroFieldErr: z.zeroFieldErr,
        compoundErr: nc.compoundErr,
        orderErr: oi.orderErr,
        swell: z.swellWhileHot,
        swells: z.swellWhileHot > 0,
    };
}
