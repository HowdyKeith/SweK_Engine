// tools/roundhouse/xpbdBind.mjs
//
// v3458 -- THE XPBD DEVICE. First of fifteen ungraded modules under physics/xpbd to get a key.
//
// The key is the claim xpbd.js makes in its own header: compliance makes stiffness INDEPENDENT OF ITERATION
// COUNT, and dropping the -aTilde*lambda term from Eq (18) puts you back to iteration-dependent behaviour. Both
// halves are measurable, and the exact answer is Hooke's law -- at equilibrium a compliant link stretches by
// alpha * F, with compliance as inverse stiffness.
//
// MODES:
//   "hooke"      the settled stretch against alpha * F, and its linearity in compliance
//   "iteration"  the central claim: stretch across 1, 2, 4, 8, 16 iterations. XPBD spread 0.00e+0
//   "substep"    the WEAKER claim, kept and labelled -- it is true, and it CANNOT separate XPBD from PBD
//
// THE PLANTED FAULT drops the lambda term, which is the exact fault the header warns about. PBD's stretch then
// HALVES with each doubling of iterations: 1.0000e-2, 4.9383e-3, 2.4082e-3, 1.1447e-3, 5.1599e-4.

import { hangingLink, iterationIndependence, stiffnessIndependence, hookeStretch } from "../../physics/xpbd/compliance.mjs";
import { volumeConvergence, pressureRun, baseSolid, meshVolume } from "../../physics/xpbd/volumeKey.mjs";
import { dampingSweep, reducesToUndamped } from "../../physics/xpbd/dampingKey.mjs";
import { thresholdSweep, offsetConvergence, criticalAngle, coulombExact } from "../../physics/xpbd/frictionKey.mjs";
import { kernelIntegral, latticeRestDensity, compressionRecovery } from "../../physics/xpbd/pbfKey.mjs";
import { volumeConstraintEffect, ellipsoidGirthRatio } from "../../physics/xpbd/muscleKey.mjs";
import { weaveAnisotropy, tearRun } from "../../physics/xpbd/weaveKey.mjs";
import { modulateKeys } from "../../physics/xpbd/modulateKey.mjs";
import { sampledKeys } from "../../physics/xpbd/sampledFieldKey.mjs";
import { fluidKeys } from "../../physics/xpbd/fluidKey.mjs";
import { attachKeys } from "../../physics/xpbd/attachKey.mjs";
import { clothLoopKeys } from "../../physics/xpbd/clothLoopKey.mjs";
import { frictionalContactKeys } from "../../physics/xpbd/frictionalContactKey.mjs";   // v3533 - grains: particle-particle Coulomb contact

export const XPBD_OBSERVABLES = [
    "stretch", "exactStretch", "stretchErrFrac", "amplitude", "meanLength",
    "iterSpread", "iterWorstErrFrac", "halvesWithIterations",
    "substepSpread", "amplitudeGrows", "compliance", "iterations", "substeps", "planted",
    "meshVolume", "meshVolumeErrFrac", "convergenceRatio", "secondOrder",
    "volumeRatio", "targetErrFrac", "baseFaces", "baseIsOctahedron",
    "amplitudeReduction", "amplitudeMonotoneDown", "equilibriumSpread", "dampedLimitRelDiff",
    "criticalAngleDeg", "coulombExactDeg", "criticalErrFrac", "offsetIsConstant", "offsetSecondOrder",
    "kernelIntegral", "kernelIntegralErr", "restDensity", "densityReduction", "densityRmsAfter",
    "muscleVolumeHeld", "muscleVolumeLostWithout", "muscleBulge", "muscleBulgeAmplification", "muscleGirthVsEllipsoid",
    "anisotropyRatio", "swapReverses", "isotropicResidual", "softStretch",
    "tearStart", "tearEnd", "tearMonotoneDown",
    "zeroFieldErr", "compoundErr", "orderErr", "swell", "swells",
    "affineErr", "nodeErr", "clampErr", "nnAffineErr", "affineExact", "beatsNearest",
    "momentumErr", "splitErr", "plantMomentumErr", "momentumConserved", "splitByInverseMass", "heavierMovesLess", "contactsFire", "plantBreaksIt",
    "snapErr", "springErr", "plantSpringErr", "snapsAtZero", "orderFree", "softSpring", "plantSnapsWrongly",  // orderErr already declared (modulate)
    "freeFallErr", "equivErr", "freeFallDrop", "freeFallExact", "equivalent", "clothMoves",
    "coneErr", "stickErr", "comErr", "coneHolds", "sticks", "twoWay", "deterministic",   // v3533 grains
];

