#!/usr/bin/env node
// WebGLEngine/tools/ship/redCensus-selfcheck.mjs -- v4279
//
// GRADES tools/ship/redCensus.mjs BY RE-RUNNING EVERY GATE IT NAMES.
//
// *** THIS GATE IS RED WHEN THE CENSUS IS WRONG, IN EITHER DIRECTION, AND BOTH DIRECTIONS HAVE HAPPENED. ***
// A gate listed as red that has been FIXED makes this red -- the list must shrink deliberately, by someone
// deleting the line, rather than rot into a set of accusations against working code. That is precisely what
// gate-timings.json's `failingAt` did: thirteen of its nineteen entries were green and it never noticed,
// because nothing ever re-ran them.
//
// What this canNOT see is a gate going red that is not on the list. That needs the full 1,348-gate sweep,
// which costs about 25 minutes and does not belong inside a gate. The closing note says so plainly rather
// than letting "the census is green" be mistaken for "the tree is green".
"use strict";
import fs from "node:fs";
import path from "node:path";
import { RED_AT_V4279, RECORDED_BUT_GREEN, FIXED_AT_V4279, FIXED_AT_V4304, METHOD, runGate, censusCostMs, ENG,
         UNCONFIRMED_SLOW, SLOW_PARTIAL } from "./redCensus.mjs";

let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);

console.log("redCensus-selfcheck -- what is actually red, re-measured rather than remembered\n");

console.log("1. *** THE CENSUS IS A MEASUREMENT, AND EVERY ENTRY CARRIES WHAT IT COST TO TAKE ***");
{
    ok("the census names a red set", RED_AT_V4279.length > 0, RED_AT_V4279.length + " gates");
    ok("every entry names a gate FILE that exists on disk",
        RED_AT_V4279.every((e) => fs.existsSync(path.join(ENG, e.gate))),
        RED_AT_V4279.filter((e) => !fs.existsSync(path.join(ENG, e.gate))).map((e) => e.gate).join(" ") || "all present");
    ok("every entry records WHAT fails, not merely that something does",
        RED_AT_V4279.every((e) => typeof e.fails === "string" && e.fails.length > 10));
    ok("every entry records its own measured runtime", RED_AT_V4279.every((e) => e.ms > 0));
    ok("*** so re-verifying the WHOLE census is affordable, and it is not sampled ***", censusCostMs() < 180000,
        (censusCostMs() / 1000).toFixed(1) + "s for all " + RED_AT_V4279.length +
        " -- a census that spot-checks can be wrong about what it skipped");
    ok("no gate is listed twice", new Set(RED_AT_V4279.map((e) => e.gate)).size === RED_AT_V4279.length);
}

console.log("\n2. *** RE-RUN: EVERY GATE THE CENSUS CALLS RED IS STILL RED ***");
{
    const nowGreen = [], stillRed = [];
    for (const e of RED_AT_V4279) (runGate(e.gate).red ? stillRed : nowGreen).push(e.gate);
    ok("*** none of them has been fixed without the census being updated ***", nowGreen.length === 0,
        nowGreen.length ? "FIXED, now delete these lines from redCensus.mjs: " + nowGreen.join(" ")
                        : stillRed.length + " of " + RED_AT_V4279.length + " re-ran red just now");
    report("a gate turning green is GOOD NEWS that must be recorded by hand. Making that a red is the whole " +
        "mechanism: the alternative is a list nobody prunes, which is how gate-timings.json ended up " +
        "accusing thirteen working gates. The list may only shrink, and only on purpose.");
}

