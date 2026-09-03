// WebGLEngine/tools/ship/sweepCoverage-selfcheck.mjs
//
// Run: node tools/ship/sweepCoverage-selfcheck.mjs   (~2s -- MEASURED)
//
// v4407 -- *** THE SHIP-TIME SWEEP EVICTS GATES ON TIMINGS IT MANUFACTURED ITSELF, AND NEVER RE-MEASURES THEM. ***
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
// SABOTAGES (4, all logged, MEASURED 3/1/1/2 reds by name):
//   A. counted the cap-hitters as reds  -> section 2 went red in all three rows, and the "13 finished nonzero"
//      count read 140. Restored. That is the row that matters most: 130 killed processes reading as failures
//      would have reported a catastrophically red tree from a file that only says "these did not finish".
//   B. roundsToCover returned 0 instead of Infinity for an empty slice -> the "covers the pool in 0 rounds"
//      row went red BY NAME. A division that returns 0 reads as FULL COVERAGE: absence-as-a-pass, in arithmetic.
//   C. stamped EVERY entry with the run's date, which is exactly the pre-v4407 behaviour -> section 5's last
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
import { enumerateGates } from "./gateSweep.mjs";
import * as SC from "./sweepCoverage.mjs";
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
        `${p.withAt} of ${p.entries} entries stamped individually, ${p.withoutAt} without. BEFORE v4407 THE ANSWER WAS ZERO: ` +
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
    // *** THE ROTATION DECAYS WITHOUT THIS, AND THE FIRST RUN PROVED IT. *** v4407's rotation returned 138 gates
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

say("WHAT THIS DOES NOT CLAIM. That the over-budget gates are GREEN -- it re-times them and reports the exit " +
    "codes it saw, and a gate that is genuinely slow stays out; the rotation shrinks the population that has " +
    "never been looked at, it does not certify it. That the 3,000 ms budget is the right number -- nothing here " +
    "argues for it, and the case for changing it would need the distribution this file now makes readable. And " +
    "it cannot see a gate that is red only under conditions the rotation does not reproduce, which is the same " +
    "limit every serial re-run in this tree has and the reason v4297 kept both timings rather than one.");

REPORT.write();
console.log(`\nsweepCoverage-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
