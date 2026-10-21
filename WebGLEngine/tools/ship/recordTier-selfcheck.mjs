// WebGLEngine/tools/ship/recordTier-selfcheck.mjs -- v4576
//
// Gates tools/ship/recordTier.mjs. The subject is in that file's header.
//
// *** IT DOES NOT RUN THE TIER. *** The tier is 93 seconds of gate time by construction -- it exists precisely
// because those gates cost more than the sweep can afford -- so a gate that ran it would itself be over budget
// and would be skipped at ship time, which is the exact failure the tier was built to end. What this checks is
// that the tier's LIST is derived rather than typed, that its verdict rules are the ones this tree already
// settled, and that it is wired into the ritual.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tierGates, tierCapMs, TIER_CAP_FLOOR_MS, TIER_CAP_MARGIN } from "./recordTier.mjs";
import { readFile } from "./sweepCoverage.mjs";
import { reach, ENG } from "./recordReach.mjs";
import { STEPS } from "./shipRitual.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("1. THE LIST IS DERIVED, WHICH IS THE WHOLE DIFFERENCE BETWEEN THIS AND NINE TYPED NAMES");
{
    const gates = tierGates();
    const r = reach();
    ok("!! *** the tier's population comes from recordReach, not from a list in the file ***",
       gates.length === r.blockers.length && gates.every((g) => r.blockers.some((b) => b.gate === g.gate)),
       `${gates.length} guardian gate(s), covering ${gates.reduce((a, g) => a + g.records.length, 0)} record(s). ` +
       "A name here would be a second declaration that goes stale the first time a gate crosses the budget in " +
       "either direction, which is what shipRitual-selfcheck exists to refuse");
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "recordTier.mjs"), "utf8");
    const named = gates.filter((g) => src.includes(g.gate));
    ok("!! ...and the module does not name a single one of them in its own source",
       named.length === 0,
       named.length ? "TYPED: " + named.map((g) => g.gate).join(", ")
                    : "zero of " + gates.length + " gate paths appear in recordTier.mjs. The list cannot rot " +
                      "because there is no list");
    ok("  every gate it would run exists on disk",
       gates.every((g) => fs.existsSync(path.join(ENG, g.gate))),
       gates.map((g) => g.gate.split("/").pop()).join(", "));
    ok("!! and every one of them really is over the sweep budget, which is why it is here",
       gates.every((g) => g.ms > 3000),
       `cheapest is ${Math.min(...gates.map((g) => g.ms))} ms against a 3,000 ms budget; dearest ` +
       `${Math.max(...gates.map((g) => g.ms))} ms`);
}

console.log("\n2. THE VERDICT RULES ARE THE ONES THIS TREE ALREADY SETTLED, NOT NEW ONES");
{
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "recordTier.mjs"), "utf8");
    // *** A COUNT OF FAILURES IS NOT A VERDICT UNLESS THE PROCESS FINISHED. *** v4392's rule, the reason
    // KILLED_PASS_V4568 exists, and the thing a fresh runner gets wrong by treating a kill as an exit code.
    ok("!! *** a gate killed at the cap gets NO VERDICT -- neither red nor green ***",
       /killed/.test(src) && /noVerdict/.test(src) && /r\.signal/.test(src),
       "spawnSync reports a kill through `signal`, not through `status`. tools/ship/redCensus.mjs's runGate " +
       "learned that at v4568 when execFileSync's timeout produced a status and domScope was called red for it");
    ok("!! ...and it runs SERIALLY, because a tier that manufactured its own false reds would be worse than none",
       !/workers|Promise\.all|spawn\(/.test(src) && /spawnSync/.test(src),
       "SWEEP_CONTENTION_V4562 measured an 8-worker pass inflating a serial reading by a 2.41x median. These " +
       "are the expensive tail: running them together is how a 21 s gate becomes a 50 s one and hits its cap");
    ok("  and `ok` is false when anything is red OR has no verdict",
       /ok: red\.length === 0 && noVerdict\.length === 0/.test(src),
       "an unfinished gate is not a passing one, and folding the two together is how the killed bucket filled");
}

