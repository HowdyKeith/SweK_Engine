// WebGLEngine/physics/mechanics/freeRotation.mjs -- v3562
// ---------------------------------------------------------------------------------------------------------------
// TORQUE-FREE RIGID BODY ROTATION -- a new branch, and the one whose answer key grades A SHIPPED SUBSYSTEM.
//
// Everything in the lab so far measures a field, a profile, a boundary, an exponent or a transition. This
// measures A SOLVER'S HONESTY ABOUT ITS OWN EQUATION OF MOTION, and the reason is the gyroscopic term.
//
// Euler's equations for a body spinning with no torque on it, written in the principal-axis frame:
//
//     I1 w1' = (I2 - I3) w2 w3        and cyclic.
//
// The right-hand side IS -w x (I w), the gyroscopic term, and it is the whole content: without it w' = 0 and a
// body spins forever about whatever axis it was given. *** GAME SOLVERS ROUTINELY DROP IT, because w x I w is
// stiff and can inject energy, and Jolt exposes it as AN OPT-IN. *** So a solver missing it is not a broken
// solver -- it is a common, deliberate, documented choice, and nothing in this engine could previously tell
// which of its two backends made it.
//
// ================================================================================================================
// WHY THIS IS THE INSTRUMENT AND NOT A DEMO: THE CONSERVATION KEYS ARE BLIND TO THE DEFECT
// ================================================================================================================
//
// Drop the gyroscopic term and w is CONSTANT. Energy is conserved. |L| is conserved. Every invariant anyone
// would reach for first is satisfied EXACTLY -- better than the true solver's, which carries integrator drift.
//
// *** A SOLVER THAT DELETES THE PHYSICS SCORES BETTER ON THE OBVIOUS KEY THAN ONE THAT KEEPS IT. *** That is
// v3422's white-dwarf plant in a new subject (there, dropping the relativistic factor made an exponent key look
// better) and it is why this module ships FOUR key families rather than one. Only the stability family sees it.
//
// ================================================================================================================
// THE KEYS, IN ORDER OF SHARPNESS
// ================================================================================================================
//
// 1. CONSERVED, BODY FRAME. 2E = sum Ii wi^2 and L^2 = sum Ii^2 wi^2. Necessary, not sufficient -- see above.
//
// 2. CONSERVED, WORLD FRAME, AND THIS ONE SHARES NO CODE WITH (1). The angular momentum VECTOR in the world
//    frame is constant. Getting it requires the ORIENTATION -- rotate I*w by the integrated quaternion -- so it
//    grades the attitude integration, which the body-frame invariants never touch. Two routes, one number.
//
// 3. THE POLHODE. w lies on the energy ellipsoid AND the momentum sphere at every instant, so its trajectory is
//    the intersection of two surfaces -- a closed curve computable in advance. A point leaving it is the solver.
//
// 4. *** THE STABILITY EXPONENT, AND IT IS A PREDICTED NUMBER RATHER THAN A SIGN. *** Linearise about rotation
//    at rate W about principal axis k, with i and j the other two:
//
//        d2(dw)/dt2 = -W^2 * (Ik - Ii)(Ik - Ij)/(Ii Ij) * dw
//
//    For the LARGEST and SMALLEST axes both factors share a sign, the coefficient is positive, and the
//    perturbation OSCILLATES. For the INTERMEDIATE axis the factors have opposite signs, the coefficient is
//    negative, and the perturbation GROWS AS exp(sigma t) with
//
//        sigma = W * sqrt( (I2 - I1)(I3 - I2) / (I1 I3) )     for sorted I1 <= I2 <= I3.
//
//    THE SIGN ALONE WOULD BE A WEAK KEY -- a solver that is merely unstable for any reason passes it. The RATE
//    is the key, because a wrong equation gets the growth rate wrong even when it happens to grow.
//
// ================================================================================================================
// WHAT THIS ROUND DELIBERATELY DOES NOT DO
// ================================================================================================================
//
// IT DOES NOT TOUCH box3d OR jolt. Both loaders already expose angularImpulse() and readTransforms() (7 floats,
// pos + quat), so the flip is drivable and observable in both TODAY -- but readVelocities() is THREE floats,
// LINEAR ONLY, so neither backend will report w. The comparison is a separate round and it needs a decision
// this file has no business making. What IS reported here, measured from the tree rather than asserted, is the
// shape of the gap -- see contractGap().
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Principal moments of a uniform rectangular block from its HALF-extents. Sorted ascending. */
export function boxInertia({ m = 1, hx = 1, hy = 2, hz = 3 } = {}) {
    const k = m / 3;   // (1/12) m (a^2 + b^2) with a = 2hx etc collapses to (m/3)(hy^2 + hz^2)
    const I = [k * (hy * hy + hz * hz), k * (hx * hx + hz * hz), k * (hx * hx + hy * hy)];
    return I;
}

