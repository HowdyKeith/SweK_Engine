#!/usr/bin/env node
// tools/roundhouse/corroborationSubmit-selfcheck.mjs -- v4481
//
// Run: node tools/roundhouse/corroborationSubmit-selfcheck.mjs   (~5s, scoped)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// *** CRITERION 4 HAS AN UNANSWERABLE MAJORITY, AND UNTIL THIS ROUND THE MAILBOX COULD NOT CARRY THE ANSWER. ***
//
// v2889's argument settles portability for any quantity whose code path touches only IEEE-specified operations:
// there is nothing left for two libms to disagree about. MEASURED over v4480's scope, that argument reaches
// SEVEN of 27 keyless observables. The other TWENTY make between 1 and 160,004 raw transcendental calls, and
// for those the only thing that answers criterion 4 is another machine reporting the same bits.
//
// The tree has had a fleet since v2949 and a submission endpoint since the same round -- the narrowest in the
// tree, six kinds mapping to six fixed filenames, a device supplying content and never a destination. All six
// are GPU benches or transcripts. NOT ONE CARRIES THE VALUE OF AN OBSERVABLE. This round adds the seventh kind
// and its grader, keeping every rule the surface already earned.
//
// *** AND NOTHING HAS SUBMITTED. *** Section 5 asserts that, rather than letting a green gate imply otherwise.
// What exists is the path and its adjudicator, exercised by fixture. What does not exist is a measurement.
//
// ---- SABOTAGE LOG -- 16 edits, 16 red by name, THREE of them 0 RED first -----------------------------------
// Caught at once: the bridge losing the seventh kind (1 red); the submission carrying a verdict through (1);
// bitsOf keeping only the high word (4); an empty ledger reading as unanimous (1); a re-upload counting as a
// second machine (2); a second device overwriting the first (1); the device key re-derived instead of imported
// (1); absent folded into agreement (1); the by-construction split inverted (1); the frozen rawCalls table
// falsified (1); the round claiming a submission arrived (1); the bridge taking a filename from the request
// (1); a field added to the submission under any other name (1); the platform field dropped (1).
//
// *** THE THREE THAT SURVIVED WERE ALL A CHECK LOOKING AT THE WRONG THING. ***
//   1. Removing the auto-fold went 0 RED: `if (false && j.kind === "...")` still contains the kind string, and
//      the row matched the string rather than a reachable branch. It now asserts `if (j.kind === "...")`.
//   2. Swapping the grader from BITS to `got.value === v` went 0 RED, because the one-ulp fixture differs both
//      ways. -0 and 0 are EQUAL as numbers and DIFFERENT as bits, and nothing else in the fixture separates
//      them -- so that pair is now the discriminator, and it is the case a real device pipeline produces.
//   3. Adding an unused `verdict` PARAMETER went 0 RED and is a genuine no-op: the function still carries
//      nothing through, and its partner sabotage -- putting the verdict in the returned object -- reds
//      correctly. Recorded as a no-op rather than chased, and the row now asserts the EXACT key set, so a
//      field added under any other name reds too. Both were then sabotaged to confirm it.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as CS from "./corroborationSubmit.mjs";
import { deviceKey } from "./deviceLedger.mjs";
import * as DR from "./deviceReport.mjs";
import { measurePortabilityAsync } from "./corroborate.mjs";
import { getDevice } from "./devices.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

const P = CS.PORTABILITY_AT_V4481;
const bridge = fs.readFileSync(path.join(HERE, "../../ai-bridge/androidPeerBridge.js"), "utf8");