console.log("\n3. IT IS WIRED INTO THE RITUAL, WHICH IS THE ONLY THING THAT MAKES IT RUN");
{
    const step = STEPS.find((s) => s.id === "record-tier");
    ok("!! *** the ship ritual has a record-tier step ***", !!step,
       step ? step.command : "NO STEP -- a tier nobody runs is a slower version of no tier at all");
    ok("  ...and it names this module as its command and this gate as its guard",
       !!step && /recordTier\.mjs/.test(step.command) && step.gate === "tools/ship/recordTier-selfcheck.mjs",
       step ? `${step.command}  guarded by ${step.gate}` : "");
    // *** THE POINT OF THE ROUND, ASSERTED AS A NUMBER RATHER THAN DESCRIBED. ***
    //
    // *** A RECORD CAN HAVE MORE THAN ONE OVER-BUDGET GUARDIAN, AND SUMMING records.length PER GATE COUNTS IT
    // TWICE. *** Found live, not hypothesised: tools/ship/registerDrift-selfcheck.mjs and tools/ship/
    // quickSweep-selfcheck.mjs both guard the same six RED_AT_V4408/V4476/V4484 records, and the naive sum
    // read 42 against reach()'s 36 the moment BOTH gates crossed the budget at once -- the tier still covers
    // every one of them (running either gate's blocker exercises the shared record), so the right comparison
    // is against the UNION of records across every blocker gate, not the sum of each gate's own list.
    const r = reach();
    const coveredRecords = new Set();
    for (const g of tierGates()) for (const rec of g.records) coveredRecords.add(rec);
    ok("!! the tier covers EVERY record whose only guardian is over budget",
       r.overBudget === coveredRecords.size,
       `${r.overBudget} record(s) had a working guardian the sweep could not afford, and the tier runs the ` +
       `guardian of every one. ${r.checked} of ${r.total} records are checked by the sweep; ${r.unguarded} ` +
       "have no guardian at all and are a separate, named problem");
}

// =============================================================================================================
console.log("\n4. *** THE BACKSTOP IS DERIVED, AND IT USED TO SIT BELOW THIS TIER'S OWN SLOWEST MEMBER ***");
{
    // *** WHAT THIS ROW IS FOR, MEASURED AT v4674. *** The cap was a typed 60,000. quickSweep-selfcheck came
    // back NO VERDICT at 60,063 ms; run alone it finishes in 60,196 ms and is ALL GREEN, so SIX RECORDS lost
    // their verdict to a 0.3% margin and the ritual step was red for nobody's code. On a loaded box the same
    // gate took 105,810 ms, which is why the floor is not merely "a bit over 60 s".
    const none = tierCapMs({ serial: {} }, [{ gate: "a" }, { gate: "b" }]);
    const slow = tierCapMs({ serial: { a: 200000, b: 1000 } }, [{ gate: "a" }, { gate: "b" }]);
    const fast = tierCapMs({ serial: { a: 1000, b: 2000 } }, [{ gate: "a" }, { gate: "b" }]);
    console.log(`  ----  no readings -> ${none.capMs} ms; slowest 200000 -> ${slow.capMs} ms; slowest 2000 -> ${fast.capMs} ms`);
    ok("!! *** the cap tracks the slowest FILED reading and can never fall below the floor ***",
        none.capMs === TIER_CAP_FLOOR_MS && none.slowest === null &&
        slow.capMs === 200000 * TIER_CAP_MARGIN && fast.capMs === TIER_CAP_FLOOR_MS,
        `a tree whose guardians get slower raises its own backstop, and one with no readings yet still gets ` +
        `${TIER_CAP_FLOOR_MS} ms rather than a number somebody typed. THE TWO JOBS ARE SEPARATED: in the ` +
        `PARALLEL sweep a cap is a budget, bounding what the ship spends; here the gates run ONE AT A TIME, ` +
        `so nothing competes and the cap bounds only what a HANG can cost.`);

    // *** AND THE LIVE PROPERTY: no member of today's tier is over the backstop. *** This is the row that
    // would have been red before v4674 and is the one that stays useful as the tree grows.
    const file = readFile(), gates = tierGates({});
    const live = tierCapMs(file, gates);
    const filed = gates.map((g) => ({ gate: g.gate, ms: (file.serial || {})[g.gate] })).filter((x) => x.ms > 0);
    const over = filed.filter((x) => x.ms >= live.capMs);
    console.log(`  ----  live backstop ${live.capMs} ms; ${filed.length} of ${gates.length} members have a filed reading, ` +
                `slowest ${live.slowest} ms`);
    // *** THE FLOOR IS PINNED TO A NUMBER THIS TREE HAS ACTUALLY SEEN, AND THE FIRST CUT OF THIS SECTION
    // COULD NOT SEE THE DEFECT IT WAS WRITTEN FOR. *** Sabotage S1 put the floor back to the typed 60,000 and
    // every row here stayed green, because the row below grades against FILED readings -- and the filed
    // readings are precisely the stale ones this round exists to fix (the slow member was on record at
    // 5,981 ms). A check confounded by its own subject grades nothing. MEASURED_SLOWEST_MS is what the tier
    // actually observed on a loaded box; a floor beneath it is wrong by construction, whatever the file says.
    const MEASURED_SLOWEST_MS = 105810;   // v4674, tier run on a loaded box; 60,196 ms on a quiet one
    ok("!! *** the floor stands above the slowest run this tier has ever been MEASURED at ***",
        TIER_CAP_FLOOR_MS > MEASURED_SLOWEST_MS,
        `floor ${TIER_CAP_FLOOR_MS} ms against a measured ${MEASURED_SLOWEST_MS} ms. THE LITERAL IS THE POINT: ` +
        `the cap that shipped before v4674 was 60,000 and this member needed 105,810 on the day it was run, ` +
        `so lowering the floor reddens here rather than silently turning six records into a no-verdict again.`);
    ok("  and not one member's own filed reading reaches the backstop that will kill it",
        over.length === 0 && filed.length > 0,
        over.length ? "OVER: " + over.map((x) => `${x.gate} ${x.ms} ms >= ${live.capMs}`).join(", ")
                    : `the closest is ${live.slowest} ms against ${live.capMs}. A member at or over its own ` +
                      `cap is a NO VERDICT, which fails this step -- so this row failing means the ship stops ` +
                      `on a number rather than on a finding, which is exactly what it did before v4674.`);
}