console.log("\n3. *** THE OLD RECORD WAS WRONG IN BOTH DIRECTIONS, AND BOTH ARE CHECKED ***");
{
    const tj = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/gate-timings.json"), "utf8"));
    const recorded = Object.keys(tj.failingAt || {});
    ok("gate-timings.json still carries its own older failing list", recorded.length > 0,
        recorded.length + " entries, captured long before v4279");
    const nowRed = new Set(RED_AT_V4279.map((e) => e.gate));
    const stale = recorded.filter((g) => !nowRed.has(g));
    ok("*** and most of it is stale: the entries it lists that are NOT red now ***", stale.length >= 10,
        stale.length + " of " + recorded.length);
    ok("  which is exactly the set RECORDED_BUT_GREEN names, so the two agree",
        stale.length === RECORDED_BUT_GREEN.length && stale.every((g) => RECORDED_BUT_GREEN.includes(g)),
        RECORDED_BUT_GREEN.length + " named");

    // *** AND THE OTHER DIRECTION, WHICH IS THE LARGER ONE. ***
    const unrecorded = RED_AT_V4279.filter((e) => !recorded.includes(e.gate));
    ok("*** most of what IS red was never recorded at all ***", unrecorded.length > recorded.length,
        unrecorded.length + " red gates absent from the older register");
    report("appended-to-only, a register becomes a list of grievances; never appended to, a list of fiction. " +
        "That one managed both at once, which is only possible if nobody ever re-ran it.");

    // *** SPOT-VERIFY BY RUNNING, NOT BY DIFFING SETS -- AND THIS CONTROL EARNED ITS KEEP IMMEDIATELY. ***
    // The first draft sampled RECORDED_BUT_GREEN.slice(0, 3), alphabetically, and one of those three takes
    // over two minutes, which is how a 68-second gate became a three-minute one. Worse, the list it was
    // sampling was WRONG: referenceKind-selfcheck was in it and is red. The sample is chosen by measured
    // cheapness now, and named, so the cost is a property of the list rather than of the alphabet.
    const sample = ["tools/ship/rootLayout-selfcheck.mjs", "ui/stageInfo-selfcheck.mjs",
                    "tools/ship/timingCoverage-selfcheck.mjs"];
    ok("  the sample is drawn from the wrongly-accused list", sample.every((g) => RECORDED_BUT_GREEN.includes(g)));
    const wronglyAccused = sample.filter((g) => fs.existsSync(path.join(ENG, g)) && !runGate(g).red);
    ok("CONTROL: a sample of the wrongly-accused really does pass when run", wronglyAccused.length === sample.length,
        wronglyAccused.join(" ") + " -- run, not inferred from a set difference");
}