// ---- 1. THE POPULATION: WHAT THE ARGUMENT REACHES AND WHAT IT DOES NOT --------------------------------------
sec("1. *** SEVEN SETTLED BY ARGUMENT, TWENTY THAT ONLY A SECOND MACHINE CAN SETTLE ***");
{
    const rawCalls = {}, keyless = {};
    for (const [d, ms] of Object.entries(DR.SCOPE)) {
        const dev = await getDevice(d);
        for (const mode of ms) {
            const p = await measurePortabilityAsync(() => dev.build({ mode, config: {} }));
            rawCalls[`${d}.${mode}`] = p.rawCalls;
            keyless[`${d}.${mode}`] = DR.keylessFields(p.value || {}).length;
        }
    }
    Object.entries(rawCalls).forEach(([dm, c]) =>
        say(`${dm.padEnd(20)} ${String(keyless[dm]).padStart(2)} keyless, rawCalls ${String(c).padStart(6)}` +
            (c === 0 ? "   PORTABLE BY CONSTRUCTION" : "")));
    const s = CS.settledByConstruction(rawCalls, keyless);
    ok("!! the split is DERIVED from the libm tripwire, not asserted",
        s.total === P.keylessObservables && s.byConstruction === P.settledByConstruction &&
        s.needMachine === P.needARealSecondMachine,
        `${s.byConstruction} of ${s.total} settled by v2889's argument -- lens.deflect makes ZERO raw ` +
        `transcendental calls, so no conforming machine can disagree about it. ${s.needMachine} cannot be ` +
        "settled here at all: kepler.compare alone makes 160,004");
    ok("...and the rawCalls table re-derives, per device/mode",
        Object.entries(P.rawCalls).every(([dm, c]) => rawCalls[dm] === c),
        "a frozen table beside a live measurement is the only arrangement where drift shows. The libm " +
        "tripwire is corroborate.measurePortability's, not a second counter written here");
    ok("!! v4480's simulated shift measures CONDITIONING, not portability -- different questions",
        Object.keys(DR.PORTABILITY_TOL).length === 0 && DR.ULP === Math.pow(2, -52),
        "a one-ulp perturbation applied by this process says how far a quantity WOULD move if a libm differed. " +
        "It cannot say whether any real libm does. v4480 refused to grade c4 on it and this round explains " +
        "what would: a machine, not a bigger number");
}

// ---- 2. THE SEVENTH KIND, IN THE NARROWEST ENDPOINT IN THE TREE ---------------------------------------------
sec("2. *** THE MAILBOX ACCEPTS A MEASUREMENT, AND KEEPS EVERY RULE IT ALREADY EARNED ***");
{
    ok("!! the kind is in the bridge's allow-list, and the module and the bridge agree on its spelling",
        bridge.includes(`"${CS.CORROBORATION_KIND}": "${CS.CORROBORATION_FILE}"`),
        `${CS.CORROBORATION_KIND} -> ${CS.CORROBORATION_FILE}. Read out of androidPeerBridge.js, so a kind ` +
        "declared here and absent there -- an endpoint that would reject every submission this module builds -- " +
        "cannot pass");
    ok("the device still supplies CONTENT and never a destination",
        /const name = KINDS\[j && j\.kind\]/.test(bridge) && !/j\.(filename|name|path)\b/.test(bridge),
        "the filename comes from the allow-list, never from the request. Adding a kind must not widen that, " +
        "and this is the same assertion submit-selfcheck.mjs has made since v2949");
    ok("!! *** the submission has NO VERDICT FIELD AT ALL, so a device cannot express one ***",
        (() => {
            const sub = CS.buildSubmission({ adapter: { vendor: "v" }, ua: "u", observables: { "a.b.c": 1 },
                                             verdict: "PASS", graded: true, ok: true });
            // The EXACT key set, not merely the absence of three names: a field added by any other name is
            // a field a device could put a verdict in, and "not these three" would wave it through.
            const EXPECTED = ["adapter", "at", "engineVersion", "kind", "platform", "ua", "values", "version"];
            return Object.keys(sub).sort().join(",") === EXPECTED.join(",") &&
                   Object.keys(sub.values["a.b.c"]).sort().join(",") === "bits,value";
        })(),
        "buildSubmission is given verdict, graded and ok and carries none of them through. deviceLedger's " +
        "third rule, unchanged: a device measures, the desktop adjudicates -- so a device can never write its " +
        "own verdict into the fleet record");
    ok("the fold is wired into the endpoint, not left for somebody to run by hand",
        // A dead guard still matches the kind string: `if (false && j.kind === ...)` passed the first draft
        // of this row. The branch must be REACHABLE, so the `if (` and the condition are asserted together.
        /if \(j\.kind === "swek-corroboration-observables"\)/.test(bridge) &&
        /corroborationSubmit\.mjs/.test(bridge) && /foldSubmission/.test(bridge),
        "v2973's lesson about the perf ledger: it existed for 33 versions and stayed empty because a human had " +
        "to fold it. Accumulating as a side effect of a peer reporting is the only way a ledger ever fills");
}