// =============================================================================================================
console.log("\n5. *** THE READINGS ARE FILED, THROUGH THE WRITER THAT ALREADY KNOWS THE RULES ***");
{
    // The tier produces the single best timing in the tree for every gate it runs -- uncontended by design,
    // run to completion, taken at ship time -- and discarded every one. MEASURED COST: quickSweep-selfcheck
    // carried a recorded 5,981 ms against the 60,196 ms it actually takes, a tenfold understatement in the
    // number that decides tier membership.
    const src = fs.readFileSync(path.join(ENG, "tools", "ship", "recordTier.mjs"), "utf8");
    ok("!! *** it writes through sweepRotation.mergeTimings rather than spelling the rules again ***",
        /import \{ mergeTimings \} from "\.\/sweepRotation\.mjs"/.test(src) && /mergeTimings\(prior, rows, stamp/.test(src),
        "serial, serialRing, contended, finished and kinds are the rotation's rules; a second copy here is " +
        "the drift this tree repairs most often");
    ok("  and through timingsTarget, so a FOREIGN box writes its own file instead of overwriting the record",
        /timingsTarget\(prior/.test(src),
        "v4647's rule -- two machines' runtimes in one set of fields is not a record, it is whichever ran last");
    // *** A SKIP IS NOT A RUNTIME, AND THE TIER COULD NOT PREVIOUSLY TELL. *** It ran with stdio:"ignore", so
    // a gate that declined looked like a gate that was fast. Filing that is what put placementRender in the
    // timings at its skip cost three times over.
    ok("!! *** the skip rule is IMPORTED, not re-spelled -- one regex, one place ***",
        /import \{[^}]*SKIP_LINE[^}]*\} from "\.\/quickSweep\.mjs"/.test(src) &&
        !/SKIP_LINE\s*=\s*\//.test(src) && /skipped = !killed && SKIP_LINE\.test/.test(src),
        "one spelling of what a declined gate looks like, in quickSweep, where it has always lived");
    // *** AND THE OUTPUT IS ACTUALLY CAPTURED, WHICH THE ROW ABOVE CANNOT SEE. *** Sabotage S6 put
    // stdio:"ignore" back and every row stayed green: the skip TEST was still in the source, reading an empty
    // string forever. A rule applied to nothing passes, so the spawn options are graded too.
    ok("!! *** the runner reads the gate's output, so a declined gate is not filed as a fast one ***",
        /encoding: "utf8"/.test(src) && !/stdio: "ignore"/.test(src),
        "with stdio ignored, a gate that declines and a gate that is fast are the same two hundred " +
        "milliseconds, and filing that is what put placementRender in the timings at its skip cost three times");
    ok("  a red gate's own last lines travel with its verdict",
        /tail:\s*killed \|\|/.test(src) && /row\.tail/.test(src),
        "v4648's finding: the evidence exists for the length of one process, and a ship that stops here " +
        "should not have to re-run a 60-second gate to learn what it said");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT THE TIER PASSES. It is not run here, for the reason in the header: running 93 s of");
console.log("  ----  gates from inside a gate would put this one over the budget too. The ritual runs it, and");
console.log("  ----  its exit code is the verdict.");
console.log("  ----  NOR THAT EVERY RECORD IS NOW CHECKED. The records with NO guardian are untouched by this");
console.log("  ----  and are counted above rather than absorbed -- a tier can only run a gate that exists.");
if (fails) { console.log("\n[recordTier-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[recordTier-selfcheck] all passed");
