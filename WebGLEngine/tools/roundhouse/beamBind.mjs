// WebGLEngine/tools/roundhouse/beamBind.mjs -- v3380
//
// *** DEVICE 56: CANTILEVER ELASTICITY. Second of the five fields that had a module and a gate and no bind. ***
//
// beam-selfcheck is thorough -- tip deflection against F L^3 / (3 E I), SECOND-ORDER convergence, mode ratios
// against the roots of cos(b)cosh(b) = -1, the EI scaling, matrix symmetry. A DEVICE THAT RESTATED ANY OF THAT
// WOULD MOVE THE COVERAGE COUNT AND GRADE NOTHING NEW.
//
// SO ALL THREE KEYS HERE ARE ROUTES THAT GATE DOES NOT TAKE:
//
//   EXPONENT   the gate EVALUATES F L^3 / (3 E I) at one L. This VARIES L over a decade and RECOVERS the
//              exponent by regression -- 3.000000 to six digits, and the closed form is never called during
//              the measurement. An ORDER rather than a tolerance, which is the volume device's shape.
//   SUPERPOSITION  a property of the SOLVER, not of any formula: two loads applied together must equal the sum
//              of them applied apart. Worst residual 1.164e-10 over 120 nodes. NO CLOSED FORM IS INVOLVED AT
//              ALL, so it holds whatever the deflection formula says.
//   RECIPROCITY  Maxwell-Betti, measured THROUGH solve rather than read off the matrix: the deflection at i
//              from a load at j equals the deflection at j from a load at i. Agrees to 1.22e-12.
//
// *** AND A NEGATIVE I PROPOSED AND THEN MEASURED MY WAY OUT OF, WHICH IS RECORDED RATHER THAN QUIETLY
// DROPPED. *** I expected asymmetry -- the module's own historical bug, which once produced a spurious zero
// mode -- to break RECIPROCITY while leaving the TIP DEFLECTION plausible, making reciprocity the more
// sensitive detector. IT DOES NOT. Perturbing one off-diagonal by 1e-2 down to 1e-6 moves the tip by 79%, 80%,
// 82%, 117% and 36% -- erratic and enormous at every scale, because the perturbed matrix is badly conditioned
// and the solve is garbage regardless. RECIPROCITY IS NOT A FINER INSTRUMENT HERE; BOTH CHECKS SHOUT. The
// claim was worth testing and is worth NOT making.
"use strict";
import { measureTipDeflection, tipDeflection, stiffness, solve, naturalOmega } from "../../physics/elasticity/beam.js";
// v3420 -- *** buckling.js ARRIVED AT v3410 WITH A PAGE, A GATE AND A REAL EXTERNAL KEY, AND NOTHING BOUND IT.
// So gradedCoverage counted it UNGRADED and the roundhouse could not run it: no lab export, no corroboration,
// no planted error, no lab-results row. A MODULE YOU CAN LOOK AT BUT CANNOT RUN. *** It is a MODE here rather
// than a new device because it shares beam.js's fourth-difference operator -- v3199's shared-substrate rule,
// which is also why one wrong row in that operator would break the static, vibration AND buckling keys at once.
import { measureBuckling, criticalLoad } from "../../physics/elasticity/buckling.js";

const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    buckleN: 160,
 n: 200, E: 1, I: 1, F: 1, nodes: 120 };
// *** v3707 -- THE REFUSAL IS DECLARED, NOT LEFT IN PROSE. *** This bind has NO planted knob and the curriculum
// proposed it for one, because a proposer reading only "is a plant declared" CANNOT TELL AN UNEXAMINED SUBJECT
// FROM AN EXAMINED ONE THAT SAID NO. This file already tried the obvious plant -- break the free-end symmetry
// and let RECIPROCITY catch it -- and MEASURED THAT IT DOES NOT SELECTIVELY CATCH IT (the `conditioning` mode
// above returns that comparison as data). Re-proposing it would send somebody to redo work that was
// deliberately not done, which is the same error as re-proposing a closed item off a stale list.
// THE STRING IS FOR A PERSON; THE FIELD'S EXISTENCE IS FOR THE TOOL. A prose grep would be a mention test.
const PLANT_REFUSED =
    "the obvious plant (free-end asymmetry) was tried and MEASURED: reciprocity does not selectively catch it -- " +
    "see the `conditioning` mode, which returns tipDriftFrac against relGap as data. A plant no key separates " +
    "is not coverage, and declaring one anyway would MANUFACTURE it.";

