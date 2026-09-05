#!/usr/bin/env node
// tools/ship/budgetExile-selfcheck.mjs -- v4425
//
// Run: node tools/ship/budgetExile-selfcheck.mjs      (runs ONE cheap gate, as a fixture, through the real sweep)
//
// HEADER-PENDING
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { redRegister, selectGates, readTimings, DEFAULTS } from "./quickSweep.mjs";
import { enumerateGates } from "./gateSweep.mjs";
import {
    ENG, ABSORBING, MEASURED_V4425, STALE_FAILURES,
    demonstrateAbsorbing, exiled, wouldRunNow, inflation, RECORD_REPAIR, EXILED_REGRESSIONS,
    LEDGER_AT_V4472, FOUND_AT_V4472, stateOf, measureExiled, ledgerDrift,
} from "./budgetExile.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
                         return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const prior = readTimings();
const T = prior.timings || {}, C = prior.codes || {};

console.log("\n1. *** THE SKIP IS PERMANENT, DEMONSTRATED THROUGH THE REAL SWEEP AND NOT READ OFF THE SOURCE ***");
{
    const d = await demonstrateAbsorbing({ staleMs: 999999 });
    ok("*** a gate whose recorded time is a lie is not run, and the lie survives the write ***",
        d.ran === 0 && d.skipped === 1 && d.msAfter === 999999,
        `seeded 999999ms for a gate that takes ~42ms: ran ${d.ran}, skipped ${d.skipped}, file still says ${d.msAfter}ms`);
    ok("  and so does the recorded exit code beside it", d.codeAfter === 1,
        "a failure verdict preserved indefinitely by the same rule that guarantees it cannot be corrected");
    // *** THE FIXTURE HAS TO BE ABLE TO COME OUT THE OTHER WAY, OR IT IS NOT A DEMONSTRATION. ***
    const e = await demonstrateAbsorbing({ staleMs: 1 });
    ok("*** the same gate with an honest time IS run, and its entry is rewritten ***",
        e.ran === 1 && e.skipped === 0 && e.msAfter !== 1 && e.codeAfter === 0,
        `seeded 1ms: ran ${e.ran}, and the file now says ${e.msAfter}ms exit ${e.codeAfter} -- measured, not carried`);
    ok("  both halves of the rule are named, because either alone is harmless",
        /LAST RECORDED/.test(ABSORBING.skipRule) && /only for gates that RAN/i.test(ABSORBING.writeRule),
        "a budget that skips is fine if something re-measures; a rewrite that skips the skipped is fine if nothing is excluded");
    ok("  and the escapes are named rather than implied", /budget/.test(ABSORBING.escapes) && /hand/.test(ABSORBING.escapes),
        ABSORBING.escapes);
    // *** THE REPAIR: THE ROW NOW SAYS WHEN IT WAS SEEN, WHICH THE WHOLE-FILE DATE COULD NOT. ***
    ok("*** the exiled row keeps its OLD observation stamp while the file's `captured` moves ***",
        d.atAfter === "2020-01-01T00:00:00.000Z" && d.captured !== d.atAfter,
        `row observed ${d.atAfter}, file captured ${d.captured} -- one dates the ROW, the other the RUN`);
    ok("  and a row the sweep actually ran is stamped with that run",
        typeof e.atAfter === "string" && e.atAfter !== "2020-01-01T00:00:00.000Z" &&
        Math.abs(Date.parse(e.atAfter) - Date.now()) < 600000,
        `${e.atAfter} -- within ten minutes of now`);
    ok("  the repair is a record change and says so", /not made here|unchanged/.test(RECORD_REPAIR.notAPolicy),
        RECORD_REPAIR.notAPolicy);
}

