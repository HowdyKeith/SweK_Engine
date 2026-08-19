// tools/roundhouse/composeBind.mjs
//
// v3433 -- THE FIRST DEVICE THAT CONSUMES ANOTHER DEVICE.
//
// All 66 devices were leaves. Not one called getDevice, so every cross-device comparison lived in a selfcheck
// where it could not be swept, routed to, or graded by the lab's own machinery. This makes the comparison
// itself a device.
//
// *** AND IT REFUSES TO REPORT AGREEMENT IT CANNOT DEFEND, WHICH IS WHY IT WAS BUILT LAST. *** Composition adds
// coupling paths, and v3387 showed what a careless one costs: two routes sharing a corrupted input agree
// perfectly on the wrong answer. So every comparison here passes three filters first, each built in an earlier
// round:
//
//   UNITS         observableUnits -- a metre per second cannot equal a mass ratio, however many digits agree
//   INDEPENDENCE  couplingIndependence -- if one route CALLS the other, agreement is construction, not evidence
//   UNCERTAINTY   uncertainty -- agreement is judged in SIGMA where both sides have an error bar, and refused
//                 rather than judged against a chosen tolerance where they do not
//
// A composed device that skipped those would be a machine for manufacturing couplings.

import { getDevice } from "./devices.mjs";
import { comparable } from "./observableUnits.mjs";
import { sampleCount, standardError, agreeWithinError } from "./uncertainty.mjs";
import { classifyCoupling } from "./couplingIndependence.mjs";

export const COMPOSE_OBSERVABLES = [
    "valueA", "valueB", "absDiff", "relDiff",
    "dimensionsComparable", "dimA", "dimB",
    "sigmaApart", "judgedByError", "agree", "verdict", "reason",
];

const DEF = {
    devA: "em", modeA: "vacuum", keyA: "cComputed",
    devB: "fdtd", modeB: "lightspeed", keyB: "cMeasured",
};

async function buildCompose({ mode = "compare", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const blank = {
        valueA: null, valueB: null, absDiff: null, relDiff: null,
        dimensionsComparable: null, dimA: null, dimB: null,
        sigmaApart: null, judgedByError: false, agree: null, verdict: null, reason: null,
    };

    let A, B;
    try {
        A = await (await getDevice(c.devA)).build({ mode: c.modeA });
        B = await (await getDevice(c.devB)).build({ mode: c.modeB });
    } catch (e) {
        return { ...blank, verdict: "unbuildable", reason: String(e && e.message).slice(0, 120) };
    }

    const a = A[c.keyA], b = B[c.keyB];
    if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) {
        return { ...blank, verdict: "missing", reason: `${c.keyA} or ${c.keyB} is not a finite number` };
    }

    // FILTER 1 -- dimensions
    const dim = comparable(c.devA, c.keyA, c.devB, c.keyB);
    if (!dim.comparable) {
        return { ...blank, valueA: a, valueB: b, dimensionsComparable: false, dimA: dim.a, dimB: dim.b,
                 verdict: "incomparable", reason: dim.reason };
    }

    // FILTER 2 -- independence. A shared route makes agreement construction rather than evidence.
    // *** v3722 -- THIS FILTER USED TO PASS WHEN IT COULD NOT DECIDE, WHICH IS THE ONE THING THIS DEVICE'S
    // HEADER SAYS IT MUST NEVER DO. Only `identity` was acted on, so BOTH the catch's "unknown" AND an
    // unreadable file (which classifyCoupling reported as "independent" until v3722) fell through to a plain
    // agree/disagree. And it is REACHABLE: the paths are built as `${dev}Bind.mjs`, and `lbm` HAS NO BIND FILE
    // -- its device is a local function inside devices.mjs (v3719). Comparing lbm against anything asked about
    // a file that does not exist and was answered "independent".
    // *** UNKNOWN IS NOT INDEPENDENT. An undecidable independence check now REFUSES BY NAME rather than being
    // silently treated as the strongest verdict. WHEN THIS GOES RED the fix is to make the coupling decidable
    // -- give the device a real bind file -- NEVER to fall back to reporting agreement. ***
    let indep = { verdict: "unknown", reason: "the coupling check threw" };
    try {
        indep = classifyCoupling(`tools/roundhouse/${c.devA}Bind.mjs`, `tools/roundhouse/${c.devB}Bind.mjs`);
    } catch (e) { indep = { verdict: "unknown", reason: `the coupling check threw: ${String(e && e.message).slice(0, 80)}` }; }
    if (indep.verdict === "unknown" || indep.verdict === "unreadable") {
        return { ...blank, valueA: a, valueB: b, dimensionsComparable: true, dimA: dim.a ?? null, dimB: dim.b ?? null,
                 verdict: "independence-unknown",
                 reason: `${indep.reason} -- agreement is not reported where independence cannot be established` };
    }

    // FILTER 3 -- uncertainty. Sigma where both sides can supply one; refused where they cannot.
    const nA = sampleCount(A), nB = sampleCount(B);
    const errA = nA ? standardError(Math.abs(a) || 1, nA.n) : null;
    const errB = nB ? standardError(Math.abs(b) || 1, nB.n) : null;
    const judged = agreeWithinError(a, errA, b, errB);

    const absDiff = Math.abs(a - b);
    const relDiff = Math.max(Math.abs(a), Math.abs(b)) > 0 ? absDiff / Math.max(Math.abs(a), Math.abs(b)) : 0;

    return {
        valueA: a, valueB: b, absDiff, relDiff,
        dimensionsComparable: true, dimA: dim.a ?? null, dimB: dim.b ?? null,
        sigmaApart: judged.judged ? judged.sigma : null,
        judgedByError: judged.judged,
        agree: judged.judged ? judged.agree : null,
        verdict: indep.verdict === "identity" ? "identity" : (judged.judged ? (judged.agree ? "agree" : "disagree") : "unjudged"),
        reason: indep.verdict === "identity"
            ? `one route calls the other (${indep.reason}) -- agreement is construction, not evidence`
            : judged.reason,
    };
}

export const composeDevice = {
    modes: ["compare"],
    name: "cross-device-comparison", observables: COMPOSE_OBSERVABLES, build: buildCompose,
    defaults: ({ mode } = {}) => ({ mode: mode || "compare", config: { ...DEF } }),
};