// ---- 3. BITS, NOT NUMBERS -----------------------------------------------------------------------------------
sec("3. *** AGREEMENT IS ASKED OF THE BIT PATTERN, BECAUSE THE LAST BIT IS THE WHOLE SUBJECT ***");
{
    const v = 0.1;
    const oneUlpUp = v + Number.EPSILON * v;
    // *** THE DISCRIMINATOR THAT MATTERS: -0 AND 0 ARE EQUAL AS NUMBERS AND DIFFERENT AS BITS. ***
    // Swapping the comparison from bits to `got.value === v` went 0 RED against the first draft, because the
    // one-ulp fixture differs both ways. Negative zero separates them and nothing else in the fixture does.
    const zeroPhone = { adapter: { vendor: "z" }, ua: "z" };
    const zeroLedger = CS.foldSubmission(CS.emptyLedger(), CS.buildSubmission({ ...zeroPhone, observables: { z: -0 } }));
    const zeroGrade = CS.gradeSubmission(zeroLedger, { z: 0 });
    ok("!! *** -0 and 0 are EQUAL as numbers and DIFFERENT as bits, and the grader says DIFFERS ***",
        -0 === 0 && !Object.is(-0, 0) && CS.bitsOf(-0) !== CS.bitsOf(0) &&
        zeroGrade.rows[0].verdict === CS.AGREE.DIFFERS,
        `${CS.bitsOf(-0)} against ${CS.bitsOf(0)}. A grader comparing with === calls these the same value, ` +
        "and a device whose pipeline produces a signed zero where this machine produces an unsigned one is " +
        "reporting a different computation. Criterion 4 asks for the same BITS");
    ok("!! a one-ulp difference is DIFFERS, not agreement",
        CS.bitsOf(v) !== CS.bitsOf(oneUlpUp) && CS.fromBits(CS.bitsOf(v)) === v,
        `${CS.bitsOf(v)} against ${CS.bitsOf(oneUlpUp)}. Criterion 4 asks for the SAME BITS; a comparison with ` +
        "any tolerance in it would answer a different question, and a tolerance is exactly what v4480 found " +
        "nobody had chosen");
    ok("!! and a float32 round trip is caught, which a 15-digit formatter would hide",
        (() => {
            const f32 = Math.fround(v);
            return CS.bitsOf(f32) !== CS.bitsOf(v) && Math.abs(f32 - v) < 1e-8;
        })(),
        `Math.fround(0.1) differs from 0.1 by under 1e-8 -- it prints the same to seven places and formats the ` +
        "same in most reports. The bits do not match. A device that ships its numbers through a float32 " +
        "texture or a graphics buffer is exactly the device this surface exists for");
    ok("bits round-trip exactly, both ways",
        [0.1, 1, -0, 1e308, 5e-324, Math.PI].every((x) => Object.is(CS.fromBits(CS.bitsOf(x)), x)),
        "including negative zero and a subnormal, which a naive parse loses");
}

// ---- 4. APPEND, NEVER OVERWRITE, KEYED BY CONTENT -----------------------------------------------------------
sec("4. *** A SECOND DEVICE CANNOT ERASE THE FIRST, AND A RE-UPLOAD IS NOT A SECOND OPINION ***");
{
    const phone = { adapter: { vendor: "arm", architecture: "mali-g78" }, ua: "Android 10; K" };
    const deck = { adapter: { vendor: "amd", architecture: "rdna2" }, ua: "SteamOS" };
    const a1 = CS.buildSubmission({ ...phone, platform: "android", engineVersion: "v4481", observables: { "q.m.f": 1.5 } });
    const a2 = CS.buildSubmission({ ...phone, platform: "android", engineVersion: "v4481", observables: { "q.m.f": 1.5 } });
    const a3 = CS.buildSubmission({ ...phone, platform: "android", engineVersion: "v4482", observables: { "q.m.f": 1.5000000000000002 } });
    const b1 = CS.buildSubmission({ ...deck, platform: "steamdeck", engineVersion: "v4481", observables: { "q.m.f": 1.5 } });
    let L = CS.emptyLedger();
    [a1, a2, a3, b1].forEach((s) => { L = CS.foldSubmission(L, s); });
    const keys = Object.keys(L.devices);
    ok("!! two devices are two buckets, and the key is IMPORTED rather than re-derived",
        keys.length === 2 && keys.includes(deviceKey(phone)) && keys.includes(deviceKey(deck)),
        `${keys.length} devices from four submissions. deviceKey comes from deviceLedger.mjs -- a second hash ` +
        "of the same three fields would be the second copy nobody updates");
    const phoneBucket = L.devices[deviceKey(phone)] || { runs: [] };
    ok("!! an identical re-upload is NOT a second run",
        phoneBucket.runs.length === 2,
        "two runs from three phone submissions: a2 repeats a1 exactly and is recognised. An accidental " +
        "double-upload must not look like two machines agreeing, which is the whole value of the count");
    ok("...and a device that CHANGES its answer appends, so the change survives",
        !!phoneBucket.runs[1] && phoneBucket.runs[1].values["q.m.f"].bits === CS.bitsOf(1.5000000000000002),
        "a driver update that moves the last bit is the interesting event. Overwriting would erase the only " +
        "evidence of it -- deviceLedger's second rule, and the reason it exists");
}

