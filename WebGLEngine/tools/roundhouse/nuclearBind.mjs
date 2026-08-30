// tools/roundhouse/nuclearBind.mjs
//
// v3383 -- THE NUCLEAR DEVICE. First of three new fields; seismology and acoustics follow.
//
// MODES:
//   "chain"    Bateman closed form graded against RK4 integration of the same ODEs, plus exact nucleon
//              conservation. Two routes, no shared line.
//   "equilib"  secular equilibrium as a LIMIT -- the daughter's activity approaching the parent's as the parent
//              outlives it, and the RATE of approach.
//   "binding"  the Bethe-Weizsaecker mass formula against NATURE: the most-bound Z for a given A, and the iron
//              peak located by search rather than assumed.
//
// THE PLANTED ERROR IS THE SURFACE TERM. Deleting the A^(2/3) surface energy leaves a formula that still returns
// plausible MeV numbers, still rises with A, and still looks like a binding curve -- and it has NO PEAK, because
// the peak exists only where the surface term stops competing with the volume term. A device grading "is the
// binding energy about 8 MeV" would pass it; only asking where the curve turns catches it.

import {
    batemanChain, batemanIntegrated, activityRatio,
    bindingEnergy, bindingPerNucleon, mostStableZ, bindingPeak, fissionQ, SEMF,
} from "../../physics/nuclear/decay.mjs";

export const NUCLEAR_OBSERVABLES = [
    "chainWorstDiff", "conservationResidual", "integratedConservationResidual", "nA", "nB", "nC",
    "activityRatio", "equilibDeparture", "equilibFirstOrder",
    "peakA", "peakPerNucleon", "predictedZ", "predictedZCorrect", "fissionQ", "planted",
];

// *** v4183 -- THIS DEVICE DECLARED NO MODES AT ALL, AND ONE MISSING FIELD BROKE THREE THINGS. ***
// The header above has listed three modes since v3383 and build() branches on exactly those three -- but
// `nuclearDevice` carried no `modes:` field, so every consumer that reads one was working from nothing:
//
//   1. THE PLANT WAS UNGRADEABLE. plantedCoverage's probeLiveness iterates `device.modes || []`, so its loop
//      never ran: MEASURED, probeLiveness returned {live:[], inert:[], broke:[]} -- not "inert", EMPTY. The
//      planted:{} object v4090 added to this file has therefore never been gradeable by the census that
//      object exists to feed.
//   2. THE MODE COUNT WAS FICTION. deviceModes' modesOf() falls back to PROBING a 29-name candidate list when
//      a device declares nothing -- and this device's defaults() echoed any string back, so every probe
//      returned ok and the census recorded nuclear as a TWENTY-NINE MODE DEVICE. That is v3191's lbm finding
//      exactly ("probing lbm returned THE WHOLE CANDIDATE LIST and it appeared as a 29-mode device"), landing
//      a second time on a different device.
//   3. deviceModes-selfcheck WAS RED FOR IT. Its "NOTHING IS PROBED ANY MORE -- every device that can declare,
//      exports" assertion requires zero probed devices; nuclear was the only one left, so that line failed.
//
// THE MODES ARE NOT INVENTED: they are this file's own default plus every mode its own build() branches on --
// `equilib` and `binding` return early, `chain` is the fallthrough -- and each was verified to give a DISTINCT
// answer before being declared, which is the standard this tree applies (a branch that changed nothing would
// be a mode in name only). MEASURED, the three return disjoint finite-key sets: chain gives chainWorstDiff /
// conservationResidual / integratedConservationResidual / nA / nB / nC, equilib gives activityRatio /
// equilibDeparture, binding gives peakA / peakPerNucleon / fissionQ.
//
// ONE DECLARATION, HONOURED BY BOTH FIELDS -- the v4074 idiom from debye/fermi/sackurTetrode, so a mode added
// later cannot reach `modes:` and miss the guard, or the reverse.
export const NUCLEAR_MODES = ["chain", "equilib", "binding"];

const DEF = { N0: 1, l1: 0.07, l2: 0.31, t: 20, A: 56, Z: 26 };
const KNOWN = [[4, 2], [16, 8], [56, 26], [238, 92]];

/** Binding with the SURFACE TERM REMOVED -- plausible everywhere, and with no peak anywhere. */
function bindingNoSurface(A, Z) {
    const { aV, aC, aA } = SEMF;
    return aV * A - aC * Z * (Z - 1) / Math.cbrt(A) - aA * Math.pow(A - 2 * Z, 2) / A;
}
function peakNoSurface(Amin = 2, Amax = 250) {
    let peakA = Amin, peak = -Infinity;
    for (let A = Amin; A <= Amax; A++) {
        let best = -Infinity;
        for (let Z = 1; Z < A; Z++) best = Math.max(best, bindingNoSurface(A, Z));
        if (best / A > peak) { peak = best / A; peakA = A; }
    }
    return { A: peakA, perNucleon: peak };
}

