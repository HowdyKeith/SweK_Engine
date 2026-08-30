// tools/roundhouse/landauZenerBind.mjs
//
// v3288 -- NON-ADIABATIC QUANTUM TRANSITIONS JOIN THE ROUNDHOUSE. Third promotion from the ungraded set.
//
// physics/quantum/landauZener.js drives a two-level system through an avoided crossing and asks what survives.
// The key is the 1932 closed form, exact for an infinite sweep:
//
//     P_diabatic = exp(-pi D^2 / (2 v))
//
// It qualifies on the same grounds as kuramoto and hmc -- a real closed form plus an exported planted error --
// and it arrives with something the other two did not have: THE MODULE HAD ALREADY MEASURED ITS OWN VALIDITY
// RANGE AND WRITTEN THE LIMIT DOWN.
//
// Its header records that the finite-window integrator earns the exact curve for P from about 0.5 to 0.99
// (worst 0.62% at v=4), and that DEEP IN THE ADIABATIC CORNER (P below ~0.03) it does not -- widening the window
// moved the answer -16.0%, +5.4%, +35.9% at T = 87, 150, 250 without settling, because the surviving population
// is smaller than the coherent leftover of a finite window. The tolerance was not widened to cover that; the
// claim was narrowed to what the instrument supports.
//
// SO THIS DEVICE GRADES THE VALIDATED WINDOW ONLY. Extending it to the adiabatic corner would mean either a
// tolerance chosen to fit a number that does not converge, or an assertion the module itself declines to make.
// The corner is reachable through the `corner` mode, which reports the suppression as an order of magnitude and
// says plainly that it is not a graded claim.

import { lzExact, lzCurve, lzSweep } from "../../physics/quantum/landauZener.js";
import * as LZ from "../../physics/quantum/landauZener.js";

export const LZ_OBSERVABLES = [
    "errMean", "errWorst", "relWorst", "points", "v",
    "cornerP", "cornerExact", "cornerOrderOk", "graded",
];

const DEF = { v: 4, Ds: [0.4, 0.6, 0.8, 1.0, 1.2] };

function buildLZ({ mode = "curve", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const coupling = config.planted ? LZ.couplingWRONG : undefined;

    if (mode === "corner") {
        // deep adiabatic: the module measured this as NOT converged, so it is reported, not graded
        const D = config.D || 3.0;
        const s = lzSweep({ D, v: c.v, ...(coupling ? { coupling } : {}) });
        const exact = lzExact(D, c.v);
        // lzSweep returns pDiabatic -- NOT P or measured, which is what this first guessed at and got null for.
        // Reading the shape beats assuming it; a null observable would have made cornerOrderOk false and looked
        // like a physics result rather than a typo.
        const P = s.pDiabatic;
        return {
            errMean: null, errWorst: null, relWorst: null, points: 1, v: c.v,
            cornerP: P, cornerExact: exact,
            // an order-of-magnitude claim is what the instrument supports here, and nothing more
            cornerOrderOk: P < 0.05 && exact < 0.05,
            graded: false,
        };
    }

    const pts = lzCurve({ Ds: c.Ds, v: c.v, ...(coupling ? { coupling } : {}) });
    const errs = pts.map((p) => Math.abs(p.measured - p.exact));
    const rels = pts.map((p) => Math.abs(p.measured - p.exact) / p.exact);
    return {
        errMean: errs.reduce((a, b) => a + b, 0) / errs.length,
        errWorst: Math.max(...errs),
        relWorst: Math.max(...rels),
        points: pts.length, v: c.v,
        cornerP: null, cornerExact: null, cornerOrderOk: null,
        graded: true,
    };
}

export const landauZenerDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4129 -- NAMED, THE SAME COMPLETION v3851/v4088-v4128 gave the rest of this family. MEASURED, curve mode
    // (default) both arms: relWorst 0.00617 -> 0.8087 (errMean 0.00206 -> 0.3614). corner mode's cornerP moves
    // too (0.02822 -> 0.000385) but is explicitly NOT a graded claim (graded: false, per this device's own
    // header on the finite-window integrator's validity range), so the declaration points at the curve mode's
    // relWorst instead.
    planted: { knob: "planted", observable: "relWorst",
               note: "swaps in couplingWRONG, a wrong coupling law upstream of the diabatic-transition probability, so every point on the graded curve (P from about 0.5 to 0.99, the module's own validated window) is measured against the correct 1932 closed form while sampled from the wrong physics" },
    modes: ["curve", "corner"],
    name: "landau-zener-crossing", observables: LZ_OBSERVABLES, build: buildLZ,
    defaults: ({ mode } = {}) => ({ mode: mode || "curve", config: { ...DEF } }),
};
