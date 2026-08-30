// tools/roundhouse/corroborationCensus.mjs
//
// v2904 -- THE SWEEP THE CORROBORATION HARNESS NEVER GOT.
//
// v2891 built four criteria for measurements with no answer key. v2902 hardened them: seed stability was passing
// for free across a lab with no stochastic input, so a vacuous seed sweep is now reported UNTESTED and a nuisance
// parameter must be supplied instead. What neither round did was RUN the criteria across the lab.
//
// Two quantities have ever been corroborated. One is the logistic Lyapunov exponent, which the handoff has been
// honest about: it was chosen partly BECAUSE it was expected to pass. The other, the blobarium's "temperature
// nobody set", turned out to be a grid artefact. That is a hit rate of one artefact in two attempts, from a
// sample of two, chosen by me. A rate measured on a sample I selected is not a rate.
//
// So this file does not pick. It enumerates every device/mode in the lab, splits the numbers each one reports
// into KEYED (something independent says what the answer should be) and UNKEYED (nothing does), and reports the
// standing of every unkeyed number against all four criteria -- including, loudly, the ones that cannot be
// tested. The output is meant to be uncomfortable.
//
// GRANULARITY, STATED UP FRONT BECAUSE IT LIMITS EVERY PORTABILITY VERDICT BELOW. The libm tripwire instruments
// the CALL, not the value: it can say that a build made 1,800 unspecified Math.cos calls, but not which of that
// build's eleven reported numbers were downstream of them. So portability here is measured PER DEVICE/MODE and
// applied to every observable that build reports. That is deliberately conservative -- one raw Math.hypot taints
// the whole build's outputs -- and a build flagged non-portable may well contain individually portable numbers.
// Narrowing it means instrumenting per observable, which is a real round and not this one.
//
// WHY THIS IS WORTH RUNNING NOW, SPECIFICALLY. The fleet was just confirmed bit-identical: three machines, 50
// fingerprinted subsystems, same master hash. The roundhouse's observables are NOT among those 50. So "the fleet
// agrees" is a claim about the fingerprint, and this census asks the adjacent question nobody has asked: of the
// numbers this lab actually reports and reasons from, how many would survive being computed on a different
// machine? Every non-portable verdict below is a prediction the fleet can falsify in an afternoon.

import { getDevice, DEVICE_NAMES } from "./devices.mjs";
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED. MODES never existed here -- see deviceModes.mjs
import { preRegister } from "./corroborate.mjs";
import { readCostRecord, costFor, scaledCostFor } from "./costRecord.mjs";

/**
 * WHY THIS CENSUS DOES NOT USE measurePortabilityAsync, AND WHAT THAT COST TO FIND OUT.
 *
 * The obvious implementation imports the existing tripwire and loops it over the lab. That version was written,
 * run, and abandoned after it spent five minutes without finishing the second device. The cause is not the
 * physics: measurePortability captures `new Error().stack` on EVERY instrumented call, so that it can name the
 * site. blackhole.orbit alone makes 200,001 unspecified libm calls, and 200,001 stack captures is a stall.
 *
 * That is exactly right for its intended job -- interrogating ONE quantity, where you want the site and there are
 * a few hundred calls -- and it is why the tripwire has only ever been pointed at one quantity at a time. It is
 * also, quietly, part of the answer to why this census was never run.
 *
 * So the census uses a SAMPLING variant: count every call exactly, but capture the stack only for the first few
 * occurrences of each function. The count -- which is what the portable/non-portable verdict turns on -- is
 * unchanged and exact. What degrades is site attribution, which becomes "the first places this function was
 * called from" rather than the full ranked list. That is the right trade for a sweep and the wrong one for an
 * interrogation, so this deliberately does NOT replace measurePortability; it sits beside it.
 */
const UNSPEC = [
    "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "exp", "log", "log2", "log10",
    "log1p", "expm1", "pow", "hypot", "cbrt", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
];
const SITE_SAMPLES = 3;