export const MODES = ["exponent", "superposition", "reciprocity", "conditioning", "buckling"];
const LS = [0.5, 0.7, 1.0, 1.4, 2.0, 3.0, 4.0];

const asNumber = (d) => (typeof d === "number" ? d : (d.tip ?? d.deflection ?? d.value));

/** Fit log(deflection) against log(L). THE CLOSED FORM IS NEVER CALLED HERE. */
export function recoverExponent({ n, E, I, F }) {
    const xs = [], ys = [];
    for (const L of LS) { xs.push(Math.log(L)); ys.push(Math.log(asNumber(measureTipDeflection({ n, L, E, I, F })))); }
    const k = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0), sxx = xs.reduce((a, x) => a + x * x, 0);
    return { slope: (k * sxy - sx * sy) / (k * sxx - sx * sx), points: k };
}

const unit = (N, i) => { const f = new Float64Array(N); f[i] = 1; return f; };

export function defaults({ mode = "exponent" } = {}) {
    return MODES.includes(mode) ? { mode, config: { ...DEF } } : null;
}

export function build({ mode = "exponent", config = {} } = {}) {
    if (!MODES.includes(mode)) throw new Error("beam: undeclared mode " + mode);
    const c = { ...DEF, ...config };

    if (mode === "exponent") {
        const r = recoverExponent(c);
        return { exponent: r.slope, points: r.points, exponentError: Math.abs(r.slope - 3),
                 closedFormAtUnitL: tipDeflection({ F: c.F, L: 1, E: c.E, I: c.I }) };
    }
    const K = stiffness(c.nodes), N = K.length;
    if (mode === "superposition") {
        const i = N - 1, j = Math.floor(N / 2);
        const a = solve(K, unit(N, i)), b = solve(K, unit(N, j));
        const both = solve(K, (() => { const f = unit(N, i); f[j] += 1; return f; })());
        let worst = 0, scale = 0;
        for (let q = 0; q < N; q++) { worst = Math.max(worst, Math.abs(both[q] - (a[q] + b[q]))); scale = Math.max(scale, Math.abs(both[q])); }
        return { worstResidual: worst, relative: worst / (scale || 1), nodes: N };
    }
    if (mode === "reciprocity") {
        const i1 = N - 1, i2 = Math.floor(N / 3);
        const dij = solve(K, unit(N, i2))[i1], dji = solve(K, unit(N, i1))[i2];
        return { dij, dji, relGap: Math.abs(dij - dji) / Math.max(Math.abs(dij), Math.abs(dji)), nodes: N };
    }
    if (mode === "buckling") {
        // *** THE KEY IS AN INTEGER, WHICH IS A FAR HARDER TARGET THAN A FITTED CONSTANT. *** The clamped-free
        // column's critical loads sit at pi^2 EI/(4L^2) times the ODD SQUARES 1, 9, 25 -- and the ratios come
        // back to those integers without anything here being told them. The absolute value is checked too, but
        // the ratio is the half a wrong operator cannot fake: it would have to be wrong by the same factor at
        // every mode to keep 9 and 25 intact.
        const n = Math.max(20, Math.min(400, c.buckleN | 0 || 160));
        const m = measureBuckling({ n, count: 3 });
        // AND THE ORDER, MEASURED RATHER THAN ASSERTED: halving h quarters the error. Two grids, so the ratio
        // is a number and not a fit -- convergenceOrder's territory, but the point here is only that it is 4.
        const coarse = measureBuckling({ n: Math.max(10, n >> 1), count: 1 });
        const eFine = Math.abs(m.loads[0] - m.exact[0]), eCoarse = Math.abs(coarse.loads[0] - coarse.exact[0]);
        return {
            pcr: m.loads[0], pcrExact: m.exact[0], pcrRelErr: Math.abs(m.loads[0] - m.exact[0]) / m.exact[0],
            closedFormPcr: criticalLoad(1, { L: 1, E: 1, I: 1 }),
            oddSquare2: m.loads[1] / m.loads[0], oddSquare3: m.loads[2] / m.loads[0],
            refineRatio: eCoarse / (eFine || Number.MIN_VALUE), buckleNodes: n,
        };
    }
    // *** THE MEASURED REFUSAL: asymmetry is NOT selectively caught by reciprocity. Reported as data. ***
    const clone = K.map((r) => Float64Array.from(r));
    const tip0 = solve(K, unit(N, N - 1))[N - 1];
    const rows = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6].map((eps) => {
        const Kp = clone.map((r) => Float64Array.from(r)); const m = Math.floor(N / 2);
        Kp[m][m + 1] *= (1 + eps);
        const t = solve(Kp, unit(N, N - 1))[N - 1];
        const i1 = N - 1, i2 = Math.floor(N / 3);
        const a = solve(Kp, unit(N, i2))[i1], b = solve(Kp, unit(N, i1))[i2];
        return { eps, tipDriftFrac: Math.abs(t - tip0) / Math.abs(tip0), relGap: Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) };
    });
    return { rows, reciprocityIsFiner: rows.every((r) => r.tipDriftFrac < r.relGap) };
}

