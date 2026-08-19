// tools/roundhouse/emBind.mjs
//
// v3387 -- THE ELECTROMAGNETISM DEVICE, AND AN OVERLAP I SHOULD HAVE FOUND FIRST.
//
// *** A `fdtd` DEVICE ALREADY EXISTED *** with modes dispersion, magic and lightspeed -- covering the Yee
// scheme, the magic time step AND a measured speed of light. I surveyed the physics/ DIRECTORIES, saw no `em`
// folder, and concluded electromagnetism was missing. It was missing as a folder and present as a device. The
// standing instruction in this project is to check for an existing implementation before building a new one,
// and a directory listing is not that check.
//
// WHAT IS GENUINELY NEW HERE, after removing the overlap:
//   MEDIA        n = sqrt(eps_r mu_r), wave impedance Z0/n, phase speed c/n -- fdtd has no material model
//   INTERFACES   Fresnel reflection, and its identity with the seismic impedance reflection
//   REFRACTION   Snell and the critical angle, sharing the seismic ray-parameter invariant
//   CONSTANTS    c and Z0 derived from mu0 and eps0 rather than measured from a simulation
//
// WHAT OVERLAPS, and is kept only because it is cheap and the cross-check is worth having: the Courant cliff.
// fdtd measures c by PROPAGATION; this computes it from the vacuum constants. Those are genuinely different
// routes and their agreement is a real coupling -- which the value-match census found on its own.
//
// MODES:
//   "vacuum"    c = 1/sqrt(mu0 eps0) and Z0 = sqrt(mu0/eps0), graded against DEFINED and accepted values
//   "interface" Fresnel reflection, checked against the SEISMIC impedance reflection -- one relation, two fields
//   "snell"     refraction and the critical angle, the same invariant as the seismic ray parameter
//   "fdtd"      the Yee scheme's Courant cliff, and the 1/sqrt(dim) CFL limit
//
// THE PLANTED ERROR IS n = eps_r INSTEAD OF sqrt(eps_r mu_r) -- dropping the square root. For glass it returns
// 2.25 instead of 1.5: a plausible refractive index for a dense material, in the right range, dimensionless and
// positive. It corrupts Fresnel (-0.385 instead of -0.200) and the critical angle together, consistently.
//
// *** AND THE CROSS-FIELD CHECK DOES NOT CATCH IT, WHICH IS WORTH RECORDING. *** I first wrote that the seismic
// impedance comparison would. It does not: both sides use the SAME wrong index -- Fresnel through n and the
// seismic route through Z0/n -- so they agree perfectly on the wrong answer and matchesSeismic stays true. A
// cross-check between two routes that share a corrupted input is not a cross-check.
//
// What DOES catch it is an internal relation the wrong index cannot satisfy: n * v_phase must equal c. Planted,
// it gives 4.497e8 against c = 2.998e8. The phase speed is computed from sqrt(eps_r mu_r) inside phaseSpeed
// while the index is not, so the product exposes the missing square root. The lesson is that a coupling only
// tests what the two routes do NOT share.

import {
    lightSpeed, impedanceFreeSpace, C_DEFINED, refractiveIndex, waveImpedance, phaseSpeed,
    fresnelNormal, snellRefract, criticalAngle, cflLimit, peakField, gaussianPulse,
} from "../../physics/em/maxwell.mjs";
import { reflectionCoef } from "../../physics/seismic/rays.mjs";
// v3420 -- *** TWO MORE v3410 MODULES THAT HAD A PAGE, A GATE AND NO BIND. *** Modes on the em device rather
// than new devices: both are electromagnetism and neither needs its own registry row. What binding buys is not
// coverage arithmetic -- it is that the roundhouse can now RUN them: lab export, corroboration, a planted
// error, a lab-results row. AN INSTRUMENT YOU CAN LOOK AT BUT CANNOT RUN IS HALF AN INSTRUMENT.
import { measureCutoffs, cutoffK } from "../../physics/em/waveguide.js";
import { measureRho, rhoXX_WRONG, measureSigma } from "../../physics/em/hall.js";

export const EM_OBSERVABLES = [
    "cComputed", "cDefined", "cErrFrac", "z0", "index", "impedance", "phaseSpeed",
    "fresnel", "seismicEquivalent", "matchesSeismic",
    "refractAngle", "criticalAngleDeg", "totalInternal",
    "peakAtLimit", "peakOverLimit", "cflCliff", "cfl1D", "cfl2D", "cfl3D", "planted",
    "indexSpeedProduct", "indexSpeedConsistent",
    "te10", "te10Exact", "te10RelErr", "degenerateGap", "tmHasTe10", "tmLowest", "neumannZero",
    "rhoXX", "rhoXXNaive", "naiveGapRel", "wcTau", "gapOverWcTauSq", "rhoXYTauSpread",
    "nUsed", "betaThreshold", "betaThresholdRecovered", "thresholdRelErr", "betaFromPhaseSpeed",
    "twoRouteGap", "cosThetaAtThreshold", "cosThetaMax", "cosThetaMaxExact", "monotone",
    "machCosAtThreshold", "machTriggersAtSameBeta",
];

