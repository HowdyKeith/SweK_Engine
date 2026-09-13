// WebGLEngine/tools/ship/ritualCoherence-selfcheck.mjs -- v4557
//
// Run: node tools/ship/ritualCoherence-selfcheck.mjs
//
// GATES tools/ship/shipRitual.mjs's STEPS against two things nothing was asking:
//   1. every step is CHECKED by something -- a verify() of its own, or a named gate that exists on disk;
//   2. a step whose `command` claims to WRITE can actually write -- the program it names contains a write.
//
// *** THE SECOND ONE IS HERE BECAUSE A STEP SAID "REFRESH" AND RAN THE CHECKER. *** `derived-counts` --
// "Refresh every derived count that is baked into a page" -- had `command: node tools/ship/staleness-selfcheck.mjs`,
// and that file contains NO writeFileSync at all. Running it changes nothing; the writer is staleness.mjs --fix,
// and the two are separate on purpose (staleness.mjs's own header: --fix "is never part of a check run"). So a
// ritual followed exactly never refreshed a single derived count. It reported the drift and moved on.
//
// MEASURED CONSEQUENCE: case-study.html claimed 1,606 gates against 1,609 on disk at v4557 -- three rounds of
// drift in a number a READER sees. And the gate that would have said so could not: staleness-selfcheck was
// recorded at 3,316 ms against a 3,000 ms budget, so the ship-time sweep skipped it, and its recorded exit code
// was a 0 frozen from before it went red. Re-timed it is 558 ms. *** THAT READING WAS STAMPED
// "unknown -- before v4408" *** -- older than per-entry stamping -- and budget exile is a ONE-WAY DOOR: a gate
// over budget is skipped, so it is never re-timed, so it stays over budget. 398 of the 465 over-budget gates
// carry that stamp, and 164 of them sit under 8 seconds. Sixteen sampled across that range were re-timed alone
// and FOURTEEN came in under budget. That is filed rather than fixed here: it is backlog #14 and it needs its
// reds triaged, not a bulk re-time.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS } from "./shipRitual.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

console.log("ritualCoherence-selfcheck -- the ship ritual's steps against what they claim\n");

/** A step whose command is a hand edit or an HTTP call has no program to inspect; those are named, not guessed. */
const NOT_A_PROGRAM = /^\(edit\)|^curl |^zip /;
const nodeScript = (cmd) => { const m = String(cmd || "").match(/^node\s+(\S+)/); return m ? m[1] : null; };

