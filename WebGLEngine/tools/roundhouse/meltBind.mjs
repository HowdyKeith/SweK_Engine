// WebGLEngine/tools/roundhouse/meltBind.mjs -- v3618
//
// THE MELT DEVICE -- the first one in this lab that can be asked whether it CONSERVES anything.
//
// tools/roundhouse/conservationReach.mjs says in its own header that it is a NAME SCAN and "a proposal, never
// a verdict": no device here has ever carried a conservation identity. Melting does, because the enthalpy
// method's whole point is that latent heat has somewhere to go.
//
// Three modes, three different KINDS of truth, which is the reason there are three:
//
//   "front"       -- the EXTERNAL key. X(t) = 2*lambda*sqrt(alpha*t) with lambda from the Stefan
//                    transcendental. Nothing in it comes from our grid, so the solver can be wrong in a way
//                    that shows. The observable is the relative departure from that closed form.
//   "convergence" -- the ORDER, not the error. The error ratio under grid doubling is ~2 (first order, as a
//                    fixed grid with a front BETWEEN cells must be). A SINGLE ERROR NUMBER PASSES ON A SOLVER
//                    THAT IS WRONG AND NEVER IMPROVES; a ratio does not.
//   "stall"       -- the IDENTITY. Every enthalpy strictly inside the mushy range must read EXACTLY Tm. Not
//                    nearly -- exactly, because T is DERIVED from H rather than tracked beside it.
//
// AND THE NEGATIVE CONTROL SHIPS WITH THE DEVICE rather than living only in the gate: `naive` runs the obvious
// temperature-based solver, which puts 400 OF 400 CELLS above Tm and has NO FRONT AT ALL. A device that can
// only show itself succeeding is a device nobody can grade.
//
// ================================================================================================================
// *** v3850 -- IT WAS CALLED A CONTROL FOR TWO HUNDRED VERSIONS AND BY THE CENSUS'S OWN DISCRIMINATOR IT IS A
// PLANT. *** plantedCoverage separates the two MECHANICALLY: a CONTROL moves the claim's observable TO its
// ideal (proving the apparatus), a PLANT moves it AWAY (proving the gate would catch a defect). `naive` runs
// the WRONG METHOD and the claim FAILS -- there is no front at all -- so it is a plant wearing a control's
// name, and this device has read as UNPLANTED in the census the whole time it shipped one.
//
// *** THE DECLARED OBSERVABLE IS moltenFraction AND EMPHATICALLY NOT frontRelErr, AND THAT IS THE WHOLE CARE
// OF THIS EDIT. *** The naive arm has NO FRONT, so `front` is null and frontRelErr is null with it -- and
// probeModePlant requires A FINITE NUMBER IN BOTH ARMS. Declaring the obvious observable would have produced
// exactly the DECLARED BUT DEAD reading that mpmrefine carried from v3802 to v3849: a plant that fires
// perfectly and cannot be adjudicated. THE OBSERVABLE HAD TO BE ONE THAT SURVIVES THE DEFECT.
//
// MEASURED, the two arms: moltenFraction 0.3075 -> 1.0000. The ratio is only 3.25x AND THAT IS NOT THE
// CONTENT: the observable is bounded above by 1 and the plant PINS IT AT ITS CEILING, which is the statement
// that every one of the 400 cells is above Tm and the front the device exists to locate does not exist.
// A SATURATED OBSERVABLE IS A WEAK RATIO AND A STRONG SENTENCE, and saying so is part of shipping the plant.
// ================================================================================================================
"use strict";
import {
    MATERIALS, alphaOf, stefanNumber, lambdaFor, stefanFront, meltEnthalpy, stallCheck, refinement,
} from "../../physics/thermal/stefan.mjs";

export const MELT_MODES = ["front", "convergence", "stall", "naive"];

