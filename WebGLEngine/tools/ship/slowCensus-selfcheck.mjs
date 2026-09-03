#!/usr/bin/env node
// tools/ship/slowCensus-selfcheck.mjs -- v4424
//
// Run: node tools/ship/slowCensus-selfcheck.mjs      (pure: reads frozen measurements, runs no gates)
//
// *** THE SHIP GATE WAVES SIXTY-THREE GATES THROUGH FOR WANT OF EVIDENCE, AND THE TREE HAS THE EVIDENCE. ***
//
// tools/ship/verify.mjs's last check is "no gate outside the red register is red". redRegister() builds that
// register, and sixty-nine per cent of it -- 63 of 91 gates -- is there under the reason
// "redCensus.UNCONFIRMED_SLOW", which redCensus.mjs is careful to say means NOT red and NOT green but
// UNMEASURED. And redCensus.SLOW_PARTIAL, in the same file, already held NINETEEN GREEN VERDICTS for gates on
// that list. THE THING THAT GRANTS THE EXEMPTION AND THE THING THAT RESOLVES IT ARE TWO OBJECTS IN ONE FILE,
// and only one of them is read.
//
// ---- *** EXEMPT TWICE OVER, AND NEITHER LAYER KNOWS THEY ARE GREEN *** ----------------------------------------
//
// The register is the second layer. The first is selectGates(): a gate whose last observed time is over the
// 3 s ship-time budget is never run at all, and all sixty-three sit at 20 s in sweep-timings.json. That 20 s
// is the sweep's CAP, not a runtime -- alongside exit code 124, "gave up", written into the field a reader
// takes for what the gate returned. Measured serially, the finished ones take 1.6x to 7.6x that, median 3.2x.
// *** AND THE DECISION IT FEEDS IS STILL RIGHT, WHICH IS EXACTLY WHY NOBODY NOTICED: *** a lower bound of 20 s
// is over a 3 s budget however far above the cap the truth is, and the file's own note scopes itself to that
// one use. What is measured here is the size of the gap it is being honest about.
//
// ---- *** WHAT THE RE-MEASUREMENT FOUND, ONE GATE AT A TIME ON AN IDLE BOX *** ---------------------------------
//
// SUMMARY-PENDING
//
// The first attempt was the mistake redCensus.mjs's own header warns about -- its 8-way sweep called forty-six
// gates red and seven were green alone, "starved by the other seven workers" -- and I made it anyway: four
// workers at a 30 s cap, eight timeouts in the first eight gates, killed. It is in PROTOCOL.abandoned rather
// than deleted.
//
// *** THE RUNTIMES REPRODUCE IN THE ORDERING AND NOT IN THE MAGNITUDE, AND ONLY ONE OF THOSE IS ABOUT THE
// GATES. *** RATIO-PENDING
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import { redRegister, selectGates, readTimings, DEFAULTS } from "./quickSweep.mjs";
import { UNCONFIRMED_SLOW, SLOW_PARTIAL } from "./redCensus.mjs";
import {
    MEASURED_V4424, PROTOCOL, DECIDED, V4279_CAP_MS, SERIAL_CAP_MS,
    EXEMPT_AT_V4424, UNMEASURED_AT_V4424, capRecordedAsTime,
    agreementWith, scaleRatios, spearman, exemptedButMeasured, fitsUnderCap, summarise,
    stillUnmeasured, medianOf, runGateSerial,
} from "./slowCensus.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("\n1. *** THE SHIP GATE EXEMPTS SIXTY-THREE GATES BECAUSE NOBODY MEASURED THEM ***");
{
    const reg = redRegister();
    const exempt = [...reg].filter(([, why]) => why === "redCensus.UNCONFIRMED_SLOW").map(([g]) => g);
    report(`${exempt.length} of the ${reg.size} gates on quickSweep's register are there for being UNMEASURED, ` +
        `not for any recorded failure -- ${(100 * exempt.length / reg.size).toFixed(0)}% of the register`);
    // *** A CEILING, NOT AN EQUALITY. *** Asserting "63 are exempt" would go red the day somebody fixes it.
    ok("*** gates waved past the ship gate for absence of evidence: a ceiling that a repair passes ***",
        exempt.length <= EXEMPT_AT_V4424, `${exempt.length} <= ${EXEMPT_AT_V4424} at v4424`);
    ok("  and every one of them really is in the bucket the census named",
        exempt.every((g) => UNCONFIRMED_SLOW.includes(g)),
        "vacuously true once the exemption is removed, which is the point of stating it this way");
    ok("  the reason is absence of evidence, not evidence of absence",
        exempt.length === 0 || /UNCONFIRMED_SLOW$/.test(reg.get(exempt[0])),
        "redCensus.mjs is explicit that the bucket is NOT red and NOT green");
}

