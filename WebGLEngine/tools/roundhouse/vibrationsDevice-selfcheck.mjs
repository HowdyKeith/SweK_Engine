// WebGLEngine/tools/roundhouse/vibrationsDevice-selfcheck.mjs -- v3336
//
// GRADES physics/vibrations.js AGAINST KEYS THE MODULE NEVER FORMS.
//
// The module's own gate is good and every check in it compares the module with itself: a mode keeps its shape,
// the integrator matches the module's own modeFreq, energy stays bounded, frequencies climb. A device restating
// any of that WOULD MOVE THE COVERAGE COUNT AND GRADE NOTHING NEW, which is the trap v3199 walked into.
//
// So the keys are SUM RULES -- the trace of the stiffness matrix and of its square -- available by inspecting the
// couplings without solving a single eigenvalue, and never formed anywhere in physics/vibrations.js.
import { getDevice } from "./devices.mjs";
import { firstMomentKey, secondMomentKey, probeTrace, moments, ringMoments, dispersion } from "./vibrationsBind.mjs";
import { makeChain } from "../../physics/vibrations.js";

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (label, cond, note) => { console.log("  " + (cond ? "PASS" : "FAIL") + "  " + label + (note ? "   " + note : "")); if (!cond) failed++; };

const dev = await getDevice("vibrations");

ok("!! the registry BUILDS it, not merely lists it",
    !!dev && dev.registryName === "vibrations" && typeof dev.build === "function",
    "a name in DEVICE_NAMES that the factory cannot build passes a set check and FAILS ON USE, inside an agent " +
    "run rather than here (v3330)");

// ---- 1. THE FIRST MOMENT, AT SEVEN SIZES -----------------------------------------------------------------------
// Swept rather than taken at the default, because a sum rule that held at one N and nowhere else would be a
// coincidence -- and sweeping only the default mode is a species of first-measurement error this tree records.
const SIZES = [4, 5, 8, 12, 13, 32, 64];
let worst2 = 0, worst4 = 0;
for (const N of SIZES) {
    const st = makeChain({ N, k: 1, m: 1 });
    const { s2, s4 } = moments(st);
    worst2 = Math.max(worst2, Math.abs(s2 - firstMomentKey(N, 1, 1)) / firstMomentKey(N, 1, 1));
    worst4 = Math.max(worst4, Math.abs(s4 - secondMomentKey(N, 1, 1)) / secondMomentKey(N, 1, 1));
}
say("swept N = " + SIZES.join(", ") + " -- worst relative error, first moment " + worst2.toExponential(3) +
    ", second moment " + worst4.toExponential(3));

ok("!! *** sum of omega^2 is the TRACE: 2N(k/m), at every size ***", worst2 < 1e-13,
    "the sum of a matrix's eigenvalues is its trace, which needs no eigenvalue solved -- and physics/vibrations.js " +
    "never forms the matrix, so it cannot have been tuned to this");

ok("!! *** sum of omega^4 is the trace of the SQUARE: (6N-2)(k/m)^2 ***", worst4 < 1e-13,
    "an interior mass contributes 6 and each END mass 5, because an end is missing a neighbour. THE '-2' IS THE " +
    "TWO PINNED ENDS, which is why this key knows the boundary condition and the first one does not");

// The disagreement is recorded rather than smoothed over: I derived the second key twice and got 6N-2 from the
// matrix trace and 6N+6 from expanding sin^4. Only one can be right and the module says which.
ok("...and the rejected derivation really is wrong, not merely different",
    SIZES.every((N) => Math.abs(moments(makeChain({ N, k: 1, m: 1 })).s4 - (6 * N + 6)) > 1),
    "6N+6 was my trig route and it is WRONG at every size. Kept as a check rather than a comment because a " +
    "discarded derivation that nothing tests can drift back in");

// ---- 2. THE TRACE, MEASURED FROM THE INTEGRATOR ------------------------------------------------------------------
const tr = probeTrace(12, 1, 1);
const s2_12 = moments(makeChain({ N: 12, k: 1, m: 1 })).s2;
say("trace probed through chainStep: " + tr.toFixed(12) + " against the frequency sum " + s2_12 +
    " -- relative " + (Math.abs(tr - s2_12) / s2_12).toExponential(3));

ok("!! *** THE KEY IS EXTERNAL, NOT A MIRROR: the coupling is measured through chainStep and compared against " +
   "modeFreq's trig ***", Math.abs(tr - s2_12) / s2_12 < 1e-10,
    "the rule that killed the muscle device at v3201 -- a key is external when the route that MEASURES the value " +
    "is independent of the route that SET it. Displace one mass, step once, read the velocity: that is the " +
    "diagonal entry, and no frequency is evaluated anywhere in it");

