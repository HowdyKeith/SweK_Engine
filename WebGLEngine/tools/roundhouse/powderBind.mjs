// tools/roundhouse/powderBind.mjs
//
// THE POWDER PATTERN -- WHERE A KEY THAT EVERY ACCOUNT PROMISES WILL FIRE DOES NOT, AND THE REASON IS THE PHYSICS.
//
// structureFactorBind carries the absences: an exact zero produced by atoms interfering. This is the same
// subject one step out, and it hands over TWO MORE EXACT THINGS OF A KIND THE LAB HAS NOT COLLECTED BEFORE.
//
// ================================================================================================================
// 1. A RING IS MISSING FOR AN ARITHMETIC REASON RATHER THAN A PHYSICAL ONE
// ================================================================================================================
//
// Grind the crystal and orientation averages away, so a cubic ring is labelled by the INTEGER N = h^2+k^2+l^2.
// Route 1 enumerates lattice points. ROUTE 2 IS A POWER SERIES AND NEVER TOUCHES A LATTICE: r3(N) is the
// coefficient of q^N in theta3(q)^3. MEASURED: 121 consecutive integers, ZERO mismatches -- a convolution of
// series against a triple loop over hkl.
//
// *** AND r3(7) = 0. *** Seven is not a sum of three squares -- no integer of the form 4^a(8b+7) is -- so the
// simple-cubic ring at N=7 IS MISSING, AND NOT BECAUSE ANY BASIS CANCELS IT. Two different mechanisms producing
// the same unmissable nothing, in one pattern: interference over there, LEGENDRE'S THREE-SQUARE THEOREM here.
// 19 such gaps below N=121, and every one of them is absent from the enumerated rings.
//
// ================================================================================================================
// 2. FRIEDEL'S LAW, AND THE TEST THAT COULD NOT FIRE
// ================================================================================================================
//
// |F(hkl)| = |F(-h-k-l)|. MEASURED across 2916 pairs and four lattices the worst difference is 0 -- *** NOT
// ROUNDOFF, EXACTLY ZERO, because the two sums are complex conjugates and |z| = |z-bar| BIT FOR BIT. *** The lab
// owns many keys at 1e-15; this one is at zero because NO ARITHMETIC HAPPENS between the two answers, only a sign.
//
// *** AND THE OBVIOUS WAY TO BREAK IT DOES NOT WORK, WHICH IS THE WHOLE FINDING. *** Every account says anomalous
// scattering breaks Friedel. Put an anomalous atom into FCC and the worst difference stays at 1.78e-15: THE LAW
// STILL HOLDS, because FCC is CENTROSYMMETRIC and an inversion centre restores the conjugate relation no matter
// how complex the scattering is. IT TAKES BOTH CONDITIONS, and the 2x2 has three exact zeros in it:
//
//                          real f            anomalous f
//     centrosymmetric      0                 1.776e-15    <- THE CELL THAT CANNOT FIRE
//     non-centrosymmetric  0                 2.739        <- zincblende, and it breaks LOUDLY
//
// *** THE PLANT IS THE SHORTCUT THAT MAKES THE LOUD CELL GO QUIET: treat f'' as extra scattering POWER rather
// than as a PHASE. *** f = 1 + i f'' becomes a real weight of 1 + f''; every atom keeps a real form factor, the
// two sums stay conjugates, and Friedel holds everywhere. The pattern still looks like a diffraction pattern --
// the rings are in the right places with the right multiplicities -- and ABSOLUTE STRUCTURE HAS BECOME
// UNDETERMINABLE, which is the thing anomalous scattering is used for in a real experiment. plantKind METHOD:
// the arithmetic of the form factor is wrong, not a config value.
//
// AND THE CENTROSYMMETRIC CONTROL IS BLIND TO IT BY CONSTRUCTION, which is the point of carrying it: it reads
// 1.78e-15 honest and 0 planted -- BOTH INDISTINGUISHABLE FROM ZERO. A device holding only that cell would
// report the law intact and the plant unfound, because a test whose honest answer is already zero has no room
// to fall. The multiplicity routes are blind too: r3(N) never sees a form factor. ONLY THE NON-CENTROSYMMETRIC
// CELL CAN TELL, and it is the one cell the textbook 2x2 has to turn on before it says anything.

import {
    rings, r3Series, isLegendreGap, friedelResidual, friedelBreak, ZINCBLENDE, ringTwoTheta,
} from "../../physics/crystal/powder.mjs";
import { BASES } from "../../physics/crystal/structureFactor.mjs";

const TAU = 2 * Math.PI;

export const POWDER_OBSERVABLES = [
    "r3Mismatches", "r3CheckedTo", "r3AtSeven", "legendreGaps", "legendreGapsAbsentFromRings",
    "friedelPairs", "friedelWorstReal",
    "breakNonCentroHalf", "breakNonCentroTwo", "breakNonCentroZero", "breakCentroTwo",
    "unreachableRingRefused",
];

const DEF = { hklMax: 4, checkTo: 121, fpp: 0.5 };

/**
 * |F| with the anomalous form factor on the B sublattice.
 *   HONEST  f = 1 + i f''  -- a PHASE. The B sum is no longer the conjugate of its own negative.
 *   PLANTED f = 1 + f''    -- extra scattering POWER, real. The shortcut that reads the same in a table of
 *                             magnitudes and destroys the only asymmetry in the pattern.
 */
