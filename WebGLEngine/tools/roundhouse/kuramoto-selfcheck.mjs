// tools/roundhouse/kuramoto-selfcheck.mjs
//
// v3287 -- SYNCHRONIZATION BECOMES THE 35th GRADED DEVICE.
//
// THE GAP THIS CLOSES, and the lab was already measuring it: gradedCoverage counts 96 proven physics modules
// against 34 wired to devices. Sixty-two proven modules are graded by nothing, and the census deliberately
// refuses to pick which deserve promotion. physics/sync/kuramoto.js picks itself, because at v3283 it was
// written with exactly the two things this lab grades against and then never wired:
//
//   exactR(K, gamma) = sqrt(1 - Kc/K) above Kc = 2*gamma -- a closed form, not a self-comparison
//   couplingWRONG                                        -- a planted error, already written
//
// THE JUDGEMENT THIS DEVICE HAD TO MAKE, and it is the reason a naive wiring would have been wrong:
//
//     BELOW Kc THE EXACT ANSWER IS ZERO AND A CORRECT SIMULATION DOES NOT RETURN ZERO.
//
// A finite population of N oscillators has an order parameter around 1/sqrt(N) from random phase alignment
// alone -- at N=4096 that is 0.0156, and the sweep measures 0.031. Grading the sub-critical points against zero
// would fail a correct implementation for the crime of being finite, and "fix" it by raising N until the
// tolerance was met. So the graded observable is the SUPERCRITICAL branch, and the sub-critical points are
// reported beside the finite-size floor they should be compared against. Same discipline as the f32 floor in
// the magmap work: know what the noise level IS before grading against it.

import { getDevice } from "./devices.mjs";
import { exactR, rCurve, couplingWRONG, couplingMeanField } from "../../physics/sync/kuramoto.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("kuramoto");

// ---- 1. THE SUPERCRITICAL BRANCH MATCHES THE CLOSED FORM -----------------------------------------------------------
{
    const o = await dev.build({ mode: "curve" });
    ok("!! measured r matches the exact sqrt(1 - Kc/K) above the critical coupling",
        o.superErrMean < 0.02 && o.superErrWorst < 0.03,
        `mean |r - exact| ${o.superErrMean.toFixed(4)}, worst ${o.superErrWorst.toFixed(4)} over the K > 1.05*Kc ` +
        "points. The key is a closed form for the order parameter of a Lorentzian frequency distribution, so " +
        "this is graded against theory rather than against another run of itself");
}

// ---- 2. THE PLANTED ERROR IS CAUGHT, AND BY A WIDE MARGIN ------------------------------------------------------------
{
    const good = await dev.build({ mode: "curve" });
    const bad = await dev.build({ mode: "curve", config: { planted: true } });
    ok("!! couplingWRONG is detected -- the check has real power",
        bad.superErrMean > good.superErrMean * 10,
        `correct ${good.superErrMean.toFixed(4)} vs planted ${bad.superErrMean.toFixed(4)}, a factor of ` +
        `${(bad.superErrMean / good.superErrMean).toFixed(0)}. The module shipped the wrong coupling on purpose; ` +
        "using it here means detection is demonstrated rather than assumed");

    ok("...and the planted run still LOOKS like a synchronization curve",
        bad.superErrMean < 1 && bad.subcriticalRMean !== null,
        "it still produces a monotone-ish r rising with K, which is why a plot would not reveal it and a " +
        "closed-form key does");
}

// ---- 3. THE FINITE-SIZE FLOOR IS REPORTED, NOT GRADED AGAINST ZERO ------------------------------------------------------
{
    const o = await dev.build({ mode: "onset" });
    ok("!! sub-critical r is reported beside the 1/sqrt(N) floor it should be judged against",
        o.subcriticalRMean > 0 && o.finiteSizeFloor > 0 && o.subcriticalRMean < o.finiteSizeFloor * 4,
        `below Kc the exact answer is 0, the measurement is ${o.subcriticalRMean.toFixed(4)}, and the ` +
        `random-alignment floor for N=${o.N} is ${o.finiteSizeFloor.toFixed(4)}. Grading this against zero would ` +
        "fail a correct implementation for being finite, and the obvious 'fix' -- raise N until it passes -- " +
        "would be tuning the experiment to suit the tolerance");

    ok("the onset itself is detected: r jumps well clear of the floor above Kc",
        o.onsetDetected === true && o.criticalK === 2 * o.gamma,
        `Kc = 2*gamma = ${o.criticalK}. The phase transition is the physics worth having here -- below it the ` +
        "crowd never agrees, above it a fraction locks, and the fraction is predictable");
}

// ---- 4. THE CLOSED FORM ITSELF BEHAVES ------------------------------------------------------------------------------------
{
    ok("exactR is exactly zero below Kc and rises continuously above it",
        exactR(0.9, 0.5) === 0 && exactR(1.0, 0.5) === 0 &&
        exactR(1.2, 0.5) > 0 && exactR(2.5, 0.5) > exactR(1.2, 0.5) && exactR(1e6, 0.5) < 1,
        "zero at and below Kc, rising toward but never reaching 1 as K grows -- full lock needs infinite " +
        "coupling because the frequency spread is unbounded");
}

// ---- 5. THE COVERAGE NEEDLE MOVES ---------------------------------------------------------------------------------------
{
    // NOTE: this first read a MODES map from deviceModes.mjs. THERE IS NO SUCH EXPORT in v3286 -- modes are
    // discovered per device by modesOf(), which distinguishes DECLARED ("exported") from GUESSED ("probed").
    // My edit registering kuramoto in a MODES table was a silent no-op against a file that had moved on, and the
    // gate caught it. Reading the API instead of assuming it is the whole lesson.
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("!! kuramoto DECLARES its modes, so the census knows rather than probes",
        m.source === "exported" && m.declared.includes("curve") && m.declared.includes("onset"),
        `source "${m.source}", modes ${JSON.stringify(m.declared)}. 34 graded devices before this and 113 proven ` +
        "modules. One promotion is not a dent in 78 ungraded, and the census " +
        "still refuses to pick the rest -- promoting a module that has no closed-form key would add a device " +
        "that can only compare itself to itself");
}

console.log();
if (fails) { console.log("kuramoto-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("kuramoto-selfcheck: all checks pass");