console.log("\n2. *** WHO IS IN THERE ***");
{
    const all = enumerateGates(ENG);
    const sel = selectGates(all, T, DEFAULTS.budgetMs);
    const reg = redRegister();
    const unreg = sel.skipped.filter((g) => !reg.has(g));
    report(`${sel.skipped.length} of ${all.length} gates are exiled over the ${DEFAULTS.budgetMs}ms budget; ` +
        `${unreg.length} of those are on no register at all`);
    ok("*** the exiled set is exactly the gates whose RECORDED time is over budget ***",
        sel.skipped.every((g) => T[g] > DEFAULTS.budgetMs) && sel.run.every((g) => T[g] == null || T[g] <= DEFAULTS.budgetMs),
        "no other property of a gate takes part in the decision -- not its register entry, not its exit code");
    // *** THE REPAIR MAKES THE FINDING VISIBLE IN THE FILE ITSELF. *** A row with no observation stamp is a
    // row no sweep has been able to refresh since the field existed -- and every one of them is an exile. The
    // containment is the assertable direction: a gate released from exile gets stamped on its next run, so
    // equality would fail on the repair while this stays true.
    const O = prior.at || {};
    const unstamped = Object.keys(T).filter((g) => !O[g]);
    if (unstamped.length) {
        report(`${unstamped.length} of ${Object.keys(T).length} rows carry no observation stamp; ` +
            `${Object.keys(T).length - unstamped.length} were refreshed by the last sweep`);
        ok("*** every row no sweep can refresh is an exiled one ***",
            unstamped.every((g) => sel.skipped.includes(g)),
            "containment, not equality: a gate released from exile is stamped on its next run");
    } else {
        report("every row carries an observation stamp -- either no exile remains, or the file predates none of them");
    }
    const atCap = sel.skipped.filter((g) => C[g] === 124);
    ok("  and a gate killed at the sweep's cap is exiled on the CAP, not on a time it ever took",
        atCap.length > 0 && atCap.every((g) => T[g] >= 20000 && T[g] < 21000),
        `${atCap.length} recorded at the 20s cap with exit 124 -- v4424's finding, now as a cause rather than a curiosity`);
}

console.log("\n3. *** SIX RECORDED FAILURES, ON NO REGISTER, AND EVERY ONE OF THEM IS GREEN ***");
{
    const reg = redRegister();
    ok("*** the file records exit 1 for them and nothing reads that field as a verdict ***",
        STALE_FAILURES.every((s) => C[s.gate] === 1 && !reg.has(s.gate)),
        `${STALE_FAILURES.length} gates: recorded failing, on no register, never run again`);
    ok("*** run one at a time, all six exit 0 ***", STALE_FAILURES.every((s) => s.serialCode === 0),
        "the codes are stale, and the exile is what makes staleness permanent");
    const freed = STALE_FAILURES.filter((s) => s.serialMs <= DEFAULTS.budgetMs);
    ok("*** and four of the six would clear the budget today, on a number that has been wrong all along ***",
        freed.length === 4,
        freed.map((s) => s.gate.split("/").pop().replace(/-selfcheck\.mjs$/, "") + " " + s.recordedMs + " -> " + s.serialMs).join(", "));
    ok("  one got SLOWER, which is why this is a measurement and not a story",
        STALE_FAILURES.some((s) => s.serialMs > s.recordedMs),
        STALE_FAILURES.filter((s) => s.serialMs > s.recordedMs)
            .map((s) => s.gate.split("/").pop().replace(/-selfcheck\.mjs$/, "") + " " + s.recordedMs + " -> " + s.serialMs).join(", "));
}

console.log("\n4. *** WHAT THE EXILES ACTUALLY COST, MEASURED ONE AT A TIME ***");
{
    const w = wouldRunNow(MEASURED_V4425);
    report(`${w.measured} of the exiled gates re-timed serially`);
    ok("*** most of them clear the budget alone ***", w.under > w.measured / 2,
        `${w.under} of ${w.measured} finish inside ${DEFAULTS.budgetMs}ms with nothing else on the box`);
    const inf = inflation(T, MEASURED_V4425);
    const rs = inf.map((x) => x.ratio).sort((a, b) => a - b);
    ok("  and the number that exiled them was inflated, not wrong-by-a-little",
        median(rs) > 1.5, `recorded/serial: min ${rs[0].toFixed(2)}x, median ${median(rs).toFixed(2)}x, max ${rs[rs.length - 1].toFixed(2)}x`);
    ok("  measured against the file's OWN recorded numbers, not against a second census",
        inf.every((x) => x.recorded === T[x.gate]), `${inf.length} gates compared to sweep-timings.json itself`);
    const red = Object.entries(MEASURED_V4425).filter(([, m]) => m.verdict === "RED").map(([g]) => g);
    report(red.length ? `RED among the exiles: ${red.join(", ")}` : "no red among the exiles measured here");
}