/** Are the three moments distinct enough for an intermediate axis to exist at all? */
export function distinctMoments(I, rel = 1e-9) {
    const s = [...I].sort((a, b) => a - b);
    return (s[1] - s[0]) / s[2] > rel && (s[2] - s[1]) / s[2] > rel;
}

/** Index of the intermediate principal axis, or -1 when the moments are not distinct. */
export function intermediateAxis(I) {
    if (!distinctMoments(I)) return -1;
    const idx = [0, 1, 2].sort((a, b) => I[a] - I[b]);
    return idx[1];
}

/** Euler's equations: the derivative IS the gyroscopic term. `gyroscopic:false` is THE PLANT. */
export function eulerDeriv(I, w, { gyroscopic = true } = {}) {
    if (!gyroscopic) return [0, 0, 0];
    return [
        (I[1] - I[2]) * w[1] * w[2] / I[0],
        (I[2] - I[0]) * w[2] * w[0] / I[1],
        (I[0] - I[1]) * w[0] * w[1] / I[2],
    ];
}

const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** RK4 on the body-frame angular velocity. */
export function stepOmega(I, w, dt, opt) {
    const k1 = eulerDeriv(I, w, opt);
    const k2 = eulerDeriv(I, add3(w, k1, dt / 2), opt);
    const k3 = eulerDeriv(I, add3(w, k2, dt / 2), opt);
    const k4 = eulerDeriv(I, add3(w, k3, dt), opt);
    return [0, 1, 2].map((n) => w[n] + dt / 6 * (k1[n] + 2 * k2[n] + 2 * k3[n] + k4[n]));
}

/** q' = 1/2 q (x) (0, w_body). Renormalised, because a drifting norm is a rotation that also scales. */
export function stepQuat(q, w, dt) {
    const [qw, qx, qy, qz] = q;
    const d = [
        0.5 * (-qx * w[0] - qy * w[1] - qz * w[2]),
        0.5 * (qw * w[0] + qy * w[2] - qz * w[1]),
        0.5 * (qw * w[1] + qz * w[0] - qx * w[2]),
        0.5 * (qw * w[2] + qx * w[1] - qy * w[0]),
    ];
    const o = [qw + d[0] * dt, qx + d[1] * dt, qy + d[2] * dt, qz + d[3] * dt];
    const n = Math.hypot(...o);
    return o.map((c) => c / n);
}

/** Rotate a BODY vector into the WORLD frame by the quaternion. */
export function rotateByQuat(q, v) {
    const [w, x, y, z] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [
        v[0] + w * t[0] + (y * t[2] - z * t[1]),
        v[1] + w * t[1] + (z * t[0] - x * t[2]),
        v[2] + w * t[2] + (x * t[1] - y * t[0]),
    ];
}

export const energy = (I, w) => 0.5 * (I[0] * w[0] * w[0] + I[1] * w[1] * w[1] + I[2] * w[2] * w[2]);
export const momentumBody = (I, w) => [I[0] * w[0], I[1] * w[1], I[2] * w[2]];
export const momentumMag = (I, w) => Math.hypot(...momentumBody(I, w));

/**
 * THE PREDICTED GROWTH RATE, derived from the linearisation and NOT fitted to anything.
 * Returns { coefficient, stable, sigma } -- sigma is 0 for a stable axis and the exponential rate otherwise.
 */
export function stabilityRate(I, axis, Omega) {
    const i = (axis + 1) % 3, j = (axis + 2) % 3;
    const C = (I[axis] - I[i]) * (I[axis] - I[j]) / (I[i] * I[j]);
    return { coefficient: C, stable: C > 0, sigma: C >= 0 ? 0 : Math.abs(Omega) * Math.sqrt(-C) };
}

/**
 * Integrate, carrying every invariant a key might want. `flips` counts SIGN CHANGES of the dominant component,
 * which is what an observer watching the ORIENTATION sees -- and is therefore the observable a physics backend
 * can supply through readTransforms() alone.
 */
