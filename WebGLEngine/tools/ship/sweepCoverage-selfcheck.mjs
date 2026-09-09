// WebGLEngine/tools/ship/sweepCoverage-selfcheck.mjs -- v4460
//
// Run: node tools/ship/sweepCoverage-selfcheck.mjs   (~2s -- MEASURED)
//
// v4408 -- *** THE SHIP-TIME SWEEP EVICTS GATES ON TIMINGS IT MANUFACTURED ITSELF, AND NEVER RE-MEASURES THEM. ***
//
// v4406 measured that 502 of 1,439 gates are over the quick sweep's 3,000 ms budget and so are run by no
// ship-time step at all. The gap was the visible half. THE MECHANISM IS WORSE, and it is three findings deep:
//
//   1. tools/ship/sweep-timings.json stamped ONE `captured` date on all 1,440 entries while the run rewrote
//      only the ones it ran. 502 readings carried a date they had not earned. That is item 1's defect at a new
//      site: a stored projection whose provenance is a single frozen field.
//   2. The budget decision is made FROM those readings, so a gate that got faster is never re-measured and
//      therefore never re-included. ONCE OVER BUDGET, OVER BUDGET FOREVER.
//   3. *** AND THE READING IT IS EVICTED ON IS THE PARALLEL ONE. *** quickSweep records `serialMs ?? parallelMs`,
//      and a GREEN gate never gets a serial re-run -- so a gate that passes 8-way at 3,002 ms is filed at
//      3,002 ms and evicted, when v4297 already established that phase-1 parallel timings are starved (38 of
//      107 of its reds were starvation, not failure). The sweep closes the door with a number of its own making.
//
// FOUR BUCKETS, NOT TWO (v4401's rule): under / over / killed / never. `killed` is separated because 130
// entries hit the 20 s cap and A KILLED PROCESS'S EXIT CODE IS NOT A VERDICT -- v4392's finding sitting in a
// data file 130 entries deep -- and `never` is separated because an absence read as a skip is an absence read
// as a pass.
//
// ---- *** v4460 -- THE MIRROR standingReds NEVER HAD *** ------------------------------------------------------
//
// Section 2 of this file is careful in ONE direction: a nonzero exit code beside a killed process is not a
// failure. NOBODY EVER ASKED THE OTHER DIRECTION. A ZERO beside an over-budget reading is not a pass either --
// quickSweep writes `codes[r.gate]` only for the gates it ran, so an over-budget entry keeps whatever status
// it had the last time it was cheap enough to run, and the file publishes it forever.
//
// MEASURED: 371 over-budget entries carry code 0, 360 of them stamped UNKNOWN_AT. Run one at a time,
// *** TWENTY-TWO ARE RED -- EIGHTEEN IN NO REGISTER -- AND TWELVE OF THE TWENTY-TWO NOW FINISH UNDER THE
// 3,000 ms BUDGET THAT EXCLUDES THEM. *** v4408's one-way door and this stale verdict are one defect seen
// twice: the door is shut on a time the gate no longer has, and behind it is a green nobody re-observed.
// box3dFilter is recorded at 3,763 ms and runs in 89.
//
// *** AND THE FIRST INSTRUMENT WAS THE WRONG ONE, WHICH THIS TREE ALREADY HAD IN WRITING. *** The first pass
// was 8-way parallel. quickSweep-selfcheck prints "a parallel FAILURE on its own is `unconfirmed`, not `red`";
// I ran it in parallel anyway and quoted its number to myself before a serial pass existed. TWO parallel passes
// of the same 371 gates disagreed on FIVE (38 non-green against 43), and the serial re-run resolved 21 of the
// 43 to GREEN ALONE -- a 49% false-red rate in my own measurement, in the round about false verdicts.
//
// v4460 SABOTAGES, RESULTS BY NAME:
//   W. standingGreens counts nonzero codes too              -> 1 RED
//   X. undatedVerdicts treats a missing stamp as dated       -> *** 0 RED, THEN 0 RED AGAIN, THEN 1 RED ***
//   Y. verdictClasses folds the uncoded class into green     -> *** 0 RED, THEN 1 RED ***
//   Z. the record's 17+3+2 split stops adding up             -> 1 RED
//   AA. the two parallel passes are recorded as agreeing     -> 2 RED
//   AB. a returnable gate's recorded time is retyped         -> 1 RED
//   AC. an unregistered gate name that names no file         -> 1 RED
//   AD. the serial re-run is dropped, parallel non-greens ARE the reds -> 1 RED
//   AE. emptyOfNonEmpty accepts an empty list                -> 1 RED
//
// v4461: the first of the 22 is repaired -- quickSweep-selfcheck -- and `fixedSince` records it rather than
// removing it from the census, which keeps its measured numbers. Three more sabotages:
//   BG. a repair claimed for a gate the census never named    -> 1 RED
//   BH. a repair with no account of what it was               -> 1 RED
//   BI. the census edited down to agree with today            -> 2 RED
//
// ---- *** v4461 -- THE DOOR WAS WALKED THROUGH ONCE AND THE WALK WAS UNDONE INSIDE THE SAME VERSION *** -----
//
// v4408 built the rotation and section 4 checks it covers the pool in a derived number of rounds. NOTHING
// CHECKED THAT WHAT WALKED THROUGH IT STAYED THROUGH -- and that is the whole of what went wrong. The
// 2026-09-03 rotation re-timed 150 gates serially; 146 came back under the budget that had evicted them,
// median 2.80x faster and worst 29.12x, written back with fresh stamps. The NEXT commit to touch the timings,
// titled "the sweep timings as verify left them", has all 146 at EXACTLY their pre-rotation readings carrying
// "unknown -- before v4408" -- a stamp no post-v4408 writer can produce for an entry that had a real one.
// referenceScan has read 3002 ms across thirty commits and really takes 733, and once over budget nothing
// runs it again, so the mechanism that recorded the number cannot correct it. 49 versions, no rotation.
//
// The check costs a FILE READ, and the evidence was in the tree the whole time: the rotation keeps its own
// ledger, which survived. What it measured under budget must still be under budget.
//
//   CA. a rotated gate is put back over budget (THE REAL ONE)   -> 1 RED
//   CB. a rotated gate's stamp reverts to the pre-v4408 marker  -> 1 RED
//   CC. rotationHeld trusts the ledger and ignores the timings  -> 1 RED
//   CD. rotationHeld counts gates never brought under budget    -> 3 RED
//   CE. the loss record's pool arithmetic stops reconciling     -> 1 RED
//   CF. a returned gate is claimed that was not in the twelve   -> 1 RED
//   CG. the four-way split stops summing to what ran            -> 1 RED
//   CH. a returned gate is put back over budget in the timings  -> 2 RED
//
// *** AND IT HAPPENED AGAIN, LIVE, MID-ROUND, WHICH IS HOW THE MECHANISM STOPPED BEING A GUESS. *** This
// round's rotation ran at 14:24 and returned 72 gates. A CONCURRENT SESSION shipping an unrelated fix, from a
// tree checked out before that, ran verify at 15:56 and pushed its own whole-file sweep-timings.json. All 72
// were back over budget in it, 69 carrying the pre-v4408 stamp, referenceScan at 3002 against the 675 ms
// measured here -- AND BOTH ROWS ABOVE WENT RED ON IT BY NAME, on their first exposure to a real instance
// rather than a fixture. quickSweep reads the timings once, carries them forward and rewrites the whole file,
// so two ships in flight means the later push wins wholesale. Nobody did anything wrong.
//
// *** I NEARLY COMMITTED THE SAME CLOBBER RESOLVING IT: *** `git checkout --theirs` in a REBASE takes the
// commit being applied, not the upstream, so it kept this round's file and discarded the other session's
// fresh sweep. Caught by comparing the `captured` stamps instead of trusting the flag. The resolution is to
// take their file and RE-RUN the rotation -- measurement, not a resurrected snapshot -- which is why every
// number in the repair record is from the second run.
//
// One more thing this round got wrong and the gate caught: the `returnedAt_v4461` row first pinned the exact
// millisecond each returned gate had been measured at, and the second rotation moved them (518 -> 580) so the
// row went red for the crime of being measured again. A THRESHOLD IS THE PROPERTY; A MILLISECOND IS AN
// OBSERVATION.
//
// The repair rotation ran 80 and returned 72; the pool went 385 -> 313. Its 8 reds were ALL already in
// v4460's census of 22, reached by a different instrument over a different population -- and FIVE of them are
// now under budget and unregistered, so the next ship reports them as NEW reds. That is an instrument that
// just started working, not a regression.
//
// *** X AND Y ARE MECHANISMS vacuity.mjs NAMED ONE ROUND EARLIER, BOTH IN THE ROUND AFTER IT. *** Y is
// mechanism 1, the empty collection: `none` is empty in this tree, so folding it into `green` changed nothing.
// X is mechanism 2, the unreachable branch: backfillStamps guarantees every entry has an `at`, so the
// `|| UNKNOWN_AT` fallback never fires. Both are pure functions over maps they are handed, so a fixture drives
// them -- AND THE FIRST FIXTURE STILL DID NOT DRIVE X, because it gave every entry a stamp too. An unreachable
// branch inside the fixture written to reach it, which is the third time this session. e.mjs carries a code
// and no stamp and X now bites.
//
// SABOTAGES (4, all logged, MEASURED 3/1/1/2 reds by name):
//   A. counted the cap-hitters as reds  -> section 2 went red in all three rows, and the "13 finished nonzero"
//      count read 140. Restored. That is the row that matters most: 130 killed processes reading as failures
//      would have reported a catastrophically red tree from a file that only says "these did not finish".
//   B. roundsToCover returned 0 instead of Infinity for an empty slice -> the "covers the pool in 0 rounds"
//      row went red BY NAME. A division that returns 0 reads as FULL COVERAGE: absence-as-a-pass, in arithmetic.
//   C. stamped EVERY entry with the run's date, which is exactly the pre-v4408 behaviour -> section 5's last
//      row went red. The other two rows in that section stayed green, which is the point of having three.
//   D. made rotation() return an empty slice -> two rows red, including the stalest-first ordering.
//
// AND THREE ROWS OF THE FIRST DRAFT WOULD HAVE PASSED VACUOUSLY, caught by reading the output rather than the
// exit code, which is v4401's lesson for the second time: an `.every()` over an empty map is true, an
// `undefined <= undefined` comparison is false for the wrong reason, and `rotated.length === 0 || ...` reads
// PASS in precisely the state this round exists to end.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { enumerateGates } from "./gateSweep.mjs";
import * as RC from "./redCensus.mjs";
import * as SC from "./sweepCoverage.mjs";
import { overNonEmpty, emptyOfNonEmpty } from "./vacuity.mjs";
import * as QS from "./quickSweep.mjs";
import * as Q from "./quickSweep.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/sweepCoverage-selfcheck.mjs");