// v3388 -- theta1 moved off 0.5 rad for the same reason acoustics moved v off 0.5c: round defaults manufacture
// census collisions. epsR = 2.25 and n2 = 1.5 are KEPT deliberately -- they are real glass, the pair is what
// makes n = sqrt(eps_r) legible at a glance, and 1.5 is a measured material property rather than a chosen knob.
const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    carrierN: 1e22,
    tau: 1e-13,
    B: 5,
 epsR: 2.25, muR: 1, theta1: 0.43, n1: 1, n2: 1.5, N: 200, steps: 300 };

// v3424 -- ONE DEFINITION OF THE MODE LIST. Four binds needed this in the last three rounds and one of them had
// a mode nobody could discover; this device had no guard to disagree with, and it gets the constant anyway so
// that the next mode added here cannot start the same drift.
export const EM_MODES = ["vacuum", "interface", "snell", "fdtd", "waveguide", "hall", "cherenkov"];

function buildEm({ mode = "vacuum", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const blank = {
        cComputed: null, cDefined: null, cErrFrac: null, z0: null,
        index: null, impedance: null, phaseSpeed: null,
        fresnel: null, seismicEquivalent: null, matchesSeismic: null,
        refractAngle: null, criticalAngleDeg: null, totalInternal: null,
        peakAtLimit: null, peakOverLimit: null, cflCliff: null,
        cfl1D: null, cfl2D: null, cfl3D: null, planted: !!config.planted,
        indexSpeedProduct: null, indexSpeedConsistent: null,
    };
    // the planted error: drop the square root, so n = eps_r rather than sqrt(eps_r mu_r)
    const nOf = (epsR, muR) => (config.planted ? epsR * muR : refractiveIndex(epsR, muR));

    if (mode === "interface") {
        const Z0 = impedanceFreeSpace();
        const n2 = config.planted ? nOf(c.epsR, c.muR) : c.n2;
        const fr = fresnelNormal(c.n1, n2);
        const seis = reflectionCoef(Z0 / c.n1, Z0 / n2);
        return {
            ...blank, index: n2, fresnel: fr, seismicEquivalent: seis,
            matchesSeismic: Math.abs(Math.abs(fr) - Math.abs(seis)) < 1e-15,
        };
    }
    if (mode === "snell") {
        const n2 = config.planted ? nOf(c.epsR, c.muR) : c.n2;
        const tc = criticalAngle(n2, c.n1);
        return {
            ...blank, index: n2,
            refractAngle: snellRefract(c.n1, n2, c.theta1),
            criticalAngleDeg: Number.isNaN(tc) ? null : tc * 180 / Math.PI,
            totalInternal: Number.isNaN(snellRefract(n2, c.n1, (tc || 0) + 0.05)),
        };
    }
    if (mode === "fdtd") {
        const s = gaussianPulse(60, 10);
        const at = peakField(s, c.N, 1.0, c.steps), over = peakField(s, c.N, 1.05, c.steps);
        return {
            ...blank, peakAtLimit: at, peakOverLimit: over, cflCliff: over > at * 1e10,
            cfl1D: cflLimit(1), cfl2D: cflLimit(2), cfl3D: cflLimit(3),
        };
    }

    if (mode === "waveguide") {
        // *** THE BOUNDARY CONDITION IS THE PHYSICS, AND THE NUMBERS ALONE WOULD NOT CATCH A SWAP. *** TE is
        // Neumann and TM is Dirichlet on the same 2D eigenproblem, so Ez must vanish on a conductor and THERE IS
        // NO TM10 -- while TE10 is the mode every rectangular guide is designed around. Solving TM with the
        // Neumann operator returns a tidy, plausible cutoff for a pipe that does not exist, which is why THE
        // MODE SET is checked and not only the frequencies.
        const te = measureCutoffs({ kind: "TE", nx: 24, ny: 12, a: 2, b: 1, count: 5 });
        const tm = measureCutoffs({ kind: "TM", nx: 24, ny: 12, a: 2, b: 1, count: 5 });
        // AND THE KEY NOTHING IN THE MATRIX KNOWS: for a 2:1 guide TE01 and TE20 are DEGENERATE. That falls out
        // of the geometry, not the discretisation, so agreement is a RESULT rather than a restatement.
        const gap = Math.abs(te.ks[1] - te.ks[2]) / Math.max(Math.abs(te.ks[1]), Math.abs(te.ks[2]));
        const te10Exact = cutoffK(1, 0, 2, 1);
        return {
            ...blank,
            te10: te.ks[0], te10Exact, te10RelErr: Math.abs(te.ks[0] - te10Exact) / te10Exact,
            degenerateGap: gap,
            // TM's lowest is TM11, never TM10 -- so a solver that produced TE10 here solved the wrong problem.
            tmHasTe10: tm.ks.some((k) => Math.abs(k - te10Exact) / te10Exact < 1e-3),
            tmLowest: tm.ks[0],
            // The Neumann problem carries exactly one ZERO eigenvalue, dropped BY NAME because a constant has no
            // curvature -- not by a tolerance because it happens to be small.
            neumannZero: te.dropped,
        };
    }

    if (mode === "cherenkov") {
        // *** CHERENKOV IS A THRESHOLD, AND A THRESHOLD IS A BIFURCATION -- friction's shape (v3200) pointed at
        // light. *** A charge radiates only when it outruns the phase speed of light in the medium, beta > 1/n,
        // and the emission angle satisfies cos(theta_c) = 1/(n beta). Everything below stays in COS RATHER THAN
        // THE ANGLE, so the whole mode is +,-,*,/ and sqrt with no transcendental anywhere: it is cross-arch
        // deterministic and foldable, which arccos would have cost.
        const n = nOf(c.epsR, c.muR);
        const cosTheta = (beta) => (n * beta >= 1 ? 1 / (n * beta) : null);   // null = below threshold, not zero
        // THE THRESHOLD IS RECOVERED FROM BEHAVIOUR: bisect on WHETHER THERE IS LIGHT AT ALL. Nothing in the
        // loop reads n -- the existence of a solution is the only input -- so this is an external key rather
        // than a mirror (v3201: the measuring route is independent of the route that set it).
        let lo = 0, hi = 1;
        for (let i = 0; i < 90; i++) { const mid = (lo + hi) / 2; if (cosTheta(mid) === null) lo = mid; else hi = mid; }
        const recovered = (lo + hi) / 2;

        // *** THE SECOND ROUTE IS THE ONE THE PLANT CANNOT SURVIVE. *** The threshold is a GEOMETRIC fact
        // (beta = 1/n) and the phase speed is a WAVE fact (v_phase = c/n), so beta_threshold must equal
        // v_phase/c. The planted index drops the square root while phaseSpeed keeps it, so the two routes part
        // -- the same seam this device's default mode already uses for indexSpeedConsistent, asked of a new
        // observable. A CONSISTENTLY WRONG n IS INVISIBLE TO ANY CHECK THAT ONLY EVER ASKS n.
        const betaFromWave = phaseSpeed(c.epsR, c.muR) / lightSpeed();

        // THE MACH-CONE CONFUSION, MEASURED RATHER THAN WARNED ABOUT. The shock-cone half-angle satisfies
        // sin = 1/(n beta) while the Cherenkov emission angle satisfies cos = 1/(n beta); they are
        // COMPLEMENTARY and both are "the angle" in ordinary speech. IT TRIGGERS AT EXACTLY THE SAME BETA, so
        // the threshold key is BLIND to it -- and at threshold it puts the light at ninety degrees to the track
        // instead of straight along it, which the angle key catches outright.
        const machCos = (beta) => (n * beta >= 1 ? Math.sqrt(Math.max(0, 1 - 1 / (n * beta) ** 2)) : null);

        const betas = [0.999, 0.99, 0.9, 0.8, 0.75].filter((b) => cosTheta(b) !== null);
        let monotone = true;
        for (let i = 1; i < betas.length; i++) if (!(cosTheta(betas[i]) > cosTheta(betas[i - 1]))) monotone = false;

        return {
            ...blank,
            nUsed: n, betaThreshold: 1 / n, betaThresholdRecovered: recovered,
            thresholdRelErr: Math.abs(recovered - 1 / n) * n,
            betaFromPhaseSpeed: betaFromWave,
            twoRouteGap: Math.abs(recovered - betaFromWave) / betaFromWave,
            // *** AT THRESHOLD THE LIGHT GOES STRAIGHT DOWN THE TRACK, AND THE VALUE THERE IS A ONE-SIDED
            // LIMIT. *** My first version evaluated at the bisection midpoint and got NULL half the time: the
            // midpoint can land a bit BELOW 1/n, where there is no emission and no angle to report. The
            // bracket's upper end `hi` is the smallest beta KNOWN to emit, so the limit is taken from the side
            // it exists on. A BISECTION BRACKETS A THRESHOLD; IT DOES NOT LAND ON IT, and a check that read the
            // midpoint would have been a coin flip dressed as a measurement.
            cosThetaAtThreshold: cosTheta(hi),
            // AND IT SATURATES: as beta -> 1 the cone opens to cos = 1/n, a SECOND recovery of the index from a
            // different limit of the same formula.
            cosThetaMax: cosTheta(1), cosThetaMaxExact: 1 / n, monotone,
            machCosAtThreshold: machCos(hi),   // same one-sided limit, so the two are compared at the same point
            machTriggersAtSameBeta: (machCos(recovered * 0.999) === null) === (cosTheta(recovered * 0.999) === null),
        };
    }

    if (mode === "hall") {
        // *** THE LOAD-BEARING NEGATIVE IS A PREDICTED EXPONENT, NOT A MAGNITUDE. *** The tempting wrong step is
        // rho_xx = 1/sigma_xx, which is true for a scalar and FALSE for a tensor. MEASURED across four decades
        // of omega_c*tau the relative gap is EXACTLY (omega_c tau)^2: the ratio comes back 0.9909, 0.9908,
        // 0.9951, 1.0003. At low field that gap is 7.7e-5 -- invisible to any tolerance anyone would write --
        // and at omega_c tau ~ 8.8 it is 77x. THE TWO CASES ARE TOLD APART BY THEIR EXPONENT, NOT BY WHETHER
        // THE NUMBER IS SMALL, which is the volume device's rule (v3201) arriving in a different subject.
        const o = { n: c.carrierN || 1e22, tau: c.tau || 1e-13, B: c.B === undefined ? 5 : c.B };
        const r = measureRho(o), naive = rhoXX_WRONG(o), wc = measureSigma(o).wcTau;
        const gapRel = (naive - r.xx) / r.xx;
        // AND A PARAMETER THAT MUST NOT MATTER: the Hall resistivity is B/(n q), with NO tau in it. Sweeping tau
        // over two decades must leave rho_xy where it is -- md's alphaFree shape, pointed at a real material
        // constant rather than a bookkeeping one.
        const xys = [0.5, 1, 2, 5, 10].map((k) => measureRho({ ...o, tau: o.tau * k }).xy);
        const spread = (Math.max(...xys) - Math.min(...xys)) / Math.abs(xys[0]);
        return {
            ...blank,
            rhoXX: r.xx, rhoXXNaive: naive, naiveGapRel: gapRel, wcTau: wc,
            gapOverWcTauSq: gapRel / (wc * wc), rhoXYTauSpread: spread,
        };
    }

    const n = nOf(c.epsR, c.muR);
    return {
        ...blank,
        cComputed: lightSpeed(), cDefined: C_DEFINED,
        cErrFrac: Math.abs(lightSpeed() - C_DEFINED) / C_DEFINED,
        z0: impedanceFreeSpace(), index: n,
        impedance: waveImpedance(c.epsR, c.muR), phaseSpeed: phaseSpeed(c.epsR, c.muR),
        // n * v_phase = c is the relation the planted index CANNOT satisfy, because phaseSpeed uses the
        // square root and the reported index does not.
        indexSpeedProduct: n * phaseSpeed(c.epsR, c.muR),
        indexSpeedConsistent: Math.abs(n * phaseSpeed(c.epsR, c.muR) - lightSpeed()) / lightSpeed() < 1e-9,
    };
}

export const emDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    modes: EM_MODES,
    name: "maxwell-electromagnetism", observables: EM_OBSERVABLES, build: buildEm,
    // v3424 -- *** em WAS ONE OF THE 21 DEVICES THAT ACCEPTED ANY STRING AS A MODE, AND IT WAS FIRST ON THAT
    // BASELINE LIST. *** It echoed whatever it was handed straight back, so checkMode could never refuse
    // anything on it and build() quietly ran "vacuum" under another name. Now that EM_MODES exists the guard is
    // one line, and the ratchet in deviceModes-selfcheck loses an entry rather than gaining one. A NULL IS A
    // REFUSAL, WHICH IS THE STRONGER ANSWER THAN A SILENT SUBSTITUTION (the reading knobGate learned at v3420).
    defaults: ({ mode, config } = {}) => (mode !== undefined && !EM_MODES.includes(mode)
        ? null
        : { mode: mode || "vacuum", config: { ...DEF, ...(config || {}) } }),
};
