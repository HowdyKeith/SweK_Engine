// WebGLEngine/tools/roundhouse/vibrationsBind.mjs -- v3336
//
// THE SPECTRAL MOMENTS OF A PINNED CHAIN, AND THE BOUNDARY CONDITION HIDES IN THE SECOND ONE.
//
// physics/vibrations.js already carries a gate, and it is a good one: a pure mode keeps its shape, oscillates at
// modeFreq, energy stays bounded, frequencies climb. *** BUT EVERY ONE OF THOSE COMPARES THE MODULE WITH ITSELF.
// *** The frequency check is the integrator against the module's own closed form -- two routes, both inside one
// file, and a device that restated any of them would move the coverage count and grade nothing new (v3199).
//
// SO THE KEYS HERE ARE SUM RULES, WHICH THE MODULE NEVER FORMS AND CANNOT HAVE TUNED ITSELF TO.
// The chain's normal frequencies are the eigenvalues of a tridiagonal stiffness matrix, and the SUM of a
// matrix's eigenvalues is its TRACE -- available by inspecting the couplings, with no eigenvalue solved:
//
//     sum_j omega_j^2   = 2N (k/m)             <- trace of the matrix
//     sum_j omega_j^4   = (6N - 2) (k/m)^2     <- trace of its square
//
// *** AND I DERIVED THE SECOND ONE TWICE AND GOT TWO DIFFERENT ANSWERS. *** The matrix-trace route gives 6N-2;
// my trig route (expanding sin^4 and summing the cosines) gave 6N+6. THE MEASUREMENT SETTLED IT AT 6N-2, exactly,
// at N = 4, 5, 8, 12, 13, 32 and 64. Neither number is typed into a comparison anywhere below -- both keys are
// evaluated as formulas of N and checked against sums taken from the module -- but the disagreement is recorded
// because "never type a reference value" is usually about transcription, and this was about ARITHMETIC.
//
// WHY THE SECOND MOMENT IS THE ONE THAT EARNS THE ROUND:
//
//   the "-2" IS THE TWO PINNED ENDS. An interior mass couples to two neighbours and contributes 6 to the trace of
//   the square; each end mass is missing one neighbour and contributes 5. So the second moment KNOWS THE BOUNDARY
//   CONDITION and the first moment does not.
//
// *** THE LOAD-BEARING NEGATIVE IS A RING. *** Close the chain into a loop -- periodic instead of pinned -- and
// the first moment is UNCHANGED (2N, to machine precision at every N tested) while the second is larger by
// EXACTLY 2.000000000, at N = 4, 8, 12, 32 and 64. One wrong boundary condition, invisible to one key, caught
// exactly by the other.
//
// *** AND THE WAY IT IS CAUGHT IS THE POINT, BECAUSE A TOLERANCE WOULD GET WORSE AS THE FIXTURE GREW. *** The
// absolute gap is a constant 2; the RELATIVE gap is 2/(6N-2), which falls 9.091% -> 4.348% -> 2.857% -> 1.053%
// -> 0.524% from N=4 to N=64. A fractional-tolerance check on a big chain would wave a ring through. The identity
// is exact for every N, so the bigger fixture is not the weaker test -- which is the opposite of the instinct.
// Same shape as the volume device's finding at v3201: the two cases are told apart by an exact structure, not by
// whether the number is small.
//
// THE THIRD KEY IS AN ORDER, NOT A VALUE. A long chain must behave like a continuous string, where frequency is
// proportional to mode number. It does not, quite: lattice dispersion makes omega_j fall short of j*omega_1, and
// the shortfall must fall as 1/N^2. MEASURED, the ratio between successive doublings CONVERGES TOWARD 4 rather
// than merely sitting near it -- 3.766, 3.879, 3.939, 3.969 for j=2 -- which is what a real expansion does and
// what a wrong dispersion relation cannot fake.
import { makeChain, modeFreq, chainStep } from "../../physics/vibrations.js";

export const VIBRATIONS_OBSERVABLES = [
    "sumW2", "sumW2Key", "sumW2ErrRel",
    "sumW4", "sumW4Key", "sumW4ErrRel",
    "traceProbed", "traceProbedErrRel",
    "ringSumW2", "ringSumW4", "ringSecondMomentGap", "ringFirstMomentGap", "ringRelativeGap",
    "dispersionRatios", "dispersionExponent",
];

export const VIBRATIONS_MODES = ["moments", "trace", "ring", "dispersion", "sixNplus6"];

