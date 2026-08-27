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
import { bindPathFor } from "./bindFiles.mjs";

export const COMPOSE_OBSERVABLES = [
    "valueA", "valueB", "absDiff", "relDiff",
    "dimensionsComparable", "dimA", "dimB",
    "sigmaApart", "judgedByError", "agree", "verdict", "reason",
];

const DEF = {
    devA: "em", modeA: "vacuum", keyA: "cComputed",
    devB: "fdtd", modeB: "lightspeed", keyB: "cMeasured",
};

// *** v4033 -- THE ALTERNATIVES, DECLARED, BECAUSE THIS DEVICE'S KNOBS ARE NAMES AND NAMES DO NOT SCALE. ***
//
// knobLiveness probes a knob by moving it: 1.5x, 0.5x, 8x. Every knob here is a STRING, so there was nothing
// to move and the census reported all six as "not probed (string)" -- THE ONLY DEVICE IN THE LAB THAT CONSUMES
// OTHER DEVICES, and the survey could say nothing whatever about it. That was the census being honest rather
// than wrong: inventing a device name would have tested this file's error handling instead of the knob.
//
// But these knobs are not unorderable, they are ENUMERABLE. devA ranges over the registry, modeA over that
// device's declared modes, keyA over its observables. The set exists; there was just nowhere to write it down.
// So it is written down here, next to the defaults it perturbs, and DECLARED RATHER THAN DERIVED -- deriving
// devA from DEVICE_NAMES would make the probe's meaning depend on registry order, and this lab has been bitten
// by a probed list standing in for a declared one before (v3191: lbm read as a 29-mode device because
// checkMode answers ok to any string when there is nothing to ask).
//
// *** THE EXPECTED ANSWER FOR HALF OF THESE IS A REFUSAL, AND THAT IS THE POINT. *** The census varies one knob
// at a time, so setting devA to `kepler` while keyA is still `cComputed` asks for an observable kepler does not
// have -- and this device answers `verdict: "missing"`, which MOVES OBSERVABLES and is therefore a live
// reading. A refusal is a response (this census's own third category), and a device that answered a broken
// triple with a number would be the thing worth finding.
export const COMPOSE_KNOB_CHOICES = {
    // a real device, and one whose bind file resolves -- the coupling filter is the interesting path
    devA: ["kepler", "mpmstep"],
    devB: ["em", "twobody"],
    // other modes of the DEFAULT devA/devB, so the triple stays half-coherent and reaches deeper filters
    modeA: ["waveguide", "cherenkov"],
    modeB: ["dispersion", "dielectric"],
    // other observables of the default device/mode: these keep the triple fully coherent, so the comparison
    // runs all the way to a verdict and valueA/valueB actually change
    keyA: ["z0", "index", "impedance"],
    // `pointsPerWavelength` was here for one run and the gate's staleness check rejected it on sight: it is
    // produced by fdtd's `dispersion` mode, not by `lightspeed`, and it was picked by reading modes[0]'s
    // output instead of the default mode's. A choice list is a claim about another device, and this is
    // exactly the way one rots.
    keyB: ["S", "cExact", "steps"],
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
    //
    // *** v4033 -- AND THE PATHS ARE RESOLVED FROM THE REGISTRY, BECAUSE 36 OF THE 37 MISSES WERE THIS BUG. ***
    // The note above is right about lbm and generalised from it. The paths were built as `${dev}Bind.mjs`, and
    // THE REGISTRY KEY IS LOWERCASE WHILE THE FILENAME IS CAMELCASE -- mpmstep is mpmStepBind.mjs, blackhole is
    // blackHoleBind.mjs, twobody is twoBodyBind.mjs. MEASURED: 37 of 129 device names had no file at the
    // guessed path, so every comparison touching the whole MPM family, blackhole, twobody, whitedwarf and 32
    // others returned "independence-unknown" FOR A REASON THAT HAD NOTHING TO DO WITH COUPLING. The refusal was
    // correct behaviour on a wrong input, which is the worst kind of wrong to find: nothing looked broken.
    //
    // bindFiles resolves 128 of the 129 from devices.mjs's own imports. THE ONE IT CANNOT RESOLVE IS lbm, which
    // is exactly the device v3722 named -- its build is a local function in devices.mjs and there is no file to
    // read. So that refusal stands, unchanged and now for the stated reason rather than as one of thirty-seven.
    let indep = { verdict: "unknown", reason: "the coupling check threw" };
    const pathA = bindPathFor(c.devA), pathB = bindPathFor(c.devB);
    if (!pathA || !pathB) {
        indep = { verdict: "unreadable",
                  reason: `no bind file is registered for ${!pathA ? c.devA : c.devB} -- its device is not `
                        + "imported from a module, so there is no import graph to read" };
    } else {
        try { indep = classifyCoupling(pathA, pathB); }
        catch (e) { indep = { verdict: "unknown", reason: `the coupling check threw: ${String(e && e.message).slice(0, 80)}` }; }
    }
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

// *** v3902 -- A PLANT WAS ATTEMPTED HERE AND REFUSED, AND THE REFUSAL IS MEASURED RATHER THAN ASSERTED. ***
//
// The curriculum proposes this device for a plant. It should not, and the reason is a property of what this
// device CONTRIBUTES rather than of how hard it is to sabotage.
//
// MEASURED ON THE DEFAULT PAIR (em/vacuum/cComputed against fdtd/lightspeed/cMeasured):
//     valueA 299792458.000   valueB 299792458.000   absDiff 6.4969e-6   relDiff 2.1671e-14
//     sigmaApart null   judgedByError false   agree null   verdict "unjudged"
//
// EVERY NUMBER IN THAT LIST BELONGS TO THE TWO DEVICES BEING COMPARED, NOT TO THIS ONE. valueA, valueB,
// absDiff and relDiff are pure functions of em and fdtd; corrupting any of them plants a defect in em or in
// fdtd, which is where it would have to be declared. THIS DEVICE'S OWN CONTRIBUTION IS THE THREE FILTERS, AND
// ALL THREE ARE CATEGORICAL -- `dimensionsComparable` and `judgedByError` are booleans, `verdict` and `reason`
// are strings. probeModePlant requires a FINITE NUMBER IN BOTH ARMS, and this device does not produce one it
// owns.
//
// *** THE TEMPTING FIX IS THE ONE TO REFUSE: inventing a numeric observable (a count of filters passed, a
// verdict encoded as an integer) SOLELY so the census has something to grade. *** That is manufacturing
// coverage -- the thing beamDevice's refusal names in the same words -- and it would report this device as
// covered while nothing about the three filters had been shown to catch anything.
//
// WHAT WOULD OVERTURN IT: a pair where BOTH sides carry sample counts, so `sigmaApart` is a real number rather
// than null. Then the classic uncertainty defect -- standardError -> standard deviation, dropping the
// 1/sqrt(N) -- would inflate both error bars, drive sigmaApart DOWN, and turn a genuine disagreement into a
// reported agreement. That is a clean numeric plant on this device's own arithmetic, and it needs a fixture
// this device does not have today. NOT A PERMANENT OPINION: build that pair and this refusal expires.
const PLANT_REFUSED =
    "a plant was attempted and MEASURED to be unavailable: every finite number this device reports (valueA, " +
    "valueB, absDiff, relDiff) belongs to the two devices being compared, and its OWN contribution -- the " +
    "units, independence and uncertainty filters -- is entirely categorical (two booleans and two strings). " +
    "On the default pair sigmaApart is null because neither side carries an error bar, so there is no number " +
    "of this device's own to move. Inventing one to satisfy the census would MANUFACTURE coverage. EXPIRES " +
    "IF a comparison pair with sample counts on both sides is added: then sigmaApart is real and dropping the " +
    "1/sqrt(N) from standardError turns a genuine disagreement into a reported agreement, which is a clean " +
    "numeric plant on this device's own arithmetic.";

// *** THE EXPIRY, AS A PREDICATE RATHER THAN A SENTENCE. *** PLANT_REFUSED above ends "EXPIRES IF a comparison
// pair with sample counts on both sides is added: then sigmaApart is real". That condition was written down and
// nothing ever evaluated it, so the day somebody adds such a pair this refusal would go on standing -- a correct
// refusal quietly becoming a stale one, which is the same species as a suppression nobody audits.
//
// It is a FIELD and a FUNCTION, never a grep. curriculum.mjs's own note says why: "the refusal is read as A
// FIELD, never grepped out of prose -- a mention test is the species of claim this tree has got wrong three
// times". An expiry parsed out of the sentence that states it would inherit exactly that flaw.
//
// The test is the device's own arithmetic: sigmaApart is null precisely when neither side carries an error bar,
// which is the whole reason there is no number of its own to plant on. Non-null means there now is one.
async function composeRefusalExpired() {
    const v = await buildCompose({ mode: "compare", config: {} });
    const expired = v.sigmaApart !== null && Number.isFinite(v.sigmaApart);
    return {
        expired,
        // The VALUE the condition turned on, handed back as a field. null is a measurement -- it is precisely
        // "neither side carries an error bar" -- and a caller must not have to find that in a sentence.
        observable: "sigmaApart", measured: v.sigmaApart,
        evidence: expired
            ? "sigmaApart = " + v.sigmaApart + " on the default pair (" + DEF.devA + "." + DEF.keyA + " vs "
              + DEF.devB + "." + DEF.keyB + "). BOTH SIDES NOW CARRY AN ERROR BAR, so this device finally reports "
              + "a number of its own -- and dropping the 1/sqrt(N) from standardError is the plant the refusal "
              + "said would become available. THE REFUSAL HAS EXPIRED: build it."
            : "sigmaApart = null on the default pair (" + DEF.devA + "." + DEF.keyA + " vs " + DEF.devB + "."
              + DEF.keyB + "): " + v.reason + ". No error bar on either side, so there is still no number of "
              + "this device's own to move.",
    };
}

export const composeDevice = {
    // v4033 -- see COMPOSE_KNOB_CHOICES. Without this the census reports six "not probed (string)" rows and
    // this device contributes nothing to the lab's knob coverage at all.
    knobChoices: COMPOSE_KNOB_CHOICES,
    plantRefusedExpiry: composeRefusalExpired,
    modes: ["compare"],
    name: "cross-device-comparison", observables: COMPOSE_OBSERVABLES, build: buildCompose,
    defaults: ({ mode } = {}) => ({ mode: mode || "compare", config: { ...DEF } }),
    // THE REFUSAL TRAVELS ON THE DEVICE, because the registry hands out devices and curriculum.refusedPlants()
    // is the thing that needs to see it -- beamBind's reasoning, and it must be a STRING for that reader.
    plantRefused: PLANT_REFUSED,
};