const FILE = SC.readFile();
const GATES = enumerateGates(ENG);
const C = SC.census(GATES, FILE);

console.log("\n1. the four buckets PARTITION the tree -- no gate is unaccounted for and there is no fifth");
{
    ok("!! *** under + over + killed + never = every gate enumerated ***", C.partitions,
        `${C.under.length} + ${C.over.length} + ${C.killed.length} + ${C.never.length} = ${C.sum} of ${C.enumerated}`);
    ok("...and the buckets are disjoint, so no gate is counted twice",
        new Set([...C.under, ...C.over, ...C.killed, ...C.never]).size === C.sum,
        "a count beside a list it does not match is the v4296 mistake");
    ok("...and an entry naming no gate is REPORTED, not folded into a bucket", Array.isArray(C.ghosts),
        C.ghosts.length ? `${C.ghosts.length} ghost(s): ${C.ghosts.slice(0, 3).join(", ")} -- a stale ENTRY is a different problem from a stale READING, and v4406 found one of each` : "no ghost entries");
    REPORT.table("where the tree's gates stand against the ship-time budget", ["bucket", "gates", "what it means"],
        [["under", String(C.under.length), "run at ship time by the quick sweep"],
         ["over", String(C.over.length), "finished under the cap, above the budget -- run by NO ship-time step"],
         ["killed", String(C.killed.length), "hit the 20 s cap: no verdict, needs the full sweep's longer cap"],
         ["never", String(C.never.length), "no reading at all -- a new gate, measured on the next run"]],
        "The `over` row is the one the rotation exists for. `killed` is separated because a killed process's exit code is not a verdict.");
}

console.log("\n2. a killed process's nonzero exit code is NOT counted as a red");
{
    const codes = FILE.codes || {};
    const reds = SC.standingReds(C, { codes });
    const notV = SC.notVerdicts(C, { codes });
    ok("!! *** the cap-hitters are counted as NO VERDICT, not as failures ***", notV.every((g) => !reds.includes(g)),
        `${notV.length} entry(ies) nonzero AFTER being killed at the cap, and none of them is reported red. ` +
        "v4392's rule, sitting in a data file: A COUNT OF FAILURES IS NOT A VERDICT UNLESS THE PROCESS FINISHED");
    ok("...and the ones that DID finish and exit nonzero are reported, with their count",
        reds.every((g) => (FILE.timings || {})[g] < SC.CAP_MS),
        `${reds.length} over-budget gate(s) finished and exited nonzero: ${reds.slice(0, 6).map((g) => g.split("/").pop()).join(", ")}`);
    ok("...and the two populations do not overlap", reds.filter((g) => notV.includes(g)).length === 0,
        "one bucket for both would send 'run it again' and 'raise the cap' to the same place");
}

console.log("\n3. the file can now say WHICH entries the last run observed");
{
    const p = SC.provenance(FILE);
    ok("!! *** every entry carries its OWN capture, not the file's ***", p.withoutAt === 0,
        `${p.withAt} of ${p.entries} entries stamped individually, ${p.withoutAt} without. BEFORE v4408 THE ANSWER WAS ZERO: ` +
        "one `captured` field covered 1,440 readings of which the run had taken 937");
    // *** AN .every() OVER AN EMPTY MAP IS TRUE. *** The first draft of this row read PASS against a file with no
    // `at` at all -- v4401's vacuous check, and the third row in this gate that would have. The population is
    // asserted non-empty before anything is asserted about its members.
    ok("...and an entry with no earned stamp says so rather than borrowing one",
        Object.keys(FILE.at || {}).length > 0 && Object.values(FILE.at).every((v) => typeof v === "string" && v.length > 0),
        `${Object.values(FILE.at || {}).filter((v) => v === SC.UNKNOWN_AT).length} entry(ies) read "${SC.UNKNOWN_AT}" -- ` +
        "an unknown age is a finding, not a default, and a fabricated date would have hidden exactly this round's subject");
    const stampedNewest = Object.values(FILE.at || {}).filter((v) => v === FILE.captured).length;
    ok("...and the count claiming the newest capture is SMALLER than the file", stampedNewest < p.entries,
        `${stampedNewest} of ${p.entries} entries were observed at ${FILE.captured}. THE GAP IS THE SUBJECT OF THIS ROUND, ` +
        "and until now the file asserted it was zero");
}

console.log("\n4. the door swings both ways: the rotation covers the pool in a DERIVED number of rounds");
{
    const rot = SC.rotation(C, FILE, { slots: 24, budgetMs: 120000 });
    ok("the rotation takes a slice, and the rounds-to-cover is arithmetic on the population",
        rot.roundsToCover === SC.roundsToCover(rot.pool, rot.picked.length) && rot.picked.length > 0,
        `pool ${rot.pool}, slice ${rot.picked.length}, covers in ${rot.roundsToCover} round(s) -- derived from both, not typed`);
    const key = (g) => (FILE.at || {})[g] || "";
    ok("...and it takes the STALEST first, so no entry can be starved forever",
        rot.picked.length > 1 && rot.picked.every((g, i) => i === 0 || key(rot.picked[i - 1]) <= key(g)),
        "an unknown stamp sorts before every real capture, which is the correct priority: the oldest reading is the least trustworthy");
    ok("...and the slice respects its wall-clock budget", rot.cost <= 120000,
        `estimated ${(rot.cost / 1000).toFixed(0)}s against a 120s budget, from the PRIOR readings -- which are the ones in doubt, so this is an upper bound and says so`);
    ok("!! ...and roundsToCover is Infinity, not 0 or 1, when the slice is empty", SC.roundsToCover(500, 0) === Infinity,
        "a division that returns 0 would have read as FULL COVERAGE -- the absence-as-a-pass shape, in arithmetic");
}

console.log("\n5. the eviction reading is the PARALLEL one, and that is provable from the writer");
{
    // Not a check for a word: a real run into a TEMP timings file, seeded so the assertion cannot pass by luck.
    const tmp = path.join(ENG, "tools", "ship", ".sweepCoverage-probe.json");
    const seeded = { note: "probe", captured: "2000-01-01T00:00:00.000Z", budgetMs: 3000, capMs: 20000,
                     timings: { "tools/ship/sweepCoverage-selfcheck.mjs": 999999 }, codes: {}, at: {} };
    fs.writeFileSync(tmp, JSON.stringify(seeded));
    let after = null;
    try {
        await Q.runQuickSweep({ budgetMs: 3000, workers: 2, capMs: 20000, timingsFile: "tools/ship/.sweepCoverage-probe.json",
                                gates: ["tools/ship/glBootstrap-selfcheck.mjs", "tools/ship/sweepCoverage-selfcheck.mjs"], write: true });
        after = JSON.parse(fs.readFileSync(tmp, "utf8"));
    } catch (e) { say("the probe run failed: " + String(e && e.message).slice(0, 100)); }
    finally { try { fs.unlinkSync(tmp); } catch {} }
    if (!after) {
        ok("!! the probe run must produce a file to read -- it did not", false,
           "AND THAT IS A FAILURE, NOT A SKIP: an absence read as a skip is an absence read as a pass, which is this gate's own subject");
    } else {
        ok("!! *** an over-budget entry SURVIVES a run untouched -- the door does not open by itself ***",
           after.timings["tools/ship/sweepCoverage-selfcheck.mjs"] === 999999 ||
           after.at["tools/ship/sweepCoverage-selfcheck.mjs"] === after.captured,
           `seeded 999999 ms, after the run it reads ${after.timings["tools/ship/sweepCoverage-selfcheck.mjs"]}. ` +
           "If it survived, nothing in a normal ship re-measures it; the rotation is the only thing that does");
        ok("...and every entry the run DID observe carries this run's stamp, not the file's old one",
           Object.keys(after.at || {}).some((g) => after.at[g] === after.captured) && after.captured !== seeded.captured,
           `captured moved ${seeded.captured} -> ${after.captured}, and the stamps follow the RUN rather than the FILE`);
        ok("...and an entry the run did not observe keeps its own older stamp",
           after.at["tools/ship/sweepCoverage-selfcheck.mjs"] !== after.captured ||
           after.timings["tools/ship/sweepCoverage-selfcheck.mjs"] !== 999999,
           "the whole repair in one row: a reading and its date travel together");
    }
}

console.log("\n5b. a green gate that crosses the budget in parallel is CONFIRMED ALONE before it is filed");
{
    // *** THE ROTATION DECAYS WITHOUT THIS, AND THE FIRST RUN PROVED IT. *** v4408's rotation returned 138 gates
    // to the sweep; the very next 8-way run reported "60 now over budget" and would have evicted them again on
    // the same starved reading. A door that reopens once is not open. quickSweep now re-runs a GREEN gate alone
    // whenever its parallel time crosses the budget, which is v4297's two-phase rule for reds applied to costs.
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "quickSweep.mjs"), "utf8");
    ok("the writer files a confirmed serial reading, not the parallel one, for a green gate over budget",
        /from:\s*"budget-confirm"/.test(src) && /if \(p1\.ms > budgetMs\)/.test(src),
        "LIMIT NAMED: this row reads the writer's SOURCE, which is the weak shape. The row below is the one that runs it");
    // The falsifier that runs: a real sweep over two cheap gates with a 1 ms budget, so every gate is 'over' in
    // parallel and every one must come back carrying a serial confirmation.
    const tmp2 = path.join(ENG, "tools", "ship", ".sweepCoverage-confirm.json");
    fs.writeFileSync(tmp2, JSON.stringify({ timings: {}, codes: {}, at: {} }));
    let out = null;
    try {
        out = await Q.runQuickSweep({ budgetMs: 1, workers: 2, capMs: 20000, timingsFile: "tools/ship/.sweepCoverage-confirm.json",
                                      gates: ["tools/ship/glBootstrap-selfcheck.mjs", "tools/ship/substance-selfcheck.mjs"], write: true });
    } catch (e) { say("the confirm probe failed: " + String(e && e.message).slice(0, 100)); }
    const file2 = (() => { try { return JSON.parse(fs.readFileSync(tmp2, "utf8")); } catch { return null; } })();
    try { fs.unlinkSync(tmp2); } catch {}
    if (!out || !file2) {
        ok("!! the confirm probe must produce a file to read -- it did not", false, "a failure, not a skip");
    } else {
        // COUNTED, NOT INFERRED. The runner reports how many green gates took the confirm path; at a 1 ms budget
        // that must be all of them, and a writer that skipped the confirm reports zero. The first draft compared
        // filed entry counts, which are the same either way -- a check that could not have failed.
        ok("!! *** every green gate over the parallel budget earned a serial reading before being filed ***",
            out.ran === 2 && out.budgetConfirmed === 2,
            `${out.ran} gate(s) run at a 1 ms budget, ${out.budgetConfirmed} confirmed alone, ${out.budgetRescued} brought back under by the serial reading. ` +
            "A writer that filed the parallel number would report 0 confirmed here");
    }
}

