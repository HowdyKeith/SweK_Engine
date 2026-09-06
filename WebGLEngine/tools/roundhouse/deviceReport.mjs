// tools/roundhouse/deviceReport.mjs
//
// v4480 -- THE CORROBORATION BATTERY, RUN ACROSS A WHOLE DEVICE INSTEAD OF ONE QUANTITY AT A TIME.
//
// v2891 built four criteria for measurements with no answer key. v2908 put ONE quantity through all four and
// said so in its own title: "PUTTING SOMETHING THROUGH ALL FOUR, WHICH HAS NEVER BEEN DONE." Since then the
// battery has been called one field at a time, so "this DEVICE is corroborated" has never been a sentence
// anybody could say. This file makes the unit a device rather than a number.
//
// ------------------------------------------------------------------------------------------------------------
// *** AND THE FIRST THING A MULTI-OBSERVABLE RUN SHOWS IS THAT CRITERION 4'S TOLERANCE HAS NEVER REJECTED
// ANYTHING. ***
//
// corroborateFully takes `tol = 1e-6` as a FUNCTION DEFAULT and uses it in two places. For criterion 2 it reads
// `nuisance.tol ?? tol`, and ALL SIX nuisance knobs declare their own tolerance with an argument beside it --
// blackhole demands exactly 0, splat 1e-12, lens 1e-10 -- so the default never reaches c2 at all. For criterion
// 4 it uses `tol` directly, and NOT ONE of the seven refinement knobs declares a portability tolerance. So c4
// has been graded at 1e-6 for every device since v2908, and that number lives in a parameter list rather than
// anywhere somebody argued for it.
//
// MEASURED HERE, over the 27 keyless observables of the SCOPED set below:
//
//     8 move under a one-ulp libm shift; 19 are bit-identical
//     the largest amplification is 8.7e7, on kepler.conserve.growthGapFrac
//     NOT ONE observable exceeds 1e-6 -- the worst is 50x under it
//
// *** THE FIRST VERSION OF THIS PARAGRAPH QUOTED A WIDER SWEEP AND THE POPULATION WAS WRONG. *** It read "121
// keyless observables of the six eligible devices", measured with eligibility derived as
// `keys(REFINEMENT_KNOBS) filtered by NUISANCE_KNOBS` -- which gives FIVE devices and the wrong five, admitting
// blackhole (whose knob is a negative control, registered to MOVE) and missing optics and quantum (whose knobs
// live in corroborateFully's NEW_NUISANCE table). The numbers were real and they described a population nobody
// meant. See nuisanceFor() below. The figures above are the scoped set, which is what the gate re-derives.
//
// THE FULL SIX-DEVICE SWEEP DID NOT FINISH INSIDE THIS ROUND. It ran past seven minutes without returning --
// optics.converge does adaptive quadrature and quantum.bands diagonalises -- so the wide number is OWED rather
// than quoted. tools/ship/nextRounds.mjs carries it.
//
// A bar nothing has ever come near is not a bar. And the reason it reads as harmless is that it is stated in
// the wrong units: a RELATIVE MOVE is not comparable across devices, because the same move means different
// things depending on how much arithmetic produced it. What is comparable is AMPLIFICATION -- the move divided
// by the perturbation that caused it. The shift is one ulp of f64, 2^-52, so:
//
//     amplification = relMove / 2^-52
//
// In those units the default reads 1e-6 / 2.22e-16 = 4.5e9, a licence to amplify a rounding error by nine
// orders of magnitude, and kepler.conserve.growthGapFrac's 1.93e-8 becomes 8.7e7 -- a real statement about that
// quantity's conditioning rather than a number that happens to sit under a threshold.
//
// *** THIS FILE THEREFORE REFUSES TO GRADE c4 WITHOUT A DECLARED TOLERANCE, AND DECLARES NONE. ***
// Earning one means arguing a device's conditioning, and there are seven of them; inventing seven numbers so
// the report comes back green is the ceremonial move this tree's whole culture is against. What the report does
// instead is MEASURE the amplification for every observable and report c4 as UNGRADED, so the round that earns
// those tolerances inherits a table of numbers instead of starting where this one did.