console.log("\n2. *** THE EXEMPTION SURVIVED ITS OWN RESOLUTION ***");
{
    const reg = redRegister();
    const both = exemptedButMeasured(reg);
    // *** REPORTED, NEVER ASSERTED. *** This number rises when somebody measures more of the bucket and falls
    // when somebody repairs the register, so a bound in either direction punishes one of the two things a
    // later round could do about it. The monotone quantities are gated in sections 1 and 6 instead.
    report(`*** ${both.length} GATES THE SHIP GATE CALLS UNMEASURED HAVE A GREEN VERDICT ON RECORD IN THIS TREE ***`);
    ok("  every one of them is green on every record it appears in", both.every((b) => b.verdicts.every((v) => v === "GREEN")),
        "a green-on-record gate exempted as unmeasured is the exemption outliving the reason for it");
    // *** ABOUT THE FILE, NOT ABOUT THE REGISTER. *** Phrasing this against redRegister() would make it fail
    // the day somebody repairs redRegister, which is the shape of a gate that punishes its own fix.
    const partialGreens = Object.entries(SLOW_PARTIAL).filter(([, v]) => v.verdict === "GREEN").map(([g]) => g);
    ok("  redCensus.mjs held green verdicts for gates on its own unmeasured list before this round ran one",
        partialGreens.length > 0 && partialGreens.every((g) => UNCONFIRMED_SLOW.includes(g)),
        `${partialGreens.length} green verdicts in SLOW_PARTIAL, every one for a gate in UNCONFIRMED_SLOW -- ` +
        "two objects in one file and only one of them is read");
    // *** THE FUNCTION HAS TO BE ABLE TO RETURN NOTHING, OR IT IS NOT LOOKING AT THE REGISTER. ***
    const empty = exemptedButMeasured(new Map());
    ok("  exemptedButMeasured reads the register rather than the verdicts", empty.length === 0,
        "an empty register yields nothing, so a later round that teaches redRegister to read the verdicts " +
        "turns this finding off instead of leaving it asserting a fixed number");
    const wrongReason = new Map([[UNCONFIRMED_SLOW[0], "redCensus.RED_AT_V4279"]]);
    ok("  and it only counts gates exempted for BEING UNMEASURED", exemptedButMeasured(wrongReason).length === 0,
        "a gate on the register for a recorded red is not this bug");
    // *** EVERY REAL RECORD HERE IS GREEN, SO "all green" AND "any green" ARE THE SAME FUNCTION ON THIS DATA.
    // A gate green in one run and red in another is not a resolved exemption -- it is a worse problem -- and
    // nothing in the measurements can say so, so the fixture says it. ***
    const disputed = new Map([[UNCONFIRMED_SLOW[0], "redCensus.UNCONFIRMED_SLOW"]]);
    const split = [{ [UNCONFIRMED_SLOW[0]]: { verdict: "GREEN", ms: 1 } },
                   { [UNCONFIRMED_SLOW[0]]: { verdict: "RED", ms: 1 } }];
    ok("  a gate green in one record and red in another is NOT counted as resolved",
        exemptedButMeasured(disputed, split).length === 0,
        "all-green and any-green agree on every real record, so the distinction needs a fixture to exist at all");
    ok("  and green in both records is", exemptedButMeasured(disputed, [split[0], split[0]]).length === 1);
    report("NOT FIXED HERE. Teaching redRegister() to read SLOW_PARTIAL and MEASURED_V4424 is a decision " +
        "about what 'already on the record' means, and making it inside the round that measured the gates " +
        "would repeat the move that built the hole -- granting and resolving in one file with nothing between.");
}