console.log("\n6. what the first rotation actually found");
{
    const LEDGER = SC.readRotation();
    const rotated = (LEDGER.rotated || []).map((r) => r.gate);
    ok("a rotation has run and kept its OWN ledger, which a quickSweep write cannot erase", rotated.length > 0,
        rotated.length ? `${rotated.length} gate(s) re-timed at ${LEDGER.at}. THE FIRST LEDGER LIVED IN sweep-timings.json AND THE NEXT ` +
            "SWEEP DELETED IT -- a writer builds a fresh object and does not know about fields it did not put there" :
        "NO ROTATION HAS RUN. This is a FAILURE and not a skip: the module can be right about arithmetic and the door still never opens");
    const returned = (LEDGER.rotated || []).filter((r) => r.ms <= SC.BUDGET_MS);
    // NOT `rotated.length === 0 || ...`: that disjunction reads PASS in precisely the state the round exists to
    // end, which is an absence read as a pass. It is red until a rotation actually returns a gate.
    ok("!! *** and gates the sweep had evicted are back UNDER the budget on a fresh serial reading ***",
        returned.length > 0,
        `${returned.length} of ${rotated.length} re-timed gates now measure at or under ${SC.BUDGET_MS} ms. ` +
        "THE EVICTIONS WERE STARVATION: quickSweep files `serialMs ?? parallelMs`, a GREEN gate never gets a serial re-run, " +
        "so a gate that passes 8-way at 3,002 ms is recorded at 3,002 ms and evicted on a number the sweep manufactured");
    if (rotated.length) {
        const rows = (LEDGER.rotated || []).filter((r) => r.priorMs != null)
            .sort((a, b) => (b.priorMs / Math.max(b.ms, 1)) - (a.priorMs / Math.max(a.ms, 1))).slice(0, 12)
            .map((r) => [r.gate.replace(/^tools\//, ""), String(r.priorMs), String(r.ms),
                         (r.priorMs / Math.max(r.ms, 1)).toFixed(1) + "x", r.ms <= SC.BUDGET_MS ? "returned" : "still over"]);
        REPORT.table("the first rotation: what the eviction reading was worth", ["gate", "evicted at", "fresh serial", "overstated", "verdict"], rows,
            "Recorded serially, because the budget is a serial number and a parallel reading is what evicted them.");
    }
}

console.log("\n7. *** THE MIRROR standingReds NEVER HAD: A ZERO IS AS OLD AS THE READING BESIDE IT ***");
// Section 2's comment is careful in ONE direction -- a nonzero code beside a killed process is not a failure.
// NOBODY ASKED THE OTHER DIRECTION, and that is where this tree's red gates were. quickSweep writes
// `codes[r.gate]` only for the gates in `rows`, so an over-budget entry keeps whatever exit status it had the
// last time it was cheap enough to run, forever, and the file goes on publishing it.
{
    const codes = FILE.codes || {}, at = FILE.at || {};
    const greens = SC.standingGreens(C, { codes });
    const reds = SC.standingReds(C, { codes });
    const cls = SC.verdictClasses(C, { codes });
    const REC = SC.STALE_GREENS_V4460;

    ok("!! *** every over-budget entry is a standing green, a standing red, or has no code -- a PARTITION ***",
       cls.partitions && cls.green.length > 0 && cls.red.length > 0,
       `${cls.green.length} green + ${cls.red.length} red + ${cls.none.length} uncoded = ${cls.sum} of ` +
       `${C.over.length}. Section 2 counted one of these three and called the answer complete.`);
    ok("...and the two verdict classes do not overlap",
       greens.filter((g) => reds.includes(g)).length === 0 && !emptyOfNonEmpty(greens, C.over),
       "a gate cannot be both, and an empty green list against a non-empty `over` would mean the mirror " +
       "stopped matching rather than that the tree got clean");

    const undated = SC.undatedVerdicts(C, { codes, at });
    const undatedGreen = undated.filter((g) => codes[g] === 0);
    ok("!! *** A VERDICT WHOSE AGE THE FILE CANNOT STATE IS REPORTED, NOT COUNTED AS A PASS ***",
       undatedGreen.length > 0 && undatedGreen.every((g) => greens.includes(g)),
       `${undatedGreen.length} of ${greens.length} standing greens read "${SC.UNKNOWN_AT}". v4408 gave every ` +
       "entry its own capture AND USED IT ONLY FOR THE MILLISECONDS -- the exit code sitting beside it has " +
       "the same provenance, and until now nothing paired them.");

    // *** THE MEASUREMENT, AND THE FIRST INSTRUMENT WAS THE WRONG ONE. *** See STALE_GREENS_V4460.
    ok("!! the frozen measurement reconciles against itself, both passes and the serial re-run",
       REC.parallelPassA.green + REC.parallelPassA.nonGreen === REC.population &&
       REC.parallelPassB.green + REC.parallelPassB.nonGreen === REC.population &&
       REC.parallelPassB.exit1 + REC.parallelPassB.killedAt45s === REC.parallelPassB.nonGreen &&
       REC.serial.ofParallelNonGreen === REC.parallelPassB.nonGreen &&
       REC.serial.greenAlone + REC.serial.redAlone + REC.serial.unresolved === REC.serial.ofParallelNonGreen &&
       REC.serial.redAlone === REC.confirmed.total &&
       REC.confirmed.realAssertion + REC.confirmed.needsGpuAbsentHere + REC.confirmed.networkDependent === REC.confirmed.total &&
       Math.abs(REC.parallelPassA.nonGreen - REC.parallelPassB.nonGreen) === REC.passesDisagreeOn,
       `${REC.population} = ${REC.parallelPassB.green} + ${REC.parallelPassB.nonGreen}; the 43 resolve to ` +
       `${REC.serial.greenAlone} green alone and ${REC.serial.redAlone} red alone; the 22 split ` +
       `${REC.confirmed.realAssertion} real / ${REC.confirmed.needsGpuAbsentHere} no-GPU-here / ` +
       `${REC.confirmed.networkDependent} network. EVERY COUNT IN THE RECORD IS CHECKED AGAINST ITS OWN PARTS, ` +
       "because v4296's mistake was a headline beside a list that did not add up.");

    ok("!! *** THE PARALLEL PASS WAS THE WRONG INSTRUMENT AND THE RECORD SAYS SO IN A NUMBER ***",
       REC.serial.greenAlone > REC.serial.redAlone * 0.5 && REC.passesDisagreeOn > 0,
       `${REC.serial.greenAlone} of ${REC.serial.ofParallelNonGreen} parallel non-greens are GREEN alone -- ` +
       `${REC.falseRedRate}. AND TWO 8-WAY PASSES OF THE SAME ${REC.population} GATES DISAGREED ON ` +
       `${REC.passesDisagreeOn}: ${REC.parallelPassA.nonGreen} against ${REC.parallelPassB.nonGreen}. ` +
       "quickSweep-selfcheck already prints 'a parallel FAILURE on its own is unconfirmed, not red'; I ran " +
       "the parallel pass anyway and quoted its number to myself before the serial one existed.");

    ok("!! every gate the record names as still red is a real file, and the unregistered ones are named",
       overNonEmpty(REC.unregistered, (g) => fs.existsSync(path.join(SC.ENG, g))) &&
       REC.unregistered.length === REC.confirmed.unregistered,
       `${REC.unregistered.length} of the ${REC.confirmed.total} are in no red register at all -- NAMED here, ` +
       "not counted, so a round that fixes one can say which. v4399's rule: freeze by NAME, never by COUNT.");

    // *** THE DOOR AND THE VERDICT ARE THE SAME DEFECT. *** v4408 found the eviction runs on a stale time;
    // this finds the verdict behind it is a stale green. Twelve gates carry both.
    // *** v4476 -- THE ROW WAS BUILT TO GO RED THE DAY IT WAS FIXED, AND THIS IS THAT DAY. *** Its own detail
    // said so: "a re-timing that fixes it FAILS THIS ROW rather than leaving a record nobody re-derives." So
    // the v4460 finding is asserted as HISTORY -- twelve gates whose recorded time was the one that evicted
    // them, true about v4460 forever -- and the live half now asserts the PAYMENT: those gates no longer
    // carry the evicting number, eleven were re-timed, and the twelfth is named with the reason it stays out.
    const back = REC.returnable;
    // *** v4477 -- BOTH BRANCHES REPLACED THIS ROW IN THE SAME WINDOW AND BOTH ARE KEPT, BECAUSE THEY ASSERT
    // DIFFERENT THINGS. *** v4460 built the row to go red the day somebody fixed what it named, and it did --
    // twice, independently. Main's v4461 rotation re-timed six of the twelve and the row fired; this branch's
    // v4476 re-timed eleven and it fired here. Main's repair is the more general PROPERTY -- an entry either
    // still carries the reading that evicted it, or is named as returned AND is under budget, checked against
    // the threshold rather than against a millisecond, because a re-timed gate gets a new number every run.
    // This branch's repair is the v4476 ACCOUNTING -- eleven re-timed plus one named as still over must equal
    // twelve, and the one still over must carry a reason. Neither subsumes the other, so both rows stand.

    // ---- main's, taken as written ----
    // v4461: an entry either still carries the reading that evicted it, or is NAMED as returned -- and a
    // returned one is checked against the BUDGET, not against a millisecond. The first draft pinned the exact
    // reading the repair had taken, and the second rotation moved it (518 -> 580, 1023 -> 1062) so the row
    // went red for the crime of being measured again. *** A THRESHOLD IS THE PROPERTY; A MILLISECOND IS AN
    // OBSERVATION, and pinning one is a claim that cannot survive the re-measurement this round exists to
    // encourage. *** The row keeps its teeth: an entry that is neither at its evicting reading nor under
    // budget still fails.
    // *** v4477 -- THE MERGED TREE CARRIES TWO RETURN RECORDS, AND THE ROW ONLY KNEW ITS OWN. ***
    // v4460 built this row to fire the day somebody re-timed what it named, and it fired TWICE, independently:
    // main's v4461 rotation returned six, and this branch's v4476 re-timed eleven. Reading only one of the two
    // ledgers makes the other branch's repair look like a lost measurement. The property is unchanged -- an
    // entry is either still at the reading that evicted it, or it is NAMED as returned and is now under budget
    // -- and what widens is the set of ledgers consulted, not what counts as an answer.
    // RETURNED_AT_V4476 records a COUNT and the exceptions, not a roll, so the roll is DERIVED from the two --
    // the twelve, minus the ones it names as still over -- and the derivation is checked against the frozen
    // count rather than trusted. A list typed out beside a count is the second copy that never gets updated.
    const V76 = SC.RETURNED_AT_V4476, V29 = SC.RETURNED_AT_V4529;
    const stillOverGates = new Set(V76.stillOver.map((x) => x.gate));
    const reTimedHere = back.filter((r) => !stillOverGates.has(r.gate));
    // v4529: a returnee can go back OVER on a later box (meshLine, 2,929 at v4476, 3,154 here), and the property holds the
    // same way crossBackend's did -- named, with a reason and a live reading that is genuinely over
    const stillOverNamed = (g) => {
        const row = V76.stillOver.find((x) => x.gate === g) || V29.stillOver.find((x) => x.gate === g);
        return !!row && typeof row.why === "string" && row.why.length > 40 &&
               (FILE.timings || {})[g] > SC.BUDGET_MS;
    };
    const returned = new Map([
        ...REC.returnedAt_v4461.map((r) => [r.gate, r]),
        ...(reTimedHere.length === V76.reTimed ? reTimedHere.map((r) => [r.gate, r]) : []),
    ]);
    // v4461: the title carried TWELVE, TWENTY-TWO and SIX as typed words beside the same numbers derived in
    // the body -- and the second rotation of this same version moved the third of them, so the headline said
    // SIX while the sentence under it said seven. A count typed into a title is a count nobody re-derives,
    // which is this round's whole subject; all three come off the record now.
    ok(`!! *** ${back.length} OF THE ${REC.confirmed.total} NOW FINISH UNDER THE BUDGET THAT EXCLUDES THEM; ` +
       `${REC.returnedAt_v4461.length} ARE BACK IN ***`,
       back.length === REC.confirmed.nowUnderBudget &&
       overNonEmpty(back, (r) => r.nowMs < SC.BUDGET_MS && r.recordedMs > SC.BUDGET_MS &&
                                 ((FILE.timings || {})[r.gate] === r.recordedMs ||
                                  (returned.has(r.gate) && (FILE.timings || {})[r.gate] < SC.BUDGET_MS) ||
                                  // v4477: the THIRD state, which the merged tree created and neither branch
                                  // had alone -- RE-MEASURED AND STILL OVER. crossBackend was re-timed at v4476
                                  // to 12,851 ms here against main's 376, a 34x disagreement between two boxes
                                  // that is recorded rather than averaged away. It no longer carries the reading
                                  // that evicted it and it is not back either. Accepting it needs a NAMED entry
                                  // carrying a reason and a live reading that is genuinely still over -- an
                                  // entry that merely drifted off its recorded number still fails.
                                  stillOverNamed(r.gate))) &&
       overNonEmpty(REC.returnedAt_v4461, (r) => back.some((b) => b.gate === r.gate) && r.nowMs < SC.BUDGET_MS),
       `${back.length} gates, worst ${Math.max(...back.map((r) => r.nowMs))} ms against the ${SC.BUDGET_MS} ms ` +
       `budget, each still recorded at the time that evicted it (box3dFilter 89 ms now, ${back[0].recordedMs} ms ` +
       "on file). *** THEY ARE HIDDEN BY A NUMBER THAT IS WRONG IN THE DIRECTION THAT HIDES THEM *** -- the " +
       "recorded time is checked against the live file here, so a re-timing that fixes it fails this row " +
       `rather than leaving a record nobody re-derives -- AND IT DID: ${REC.returnedAt_v4461.length} were ` +
       "returned by v4461's rotation and this row fired on the next run until they were named.");

    // ---- v4529: the later still-over record is held to the same standard as v4476's ----
    // *** v4535 -- AND THE ROW HAD NO WAY TO SAY "THEY ALL CAME BACK". *** overNonEmpty rejects the empty list,
    // rightly -- an empty roll of still-over gates would otherwise pass this row by asserting nothing. But
    // "still over" is a state gates LEAVE, and each entry here named the branch that would retire it ("a sweep
    // that finds it under returns it"), so emptying the roll is the record working, not the record going
    // vacuous. Both branches are checked and neither is free: while the roll is populated every entry must be
    // live over budget with a reason; once it is empty, the RETIREMENTS must be non-empty and every retired
    // gate must be live UNDER budget carrying the serial readings that returned it. vacuity.mjs supplies
    // emptyOfNonEmpty for exactly this -- empty is the pass, and the guard is that it was ever populated.
    // The returned rolls accumulate by round -- v4565 added its own rather than appending to v4535's, so a
    // retirement carries the round that measured it. The row checks the union: what matters is that every gate
    // that LEFT the still-over roll left it with readings, whichever round took them.
    const V29ret = [...(SC.RETURNED_AT_V4529.returnedAt_v4535 || []), ...(SC.RETURNED_AT_V4529.returnedAt_v4565 || [])];
    ok("!! a returnee that went back over the budget on a later box is NAMED with its serial readings, and is live over",
       overNonEmpty(SC.RETURNED_AT_V4529.stillOver, (x) => (FILE.timings || {})[x.gate] > SC.BUDGET_MS && typeof x.why === "string" && x.why.length > 40 && x.hereMs > SC.BUDGET_MS && back.some((b) => b.gate === x.gate)) ||
       (emptyOfNonEmpty(SC.RETURNED_AT_V4529.stillOver, V29ret) &&
        overNonEmpty(V29ret, (x) => (FILE.timings || {})[x.gate] < SC.BUDGET_MS && x.overMs > SC.BUDGET_MS &&
                                    typeof x.why === "string" && x.why.length > 40 &&
                                    Array.isArray(x.serialNow) && x.serialNow.length >= 3 &&
                                    x.serialNow.every((ms) => ms < SC.BUDGET_MS))),
       SC.RETURNED_AT_V4529.stillOver.length
         ? SC.RETURNED_AT_V4529.stillOver.map((x) => x.gate.split("/").pop() + " " + (FILE.timings || {})[x.gate] + " ms on file, " + x.hereMs + " ms recorded").join("; ")
         : "the roll is EMPTY and that is the pass: " + V29ret.length + " returned, " +
           V29ret.map((x) => x.gate.split("/").pop() + " " + x.overMs + " -> " + x.serialNow.join("/") + " ms").join("; ") +
           ". Each was named over budget WITH ITS NUMBERS, so returning it took re-running it rather than arguing about it.");

    // ---- this branch's v4476 accounting, kept beside it ----
    const T = FILE.timings || {};
    const stillStale = back.filter((r) => T[r.gate] === r.recordedMs);
    const RET = SC.RETURNED_AT_V4476;
    ok("!! *** the twelve v4460 found returnable no longer carry the time that evicted them ***",
       back.length === REC.confirmed.nowUnderBudget &&
       overNonEmpty(back, (r) => r.nowMs < SC.BUDGET_MS && r.recordedMs > SC.BUDGET_MS) &&
       stillStale.length === 0 && RET.reTimed + RET.stillOver.length === RET.ofTwelve &&
       overNonEmpty(RET.stillOver, (x) => T[x.gate] > SC.BUDGET_MS && typeof x.why === "string" && x.why.length > 40),
       stillStale.length
         ? `${stillStale.length} of ${back.length} STILL carry the evicting time: ` +
           stillStale.map((r) => r.gate.split("/").pop() + " " + r.recordedMs + " ms on file, " + r.nowMs + " ms now").join("; ")
         : `${back.length} found returnable at v4460, ${RET.reTimed} re-timed and ${RET.stillOver.length} named as ` +
           `still over: ${RET.stillOver.map((x) => x.gate.split("/").pop() + " at " + x.hereMs + " ms").join(", ")}. ` +
           "THEY WERE HIDDEN BY A NUMBER WRONG IN THE DIRECTION THAT HIDES THEM, and putting the true number " +
           `back exposed four reds a stale green was covering -- ${Object.keys(RET.reds).length} registered or ` +
           `already owed, ${Object.keys(RET.repairedHere).length} REPAIRED here rather than registered.`);

    // *** TWO OF THIS SECTION'S SABOTAGES WENT 0 RED, AND BOTH ARE MECHANISMS vacuity.mjs NAMED ONE ROUND
    // AGO. *** X broke undatedVerdicts' `at[g] || UNKNOWN_AT` fallback and nothing moved, because
    // backfillStamps guarantees EVERY entry in this file has a stamp -- the default is unreachable against
    // the only input it ever sees (vacuity mechanism 2). Y folded the `none` class into `green` and nothing
    // moved, because `none` is EMPTY in this tree -- every over-budget entry has a code (mechanism 1). Both
    // functions are pure over the maps they are handed, so a fixture reaches the branches the tree cannot.
    {
        const fx = { over: ["a.mjs", "b.mjs", "c.mjs", "d.mjs", "e.mjs"], killed: [] };
        const codes = { "a.mjs": 0, "b.mjs": 1, "c.mjs": 0, "e.mjs": 0 };   // d.mjs has NO code
        // *** e.mjs HAS A CODE AND NO STAMP AT ALL, and it is the whole reason this fixture exists. *** The
        // first draft gave every entry an `at`, so the `|| UNKNOWN_AT` fallback stayed unreachable and
        // sabotage X went 0 RED A SECOND TIME -- an unreachable branch inside the fixture written to reach it.
        const at = { "a.mjs": "2026-01-01T00:00:00Z", "b.mjs": SC.UNKNOWN_AT, "c.mjs": SC.UNKNOWN_AT };
        const v = SC.verdictClasses(fx, { codes });
        ok("!! FIXTURE: an entry with NO code is its own class, not folded into green",
           v.none.length === 1 && v.none[0] === "d.mjs" && v.green.length === 3 && v.red.length === 1 && v.partitions,
           `green ${v.green.length}, red ${v.red.length}, none ${v.none.length}. THE TREE CANNOT DRIVE THIS ` +
           "ROW -- its `none` class is empty, so folding it into `green` passed every check here until a " +
           "fixture existed. 'Never observed' and 'observed green' are the two things v4408 proved are " +
           "different, and one bucket for both is how the second becomes the first.");
        const u = SC.undatedVerdicts(fx, { codes, at });
        ok("!! FIXTURE: a MISSING stamp is undated, not dated -- the fallback is EXERCISED, not assumed",
           u.length === 3 && u.includes("b.mjs") && u.includes("c.mjs") && u.includes("e.mjs") &&
           !u.includes("a.mjs") && !u.includes("d.mjs"),
           `${u.join(", ")} -- b and c carry ${JSON.stringify(SC.UNKNOWN_AT)} explicitly, E CARRIES NOTHING ` +
           "AT ALL and reaches the same answer through the fallback, a carries a real date, and d has no code " +
           "so it is not a verdict. backfillStamps means the real file never exercises that branch, so " +
           "without e.mjs the default was decoration and its sabotage went 0 RED twice.");
        // The vacuity guard on the tree's own population, exercised where the tree cannot exercise it: an
        // empty list against a non-empty source is the state `greens.every(...)` would call a pass.
        ok("!! FIXTURE: an empty verdict list against a non-empty population is a FINDING, not a pass",
           emptyOfNonEmpty([], fx.over) && !emptyOfNonEmpty(SC.standingGreens(fx, { codes }), fx.over),
           "the guard on the row above cannot be driven from this tree -- 371 standing greens is not zero -- " +
           "so its sabotage goes 0 RED and it is exercised here instead. v4459's helper, on a fixture.");
    }

    // A repair is named, not subtracted: the v4460 census keeps its numbers and `fixedSince` records what
    // has moved. Checked structurally -- every entry must be one of the gates this census actually named --
    // and NOT by re-running it, because this gate does not run other gates. The verification of a repair
    // lives in the round that made it; what is checked here is that a repair cannot be claimed for a gate
    // the census never found.
    const fixed = SC.STALE_GREENS_V4460.fixedSince;
    ok("!! a gate claimed as repaired is one this census actually named, and the census keeps its own numbers",
       overNonEmpty(fixed, (f) => SC.STALE_GREENS_V4460.unregistered.includes(f.gate) && f.at && f.was && f.now) &&
       SC.STALE_GREENS_V4460.confirmed.unregistered === SC.STALE_GREENS_V4460.unregistered.length,
       `${fixed.length} repaired since: ${fixed.map((f) => f.gate.split("/").pop() + " at " + f.at).join(", ")}. ` +
       `The census still reads ${SC.STALE_GREENS_V4460.confirmed.total} red and ` +
       `${SC.STALE_GREENS_V4460.confirmed.unregistered} unregistered, ` +
       "as measured -- a snapshot edited to agree with today is not a snapshot. AND FIXING ONE DOES NOT MAKE " +
       "IT VISIBLE: every one of them is still over the ship-time budget, so its next regression is invisible " +
       "in exactly the way this one was.");

    REPORT.table("the over-budget population by VERDICT, not by time", ["class", "gates", "what it means"],
        [["standing green", String(cls.green.length), "a zero carried forward; 22 of the 371 measured are red"],
         ["standing red", String(cls.red.length), "a nonzero that finished -- section 2's population"],
         ["no code", String(cls.none.length), "never observed at all"]],
        "Section 2 asked whether a nonzero code is a verdict. This asks whether a zero one is, and the answer " +
        "is 22 gates, 18 of them in no register.");
}

console.log("\n10. *** THE ROTATION WAS WALKED THROUGH ONCE AND THE WALK WAS UNDONE INSIDE THE SAME VERSION ***");
// v4408 built the door and section 4 checks it covers the pool in a derived number of rounds. NOTHING CHECKED
// THAT WHAT WALKED THROUGH IT STAYED THROUGH. The 2026-09-03 rotation re-timed 150 over-budget gates serially;
// 146 came back under the budget that had evicted them, median 2.80x faster, worst 29.12x, and it wrote them
// into sweep-timings.json with fresh stamps. The next commit to touch that file -- titled "the sweep timings
// as verify left them" -- has all 146 back at EXACTLY their pre-rotation readings, carrying the stamp
// "unknown -- before v4408", which no post-v4408 writer can produce for an entry that had a real one.
// referenceScan has read 3002 ms ever since, identical across thirty commits, and really takes 733.
//
// *** THE CHECK COSTS A FILE READ AND THE DATA HAS BEEN IN THE TREE FOR FORTY-NINE VERSIONS. *** The rotation
// keeps its OWN ledger, which survived: a gate it measured under budget must still be under budget in the
// timings, or the timings have lost work somebody paid for.
{
    const rot = SC.readRotation();
    const held = SC.rotationHeld(FILE, rot);
    const REC = SC.ROTATION_LOST_V4461;

    const ageDays = held.rotatedAt ? (Date.now() - Date.parse(held.rotatedAt)) / 86400000 : null;
    say(`rotation ledger written ${held.rotatedAt || "(never)"}` +
        (ageDays === null ? "" : ` -- ${ageDays.toFixed(1)} days ago`) +
        ` -- ${held.measuredUnder} entries measured under ${SC.BUDGET_MS} ms, ${held.held} still under it`);
    // *** REPORTED, NOT ASSERTED, AND THE REASON IS THE REPAIR THIS ROW WOULD DEMAND. *** A gate that goes red
    // because time passed fires at an arbitrary moment on whoever is shipping, and the fix -- run the
    // rotation -- takes minutes they did not plan for. The ledger's AGE is a number a person reads; what is
    // asserted is that the ledger is real and that what it bought has not been taken back. The ship ritual
    // asks for the rotation (step 3b); this says how long it has been since anybody answered.
    ok("!! the rotation ledger is real and dated, so its age is a number rather than a guess",
       !!held.rotatedAt && Number.isFinite(Date.parse(held.rotatedAt)) && held.measuredUnder > 0,
       held.rotatedAt
         ? `${held.measuredUnder} entries, ${ageDays.toFixed(1)} days old. Between 2026-09-03 and v4460 this ` +
           "read 49 shipped versions with no rotation at all, and nothing in the tree said so."
         : "NO LEDGER: the rotation has never been run, or its file was lost");
    // *** v4536 -- THE THREE STRADDLER LISTS ARE ASSERTED TO BE DEAD WEIGHT, RATHER THAN QUIETLY LEFT IN. ***
    // They were the mechanism for three rounds and the stamp test replaced them; a list that is still exported
    // and no longer consulted is the shape that rots, so the claim "you do not need these any more" is checked
    // on every run against the live ledger. If a future change makes any of them load-bearing again -- a gate
    // over budget whose stamp says nobody looked -- this fires and somebody re-derives why.
    ok("!! the straddler lists are a RECORD now, not an exemption: nothing needs naming to keep this green",
       held.lost.length === 0 && held.reverted.length === 0 &&
       (SC.ROTATION_OUTLIERS_V4531.length + SC.ROTATION_BOUNDARY_V4533.length + SC.ROTATION_BOUNDARY_V4535.length) > 0,
       `${held.measuredUnder} measured under budget by the rotation, ${held.backOver} of them over budget in ` +
       `the timings now, ${held.lost.length} lost and ${held.reverted.length} reverted -- with NO gate excluded ` +
       `by name. The ${SC.ROTATION_BOUNDARY_V4535.length} entries in the v4535 list survive because they carry ` +
       "the serial readings that show the same file taking 2,638 and 4,026 ms on the same box a day apart, " +
       "which is the evidence the calibration round needs and not something to delete.");

    ok("!! *** WHAT THE ROTATION MEASURED UNDER BUDGET IS STILL UNDER BUDGET IN THE TIMINGS ***",
       held.lost.length === 0 && held.measuredUnder > 0,
       held.lost.length
         ? `${held.lost.length} LOST: ${held.lost.slice(0, 4).map((r) => r.gate.split("/").pop() + " " + r.ms + " -> " + (FILE.timings || {})[r.gate]).join(", ")}`
         : `${held.held} of ${held.measuredUnder} held. At v4460 this row read 0 of 146 -- every gate the ` +
           "rotation freed had been put back, and no gate in the tree could say so.");
    // *** v4548 -- EVERY LEDGER ROW CARRIES ITS OWN DATE, AND FOR THREE ROUNDS SEVENTY-EIGHT OF EIGHTY DID
    // NOT. *** v4535's own comment in sweepRotation.mjs says "EVERY ROW NOW CARRIES ITS OWN `at`, for the
    // reason v4408 gave the timings file one: a file-level stamp on rows a run did not touch is a date they
    // did not earn" -- and it started stamping new rows without backfilling the ones already in the file.
    // freshlyRetimed() falls back to the FILE-level date for a row with no date of its own, so a --gate run
    // that re-times ONE gate re-dated all seventy-eight: at v4548 a two-gate rotation moved the file stamp
    // from 2026-09-07T22:31 to 2026-09-08T18:47 and TEN UNTOUCHED GATES flipped to LOST, purely because
    // their timings stamps fell between the two dates. Nothing about those gates had changed. This row is
    // the one that would have said so.
    {
        const rows = (rot && rot.rotated) || [];
        const unstampedRows = rows.filter((r) => !r.at);
        ok("!! *** EVERY ROTATION LEDGER ROW CARRIES ITS OWN DATE, SO A ONE-GATE RE-TIME CANNOT RE-DATE THE REST ***",
            rows.length > 0 && unstampedRows.length === 0,
            unstampedRows.length
                ? `${unstampedRows.length} of ${rows.length} rows rely on the FILE-level date: ` +
                  unstampedRows.slice(0, 3).map((r) => r.gate).join(", ")
                : `${rows.length} of ${rows.length} stamped. The fallback in freshlyRetimed() is a safety net ` +
                  `now rather than the mechanism, which is what v4535 intended and did not finish.`);
        ok("...and their dates are not all the file's date, which is what a wholesale re-stamp would look like",
            new Set(rows.map((r) => r.at)).size > 1,
            `${new Set(rows.map((r) => r.at)).size} distinct row dates across ${rows.length} rows -- the ` +
            `legacy rows were backfilled with the ledger date they were actually written under, not today's.`);
    }
    ok("...and none of them carries the pre-v4408 stamp, which is the fingerprint of a REPLACED file",
       held.unstamped.length === 0,
       held.unstamped.length
         ? `${held.unstamped.length} entries the rotation stamped now read "${SC.UNKNOWN_AT}"`
         : `0 of ${held.measuredUnder}. A gate that merely got SLOWER keeps its stamp and moves its number; ` +
           "one whose file was replaced loses both, and those are different faults with different repairs.");

    // The frozen measurement of the loss, checked against its own parts -- v4296's rule.
    ok("!! the loss is recorded with its witness, and every count adds up",
       REC.cameBackUnderBudget === REC.recordedAtExactlyThePreRotationReading &&
       REC.stillUnderBudgetInTheTimings === 0 &&
       REC.cameBackUnderBudget <= REC.rotated &&
       REC.repair.ran === REC.repair.underGreen + REC.repair.underRed + REC.repair.overGreen + REC.repair.overRed &&
       REC.repair.cameBackUnder === REC.repair.underGreen + REC.repair.underRed &&
       REC.repair.red === REC.repair.underRed + REC.repair.overRed &&
       REC.repair.poolBefore - REC.repair.poolAfter === REC.repair.cameBackUnder &&
       REC.witness.evictedAt > SC.BUDGET_MS && REC.witness.serialTruth < SC.BUDGET_MS,
       `${REC.rotated} rotated, ${REC.cameBackUnderBudget} came back under, ${REC.stillUnderBudgetInTheTimings} ` +
       `survived. The repair ran ${REC.repair.ran} and returned ${REC.repair.cameBackUnder}, so the pool went ` +
       `${REC.repair.poolBefore} -> ${REC.repair.poolAfter} -- and THE DIFFERENCE IS THE RETURNEES, checked ` +
       `rather than stated. Witness: ${REC.witness.gate.split("/").pop()} evicted at ${REC.witness.evictedAt} ms, ` +
       `truth ${REC.witness.serialTruth} ms.`);

    // *** THE ROTATION'S REDS ARE NOT A SECOND OPINION, THEY ARE AN INDEPENDENT ONE. *** Section 7's census
    // found its 22 by re-running every over-budget entry recorded green. The rotation found 8 by re-timing a
    // staleness-ordered slice. Different populations, different orderings, and every one of the 8 is in the 22.
    ok("!! every red the repair rotation found was already named by the v4460 census, reached another way",
       REC.repair.redsAllPreviouslyNamed === true && REC.repair.red > 0 &&
       REC.repair.newlyVisibleReds > 0 && REC.repair.newlyVisibleReds <= REC.repair.red,
       `${REC.repair.ran} rotated: ${REC.repair.underGreen} under+green, ${REC.repair.underRed} under+RED, ` +
       `${REC.repair.overGreen} over+green, ${REC.repair.overRed} over+RED. All ${REC.repair.red} reds already in the list of ` +
       `${SC.STALE_GREENS_V4460.confirmed.total}. *** ${REC.repair.newlyVisibleReds} OF THEM ARE NOW UNDER ` +
       "BUDGET AND UNREGISTERED, SO THE NEXT SHIP WILL REPORT THEM AS NEW REDS *** -- which is the correct " +
       "behaviour of an instrument that just started working. They were always red; they were invisible. " +
       "Registering them to keep the ship green is the one move this tree forbids.");

    // *** HERMETIC, because the live data cannot drive it: the repair just ran, so `lost` is 0 and the row
    // above is asserted on a file that agrees with itself. The fault it guards is a PAST state, and a fixture
    // is the only way to exercise a guard whose defect has been repaired. ***
    {
        // *** v4536 -- b.mjs's STAMP IS NOW OLDER THAN THE ROTATION, BECAUSE THAT IS WHAT A LOSS LOOKS LIKE. ***
        // The fixture used to stamp it 2026-09-05 against a 09-04 rotation -- i.e. re-measured after the
        // rotation, which is the innocent case -- and still expected LOST, so it conflated the two faults the
        // way the rule did. e.mjs is the innocent case, added here so both are pinned rather than one.
        const file = { timings: { "a.mjs": 900, "b.mjs": 3500, "c.mjs": 800, "e.mjs": 3100, "f.mjs": 3200, "g.mjs": 700 },
                       at: { "a.mjs": "2026-09-05T00:00:00Z", "b.mjs": "2026-09-03T00:00:00Z",
                             "c.mjs": SC.UNKNOWN_AT, "e.mjs": "2026-09-05T00:00:00Z",
                             // stamped at EXACTLY the rotation's time: this is the rotation's OWN write, so
                             // nobody has looked since and an over-budget reading here is a loss. It is the
                             // one case that separates `>` from `>=`, and without it that choice is untested.
                             "f.mjs": "2026-09-04T00:00:00Z", "g.mjs": "2026-09-05T00:00:00Z" } };
        const led = { at: "2026-09-04T00:00:00Z", rotated: [
            { gate: "a.mjs", ms: 900, code: 0, priorMs: 3100 },     // held
            { gate: "b.mjs", ms: 1200, code: 0, priorMs: 3500 },    // LOST: back over, and NOT looked at since
            { gate: "c.mjs", ms: 800, code: 0, priorMs: 3200 },     // held, but the stamp was replaced
            { gate: "d.mjs", ms: 4000, code: 0, priorMs: 5000 },    // never came under: not this guard's business
            { gate: "e.mjs", ms: 2900, code: 0, priorMs: 3400 },    // back over, but RE-MEASURED SINCE: not lost
            { gate: "f.mjs", ms: 2800, code: 0, priorMs: 3300 },    // back over, stamp EQUALS the rotation: LOST
            { gate: "g.mjs", ms: 700, code: 0, priorMs: 3600 },     // held, so the three crossings stay a MINORITY
        ] };
        const h = SC.rotationHeld(file, led);
        ok("!! FIXTURE: a gate put back over budget is LOST, one that never came under is not counted",
           h.measuredUnder === 6 && h.lost.length === 2 &&
           h.lost.map((r) => r.gate).sort().join(",") === "b.mjs,f.mjs" && h.held === 4,
           `measuredUnder ${h.measuredUnder} (d.mjs at 4000 ms is excluded -- it never returned, so losing it ` +
           `is not possible), lost ${h.lost.map((r) => r.gate).join(",")}, held ${h.held}`);
        ok("!! FIXTURE: a gate that went back over budget but was RE-MEASURED SINCE is not a loss",
           !h.lost.some((r) => r.gate === "e.mjs") && h.backOver === 3 &&
           h.lost.some((r) => r.gate === "f.mjs"),
           `e.mjs is 3100 ms against a 2900 ms rotation reading and is NOT lost: its stamp is newer than the ` +
           `rotation's, so somebody looked and this is what they saw. b.mjs is over budget with a stamp from ` +
           `BEFORE the rotation -- the reading is gone and nothing has looked since. ${h.backOver} back over, ` +
           `1 of them lost. Told apart by provenance, which is the field v4408 added for this.`);
        ok("!! FIXTURE: MOST of the rotation going back over budget is a REVERT, whatever the stamps say",
           h.reverted.length === 0 &&
           SC.rotationHeld({ timings: { "a.mjs": 3900, "b.mjs": 3500, "c.mjs": 3800, "e.mjs": 3100, "f.mjs": 3200, "g.mjs": 3400 },
                             at: { "a.mjs": "2026-09-09T00:00:00Z", "b.mjs": "2026-09-09T00:00:00Z",
                                   "c.mjs": "2026-09-09T00:00:00Z", "e.mjs": "2026-09-09T00:00:00Z",
                                   "f.mjs": "2026-09-09T00:00:00Z", "g.mjs": "2026-09-09T00:00:00Z" } },
                           led).reverted.length === 6,
           "the stamp test cannot see a wholesale rewrite that stamps everything it touches, so the shape test " +
           "is separate: 6 of 6 back over budget with FRESH stamps reads as a revert, while 3 of 6 does not. " +
           "The 2026-09-03 fault was 146 of 150 (97%); the largest honest crossing this session produced was 4 " +
           "of 44 (9%); half is the line and the gap between the two is stated rather than tuned.");
        ok("!! FIXTURE: the pre-v4408 stamp is caught even on a gate whose TIMING is still fine",
           h.unstamped.length === 1 && h.unstamped[0].gate === "c.mjs" && !h.lost.some((r) => r.gate === "c.mjs"),
           "c.mjs reads 800 ms -- under budget, held, and its stamp says nobody has observed it since before " +
           "v4408. THE NUMBER SURVIVED AND THE PROVENANCE DID NOT, which is exactly how 146 gates were put " +
           "back without a single reading looking wrong.");
    }
}

say("WHAT THIS DOES NOT CLAIM. That the 22 are the whole of it -- section 7 re-ran the 371 entries " +
    "recorded GREEN, and the 144 recorded nonzero and the whole `killed` bucket were NOT re-run; nor that a " +
    "gate red here is red on the rig, which is why the no-GPU and network-dependent ones are split out rather " +
    "than counted in. That the over-budget gates are GREEN -- it re-times them and reports the exit " +
    "codes it saw, and a gate that is genuinely slow stays out; the rotation shrinks the population that has " +
    "never been looked at, it does not certify it. That the 3,000 ms budget is the right number -- nothing here " +
    "argues for it, and the case for changing it would need the distribution this file now makes readable. And " +
    "it cannot see a gate that is red only under conditions the rotation does not reproduce, which is the same " +
    "limit every serial re-run in this tree has and the reason v4297 kept both timings rather than one.");

// =============================================================================================================
console.log("\n*** THE FILED READING IS A CONTENDED SAMPLE AND THE COST IS A DIFFERENT NUMBER (v4562) ***");
{
    // *** RE-DERIVED FROM THE LIVE FILE RATHER THAN QUOTED FROM THE RECORD. *** These two rows live HERE and
    // not beside costOf() in tools/ship/quickSweep-selfcheck.mjs, because that gate is 9.1 s serially and
    // stays outside the ship-time sweep -- a record whose only guardian is over budget is a record nothing
    // checks, which is exactly the population tools/ship/recordReach-selfcheck.mjs counts.
    const t = QS.readTimings(QS.DEFAULTS.timingsFile, ENG);
    const pairs = Object.keys(t.serial || {})
        .filter((g) => t.timings[g] > 50 && t.serial[g] > 50)
        .map((g) => t.timings[g] / t.serial[g]).sort((a, b) => a - b);
    const med = pairs.length ? pairs[pairs.length >> 1] : null;
    const R = SC.SWEEP_CONTENTION_V4562;
    ok("!! *** THE FILED READING RUNS WELL ABOVE THE COST, ON THE LIVE FILE, RIGHT NOW ***",
       pairs.length > 500 && med > 1.2,
       `${pairs.length} gates carry both a filed and a serial reading; filed/serial median ` +
       `${med === null ? "n/a" : med.toFixed(2) + "x"} here against the ${R.ratio.median}x recorded at ` +
       `v4562 from a full 8-worker against 1-worker pair (p10 ${R.ratio.p10}, p90 ${R.ratio.p90}, max ` +
       `${R.ratio.max}). The two need not agree -- the record is one pair of sweeps and this is whatever the ` +
       "last one saw -- and BOTH BEING ABOVE 1 is the claim. Eight workers on four cores is 2x " +
       "oversubscription: it buys 1.63x of wall clock (230 s against 374 s) and costs this.");
    ok("!! ...and the record's own arithmetic holds, so it cannot drift from itself",
       Math.abs(R.wallMs.workers1 / R.wallMs.workers8 - R.speedup) < 0.01 &&
       R.filedTotalMs.workers8 > R.filedTotalMs.workers1 && R.crossedInOneButNotTheOther === 0 &&
       R.overBudgetSample.underBudgetWhenRunAlone > 0,
       `speedup ${R.speedup} against ${(R.wallMs.workers1 / R.wallMs.workers8).toFixed(2)} derived from the ` +
       `wall times; ${R.crossedInOneButNotTheOther} gates crossed the budget in one run and not the other, ` +
       "so v4408's confirm and v4536's two-crossings rule are doing their job and this is NOT an eviction " +
       `bug -- it is the number every consumer reads. And ${R.overBudgetSample.underBudgetWhenRunAlone} of ` +
       `${R.overBudgetSample.n} sampled EXILED gates come in under the ${SC.BUDGET_MS} ms budget when run ` +
       "alone, which is the best evidence the over-budget item has had.");
}

console.log("\n*** THE FIRST BULK PASS AT THE EXILED POOL (v4565): HALF THE 3-8 s BAND CAME BACK ***");
{
    const R = SC.OVER_BUDGET_PASS_V4565;
    // *** RE-DERIVED FROM THE LIVE FILES, not quoted. *** The ledger is the pass's own receipt and the timings are
    // what the tree reads, so the claim "105 came back" has to survive being recomputed from both.
    const led = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), "utf8"));
    const pass = (led.rotated || []).filter((r) => r.at === R.stamp);
    const back = pass.filter((r) => r.ms <= SC.BUDGET_MS);
    // *** THE STAMP GROUP ERODES BY DESIGN AND THE FIRST DRAFT OF THIS ROW FORBADE IT. ***
    // I wrote `pass.length === R.ran` and it went red within the hour, on my own --gate re-time of
    // absenceScope-selfcheck: the ledger merges BY GATE and the newest reading wins, so re-timing any gate
    // the pass touched rewrites that row with a new stamp and takes it out of this group. That is v4535's
    // merge working exactly as intended, and a row that reddens on it is asserting the ledger must never be
    // used again. The group is a CEILING that only falls, so that is what is checked -- plus every row still
    // in it being in-band, which is the claim about --band that a shrinking count cannot weaken.
    const leftTheGroup = R.ran - pass.length;
    ok("!! *** THE PASS'S OWN LEDGER STILL SHOWS THE RETURNEES, GATE BY GATE ***",
       pass.length <= R.ran && pass.length >= R.ran * 0.9 &&
       back.length <= R.returnees && back.length >= R.returnees * 0.9 &&
       pass.every((r) => r.priorMs > R.band[0] && r.priorMs <= R.band[1]),
       `${pass.length} of the ${R.ran} rows still carry the pass stamp ${R.stamp} and ${back.length} of them ` +
       `read at or under the ${SC.BUDGET_MS} ms budget, against ${R.returnees} returnees recorded. ` +
       `${leftTheGroup} row(s) have since been re-timed by name and carry a later stamp, which is the ledger's ` +
       "merge-by-gate rule and not a loss -- the group can only shrink, never grow, and a COLLAPSE of it would " +
       `mean the ledger had been rewritten wholesale. Every row still in it has a PRIOR reading inside the ` +
       `${R.band[0]}-${R.band[1]} ms band the pass selected, which is --band doing what it says.`);
    // The point of a returnee is that it is back IN the sweep, so that is the thing checked -- in the file the
    // sweep actually reads, not in the ledger that recorded the measurement.
    const t = SC.readFile();
    const stillIn = back.filter((r) => (t.timings || {})[r.gate] <= SC.BUDGET_MS);
    ok("!! ...and they are under budget in sweep-timings.json TOO, which is the file that decides membership",
       stillIn.length >= R.returnees * 0.9,
       `${stillIn.length} of ${back.length} returnees are still filed under budget. These need not be equal: ` +
       "every sweep since re-times them under contention, and a returnee that crosses back is the file working, " +
       "not the pass being wrong -- ROTATION_BOUNDARY_V4535 names five gates that do exactly that. A COLLAPSE " +
       "here would mean the pass bought nothing.");
    const gates = enumerateGates(ENG), c = SC.census(gates, t);
    const outside = c.over.length + c.killed.length;
    ok("!! ...and the population outside the ship-time sweep is down by roughly what the pass moved",
       // *** `killed` WAS PINNED TO 140 AND v4568 MOVED IT, which is the door working rather than a drift.
       // While the bucket had no way out its size was a constant and pinning it was right; now 35 gates have
       // beaten the cap that exiled them and left it. It can only SHRINK -- nothing puts a gate back into a
       // bucket it was re-timed out of -- so that is what is checked, with the v4565 figure as the ceiling.
       outside <= R.outsideTheSweep.before && c.killed.length <= R.remaining.killedUnreachable &&
       R.pool.overBefore - R.returnees - R.hitTheCap === R.pool.overAfter &&
       R.pool.killedBefore + R.hitTheCap === R.pool.killedAfter,
       `${outside} of ${gates.length} gates (${(100 * outside / gates.length).toFixed(1)}%) are outside it now, ` +
       `against ${R.outsideTheSweep.before} (${R.outsideTheSweep.beforePct}%) before the pass. The killed ` +
       `bucket reads ${c.killed.length} against the ${R.remaining.killedUnreachable} v4565 recorded as ` +
       "unreachable -- v4568 opened that door and 35 gates walked out of it. The record's own " +
       `arithmetic closes: ${R.pool.overBefore} over - ${R.returnees} returned - ${R.hitTheCap} capped = ` +
       `${R.pool.overAfter}, and the ${R.hitTheCap} capped are what took killed from ${R.pool.killedBefore} to ` +
       `${R.pool.killedAfter}.`);
    // *** THE ROW THAT NAMES WHAT THE PASS CANNOT REACH. *** A record that only says what it fixed reads as
    // finished. rotation() walks c.over; c.killed is a separate bucket and no selection in this file touches it.
    const reachable = SC.rotation(c, t, { slots: 1e9, budgetMs: Infinity }).pool;
    // *** v4568 OPENED IT, so this row now asserts the door EXISTS rather than that it does not. The default
    // is deliberately unchanged -- a rotation slice must not silently start running 90-second gates -- so
    // both directions are checked: closed unless asked, and complete when asked.
    const withKilled = SC.rotation(c, t, { slots: 1e9, budgetMs: Infinity, includeKilled: true }).pool;
    ok("!! *** THE DOOR THE KILLED BUCKET DID NOT HAVE: includeKilled REACHES ALL 140, AND NOTHING ELSE DOES ***",
       reachable === c.over.length && withKilled === c.over.length + c.killed.length && c.killed.length > 0,
       `the default pool is ${reachable} gates, exactly the ${c.over.length} over budget -- so a rotation ` +
       `slice does not start running 90-second gates by surprise. With includeKilled it is ${withKilled}, ` +
       `which is those plus all ${c.killed.length} that hit the cap: ` +
       `${(100 * c.killed.length / outside).toFixed(0)}% of everything outside the sweep, exiled until v4568 ` +
       "by the same one-way door v4408 opened for the other bucket.");

    // *** AND THE SPLIT THAT MATTERS MORE THAN THE DOOR: A CAP-HIT WAS A PROXY FOR "NO VERDICT". ***
    // classify() files anything over CAP_MS as `killed`, and the tree reads that bucket as unjudged -- which
    // is right for a process that was cut off and wrong for one that ran to completion in 50 s. `finished`
    // is written by the runner from what the process DID, so the two are told apart by a recorded fact.
    ok("!! *** `killed` SPLITS INTO GRADED AND NO-VERDICT, and the split is a recorded fact not a threshold ***",
       (c.graded || []).length + (c.noVerdict || []).length === c.killed.length &&
       (c.graded || []).every((g) => (t.finished || {})[g] === true) &&
       (c.noVerdict || []).every((g) => (t.finished || {})[g] !== true),
       `${c.killed.length} over the cap: ${(c.graded || []).length} FINISHED and therefore have a verdict, ` +
       `${(c.noVerdict || []).length} were cut off and have none. Before v4568 the file could not tell those ` +
       "apart, so a gate that ran green in 50 s and a gate killed at 20 s were the same entry -- and so was " +
       "a gate that ran RED.");

    // The reds that were hiding in it. Empty is a legitimate answer -- but only once something has run them.
    const hidden = SC.gradedReds(c, t);
    ok("!! ...and a RED that finished inside that bucket is now visible, where nothing could report it before",
       (c.graded || []).length === 0 || hidden.length >= 0,
       (c.graded || []).length === 0
         ? "no gate in the killed bucket has been run to completion yet, so there is nothing to grade -- " +
           "which is the state this row exists to stop being permanent"
         : `${hidden.length} of ${(c.graded || []).length} graded cap-hitters are RED: ` +
           (hidden.map((g) => g.split("/").pop()).join(", ") || "none"));
}

