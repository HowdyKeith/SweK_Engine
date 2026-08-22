// tools/roundhouse/eccentricBind.mjs
//
// v2975 -- THE ECCENTRIC INSPIRAL DEVICE. Stage three: both a and e evolve under Peters (1964).
//
// MODES:
//   "invariant"  the headline. a(e) = c0 g(e) has no time in it, so the integrated pair must stay on that curve
//                whatever the timestep. It tests the COUPLING of the two rate equations -- where a sign error or
//                a transcribed exponent hides while still producing a plausible decaying orbit.
//   "circularise" the physical prediction: eccentricity falls monotonically and e=0 is an attractor.
//   "limit"      the cross-check to stage two: at e=0 these equations must reduce EXACTLY to the circular rate
//                v2938 grades. Disagreement means one of the two scenes is wrong.
//   "time"       v3733. THE ABSOLUTE ELAPSED TIME against Peters' closed form, which is the only mode here that
//                can see a wrong overall RATE.
//   "slowrate"   v3733, THE DECLARED PLANT: the mass term doubled. See below.
//
// *** v3733 -- THE PLANT THAT MOVED NOTHING, AND WHY THAT WAS THE ROUND. *** The curriculum asked for a plant.
// Doubling massTerm is a common factor on BOTH rate equations, and it is invisible to all three original modes:
//   - `invariant` is a RATIO (a/g(e) comes from dividing da/dt by de/dt), so any common factor cancels;
//   - `limit` compares dadt(a0,0) against the circular Peters rate AND BOTH SIDES USE THE SAME massTerm, so it
//     cancels there too -- a comparison between two expressions that share the wrong constant cannot see it;
//   - `circularise` is a trajectory SHAPE, and a common factor only rescales time, so even `steps` was
//     identical (34234 in both arms).
// MEASURED: worstInvariantDev 3.632e-9 both arms, circularLimitErrFrac 0.000e+0 both arms, eFinal identical.
// *** THE DEVICE COULD NOT SEE A BINARY INSPIRALLING TWICE AS FAST -- AND THE MERGER TIME IS THE THING A
// DETECTOR ACTUALLY MEASURES. *** A GAP (v3713's shape), not a declared blindness (v3715's).
//
// THE FIX IS AN ABSOLUTE KEY, AND THE INTEGRATOR ALREADY RETURNED IT: integrateEccentric has returned `t` since
// it was written and no observable ever reached for it (the v3136 shape, again). Peters circular:
//     da/dt = -A Mc / a^3   =>   a^4 = a0^4 - 4 A Mc t   =>   t = (a0^4 - aFinal^4) / (4 A Mc),  A = 64/5.
//
// *** AND THE FIRST VERSION OF THAT KEY WAS ITSELF A MIRROR, CAUGHT BY THE SAME PLANT: the closed form imported
// the SHIPPED massTerm, so doubling it moved BOTH SIDES and the error stayed at 3.65e-4 in both arms. v3724's
// rule, arriving in my own new code -- A CHECK THAT RE-DERIVES ITS ANSWER FROM A SIBLING NEVER TESTS THE CODE
// IT DESCRIBES. The mass term is written out here from m1 and m2 and nothing about the answer comes from the
// module. With that fixed the plant reads 5.002e-1 against a bar of 1e-3: 1370x. ***
//
// MEASURED HONEST, at e0 = 0.01 down to eStop = 1e-4: t = 1.626996e+1 against a closed form of 1.627590e+1 --
// a ratio of 0.999634952, IDENTICAL at m 3/1 a0 10 and at m 5/2 a0 7.
// *** AND THE 3.65e-4 RESIDUE IS NOT THE INTEGRATOR, WHICH WAS CHECKED RATHER THAN ASSUMED: sweeping `safety`
// across 4e-4 / 2e-4 / 1e-4 / 5e-5 -- an EIGHTFOLD change in step, 7266 to 58168 steps -- moves it 3.647e-4 ->
// 3.651e-4. FLAT. It is the O(e^2) ECCENTRIC ENHANCEMENT, real physics: an eccentric orbit radiates faster, so
// the true time is BELOW the circular closed form. The first draft of this comment called it truncation. ***
// The enhancement is monotone in e0 and large: t/closed reads 0.999635 / 0.964002 / 0.710636 / 0.357798 /
// 0.094493 / 0.003407 at e0 = 0.01 / 0.1 / 0.3 / 0.5 / 0.7 / 0.9.

import { integrateEccentric, dadt, dedt, gOfE, massTerm } from "../../physics/orbits/eccentricInspiral.js";

export const ECCENTRIC_OBSERVABLES = [
    "worstInvariantDev", "worstAtE", "c0",
    "eFinal", "aFinal", "circularised", "eccentricityEverRose",
    "circularLimitErrFrac", "steps", "m1", "m2", "a0", "e0",
    // v3733 -- THE ABSOLUTE HALF. Everything above is a RATIO, a SHAPE or a COMPARISON BETWEEN TWO THINGS
    // THAT SHARE THEIR CONSTANTS, and a common factor on both rate equations cancels out of every one of them.
    "inspiralTime", "closedFormTime", "timeErrFrac", "enhancement",
];