console.log("\n3. *** RE-MEASURED ONE AT A TIME, AND EVERY COMPARABLE VERDICT AGREED ***");
{
    const by = summarise(MEASURED_V4424);
    report(`${Object.keys(MEASURED_V4424).length} of ${UNCONFIRMED_SLOW.length} run serially at a ${SERIAL_CAP_MS / 1000}s cap: ` +
        Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", "));
    ok("*** zero red ***", !Object.values(MEASURED_V4424).some((m) => m.verdict === "RED"),
        "the bucket has been hiding successes, not failures");
    ok("*** zero crash ***", !Object.values(MEASURED_V4424).some((m) => m.verdict === "CRASH"),
        "a non-zero exit with no checks printed is a crash and would be counted separately");
    const a = agreementWith(SLOW_PARTIAL, MEASURED_V4424);
    ok("*** nothing contradicts the v4279 serial record ***", a.contradict.length === 0,
        `${a.agree.length} agreements, ${a.consistentTimeouts.length} timeouts consistent with a slower record, ` +
        `${a.novel.length} with no decided verdict before now`);
    ok("  and there WERE comparisons to make", a.agree.length >= 10,
        "an agreement count of zero would mean the two runs never met, not that they agreed");
    for (const t of a.consistentTimeouts) {
        ok(`  ${t.gate.replace(/-selfcheck\.mjs$/, "")} ran past ${SERIAL_CAP_MS / 1000}s and v4279 recorded ${(t.wasMs / 1000).toFixed(0)}s`,
            !(DECIDED.includes(t.was) && t.wasMs <= SERIAL_CAP_MS), `was ${t.was}`);
    }
}

console.log("\n4. *** THE COMPARATOR CAN DISAGREE, WHICH IS THE ONLY REASON ITS AGREEMENT MEANS ANYTHING ***");
{
    const flipped = {};
    for (const [g, m] of Object.entries(MEASURED_V4424)) flipped[g] = m.verdict === "GREEN" ? { ...m, verdict: "RED" } : m;
    const bad = agreementWith(SLOW_PARTIAL, flipped);
    ok("*** a green-on-record gate coming back RED is a contradiction ***", bad.contradict.length > 0,
        `${bad.contradict.length} contradictions when every green is flipped`);
    // A recorded green that used to finish INSIDE this cap and now does not is also a disagreement.
    const fast = { "x-selfcheck.mjs": { verdict: "GREEN", ms: 50000 } };
    const slowNow = { "x-selfcheck.mjs": { verdict: "TIMEOUT", ms: SERIAL_CAP_MS } };
    ok("  and so is a gate that used to finish inside this cap and no longer does",
        agreementWith(fast, slowNow).contradict.length === 1, "50s recorded, timed out at 180s");
    const slowBefore = { "x-selfcheck.mjs": { verdict: "GREEN", ms: 300000 } };
    ok("  while a gate that was already slower than this cap is not disagreeing about anything",
        agreementWith(slowBefore, slowNow).contradict.length === 0 &&
        agreementWith(slowBefore, slowNow).consistentTimeouts.length === 1,
        "300s recorded, timed out at 180s -- the two runs never overlapped");
}

console.log("\n5. *** THE RUNTIMES REPRODUCE IN THE ORDERING, NOT IN THE MAGNITUDE ***");
{
    const rs = scaleRatios(SLOW_PARTIAL, MEASURED_V4424);
    const ratios = rs.map((r) => r.ratio);
    const med = medianOf(ratios);
    report(`${rs.length} gates green in both runs: ratio now/then min ${Math.min(...ratios).toFixed(3)}, ` +
        `median ${med.toFixed(3)}, max ${Math.max(...ratios).toFixed(3)}`);
    ok("*** every one came back faster, which is reported and NOT gated ***", ratios.every((r) => r < 1),
        "a uniform shift is a fact about the box, not about the gates, and nothing here separates them");
    const pairs = agreementWith(SLOW_PARTIAL, MEASURED_V4424).agree.filter((x) => x.verdict === "GREEN");
    ok("  spearman is signed and saturating on hand-made input",
        spearman([1, 2, 3, 4], [1, 2, 3, 4]) === 1 && spearman([1, 2, 3, 4], [4, 3, 2, 1]) === -1 &&
        spearman([1, 2], [2, 1]) === null,
        "+1 for the same order, -1 for the reverse, null below three points where the formula divides by zero");
    const rho = spearman(pairs.map((p) => p.wasMs), pairs.map((p) => p.nowMs));
    ok("*** what IS about the gates is the ordering, and it survives ***", rho > 0.8,
        `Spearman rho ${rho.toFixed(3)} over ${pairs.length} gates and ${145} rounds`);
    // If one global scale explained everything, the residual would be noise. It is not.
    let worst = { rel: 0, gate: "" };
    for (const p of pairs) {
        const rel = Math.abs(p.nowMs - p.wasMs * med) / (p.wasMs * med);
        if (rel > worst.rel) worst = { rel, gate: p.gate };
    }
    ok("  and one global scale does NOT explain it either", worst.rel > 0.2,
        `worst residual ${(worst.rel * 100).toFixed(1)}% at ${worst.gate.replace(/-selfcheck\.mjs$/, "")}`);
}