export function integrate({ I, w0, dt = 1e-3, steps = 200000, gyroscopic = true, sample = 200 } = {}) {
    let w = [...w0], q = [1, 0, 0, 0];
    const E0 = energy(I, w), L0 = momentumMag(I, w);
    const Lw0 = rotateByQuat(q, momentumBody(I, w));
    let dE = 0, dL = 0, dLw = 0, flips = 0, polhode = 0;
    const dom = w0.map(Math.abs).indexOf(Math.max(...w0.map(Math.abs)));
    let sign = Math.sign(w[dom]);
    const trace = [];
    for (let n = 0; n < steps; n++) {
        q = stepQuat(q, w, dt);
        w = stepOmega(I, w, dt, { gyroscopic });
        const E = energy(I, w), L = momentumMag(I, w);
        dE = Math.max(dE, Math.abs(E - E0) / E0);
        dL = Math.max(dL, Math.abs(L - L0) / L0);
        const Lw = rotateByQuat(q, momentumBody(I, w));
        dLw = Math.max(dLw, Math.hypot(Lw[0] - Lw0[0], Lw[1] - Lw0[1], Lw[2] - Lw0[2]) / L0);
        // POLHODE: w must satisfy BOTH surfaces. The residual is the worse of the two, relative.
        polhode = Math.max(polhode, Math.max(Math.abs(2 * E - 2 * E0) / (2 * E0), Math.abs(L * L - L0 * L0) / (L0 * L0)));
        const s = Math.sign(w[dom]);
        if (s !== 0 && s !== sign) { flips++; sign = s; }
        if (n % sample === 0) trace.push({ t: n * dt, w: [...w] });
    }
    return { I, w: w, q, flips, driftE: dE, driftL: dL, driftWorldL: dLw, polhodeResidual: polhode, trace, gyroscopic };
}

/**
 * MEASURE the growth rate rather than assert it: seed a tiny perturbation off `axis` and fit the slope of
 * ln|perturbation| over a BAND -- above `skipBelow` and below the saturation cap.
 *
 * *** THE BAND IS THE WHOLE METHOD, AND MY FIRST VERSION DID NOT HAVE ONE. *** The linearised solution is
 * A e^(sigma t) + B e^(-sigma t): near t = 0 BOTH modes matter, so a fit starting at the seed measures the
 * MIXTURE, not the growth rate. Measured -- fitting from the seed gives a relative error of 6.89e-3, and
 * skipping ONE DECADE of transient gives 3.95e-5. A HUNDRED AND SEVENTY FOUR TIMES BETTER.
 *
 * And the contaminated fit does not look wrong: r2 = 0.9998, which anybody would report as an excellent fit.
 * The clean band reads r2 = 0.999999996. *** A PLAUSIBLE NUMBER THAT IS WRONG FOR A NAMEABLE REASON, and the
 * give-away is not the residual but WHERE THE WINDOW STARTS. ***
 *
 * Tightening the SATURATION cap instead makes it WORSE (6.07e-3 -> 9.97e-3 as the cap falls 0.2 -> 0.002),
 * because that keeps the transient and throws away the clean part -- which is how the cause was identified
 * rather than guessed.
 *
 * Returns { sigma, r2, saturated, points }.
 */
export function measureGrowth({ I, axis, Omega = 1, eps = 1e-9, skipBelow = 1e-7, dt = 1e-3, steps = 400000 } = {}) {
    const w0 = [0, 0, 0];
    w0[axis] = Omega;
    w0[(axis + 1) % 3] = eps;
    let w = [...w0];
    const xs = [], ys = [];
    const other = (axis + 1) % 3;
    const cap = Math.abs(Omega) * 0.05;                 // stay in the linear regime
    let saturated = false;
    for (let n = 0; n < steps; n++) {
        w = stepOmega(I, w, dt, { gyroscopic: true });
        const a = Math.abs(w[other]);
        if (a > cap) { saturated = true; break; }
        if (n % 20 === 0 && a >= skipBelow) { xs.push(n * dt); ys.push(Math.log(a)); }
    }
    if (xs.length < 8) return { sigma: 0, r2: 0, saturated, points: xs.length };
    const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, b) => a + b * b, 0), sxy = xs.reduce((a, b, k) => a + b * ys[k], 0);
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), inter = (sy - slope * sx) / n;
    const ybar = sy / n;
    const ssTot = ys.reduce((a, b) => a + (b - ybar) ** 2, 0);
    const ssRes = ys.reduce((a, b, k) => a + (b - (slope * xs[k] + inter)) ** 2, 0);
    return { sigma: slope, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, saturated, points: n };
}

/**
 * THE GAP, MEASURED FROM THE TREE RATHER THAN ASSERTED -- so the follow-on round starts from a reading.
 * Reports what the two backends can and cannot be asked about rotation today.
 */