/**
 * *** v4039 -- WHAT THE COUNTING COSTS: ABOUT TWICE, NOT ABOUT SEVENTY TIMES. ***
 *
 * THIS ENTRY BEGAN AS A WRONG NUMBER AND THE WRONG NUMBER IS KEPT HERE, because the way it was arrived at is
 * the more useful warning. v4036's progressive output showed `kuramoto 3 modes 1044.15 s` in a census log,
 * and one uninstrumented `curve` build is 7.3 s. The inference was that the instrument multiplied the cost
 * some seventyfold. MEASURED DIRECTLY, ON kuramoto ITSELF:
 *
 *     curve      bare  7343 ms   instrumented  13971 ms   1.9x    354.0M libm calls
 *     onset      bare 11319 ms   instrumented  13776 ms   1.2x    354.0M libm calls
 *     pendulum   bare     5 ms   instrumented      0 ms   --      0 calls
 *
 * Twenty-eight seconds instrumented, against 1044 in the log. *** THE OTHER THOUSAND SECONDS WERE CPU
 * CONTENTION FROM THE OTHER JOBS RUNNING BESIDE IT, AND THE READING WAS ATTRIBUTED TO THE CODE. *** A
 * standalone benchmark agrees: 2.1x on a tight sin/cos loop. This tree has a name for that mistake -- a
 * number measured on a machine doing something else is not a measurement of the thing you were looking at --
 * and the same session had already seen the identical build time 117.0 s, 205.0 s and 207.7 s under load.
 *
 * SO THE OPTIMISATION BELOW IS WORTH ITS SIZE AND NOT MORE. It makes the wrapper 1.58x faster on the same
 * loop, which on kuramoto's 354 MILLION libm calls is seconds rather than minutes. The genuine finding is
 * the call count itself: 354M is three thousand times the 1e8 that this census's own gate calls the reason
 * nobody had run the sweep before.
 *
 * The wrapper did six things on EVERY call, three of them hash-map operations and one an allocation:
 *
 *     (...a)                      allocated an arguments array, per call
 *     counts.get(name)            a Map read, string key
 *     counts.set(name, ...)       a Map write
 *     sampled.get(name)           a second Map read
 *     originals[name](...a)       a property lookup plus a spread apply
 *     .bind(Math)                 a bound function, slower to invoke than the original
 *
 * None of it is needed. A closure-captured integer counts as exactly as a Map does, and Math's functions do
 * not use `this`, so binding buys nothing. Fixed-arity wrappers remove the allocation: nineteen of these are
 * unary, two take two arguments, and only hypot is truly variadic.
 *
 * *** THE COUNT IS THE PRODUCT AND THE COUNT IS UNCHANGED. *** Every portable/non-portable verdict this
 * census reports turns on rawCalls, so a faster wrapper that counted differently would be worthless. The
 * gate asserts exactness against a synthetic function that makes a KNOWN number of calls, which is a
 * stronger check than agreeing with the previous implementation would have been -- an implementation is not
 * an answer key.
 *
 * WHAT IS NOT FIXED, AND CANNOT BE FROM HERE: replacing Math.sin at all costs every call site in the process
 * its inlined intrinsic. That is inherent to counting calls by substitution and is the reason a census will
 * always cost more than a build. This removes the avoidable half of a 2x, and 2x is the whole size of the
 * prize -- stated plainly so nobody re-derives the seventyfold story from the same log.
 */