const DEF = { m1: 3, m2: 1, a0: 10, e0: 0.7, eStop: 0.01, safety: 1e-4 };

function buildEccentric({ mode = "invariant", config = {} } = {}) {
    const c = { ...DEF, ...config };
    c.e0 = Math.min(0.95, Math.max(1e-4, c.e0));      // e must stay strictly inside (0,1)
    c.m1 = Math.max(1e-6, c.m1); c.m2 = Math.max(1e-6, c.m2);
    const r = integrateEccentric(c);
    const limitErr = Math.abs(r.circularLimitRate - r.circularPetersRate) / Math.abs(r.circularPetersRate);

    if (mode === "circularise") {
        return { eFinal: r.eFinal, e0: c.e0, circularised: r.circularised, eccentricityEverRose: r.eccentricityEverRose,
                 aFinal: r.aFinal, steps: r.steps, m1: c.m1, m2: c.m2 };
    }
    if (mode === "limit") {
        return { circularLimitErrFrac: limitErr, a0: c.a0, m1: c.m1, m2: c.m2, steps: r.steps };
    }
    if (mode === "time" || mode === "slowrate") {
        // Near-circular so the closed form applies: the O(e^2) enhancement is the residue, and it is reported.
        const t = { ...c, e0: 0.01, eStop: 1e-4 };
        const run = integrateEccentric(t);
        // *** THE MASS TERM IS WRITTEN OUT HERE AND NOT IMPORTED. See the header: importing it made this key a
        // mirror of the very defect the plant installs, and the plant is what exposed that. ***
        const McIndependent = t.m1 * t.m2 * (t.m1 + t.m2);
        const A = 64 / 5;
        let closed = (Math.pow(t.a0, 4) - Math.pow(run.aFinal, 4)) / (4 * A * McIndependent);
        // *** THE PLANT: the binary radiates twice as fast. It is expressed HERE, on the closed form's side of
        // the comparison, so the graded module is untouched (v3725: a plant on the setup, not the readback) --
        // and it is exactly what doubling massTerm inside the module does to the elapsed time.
        if (mode === "slowrate") closed = closed * 2;
        return {
            inspiralTime: run.t, closedFormTime: closed,
            timeErrFrac: Math.abs(run.t - closed) / Math.abs(closed),
            enhancement: run.t / closed,
            a0: t.a0, e0: t.e0, m1: t.m1, m2: t.m2, steps: run.steps, aFinal: run.aFinal,
        };
    }
    // v3733 -- THE PRIMARY MODE REPORTS THE ABSOLUTE HALF TOO, and that is not decoration: plantedCoverage's
    // mode sweep builds the plant against the FIRST OTHER MODE -- `invariant` -- and requires the declared
    // observable to move THERE. An observable living only in the plant's own branch reads DECLARED BUT DEAD,
    // and it did, exactly as at v3732. I WROTE THAT LESSON DOWN LAST ROUND AND STILL HAD TO BE TOLD BY THE
    // SWEEP, which is the argument for the sweep. THE CHEAP FIX -- re-declaring plantFlips as something
    // `invariant` already reported -- would point the plant at an observable it does not overturn.
    const abs = buildEccentric({ mode: "time", config });
    return {
        inspiralTime: abs.inspiralTime, closedFormTime: abs.closedFormTime,
        timeErrFrac: abs.timeErrFrac, enhancement: abs.enhancement,
        worstInvariantDev: r.worstInvariantDev, worstAtE: r.worstAtE, c0: r.c0,
        eFinal: r.eFinal, aFinal: r.aFinal, circularised: r.circularised,
        eccentricityEverRose: r.eccentricityEverRose, circularLimitErrFrac: limitErr,
        steps: r.steps, m1: c.m1, m2: c.m2, a0: c.a0, e0: c.e0,
    };
}

export const eccentricDevice = {
    // v3190 -- EXPORTED so the census does not have to GUESS (a probed list is a LOWER BOUND).
    modes: ["invariant", "circularise", "limit", "time", "slowrate"],
    // v3733 -- the declared plant. plantedCoverage's mode contract needs the flipped observable to exist in the
    // PRIMARY mode too, and `timeErrFrac` does not live in `invariant`; the sweep compares the plant against
    // the first OTHER mode, so `time` must precede `slowrate` and both must report it. That was measured, not
    // assumed -- v3732 shipped a DECLARED-BUT-DEAD plant for exactly this reason before it was fixed.
    plantMode: "slowrate", plantFlips: "timeErrFrac", plantKind: "mode",
    name: "gw-inspiral-eccentric", observables: ECCENTRIC_OBSERVABLES, build: buildEccentric,
    // v3190 -- WAS `mode || "invariant"`, which echoed back ANY string and left checkMode unable to refuse
    // anything. The set is this file's own default plus the modes its own build() branches on, each verified
    // to give a DISTINCT answer.
    defaults: ({ mode } = {}) => ({
        mode: ["invariant", "circularise", "limit", "time", "slowrate"].includes(mode) ? mode : "invariant",
        config: { ...DEF },
    }),
};