const DEF = { N: 12, k: 1, m: 1 };

export function vibrationsDefaults(cfg = {}) {
    const want = cfg && cfg.mode;
    const mode = VIBRATIONS_MODES.includes(want) ? want : "moments";
    // Each mode gets the fixture that makes ITS key sharp. A mode that changed nothing would be a mode in name
    // only (v3194), so these differ in what they measure, not merely in a label.
    const N = mode === "dispersion" ? 16 : mode === "ring" ? 32 : DEF.N;
    return { mode, N, k: cfg.k ?? DEF.k, m: cfg.m ?? DEF.m };
}

/** The two closed-form keys, as functions of N. Nothing here reads a frequency. */
export const firstMomentKey = (N, k, m) => 2 * N * (k / m);
export const secondMomentKey = (N, k, m) => (6 * N - 2) * (k / m) * (k / m);

// *** v3902 -- THE TRIG ROUTE'S ANSWER, KEPT RUNNABLE. *** The header records deriving the second moment twice
// and getting 6N-2 from the matrix trace and 6N+6 from expanding sin^4 -- and the measurement settling it at
// 6N-2 exactly, at seven values of N. The correct key shipped and the wrong one became a sentence. THIS IS
// THAT SENTENCE AS A MODE, so the sweep re-derives the disagreement instead of remembering it.
//
// AND THE "+6" IS NOT A TYPO FOR "-2": the two routes differ by 8, which at N=12 is 78 against 70. That is
// why it is worth keeping runnable -- an error of 8 in a trace is not a rounding story, it is a different
// count of how many neighbours the end masses have, and this device exists because the second moment is the
// one that KNOWS ABOUT THE ENDS.
export const secondMomentKeyTrigRoute = (N, k, m) => (6 * N + 6) * (k / m) * (k / m);

/** Both moments, taken from the module's own frequencies. */
export function moments(state) {
    let s2 = 0, s4 = 0;
    for (let j = 1; j <= state.N; j++) { const w2 = modeFreq(state, j) ** 2; s2 += w2; s4 += w2 * w2; }
    return { s2, s4 };
}

/**
 * THE TRACE, MEASURED FROM THE THING THAT MOVES THE MASSES.
 *
 * The keys above are arithmetic about a matrix. This recovers the same trace from the INTEGRATOR: displace one
 * mass by 1, leave the rest at rest, take a single small step, and the velocity that mass picks up is its own
 * acceleration times dt -- which is the diagonal entry. Summing over every site gives the trace WITHOUT ever
 * evaluating a frequency.
 *
 * *** THIS IS WHAT MAKES THE FIRST KEY EXTERNAL RATHER THAN A MIRROR (the rule that killed the muscle device at
 * v3201): the route that MEASURES the coupling is chainStep, and the route the key is compared against is
 * modeFreq's trig. Neither reads the other. *** If the integrator's springs ever disagreed with the closed form
 * the module advertises, this is the check that would say so.
 */
export function probeTrace(N, k, m, dt = 1e-6) {
    let tr = 0;
    for (let i = 0; i < N; i++) {
        const st = makeChain({ N, k, m });
        st.x[i] = 1;
        chainStep(st, dt);
        tr += -st.v[i] / dt;   // a_i = -(2k/m) x_i for a unit displacement; the sign makes the trace positive
    }
    return tr;
}

/** The ring: the SAME masses and springs, closed into a loop. Periodic instead of pinned. */
export function ringMoments(N, k, m) {
    const w02 = k / m;
    let s2 = 0, s4 = 0;
    for (let j = 0; j < N; j++) { const w2 = 4 * w02 * Math.sin(Math.PI * j / N) ** 2; s2 += w2; s4 += w2 * w2; }
    return { s2, s4 };
}

/** Lattice dispersion: the shortfall of omega_j against j*omega_1, and the rate at which it dies. */
export function dispersion(j, sizes, k, m) {
    const devs = sizes.map((N) => {
        const st = makeChain({ N, k, m });
        return 1 - modeFreq(st, j) / (j * modeFreq(st, 1));
    });
    const ratios = devs.slice(0, -1).map((d, i) => d / devs[i + 1]);
    // The EXPONENT, not the size of the residual: log2 of the last ratio, which must approach 2.
    return { devs, ratios, exponent: Math.log2(ratios[ratios.length - 1]) };
}