console.log("\n6. *** THEY WERE NEVER TOO SLOW FOR THE CAP THAT BUCKETED THEM ***");
{
    const f = fitsUnderCap(MEASURED_V4424, V4279_CAP_MS);
    const decidedCount = Object.values(MEASURED_V4424).filter((m) => DECIDED.includes(m.verdict)).length;
    ok("  the denominator is gates that FINISHED, not gates that were run",
        f.decided === decidedCount && f.decided < Object.keys(MEASURED_V4424).length,
        `${f.decided} decided of ${Object.keys(MEASURED_V4424).length} run -- counting a timeout as "not under the cap" ` +
        "would be true and would answer a different question");
    ok(`*** most gates the v4279 sweep could not finish in ${V4279_CAP_MS / 1000}s finish in under it alone ***`,
        f.inside > f.decided / 2, `${f.inside} of ${f.decided} decided gates under ${V4279_CAP_MS / 1000}s`);
    ok("  medianOf answers an empty list with null, not with a number",
        medianOf([]) === null && medianOf([3, 1, 2]) === 2 && medianOf([4, 1, 2, 3]) === 2.5,
        "zero is a measurement; absence is not");
    report("So the bucket was about the sweep being EIGHT-WAY, not about the gates being slow. redCensus.mjs " +
        "said as much about its red set -- seven of forty-six were starved green -- and the same contention " +
        "put these in a bucket that then became a standing exemption.");
    const still = stillUnmeasured();
    ok("*** and the round does not empty the bucket ***", still.length > 0,
        `${still.length} of ${UNCONFIRMED_SLOW.length} still have no decided verdict from any run`);
    // *** THE RATCHET THAT POINTS THE RIGHT WAY. *** Measuring only ever shrinks this; nothing but deleting a
    // record can grow it. Section 2's headline moves the other way under the same work, which is why it is
    // reported rather than bounded.
    ok("  the unmeasured third state may shrink and may not grow", still.length <= UNMEASURED_AT_V4424,
        `${still.length} <= ${UNMEASURED_AT_V4424} at v4424`);
    ok("  every one of those is still in UNCONFIRMED_SLOW", still.every((g) => UNCONFIRMED_SLOW.includes(g)),
        "unmeasured stays a third state; rounding it off either way is how this bucket was born");
    // *** HAVING A RECORD IS NOT HAVING A VERDICT, AND THE SEVEN TIMEOUTS ARE WHERE THAT BITES. *** They are
    // in MEASURED_V4424 with a time and a name and no answer; counting them as measured would empty a third
    // of the bucket by writing down that nothing was learned.
    const timedOut = Object.entries(MEASURED_V4424).filter(([, m]) => m.verdict === "TIMEOUT").map(([g]) => g);
    const noVerdictAnywhere = timedOut.filter((g) => !(SLOW_PARTIAL[g] && DECIDED.includes(SLOW_PARTIAL[g].verdict)));
    ok("  a gate this round RAN and could not finish is still unmeasured", noVerdictAnywhere.length > 0 &&
        noVerdictAnywhere.every((g) => still.includes(g)),
        `${noVerdictAnywhere.length} of ${timedOut.length} that hit the ${SERIAL_CAP_MS / 1000}s cap have no verdict anywhere`);
    ok("  while one that v4279 DID finish, slower than this cap, stays measured",
        timedOut.some((g) => SLOW_PARTIAL[g] && DECIDED.includes(SLOW_PARTIAL[g].verdict) && !still.includes(g)),
        "this run learning nothing about a gate does not unlearn what an earlier run knew");
}

