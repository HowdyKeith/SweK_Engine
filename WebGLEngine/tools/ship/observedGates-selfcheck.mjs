// WebGLEngine/tools/ship/observedGates-selfcheck.mjs -- v4485
//
// Run: node tools/ship/observedGates-selfcheck.mjs
//
// Grades tools/ship/observedGates.mjs, the monotone ledger it writes, and the wall that now rests on it.
//
// *** THE DEFECT THIS ROUND FIXES WAS WATCHED TWELVE TIMES BEFORE IT WAS DIAGNOSED. ***
// budgetEvidence-selfcheck went red on the first verify of every round in the session that found it, and green
// when re-run alone. That is not a first-run ordering quirk: it is a wall reading a SCRATCH FILE for a durable
// question. tools/ship/sweep-timings.json says what it is in its own note -- "Rewritten every run ... Not a
// claim about the tree" -- and a gate the sweep kills at the cap contributes no evidence, correctly, because a
// kill says nothing. Both facts go to one file and the second overwrites the first, so a gate measured cleanly
// last week and starved of CPU today LOSES ITS EVIDENCE and the wall reports on the machine's load.
//
// Section 2 reproduces exactly that, on the real files, and shows the ledger carrying the gates through.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as O from "./observedGates.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ENG, ...p), "utf8");
const stripLineComments = (t) => t.replace(/^\s*\/\/.*$/gm, " ");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = O.MEASURED_AT_V4485;
// *** ASSEMBLED, BECAUSE THIS FILE IS INSIDE THE POPULATION IT SEARCHES. *** A gate that looks for a token
// contains that token in the regex it looks with. v4484 disarmed exactly this in emitReproducibility.mjs by
// building its markers from fragments; this file, written one round later to check that kind of thing, spelled
// the needle out and matched ITSELF twice on its first run.
const WRITE_CALL = "write" + "FileSync";
const SELF = "observedGates-selfcheck.mjs";

// ---- 1. *** MONOTONE BY CONSTRUCTION, DRIVEN NOT ASSERTED *** -------------------------------------------------
{
    const prev = { gates: { "a.mjs": { firstSeen: "v1", lastSeen: "v1", lastMs: 10, runs: 1 },
                            "b.mjs": { firstSeen: "v1", lastSeen: "v1", lastMs: 20, runs: 1 } } };
    // A sweep that saw only `a`, KILLED `b` at the cap, and found a new `c`.
    const sweep = { timings: { "a.mjs": 11, "b.mjs": 99999, "c.mjs": 30, "d.mjs": 40 },
                    codes:   { "a.mjs": 0,  "b.mjs": 124,   "c.mjs": 0,  "d.mjs": 1 } };
    const r = O.mergeObservations(prev, sweep, "v2");
    say(`added ${r.added.join(",") || "-"} | refreshed ${r.refreshed.join(",") || "-"} | carried ${r.carried.join(",") || "-"} | removed ${r.removed.length}`);
    ok("!! *** A CAP-KILL REMOVES NOTHING: the ledger only ever grows ***",
        r.removed.length === 0 && "b.mjs" in r.next.gates && r.next.gates["b.mjs"].lastMs === 20 &&
        r.carried.join() === "b.mjs" && M.ledgerIsMonotone === true,
        "b was killed at the cap and keeps the 20 ms it was seen to take. An observation does not stop having " +
        "been made, which is the whole difference between this ledger and the file it backstops");
    ok("a fresh completion is ADDED, and a repeat is refreshed with a run count",
        r.added.join() === "c.mjs" && r.next.gates["c.mjs"].firstSeen === "v2" &&
        r.refreshed.join() === "a.mjs" && r.next.gates["a.mjs"].runs === 2 &&
        r.next.gates["a.mjs"].firstSeen === "v1" && r.next.gates["a.mjs"].lastMs === 11,
        "firstSeen is kept and lastMs moves, so the ledger says both when a gate was first seen to finish and " +
        "what it last cost");
    ok("!! a NON-ZERO exit is not an observation either -- the rule budgetEvidence already applies",
        !("d.mjs" in r.next.gates),
        "d exited 1: it has not exercised its full path, so its time understates and is not evidence of one");
    ok("CONTROL: merging the same sweep twice changes no membership, only the run count",
        Object.keys(O.mergeObservations(r.next, sweep, "v3").next.gates).join() ===
        Object.keys(r.next.gates).join(),
        "a monotone merge is idempotent in its keys, which is what makes it safe to run every round");

    // *** THE PREDICATE MUST BE ABLE TO SAY NO, AND NOTHING HERE ASKED IT TO. *** A sabotage that hard-wired
    // observedFinishes to `true` cost ZERO RED: every row in this gate was a positive one, and a predicate that
    // always says yes satisfies all of them -- including "the ledger carries every one of them" and the A/B,
    // which would then be measuring nothing. That is vacuity.mjs's cause one, the shape this tree already has
    // a word for, and it is the last place it should have turned up.
    ok("!! *** observedFinishes SAYS NO -- for an absent gate, an empty ledger, and a malformed entry ***",
        O.observedFinishes(r.next, "a.mjs") === true &&
        O.observedFinishes(r.next, "never-swept-selfcheck.mjs") === false &&
        O.observedFinishes({ gates: {} }, "a.mjs") === false &&
        O.observedFinishes(null, "a.mjs") === false &&
        O.observedFinishes({ gates: { "a.mjs": { firstSeen: "v1" } } }, "a.mjs") === false,
        "a gate never observed, a ledger with nothing in it, a null record and an entry with no millisecond " +
        "all read false. Without this row the ledger could claim to cover the whole tree and every check " +
        "above would still pass");
}

