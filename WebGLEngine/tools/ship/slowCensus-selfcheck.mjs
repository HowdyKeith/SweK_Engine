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
import fs from "node:fs";
import path from "node:path";
import { ENG } from "./slowCensus.mjs";
import { redRegister, selectGates, readTimings, DEFAULTS } from "./quickSweep.mjs";
import { enumerateGates } from "./gateSweep.mjs";
import { UNCONFIRMED_SLOW, SLOW_PARTIAL, RED_AT_V4424, RECHECK_V4313, RECHECK_V4314, FIXED_SINCE_V4279 } from "./redCensus.mjs";
import {
    MEASURED_V4424, PROTOCOL, DECIDED, V4279_CAP_MS, SERIAL_CAP_MS,
    EXEMPT_AT_V4424, UNMEASURED_AT_V4424, capRecordedAsTime, redsFound, ORPHAN_RATCHET, budgetSkip, RED_OUTSIDE_THE_BUCKET,
    agreementWith, scaleRatios, spearman, exemptedButMeasured, fitsUnderCap, summarise,
    stillUnmeasured, medianOf, runGateSerial,
} from "./slowCensus.mjs";
import { REGISTER_AUDIT } from "./register-audit.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("\n1. *** THE SHIP GATE EXEMPTED SIXTY-THREE GATES BECAUSE NOBODY MEASURED THEM ***");
{
    const reg = redRegister();
    const exempt = [...reg].filter(([, why]) => why === "redCensus.UNCONFIRMED_SLOW").map(([g]) => g);
    report(`${exempt.length} of the ${reg.size} gates on quickSweep's register are there for being UNMEASURED, ` +
        `not for any recorded failure -- ${(100 * exempt.length / reg.size).toFixed(0)}% of the register. It was ` +
        `${exempt.length + RED_AT_V4424.length} before this round measured three of them red and filed them as red.`);
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
    // *** THE CLAIM THIS ROUND WROTE DOWN AT FORTY-THREE GATES AND THEN REFUTED AT SIXTY-THREE. ***
    const r = redsFound();
    ok("*** THREE RED, and the first forty-three measured were all green ***", r.gates.length === 3,
        r.gates.map((x) => x.replace(/-selfcheck\.mjs$/, "").replace(/^tools\/ship\//, "")).join(", ") +
        " -- red and exempt from the ship gate for 145 rounds");
    // *** v4536 -- AND `fails` JOINED `ms` IN ANSWERING null HONESTLY, WHICH CRASHED THIS LINE. *** The note
    // immediately below records the identical fault being repaired for `ms` at v4471: "the register honestly
    // answers null and the check compared null to a number". `fails` was exempt only because the audit was
    // FILING A FRAGMENT AS A VERDICT -- a gate killed at the audit's 120 s cap had still printed some of its
    // output, and freezeRegisterAudit took the first FAIL line out of that partial run and recorded it as the
    // failing line. v4536 stopped doing that, because a timeout is a bound and not a verdict, and doorKinds --
    // which the audit cannot reach, WHICH IS WHY IT WAS UNMEASURED IN THE FIRST PLACE -- now answers null.
    //
    // So the row is split along the line the register actually draws. A `why` is owed by EVERY entry: it is
    // written by a person and no cap can prevent it. A filed LINE is owed only where a run produced one, and
    // where it did not, the gate is NAMED here rather than demanded of. Read defensively, because a detail
    // string that assumes the field exists is how this file would report a crash as a clean zero.
    const noLine = RED_AT_V4424.filter((e) => !e.fails);
    const whyMissing = RED_AT_V4424.filter((e) => !e.why || String(e.why).length <= 60);
    const shortLine = RED_AT_V4424.filter((e) => e.fails && String(e.fails).length <= 40);
    ok("  every one of them is FILED, with its reason, and with its failing line where a run produced one",
        r.filed.length === r.gates.length && whyMissing.length === 0 && shortLine.length === 0 &&
        noLine.length < RED_AT_V4424.length,
        `${r.filed.length} of ${r.gates.length} in redCensus.RED_AT_V4424, each with why it fails` +
        (noLine.length
            ? `. ${noLine.map((e) => e.gate.replace(/^tools\/ship\//, "").replace(/-selfcheck\.mjs$/, "")).join(", ")} ` +
              "carries NO filed line and is not asked for one: the audit's cap does not reach it, which is the " +
              "same reason it was in the unconfirmed bucket to begin with. A BOUND IS NOT A VERDICT, and " +
              "before v4536 this field held a fragment printed before the kill"
            : ", each with the check that fails"));
    // *** v4471 -- THIS READ RED_AT_V4424's `ms` AND THAT FIELD IS null BY CONSTRUCTION FOR THESE THREE. ***
    // The v4430 census makes `ms` a getter over tools/ship/register-audit.mjs, which is right for a register
    // whose readings should come from a run rather than from a typed literal -- and the audit's cap does not
    // reach these gates, WHICH IS THE REASON THEY WERE UNMEASURED IN THE FIRST PLACE. So the register honestly
    // answers null and the check compared null to a number. The times are read from MEASURED_V4424 now: the
    // thing that measured them is the thing that should be asked.
    const serial = redsFound().gates.map((g) => MEASURED_V4424[g]);
    ok("  none of them is a timing failure",
        serial.length > 0 && serial.every((m) => m && m.ms < SERIAL_CAP_MS && m.ms > 60000),
        serial.map((m) => (m.ms / 1000).toFixed(0) + "s").join(", ") + " alone on an idle box, exit 1 -- they " +
        "would fail at any cap that let them finish");
    // *** AND THIS CHECK WAS WRITTEN THE OTHER WAY ROUND AN HOUR AGO, WHICH IS WORTH KEEPING. *** It asserted
    // the register answered `null` for these three and called that the honest answer -- true at the time, and
    // true only because freezeRegisterAudit.mjs had never been told about a third register. The claim was a
    // description of a gap dressed as a property. Teaching the audit (v4471) ran them at a raised cap and the
    // readings became DERIVED, which falsified my own assertion by repairing the thing it described.
    // *** v4536 -- AND `derived` MEANS TWO THINGS, WHICH ONLY SHOWED WHEN ONE OF THEM STOPPED BEING TRUE. ***
    // redCensus defines it as "the audit produced a failing LINE for this gate", and this row read it as "the
    // audit RAN this gate". Those came apart the moment freezeRegisterAudit stopped filing a fragment printed
    // before a kill as the verdict: doorKinds is run by the audit, hits the 120 s cap, and now yields no line
    // -- so it RAN and is not DERIVED, and asserting both of one flag turned a correct repair into a red.
    // What is asserted is what the register can actually answer: every entry has an audit row, so no reading
    // here is a typed literal; a gate that finished carries a line and a real time; a gate that hit the cap
    // carries a BOUND, and is named as one rather than counted as a measurement.
    const auditOf = (g) => REGISTER_AUDIT.rows.find((r) => r.gate === g);
    const ran = RED_AT_V4424.filter((e) => !!auditOf(e.gate));
    const capped = RED_AT_V4424.filter((e) => { const r = auditOf(e.gate); return r && r.exit === "timeout"; });
    const finished = RED_AT_V4424.filter((e) => !capped.includes(e));
    ok("  ...and every reading comes from a run rather than a typed literal -- with a CAP named as a bound",
        ran.length === RED_AT_V4424.length &&
        finished.every((e) => e.derived === true && e.ms > 60000) &&
        capped.every((e) => { const r = auditOf(e.gate); return r.ms >= REGISTER_AUDIT.capMs && !r.first; }),
        `${ran.length} of ${RED_AT_V4424.length} have an audit row. ` +
        finished.map((e) => e.gate.replace(/^tools\/ship\//, "").replace(/-selfcheck\.mjs$/, "") +
                            " " + (e.ms / 1000).toFixed(0) + "s").join(", ") +
        (capped.length
            ? `; ${capped.map((e) => e.gate.replace(/^tools\/ship\//, "").replace(/-selfcheck\.mjs$/, "")).join(", ")} ` +
              `hit the ${REGISTER_AUDIT.capMs / 1000}s cap -- A BOUND, NOT A READING, and carries no failing ` +
              "line for the same reason"
            : "") +
        ". Until v4471 this read null, because the audit covered two registers and there are three");
    ok("*** zero crash ***", !Object.values(MEASURED_V4424).some((m) => m.verdict === "CRASH"),
        "a non-zero exit with no checks printed is a crash and would be counted separately -- which also " +
        "means the check counter's undercount on the second house style changed no verdict here");
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

console.log("\n3b. *** ONE OF THE THREE IS A RATCHET THIS SESSION HAS BEEN BREAKING ***");
{
    const O = ORPHAN_RATCHET;
    report(`${O.gate.replace(/-selfcheck\.mjs$/, "")}: modules that export functions nothing calls. ` +
        `Baseline ${O.baseline} at ${O.baselineRound}; now ${O.now}.`);
    ok("*** and this arc's own rounds are in the overrun ***",
        O.fromThisArc.length > 0 && O.now > O.baseline,
        `${O.fromThisArc.length} of them shipped in v4416-v4423: ` + O.fromThisArc.join(", "));
    ok("  every one of those files is really in the tree, gate-only, and named here rather than inferred",
        O.fromThisArc.every((f) => fs.existsSync(path.join(ENG, f))),
        "a claim about my own debt that named a file the tree does not have would be worse than no claim");
    ok("*** and the baseline is NOT moved ***", O.baseline === 93 && /grievance list/.test(O.note),
        "raising 93 to 145 would turn a ratchet into a record of having given up");
    report("Every round from v4408 to v4424 reported ALL GREEN, truthfully -- verify.mjs runs a different " +
        "and much smaller set, and this gate was in the bucket. THE EXEMPTION IS WHAT MADE THE ALL GREEN " +
        "TRUE AND USELESS AT THE SAME TIME.");
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
        `${cap.filter((c) => codes[c.gate] === 124).length} of ${cap.length} recorded as exit 124 -- allowed to finish, ` +
        `${cap.length - redsFound().gates.length} exit 0 and ${redsFound().gates.length} exit 1, and 124 is neither`);
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

console.log("\n7b. *** THE BUCKET IS THE NAMED PART OF A MUCH LARGER UNNAMED ONE ***");
{
    const prior = readTimings();
    const b = budgetSkip(enumerateGates(ENG), prior.timings || {}, redRegister(), DEFAULTS.budgetMs, prior.codes || {});
    report(`the ship gate runs ${b.run} of ${b.enumerated} gates; ${b.skipped} are skipped over the ` +
        `${DEFAULTS.budgetMs}ms budget, and ${b.skippedUnregistered} of those are on NO register at all -- ` +
        `not red, not green, not even filed as unmeasured. ${b.skippedAtCap} carry a recorded exit code of 124.`);
    ok("*** the 63 are the part that at least has a list ***", b.skippedUnregistered > UNCONFIRMED_SLOW.length,
        `${b.skippedUnregistered} skipped-and-unregistered against ${UNCONFIRMED_SLOW.length} named in the bucket`);
    ok("  and the arithmetic is the sweep's own, not a second count of the tree",
        b.run + b.skipped === b.enumerated, `${b.run} + ${b.skipped} = ${b.enumerated}`);
    // *** "SKIPPED" AND "SKIPPED AND UNACCOUNTED FOR" ARE TWO NUMBERS AND ONLY THE SECOND IS THE FINDING. ***
    // Reporting the first under the second's name would still clear a floor and still be wrong, so the
    // difference is checked against the register directly.
    const regd = redRegister();
    const skippedOnRegister = enumerateGates(ENG)
        .filter((x) => (prior.timings || {})[x] > DEFAULTS.budgetMs && regd.has(x)).length;
    ok("  the unregistered count is the skipped count MINUS the ones the register accounts for",
        b.skippedUnregistered === b.skipped - skippedOnRegister && skippedOnRegister > 0,
        `${b.skipped} skipped - ${skippedOnRegister} on the register = ${b.skippedUnregistered}`);
    const R = RED_OUTSIDE_THE_BUCKET;
    ok("*** and one gate outside the bucket, run for an unrelated reason, was RED ***",
        !R.onRegister && !R.inBucket && R.recordedCode === 124,
        `${R.gate.replace(/-selfcheck\.mjs$/, "")} -- on no register, over the budget, broken by ${R.brokenBy} ` +
        `and unnoticed for ${R.roundsUnnoticed} rounds`);
    ok("  it was broken by one of this session's OWN rounds, and it is FIXED rather than filed",
        /^v44/.test(R.brokenBy) && /number/.test(R.fix),
        "a regex meaning 'at or before v4313' that knew only rounds beginning v43; it reads the version as a number now");
    // *** THE REPAIR ITSELF, ASSERTED RATHER THAN DESCRIBED. *** The gate that catches this takes ten minutes;
    // the property it checks costs nothing, so it is checked here too and a round need not wait to find out.
    for (const K of [RECHECK_V4313, RECHECK_V4314]) {
        ok(`  ${K.at}'s record names exactly as many now-green gates as it counts`,
            K.nowGreen === K.nowGreenGates.length, `${K.nowGreen} against ${K.nowGreenGates.length}`);
    }
    const later = FIXED_SINCE_V4279.filter((e) => { const m = /^v(\d+)/.exec(e.round); return m && Number(m[1]) > 4313; });
    ok("  and a repair from a LATER round stays out of an earlier round's record",
        later.length > 0 && later.every((e) => !RECHECK_V4313.nowGreenGates.includes(e.gate)),
        `${later.length} entries stamped after v4313, including ${later.map((e) => e.round).join(", ")}`);
    report("THIS IS AN ANECDOTE ABOUT THE 437 AND NOT A RATE. The gate was run because it is this round's own " +
        "dependency, not because anything sampled the skipped set. What the 437 hold is unknown, and saying " +
        "so is the whole habit this round is about.");
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