// ---- 3. THE RING: ONE WRONG BOUNDARY, INVISIBLE TO ONE KEY AND EXACT IN THE OTHER --------------------------------
const gaps = SIZES.map((N) => {
    const chain = moments(makeChain({ N, k: 1, m: 1 }));
    const ring = ringMoments(N, 1, 1);
    return { N, first: ring.s2 - chain.s2, second: ring.s4 - chain.s4, rel: (ring.s4 - chain.s4) / chain.s4 };
});
for (const g of gaps) say("  N=" + String(g.N).padStart(2) + "  ring first-moment gap " + g.first.toExponential(2) +
    "   second-moment gap " + g.second.toFixed(9) + "   relative " + (g.rel * 100).toFixed(3) + "%");

ok("!! *** A RING IS INVISIBLE TO THE FIRST MOMENT ***", gaps.every((g) => Math.abs(g.first) < 1e-12),
    "close the same masses and springs into a loop and the trace is unchanged at every N. A device that graded " +
    "only the first moment would call a periodic chain a pinned one");

ok("!! *** ...AND THE SECOND MOMENT CATCHES IT BY EXACTLY 2 ***",
    gaps.every((g) => Math.abs(g.second - 2) < 1e-9),
    "not 'about 2' and not 'more than a tolerance' -- exactly 2 (k/m)^2 at every size, because the ring restores " +
    "the two neighbours the pinned ends are missing. THE NEGATIVE FAILS BY A PREDICTED AMOUNT");

// *** THE FINDING, AND IT RUNS AGAINST THE INSTINCT: A BIGGER FIXTURE MAKES A TOLERANCE CHECK WEAKER. ***
const rels = gaps.map((g) => Math.abs(g.rel));
ok("!! *** the RELATIVE gap SHRINKS as the chain grows, so a fractional tolerance would wave a ring through ***",
    rels[0] > rels[rels.length - 1] * 10 && rels[rels.length - 1] < 0.01,
    "9.09% at N=4 down to 0.52% at N=64 -- the absolute signal is a constant 2 and only the DENOMINATOR grows. " +
    "Anyone who tested this on a long chain with a 1% tolerance would have shipped a device that cannot see a " +
    "wrong boundary condition. The identity is exact at every N, which is why it is asserted as an identity");

// ---- 4. THE THIRD KEY IS AN ORDER ---------------------------------------------------------------------------------
const d2 = dispersion(2, [16, 32, 64, 128, 256], 1, 1);
const d4 = dispersion(4, [16, 32, 64, 128, 256], 1, 1);
say("dispersion shortfall ratios, j=2: " + d2.ratios.map((r) => r.toFixed(4)).join(" ") + "  -> exponent " + d2.exponent.toFixed(5));
say("dispersion shortfall ratios, j=4: " + d4.ratios.map((r) => r.toFixed(4)).join(" ") + "  -> exponent " + d4.exponent.toFixed(5));

ok("!! the continuum limit is approached at SECOND order, and the exponent CONVERGES rather than merely sitting near 2",
    Math.abs(d2.exponent - 2) < 0.05 && Math.abs(d4.exponent - 2) < 0.05 &&
    d2.ratios.every((r, i) => i === 0 || r > d2.ratios[i - 1]),
    "the ratios climb 3.766 -> 3.879 -> 3.939 -> 3.969 toward 4, which is what a real expansion does as the " +
    "next unmodelled term fades. A residual that is merely SMALL proves nothing; a residual falling at exactly " +
    "the predicted rate can only happen if the dispersion relation is right");

// ---- 5. EVERY DECLARED MODE PRODUCES A DISTINCT ANSWER --------------------------------------------------------------
// v3446 -- READS THE FLAT RETURN. buildVibrations used to return { config, observables } and this was the only
// bind in the registry that did; every other returns its observables at the top level, and labExport's runRecord
// reads the top level, so THIS DEVICE'S lab-results ROW WAS FROZEN WITH ZERO OBSERVABLES FROM v3336 TO v3446.
// `config` is excluded here rather than compared, because the config differs by mode BY CONSTRUCTION and
// including it would make this check pass on modes whose NUMBERS were identical -- a check that cannot fail.
const seen = new Map();
for (const mode of dev.modes) {
    const r = await dev.build({ mode });
    const { config, ...observables } = r;
    seen.set(mode, JSON.stringify(observables));
}
ok("!! every declared mode measures something different",
    new Set(seen.values()).size === dev.modes.length,
    "a branch that changed nothing would be a mode in name only (v3194), and it would make lab-export's config " +
    "column a lie -- " + dev.modes.length + " modes, " + new Set(seen.values()).size + " distinct results");

ok("...and the device REFUSES an undeclared mode by falling back rather than inventing one",
    dev.defaults({ mode: "not-a-mode" }).mode === "moments",
    "an unrecognised mode that quietly produced a plausible reading would be worse than an error");

console.log(failed ? "vibrationsDevice-selfcheck: " + failed + " FAILED" : "vibrationsDevice-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
