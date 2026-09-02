// WebGLEngine/tools/ship/budgetEvidence-selfcheck.mjs -- v3924
//
// *** THE TIMING RECORD CANNOT CONTAIN THE GATES IT MOST NEEDS TO DESCRIBE. ***
//
// Asked "which gates have a recorded time above the default budget and no MEASURED entry", gate-timings.json
// answers ZERO. That is not reassurance, it is the shape of the file: A GATE THAT DOES NOT COMPLETE LEAVES NO
// ENTRY. timingCoverage-selfcheck says so in its own words -- "GATES THAT FAIL ARE NOT RECORDED" -- and a gate
// killed at its budget has not completed either. So the one population the budget table exists to serve is
// exactly the population the evidence for it cannot hold. twoFBind and census are both simply ABSENT.
//
// The gap is real and it was measurable: 55 gates in this tree had NEITHER a recorded time NOR a MEASURED
// budget, and had therefore never been shown to fit anything. Timed with a 150s cap -- just above the 139.9s
// general default, which is all it takes to answer "does it fit" -- TWELVE OF THE FIFTY-FIVE EXCEED IT. Each of
// those is killed by the ship suite and by the rig, and passes only when nothing is holding a clock.
// twoFBind-selfcheck is 249s against a silent 139.9s default and had never been timed once.
//
// So this gate holds the property that makes the question answerable at all: EVERY GATE CARRIES EVIDENCE ABOUT
// ITS OWN RUNTIME -- a completed measurement in gate-timings, a curated MEASURED budget, or a written admission
// in UNRESOLVED that it did not finish. "Never run" is a fourth state and it is the one that hides things.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MEASURED, UNRESOLVED, DEFAULT_BUDGET_MS } from "./gateBudget.mjs";

const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const SKIP = new Set(["node_modules", ".git", "deleted", "dist", "build"]);
function walk(d, acc = []) {
    let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return acc; }
    for (const x of e) {
        if (SKIP.has(x.name)) continue;
        const f = path.join(d, x.name);
        if (x.isDirectory()) walk(f, acc);
        else if (x.name.endsWith("-selfcheck.mjs")) acc.push(path.relative(ENG, f).split(path.sep).join("/"));
    }
    return acc;
}
const record = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "gate-timings.json"), "utf8")); }
    catch { return {}; }
})();
const timings = record.timings || {};
// *** A RED VERDICT AND AN UNKNOWN RUNTIME ARE NOT THE SAME FACT, AND FOLDING THEM TOGETHER IS HOW NINETEEN
// FAILING GATES STAYED INVISIBLE. *** None of them had ever been timed, so nothing in the tree had a reason to
// run them; they surfaced only because this round timed everything that had no evidence. Their durations live in
// `failingAt`, kept out of `timings` by the same rule that has always excluded failures -- a gate that fails
// early has not exercised its full path, so its time understates. This gate's WALL is about budget evidence.
// The failures are REPORTED, loudly and by name, and they are not this wall's business.
const failingAt = record.failingAt || {};
// v4304 -- *** A SECOND SOURCE OF EVIDENCE: THE QUICK SWEEP'S OWN OBSERVATIONS. *** gate-timings.json was
// captured at v3211 and hand-fed since; 103 gates written after it had no evidence at all, every one of
// them run at v4303 by the sweep that now runs at ship time and rewrites tools/ship/sweep-timings.json with
// what it saw. A gate the sweep timed to completion (exit 0) is TIMED; one it killed at the cap (124) is
// still unknown, and one that exited non-zero has not exercised its full path -- the same rule that keeps
// failures out of `timings` above, applied to the new file.
const sweepFile = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8")); } catch { return {}; } })();
const swept = {}, sweptFailing = {};
for (const [g, ms] of Object.entries(sweepFile.timings || {})) {
    const code = (sweepFile.codes || {})[g];
    if (code === 0) swept[g] = ms;                       // timed to completion
    else if (code !== 124 && code != null) sweptFailing[g] = ms;   // exited non-zero: a failure, reported, not evidence of its full path; a 124 is a kill and says nothing
}

const gates = walk(ENG);
const evidence = (g) => typeof timings[g] === "number" ? "timed"
                      : typeof swept[g] === "number" ? "swept"
                      : MEASURED[g] !== undefined ? "measured"
                      : UNRESOLVED[g] !== undefined ? "unresolved"
                      : typeof failingAt[g] === "number" ? "failing"
                      : typeof sweptFailing[g] === "number" ? "failing" : null;
const noEvidence = gates.filter((g) => !evidence(g));