// ---- 5. THE HUB ADJUDICATES -- AND NOTHING HAS SUBMITTED ----------------------------------------------------
sec("5. *** THE GRADER WORKS ON A FIXTURE, AND THE REAL LEDGER IS EMPTY ***");
{
    const phone = { adapter: { vendor: "arm", architecture: "mali-g78" }, ua: "K" };
    let L = CS.foldSubmission(CS.emptyLedger(), CS.buildSubmission({
        ...phone, platform: "android", observables: { agree: 1.5, differ: 0.1 },
    }));
    const g = CS.gradeSubmission(L, { agree: 1.5, differ: 0.1 + Number.EPSILON * 0.1, missing: 7 });
    const verdicts = Object.fromEntries(g.rows.map((r) => [r.quantity, r.verdict]));
    ok("!! agreement, disagreement and absence are three answers, not two",
        verdicts.agree === CS.AGREE.IDENTICAL && verdicts.differ === CS.AGREE.DIFFERS &&
        verdicts.missing === CS.AGREE.ABSENT && g.settled === 1 && g.disagreeing === 1,
        JSON.stringify(verdicts) + ". A quantity the fleet did not report is not a quantity the fleet agreed " +
        "about -- folding those together is the shape sweepCoverage spent a round separating");
    const empty = CS.gradeSubmission(CS.emptyLedger(), { a: 1, b: 2 });
    ok("!! *** an EMPTY ledger answers NOT-SUBMITTED for everything, and never IDENTICAL ***",
        empty.unanswered === 2 && empty.settled === 0 && empty.devices === 0 && empty.runs === 0,
        "with no reports at all, `every` over an empty list is vacuously true and a naive grader calls that " +
        "unanimous agreement. That is the trap this row exists for: zero machines agreeing is zero machines");
    ok("!! *** AND THAT IS THE REAL STATE: NOTHING HAS SUBMITTED ***",
        P.submissionsReceived === 0 && P.kindsBeforeThisRound === 6 &&
        !fs.existsSync(path.join(HERE, "../../roundhouse", CS.CORROBORATION_FILE)),
        "no second machine has posted a corroboration report, so not one of the twenty is settled by this " +
        "round. What exists is the path and its adjudicator, exercised by fixture above. Saying so is the " +
        "difference between building a road and claiming a journey");
}

// ---- 6. WHAT THIS ROUND DID NOT DO ---------------------------------------------------------------------------
sec("6. *** THE LIMITS ***");
{
    // *** THE FIRST DRAFT OF THIS ROW WAS `... === false || true`, WHICH CANNOT FAIL. *** A check that always
    // passes is not a check, and this file is about not claiming what has not happened -- so the claim "no
    // browser half exists" is asked of the tree: no page anywhere POSTs this kind.
    const posters = (() => {
        const out = [];
        const walk = (d) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const q = path.join(d, e.name);
                if (/node_modules|[/\\]vendor[/\\]|\.git/.test(q)) continue;
                if (e.isDirectory()) walk(q);
                else if (/\.html$/.test(e.name) && fs.readFileSync(q, "utf8").includes(CS.CORROBORATION_KIND)) out.push(q);
            }
        };
        walk(path.join(HERE, "../.."));
        return out;
    })();
    ok("no page yet ASKS a device to run the observables and post them -- CHECKED, not assumed",
        posters.length === 0,
        `${posters.length} pages POST ${CS.CORROBORATION_KIND}. The endpoint accepts the kind and the grader ` +
        "folds it; what is missing is the browser half -- a page that builds the devices, collects the keyless " +
        "observables and POSTs them. That is the round that actually produces a measurement, and it needs a " +
        "device to visit it. The day one exists this row goes red and somebody deletes it, which is the right " +
        "way for a 'not done yet' to end");
    say("");
    say("NOT DONE: no measurement was produced. The twenty observables that need a second machine still");
    say("  need one, and this round did not reduce that number by one. The seven settled by construction");
    say("  were already settled -- v2889 settled them, this round only counted them. The browser half that");
    say("  would let a phone or a Steam Deck answer does not exist yet, and neither does any UI for it.");
}