export async function buildVibrations(args = {}) {
    const cfg = vibrationsDefaults(args);
    const { N, k, m, mode } = cfg;
    const st = makeChain({ N, k, m });
    const { s2, s4 } = moments(st);
    // THE WHOLE EXPRESSION BRANCHES; the default arm calls the same function it always did, so `sumW4Key` is
    // bit-identical outside the plant. The CHAIN and the FREQUENCIES are untouched in both arms -- `sumW4`
    // itself is bit-identical -- which is what makes this a `method` plant and not a `knob` one.
    const key2 = firstMomentKey(N, k, m);
    const key4 = mode === "sixNplus6" ? secondMomentKeyTrigRoute(N, k, m) : secondMomentKey(N, k, m);

    const out = {
        sumW2: s2, sumW2Key: key2, sumW2ErrRel: Math.abs(s2 - key2) / key2,
        sumW4: s4, sumW4Key: key4, sumW4ErrRel: Math.abs(s4 - key4) / key4,
        traceProbed: null, traceProbedErrRel: null,
        ringSumW2: null, ringSumW4: null, ringSecondMomentGap: null, ringFirstMomentGap: null, ringRelativeGap: null,
        dispersionRatios: null, dispersionExponent: null,
    };

    if (mode === "trace") {
        const tr = probeTrace(N, k, m);
        out.traceProbed = tr;
        out.traceProbedErrRel = Math.abs(tr - s2) / s2;   // compared against the FREQUENCY sum, not against the key
    }
    if (mode === "ring") {
        const r = ringMoments(N, k, m);
        out.ringSumW2 = r.s2; out.ringSumW4 = r.s4;
        out.ringFirstMomentGap = r.s2 - s2;      // must be ~0: the ring is invisible here
        out.ringSecondMomentGap = r.s4 - s4;     // must be exactly 2 (k/m)^2: the ring is caught here
        out.ringRelativeGap = (r.s4 - s4) / s4;  // shrinks with N -- why a tolerance would let it through
    }
    if (mode === "dispersion") {
        const d = dispersion(2, [16, 32, 64, 128, 256], k, m);
        out.dispersionRatios = d.ratios;
        out.dispersionExponent = d.exponent;
    }
    // v3446 -- *** THIS RETURNED { config, observables } AND EVERY OTHER BIND IN THE REGISTRY RETURNS FLAT. ***
    // Measured across all 67 devices: 66 flat, THIS ONE NESTED. labExport's runRecord walks Object.entries(out)
    // at the TOP LEVEL and keeps only finite numbers, so both keys were objects, BOTH WERE DROPPED, and this
    // device's lab-results row has been frozen with ZERO OBSERVABLES since v3336 -- the only gate that checks
    // the lab's VALUES rather than its RELATIONSHIPS has been watching nothing here for over a hundred versions.
    //
    // AND THE REGISTRY ALREADY SAID SO. `observables: VIBRATIONS_OBSERVABLES` declares a FLAT list of names, so
    // the declaration and the return shape disagreed and nothing compared them -- this tree's most-named defect,
    // and the DECLARATION was the half that was right.
    //
    // The fix is to match the convention rather than to teach runRecord a second accepted shape: adding an
    // outlier's shape to a SHARED READER is the opposite of one definition, and it would put the burden on
    // sixty-six correct devices to accommodate one wrong one. `config` stays as a nested non-numeric key, which
    // runRecord ignores by construction because it is not a finite number.
    return Object.assign({}, out, { config: cfg });
}

export const vibrationsDevice = {
    name: "chain-spectral-moments",
    modes: VIBRATIONS_MODES,
    observables: VIBRATIONS_OBSERVABLES,
    build: buildVibrations,
    defaults: vibrationsDefaults,
    // *** v3902 -- `sumW4ErrRel` GOES FROM EXACTLY ZERO TO 0.10256410, AND THE ZERO IS THE POINT. ***
    // The honest key reproduces the measured fourth moment to the bit at N=12: s4 = 70, key = 70, error
    // EXACTLY 0. Under the trig route the key is 78 and the relative error is 8/78 = 0.10256410256410256.
    //
    // `ring` AND `dispersion` MOVE sumW4 TOO AND ARE NOT PLANTS, which is why neither could be declared: they
    // change N and the key follows (24->64->32 and 70->190->94), so the ERROR stays at zero and the device is
    // still right. A mode that moves an observable is not a plant; a mode that moves the observable AWAY FROM
    // ITS KEY is. That distinction is the whole reason the contract names the observable rather than the mode.
    plantMode: "sixNplus6", plantFlips: "sumW4ErrRel", plantKind: "method",
};
