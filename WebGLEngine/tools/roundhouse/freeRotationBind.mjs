// WebGLEngine/tools/roundhouse/freeRotationBind.mjs -- v3563
// ---------------------------------------------------------------------------------------------------------------
// TORQUE-FREE ROTATION AS A LAB DEVICE, AND ITS OWN REGISTRY ROW.
//
// v3562 built physics/mechanics/freeRotation.mjs and deliberately stopped short of a bind. No host shares its
// substrate and none is pretended: gyroscope is a SCALAR I under a TIP TORQUE (no tensor, no intermediate axis,
// not torque-free), kepler is a central force, vibrations is a linear chain. *** A GYROSCOPE AND A TUMBLING
// BRICK BOTH "SPIN" AND SHARE NOT ONE LINE OF SUBSTRATE *** -- v3422's white-dwarf/centrifuge rule, where the
// analogy was real and was still not a host.
//
// ================================================================================================================
// THE PLANT IS `knob` AND IT REPLACES A LAW, NOT A CONSTANT
// ================================================================================================================
//
// `planted` deletes the gyroscopic term -- the entire right-hand side of Euler's equations, -w x (I w). That is
// the centrifuge's shape (replace the FIELD LAW, not a nudged number) with one extra property that makes it the
// best plant in the lab so far:
//
// *** IT IS NOT A HYPOTHETICAL FAULT. IT IS WHAT A SHIPPING SOLVER DOES. *** The term is stiff and can inject
// energy, so game engines routinely omit it and Jolt exposes it as an OPT-IN. The device is graded against the
// exact choice its own engine's two physics backends may or may not have made.
//
// AND EVERY CONSERVATION OBSERVABLE IS BLIND TO IT, WORSE THAN BLIND: with the term gone w is CONSTANT, so
// driftE and driftL read EXACTLY ZERO against the true solver's 1.16e-13 and 5.77e-14 of integrator error
// (re-measured v4298; this line said "~1e-14", which is right for driftL and an order of magnitude low for
// driftE -- the CONTRAST is the claim, and understating the honest side understates it). A DEVICE GRADED ON
// CONSERVATION ALONE WOULD RATE THE PLANT A SUPERIOR MODEL. Only `sigma` and `growthFactor` separate them, and
// `sigma` is the sharper of the two because it is a PREDICTED RATE rather than a sign.
"use strict";
import { boxInertia, intermediateAxis, stabilityRate, integrate, measureGrowth, growthFactor,
         energy, momentumMag } from "../../physics/mechanics/freeRotation.mjs";

export const FR_MODES = ["stability", "conserve", "flip", "attitude"];

const DEF = { m: 1, hx: 1, hy: 2, hz: 3, Omega: 1, eps: 1e-9, dt: 1e-3, steps: 60000, T: 40 };

export const FR_OBSERVABLES = [
    "I0", "I1", "I2", "midAxis",
    "sigmaPredicted", "sigmaMeasured", "sigmaRelErr", "sigmaR2",
    "factorMid", "factorMax", "factorMin",
    "driftE", "driftL", "driftWorldL", "flips",
    "attitudeOrder",
];

// *** v4071 -- THIS FILLED EVERY UNSET OBSERVABLE WITH 0, AND 0 IS A PASSING SCORE FOR MOST OF THEM. ***
// An observable census -- which knobs move which observables -- flagged eight to ten observables in EVERY mode
// of this device. The cause is here: each mode computes its own four or five numbers and inherited 0 for the
// rest, so `stability` reported driftE 0 and driftL 0 without integrating anything, and `conserve` reported
// sigmaRelErr 0 without measuring sigma. FOR AN ERROR OR A DRIFT, 0 IS NOT ABSENCE -- IT IS THE BEST POSSIBLE
// RESULT, so three modes of four announced perfect energy conservation and exact sigma agreement they had
// never computed. Every other bind in this lab fills its blank with null for exactly this reason (mpmstep,
// xpbd, refscan, nuclear); this one was the exception.
//
// *** AND THE DEGENERATE PATH IS THE SHARP CASE: `if (mid < 0) return blank` HANDED A BODY WITH NO
// INTERMEDIATE AXIS A CLEAN SWEEP OF ZEROS *** -- driftE 0, driftL 0, sigmaRelErr 0 -- for a run that never
// happened. That is mpmstep's "the block did not move at all" satisfying the strongest form of its own key,
// which is the shape this lab names a vacuous pass.
//
// null means THIS MODE DID NOT COMPUTE IT. I0, I1, I2 and midAxis stay numbers because they are derived from
// the inertia tensor before any mode branches and are true of every run.
const blankOf = (I, mid) => {
    const o = {};
    for (const k of FR_OBSERVABLES) o[k] = null;
    o.I0 = I[0]; o.I1 = I[1]; o.I2 = I[2]; o.midAxis = mid;
    return o;
};