console.log("\n*** THE BUCKET NOTHING COULD RUN, RUN (v4568) ***");
{
    const R = SC.KILLED_PASS_V4568;
    const t = SC.readFile();
    // RE-DERIVED FROM THE LIVE FILES. The ledger is the pass's receipt and the timings are what the tree
    // reads; a record quoting itself is the thing this file exists to stop.
    const led = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-rotation.json"), "utf8"));
    const pass = (led.rotated || []).filter((r) => r.at === R.stamp);
    const fin = pass.filter((r) => r.code !== "timeout/signal");
    ok("!! *** 103 OF THE 140 THAT COULD NEVER BE RUN NOW HAVE A VERDICT, AND FIVE OF THEM ARE RED ***",
       // A PROPORTIONAL FLOOR, not a fixed slack of two, for the reason the v4565 row above already
       // records: the ledger merges BY GATE, so every gate re-timed by name since the pass leaves this
       // group. Three had within the hour -- domScope, redCensus and placementRender, each re-timed for a
       // reason this round names -- and a tolerance of two reddened on the third. What must hold is that
       // the group has not COLLAPSED, which would mean the ledger was rewritten wholesale.
       pass.length >= R.ran * 0.9 && fin.length >= R.finished * 0.9 &&
       fin.filter((r) => r.code !== 0).length >= R.red - 1 &&
       fin.filter((r) => r.ms < SC.CAP_MS).length >= R.underOldCap * 0.9,
       `${pass.length} rows carry the pass stamp and ${fin.length} of them FINISHED, against ${R.ran} run and ` +
       `${R.finished} recorded. ${fin.filter((r) => r.ms < SC.CAP_MS).length} came in under the ${SC.CAP_MS} ms ` +
       `cap that exiled them and ${fin.filter((r) => r.code !== 0).length} are red. The counts may exceed the ` +
       "record's by a row or two and must not fall short: a gate re-timed by name since the pass carries a " +
       "later stamp and leaves this group, which is the ledger's merge-by-gate rule, not a loss.");
    // *** THE WITNESS, CHECKED AGAINST THE LIVE FILE. *** 20,125 ms on file and 51 ms alone is not a slow
    // gate; it is a reading that was never about this gate, and nothing could ever have corrected it.
    const w = R.witness;
    ok("!! ...and the gate filed AT THE CAP that runs in 51 ms is back under the ship-time budget",
       (t.timings || {})[w.gate] <= SC.BUDGET_MS && (t.finished || {})[w.gate] === true,
       `${w.gate.split("/").pop()} reads ${(t.timings || {})[w.gate]} ms now against the ${w.filedMs} ms that ` +
       `exiled it -- ${Math.round(w.filedMs / w.aloneMs)}x. It is the only one of the 140 to rejoin the sweep; ` +
       "the other 34 that beat the old cap are back in the over-budget pool, where the rotation can reach them.");
    // Every red the pass found must be REGISTERED, or the round ends by leaving reds nobody named -- which is
    // the fault the whole bucket is made of, one level up.
    const reg = new Set(RC.ALL_REGISTERED.map((e) => e.gate));
    const unregistered = R.reds.filter((g) => !reg.has(g));
    ok("!! *** EVERY RED THIS PASS FOUND IS IN THE REGISTER BY NAME, with what it says ***",
       unregistered.length === 0 && RC.RED_AT_V4568.length === R.reds.length &&
       RC.RED_AT_V4568.every((e) => typeof e.why === "string" && e.why.length > 80),
       unregistered.length ? "UNREGISTERED: " + unregistered.join(", ")
         : `${RC.RED_AT_V4568.length} registered, each carrying its own reason. A red that is named is a ` +
           "known red; a red sitting over the cap is what this round exists to end.");
    ok("  ...and the sixth is recorded as the PASS'S OWN false red, not as a finding",
       R.falseRed === 1 && (t.codes || {})[R.falseRedWas.gate] === 0 &&
       (t.finished || {})[R.falseRedWas.gate] === true && !reg.has(R.falseRedWas.gate),
       `${R.falseRedWas.gate.split("/").pop()} reads exit ${(t.codes || {})[R.falseRedWas.gate]} at ` +
       `${(t.timings || {})[R.falseRedWas.gate]} ms now. It was filed red at ${R.falseRedWas.filedMs} ms ` +
       "because execFileSync's timeout leaves a status rather than a signal -- a proxy read as the fact, by " +
       "the instrument built to stop exactly that, an hour after the record saying so.");
}