console.log("\n4. *** THE MEASUREMENT'S OWN FAILURE MODES, RECORDED BECAUSE BOTH BIT ***");
{
    ok("the method records that a parallel sweep produced FALSE reds", METHOD.falseRedsFromParallelism > 0,
        METHOD.falseRedsFromParallelism + " of " + METHOD.sweptInParallel +
        " went green when re-run one at a time -- 15%, all of them clock-sensitive");
    ok("  so the confirmed count is smaller than the swept count",
        METHOD.confirmedSerially < METHOD.sweptInParallel &&
        METHOD.confirmedSerially === METHOD.sweptInParallel - METHOD.falseRedsFromParallelism,
        `${METHOD.sweptInParallel} swept - ${METHOD.falseRedsFromParallelism} false = ${METHOD.confirmedSerially}`);
    // *** THE ARITHMETIC HAS A FOURTH TERM, AND LEAVING IT OUT IS HOW A CENSUS STARTS LYING. ***
    // Written first as (confirmed - fixed), which stopped closing the moment referenceKind was recovered
    // out of the timeout bucket: a gate can ENTER the red set without having been in the swept-and-confirmed
    // count. The gate went red on its own bookkeeping, which is the only reason the identity is right now.
    // v4304: a fifth term, for the same reason as the fourth -- two gates were fixed and DELETED from the list,
    // as section 2 instructs, and the identity has to name them or it stops closing again.
    ok("  and the census holds confirmed + recovered - fixed, with every term named",
        RED_AT_V4279.length ===
            METHOD.confirmedSerially + METHOD.recoveredFromTimeoutBucket - FIXED_AT_V4279.length - FIXED_AT_V4304.length,
        `${METHOD.confirmedSerially} confirmed + ${METHOD.recoveredFromTimeoutBucket} recovered - ` +
        `${FIXED_AT_V4279.length} fixed at v4279 - ${FIXED_AT_V4304.length} fixed at v4304 = ${RED_AT_V4279.length}`);
    ok("  and each v4304 fix names its cause and its repair, and is no longer in the red list",
        FIXED_AT_V4304.length === 2 && FIXED_AT_V4304.every((e) => e.cause && e.why && e.why.length > 40 &&
            !RED_AT_V4279.some((r) => r.gate === e.gate)),
        FIXED_AT_V4304.map((e) => e.gate.split("/").pop()).join(", "));

    // *** THE SECOND FAILURE MODE: ATTRIBUTION ACROSS A CLEAN CHECKOUT. ***
    const falseAttrib = FIXED_AT_V4279.filter((e) => /NOT this session/.test(e.cause));
    ok("*** one of the three 'this session broke it' verdicts was itself wrong ***",
        falseAttrib.length === METHOD.falseAttribution && falseAttrib.length === 1,
        falseAttrib.map((e) => e.gate).join(", ") + " -- a filesystem-scanning gate compared against a clean checkout");
    ok("  and the fix went to the cause rather than to a baseline",
        /skips \.claude/.test(fs.readFileSync(path.join(ENG, "tools/ship/duplicateFiles.mjs"), "utf8")) === false ?
        fs.readFileSync(path.join(ENG, "tools/ship/duplicateFiles.mjs"), "utf8").includes('".claude"') : true,
        "the walk excludes .claude, so the gate stops seeing worktrees that are in no commit");
    ok("  every fixed entry names its cause and its reasoning",
        FIXED_AT_V4279.every((e) => e.cause && e.why && e.why.length > 40));
    report("36 of the 39 predate this session by at least twelve rounds. Two were mine. One was nobody's -- " +
        "the measurement's. Saying which is which is the difference between a census and a complaint.");
}

console.log("\n5. *** THE HOLE THIS CENSUS DOES NOT CLOSE, ASSERTED RATHER THAN OMITTED ***");
{
    ok("*** the census names the gates it could NOT measure ***", UNCONFIRMED_SLOW.length > 0,
        UNCONFIRMED_SLOW.length + " gates exceeded the sweep's flat 120s cap and have no verdict");
    ok("  none of them is quietly counted as green", UNCONFIRMED_SLOW.every((g) =>
        !RECORDED_BUT_GREEN.includes(g)), "unmeasured is a third state, not a pass");
    ok("  and none is quietly counted as red either",
        UNCONFIRMED_SLOW.every((g) => !RED_AT_V4279.some((e) => e.gate === g)));
    // *** THE ENTRY THAT PROVES THE BUCKET IS DANGEROUS. ***
    const rk = RED_AT_V4279.find((e) => /referenceKind/.test(e.gate));
    ok("*** one gate escaped that bucket by being RED all along, and is now in the red set ***",
        !!rk && !UNCONFIRMED_SLOW.includes(rk.gate) && rk.ms > 60000,
        rk ? `${rk.gate} -- ${(rk.ms / 1000).toFixed(1)}s and exit 1, starved past a 120s cap by seven other workers`
           : "absent");
    const partial = Object.values(SLOW_PARTIAL);
    ok("*** and the bucket resolved in BOTH directions, which is why it cannot be waved through ***",
        METHOD.resolvedOutOfTimeoutBucket === 2,
        "referenceKind at 73.7s exits 1 (red); twoF at 120.5s exits 0 (green) -- both had been 'unmeasured'");
    ok("  the partial confirmation that found it is recorded, not summarised away", partial.length > 0,
        `${partial.length} of ${UNCONFIRMED_SLOW.length} confirmed so far: ` +
        `${partial.filter((v) => v.verdict === "GREEN").length} green, ` +
        `${partial.filter((v) => v.verdict === "RED").length} red, ` +
        `${partial.filter((v) => v.verdict === "SLOW400").length} still unfinished at 400s`);
    report("*** SO THE HONEST TOTAL IS 'AT LEAST 37', NOT '37'. *** Finishing the other 55 is about three " +
        "hours of serial running and is the next round, not a number to guess at now. Recording the hole " +
        "is what stops the census becoming the fourth wrong answer on this subject.");
}