console.log("\n5. *** WHAT THE EXILE WAS HIDING, AND WHO PUT IT THERE ***");
{
    const reg = redRegister();
    const notGreen = Object.entries(MEASURED_V4425).filter(([, m]) => m.verdict !== "GREEN").map(([g]) => g);
    const unreg = notGreen.filter((g) => !reg.has(g));
    report(`${notGreen.length} of the 378 exiles exit non-zero: ${notGreen.length - unreg.length} on ` +
        `redCensus.RED_AT_V4279 and accounted for, ${unreg.length} on no register at all`);
    // *** THE MECHANISM, NOT JUST THE COUNT. *** A gate the file records as PASSING, that now fails, went red
    // on the far side of the door -- which is what makes the exile a hiding place rather than a backlog.
    ok("*** every unregistered red is one the file records as having PASSED ***",
        unreg.length > 0 && unreg.every((g) => C[g] === 0),
        `${unreg.length} gates with a recorded exit code of 0 that exit non-zero when run`);
    ok("  and they are named in EXILED_REGRESSIONS rather than added to a register",
        EXILED_REGRESSIONS.every((e) => unreg.includes(e.gate)) && EXILED_REGRESSIONS.every((e) => !reg.has(e.gate)),
        `${EXILED_REGRESSIONS.length} named -- gateSweep.SWEEP_V4297's rule: a regression is a thing to repair, ` +
        "and registering it would make its red acceptable again");
    ok("  the record covers every one of them, with no spare entries",
        EXILED_REGRESSIONS.length === unreg.length,
        `${EXILED_REGRESSIONS.length} entries against ${unreg.length} unregistered reds`);
    const repaired = EXILED_REGRESSIONS.filter((e) => e.claimedAtV4425 === "REPAIRED HERE");
    const owed = EXILED_REGRESSIONS.filter((e) => e.claimedAtV4425 === "OWED");
    ok("*** four were this session's own, and v4425 repaired them ***",
        repaired.length === 4 && repaired.every((e) => e.mine && e.mine !== "not attributed here"),
        repaired.map((e) => e.gate.split("/").pop().replace(/-selfcheck\.mjs$/, "") + " (" + e.mine + ")").join(", "));
    ok("  and what was owed said so, with attribution where the evidence gave one and not where it did not",
        owed.length > 0 && owed.every((e) => typeof e.mine === "string" && e.fails.length > 20) &&
        owed.some((e) => e.mine === "not attributed here"),
        `${owed.length} owed at v4425; ${owed.filter((e) => e.mine === "not attributed here").length} left unattributed rather than guessed`);
    ok("*** and the instrument itself was wrong once, which the wider run is what found ***",
        /SOUND FOR THAT DATA AND NOT A GENERAL LAW/.test(EXILED_REGRESSIONS.find((e) => /wgslSpec/.test(e.gate)).note || ""),
        "wgslSpec reports on stderr, so a counter reading stdout called a RED a CRASH -- v4424's argument that " +
        "the undercount could not change a verdict was true of its data and is not a law");
}