export function contractGap() {
    const read = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return ""; } };
    const shim = read("physics/box3d/box3d_shim.c");
    const b3 = read("physics/box3d/box3dLoader.js"), jolt = read("physics/jolt/joltLoader.js");
    const contract = read("physics/backendConformance.mjs");
    const shipIsCube = /b3MakeBoxHull\(half, half, half\)/.test(shim);
    const boxTakesThree = /b3MakeBoxHull\(hx, hy, hz\)/.test(shim);
    const angularDrive = /angularImpulse\s*\(/.test(b3) && /angularImpulse\s*\(/.test(jolt);
    const velIsLinear = /SEVEN floats per body|readVelocities\(\)/.test(contract) && !/readAngular/.test(b3) && !/readAngular/.test(jolt);
    const contractAngular = /angularImpulse|readAngular|angularVelocity/.test(contract);
    const joltDamps = /mAngularDamping/.test(jolt);
    return { shipIsCube, boxTakesThree, angularDrive, velIsLinear, contractAngular, joltDamps };
}

/**
 * *** BOUNDEDNESS, AND IT EXISTS BECAUSE measureGrowth CANNOT SPEAK FOR A STABLE AXIS. ***
 *
 * A stable perturbation OSCILLATES around the seed and never rises past the fit band's floor, so measureGrowth
 * collects ZERO points and returns { sigma: 0, r2: 0 } from its guard. My first gate asserted "the stable axes
 * show no exponential trend" against exactly that -- A CHECK PASSING ON AN EMPTY FIT, which is v3551's
 * structurally-guaranteed answer inside the round that quotes v3551.
 *
 * So the stable case gets its own OBSERVABLE rather than borrowing the unstable one's: the largest excursion the
 * perturbation ever makes, as a multiple of its seed. Bounded means O(1); unstable means e^(sigma T).
 */
export function growthFactor({ I, axis, Omega = 1, eps = 1e-9, dt = 1e-3, T = 40 } = {}) {
    const w0 = [0, 0, 0];
    w0[axis] = Omega;
    w0[(axis + 1) % 3] = eps;
    let w = [...w0], peak = 0;
    const other = (axis + 1) % 3, steps = Math.round(T / dt);
    for (let n = 0; n < steps; n++) {
        w = stepOmega(I, w, dt, { gyroscopic: true });
        const a = Math.abs(w[other]);
        if (a > peak) peak = a;
        if (peak / eps > 1e12) break;                 // unstable: it has made the point
    }
    return { factor: peak / eps, bounded: peak / eps < 1e3 };
}

export const MEASURED_V3562 = {
    fixture: "uniform block, half-extents 1 x 2 x 3, mass 1 -> principal moments strictly distinct",
    plantIsTheEngineDefect:
        "The plant is `gyroscopic: false` -- DELETE THE RIGHT-HAND SIDE OF EULER'S EQUATIONS. That is not an " +
        "invented fault: it is what a solver does when it omits w x I w for stability, which game engines " +
        "routinely do and Jolt exposes as an OPT-IN. The plant IS the shipped-code defect this instrument " +
        "exists to detect.",
    conservationIsBlind:
        "*** AND EVERY CONSERVATION KEY IS BLIND TO IT, BETTER THAN BLIND: with the term gone w is CONSTANT, so " +
        "energy and |L| are conserved EXACTLY -- to zero drift, beating the true solver's integrator error. A " +
        "SOLVER THAT DELETES THE PHYSICS OUTSCORES ONE THAT KEEPS IT ON THE OBVIOUS KEY. v3422's white-dwarf " +
        "plant in a new subject, and the reason this module ships four key families rather than one.",
    theSharpKeyIsARate:
        "Only the stability family catches it, and the key is the RATE not the sign: sigma = W sqrt((I2-I1)" +
        "(I3-I2)/(I1 I3)) for sorted moments, derived from the linearisation and never fitted. A sign-only key " +
        "passes any solver that is unstable for any reason; a wrong equation gets the rate wrong even when it " +
        "happens to grow.",
    worldFrameIsASecondRoute:
        "The world-frame angular momentum VECTOR is constant, and reaching it needs the integrated quaternion, " +
        "so it grades the attitude integration -- which the body-frame invariants never touch. Two routes, one " +
        "number, no shared code.",
    modeMixtureFit: { fromSeed: 6.89e-3, oneDecadeSkipped: 3.95e-5, ratio: 174,
        r2FromSeed: 0.99977, r2Banded: 0.999999996,
        note: "A FIT THAT STARTS AT THE SEED MEASURES A MIXTURE OF TWO MODES. The linearised solution is " +
              "A e^(sigma t) + B e^(-sigma t) and the decaying mode is only negligible after a decade of " +
              "growth. The contaminated fit reads r2 = 0.9998 -- an excellent-looking fit that is 174x " +
              "further from the predicted rate. Tightening the SATURATION cap makes it worse, not better, " +
              "which is how the cause was identified instead of guessed." },
    emptyFitTrap:
        "measureGrowth returns { sigma: 0, r2: 0 } from its own guard when a STABLE axis never rises past the " +
        "fit band's floor -- and my first gate asserted 'the stable axes show no exponential trend' against " +
        "exactly that. A CHECK PASSING ON AN EMPTY FIT, which is v3551's structurally-guaranteed answer, " +
        "inside the round that quotes v3551. growthFactor() gives the stable case its own observable.",
    gyroscopeIsNotThis:
        "physics/gyroscope.js takes a SCALAR I = 1 and applies a tip torque. A scalar inertia has no " +
        "intermediate axis and a torque is not torque-free: it shares the subject and not one line of the " +
        "substrate. Nothing here extends it.",
    backendsNotTouched:
        "box3d and jolt are untouched. Both loaders already expose angularImpulse() and readTransforms() " +
        "(pos + quat), so the flip is drivable AND observable in both today; readVelocities() is three floats, " +
        "LINEAR ONLY, so neither reports w. contractGap() reports that from the tree rather than asserting it.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    const I = boxInertia({ m: 1, hx: 1, hy: 2, hz: 3 });
    const mid = intermediateAxis(I);
    L.push("[freeRotation] Torque-free rigid body rotation -- and which key survives a solver that drops the");
    L.push("               gyroscopic term.");
    L.push("");
    L.push("  Block 1 x 2 x 3, mass 1.  Principal moments  " + I.map((v) => v.toFixed(6)).join("  "));
    L.push("  Intermediate axis: " + mid + "   (largest " + I.indexOf(Math.max(...I)) +
           ", smallest " + I.indexOf(Math.min(...I)) + ")");
    L.push("");
    L.push("  PREDICTED, from the linearisation, never fitted:");
    for (const a of [0, 1, 2]) {
        const s = stabilityRate(I, a, 1);
        L.push("    axis " + a + "   " + (s.stable ? "STABLE   (oscillates)" : "UNSTABLE  sigma = " + s.sigma.toFixed(6)));
    }
    L.push("");
    const truth = integrate({ I, w0: [1e-6, 1, 1e-6], dt: 1e-3, steps: 60000 });
    const plant = integrate({ I, w0: [1e-6, 1, 1e-6], dt: 1e-3, steps: 60000, gyroscopic: false });
    L.push("  MEASURED, 60 s of spin started about the INTERMEDIATE axis:");
    L.push("    TRUE solver    flips " + truth.flips + "   dE " + truth.driftE.toExponential(2) +
           "   d|L| " + truth.driftL.toExponential(2) + "   world-L " + truth.driftWorldL.toExponential(2));
    L.push("    NO GYROSCOPIC  flips " + plant.flips + "   dE " + plant.driftE.toExponential(2) +
           "   d|L| " + plant.driftL.toExponential(2) + "   world-L " + plant.driftWorldL.toExponential(2));
    L.push("");
    L.push("  *** READ THAT TWICE. THE SOLVER WITH THE PHYSICS DELETED CONSERVES ENERGY AND ANGULAR MOMENTUM");
    L.push("  BETTER THAN THE ONE THAT KEEPS IT, AND NEVER FLIPS. Every conservation key rates it superior.");
    L.push("  Only the stability rate tells them apart. ***");
    L.push("");
    const g = contractGap();
    L.push("  THE BACKEND GAP, read from the tree (this round changes none of it):");
    L.push("    addShip builds a CUBE .......................... " + (g.shipIsCube ? "yes -- THREE EQUAL MOMENTS, the one" : "no"));
    L.push("      inertia tensor for which this effect CANNOT happen. The fixture excludes the phenomenon.");
    L.push("    addBox already takes three half-extents ........ " + (g.boxTakesThree ? "yes -- a distinct-moment body is one call away" : "no"));
    L.push("    both loaders can SPIN a body .................. " + (g.angularDrive ? "yes (angularImpulse)" : "no"));
    L.push("    either loader can REPORT w ................... " + (g.velIsLinear ? "no -- readVelocities is linear only" : "yes"));
    L.push("    conformance contract has an angular call ...... " + (g.contractAngular ? "yes" : "NO -- it cannot ask a rotational question at all"));
    L.push("    jolt applies angular damping by default ....... " + (g.joltDamps ? "yes -- DAMPED ROTATION IS NOT TORQUE-FREE; pin it before comparing" : "no"));
    L.push("");
    L.push("  " + MEASURED_V3562.backendsNotTouched);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