function buildNuclear({ mode = "chain", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const blank = {
        chainWorstDiff: null, conservationResidual: null, integratedConservationResidual: null,
        nA: null, nB: null, nC: null,
        activityRatio: null, equilibDeparture: null, equilibFirstOrder: null,
        peakA: null, peakPerNucleon: null, predictedZ: null, predictedZCorrect: null,
        fissionQ: null, planted: !!config.planted,
    };

    if (mode === "equilib") {
        const ls = [1e-2, 1e-3, 1e-4, 1e-5];
        const dep = ls.map((l1) => Math.abs(activityRatio(c.N0, l1, 0.5, 200) - 1));
        const ratios = dep.slice(1).map((v, i) => dep[i] / v);
        return {
            ...blank,
            activityRatio: activityRatio(c.N0, ls[ls.length - 1], 0.5, 200),
            equilibDeparture: dep[dep.length - 1],
            equilibFirstOrder: ratios.every((r) => r > 5 && r < 20),
        };
    }

    if (mode === "binding") {
        const p = config.planted ? peakNoSurface() : bindingPeak();
        const zs = KNOWN.map(([A]) => mostStableZ(A).Z);
        return {
            ...blank,
            peakA: p.A, peakPerNucleon: p.perNucleon,
            predictedZ: zs,
            predictedZCorrect: KNOWN.every(([, Z], i) => zs[i] === Z),
            // v3436 -- WAS fissionQ(238, 92), HARDCODED. The sensitivity matrix found A and Z declared in this
            // device's defaults and moving nothing: two knobs a caller could set that the device ignored. Not a
            // silently-ignored key from outside -- a key this device ADVERTISED and then did not read.
            fissionQ: fissionQ(c.A, c.Z),
        };
    }

    const closed = batemanChain(c.N0, c.l1, c.l2, c.t);
    const integ = batemanIntegrated(c.N0, c.l1, c.l2, c.t);
    return {
        ...blank,
        chainWorstDiff: Math.max(Math.abs(closed.A - integ.A), Math.abs(closed.B - integ.B), Math.abs(closed.C - integ.C)),
        // *** v4065 -- THIS RESIDUAL IS AN ALGEBRAIC IDENTITY OF THE CLOSED FORM, AND IT IS KEPT FOR A
        // NARROWER REASON THAN THE ONE ITS NAME SUGGESTS. *** An observable census -- which knobs move which
        // observables -- found that nothing moves it: not a knob, not the plant, and not any rung of the
        // ladder. MEASURED at the shipped defaults and at l2 x1.5, x0.5 and x8: EXACTLY 0 every time.
        //
        // It is zero by algebra, not by physics. With u = exp(-l1 t), v = exp(-l2 t) and d = l2 - l1,
        //     A + B + C = N0[1 + u + (l1/d)(u - v) - (l2 u - l1 v)/d] = N0[1 + u + u(l1 - l2)/d] = N0
        // for ALL l1, l2 and t. And in the degenerate branch batemanChain returns C as N0 - A - B outright, so
        // there it is zero by construction rather than by cancellation. "The chain conserves nuclei" is
        // therefore not what this number tests.
        //
        // WHAT IT DOES TEST IS CONDITIONING, and that is real: (l2 - l1) sits in two denominators, so near --
        // but not inside -- the degenerate branch's 1e-12 threshold the cancellation is catastrophic. MEASURED
        // at l1 = 0.1, l2 = 0.1000000001, t = 10: the residual is 4.082e-5 on N0 = 1000. A genuine reading,
        // reachable by no default and no ladder rung this device carries, which is why the census sees it as
        // stone dead. Kept, and now labelled for what it is.
        conservationResidual: Math.abs(closed.A + closed.B + closed.C - c.N0),
        // *** AND THE CONSERVATION CHECK THAT CAN ACTUALLY FAIL, WHICH WAS NOT BEING MADE. *** batemanIntegrated
        // RK4s the ODEs and "deliberately shares nothing with the closed form" -- so its A + B + C is NOT an
        // identity, it is an accumulation of integrator error. At the same defaults it reads 4.774e-15, a real
        // number that grows with a worse step, a stiffer pair or a longer t. chainWorstDiff already compares
        // the two solutions to each other; nothing asked whether the integrator conserves anything at all.
        integratedConservationResidual: Math.abs(integ.A + integ.B + integ.C - c.N0),
        nA: closed.A, nB: closed.B, nC: closed.C,
    };
}

export const nuclearDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4090 -- NAMED, THE SAME COMPLETION v3851/v4088/v4089 gave born/chaos/box3d/acoustics/seismic: plantKind
    // was declared but the config.planted flag (`binding` mode only) had no `planted: {}` object. peakA is the
    // sharpest single number -- not a tolerance, a LOCATION -- so a missing surface term cannot merely shift it,
    // it moves the peak somewhere the physics forbids. MEASURED, both arms: peakA 58 -> 2.
    planted: { knob: "planted", observable: "peakA",
               note: "deleting the SEMF's A^(2/3) surface term leaves binding energy still rising with A and still MeV-plausible, but with no competing term to stop it -- the peak collapses to the smallest A rather than sitting near iron" },
    // v4183 -- DECLARED. See NUCLEAR_MODES above for what was broken by their absence and how they were derived.
    modes: NUCLEAR_MODES,
    name: "nuclear-decay-and-binding", observables: NUCLEAR_OBSERVABLES, build: buildNuclear,
    // v4183 -- AND IT REFUSES AN UNDECLARED MODE INSTEAD OF ECHOING IT BACK. `mode: mode || "chain"` returns
    // ANY truthy name as though this device offered it, so checkMode -- built at v3144 precisely to refuse an
    // undeclared mode -- refused nothing here, which is both why the probe accepted 29 names and why this
    // device sat on deviceModes-selfcheck's UNGUARDED_BASELINE. Its name is removed from that baseline in the
    // same change, as that gate's own comment instructs ("when either learns to refuse an undeclared mode,
    // DELETE its name") -- a baseline entry whose reason has expired is a ratchet holding nothing (v3195).
    //
    // The tree's standing reason for NOT guarding these was that "making one validate means knowing WHICH
    // modes it means to offer, and guessing that would declare an interface on somebody else's behalf". No
    // guess was needed here: the set is this file's own header, its own build() branches, and three measured
    // distinct answers.
    defaults: ({ mode } = {}) => ({ mode: NUCLEAR_MODES.includes(mode) ? mode : NUCLEAR_MODES[0], config: { ...DEF } }),
};