const DEF = { rest: 1.0, compliance: 1e-3, gravity: -10, substeps: 800, totalTime: 4.0, iterations: 1, inflation: 1.5, mu: 0.5, h: 1.0, tearStrain: 1.06 };

function buildXpbd({ mode = "hooke", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const planted = !!config.planted;
    const blank = {
        stretch: null, exactStretch: null, stretchErrFrac: null, amplitude: null, meanLength: null,
        iterSpread: null, iterWorstErrFrac: null, halvesWithIterations: null,
        substepSpread: null, amplitudeGrows: null,
        compliance: c.compliance, iterations: c.iterations, substeps: c.substeps, planted,
        meshVolume: null, meshVolumeErrFrac: null, convergenceRatio: null, secondOrder: null,
        volumeRatio: null, targetErrFrac: null, baseFaces: null, baseIsOctahedron: null,
        amplitudeReduction: null, amplitudeMonotoneDown: null, equilibriumSpread: null, dampedLimitRelDiff: null,
        criticalAngleDeg: null, coulombExactDeg: null, criticalErrFrac: null,
        offsetIsConstant: null, offsetSecondOrder: null,
        kernelIntegral: null, kernelIntegralErr: null, restDensity: null,
        densityReduction: null, densityRmsAfter: null,
        muscleVolumeHeld: null, muscleVolumeLostWithout: null, muscleBulge: null,
        muscleBulgeAmplification: null, muscleGirthVsEllipsoid: null,
        anisotropyRatio: null, swapReverses: null, isotropicResidual: null, softStretch: null,
        tearStart: null, tearEnd: null, tearMonotoneDown: null,
        zeroFieldErr: null, compoundErr: null, orderErr: null, swell: null, swells: null,
        affineErr: null, nodeErr: null, clampErr: null, nnAffineErr: null, affineExact: null, beatsNearest: null,
        snapErr: null, springErr: null, plantSpringErr: null, snapsAtZero: null, orderFree: null, softSpring: null, plantSnapsWrongly: null,
        freeFallErr: null, equivErr: null, freeFallDrop: null, freeFallExact: null, equivalent: null, clothMoves: null,
        coneErr: null, stickErr: null, comErr: null, coneHolds: null, sticks: null, twoWay: null, deterministic: null,
        momentumErr: null, splitErr: null, plantMomentumErr: null, momentumConserved: null,
        splitByInverseMass: null, heavierMovesLess: null, contactsFire: null, plantBreaksIt: null,
    };

    // v3459 -- THE PRESSURE CONSTRAINT. Three keys: the divergence-theorem volume converging on 4/3 pi r^3 at
    // SECOND order, exact conservation at target, and every inflation target hit to 1.6e-16.
    // v3460 -- DAMPING. Both halves of the header's claim: the transient falls, the equilibrium does not move.
    // v3461 -- COULOMB. The critical slope is atan(mu) exactly, and the residual is the detector's dead time,
    // which is proved by the offset being CONSTANT across mu and falling at second order with run length.
    // v3462 -- PBF. The poly6 normalisation is an analytic identity (exactly 1 at every h), and the density
    // solver must drive a compressed lattice back toward its MEASURED rest density.
    // v3463 -- MUSCLE. Volume is the EXACT key (held to 1.8e-14 through a 36% contraction); the ellipsoid girth
    // law is indicative only, because the belly barrels rather than staying an ellipsoid.
    // v3464 -- WIRING anisotropy AND tear. Both already had passing selfchecks; what this adds is reach for the
    // lab's machinery (sweep, sensitivity, baseline, valueMatch), not a new physics key.
    // v3462 -- MODULATE, THE SPINE. The three keys are INVARIANCES the whole coupling system inherits, not a
    // value graded against its own formula (which is the tautology that would make this device look better than
    // it is): a zero field returns every parameter EXACTLY to base, a FIXED field does not compound across
    // frames (rest@1 == rest@100), and the map is order-free. The planted live-read compounds as (1+exp*T)^N and
    // AGREES with the correct spine at one application -- the honest-plant test, exercised in the selfcheck. The
    // three Err observables are exact zeros by construction and carry their sentence in exactZeroRegister.
    // v3463 -- SAMPLED FIELD, THE EXTERNAL-INPUT COUPLING. The keys are ANALYTIC IDENTITIES, not the sampler
    // graded against the sampler: trilinear reproduces an affine field to 2.7e-15 against the CLOSED FORM a.x+b,
    // sampling AT a node returns the stored value to the bit, and an out-of-range read clamps to the edge
    // exactly. The plant is nearest-neighbour, which AGREES with trilinear at every node (invisible where a
    // hand-check looks) and parts by 8.1e-1 between them -- the honest-plant discipline again. nodeErr and
    // clampErr are exact zeros and carry their sentence in exactZeroRegister; affineErr is real arithmetic
    // (~2.7e-15) and nnAffineErr is the negative control proving the field varies.
    // v3464 -- FLUID<->MESH, THE TWO-WAY COUPLING. The key is a CONSERVATION LAW, not an identity: the contact
    // solve moves A by +wa*s*d and B by -wb*s*d (equal and opposite), so the mass-weighted centroid Sum(m_i*x_i)
    // is invariant to 5e-18 -- Newton's third law, referenced against the conserved quantity computed from the
    // masses. The split is by inverse mass (|dA|/|dB| == wa/wb to 2e-16, heavier moves less). The plant is the
    // header's own -- drop one half of the correction and momentum leaks 2.6e-2 -- and it is honest: with no
    // contact both solvers conserve trivially, so the plant shows only when a pair interpenetrates. momentumErr
    // and splitErr are nonzero float roundoff, graded by tolerance, so neither is on the exact-zero register.
    // v3478 -- WORLD ATTACHMENTS, THE LAST xpbd module with a checkable external key. Two regimes of one formula
    // plus an order invariance: compliance 0 snaps the particle onto the anchor exactly in one step (snapErr 0),
    // positive compliance keeps aTilde/(w+aTilde) of the offset against the closed form (springErr ~1.7e-16), and
    // a distinct particle per attachment makes the solve order-free (orderErr 0). The plant is the header's own
    // two-regime claim as a fault -- ignore compliance and everything snaps -- which agrees with the correct
    // solve at compliance 0 and breaks the soft spring. snapErr and orderErr are exact zeros on the register;
    // springErr is real arithmetic. orderErr is the modulate field name reused, graded here as xpbd.attach.orderErr.
    // v3479 -- THE GPU BUFFER-PASS LOOP. clothLoop already has a passing selfcheck, so this is the weave/tear
    // pattern -- lab reach, not a new claim: the equivalence "clothFrame == the v2661 clothSubstep" swept across
    // {iterations x grid} (equivErr 0) and put under baseline/sensitivity, plus one graded number no xpbd device
    // had -- the semi-implicit Euler FREE-FALL closed form, pos = g*dt^2 and vel = g*dt to the bit (freeFallErr 0,
    // the integrator not the constraint solve). Both are exact zeros on the register. The plant drops -aTilde*
    // lambda from the solve and is honest: byte-identical at compliance 0 (aTilde 0), divergent above it.
    if (mode === "clothloop") {
        const c = clothLoopKeys();
        return { ...blank, freeFallErr: c.freeFallErr, equivErr: c.equivErr, freeFallDrop: c.freeFallDrop,
                 freeFallExact: c.freeFallExact, equivalent: c.equivalent, clothMoves: c.clothMoves };
    }
    // v3533 -- GRAINS, lab reach for frictionalContact.js: the particle-particle Coulomb path (which the plane
    // "friction" mode never runs). The cone clamps a slide to mu*depth, a slow pair sticks, the split is two-way,
    // the solve is deterministic. The plant removes the cone clamp and only coneErr moves.
    if (mode === "grains") {
        const g = frictionalContactKeys(planted);
        return { ...blank, coneErr: g.coneErr, stickErr: g.stickErr, comErr: g.comErr,
                 coneHolds: g.coneHolds, sticks: g.sticks, twoWay: g.twoWay, deterministic: g.deterministic };
    }
    if (mode === "attach") {
        const a = attachKeys();
        return { ...blank, snapErr: a.snapErr, orderErr: a.orderErr, springErr: a.springErr, plantSpringErr: a.plantSpringErr,
                 snapsAtZero: a.snapsAtZero, orderFree: a.orderFree, softSpring: a.softSpring, plantSnapsWrongly: a.plantSnapsWrongly };
    }
    if (mode === "fluid") {
        const f = fluidKeys();
        return { ...blank, momentumErr: f.momentumErr, splitErr: f.splitErr, plantMomentumErr: f.plantMomentumErr,
                 momentumConserved: f.momentumConserved, splitByInverseMass: f.splitByInverseMass,
                 heavierMovesLess: f.heavierMovesLess, contactsFire: f.contactsFire, plantBreaksIt: f.plantBreaksIt };
    }
    if (mode === "sampled") {
        const s = sampledKeys();
        return { ...blank, affineErr: s.affineErr, nodeErr: s.nodeErr, clampErr: s.clampErr,
                 nnAffineErr: s.nnAffineErr, affineExact: s.affineExact, beatsNearest: s.beatsNearest };
    }
    if (mode === "modulate") {
        const m = modulateKeys();
        return { ...blank, zeroFieldErr: m.zeroFieldErr, compoundErr: m.compoundErr, orderErr: m.orderErr,
                 swell: m.swell, swells: m.swells };
    }
    if (mode === "weave") {
        const a = weaveAnisotropy();
        return { ...blank, anisotropyRatio: a.anisotropyRatio, swapReverses: a.swapReverses,
                 isotropicResidual: a.isotropicWhenEqual, softStretch: a.softWarp };
    }
    if (mode === "tear") {
        const t = tearRun({ strain: Number.isFinite(c.tearStrain) ? c.tearStrain : 1.06 });
        return { ...blank, tearStart: t.start, tearEnd: t.end, tearMonotoneDown: t.monotoneDown };
    }
    if (mode === "muscle") {
        const e = volumeConstraintEffect();
        const pred = ellipsoidGirthRatio(e.on.lengthRatio);
        return { ...blank,
            muscleVolumeHeld: e.volumeHeld,
            muscleVolumeLostWithout: e.volumeLostWithout,
            muscleBulge: e.bulgeOn,
            muscleBulgeAmplification: e.bulgeAmplification,
            muscleGirthVsEllipsoid: Math.abs(e.on.girthRatio - pred) / pred };
    }
    if (mode === "kernel") {
        const h = Number.isFinite(c.h) ? c.h : 1.0;
        const I = kernelIntegral(h);
        return { ...blank, kernelIntegral: I, kernelIntegralErr: Math.abs(I - 1),
                 restDensity: latticeRestDensity() };
    }
    if (mode === "density") {
        const r = compressionRecovery();
        return { ...blank, restDensity: r.rho0, densityReduction: r.reduction, densityRmsAfter: r.after.rms };
    }
    if (mode === "friction") {
        const mu = Number.isFinite(c.mu) ? c.mu : 0.5;
        const sw = thresholdSweep([0.2, 0.5, 0.8, 1.0]);
        const conv = offsetConvergence(mu);
        return { ...blank,
            criticalAngleDeg: criticalAngle(mu), coulombExactDeg: coulombExact(mu),
            criticalErrFrac: sw.worstErrFrac,
            offsetIsConstant: sw.offsetIsConstant, offsetSecondOrder: conv.secondOrder };
    }
    if (mode === "damping") {
        const d = dampingSweep([0, 1e-3, 1e-2, 1e-1, 1]);
        const lim = reducesToUndamped();
        return { ...blank,
            amplitudeReduction: d.amplitudeReduction,
            amplitudeMonotoneDown: d.amplitudeMonotoneDown,
            equilibriumSpread: d.equilibriumSpread,
            exactStretch: d.exact,
            stretchErrFrac: d.worstStretchErrFrac,
            dampedLimitRelDiff: Math.max(lim.stretchRelDiff, lim.amplitudeRelDiff) };
    }
    if (mode === "volume") {
        const conv = volumeConvergence();
        const last = conv.rows[conv.rows.length - 1];
        const b = baseSolid();
        return { ...blank,
            meshVolume: last.volume, meshVolumeErrFrac: last.errFrac,
            convergenceRatio: conv.ratios[conv.ratios.length - 1], secondOrder: conv.approachesFour,
            baseFaces: b.faces, baseIsOctahedron: b.isOctahedron };
    }
    if (mode === "pressure") {
        const p = pressureRun({ inflation: Number.isFinite(c.inflation) ? c.inflation : 1.5 });
        return { ...blank, volumeRatio: p.ratio, targetErrFrac: p.targetErrFrac };
    }
    if (mode === "iteration") {
        const r = iterationIndependence([1, 2, 4, 8, 16], { ...c, plantPBD: planted });
        return { ...blank, iterSpread: r.spread, iterWorstErrFrac: r.worstErrFrac,
                 halvesWithIterations: r.halvesWithIterations, exactStretch: r.exact };
    }
    if (mode === "substep") {
        const r = stiffnessIndependence([400, 800, 1600, 3200], { ...c, plantPBD: planted });
        return { ...blank, substepSpread: r.spread, amplitudeGrows: r.amplitudeGrows, exactStretch: r.exact };
    }

    const r = hangingLink({ ...c, plantPBD: planted });
    return {
        ...blank,
        stretch: r.stretch, exactStretch: r.exact,
        stretchErrFrac: Math.abs(r.stretch - r.exact) / r.exact,
        amplitude: r.amplitude, meanLength: r.mean,
    };
}

export const xpbdDevice = {
    // v3460 -- *** METHOD PLANT, AND THE CODE SAYS SO IN ONE LINE: `const step = plantPBD ? pbdSubstepOneLink :
    // xpbdSubstep`. It SUBSTITUTES A WHOLE INTEGRATOR. No knob is altered and nothing is misread -- XPBD becomes
    // PBD, which is the historically REAL mistake rather than an invented one, and it is why the stiffness and
    // iteration keys exist: PBD's effective stiffness depends on the iteration count and XPBD's does not. ***
    // seismic (v3400) is the precedent for this third kind; declared here because plantedCoverage's wall is at
    // ZERO undeclared and a plant nobody has classified is a plant nobody can reason about.
    plantKind: "method",
    modes: ["hooke", "iteration", "substep", "volume", "pressure", "damping", "friction", "kernel", "density", "muscle", "weave", "tear", "modulate", "sampled", "fluid", "attach", "clothloop", "grains"],
    name: "xpbd-compliance", observables: XPBD_OBSERVABLES, build: buildXpbd,
    defaults: ({ mode } = {}) => ({ mode: mode || "hooke", config: { ...DEF } }),
};