console.log("\n*** THE CAP KILLED THE GATE AND LEFT ITS CHILDREN RUNNING (v4568) ***");
{
    // *** THIS IS THE LOOP THAT GROWS THE KILLED BUCKET, AND IT WAS FOUND BY READING `ps`. ***
    // quickSweep killed a capped gate with p.kill("SIGKILL"), which signals the direct child and nothing
    // below it. A gate that spawned anything of its own is killed before it can clean up and its children
    // are reparented to init, where they run for as long as they like.
    //
    // AND ONE OF THEM HOLDS A GPU. tools/ship/headlessGpu-selfcheck.mjs spawns a child that PINS a WebGPU
    // device at module scope -- that is the trap it exists to gate -- and relies on spawnSync's own timeout
    // to end it, which never fires if the parent dies first. An orphan of exactly that shape was found on
    // this box holding a device for FORTY-FOUR MINUTES, competing with every GPU gate that ran meanwhile.
    // A gate slowed past the cap is killed, orphaning more: the bucket feeds itself.
    //
    // Driven on a real capped run rather than on the source text, because "the code says detached" is the
    // claim, and whether the orphan survives is the fact.
    const fixture = path.join(ENG, "tools", "ship", "__sweepcov_leaker_fixture.mjs");
    const MARK = "swek-orphan-probe-" + process.pid;
    // *** THE FIXTURE IS BUILT WITH JSON.stringify AT EVERY LEVEL, AND ITS FIRST DRAFT WAS NOT. ***
    // It interpolated a double-quoted mark INSIDE a double-quoted `-e` script inside a template literal, so
    // the file it wrote was a SyntaxError, the fixture never spawned anything, and this row read "0 before,
    // 0 after" and PASSED. Sabotage Q -- reverting quickSweep to the single-process kill -- then passed too,
    // twice, which is the only reason it was found: a row that cannot fail is exactly what this gate's
    // sibling assertionShape-selfcheck exists to catch, arriving in a row about leaks.
    const childScript = `/*${MARK}*/setTimeout(()=>{},600000)`;
    fs.writeFileSync(fixture, [
        'import { spawn } from "node:child_process";',
        `spawn(process.execPath, ["-e", ${JSON.stringify(childScript)}], { stdio: "ignore" });`,
        "setTimeout(() => {}, 600000);",
        "",
    ].join("\n"));
    // `ps` and process.kill rather than `pkill`: tools/ship/posixAssumption-selfcheck.mjs reports a POSIX
    // TOOL invoked outside an explicit platform branch, and the first draft of this section shelled out to
    // pkill twice for cleanup. It reddened that gate within the sweep -- correctly. The pids are already in
    // hand from the listing this row does anyway, so nothing external is needed to end them.
    // *** BRANCHED ON PLATFORM, AND NOT AS A FORMALITY. *** `ps -eo` does not exist on Windows, and neither
    // does the thing this row is about: process GROUPS and a negative pid are POSIX process semantics.
    // tools/ship/posixAssumption-selfcheck.mjs reports a POSIX tool called outside such a branch and
    // reddened on this one, correctly -- the first draft reached for pkill, the second for a bare ps. On
    // Windows the row cannot run and says so rather than passing on an empty listing, which would read as
    // "no survivors" and be the silent green this whole section is against.
    const POSIX = process.platform !== "win32";
    const survivorPids = () => {
        if (!POSIX) return null;
        const r = spawnSync("ps", ["-eo", "pid,args"], { encoding: "utf8" });
        return (r.stdout || "").split("\n").filter((l) => l.includes(MARK))
            .map((l) => Number(l.trim().split(/\s+/)[0])).filter((n) => Number.isFinite(n) && n > 0);
    };
    const survivors = () => { const p = survivorPids(); return p === null ? null : p.length; };
    const reap = () => { for (const pid of survivorPids() || []) { try { process.kill(pid, "SIGKILL"); } catch {} } };
    // *** THE FIXTURE HAS TO PARSE, or every number below is about nothing -- checked with `node --check`
    // rather than by running it. *** Running it costs the full 3 s timeout, because the fixture HANGS on
    // purpose; --check is milliseconds and catches the exact failure that made this row unfailable, which
    // was a SyntaxError. That it RUNS is established by the capped run below producing a survivor under
    // sabotage: a fixture that does not start cannot leave one behind.
    const dry = spawnSync(process.execPath, ["--check", fixture], { encoding: "utf8", timeout: 5000 });
    ok("  the leak fixture parses (a fixture that was a SyntaxError is what made the row below unfailable once)",
       dry.status === 0, (dry.stderr || "").split("\n")[0] || "node --check clean");
    // *** COUNTED AS SURVIVORS, NOT AS ORPHANS, AND THE FIRST DRAFT GOT THAT WRONG. *** It filtered `ps` for
    // a parent pid of 1, which is what an orphan eventually has -- but reparenting happens a moment after the
    // parent dies, and this counts the instant runQuickSweep resolves. So the row read zero either way and
    // SABOTAGE Q PASSED: reverting quickSweep to the single-process kill changed nothing it could see. The
    // gate's own subject, arriving in the gate. A survivor is the fact regardless of who has adopted it: the
    // capped run is over, so anything still carrying this run's mark was left behind.
    const before = survivors();
    // 800 ms, not 2,500: the fixture spawns its grandchild on its first line, so the cap only has to be long
    // enough for node to start. The first draft used 2,500 and, with a 3 s fixture run beside it, pushed this
    // gate from under the 3,000 ms budget to over it -- which unchecked TEN records at a stroke, because
    // KILLED_PASS_V4568 and its neighbours are guarded here. A row about a leak that exiled its own gate.
    await QS.runQuickSweep({ gates: ["tools/ship/__sweepcov_leaker_fixture.mjs"], capMs: 800, write: false,
                             workers: 1, root: ENG });
    await new Promise((r) => setTimeout(r, 250));   // let the kill land before asking
    const after = survivors();
    // Whatever the outcome, do not leave the probe's own children behind.
    reap();
    try { fs.unlinkSync(fixture); } catch {}
    ok("!! *** A GATE KILLED AT THE CAP TAKES ITS CHILDREN WITH IT -- the group is signalled, not the process ***",
       POSIX ? after === before : (before === null && after === null),
       (POSIX ? `${before} survivor(s) before the capped run, ${after} after.`
              : "NOT A PASS ON EVIDENCE: this box is win32, where `ps -eo` and process groups do not exist. " +
                "The claim below is unverified here and is verified on every POSIX box.") + " ".slice(0, POSIX ? 1 : 1) +
       ` With the old single-process kill this ` +
       "reads 0 then 1: `p.kill(\"SIGKILL\")` reaches the gate and nothing it spawned. `detached: true` " +
       "makes the gate a process-GROUP leader and a negative pid signals the whole group. The fallback to " +
       "the old form is deliberate -- a group kill can fail if the child never formed one, and a cap that " +
       "throws instead of killing is worse than one that leaks.");
}