function sfAnomalous(h, k, l, fpp, { A, B }, planted) {
    let re = 0, im = 0;
    for (const [x, y, z] of A) { const p = TAU * (h * x + k * y + l * z); re += Math.cos(p); im += Math.sin(p); }
    for (const [x, y, z] of B) {
        const p = TAU * (h * x + k * y + l * z);
        if (planted) { const w = 1 + fpp; re += w * Math.cos(p); im += w * Math.sin(p); }
        else { re += Math.cos(p) - fpp * Math.sin(p); im += Math.sin(p) + fpp * Math.cos(p); }
    }
    return Math.hypot(re, im);
}

/** The worst Friedel violation over a box, for one cell of the 2x2. Mirrors powder.friedelBreak's sweep. */
function breakWorst(fpp, { centro, hklMax = 3 }, planted) {
    const opts = centro ? { A: BASES.fcc, B: BASES.fcc } : ZINCBLENDE;
    let worst = 0;
    for (let h = -hklMax; h <= hklMax; h++) for (let k = -hklMax; k <= hklMax; k++) for (let l = -hklMax; l <= hklMax; l++) {
        if (!h && !k && !l) continue;
        worst = Math.max(worst, Math.abs(sfAnomalous(h, k, l, fpp, opts, planted) -
                                         sfAnomalous(-h, -k, -l, fpp, opts, planted)));
    }
    return worst;
}

function buildPowder({ mode = "friedel", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // *** v4064 -- checkTo SIZES AN ARRAY AND NOTHING CHECKED IT WAS A WHOLE NUMBER. ***
    // knobLiveness read this knob as LIVE in friedel, and it was live only because every rung THREW: at 1.5x
    // (181.5) and 0.5x (60.5) `r3Series(c.checkTo)` asks for an array of fractional length and the runtime
    // answers RangeError "Invalid array length". The census counted that as a refusal, a refusal counts as a
    // response, and the knob has read healthy since. The 8x rung, 968, is a whole number and builds fine --
    // which is the tell: the knob works, it was simply never given a value it could survive.
    //
    // THE BOUNDS ARE DERIVED, NOT TYPED AT A NUMBER THAT LOOKED SAFE. The floor is 7 because this device
    // REPORTS r3AtSeven -- below that its own observable has nothing to read. The cap is the allocation
    // argument mpmstep made for nx/ny: a knob that SIZES something hands the machine the whole value, and the
    // wide ladder's 1e6x rung would ask r3Series for 1.21e8 entries and rings() for a triple loop around
    // (sqrt N)^3 ~ 1.3e12. 10000 is two orders above the shipped 121, costs 10k entries and 1e6 loop steps,
    // and is a reading rather than a hang.
    c.checkTo = Math.min(10000, Math.max(7, Math.floor(Number(c.checkTo)) || DEF.checkTo));
    const planted = !!config.planted;

    // ---- ROUTE 1 vs ROUTE 2: a triple loop over hkl against a convolution of power series.
    const r3 = r3Series(c.checkTo);
    const scMult = new Map(rings("sc", { hklMax: Math.floor(Math.sqrt(c.checkTo)) }).map((r) => [r.N, r.multiplicity]));
    let r3Mismatches = 0;
    for (let N = 1; N <= c.checkTo; N++) if ((scMult.get(N) || 0) !== r3[N]) r3Mismatches++;

    // ---- the arithmetic absences, and that the enumeration agrees they are absent.
    let legendreGaps = 0, legendreGapsAbsentFromRings = 0;
    for (let N = 1; N <= c.checkTo; N++) if (isLegendreGap(N)) {
        legendreGaps++;
        if (!scMult.has(N)) legendreGapsAbsentFromRings++;
    }

    // ---- Friedel with REAL scattering: exactly zero, and untouched by a form-factor plant that only fires
    // when f'' is non-zero. Worst over four lattices.
    let friedelWorstReal = 0, friedelPairs = 0;
    for (const lat of ["sc", "bcc", "fcc", "diamond"]) {
        const f = friedelResidual(lat, { hklMax: c.hklMax });
        friedelWorstReal = Math.max(friedelWorstReal, f.worst);
        friedelPairs += f.pairs;
    }

    // ---- THE 2x2.
    return {
        r3Mismatches, r3CheckedTo: c.checkTo, r3AtSeven: r3[7],
        legendreGaps, legendreGapsAbsentFromRings,
        friedelPairs, friedelWorstReal,
        breakNonCentroHalf: breakWorst(c.fpp, { centro: false }, planted),
        breakNonCentroTwo: breakWorst(2, { centro: false }, planted),
        // The two cells with an honest answer of zero. They cannot fall, which is why they are carried
        // EXPLICITLY rather than left out -- a 2x2 with two cells shown is not a 2x2.
        breakNonCentroZero: breakWorst(0, { centro: false }, planted),
        breakCentroTwo: breakWorst(2, { centro: true }, planted),
        // A ring beyond the sphere the wavelength can reach is REFUSED rather than clamped. 1 when the module
        // returns null for an unreachable reflection -- a fact about the experiment, not a drawing decision.
        unreachableRingRefused: ringTwoTheta(400, 1, 1) === null ? 1 : 0,
    };
}

const POWDER_MODES = ["friedel"];   // v4074 -- the single source `modes` and `defaults()` both read

export const powderDevice = {
    plantKind: "method",
    modes: POWDER_MODES,
    name: "powder-friedel-and-the-test-that-could-not-fire",
    observables: POWDER_OBSERVABLES,
    build: buildPowder,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "friedel"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: POWDER_MODES.includes(mode) ? mode : POWDER_MODES[0], config: { ...DEF } }),
};