console.log("\n6. *** THE LEDGER, RE-MEASURED -- BECAUSE EVERY CHECK ABOVE READS THE v4425 SNAPSHOT ***");
{
    // Section 5 derives its population from MEASURED_V4425 on BOTH sides, so it compares the photograph with
    // the photograph and passes however far the tree has moved. Nothing here re-ran a single one of the ten
    // between v4425 and v4472. This section is the correction: LEDGER_AT_V4472 holds what they actually do.
    const rows = LEDGER_AT_V4472.rows;
    ok("*** every gate the list names has a MEASURED verdict, not a typed one ***",
        EXILED_REGRESSIONS.every((e) => rows[e.gate] && typeof rows[e.gate].code === "number") &&
        Object.keys(rows).length === EXILED_REGRESSIONS.length,
        `${Object.keys(rows).length} rows against ${EXILED_REGRESSIONS.length} entries, each an exit code from a real run`);

    // *** THE DRIFT, WHICH IS THIS ROUND'S WHOLE FINDING. *** A typed state is a claim about the day it was
    // typed; the list was read for ten versions as a claim about now.
    // *** THE FINDING IS ASSERTED AGAINST THE FIRST READING, NOT AGAINST TODAY. *** The first draft compared
    // the typed states with LEDGER_AT_V4472 and asserted the disagreement count was 2 -- true when written,
    // false an hour later, because this round's own repairs took three more entries out of agreement with
    // their v4425 state. A COUNT IS NOT A CONTRACT, committed inside the check written to say so. What is
    // fixed is what the first honest re-reading found, so FOUND_AT_V4472 carries it and this checks that.
    const disagreed = Object.entries(FOUND_AT_V4472.disagreed);
    const typedOf = (g) => (EXILED_REGRESSIONS.find((e) => e.gate === g) || {}).claimedAtV4425;
    const stateFromCode = (c) => (c === 0 ? "REPAIRED" : "OWED");
    ok("!! *** and the typed record was wrong in BOTH directions, which is why a state may not be typed ***",
        disagreed.length === 2 &&
        disagreed.every(([g, d]) => typedOf(g) === d.typed &&
                                    stateFromCode(FOUND_AT_V4472.codes[g]) === d.found &&
                                    d.found !== (d.typed === "REPAIRED HERE" ? "REPAIRED" : "OWED")) &&
        disagreed.some(([, d]) => d.typed === "REPAIRED HERE" && d.found === "OWED") &&
        disagreed.some(([, d]) => d.typed === "OWED" && d.found === "REPAIRED"),
        disagreed.map(([g, d]) => g.split("/").pop().replace(/-selfcheck\.mjs$/, "") + ": typed " + d.typed + ", found " + d.found).join("; ") +
        ". crossBackend was RED AGAIN on the check v4425 repaired, two new WGSL producers unregistered -- and " +
        "wgslCorpus's v4425 note predicted exactly that in writing, 'the gate that says so is exiled over the " +
        "ship-time budget, which is why nine accumulated instead of the first being caught on arrival'. The " +
        "gate worked the whole time; the ledger said REPAIRED and nothing ran it");
    ok("  and the first reading covers every entry, so the two disagreements are the whole of it and not a sample",
        Object.keys(FOUND_AT_V4472.codes).length === EXILED_REGRESSIONS.length &&
        EXILED_REGRESSIONS.every((e) => typeof FOUND_AT_V4472.codes[e.gate] === "number") &&
        EXILED_REGRESSIONS.filter((e) => stateFromCode(FOUND_AT_V4472.codes[e.gate]) !==
            (e.claimedAtV4425 === "REPAIRED HERE" ? "REPAIRED" : "OWED")).length === disagreed.length,
        `${Object.keys(FOUND_AT_V4472.codes).length} gates run before anything was touched; ${disagreed.length} disagreed with the typed state`);
    // *** AND A THIRD ROW MOVED WITHOUT DISAGREEING, WHICH A TWO-STATE FIELD CANNOT SAY. *** physicsReach was
    // OWED at v4425 and is OWED now, so every state check above passes it -- while the debt itself grew by
    // thirteen modules. A ledger of booleans cannot record a debt getting worse.
    ok("!! ...and one debt GREW while staying OWED, which no state field could have shown",
        Object.entries(FOUND_AT_V4472.grew).every(([g, d]) =>
            typedOf(g) === "OWED" && stateFromCode(FOUND_AT_V4472.codes[g]) === "OWED" &&
            d.atV4425 !== d.atV4472 && /\d+ of \d+/.test(d.atV4472)),
        Object.entries(FOUND_AT_V4472.grew).map(([g, d]) => g.split("/").pop().replace(/-selfcheck\.mjs$/, "") +
            ": " + d.atV4425 + " -> " + d.atV4472).join("; ") +
        " -- OWED both times, so the state never moved and nothing was ever going to notice");

    // *** THE CHEAP ROWS ARE RE-RUN LIVE, EVERY RUN, AND THAT IS WHAT KEEPS THIS FROM BEING ANOTHER
    // PHOTOGRAPH. *** Re-running all ten costs 50.5 s and a gate that cost 50.5 s would be killed by the
    // ship-time sweep at 3000 ms -- this ledger would join its own list, which is the absorbing state the
    // module documents. So the rows that CAN afford to answer do, on every single run: the comparison is
    // exercised continuously instead of being trusted, and a record that has gone wrong shows up here first.
    const cheap = Object.entries(rows).filter(([, r]) => r.ms < LEDGER_AT_V4472.cheapCapMs).map(([g]) => g);
    const live = measureExiled(cheap);
    const drift = ledgerDrift(rows, live);
    ok("*** the rows cheap enough to re-run are re-run HERE, and still say what the record says ***",
        cheap.length >= 4 && drift.length === 0,
        drift.length
            ? drift.map((g) => `${g}: recorded ${stateOf(rows[g])}, ran ${stateOf(live[g])}`).join("; ")
            : cheap.map((g) => g.split("/").pop().replace(/-selfcheck\.mjs$/, "") + " " + stateOf(live[g]) + " " + live[g].ms + "ms").join(", ") +
              " -- re-run just now, not read from the record");

    // *** AND THE RE-RUN IS PROVED TO BE A RE-RUN, BECAUSE SUBSTITUTING THE RECORD FOR IT WAS 0 RED. ***
    // Sabotaging `live` to `cheap.map(g => [g, rows[g]])` -- reading the record instead of running anything --
    // passed every check in this section, including the inverted-record control, which compares a flipped
    // record against `live` and finds its disagreements either way. THE VERIFICATION HAD BECOME THE THING IT
    // VERIFIES, which is this whole round's subject, planted in the round's own repair.
    //
    // What a real run has that a record cannot is a FRESH CLOCK. Recorded and re-run milliseconds come from
    // different occasions under different load; four gates reproducing all four recorded numbers to the
    // millisecond does not happen. A copy of the record matches all four exactly and says so here.
    const sameMs = cheap.filter((g) => live[g].ms === rows[g].ms);
    ok("  and those numbers came from a CLOCK, not from the record they are checked against",
        sameMs.length < cheap.length,
        sameMs.length === cheap.length
            ? "every re-run reproduced its recorded millisecond exactly -- that is a copy of the record, not a measurement"
            : `${cheap.length - sameMs.length} of ${cheap.length} rows timed differently this run (` +
              cheap.map((g) => rows[g].ms + "->" + live[g].ms).join(", ") + "). A re-run that reproduced every " +
              "recorded millisecond would be the record wearing a measurement's name");

    // The control: the comparison must be shown FINDING a disagreement, because four rows that agree prove
    // only that four rows agree. Same ledgerDrift(), given a record that says the opposite.
    const flipped = {};
    for (const g of cheap) flipped[g] = { ...rows[g], code: rows[g].code === 0 ? 1 : 0 };
    const caught = ledgerDrift(flipped, live);
    ok("  and that comparison is shown FINDING one, on a record deliberately inverted",
        caught.length === cheap.length,
        `the same ledgerDrift(), given every cheap row's verdict flipped, reports ${caught.length} of ${cheap.length} -- ` +
        "so the empty answer above is a measurement and not the shape of the function");

    // *** AND THE RUNNER IS PROVED TO READ BOTH STREAMS, WHICH NO CHEAP ROW CAN SHOW. *** This list's own
    // last entry records the finding: wgslSpec prints its verdict on STDERR and nothing on stdout, so a
    // runner reading only stdout counted zero checks and called a RED a CRASH. Sabotaging measureExiled back
    // to stdout-only is 0 RED here -- because wgslSpec costs 3.8 s and is not in the live subset, and none of
    // the four rows that are prints to stderr. THE ONE GATE THAT EXHIBITS THE BUG IS TOO SLOW TO RE-RUN, so
    // the property is proved on a fixture that costs 50 ms instead of being left to the record.
    {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "exile-"));
        const stderrGate = path.join(tmp, "stderr-selfcheck.mjs");
        fs.writeFileSync(stderrGate,
            'console.error("  FAIL  this gate reports on stderr, exactly as wgslSpec does");\nprocess.exit(1);\n');
        const seen = measureExiled([stderrGate], { root: tmp, timeoutMs: 30000 })[stderrGate];
        ok("  and the runner reads BOTH streams, proved on a gate that answers only on stderr",
            seen.code === 1 && !!seen.first && /stderr/.test(seen.first),
            seen.first
                ? `a gate printing its verdict only on stderr came back code ${seen.code} with its FAIL line read -- ` +
                  "which is the failure mode this very list records against wgslSpec, and the one no cheap row can demonstrate"
                : `code ${seen.code} and NO failure line: the runner is reading one stream and a red is arriving as a silence`);
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    const stillOwed = EXILED_REGRESSIONS.filter((e) => stateOf(rows[e.gate]) === "OWED");
    ok("  and what is owed NOW is named with the line that says so, rather than carried as prose",
        stillOwed.length === 2 && stillOwed.every((e) => rows[e.gate].first && rows[e.gate].first.length > 20),
        stillOwed.map((e) => e.gate.split("/").pop().replace(/-selfcheck\.mjs$/, "") + ": " + rows[e.gate].first).join(" | "));
    report("WHAT IS STILL OWED, AND WHY NEITHER IS A PATCH. physicsReach wants a door for seven WGSL modules " +
           "under physics/render/ -- a device page is a round, not a line -- and it has GROWN from 36 of 136 " +
           "to 49 of 151 while being carried as a fixed sentence. wgslSpec wants requiredLimits at device " +
           "creation, which changes what every device in the tree asks for and is an engine decision.");
}