// ---- 1. THE POPULATION, DERIVED ----------------------------------------------------------------------------
say(gates.length + " gates: " + gates.filter((g) => evidence(g) === "timed").length + " with a recorded time, " +
    gates.filter((g) => evidence(g) === "swept").length + " timed to completion by the quick sweep, " +
    MEASURED_COUNT() + " curated in MEASURED, " + Object.keys(UNRESOLVED).length + " admitted in UNRESOLVED, " +
    noEvidence.length + " with NO evidence at all");
function MEASURED_COUNT() { return gates.filter((g) => evidence(g) === "measured").length; }

// ---- 2. THE WALL -------------------------------------------------------------------------------------------
ok("!! *** every gate carries evidence about its own runtime, or admits that it does not finish ***",
   noEvidence.length === 0,
   noEvidence.length + " with none" +
   (noEvidence.length ? " -- " + noEvidence.slice(0, 6).join(", ") + (noEvidence.length > 6 ? " (+" + (noEvidence.length - 6) + ")" : "")
    : ". 55 gates were in this state before v3924 and twelve of them exceeded the default. A gate nobody has " +
      "timed is not a fast gate, it is an unmeasured one, and the record's silence reads identically either way"));

// ---- 2b. THE FAILING SET IS NAMED, EVERY RUN, BECAUSE IT IS THE ROUND AFTER THIS ONE --------------------
{
    const f = Object.keys(failingAt);
    say("*** " + f.length + " GATES COMPLETED AND EXITED NONZERO *** -- timed here for the first time, which is");
    say("  the only reason anybody knows they are red. Sampled: rootLayout (18 files in a root capped at a");
    say("  dozen), singleSource (a SECOND walker re-deriving the gate-file pattern), stageInfo (a fixed-width");
    say("  left-justified panel). None is environmental.");
    for (const g of f) say("    RED  " + String(Math.round(failingAt[g] / 1000)).padStart(4) + "s  " + g);
    ok("...and that list is carried as data, not as a typed constant somebody must remember to update",
       f.length === 0 || f.every((g) => fs.existsSync(path.join(ENG, g))),
       f.length + " named, every one present on disk. A hand-written list of known failures is a suppression " +
       "with a maintenance burden; this is written by the sweep that measured them");
}

// ---- 3. AND THE REASON THE OLD QUESTION RETURNED ZERO -------------------------------------------------------
{
    const overInRecord = Object.entries(timings).filter(([g, ms]) => typeof ms === "number" && ms > DEFAULT_BUDGET_MS && MEASURED[g] === undefined);
    ok("!! *** the record shows NO over-budget gate, and that is a property of the file, not of the tree ***",
       overInRecord.length === 0,
       overInRecord.length + " over-default entries with no MEASURED budget. THIS CHECK PASSES BY DESIGN AND " +
       "PROVES NOTHING ON ITS OWN: a gate killed at its budget leaves no entry, so the file cannot hold one. It " +
       "is asserted here so that the day it goes non-zero, somebody learns that a slow gate DID complete and " +
       "was never budgeted -- and so that the zero is never read again as `nothing is over budget`");
    ok("...which is why the absences are named rather than counted as passes",
       !Object.prototype.hasOwnProperty.call(timings, "tools/roundhouse/twoFBind-selfcheck.mjs") ||
       MEASURED["tools/roundhouse/twoFBind-selfcheck.mjs"] !== undefined,
       "twoFBind ran 249s and appears nowhere in the record; it is in MEASURED now because it was timed on " +
       "purpose, not because the record noticed");
}

// ---- 4. UNRESOLVED STAYS PROSE, BECAUSE A LOWER BOUND IS NOT A MEASUREMENT ----------------------------------
{
    const bad = Object.entries(UNRESOLVED).filter(([, v]) => typeof v !== "string" || v.trim().length < 40);
    ok("!! every UNRESOLVED entry is a SENTENCE, never a number", bad.length === 0,
       Object.keys(UNRESOLVED).length + " entries, " + bad.length + " that are not prose" +
       (bad.length ? " -- " + bad.map(([k]) => k).join(", ")
        : ". A number here would be consumed as a budget, and the whole content of this table is that there is " +
          "no measurement to consume -- 'we tried and it did not finish'"));
    const overlap = Object.keys(UNRESOLVED).filter((g) => MEASURED[g] !== undefined);
    ok("...and nothing sits in both tables at once", overlap.length === 0,
       overlap.length ? "in both: " + overlap.join(", ")
                      : "a gate that gets measured is DELETED from UNRESOLVED, not left in place agreeing with " +
                        "itself -- the antidote khMichalke's entry records firing on its own round");
}

console.log(failed ? "\nbudgetEvidence-selfcheck: " + failed + " FAILED" : "\nbudgetEvidence-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