export function defaults({ mode = "stability", config = {} } = {}) {
    if (!FR_MODES.includes(mode)) return null;    // a refusal, not a silent substitution
    return { mode, config: { ...DEF, ...config } };
}

export function build({ mode = "stability", config = {}, planted = false } = {}) {
    if (!FR_MODES.includes(mode)) throw new Error("freeRotation: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const I = boxInertia({ m: c.m, hx: c.hx, hy: c.hy, hz: c.hz });
    const mid = intermediateAxis(I);
    const blank = blankOf(I, mid);
    if (mid < 0) return blank;                     // a degenerate body has no intermediate axis to report

    const gyro = !planted;

    if (mode === "stability") {
        // THE SHARP KEY: a PREDICTED rate, and the measurement must land on it.
        const pred = stabilityRate(I, mid, c.Omega).sigma;
        const meas = gyro ? measureGrowth({ I, axis: mid, Omega: c.Omega, eps: c.eps, dt: c.dt })
                          : { sigma: 0, r2: 0, points: 0 };
        return {
            ...blank,
            sigmaPredicted: pred,
            sigmaMeasured: meas.sigma,
            sigmaRelErr: pred > 0 ? Math.abs(meas.sigma - pred) / pred : 0,
            sigmaR2: meas.r2,
        };
    }

    if (mode === "flip") {
        // The BOUNDED/UNBOUNDED separation, which is the observable a stable axis can actually supply --
        // measureGrowth returns an empty fit there (v3562's own trap), so this mode never asks it to.
        const mx = I.indexOf(Math.max(...I)), mn = I.indexOf(Math.min(...I));
        const f = (ax) => (gyro ? growthFactor({ I, axis: ax, Omega: c.Omega, eps: c.eps, dt: c.dt, T: c.T }).factor : 1);
        const r = integrate({ I, w0: seed(mid, c), dt: c.dt, steps: c.steps, gyroscopic: gyro });
        return { ...blank, factorMid: f(mid), factorMax: f(mx), factorMin: f(mn), flips: r.flips };
    }

    if (mode === "conserve") {
        // *** REPORTED AS THE KEY THAT CANNOT SEE THE PLANT. Kept because it is real and necessary, and named
        // in the register so nobody reads a perfect score here as a verdict. ***
        const r = integrate({ I, w0: seed(mid, c), dt: c.dt, steps: c.steps, gyroscopic: gyro });
        return { ...blank, driftE: r.driftE, driftL: r.driftL, driftWorldL: r.driftWorldL, flips: r.flips };
    }

    // attitude: the SECOND ROUTE, and the observable is an ORDER rather than a value.
    const a = integrate({ I, w0: seed(mid, c), dt: c.dt * 2, steps: Math.round(c.steps / 2), gyroscopic: gyro });
    const b = integrate({ I, w0: seed(mid, c), dt: c.dt, steps: c.steps, gyroscopic: gyro });
    const order = b.driftWorldL > 0 ? Math.log2(a.driftWorldL / b.driftWorldL) : 0;
    return { ...blank, driftWorldL: b.driftWorldL, attitudeOrder: order };
}

function seed(mid, c) {
    const w = [c.eps, c.eps, c.eps];
    w[mid] = c.Omega;
    return w;
}

export const freeRotationDevice = {
    // KNOB PLANT: `planted` deletes the GYROSCOPIC TERM -- the whole right-hand side of Euler's equations, and
    // the exact omission a real solver makes. Not a nudged constant.
    plantKind: "knob",
    // v4120 -- NAMED, THE SAME COMPLETION v3851/v4088-v4119 gave the rest of this family. MEASURED, stability
    // mode (default) both arms: sigmaRelErr 1.39e-5 -> 1 (saturates: with the gyroscopic term gone, w is
    // constant, so the measured growth rate collapses to exactly 0 against a nonzero predicted rate). Note the
    // spelling: this device reads `planted` as a SIBLING of config (build({mode, config, planted})), not
    // config.planted -- plantedCoverage.mjs's probeLiveness turns both spellings (v3685's fix) so this is
    // covered either way, but a caller declaring the knob by name should use the field this file actually reads.
    planted: { knob: "planted", observable: "sigmaRelErr",
               note: "the gyroscopic term -w x (Iw), the whole right-hand side of Euler's equations, is deleted -- not a hypothetical fault, but the exact omission a stiff real-time solver makes when the term is left opt-in. Every conservation observable (driftE, driftL) is worse than blind to it: with the term gone w is constant, so drift reads EXACTLY ZERO against the honest solver's 1.16e-13 (driftE) and 5.77e-14 (driftL) of integrator error, and a device graded on conservation alone would rate the plant a superior model" },
    modes: FR_MODES, name: "torque-free-rigid-rotation",
    observables: FR_OBSERVABLES, build, defaults,
};
export default freeRotationDevice;
