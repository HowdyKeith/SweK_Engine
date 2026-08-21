// WebGLEngine/tools/roundhouse/freezeBind.mjs -- v3619
//
// THE FREEZE DEVICE. It exists because "freezing is melting run backwards" is true of the EQUATION and false
// of the PHYSICS: heat crosses the LIQUID to reach a melting front and the SOLID to reach a freezing one, so
// the two are the same transcendental ABOUT DIFFERENT SUBSTANCES. Binding it as a mirror of `melt` would have
// given the roundhouse a device that could only ever agree with one already there.
//
// Three modes, and the middle one is the reason the other two can be believed:
//
//   "asymmetry"     -- the finding. Ice/water freezes about TWICE as fast as it melts at the same |dT|, and
//                      the ratio DECOMPOSES into two factors pulling opposite ways: sqrt(alpha_s/alpha_l)
//                      = 2.836 favours freezing, lambda_f/lambda_m = 0.7153 opposes it. NEITHER ALONE
//                      PREDICTS THE ANSWER, so the observable is the product against the ratio.
//   "control"       -- feed the solver ONE substance and the direction must stop mattering. The fronts tie to
//                      the digit and the enthalpy FIELDS mirror to round-off. WITHOUT THIS, "freezing is
//                      faster" cannot be told from "the freeze branch is wrong in a way that runs fast".
//   "reversibility" -- add heat, remove the same heat, land back EXACTLY. Holds everywhere including the mushy
//                      range because H IS THE STATE. The separate H -> T -> H question is reported beside it
//                      and is NOT the same claim -- the map is many-to-one on the CLOSED interval [0, rho*L].
//
// THE CONTROL MODE COMPARES FIELDS, NOT FRONTS, and that is not a detail: a front is a CELL INDEX, and the
// front-based version of this control survived a 3% freeze-only timestep sabotage because two genuinely
// different runs quantised onto the same cell.
//
// ================================================================================================================
// *** v3850 -- THAT SABOTAGE IS NOW A DECLARED PLANT, AND IT WAS SITTING IN THE PARAGRAPH ABOVE. ***
// ================================================================================================================
//
// v3619 ran a 3% freeze-only timestep perturbation, measured that the FIELD control catches it and the FRONT
// control does not, wrote the sentence, and threw the measurement away. A MEASUREMENT MADE AND DISCARDED IS
// NOT COVERAGE -- the third time this session that exact shape has turned up (freesurface's minimum-cell,
// flip3d's flat divergence, and now this), and the reason the census read three devices as bare that had all
// already run their own plants.
//
// MEASURED, the two arms, reproducing v3619's sentence to the digit:
//     controlFieldMirror   3.1332e-14  ->  6.3459e-5     A SEPARATION OF 2.0e9, off machine zero
//     controlFrontTie      true        ->  true          THE FRONT-BASED CONTROL DOES NOT NOTICE AT ALL
//     fronts               0.03475761193510985 in BOTH arms, identical to every digit
//
// *** THE SECOND LINE IS THE ROUND. *** A plant that only proved the field control works would be ordinary;
// this one proves WHY THE FIELD COMPARISON EXISTS, because the obvious front-based version of the same control
// passes the defect through untouched. The two runs really are different -- the field says so by nine orders
// -- and they quantise onto the same cell, so the cheaper observable reads a perfect tie.
//
// *** "control" IS modes[0] ON PURPOSE. *** probeModePlant compares the plant against
// `modes.find(m => m !== plantMode)`, so the primary must be THE MODE THAT OWNS THE DECLARED OBSERVABLE --
// controlFieldMirror exists only in the control branch. With "asymmetry" first the census would build an arm
// with no controlFieldMirror in it and report this device DECLARED BUT DEAD, which is precisely what mpmrefine
// read from v3802 until v3849. THE DEFAULT IS UNTOUCHED: freezeDefaults still returns "asymmetry".
// ================================================================================================================
"use strict";
import {
    LIQUIDS, pairFor, alpha, frontExact, ratioParts, twoPhase, reversibility,
} from "../../physics/thermal/freeze.mjs";
import { MATERIALS } from "../../physics/thermal/stefan.mjs";

// "control" FIRST: see the header -- controlFieldMirror lives only in that branch, and the contract compares
// the plant against modes[0].
export const FREEZE_MODES = ["control", "asymmetry", "reversibility", "slowfreeze"];

export const FREEZE_OBSERVABLES = [
    "ratioExact", "ratioSolver", "diffusivityPart", "lambdaPart", "productCheck",
    "meltFront", "freezeFront", "controlFrontTie", "controlFieldMirror",
    "addRemove", "roundTrip", "mushyShare",
    // *** v3850 -- COMPLETED. These keys were RETURNED BY THE BUILDER AND NEVER DECLARED, and nothing
    // caught it because this device was not in labDevices-selfcheck's observable-honesty check --
    // that list held 17 devices and none of the thermal four. Planting them put them in it. An
    // UNDECLARED OBSERVABLE IS INVISIBLE TO EVERY CONSUMER THAT READS THE LIST RATHER THAN THE CODE,
    // which is the whole reason the list exists. ***
    "kind", "material", "exactRatio", "cells", "meltExact", "freezeExact", "meltRelErr", "freezeRelErr",
    "alphaSolid", "alphaLiquid", "samples", "note",
];

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function freezeDefaults(hyp = {}) {
    const h = { ...hyp }, c = { ...(h.config || {}) };
    // BOUNDED: the solver is O(n^2) in wall time and this device is reachable from a model's proposal.
    c.material = LIQUIDS[c.material] ? c.material : "ice";
    c.dT = Math.min(200, Math.max(1, num(c.dT, 25)));
    c.n = Math.min(600, Math.max(60, num(c.n, 150) | 0));
    c.tEnd = Math.min(36000, Math.max(60, num(c.tEnd, 3600)));
    // THE VALIDATOR MUST LIST THE PLANT MODE, or `slowfreeze` reverts and both arms read identically (v3806).
    if (!FREEZE_MODES.includes(h.mode)) h.mode = "asymmetry";
    h.config = c;
    return h;
}