export const MELT_OBSERVABLES = [
    "lambda", "lambdaResidual", "exactFront", "solverFront", "frontRelErr",
    "convergenceRatio", "moltenFraction", "naiveMoltenFraction", "stallExact", "stefanNumber",
    // *** v3850 -- COMPLETED. These keys were RETURNED BY THE BUILDER AND NEVER DECLARED, and nothing
    // caught it because this device was not in labDevices-selfcheck's observable-honesty check --
    // that list held 17 devices and none of the thermal four. Planting them put them in it. An
    // UNDECLARED OBSERVABLE IS INVISIBLE TO EVERY CONSUMER THAT READS THE LIST RATHER THAN THE CODE,
    // which is the whole reason the list exists. ***
    "kind", "rows", "samples", "insideMushy", "worstDeparture",
];

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function meltDefaults(hyp = {}) {
    const h = { ...hyp }, c = { ...(h.config || {}) };
    // BOUNDED so a wild proposal cannot pin the builder: the refinement mode is O(n^2) in wall time.
    c.L = Math.min(8, Math.max(0.125, num(c.L, 1)));
    c.n = Math.min(1600, Math.max(100, num(c.n, 400) | 0));
    c.tEnd = Math.min(4, Math.max(0.25, num(c.tEnd, 1)));
    // THE VALIDATOR MUST LIST THE PLANT MODE, or `naive` reverts to `front`, both arms read an identical
    // number and the plant fires at nothing -- v3806's lesson on flip2d.
    if (!MELT_MODES.includes(h.mode)) h.mode = "front";
    h.config = c;
    return h;
}

function frontRun(c, { planted = false } = {}) {
    const St = 1 / c.L, lam = lambdaFor(St);
    const exact = stefanFront(St, 1, c.tEnd);
    // THE PLANT SWAPS THE SOLVER AND NOTHING ELSE -- same L, same n, same tEnd, same exact key. The naive
    // reading was already computed here as `bad`; what v3850 adds is the ability to ASK FOR IT AS THE ANSWER.
    const r = meltEnthalpy(c.L, { n: c.n, tEnd: c.tEnd, naive: planted });
    const bad = meltEnthalpy(c.L, { n: c.n, tEnd: c.tEnd, naive: true });
    return {
        stefanNumber: St, lambda: lam.lambda, lambdaResidual: lam.residual,
        exactFront: exact, solverFront: r.front,
        frontRelErr: r.front === null ? null : Math.abs(r.front - exact) / exact,
        moltenFraction: r.moltenFraction, naiveMoltenFraction: bad.moltenFraction,
    };
}

function convergenceRun(c) {
    const ref = refinement(c.L, [c.n / 2 | 0, c.n, c.n * 2], { tEnd: c.tEnd });
    const ratios = ref.rows.filter((r) => r.ratio).map((r) => r.ratio);
    return {
        exactFront: ref.exact,
        rows: ref.rows.map((r) => ({ n: r.n, front: r.front, relErr: r.relErr })),
        convergenceRatio: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
        stefanNumber: 1 / c.L,
    };
}

function stallRun(c) {
    const rows = stallCheck(c.L, 12);
    const inside = rows.filter((r) => r.h > 0 && r.h < c.L);
    return {
        samples: rows.length, insideMushy: inside.length,
        stallExact: inside.every((r) => r.T === 0),
        worstDeparture: inside.reduce((m, r) => Math.max(m, Math.abs(r.T)), 0),
        stefanNumber: 1 / c.L,
    };
}

export function buildMelt(hyp, base = {}) {
    const h = meltDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "convergence") return { kind: "convergence", ...convergenceRun(h.config) };
    if (h.mode === "stall") return { kind: "stall", ...stallRun(h.config) };
    if (h.mode === "naive") return { kind: "naive", ...frontRun(h.config, { planted: true }) };
    return { kind: "front", ...frontRun(h.config) };
}

export const meltDevice = {
    // THREE MODES, THREE KINDS OF TRUTH -- an external closed form, a convergence ORDER, and an exact
    // identity. Each verified to give a DISTINCT answer, because v3192's lesson is that a mode nobody can
    // discover is a mode nobody will use.
    // "front" stays FIRST so the contract compares the plant against the mode that owns the fixture.
    modes: MELT_MODES,
    // *** moltenFraction, NOT frontRelErr: the naive arm has no front, so frontRelErr is null there and the
    // census would read this device DECLARED BUT DEAD. See the header. ***
    plantMode: "naive", plantFlips: "moltenFraction", plantKind: "mode",
    plantNull: 1, plantNullWhy:
        "naiveMoltenFraction is the device's OWN recorded value for the naive answer -- everything above the melting point counted as molten, which is 1 by construction -- and it reads 1 in BOTH arms. So 1 is the null this plant collapses onto, not an ideal it moves away from: the honest front-tracking arm sits at 0.3075 and the naive arm lands exactly on the device's own wrong reference, while frontRelErr goes null because the naive arm has no front to grade at all",
    name: "melt-stefan",
    observables: MELT_OBSERVABLES,
    build: buildMelt,
    defaults: meltDefaults,
    materials: MATERIALS,
    alphaOf,
    stefanNumber,
};