import { getDevice } from "./devices.mjs";
import { deviceModeTable } from "./deviceModes.mjs";
import { corroborateFully } from "./corroborateFully.mjs";
import { REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { reach } from "./corroborationReach.mjs";
import { preRegister } from "./corroborate.mjs";

/** One ulp of an f64 mantissa: the size of the perturbation criterion 4 applies. */
export const ULP = Math.pow(2, -52);

/** relMove expressed as amplification of the perturbation that caused it. Dimensionless, comparable. */
export function amplification(relMove) {
    return relMove === null || relMove === undefined ? null : relMove / ULP;
}

/**
 * Devices that can face the full battery: they must declare BOTH a refinement knob and a nuisance knob.
 * DERIVED from the two tables rather than listed -- v2908 listed two devices by name and the set has since
 * grown to six.
 */
export function eligibleDevices() {
    return reach().eligible;
}

/**
 * *** THE NUISANCE KNOBS LIVE IN TWO MODULES AND THE FIRST DRAFT OF THIS FILE CONSULTED ONE. ***
 * nuisanceKnobs.mjs holds six (ising, kepler, chaos, lens, splat, blackhole) and corroborateFully.mjs holds a
 * second table, NEW_NUISANCE, added when v2908 needed knobs that did not exist yet. corroborationReach.mjs is
 * the only place that merges them -- and it also drops entries marked `negativeControl`, which are registered
 * to MOVE and would be counted as eligible by anyone reading the raw tables.
 *
 * Filtering REFINEMENT_KNOBS by NUISANCE_KNOBS alone gives FIVE devices and the wrong five: it admits
 * blackhole, whose knob is a negative control, and misses optics and quantum, whose knobs are in the other
 * table. reach() gives six. That mistake was made here, in this file, before the gate beside it existed --
 * which is the argument for asking the one module that already knows rather than re-deriving the answer.
 */
export function nuisanceFor(device) {
    return NUISANCE_KNOBS[device] || NEW_NUISANCE[device] || null;
}

/**
 * *** TWO TABLES ANSWERED THIS QUESTION AND DISAGREED. v4483 DELETED THE SECOND ONE, AND THIS IS WHAT IS LEFT. ***
 *
 * tools/roundhouse/corroborationCensus.mjs used to export its own REFINEMENT_KNOBS under the same name and in a
 * different shape ({key, values, modes} against {mode, param, why}), driving the `refinable` flag on every row
 * of the lab-wide census. v4480 measured the divergence and declined to repair it, because the flag sits on a
 * slow frozen baseline. v4483 did the migration -- and every one of that table's three entries turned out to be
 * making a false claim, which is written up in the census's own header.
 *
 * SO THIS FUNCTION'S JOB HAS INVERTED. It used to report a divergence everybody knew about; it is now the
 * DETECTOR THAT A SECOND TABLE HAS COME BACK, in either shape, which is the same job registerDrift's
 * "redCensus.mjs stores NO typed failing line" row does for that register. It is kept, rather than deleted with
 * the finding, precisely because the thing it watches for is a thing that happens: this tree grew this exact
 * defect once already and nothing noticed for 447 versions.
 */
function disagreementOf(censusTable, k) {
    const cName = censusTable[k].key || censusTable[k].param;
    if (cName !== REFINEMENT_KNOBS[k].param) return "knob: " + cName + " against " + REFINEMENT_KNOBS[k].param;
    // *** v4483 -- THIS COULD NOT REPORT AGREEMENT, WHICH IS THE ANSWER IT NOW HAS TO GIVE. *** The line below
    // read `.modes` and fell straight to "(all)" for anything without it -- fine while the two tables were
    // guaranteed to be in different shapes, and wrong the moment they are not. Handed the canonical table on
    // BOTH sides, it reported all eight devices as disagreeing, every one of them "(all) against <mode>":
    // a comparator that cannot say "identical" is no use as the detector that a second table has come back,
    // which is the only job it has left now that the migration is done. Modes are read from whichever field
    // carries them, and "(all)" is reserved for an entry that declares neither.
    const cm = censusTable[k].modes || (censusTable[k].mode ? [censusTable[k].mode] : null);
    const cModes = cm ? [...cm].sort().join(",") : "(all)";
    const rModes = REFINEMENT_KNOBS[k].mode || "(none)";
    return cModes === rModes ? null : "modes: " + cModes + " against " + rModes;
}

export function refinementTableDivergence(censusTable) {
    const canon = Object.keys(REFINEMENT_KNOBS).sort();
    const other = Object.keys(censusTable).sort();
    const shared = canon.filter((k) => other.includes(k));
    return {
        canonical: canon,
        census: other,
        onlyCanonical: canon.filter((k) => !other.includes(k)),
        onlyCensus: other.filter((k) => !canon.includes(k)),
        shared,
        // Shape differs, so equality is asked of the fields that DECIDE BEHAVIOUR, not of the objects. Two of
        // those: which knob is turned, and which modes it applies to. The first draft compared only the knob
        // name and reported optics as agreeing -- census scopes it to airy AND slit, the canonical table to
        // airy alone, so the `refinable` flag differs on optics.slit while the parameter name matches.
        sharedDisagree: shared.filter((k) => disagreementOf(censusTable, k) !== null),
        // *** THE REASON, NOT ONLY THE COUNT. *** A check that asserts "two shared entries disagree" passes
        // whether they disagree about the knob NAME or about the MODES, and a sabotage that collapsed the mode
        // comparison went 0 RED because the count stayed 2. The two devices disagree for DIFFERENT reasons and
        // the round's claim is about both, so both are named.
        disagreementReasons: Object.fromEntries(shared.map((k) => [k, disagreementOf(censusTable, k)]).filter(([, v]) => v)),
    };
}

const KEYED_RE = /err|error|residual|delta|deviation/i;
const STRUCTURAL_RE = /^(n|count|cells|steps|iters|index|mode|seed|size|len|length|gridN|evals|pairs|violations)$|Count$|Cells$|Steps$|N$/;

/**
 * The observables worth putting through the battery: numeric, not structural, and with NO ANSWER KEY -- no
 * `<field>Exact` sibling and not an error metric. Corroboration is for quantities nobody owns the answer to;
 * running it on a number with a closed form measures the closed form.
 */
export function keylessFields(out) {
    if (!out || typeof out !== "object") return [];
    return Object.entries(out)
        .filter(([f, v]) => typeof v === "number" && Number.isFinite(v))
        .filter(([f]) => !KEYED_RE.test(f) && !STRUCTURAL_RE.test(f))
        // A field that HAS an <name>Exact sibling has a key. A field that IS one is the key -- the first
        // draft excluded the former and kept the latter, so `aExact` came back as a keyless quantity. Caught
        // by this file's own gate on a six-field fixture, which is the reason the fixture exists.
        .filter(([f]) => !/Exact$/.test(f))
        .filter(([f]) => !Object.prototype.hasOwnProperty.call(out, f + "Exact"))
        .map(([f]) => f);
}

/**
 * Per-device portability tolerances, expressed as an AMPLIFICATION bound.
 * DELIBERATELY EMPTY. Every entry would be a claim about a device's conditioning, and this round earned none of
 * the seven. An empty registry plus a refusal is an honest state; seven invented numbers would be a green
 * report about nothing. `PORTABILITY_TOL[device]` is what the report looks for, and its absence is reported as
 * UNGRADED rather than filled in from a default.
 */
export const PORTABILITY_TOL = Object.freeze({});

export const REPORT_REGISTRATION = preRegister({
    quantity: "deviceReport.c4Amplification",
    claim: {
        // Frozen before the sweep below was run at v4480, and both halves came back.
        movedObservablesExceedingTheDefault: 0,
        medianAmplificationIsAboutOne: true,
    },
    rationale:
        "A one-ulp libm shift perturbs the input by 2^-52. If a quantity is well conditioned its output moves " +
        "by about that much and no more, so the median amplification over a whole lab should sit near 1. The " +
        "claim that NOTHING exceeds the 1e-6 default -- an amplification of 4.5e9 -- is the sharper half: a bar " +
        "nothing has ever come near cannot have been doing any work, and predicting that before the sweep is " +
        "what makes the result a finding rather than an observation.",
});

/**
 * Run the battery over every keyless observable of one device/mode.
 * `tol` is NOT defaulted here: c2 uses the nuisance knob's own declared tolerance (all six declare one), and
 * c4 is graded only if PORTABILITY_TOL names this device. Anything else is UNGRADED and says so.
 */
export async function reportDeviceMode(device, mode) {
    const dev = await getDevice(device);
    const refinement = REFINEMENT_KNOBS[device];
    const nuisance = nuisanceFor(device);
    if (!refinement || !nuisance) throw new Error("deviceReport: " + device + " is not eligible for the full battery");
    let out;
    try { out = await dev.build({ mode, config: {} }); } catch (e) { return { device, mode, error: String(e.message || e), rows: [] }; }
    const rows = [];
    for (const field of keylessFields(out)) {
        const registration = preRegister({
            quantity: `${device}.${mode}.${field}`,
            claim: { [field]: "corroboration battery, tolerances declared or ungraded" },
            rationale: REPORT_REGISTRATION.rationale,
        });
        let r;
        try {
            r = await corroborateFully({
                device, mode, field, refinement, nuisance, registration,
                // The nuisance knob's own number reaches c2; this value can only reach c4, and c4's verdict is
                // discarded below unless the device declares a bound. Infinity rather than 1e-6 so nothing here
                // silently inherits the default this file exists to name.
                tol: Infinity,
            });
        } catch (e) { rows.push({ field, error: String(e.message || e) }); continue; }
        const c4 = r.criteria.c4_portability;
        const declared = PORTABILITY_TOL[device];
        rows.push({
            field,
            c1: r.criteria.c1_preregistered.pass,
            c2: r.criteria.c2_nuisance.pass,
            c2BitIdentical: !!r.criteria.c2_nuisance.bitIdentical,
            c3: r.criteria.c3_convergence.pass,
            moved: !!c4.moved,
            relMove: c4.relMove ?? null,
            amplification: amplification(c4.relMove),
            // *** THE REFUSAL. *** No declared bound, no verdict -- not a verdict borrowed from a parameter list.
            c4: declared === undefined ? "UNGRADED"
                : (c4.moved ? (amplification(c4.relMove) <= declared) : c4.pass),
        });
    }
    return { device, mode, rows };
}

export async function reportLab({ devices = eligibleDevices(), modes = null } = {}) {
    const table = modes || await deviceModeTable();
    const out = [];
    for (const d of devices) for (const m of (table[d] || [])) out.push(await reportDeviceMode(d, m));
    return out;
}

/** Roll-up over whatever reportLab returned. Every number this round quotes comes from here. */
export function summarise(reports) {
    const rows = reports.flatMap((r) => (r.rows || []).filter((x) => !x.error).map((x) => ({ ...x, device: r.device, mode: r.mode })));
    const moved = rows.filter((r) => r.moved);
    const amps = moved.map((r) => r.amplification).sort((a, b) => a - b);
    return {
        observables: rows.length,
        moved: moved.length,
        bitIdentical: rows.length - moved.length,
        ungradedC4: rows.filter((r) => r.c4 === "UNGRADED").length,
        // The old default, in the units that make it legible.
        legacyDefaultRelative: 1e-6,
        legacyDefaultAmplification: 1e-6 / ULP,
        exceedingLegacyDefault: moved.filter((r) => r.relMove > 1e-6).length,
        medianAmplification: amps.length ? amps[Math.floor(amps.length / 2)] : null,
        maxAmplification: amps.length ? amps[amps.length - 1] : null,
        worst: moved.slice().sort((a, b) => b.amplification - a.amplification)
            .slice(0, 3).map((r) => ({ q: `${r.device}.${r.mode}.${r.field}`, amplification: r.amplification })),
    };
}

/**
 * FROZEN AT v4480 from the full run: six devices, every mode, 121 keyless observables. The gate runs a scoped
 * subset -- the full sweep is 92 s and a gate nobody can afford is a gate that gets skipped -- and checks the
 * scoped numbers against their own slice of this, so the wide figures stay re-derivable rather than quoted.
 */
/**
 * THE SCOPE THE GATE CAN AFFORD. Five device/modes, 4.2 s. The full six-device sweep did not return inside
 * seven minutes and is recorded as owed rather than guessed at -- a gate nobody can run is a gate that gets
 * skipped, which is why zeroRangeSweep-selfcheck has had a SCOPE since v2912.
 */
/**
 * *** v4484 -- THE CONDITIONING BOUND PER OBSERVABLE, WHICH IS A PREDICTION AND NOT A TOLERANCE. ***
 *
 * v4480 refused to grade criterion 4 and measured the amplifications so the round that earned tolerances would
 * inherit a table. v4484 tried to earn them and found the task cannot be done WHERE THE TOLERANCE IS USED:
 * corroborateFully's c4 reads `pass: d.relMove <= tol` and d.relMove is measured in the SAME PROCESS by the
 * SAME simulated perturbation, so a tolerance derived from that measurement turns a contingent pass into a
 * NECESSARY one and the evidence string reads identically either way. c4-as-implemented is a CONDITIONING test.
 *
 * The number is real; only its use was wrong. What it actually supports is a PREDICTION about a second machine,
 * and that is where it is spent -- corroborationSubmit.gradeSubmission, which until now could only say a
 * submitted value DIFFERS, with no way to tell one ulp of libm from a broken box.
 *
 * TWO INDEPENDENT LEGS, NEITHER TAKEN FOR THIS PURPOSE:
 *   (1) HOW FAR REAL LIBMS DIFFER. runtimeBench (v3997) compared node against bun over 200,000 inputs per
 *       function: cbrt, cos, sin, tan, atan, exp, log, pow, hypot and atan2 all differ somewhere, and always
 *       BY ONE ULP. Math.sqrt was the only function that agreed everywhere -- which is the control rather than
 *       a surprise, since IEEE-754 requires sqrt to be correctly rounded.
 *   (2) HOW FAR THAT CARRIES. withPerturbedLibm applies +1 ulp to EVERY unspecified libm call, at EVERY call
 *       site, ALWAYS IN THE SAME DIRECTION -- its own header calls that deliberately pessimistic. A real
 *       disagreement has mixed signs across call sites and partially cancels, so the coherent all-up shift is
 *       the WORST CASE a one-ulp libm difference can produce. That is what makes this a bound rather than an
 *       estimate, and why no safety factor is invented on top of it.
 *
 * AND THE BOUND TRAVELS, WHICH IS THE PART THAT MAKES IT USABLE ON A MACHINE THIS BOX HAS NEVER SEEN.
 * Amplification is a property of the ARITHMETIC -- how much a sequence of operations magnifies a perturbation
 * -- and IEEE-754 specifies + - * / and sqrt exactly, so two conforming machines run the same amplifier. Only
 * the libm calls differ, and those are the perturbation, not the multiplier.
 *
 * A quantity that did NOT move has bound 0: the perturbation demonstrably armed (libmControls proves that per
 * device) and this number did not notice, so bit identity is the prediction and any difference is beyond it.
 *
 * MEASURED AT v4484 over SCOPE: 27 observables, 8 moved, worst amplification 8.68e7 on
 * kepler.conserve.growthGapFrac. Re-derived by the gate rather than trusted.
 */
export const CONDITIONING_AT_V4484 = Object.freeze({
    "chaos.feigenbaum.cascadePoints": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.compare.driftRatio": Object.freeze({"moved":true,"relMove":7.305234873885262e-11,"amplification":328998.5305588362}),
    "kepler.compare.eccentricity": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.compare.orbits": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.compare.rk4Growth": Object.freeze({"moved":true,"relMove":7.371419321133261e-11,"amplification":331979.2130784743}),
    "kepler.compare.verletGrowth": Object.freeze({"moved":true,"relMove":6.619149612437343e-13,"amplification":2980.999972808238}),
    "kepler.conserve.eccentricity": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.conserve.energyGrowthRatio": Object.freeze({"moved":true,"relMove":6.619149612437343e-13,"amplification":2980.999972808238}),
    "kepler.conserve.energyGrowthShared": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.conserve.energySamples": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.conserve.energyVerdictBounded": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.conserve.growthGapFrac": Object.freeze({"moved":true,"relMove":1.9272105414786028e-8,"amplification":86793846.76467527}),
    "kepler.conserve.orbits": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "kepler.conserve.semiMajorDrift": Object.freeze({"moved":true,"relMove":6.659978193760644e-13,"amplification":2999.3875311716065}),
    "lens.deflect.bCrit": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "lens.deflect.deflectionMeasured": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "lens.deflect.deflectionWeak": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "lens.deflect.impactParameter": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "lens.deflect.rMin": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "lens.deflect.rMinOverB": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "lens.deflect.relWeak": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "splat.compose.alphaMeasured": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "splat.integral.axisRatio": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "splat.integral.integralRatio": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
    "splat.perspective.areaAtUnitDepth": Object.freeze({"moved":true,"relMove":1.9895196601282823e-15,"amplification":8.960000000000008}),
    "splat.perspective.areaIntercept": Object.freeze({"moved":true,"relMove":2.0268667759164022e-16,"amplification":0.9128196456746748}),
    "splat.perspective.areaSlope": Object.freeze({"moved":false,"relMove":0,"amplification":0}),
});

/**
 * *** v4485 -- THE WIDE SWEEP v4480 OWED, AND THE MODE THAT IS WHY IT WAS OWED. ***
 *
 * v4480 measured c4 over SCOPE (7 device/modes, 27 observables) and said the full six-device sweep "did not
 * return inside seven minutes", naming optics.converge's adaptive quadrature and quantum.bands' diagonalisation
 * as the suspects. That was a description of a failure rather than a measurement. This is the measurement.
 *
 * COVERED: 26 modes over FOUR of the six eligible devices -- chaos (4), kepler (6), lens (13) and three of
 * optics' five. 81 observables, 21 of them movers, in 67086 ms of total work.
 * NOT COVERED, AND SAID PLAINLY: optics.converge, optics.radiusconfusion, and quantum and splat ENTIRELY.
 * So this is NOT a superset of SCOPE -- the scoped set includes splat's three modes and this run never reached
 * them -- and the two tables answer overlapping rather than nested questions.
 *
 * *** ONE MODE COSTS ELEVEN TIMES EVERYTHING ELSE PUT TOGETHER, AND COUNTING. *** optics.converge burned
 * 12 minutes 38 seconds of CPU without returning, against 67086 ms for all 26 completed modes. That is the
 * whole reason the wide number was owed for five rounds, and it is a figure now rather than a suspicion.
 *
 * *** SUPERSEDED AT v4486, AND THE CLAIM BELOW IS FALSE. *** This record's headline was drawn from the four
 * devices the run could REACH, and its own notCovered field named quantum and splat in the same breath. v4486
 * reached them with a child-process budget: quantum.bands.edgeRhsWorst reads 2.5735e15, TWENTY-NINE MILLION
 * TIMES the figure called "the maximum" here, and kepler.conserve.growthGapFrac ranks FIFTH. The numbers below
 * are still true OF THE FOUR DEVICES THAT RAN and are kept as the record of what was measured; the conclusion
 * drawn from them was a claim about reachability wearing the clothes of a claim about the lab. See
 * WIDE_AT_V4486, which also finds that the new maximum is not a conditioning number at all.
 *
 * *** THE SCOPED WORST CASE SURVIVES TRIPLING THE POPULATION, AND IS AN OUTLIER. *** kepler.conserve.
 * growthGapFrac still tops the table at 8.679e7 across 81 observables, and the next worst is 3.320e5 --
 * TWO HUNDRED AND SIXTY-ONE TIMES SMALLER. A worst case that holds when the population triples is a fact about
 * that quantity rather than about the sample. ONE NEW ENTRANT came from outside SCOPE: optics.slit.slitRms at
 * 1.598e5, fourth overall, from a mode the scoped set excluded -- so widening did find something, and it found
 * nothing that moves v4484's bound.
 *
 * *** AND THE BUDGET DID NOT WORK, FOR A REASON THIS TREE HAD ALREADY WRITTEN DOWN. *** The harness capped each
 * mode at 120 s with a Promise.race against a setTimeout. A timer cannot interrupt SYNCHRONOUS work on the same
 * thread, so the cap never fired while optics.converge held the event loop -- measured, 12m38s of solid CPU
 * against a 120 s cap. corroborationCensus.mjs says exactly this beside its own budget: "a build already
 * running cannot be interrupted, so one long build overruns any budget... a TEN-SECOND budget produced a 2m08s
 * run". The only budgets that work are DEADLINE-BEFORE-START -- decline to begin the next unit -- or a child
 * process that can be killed. Re-derived the expensive way, one round after reading the file that records it.
 */
export const WIDE_AT_V4485 = Object.freeze({
    at: "v4485",
    covered: Object.freeze({ devices: 4, modes: 26, observables: 81, movers: 21, totalMs: 67086 }),
    notCovered: Object.freeze(["optics.converge", "optics.radiusconfusion", "quantum (all modes)", "splat (all modes)"]),
    supersetOfScope: false,
    maxAmplification: 86793846.76467527, maxAt: "kepler.conserve.growthGapFrac",
    runnerUp: 331979.2130784743, runnerUpAt: "kepler.compare.rk4Growth",
    newFromOutsideScope: "optics.slit.slitRms",
    blockingMode: Object.freeze({ mode: "optics.converge", cpuMs: 758000, capMs: 120000,
        why: "a setTimeout cannot interrupt synchronous work, so the cap never fired" }),
});

/**
 * *** v4486 -- THE SWEEP REACHED quantum, AND v4485'S HEADLINE WAS WRONG BY SEVEN ORDERS OF MAGNITUDE. ***
 *
 * v4485 swept the four devices it could reach and concluded "the scoped worst case SURVIVES tripling the
 * population" -- kepler.conserve.growthGapFrac at 8.679e7, 261x its runner-up. It froze that, asserted it in a
 * gate, and named quantum and splat as unswept in the same breath. THE UNSWEPT DEVICE HELD SOMETHING 29.6
 * MILLION TIMES LARGER. A conclusion drawn from the population that happened to be REACHABLE is a claim about
 * reachability, and that one was stated as a claim about the lab.
 *
 * COMPLETE: 39 modes over ALL SIX eligible devices, 117 observables, 36 movers, 158.9 s. ONE mode over cap
 * (optics.converge, killed at 60 s) -- and the sweep CONTINUED PAST IT, which is the whole difference. That is
 * what a child process buys: v4485's in-process Promise.race cap could not stop optics.converge, so the run
 * ended there, two devices short.
 *
 * *** BUT THE NEW WORST IS NOT A CONDITIONING NUMBER, AND THAT IS THE REAL FINDING. ***
 * quantumBind.mjs:92 computes edgeRhsWorst as max |abs(kpRhs(E)) - 1| over the band edges -- A RESIDUAL, whose
 * correct value is ZERO. normDrift is the same shape and its own module header says so: "a RUNNING INVARIANT
 * ... the propagator is unitary by construction, so any drift beyond round-off means the solve is wrong."
 * amplification is relMove / ulp, and relMove DIVIDES BY THE VALUE, so for a residual the denominator IS the
 * error being measured. A one-ulp shift moving edgeRhsWorst by 0.5714 -- exactly 4/7 -- is not a quantity
 * amplifying a rounding error 2.6e15 times; it is a near-zero denominator doing what near-zero denominators do.
 *
 * *** AND THEY SIT IN THE KEYLESS POPULATION ONLY BECAUSE THEIR NAMES DO NOT MATCH THE DETECTOR. ***
 * KEYED_RE is /err|error|residual|delta|deviation/i. `edgeRhsWorst`, `numericEdgeWorst` and `normDrift` are
 * error metrics that spell it none of those ways, so all three are corroborated as if they were quantities
 * nobody owns the answer to. THREE OF THE TOP FOUR AMPLIFICATIONS IN THE LAB ARE THAT ONE MISTAKE.
 *
 * WHAT IT MEANS FOR v4484'S BOUND: a predicted bound of 0.5714 lets a second machine report a value 57 per cent
 * different and still read WITHIN_PREDICTION. That is a bar that grades nothing -- the disease v4480 diagnosed
 * in the 1e-6 default, reached from the other end. The bound is meaningful only where the conditioning number
 * is, and for a residual it is not.
 */
export const WIDE_AT_V4486 = Object.freeze({
    at: "v4486",
    devices: 6, modes: 39, observables: 117, movers: 36, totalMs: 158904,
    overCap: Object.freeze(["optics.converge"]),
    complete: true,
    maxAt: "quantum.bands.edgeRhsWorst", maxAmplification: 2573485501354569,
    // v4485 called this the maximum over its reachable four devices. It is FIFTH.
    v4485MaxAt: "kepler.conserve.growthGapFrac", v4485MaxAmplification: 86793846.76467527, v4485RankNow: 5,
    top: Object.freeze([
        Object.freeze({ q: "quantum.bands.edgeRhsWorst", amplification: 2573485501354569, relMove: 0.5714285714285714 }),
        Object.freeze({ q: "quantum.stencil.edgeRhsWorst", amplification: 2573485501354569, relMove: 0.5714285714285714 }),
        Object.freeze({ q: "quantum.norm.normDrift", amplification: 29995430439194.55, relMove: 0.006660323501427212 }),
        Object.freeze({ q: "quantum.bands.numericEdgeWorst", amplification: 1705728565.592947, relMove: 3.7874782545642627e-07 }),
        Object.freeze({ q: "kepler.conserve.growthGapFrac", amplification: 86793846.76467527, relMove: 1.9272105414786028e-08 }),
        Object.freeze({ q: "kepler.compare.rk4Growth", amplification: 331979.2130784743, relMove: 7.371419321133261e-11 })
    ]),
    // The three that are residuals rather than measurements, and why the detector misses them.
    residualsMisread: Object.freeze(["edgeRhsWorst", "numericEdgeWorst", "normDrift"]),
    keyedReMisses: true,
    // MEASURED, so the round that widens the vocabulary inherits the number instead of arguing about it:
    // adding drift|worst|mismatch|violation to KEYED_RE reclassifies 13 of these 117 as keyed -- and ALL FOUR
    // of the top four amplifications are among them. The whole head of the table is error metrics with names
    // the detector does not know. NOT DONE HERE: it moves the census's headline population lab-wide.
    wouldReclassify: 13, wouldReclassifyTopFour: true,
});

export const SCOPE = Object.freeze({
    splat: Object.freeze(["integral", "perspective", "compose"]),
    chaos: Object.freeze(["feigenbaum"]),
    lens: Object.freeze(["deflect"]),
    kepler: Object.freeze(["conserve", "compare"]),
});

/**
 * FROZEN AT v4480 over SCOPE. Every number this round states about c4 comes from here and the gate re-derives
 * all of it. The amplification figures are the point: they are dimensionless, so they compare across devices,
 * and they make the old default legible as what it is -- a licence to amplify a rounding error by 4.5e9.
 */
export const LAB_AT_V4480 = Object.freeze({
    at: "v4480",
    scopedDeviceModes: 7,
    // 27, not 28: the frozen figure was one too high because keylessFields returned a field named *Exact --
    // which is not a quantity with an answer key, it IS one. This gate's own six-field fixture caught it.
    observables: 27,
    moved: 8,
    bitIdentical: 19,
    ungradedC4: 27,               // every one: no device declares a portability tolerance
    exceedingLegacyDefault: 0,
    maxAmplification: 86793846.76467527,
    maxAt: "kepler.conserve.growthGapFrac",
    // 1e-6 / 2^-52. The default, in the units that make it a claim rather than a number. The worst-conditioned
    // quantity in the scoped lab sits FIFTY TIMES under it.
    legacyDefaultAmplification: 4.5035996273704955e9,
    eligibleDevices: 6,
});