export const BEAM_OBSERVABLES = ["exponent", "points", "exponentError", "closedFormAtUnitL", "worstResidual",
    "relative", "nodes", "dij", "dji", "relGap", "reciprocityIsFiner",
    "pcr", "pcrExact", "pcrRelErr", "closedFormPcr", "oddSquare2", "oddSquare3", "refineRatio", "buckleNodes"];
// *** THE EXPIRY, AS A PREDICATE RATHER THAN AN ABSENCE. *** The refusal above says reciprocity does not
// SELECTIVELY catch the free-end asymmetry, and points at the `conditioning` mode for the data. What it never
// said is what would change its mind -- and a refusal with no stated expiry is PERMANENT BY DEFAULT, which is
// how a measured "not today" becomes an unexamined "never".
//
// The condition needs no prose and no new measurement, because the conditioning mode ALREADY COMPUTES IT as a
// field: reciprocityIsFiner. That boolean is the whole question -- it asks whether the reciprocity residual
// separates the asymmetric case more sharply than the tip-drift does. Measured false today across every eps in
// the sweep. If a change to the beam, the solver or the residual ever makes it true, a key exists, the plant
// becomes available, and this refusal is done.
async function beamRefusalExpired() {
    const v = await build({ mode: "conditioning", config: {} });
    const expired = v.reciprocityIsFiner === true;
    const rows = Array.isArray(v.rows) ? v.rows : [];
    const best = rows.reduce((acc, r) => (r && r.relGap > (acc ? acc.relGap : -Infinity) ? r : acc), null);
    return {
        expired,
        observable: "reciprocityIsFiner", measured: v.reciprocityIsFiner,
        evidence: expired
            ? "reciprocityIsFiner = true across the conditioning sweep: RECIPROCITY NOW SEPARATES the free-end "
              + "asymmetry, so a key exists and the plant this refusal measured to be unavailable is available. "
              + "THE REFUSAL HAS EXPIRED: build it."
            : "reciprocityIsFiner = " + String(v.reciprocityIsFiner) + " over " + rows.length + " eps values"
              + (best ? "; widest relGap " + best.relGap.toExponential(3) + " at eps " + best.eps
                        + ", against tipDriftFrac " + best.tipDriftFrac.toExponential(3) : "")
              + ". No key separates it, so declaring a plant would MANUFACTURE coverage.",
    };
}

export const beamDevice = {
    plantRefusedExpiry: beamRefusalExpired,
    // THE REFUSAL TRAVELS ON THE DEVICE, because the registry hands out devices and a proposer reading the
    // registry is the thing that needs to see it. A module-level export would have been invisible to it.
    plantRefused: PLANT_REFUSED, modes: MODES, name: "cantilever-elasticity", observables: BEAM_OBSERVABLES, build, defaults };
export default beamDevice;