// ---- v4484: THE BOUND, AND WHY IT COULD NOT BE SPENT WHERE v4480 MEANT IT TO BE ------------------------------
sec("8. *** A TOLERANCE CANNOT BE EARNED FOR A CHECK THAT GRADES ITS OWN ANSWER ***");
{
    // *** THE FINDING, READ OUT OF THE SOURCE RATHER THAN ARGUED. *** corroborateFully's criterion 4 builds the
    // device, builds it again under withPerturbedLibm, diffs the two, and grades `relMove <= tol`. Both sides
    // come from the SAME PROCESS and the SAME simulated perturbation, so a tolerance derived from that
    // measurement makes the comparison reflexive: the pass stops being contingent and the evidence string does
    // not change. v4480 wrote "earn a portability tolerance for each of the seven refinement knobs" as the next
    // round; this is that round reporting that the task, as specified, produces a check that cannot fail.
    const cfSrc = fs.readFileSync(new URL("./corroborateFully.mjs", import.meta.url), "utf8");
    // ANCHORED ON THE SECTION MARKER, NOT ON THE WORDS. My first version matched /criterion 4/ and landed on
    // the FILE HEADER's mention of v2905 fourteen hundred characters from the code -- so all three patterns
    // read a comment and the row went red about source that was exactly as described. The banner is the only
    // unambiguous start of that block.
    const c4Body = (cfSrc.match(/---- criterion 4:[\s\S]{0,1400}/) || [""])[0];
    ok("!! *** c4 grades relMove against tol, and MEASURES relMove in the same breath ***",
        /pass: d\.relMove <= tol/.test(c4Body) &&
        /withPerturbedLibm\(\(\) => dev\.build\(\{ mode \}\)\)/.test(c4Body) &&
        /diffObservables\(base, pert\)/.test(c4Body),
        "the perturbed build, the diff and the comparison are three consecutive statements. A tolerance taken " +
        "from relMove would be compared against the number it came from -- reflexive, and green forever");

    // DRIVEN, not only read: the comparison is reflexive AT EXACTLY the measured value and fails just below it.
    const q = "kepler.conserve.growthGapFrac";
    const bound = CS.predictedBound(q);
    ok("...and the comparison really is reflexive at the measured value, and only just",
        bound > 0 && bound <= bound && !(bound <= bound / 2),
        `bound ${bound.toExponential(3)}: a tol equal to it passes BY CONSTRUCTION, a tol half of it fails. ` +
        "That is the whole distance between a bar and a mirror");

    ok("!! ...so the report still refuses to grade c4, and the refusal is UNCHANGED by this round",
        DR.LAB_AT_V4480.ungradedC4 === 27 && DR.LAB_AT_V4480.observables === 27,
        `${DR.LAB_AT_V4480.ungradedC4} of ${DR.LAB_AT_V4480.observables} ungraded. v4484 does NOT grade c4 -- ` +
        "it moves the number to the one place it means something");
}