export async function measurePortabilitySampled(fn) {
    const counters = Object.create(null);     // name -> { n, sampled }, closure-captured, no hashing per call
    const sites = new Map();
    const originals = {};
    const note = (name, c) => {               // OFF the hot path: only the first SITE_SAMPLES calls reach it
        c.sampled++;
        const frame = (new Error().stack.split("\n")[3] || "").trim().replace(/^at /, "");
        sites.set(name + " @ " + frame.replace(/file:\/\/\/.*?WebGLEngine\//, ""), true);
    };
    for (const name of UNSPEC) {
        const orig = Math[name];              // NOT bound: Math's functions do not use `this`
        originals[name] = orig;
        const c = { n: 0, sampled: 0 };
        counters[name] = c;
        Math[name] = name === "hypot"
            ? (...a) => { c.n++; if (c.sampled < SITE_SAMPLES) note(name, c); return orig(...a); }
            : (name === "atan2" || name === "pow")
                ? (x, y) => { c.n++; if (c.sampled < SITE_SAMPLES) note(name, c); return orig(x, y); }
                : (x) => { c.n++; if (c.sampled < SITE_SAMPLES) note(name, c); return orig(x); };
    }
    let pending, err = null;
    try { pending = fn(); } catch (e) { err = e; }
    for (const name of UNSPEC) Math[name] = originals[name];     // disarm BEFORE awaiting, as v2893 established
    if (err) throw err;
    const value = await pending;
    let rawCalls = 0;
    const counted = [];
    for (const name of UNSPEC) {
        const n = counters[name].n;
        if (n) { rawCalls += n; counted.push([name, n]); }
    }
    return {
        value, rawCalls,
        byFn: counted.sort((a, b) => b[1] - a[1]).map(([k, n]) => n + "x " + k),
        sites: [...sites.keys()].slice(0, 6),
    };
}

/** v2898's definition of an answer-keyed field, reused verbatim so the two censuses partition the same way. */
export const KEYED_RE = /err|error|residual|delta|deviation/i;

/**
 * REFINEMENT KNOBS. Criterion 3 asks whether a number survives being computed more finely. That needs a knob,
 * and the knob is per device -- there is no generic one. This table is the honest inventory: a device absent
 * from it has NO DECLARED WAY to be refined, and its unkeyed numbers are reported as convergence-untested
 * rather than quietly passing. Filling this table in is the follow-on work, one device at a time.
 */
export const REFINEMENT_KNOBS = {
    lens: { key: "mapN", values: [9, 13, 21], modes: ["map"] },
    optics: { key: "nSamples", values: [512, 1024, 2048], modes: ["airy", "slit"] },
    ct: { key: "nAngles", values: [64, 128, 256], modes: ["parallel", "fan"] },
};

/** Numbers that are structural rather than physical -- counts, indices, flags. Grading them is noise. */
const STRUCTURAL_RE = /^(n|count|cells|steps|iters|index|i|j|k|mode|seed|size|len|length)$|Count$|Cells$|Steps$|^is[A-Z]|^has[A-Z]/;

const isFinite_ = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * Sweep the lab. Returns one record per device/mode plus a roll-up. Nothing here mutates the devices; every
 * build is called exactly as the census and the CLI call it.
 */
/**
 * *** v4036 -- A BUDGET AND PROGRESSIVE OUTPUT, BECAUSE THIS COULD NOT BE RUN. ***
 *
 * The selfcheck beside this file opens "~60s: it builds the whole lab". It now exceeds 1500 s and returns
 * NOTHING while it does -- three timed-out runs this session, the last on an otherwise idle machine, with zero
 * bytes of output. Both halves of that are fixable and both were the same mistake:
 *
 *   THE COST WAS NEVER BOUNDED. This builds every device in every mode, and the lab has grown from the 54
 *   devices of that era to 129 while acquiring members whose SINGLE build costs minutes. The 60-second
 *   estimate dates from when nothing here cost a second. A census inherits every cost it enumerates.
 *
 *   AND IT WAS SILENT. `verbose` existed and defaulted off, so the default run printed its first character
 *   only after every build had finished -- which makes a slow run and a hung one look identical, and this
 *   session spent three timeouts unable to tell them apart. onProgress reports each build AS IT LANDS.
 *
 * *** THE BUDGET DEFAULTS TO INFINITY AND THAT IS DELIBERATE. *** The pinned numbers in the gate are lab-wide
 * totals, so a shortened run would quietly understate every one of them. A caller who wants a fast partial
 * answer asks for one and gets it clearly labelled: `complete: false`, the skipped device-modes counted, and
 * the gate refusing to assert its totals from partial data rather than passing on a smaller lab.
 *
 * The deadline is checked BEFORE each build, and one build is still unbounded -- the same limit probeKnob
 * states at v4032, for the same reason: a build is synchronous and nothing here can interrupt one already
 * started. This bounds how many start.
 */
export async function corroborationCensus({ modes = null, verbose = false,
                                            budgetMs = Infinity, onProgress = null } = {}) {
    // v3211 -- BUILT, NOT LISTED, AND IT REFUSES AN EMPTY TABLE. A caller may still pass its own.
    if (!modes) modes = await deviceModeTable();
    const rows = [];
    let built = 0, failed = 0;

    // The DENOMINATOR, computed before any work. The gate used to ask `deviceModes >= 80`, which is a floor and
    // not a coverage claim -- the identical shape strictConfig's mirrorAudit carried until v4032, where
    // `scanned > 40` was comfortably satisfied by 81 of 116. A budget without this would have reintroduced
    // exactly the defect that round removed.
    const planned = [];
    for (const name of DEVICE_NAMES) for (const mode of (modes[name] || [])) planned.push(name + "." + mode);
    const plannedDeviceModes = planned.length;

    // Read once, not per build. A missing file is normal and yields an empty record, so every device simply
    // has no prior and the sweep behaves exactly as it did before costRecord.mjs existed.
    const costRec = readCostRecord();
    const started = Date.now();
    const deadline = started + budgetMs;
    const skipped = [];      // never started: the deadline had passed
    const declined = [];     // never started: the device said it would not fit in what was left
    let done = 0, overBudget = false;

    for (const name of DEVICE_NAMES) {
        const ms = modes[name];
        if (!ms) continue;                          // lbm: real runs take minutes
        let dev;
        try { dev = await getDevice(name); } catch { continue; }

        for (const mode of ms) {
            if (overBudget || Date.now() > deadline) {
                overBudget = true;
                skipped.push(name + "." + mode);    // NAMED, never silently dropped
                continue;
            }
            // *** v4037 -- A DEVICE THAT KNOWS WHAT IT COSTS CAN BE DECLINED BEFORE IT STARTS. ***
            // v4036 stated the limit honestly and left it open: the deadline bounds how many builds START,
            // and a build already running cannot be interrupted, so one long build overruns any budget. That
            // is not hypothetical -- a TEN-SECOND budget produced a 2m08s run, because device 82 is twof and
            // one build of it is 114 s. The budget was working perfectly and the run was still unusable.
            //
            // The gap closes from the other side: ask the device first. A `costHint` is a SCHEDULING AID AND
            // NOT A MEASUREMENT -- it is allowed to be rough, a wrong one costs a skipped build or a long one
            // and can never change a reported number, and a device that declares none behaves exactly as
            // before. What it must not do is silently drop the build: an over-cost skip is recorded in
            // `skipped` beside the budget skips, so coverage still counts it as not swept.
            {
                // *** v4080 -- A DECLARED HINT FIRST, THEN WHAT THE DEVICE ACTUALLY COST LAST TIME. ***
                // v4037 read only `dev.costHint`, and as of v4038a exactly one device in the whole lab (twof)
                // declares one -- so the decline check did nothing for the other 128. The two sources are
                // complementary rather than redundant: a costHint is a function of the CONFIG, so it knows
                // twof at settle 300 costs a fortieth of twof at its shipped default; costFor cannot, because
                // it holds one number per device/mode at the default config alone. What the record has instead
                // is COVERAGE -- it prices every device that declares nothing, which after this round is all
                // but one of them, without anyone hand-calibrating a constant (rawCalls was tried for that job
                // and measured to be a poor-to-anti predictor of wall time; see costRecord.mjs and
                // twoFBind.mjs).
                let hint = null;
                if (typeof dev.costHint === "function") {
                    try { hint = dev.costHint({ mode, config: {} }); } catch { hint = null; }
                }
                // *** v4173 -- THE HINT IS CONVERTED INTO THIS MACHINE'S MILLISECONDS BEFORE IT IS COMPARED
                // TO THIS MACHINE'S REMAINING TIME. *** costRecord's own header has said since v4038a that a
                // frozen cost is "milliseconds on the machine that froze it", and this line compared that
                // straight against a deadline being spent HERE. Two clocks, no conversion.
                //
                // MEASURED on Keith's rig: the record prices twof's three modes at 458.9 s and his run took
                // 943.1 s -- a ratio of 2.055 against a measured host scale of 2.05. THE HINT WAS RIGHT ABOUT
                // THE WRONG BOX, understating by exactly the host factor, so the decline below fired far too
                // late and one device at position 82 of 87 took 73% of the entire sweep.
                //
                // A DECLARED costHint (above) is NOT scaled: a device that computes its own cost is measuring
                // itself HERE, on this box, this run. Only the FROZEN record needs converting, because only
                // the frozen record came from somewhere else.
                if (!Number.isFinite(hint)) hint = scaledCostFor(name, mode, costRec);
                const remaining = deadline - Date.now();
                //
                // *** AND A DECLINE DOES NOT END THE SWEEP, WHICH THE FIRST DRAFT OF THIS GOT WRONG. ***
                // TOO EXPENSIVE and OUT OF TIME are different facts. Setting overBudget here would have let
                // one costly device at position 82 discard the 47 cheap ones after it -- turning a device's
                // honesty about its own cost into a penalty on everything downstream, which is the opposite
                // of what declaring a cost is for. The deadline ends the sweep; a decline skips one build.
                if (Number.isFinite(hint) && hint > remaining) {
                    declined.push(name + "." + mode + " (declared ~" + Math.round(hint) + " ms, " +
                                  Math.round(remaining) + " ms left)");
                    continue;
                }
            }
            const t0 = Date.now();
            let port;
            try {
                // Portability and the build in one shot: the sampled tripwire arms, calls, disarms before
                // awaiting, so the observables come back from the SAME run that was instrumented. Measuring
                // portability on a second, separate build would be measuring a different execution.
                port = await measurePortabilitySampled(() => dev.build({ mode }));
            } catch { failed++; continue; }
            const obs = port.value;
            if (!obs || typeof obs !== "object") { failed++; continue; }
            built++;

            const keyed = [], unkeyed = [], structural = [];
            for (const [k, v] of Object.entries(obs)) {
                if (!isFinite_(v)) continue;
                if (STRUCTURAL_RE.test(k)) structural.push(k);
                else if (KEYED_RE.test(k)) keyed.push(k);
                else unkeyed.push(k);
            }

            const knob = REFINEMENT_KNOBS[name];
            const refinable = !!(knob && (!knob.modes || knob.modes.includes(mode)));

            rows.push({
                device: name, mode,
                keyed, unkeyed, structural,
                portable: port.rawCalls === 0,
                rawCalls: port.rawCalls,
                // v4080 -- KEPT ON THE ROW, NOT ONLY HANDED TO onProgress. The sweep already times every build
                // for its own progress line; this is the same number, so costVsCalls (below) and a freeze both
                // read it from here instead of every caller re-deriving a side channel for it.
                ms: Date.now() - t0,
                sites: port.sites, byFn: port.byFn,
                refinable,
                knob: refinable ? knob.key : null,
            });
            if (verbose) console.log(`    ${name}.${mode}: ${unkeyed.length} unkeyed, ${port.rawCalls} raw libm calls`);
            done++;
            if (onProgress) {
                try {
                    onProgress({ device: name, mode, done, total: plannedDeviceModes,
                                 ms: Date.now() - t0, elapsedMs: Date.now() - started,
                                 rawCalls: port.rawCalls, unkeyed: unkeyed.length });
                } catch { /* a reporter that throws must not take the census down with it */ }
            }
        }
    }

    const unkeyedTotal = rows.reduce((a, r) => a + r.unkeyed.length, 0);
    const nonPortable = rows.filter((r) => !r.portable);
    const unkeyedAtRisk = nonPortable.reduce((a, r) => a + r.unkeyed.length, 0);
    const refinableRows = rows.filter((r) => r.refinable);

    return {
        rows, built, failed,
        // *** A SHORTENED RUN SAYS SO IN THE RESULT, NOT ONLY IN A LOG LINE NOBODY KEPT. *** Every total below
        // is a sum over `rows`, so each one shrinks silently when the sweep stops early. `complete` is what a
        // caller checks before quoting any of them.
        // `complete` means EVERY PLANNED BUILD RAN. A declined build is as absent from the totals as a
        // skipped one, so it counts against completeness just the same -- the two are reported separately
        // because they are different facts, not because one of them is harmless.
        complete: !overBudget && declined.length === 0,
        skipped, declined, plannedDeviceModes,
        summary: {
            complete: !overBudget && declined.length === 0,
            plannedDeviceModes,
            skippedDeviceModes: skipped.length,
            declinedDeviceModes: declined.length,
            deviceModes: rows.length,
            keyedTotal: rows.reduce((a, r) => a + r.keyed.length, 0),
            unkeyedTotal,
            portableModes: rows.length - nonPortable.length,
            nonPortableModes: nonPortable.length,
            // THE HEADLINE NUMBER: unkeyed observables that no answer key checks AND that a second machine is
            // not promised to reproduce. Nothing in the tree currently vouches for these.
            unkeyedAtRisk,
            refinableModes: refinableRows.length,
            unrefinableUnkeyed: rows.filter((r) => !r.refinable).reduce((a, r) => a + r.unkeyed.length, 0),
            // criterion 1 across the lab: exactly one quantity was ever pre-registered.
            preRegistered: 1,
        },
    };
}

/**
 * THE PRE-REGISTRATION FOR THIS CENSUS, written before the sweep was run and kept in the file that runs it.
 *
 * Criterion 1 is the one that cannot be retrofitted, and a census of criterion-1 failures that was not itself
 * pre-registered would be the funniest possible tautology. So: the prediction, on record, with its rationale --
 * open item 5 states that only the map path in lensBind uses strictTrig, and that shadow/aim/deflect were
 * deliberately left on raw trig. If the tripwire is measuring what it claims to, those modes must come back
 * non-portable. If they come back clean, the tripwire is not reaching the device builds and every portable
 * verdict in this census is worthless.
 */
export const CENSUS_REGISTRATION = preRegister({
    quantity: "lens.shadow / lens.aim / lens.deflect portability",
    claim: { observable: "rawCalls", min: 1 },
    rationale: "open item 5: only lensBind's map path was converted to strictTrig in v2900; shadow, aim and " +
        "deflect were left on raw Math.sin/cos deliberately. They must therefore report unspecified libm calls. " +
        "A clean verdict here would mean the tripwire is not reaching device builds, which would invalidate " +
        "every OTHER portable verdict this census reports -- so this is a control, not a discovery.",
});

/**
 * *** v4080 -- rawCalls IS NOT A COST MODEL, MEASURED RATHER THAN PROPOSED. ***
 *
 * The census already carries (rawCalls, ms) per device/mode -- one for portability, the other for scheduling
 * (v4036's onProgress, now also kept on the row). It is tempting to derive a cost hint from the first instead
 * of asking every device to declare its own (v4037's `costHint`, which as of this round exactly one device in
 * the lab bothers with): a call counter is free, already computed, and looks like exactly the kind of proxy a
 * scheduling decline wants. MEASURED here instead of assumed: ms-per-Mcall (milliseconds per million libm
 * calls) spans orders of magnitude across the rows this sweep actually built, because a build's wall time is
 * NOT bounded by its transcendental-function count -- SPH neighbour search, an LBM lattice sweep, and a matrix
 * solve all cost real time and make comparatively few or zero Math.sin/cos/pow calls, while a device that is
 * ALMOST NOTHING BUT trig (a Kuramoto phase update, say) can make hundreds of millions of calls and still
 * finish quickly because there is nothing else in its inner loop. So a device with FEWER calls can cost MORE
 * time, and the ranking a rawCalls-based hint would produce is not merely imprecise, it can point the wrong
 * way at the extremes -- which is why costRecord.mjs measures wall time directly instead of fitting one.
 *
 * @returns { rows: [{device,mode,rawCalls,ms,msPerMcall}], spanX, cheapest, priciest } over the rows with at
 * least one libm call (msPerMcall is undefined, not zero, for a build that made none -- see the caller).
 */
export function costVsCalls(rows) {
    const withCalls = rows.filter((r) => r.rawCalls > 0 && typeof r.ms === "number")
        .map((r) => ({ device: r.device, mode: r.mode, rawCalls: r.rawCalls, ms: r.ms,
                       msPerMcall: r.ms / (r.rawCalls / 1e6) }))
        .sort((a, b) => a.msPerMcall - b.msPerMcall);
    if (!withCalls.length) return { rows: [], spanX: null, cheapest: null, priciest: null };
    const cheapest = withCalls[0], priciest = withCalls[withCalls.length - 1];
    return { rows: withCalls, spanX: priciest.msPerMcall / cheapest.msPerMcall, cheapest, priciest };
}

export function censusLines(c) {
    const L = [];
    const s = c.summary;
    L.push(`corroboration census -- ${s.deviceModes} device/modes built, ${c.failed} refused to build`);
    L.push(`  observables: ${s.keyedTotal} keyed (an answer key checks them), ${s.unkeyedTotal} UNKEYED (nothing does)`);
    L.push(`  portability: ${s.portableModes} modes clean, ${s.nonPortableModes} touching unspecified libm`);
    L.push(`  ==> ${s.unkeyedAtRisk} of ${s.unkeyedTotal} unkeyed observables are reported by a NON-PORTABLE build:`);
    L.push(`      no answer key, and no promise that a second machine reproduces them`);
    L.push(`  convergence: ${s.refinableModes} modes have a declared refinement knob; ${s.unrefinableUnkeyed} unkeyed`);
    L.push(`      observables live in modes with NO way to test criterion 3`);
    L.push(`  pre-registration: ${s.preRegistered} quantity in the entire lab (criterion 1 cannot be retrofitted)`);
    return L;
}