// ---- 2. *** THE DEFECT, REPRODUCED ON THE REAL FILES, AND THE LEDGER CARRYING IT *** ---------------------------
{
    const sweep = JSON.parse(read("tools/ship/sweep-timings.json"));
    const rec = JSON.parse(read("tools/ship/gate-timings.json"));
    const be = read("tools/ship/budgetEvidence-selfcheck.mjs");
    const named = new Set([...be.matchAll(/"([^"]+selfcheck\.mjs)"/g)].map((m) => m[1]));
    const durable = rec.timings || {}, failing = rec.failingAt || {};
    const sweepOnly = Object.keys(sweep.timings || {})
        .filter((g) => (sweep.codes || {})[g] === 0 && !(g in durable) && !named.has(g) && !(g in failing));
    say(`${Object.keys(sweep.timings || {}).length} gates in the sweep file; ${sweepOnly.length} have evidence from NOWHERE else`);
    ok("!! *** GATES REST THEIR ONLY RUNTIME EVIDENCE ON A FILE REWRITTEN EVERY RUN ***",
        sweepOnly.length > 100 && Math.abs(sweepOnly.length - M.evidenceOnlyFromScratch) <= 5,
        `${sweepOnly.length} of them, against ${M.evidenceOnlyFromScratch} measured at v4485. Any one, killed ` +
        "at the cap on a busy box, erased the wall's green -- and the sweep file's own note says it is not a " +
        "claim about the tree");

    // The ledger must actually cover them, or the fix is decoration.
    const ledger = O.loadObserved();
    const covered = sweepOnly.filter((g) => O.observedFinishes(ledger, g));
    // *** THE LEDGER IS ONE SWEEP BEHIND BY CONSTRUCTION, AND SAYING SO IS PART OF THE FIX. *** The ritual
    // writes it before verify; verify's own sweep then observes whatever this round added. So a gate written
    // this round is legitimately in the sweep and not yet the ledger. What must never happen is the reverse --
    // something in the ledger vanishing -- and the lag is REPORTED rather than asserted to be zero, because a
    // check that demanded zero would go red every time a round added a gate, for succeeding.
    const lag = sweepOnly.filter((g) => !O.observedFinishes(ledger, g));
    say(`ledger lag: ${lag.length} of ${sweepOnly.length} swept-only gates not yet merged${lag.length ? " -- " + lag.slice(0, 3).join(", ") : ""}`);
    ok("!! ...and the ledger carries all but this round's own additions, so a cap-kill cannot erase the evidence",
        covered.length >= sweepOnly.length - lag.length && sweepOnly.length > 0 && lag.length <= 5,
        `${covered.length} of ${sweepOnly.length} present in observed-gates.json, ${lag.length} awaiting the ` +
        "next --write. A lag larger than a round's worth of new gates would mean the ritual step is not running");

    // *** THE A/B, COMPUTED RATHER THAN DESCRIBED. *** Simulate the cap-kill and resolve evidence both ways.
    const victims = sweepOnly.slice(0, 5);
    const killed = { ...sweep, codes: { ...sweep.codes } };
    for (const g of victims) killed.codes[g] = 124;
    const sweptFrom = (sw) => { const out = {}; for (const [g, ms] of Object.entries(sw.timings || {}))
        if ((sw.codes || {})[g] === 0 && typeof ms === "number") out[g] = ms; return out; };
    const after = sweptFrom(killed);
    const lostWithout = victims.filter((g) => !(g in after));
    const lostWith = victims.filter((g) => !(g in after) && !O.observedFinishes(ledger, g));
    say(`simulated cap-kill on ${victims.length}: without the ledger ${lostWithout.length} lose all evidence, with it ${lostWith.length}`);
    ok("!! *** THE A/B: five cap-kills erase five gates' evidence WITHOUT the ledger and NONE with it ***",
        lostWithout.length === victims.length && lostWith.length === 0,
        "run for real at v4485 against budgetEvidence itself: exit 1 and '4 with none' before, exit 0 and " +
        "'4 carried by the monotone ledger' after");
}

// ---- 2b. *** TWO CAUSES WEAR ONE SYMPTOM, AND THIS ROUND FIRST BLAMED ONE FOR BOTH *** -------------------------
{
    const sweep = JSON.parse(read("tools/ship/sweep-timings.json"));
    const led = O.loadObserved();
    const inSweep = (g) => g in (sweep.timings || {});
    // A gate written this round: the sweep has not run since, so it is in NEITHER record.
    const fresh = "tools/ship/" + SELF;
    // Gates written in earlier rounds: swept, and therefore remembered.
    const older = ["tools/ship/emitReproducibility-selfcheck.mjs", "tools/ship/stereoDevice-selfcheck.mjs"];
    say(`${SELF}: in sweep ${inSweep(fresh)}, in ledger ${O.observedFinishes(led, fresh)}`);
    for (const g of older) say(`${g.replace("tools/ship/", "").padEnd(34)} in sweep ${inSweep(g)}, in ledger ${O.observedFinishes(led, g)}`);
    // *** ASSERTED ON A NAME THAT CAN NEVER BE SWEPT, NOT ON THIS FILE'S CURRENT STATE. *** The first draft
    // asserted that THIS gate is in neither record, which was true on the day it was written and false the
    // moment the next sweep ran it -- a check that goes red one round later for succeeding. The live state is
    // reported above and the INVARIANT is what is graded: a gate the sweep has never completed has no evidence
    // from either file, and the ledger does not invent one.
    const neverSwept = "tools/ship/__never-swept-selfcheck.mjs";
    ok("!! *** CAUSE (a): A GATE THE SWEEP HAS NEVER RUN HAS NO EVIDENCE, AND THAT IS CORRECT ***",
        !inSweep(neverSwept) && !O.observedFinishes(led, neverSwept) &&
        older.every((g) => inSweep(g) && O.observedFinishes(led, g)),
        "a gate added this round is in exactly that state until the verify's own sweep times it, and the next " +
        "run is green -- which is the 'red first, green on a re-run' this round set out to explain. *** ELEVEN " +
        "OF THE TWELVE REDS WERE THIS, AND THE LEDGER MUST NOT FIX IT: an observation never made cannot be " +
        "invented. *** This file was itself in that state at v4485, which is how the misattribution was caught");
    ok("...and the module says so in its own freeze, rather than the round claiming all twelve for one cause",
        O.MEASURED_AT_V4485.causeNewGateNoEvidence + O.MEASURED_AT_V4485.causeEvidenceErased ===
        O.MEASURED_AT_V4485.redsWatchedThisSession &&
        O.MEASURED_AT_V4485.fixesCauseB === true && O.MEASURED_AT_V4485.fixesCauseA === false,
        "the first draft of this round attributed all twelve to the erasure, and this gate's own arrival " +
        "disproved it by going red as case (a) on the day it was written");
}

// ---- 3. THE WALL CONSUMES IT, AND SAYS SO IN ITS OWN OUTPUT ---------------------------------------------------
{
    const be = stripLineComments(read("tools/ship/budgetEvidence-selfcheck.mjs"));
    ok("!! budgetEvidence resolves the ledger as an evidence source, in code",
        /import \{ loadObserved, observedFinishes \} from "\.\/observedGates\.mjs";/.test(be) &&
        /observedFinishes\(observed, g\) \? "observed"/.test(be),
        "an import with no use in the resolution chain would leave the wall exactly as fragile as it was");
    ok("...and the ledger is consulted AFTER the two live sources, so it backstops rather than masks",
        be.indexOf('typeof swept[g] === "number" ? "swept"') < be.indexOf('observedFinishes(observed, g)'),
        "a fresh observation should win; the ledger answers only when this run has none. Putting it first " +
        "would hide a gate that has genuinely stopped finishing");
    ok("...and its population is reported every run, so a growing 'carried' count is visible",
        /carried by the monotone ledger/.test(be),
        "if many gates start being carried rather than freshly timed, that is worth seeing rather than " +
        "silently absorbing");
}

// ---- 4. *** THE WRITER DOES NOT GRADE AND THE GRADER DOES NOT WRITE *** ---------------------------------------
{
    // *** THE NEEDLE IS ASSEMBLED, BECAUSE THIS FILE IS INSIDE THE POPULATION IT SEARCHES. ***
    // Both rows here failed on their first run for one reason: a gate that looks for a token CONTAINS that
    // token, in the regex it looks with. v4484 disarmed exactly this in tools/ship/emitReproducibility.mjs by
    // building its shader markers from fragments -- and this file, written one round later by the same hands
    // to check that kind of thing, spelled the needle out and matched itself twice. Knowing the rule and
    // applying it at the moment of typing are different, which is why render/backendParity.mjs says its own
    // version of this is a gate and not a habit.
    const writer = read("tools/ship/observedGates.mjs");
    const graderCode = stripLineComments(read("tools/ship/" + SELF));
    // The grader may NAME the call in an assembled string; what it must not do is CALL it -- so the test is for
    // the call form, `fs.<write>(`, which an assembled literal cannot produce.
    ok("!! the writer contains no assertion and the grader never CALLS a write -- claimCheck's rule, kept",
        !/\bok\(/.test(stripLineComments(writer)) && !graderCode.includes("fs." + WRITE_CALL + "("),
        "claimCheck's words: *** A LOOP THAT BOTH WRITES THE RECORD AND GRADES IT CAN MARK ITS OWN WORK " +
        "PASSED. *** Writer, grader and consumer are three files");
    ok("...and the writer only writes when asked, so importing it is inert",
        /process\.argv\.includes\("--write"\)/.test(writer) &&
        /path\.resolve\(process\.argv\[1\]\) === path\.resolve\(fileURLToPath\(import\.meta\.url\)\)/.test(writer),
        "budgetEvidence imports this module on every run and must not thereby rewrite the record it is about " +
        "to be graded against");
    // *** AND PROXIMITY IS NOT A TARGET. *** A draft of this asked whether a write appeared within 200
    // characters of the words "gate-timings" and accused statedRuntime-selfcheck.mjs, which writes its OWN
    // baseline and merely NAMES gate-timings.json in the note beside it. The destination is resolved instead.
    const TARGET = "gate-" + "timings";
    const writers = fs.readdirSync(path.join(ENG, "tools", "ship"))
        .filter((f) => /\.mjs$/.test(f) && f !== SELF)
        .filter((f) => {
            const code = stripLineComments(fs.readFileSync(path.join(ENG, "tools/ship", f), "utf8"));
            const consts = [...code.matchAll(/const (\w+) = ([^\n]*)/g)]
                .filter((m) => m[2].includes(TARGET)).map((m) => m[1]);
            return consts.some((c) => new RegExp("fs\\." + WRITE_CALL + "\\(\\s*" + c + "\\b").test(code));
        });
    say(`writers of ${TARGET}.json: ${writers.join(", ") || "none"}`);
    // *** THE PREMISE THIS ROUND STARTED FROM WAS WRONG AND THIS ROW IS WHERE IT WAS CAUGHT. ***
    ok("!! *** gate-timings.json IS machine-written, by the full suite, and it MERGES -- the discipline exists ***",
        writers.length === 1 && writers[0] === path.basename(O.MEASURED_AT_V4485.gateTimingsWriter) &&
        O.MEASURED_AT_V4485.gateTimingsIsMachineWritten === true && O.MEASURED_AT_V4485.gateTimingsMerges === true &&
        /MERGE rather than replace/.test(read("tools/ship/selfchecks.mjs")),
        "this round opened by asserting the file was hand-fed and that nothing merged into it. Both halves " +
        "were wrong. selfchecks.mjs writes it every full run with the reason one line above the call: *** 'a " +
        "partial run must not delete the timings of gates it never reached' *** -- which is this round's own " +
        "rule, already stated and already implemented, on the other file");
    ok("...and the sweep file REPLACES, correctly, which is why it cannot be the one to remember",
        O.MEASURED_AT_V4485.sweepTimingsReplaces === true &&
        /whole-file rewrite/.test(read("tools/ship/sweepCoverage.mjs")),
        "its job is to say which gates are under budget ON THIS BOX RIGHT NOW; merging stale entries would " +
        "resurrect v4460's defect, where an over-budget entry keeps whatever exit code it had when it was " +
        "last cheap enough to run. *** TWO FILES WITH OPPOSED REQUIREMENTS, AND ONE WALL READ BOTH AS THE " +
        "SAME KIND OF RECORD ***");
}

// ---- 5. THE LEDGER ON DISK IS THE ONE THE MODULE WOULD WRITE ---------------------------------------------------
{
    const ledger = O.loadObserved();
    const sweep = JSON.parse(read("tools/ship/sweep-timings.json"));
    const n = Object.keys(ledger.gates || {}).length;
    say(`ledger holds ${n} gates, first written ${ledger.firstWritten}, last ${ledger.lastWritten}`);
    const sweptOk = Object.values(sweep.codes || {}).filter((c) => c === 0).length;
    ok("the ledger exists, is stamped, and is within a round's worth of what the last sweep saw finish",
        n >= sweptOk - 5 && !!ledger.firstWritten,
        `${n} entries against ${sweptOk} swept clean. It lags by this round's new gates and catches up at the ` +
        "next --write; what it may never do is shrink");
    ok("!! re-merging the current sweep into the stored ledger REMOVES nothing -- the property that matters",
        (() => { const r = O.mergeObservations(ledger, sweep, "probe");
                 return r.removed.length === 0 && Object.keys(r.next.gates).length >= n; })(),
        "adding is expected and is what --write is for. *** LOSING is the failure this ledger exists to make " +
        "impossible, *** and it is the half asserted here");
    ok("...and every entry carries the two facts the wall needs and nothing it does not",
        Object.values(ledger.gates).every((g) => typeof g.lastMs === "number" && typeof g.firstSeen === "string"),
        "a millisecond and the version it was first seen at. No verdict: gateActivity's rule is that this file " +
        "holds milliseconds and a verdict here would have to be invented");
}

console.log("observedGates-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