sec("9. *** WHERE THE BOUND IS SPENT: A DIFFERENCE THAT NOW HAS A SIZE ***");
{
    const C = DR.CONDITIONING_AT_V4484;
    const keys = Object.keys(C);
    ok("!! the conditioning table covers the scoped set and re-derives 8 movers of 27",
        keys.length === 27 && keys.filter((k) => C[k].moved).length === 8 &&
        keys.every((k) => C[k].moved ? C[k].relMove > 0 : C[k].relMove === 0),
        `${keys.length} observables, ${keys.filter((k) => C[k].moved).length} moved. A non-mover's bound is ` +
        "EXACTLY 0: the perturbation armed and this number did not notice, so bit identity is the prediction");

    // *** THE TWO VERDICTS DIFFERS COULD NOT TELL APART, DRIVEN THROUGH THE REAL GRADER. ***
    const q = "kepler.conserve.growthGapFrac", ours = 1, b = CS.predictedBound(q);
    const ledgerWith = (val) => ({ kind: CS.LEDGER_KIND, devices: { d1: {
        platform: "linux-x64", runs: [{ runHash: "h1", values: { [q]: { value: val, bits: CS.bitsOf(val) } } }] } } });

    const within = CS.gradeSubmission(ledgerWith(ours * (1 + b / 2)), { [q]: ours });
    const beyond = CS.gradeSubmission(ledgerWith(ours * (1 + b * 4)), { [q]: ours });
    ok("!! *** a machine landing inside the bound is WITHIN PREDICTION, not merely 'differs' ***",
        within.rows[0].verdict === CS.AGREE.WITHIN_PREDICTION && within.withinPrediction === 1 &&
        within.beyondPrediction === 0 && within.disagreeing === 1,
        `relDiff ${within.rows[0].reports[0].relDiff.toExponential(2)} against bound ${b.toExponential(2)}. ` +
        "A libm rounding one call differently is the EXPECTED case for the 20 observables that make raw " +
        "transcendental calls -- reporting it in the same word as a broken box is what this splits");
    ok("!! *** ...and one landing outside it is BEYOND PREDICTION, which is a finding about that machine ***",
        beyond.rows[0].verdict === CS.AGREE.BEYOND_PREDICTION && beyond.beyondPrediction === 1 &&
        beyond.withinPrediction === 0,
        `relDiff ${beyond.rows[0].reports[0].relDiff.toExponential(2)} against bound ${b.toExponential(2)}: ` +
        "a disagreement bigger than a coherent one-ulp shift can produce");

    // A QUANTITY PREDICTED BIT-IDENTICAL HAS BOUND 0, SO ONE ULP IS ALREADY BEYOND IT. The strongest claim in
    // the table, and the one that would be silently weakened if a bound were ever invented for a non-mover.
    const z = "lens.deflect.rMin";
    const up = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x);
                        d.setBigUint64(0, d.getBigUint64(0) + 1n); return d.getFloat64(0); };
    const zr = CS.classifyDifference(z, 1, up(1));
    ok("!! a non-mover's bound is 0, so a SINGLE ULP from another machine is already beyond it",
        CS.predictedBound(z) === 0 && zr.verdict === CS.AGREE.BEYOND_PREDICTION,
        `${z}: bound 0, one ulp away reads ${zr.verdict}. Inventing any bound here would weaken the strongest ` +
        "prediction in the table");

    // AND AN UNKNOWN BOUND KEEPS THE OLD ANSWER RATHER THAN GUESSING ONE.
    const u = CS.classifyDifference("no.such.device.field", 1, 2);
    ok("...and a quantity with NO measured bound stays plain DIFFERS rather than being graded against a guess",
        u.verdict === CS.AGREE.DIFFERS && u.bound === null,
        "an unknown bound is not a bound. This is the fallback that stops the new axis quietly becoming a " +
        "licence to grade everything");

    // *** THE NON-FINITE GUARD IS A NO-OP ON THE VERDICT, AND A SABOTAGE ESTABLISHED THAT RATHER THAN AN
    // ARGUMENT. *** Deleting it went 0 RED against the first version of this row, which asserted the verdict
    // alone: NaN <= bound is already false, so a non-finite lands BEYOND by the ordinary comparison and the
    // guard changes nothing about the answer. What it DOES change is the REPORT -- without it the row carries
    // relDiff: NaN, and a number that is not a number printed where a magnitude belongs is how a reader learns
    // to distrust the whole column. So the row asserts what the guard actually buys.
    const nf = CS.classifyDifference(q, 1, NaN);
    ok("!! ...and a non-finite submitted value is beyond ANY bound, and says so INSTEAD of reporting NaN",
        nf.verdict === CS.AGREE.BEYOND_PREDICTION && nf.relDiff === null && /non-finite/.test(nf.note || ""),
        `verdict ${nf.verdict}, relDiff ${nf.relDiff}, note ${JSON.stringify(nf.note)}. The VERDICT survives ` +
        "without the guard (NaN <= bound is false either way, measured by sabotage); the reported magnitude " +
        "does not, and a NaN in a magnitude column is worse than no column");

    // *** AND NOTHING HAS SUBMITTED, WHICH THIS ROUND DOES NOT LET THE NEW COLUMNS IMPLY. ***
    const empty = CS.gradeSubmission({ kind: CS.LEDGER_KIND, devices: {} }, { [q]: 1 });
    ok("!! *** the real ledger is still EMPTY: every new column reads zero on it ***",
        empty.rows[0].verdict === CS.AGREE.NOT_SUBMITTED && empty.withinPrediction === 0 &&
        empty.beyondPrediction === 0 && empty.devices === 0,
        "every number in section 9 comes from a FIXTURE. No machine has posted a corroboration report, so this " +
        "round adds a verdict nothing has yet earned -- and says so here rather than letting a green gate imply " +
        "otherwise");
}

console.log();
if (fails) { console.log("corroborationSubmit-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("corroborationSubmit-selfcheck: all checks pass");