// =============================================================================================================
console.log("1. *** EVERY STEP IS CHECKED BY SOMETHING, AND THE SOMETHING EXISTS ***");
{
    const rows = STEPS.map((s) => ({
        id: s.id,
        verify: typeof s.verify === "function",
        gate: s.gate || null,
        gateExists: s.gate ? fs.existsSync(path.join(ENG, s.gate)) : null,
    }));
    const unchecked = rows.filter((r) => !r.verify && !r.gate);
    const brokenGate = rows.filter((r) => r.gate && !r.gateExists);
    say(`${rows.length} steps: ${rows.filter((r) => r.verify).length} with a verify(), ` +
        `${rows.filter((r) => r.gate).length} with a named gate, ${unchecked.length} with neither`);
    // *** THE FILED ITEM SAID EVERY WRITING STEP WAS UNGATED AND EVERY READING ONE GATED. IT IS NOT SO. ***
    // Nine of the ten steps WRITE (two of them -- knowledge-index and engine-catalog -- rebuild a JSON file,
    // which a first pass of this census misread as reading). Only `verify` is read-only. And nine of the ten
    // carry a verify() or a gate. The real gap is ONE step, `package`, and it is a write.
    ok("!! *** AT MOST ONE STEP IS UNCHECKED, AND IT IS NAMED RATHER THAN COUNTED ***",
        unchecked.length <= 1 && unchecked.every((r) => r.id === "package"),
        unchecked.length ? `unchecked: ${unchecked.map((r) => r.id).join(", ")}. \`package\` zips the tree and ` +
            `presents it; what would verify it is the zip's own contents against the diff the step describes, ` +
            `which is a round rather than a line. NAMED HERE so that a SECOND unchecked step goes red.`
            : "every step carries a verify() or a gate");
    ok("!! ...and every named gate is a file that exists",
        brokenGate.length === 0,
        brokenGate.length ? "MISSING: " + brokenGate.map((r) => `${r.id} -> ${r.gate}`).join(", ")
            : rows.filter((r) => r.gate).map((r) => r.gate.replace(/^tools\/ship\//, "")).join(", ") +
              " -- a step pointing at a gate that was renamed or deleted reads exactly like a step that is checked.");
}

// =============================================================================================================
console.log("\n2. *** A STEP THAT SAYS IT WRITES MUST NAME A PROGRAM THAT CAN WRITE ***");
{
    const CLAIMS_WRITE = /^(refresh|record|rebuild|bump|prepend|zip|cut)\b/i;
    const rows = [];
    for (const s of STEPS) {
        const claims = CLAIMS_WRITE.test(String(s.what || ""));
        const script = nodeScript(s.command);
        let canWrite = null, why = "";
        if (!claims) { why = "does not claim to write"; }
        else if (!script) { canWrite = null; why = "no program to inspect: " + String(s.command).slice(0, 30); }
        else {
            const f = path.join(ENG, script);
            const src = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
            canWrite = /writeFileSync|createWriteStream|appendFileSync/.test(src);
            why = canWrite ? "has a write" : "*** NO WRITE IN " + script + " ***";
        }
        rows.push({ id: s.id, claims, script, canWrite, why });
    }
    for (const r of rows.filter((r) => r.claims && r.script)) say(`${r.id}: ${r.script} -- ${r.why}`);
    const liars = rows.filter((r) => r.claims && r.script && r.canWrite === false);
    ok("!! *** NO STEP CLAIMS TO WRITE WHILE NAMING A PROGRAM THAT CANNOT ***",
        liars.length === 0,
        liars.length ? "CLAIMS WRITE BUT CANNOT: " + liars.map((r) => `${r.id} -> ${r.script}`).join(", ")
            : "`derived-counts` was exactly this until v4557: it said \"Refresh every derived count\" and ran " +
              "staleness-selfcheck.mjs, which has no writeFileSync anywhere. A ritual followed exactly never " +
              "refreshed anything, and case-study.html drifted to 1,606 against 1,609 with nothing looking.");
    ok("...and the check is not vacuous: it really does find the write in the programs that have one",
        rows.filter((r) => r.claims && r.script && r.canWrite === true).length >= 3,
        rows.filter((r) => r.claims && r.script && r.canWrite === true).map((r) => r.id).join(", ") +
        " each name a program containing a write. A detector that found writes nowhere would pass row one by " +
        "being blind, so the population it DOES find is asserted beside it.");
}

// =============================================================================================================
console.log("\n3. *** THE STEP AND ITS GATE MUST NOT BE THE SAME PROGRAM ***");
{
    // The defect above had a second face: `derived-counts` named staleness-selfcheck as BOTH the command and
    // the gate. A step that is its own check cannot fail -- running it IS the verification, so the ritual
    // records a step performed and a check passed for one action that did nothing.
    // *** ONE STEP IS ALLOWED TO BE ITS OWN GATE, NAMED AND EARNED. *** `verify`'s whole ACTION is to run the
    // ship gate, so command and gate coinciding is what that step means. The exemption is not a free pass: the
    // row below requires it to be the READ-ONLY step, because the failure this section exists for -- a step
    // that reports "performed" and "checked" from one run that did nothing -- can only bite a step that was
    // supposed to change something. An exemption nobody checks is how a ratchet becomes a wish.
    const SELF_GATE_OK = "verify";
    const same = STEPS.filter((s) => s.gate && nodeScript(s.command) === s.gate);
    const unexpected = same.filter((s) => s.id !== SELF_GATE_OK);
    say(`${STEPS.filter((s) => s.gate).length} steps name a gate; ${same.length} name it as their command too`);
    ok("!! *** NO STEP IS ITS OWN GATE, EXCEPT THE ONE WHOSE ACTION IS TO RUN A GATE ***",
        unexpected.length === 0,
        unexpected.length ? "SELF-GATED: " + unexpected.map((s) => `${s.id} -> ${s.gate}`).join(", ")
            : `only \`${SELF_GATE_OK}\` is, and that is what it means. Doing the thing and checking the thing ` +
              "are different actions everywhere else: a step that performs its check as its command reports " +
              "both from one run. `derived-counts` did exactly that until v4557 -- command and gate were the " +
              "same file, and that file wrote nothing.");
    ok("!! ...and the exemption is EARNED: the self-gated step is the one that does not write",
        (() => { const v = STEPS.find((s) => s.id === SELF_GATE_OK);
                 if (!v || v.gate !== nodeScript(v.command)) return false;
                 const CLAIMS_WRITE = /^(refresh|record|rebuild|bump|prepend|zip|cut)\b/i;
                 return !CLAIMS_WRITE.test(String(v.what || "")); })(),
        "`verify` is the ONE step of the ten that does not write, which is exactly why command-equals-gate " +
        "cannot hide a no-op there. If it ever gains a write, this row goes red and the exemption expires " +
        "with it rather than outliving the reason for it.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\n*** THE FILED ITEM THIS ROUND CAME FROM WAS WRONG, AND THE MEASUREMENT IS THE POINT: *** it read " +
    "\"every ship-ritual step that WRITES a record is ungated; every step that only READS one has a gate\". " +
    "NINE of the ten steps write -- two of them rebuild a JSON file, which a first pass of this census itself " +
    "misread as reading -- and nine of the ten carry a verify() or a gate. The real gap was one step with " +
    "neither (`package`) and one step whose command could not do what its description claimed. " +
    "\nNOT CHECKED HERE: whether a step's command actually does the RIGHT write, only that it contains one -- " +
    "a program that writes the wrong file passes this. And 124 -selfcheck files in this tree contain a write; " +
    "at least one (rigCanvas-selfcheck) rewrites a record on a PLAIN run, which is a check with a side effect " +
    "and is filed rather than surveyed, because establishing which of the 124 write unflagged means running " +
    "them all.");
process.exit(fails ? 1 : 0);