console.log("\n7. *** EXEMPT TWICE OVER, AND THE SECOND LAYER RECORDS A CAP AS A TIME ***");
{
    const prior = readTimings();
    const sel = selectGates(UNCONFIRMED_SLOW, prior.timings || {}, DEFAULTS.budgetMs);
    ok("*** the register is the SECOND exemption -- the budget skips these gates before it is consulted ***",
        sel.run.length === 0 && sel.skipped.length === UNCONFIRMED_SLOW.length,
        `${sel.skipped.length} of ${UNCONFIRMED_SLOW.length} skipped over a ${DEFAULTS.budgetMs}ms budget; ${sel.run.length} run`);
    const cap = capRecordedAsTime(prior.timings || {});
    const rec = cap.map((c) => c.recorded);
    // *** A GATE THAT TIMED OUT HERE TOO HAS THE SAME PROBLEM AND IS NOT EVIDENCE ABOUT ITS SIZE. *** Its
    // 180 s is this run's cap, so folding it in would compare one cap against another and call it a ratio.
    ok("  the understatement is measured only where a gate actually FINISHED",
        cap.length === Object.values(MEASURED_V4424).filter((m) => DECIDED.includes(m.verdict)).length &&
        cap.every((c) => c.measured < SERIAL_CAP_MS),
        `${cap.length} finished; the ${Object.keys(MEASURED_V4424).length - cap.length} that did not would ` +
        "contribute this run's cap divided by that one's");
    ok("  what the timings file records for them is the sweep's 20s CAP, not their runtime",
        cap.length > 0 && rec.every((r) => r >= 20000 && r < 21000),
        `${cap.length} decided gates, every recorded value inside [20000, 21000)`);
    const codes = prior.codes || {};
    ok("  and the recorded exit code is 124 -- gave up -- in the field a reader takes for what the gate returned",
        cap.every((c) => codes[c.gate] === 124),
        `${cap.filter((c) => codes[c.gate] === 124).length} of ${cap.length} recorded as exit 124; every one exits 0 when allowed to finish`);
    const u = cap.map((c) => c.understatedBy).sort((a, b) => a - b);
    ok("*** so the file understates these gates by a factor it cannot know ***", u[0] > 1.5,
        `understated ${u[0].toFixed(2)}x to ${u[u.length - 1].toFixed(2)}x, median ${medianOf(u).toFixed(2)}x`);
    report("AND THE DECISION IT FEEDS IS STILL RIGHT, WHICH IS WHY NOBODY NOTICED: a lower bound of 20s is " +
        "already over a 3s budget, so 'skip' is correct however far above the cap the truth is. The file's " +
        "own note scopes itself to exactly that use. This measures the size of the gap it is honest about.");
    // A cap recorded as a time is only harmless while the budget stays below the cap.
    const raised = selectGates(UNCONFIRMED_SLOW, prior.timings || {}, 25000);
    ok("  a budget raised past the cap would run all of them and read 20s where the truth is up to 3 minutes",
        raised.run.length === UNCONFIRMED_SLOW.length,
        `at a 25000ms budget all ${raised.run.length} become eligible, on a number that means "at least 20s"`);
}

console.log("\n8. *** THE PROTOCOL RECORDS THE ATTEMPT THAT DID NOT WORK ***");
{
    ok("*** serial, one worker ***", PROTOCOL.workers === 1 && PROTOCOL.capMs === SERIAL_CAP_MS);
    ok("  the abandoned parallel attempt is named, with its result", /8 timeouts in the first 8/.test(PROTOCOL.abandoned),
        "4 workers at a 30s cap, killed -- exactly the failure redCensus.mjs's header warns about");
    ok("  and a CRASH is distinguished from a RED in the runner itself", /CRASH/.test(PROTOCOL.note),
        "a non-zero exit having printed no checks is a broken gate, not a caught fault");
    ok("  the runner is exported so a later round repeats the measurement rather than trusting it",
        typeof runGateSerial === "function");
}

console.log(`\n${fails ? "FAIL" : "ALL GREEN"} -- ${fails} failure(s)`);
process.exit(fails ? 1 : 0);