console.log("\n6. THE BACKLOG ITEM SAID FIVE");
{
    ok("*** the item's number and the measured number differ by more than a factor of seven ***",
        METHOD.confirmedSerially >= 35, "#134 said 5; the sweep found " + METHOD.confirmedSerially);
    ok("  and the tree's own older register was closer but still wrong by both counting and omission",
        RECORDED_BUT_GREEN.length > 0 && RED_AT_V4279.length > RECORDED_BUT_GREEN.length);
    report("nobody was lying. Five was somebody's honest recollection of the gates they had personally seen " +
        "go red, nineteen was a real snapshot that then aged, and thirty-nine is what running them says " +
        "today. The lesson is not that the numbers were wrong -- it is that for a very long time nothing " +
        "was cheap enough to run, so every number in circulation was a memory.");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read,
// redCensus.mjs restored md5-identical (e10f272b3888). MEASURED, not predicted.
//
//   A  a gate that actually PASSES (rootLayout) added to the red list -- the list rotting into accusations,
//      which is the precise failure gate-timings.json's own register suffered thirteen times over.
//      -> exit=1, 3 FAIL. The re-run names it and says "delete this line"; the stale-set comparison notices
//      the two registers stopped agreeing; and the arithmetic identity stops closing. Three independent
//      reds for one bad line is the shape worth having -- the count, the cross-check and the re-run each
//      catch it separately, so no single one of them has to be the reliable one.
//
//   B  UNCONFIRMED_SLOW emptied, so the census silently claims a complete picture.
//      -> exit=1, 1 FAIL. Narrow and exactly right: nothing about the red set changes, and the only thing
//      that breaks is the claim to completeness. That is the sabotage closest to something a tidying pass
//      would really do -- an empty list looks like good news.
//
//   C  referenceKind pushed back into the unmeasured bucket, restoring the original mis-bucketing.
//      -> exit=1, 3 FAIL, including the check written specifically to remember it. This is the one that
//      matters most, because it is not hypothetical: THE FIRST DRAFT OF THIS CENSUS SHIPPED THAT EXACT
//      STATE. A gate that ran in 73.7s and exited 1 was starved past a flat 120s cap by seven parallel
//      workers, filed as "timed out", and then read as exonerated because it was not in the confirmed-red
//      list. It was caught by the section 3 control -- which re-runs a sample of the wrongly-accused rather
//      than trusting a set difference -- and that control exists only because the tree keeps finding that
//      a check comparing two lists is not a check on either.
//
// Two more reds arrived unbidden and are corrected above rather than logged as sabotages, since nobody
// applied them deliberately. The arithmetic identity was written as (confirmed - fixed) and stopped closing
// the moment a gate ENTERED the red set from outside the swept count -- it needs the recovery term, and the
// gate went red on its own bookkeeping. And twoF-selfcheck sat in both UNCONFIRMED_SLOW and
// RECORDED_BUT_GREEN, because it had in fact been measured (120.5s, exit 0). Both directions out of that
// bucket are now resolved and counted: one red, one green, from a set that had been called neither.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER ANYTHING NOT ON THE LIST HAS GONE RED. This gate re-runs the 36 gates " +
    "the census names and nothing else, so it cannot notice the 1,312 it does not name turning red. That " +
    "needs the full sweep -- xargs -P 8 over every gate file, then a serial confirmation of every candidate " +
    "-- which is about 25 minutes and belongs in a round, not in a gate. *** SO 'redCensus IS GREEN' MEANS " +
    "'THE KNOWN RED SET HAS NOT CHANGED', NOT 'THE TREE IS GREEN'. *** Also unchecked: whether any of the 36 " +
    "is red for the reason recorded beside it. The exit code is read; the failing check is not re-read, so a " +
    "gate that started failing for a second reason would still look unchanged here.");
process.exit(fails ? 1 : 0);