/* -------------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- v4472, section 6
 *
 * A. The crossBackend regression typed back to 0; the silent repair typed back to OWED.            2 / 1 RED
 *    The finding itself, asserted against FOUND_AT_V4472 rather than against today.
 *
 * B. stateOf calls everything REPAIRED; ledgerDrift can never find anything; a still-owed
 *    gate loses its failure line; the growth record flattened to look static.                    1-2 RED each
 *
 * C. The live re-run replaced by a read of the record.                                                  1 RED
 *    *** 0 RED FIRST, AND IT IS THE SABOTAGE THIS ROUND IS ABOUT. *** Substituting `rows[g]` for a real run
 *    turns the verification back into the photograph -- the exact defect the section was written to fix --
 *    and it passed everything, the inverted-record control included, because that control compares a flipped
 *    record against `live` and finds its disagreements either way. What a run has that a record cannot is a
 *    FRESH CLOCK: four gates do not reproduce four recorded milliseconds. Re-run at 1 red.
 *
 * D. measureExiled echoes the ledger instead of spawning anything.                                      1 RED
 *    Caught by the same clock check, which is what makes it a property and not a trick.
 *
 * E. measureExiled reads only stdout.                                                                   1 RED
 *    *** 0 RED FIRST, AND THIS LIST'S OWN LAST ENTRY IS THE FINDING IT MISSED. *** wgslSpec prints its
 *    verdict on stderr; a runner reading stdout alone calls that RED a CRASH. It went unseen because
 *    wgslSpec costs 3.8 s and is not in the live subset, and no cheap row prints to stderr -- THE ONE GATE
 *    THAT EXHIBITS THE BUG IS TOO SLOW TO RE-RUN. Proved on a 50 ms fixture that answers only on stderr.
 *
 * F. The stderr fixture's condition replaced by the literal `true`.                                     0 RED
 *    EARNED, and the third time this branch has recorded this shape: no check can tell a computation from
 *    the literal it currently equals, and past that point the edit is to the check rather than to the tree.
 * ---------------------------------------------------------------------------------------------------------- */

console.log(`\n${fails ? "FAIL" : "ALL GREEN"} -- ${fails} failure(s)`);
process.exit(fails ? 1 : 0);