function asymmetryRun(c) {
    const P = pairFor(c.material);
    const r = ratioParts({ ...P, dT: c.dT, t: c.tEnd });
    const m = twoPhase({ ...P, dT: c.dT, freeze: false, n: c.n, len: 4 * r.melt.front, tEnd: c.tEnd });
    const f = twoPhase({ ...P, dT: c.dT, freeze: true, n: c.n, len: 4 * r.freeze.front, tEnd: c.tEnd });
    return {
        material: c.material,
        ratioExact: r.ratio, ratioSolver: m.front && f.front ? f.front / m.front : null,
        diffusivityPart: r.diffusivity, lambdaPart: r.lambdaPart,
        // THE PRODUCT IS THE CLAIM: two competing factors must multiply to the ratio, not merely bracket it.
        productCheck: Math.abs(r.product - r.ratio) / r.ratio,
        meltFront: m.front, freezeFront: f.front,
        meltExact: r.melt.front, freezeExact: r.freeze.front,
        meltRelErr: m.front === null ? null : Math.abs(m.front - r.melt.front) / r.melt.front,
        freezeRelErr: f.front === null ? null : Math.abs(f.front - r.freeze.front) / r.freeze.front,
        alphaSolid: alpha(P.solid), alphaLiquid: alpha(P.liquid),
    };
}

function controlRun(c, { planted = false } = {}) {
    // ONE SUBSTANCE BOTH PHASES. Direction must stop mattering entirely.
    const solid = MATERIALS[c.material];
    const same = { solid, liquid: solid, L: solid.L, Tm: solid.Tm };
    const r = ratioParts({ ...same, dT: c.dT, t: c.tEnd });
    const len = 4 * r.melt.front;
    // *** THE PLANT: a 3% timestep perturbation ON THE FREEZE BRANCH ONLY. It is deliberately tiny and
    // deliberately one-sided -- a symmetric change would move both runs together and the mirror would hold. ***
    const CFL = 0.2;
    const m = twoPhase({ ...same, dT: c.dT, freeze: false, n: c.n, len, tEnd: c.tEnd, cfl: CFL });
    const f = twoPhase({ ...same, dT: c.dT, freeze: true, n: c.n, len, tEnd: c.tEnd,
                         cfl: planted ? CFL * 1.03 : CFL });
    let mirror = 0;
    for (let i = 0; i < m.H.length; i++) mirror = Math.max(mirror, Math.abs(f.H[i] - (m.rhoL - m.H[i])));
    return {
        material: c.material, exactRatio: r.ratio,
        meltFront: m.front, freezeFront: f.front,
        controlFrontTie: m.front === f.front,
        // RELATIVE, because rho*L is ~3e8 for ice and an absolute number would look alarming and mean nothing.
        controlFieldMirror: mirror / m.rhoL,
        cells: m.H.length,
    };
}

function reversibilityRun(c) {
    const P = pairFor(c.material);
    const rev = reversibility(P);
    return {
        material: c.material,
        addRemove: rev.addRemove, roundTrip: rev.roundTrip,
        mushyShare: rev.mushySamples / rev.samples, samples: rev.samples,
        // THE TWO ARE DIFFERENT QUESTIONS and the device reports them separately on purpose.
        note: "addRemove holds EVERYWHERE because H is the state; roundTrip is only asked OUTSIDE the CLOSED " +
            "interval [0, rho*L], where many H share one T and there is no inverse -- endpoints included.",
    };
}

export function buildFreeze(hyp, base = {}) {
    const h = freezeDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "control") return { kind: "control", ...controlRun(h.config) };
    // The plant runs the CONTROL fixture -- same substance both phases, same everything -- and differs only
    // in the freeze branch's timestep, so the separation belongs to the defect and not to a second fixture.
    if (h.mode === "slowfreeze") return { kind: "slowfreeze", ...controlRun(h.config, { planted: true }) };
    if (h.mode === "reversibility") return { kind: "reversibility", ...reversibilityRun(h.config) };
    return { kind: "asymmetry", ...asymmetryRun(h.config) };
}

export const freezeDevice = {
    modes: FREEZE_MODES,
    // *** controlFieldMirror, and "control" is modes[0] so the contract has it in both arms. The FRONT-based
    // observables are BLIND to this plant and that is the point -- see the header. ***
    plantMode: "slowfreeze", plantFlips: "controlFieldMirror", plantKind: "mode",
    plantIdeal: 0, plantIdealWhy:
        "controlFieldMirror is the disagreement between the freeze field and the mirrored melt field, ideally 0 because the Stefan problem is symmetric under the swap; slowfreeze takes it 3.13e-14 -> 6.35e-5",
    name: "freeze-solidification",
    observables: FREEZE_OBSERVABLES,
    build: buildFreeze,
    defaults: freezeDefaults,
    materials: MATERIALS,
    liquids: LIQUIDS,
    alphaOf: alpha,
    frontExact,
};