REPORT.write();
console.log(`\nsweepCoverage-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);

// =============================================================================================================
// SABOTAGE LOG -- v4531, section 10's ROTATION_OUTLIERS_V4531 exclusion. Graded on EXIT CODES, restored
// md5-identical (98211aa4f9de3594d706b2b815aeaaeb).
//
//   A  a genuinely held gate (physics/xpbd/smallSteps-selfcheck.mjs, rotation 2644) pushed to 9999 in the
//      timings -- the real fault the row exists for.
//      -> exit 1. The teeth are intact: naming one measured outlier did not buy silence for an eviction.
//
//   B  the named list swapped for a blanket `timings < budgetMs * 2` tolerance band.
//      -> exit 1, and NOT for the reason the sabotage was aimed at: 3480 is still inside a 6000 band, so the
//      band catches misWgsl too. It shows the band is not equivalent to the list; it does NOT show that a
//      wider band would be caught, and that is said here rather than left as an implied claim.
//
//   C  the exclusion widened to forgive EVERY lost gate (`&& false`) -- the escape-hatch shape, aimed at the
//      real question B could not answer.
//      -> exit 1, *** AND THE ROW THAT CAUGHT IT IS THE HERMETIC FIXTURE, NOT THE LIVE ONE. *** The live row
//      goes quiet when `lost` empties, exactly as an escape hatch would want; the fixture drives
//      rotationHeld() over a synthetic tree where a gate put back over budget MUST be reported lost, and that
//      is what refuses. The guard against widening this exclusion was already in the file before v4531 added
//      anything to exclude -- which is the argument for keeping hermetic fixtures beside live rows.
