// THE RED REGISTER, HELD TO WHAT ITS GATES ACTUALLY SAY (v4380).
//
// *** TWICE IN ONE SESSION A STANDING RED TURNED OUT TO BE UNOPENED MAIL. *** vendoredLicences was red from v4319
// to v4371 because vendor/three-webgpu was undeclared, and nobody ran it because it takes 15 s and the quick sweep
// caps at 3. rigJobs was red from v4129 to v4379 on a line naming a page whose panel had been deliberately removed
// -- filed as a fact about a deleted panel, when what it actually said was that fifteen entries of recorded
// reasoning had been unreachable for 250 rounds. Both were in the register, both were accurate, and neither was
// read. A register is supposed to be a list of reds somebody has ACCEPTED; these were reds nobody had opened.
//
// So this gate asks the one question that would have caught both: DOES EACH ENTRY STILL SAY WHAT IT SAYS IT SAYS?
// tools/ship/register-audit.mjs is the observed side, frozen by tools/ship/freezeRegisterAudit.mjs, which runs
// every gate in the census and writes down its exit code and its first failing line. This compares the two.
//
// *** THE AUDIT FOUND THREE THINGS AND EACH IS A DIFFERENT KIND. ***
//   1. engine/frameDirtyCensus-selfcheck.mjs prints its FAIL line to STDERR, alone among the 29. It still exits 1,
//      so the sweep sees the red -- but the MESSAGE is invisible to anything reading stdout, which is what every
//      consumer in this tree does. A red whose reason cannot be read is most of the way to a red nobody opens.
//   2. referenceKind's entry never recorded a failing line at all: its `fails` is the annotation "(confirmed red
//      serially at 73.7s -- mis-bucketed as a timeout by the parallel sweep)", which is about the SWEEP and not
//      about the gate. What the gate actually says is that a prose-rescued population may only shrink and stands
//      at 221 against a ceiling of 181 -- a RISING number, on a check whose own words are "A RISE MEANS A NEW
//      ORPHAN IS BEING HIDDEN BY A SENTENCE". A live, worsening signal filed under a note about bucketing.
//   3. shaderCensus recorded "only 4 files author a shader in BOTH languages" and now says FOURTEEN. That number
//      is not decoration: the gate has held since v3274 that a hand-written pair is cheaper than an IR "while few
//      files carry both languages -- if this count climbs toward twenty the arithmetic inverts, and THAT is when
//      to re-open the three-stage shape". It was 4 when filed, 12 at v4319 by docs/TSL-ROADMAP.md's own count,
//      and 14 now. THIS BRANCH PUT SOME OF THEM THERE: the TSL rounds added modules authoring both languages.
//      The register was quietly holding a counter that this session was driving toward its own stated trigger.
//      *** ANSWERED AT v4383, AND THE COUNTER WAS THE THING THAT WAS WRONG. *** Four of the fourteen author no
//      GLSL: two of the census's six detector tokens were ordinary English words, so a sentence containing the
//      verb "attribute" read as a shader. The real figure is 10 against a trigger of 20, the census delegates to
//      render/backendParity.mjs classify() now, and the gate is green and pruned from the register. THIS DRIFT
//      CHECK FOUND IT BY ASKING ONLY WHETHER TWO SENTENCES MATCHED -- it could not have known which of the two
//      was wrong, and the answer was neither the register's 4 nor the gate's 14.
//
// WHAT THIS GATE DOES NOT DO: repair any of them, or judge whether a red should be accepted. It checks that the
// register's description of a red is the red's own description of itself, which is the difference between a list
// somebody keeps and a list somebody reads.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RED_AT_V4279 } from "./redCensus.mjs";
import { REGISTER_AUDIT } from "./register-audit.mjs";
import { divergence, renderFor, auditAge } from "./registerRender.mjs";
import { gateReport } from "./gateReport.mjs";

const REPORT = gateReport("tools/ship/registerDrift-selfcheck.mjs");
// Read, not typed -- the same rule this section is about, applied to the section itself.
const ENGINE_VERSION_NOW = () => {
    const ENG2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const m = fs.readFileSync(path.join(ENG2, "main.js"), "utf8").match(/const ENGINE_VERSION = "(v\d+)"/);
    return m ? m[1] : null;
};

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const byGate = new Map(REGISTER_AUDIT.rows.map((r) => [r.gate, r]));

console.log("\n1. EVERY REGISTER ENTRY WAS ACTUALLY RUN, and the audit is not older than the register");
{
    const missing = RED_AT_V4279.filter((e) => !byGate.has(e.gate));
    const extra = REGISTER_AUDIT.rows.filter((r) => !RED_AT_V4279.some((e) => e.gate === r.gate));
    ok(`!! *** every one of the ${RED_AT_V4279.length} standing reds appears in the audit, and the audit carries nothing the register does not ***`,
        missing.length === 0 && extra.length === 0,
        missing.length ? `never run: ${missing.map((e) => e.gate).join(", ")}`
                       : extra.length ? `audited but not registered: ${extra.map((r) => r.gate).join(", ")}`
                       : `${REGISTER_AUDIT.rows.length} rows, frozen at ${REGISTER_AUDIT.at} -- adding a register entry without re-freezing fails HERE rather than going unnoticed`);
}

console.log("\n2. NOTHING IN THE REGISTER IS SECRETLY GREEN");
{
    const green = REGISTER_AUDIT.rows.filter((r) => r.exit === 0);
    ok("!! *** no gate in the register passes: a red that has been repaired and left on the list is a check nobody is getting the benefit of ***",
        green.length === 0, green.length ? green.map((r) => r.gate).join(", ") : `all ${REGISTER_AUDIT.rows.length} still fail, so the register is not carrying a repaired gate as an excuse`);
    const timedOut = REGISTER_AUDIT.rows.filter((r) => r.exit === "timeout");
    ok(`  and a gate too slow to finish inside the audit's cap is recorded as TIMEOUT rather than as a verdict`,
        timedOut.every((r) => !r.first), timedOut.length ? `${timedOut.map((r) => r.gate.replace("tools/ship/", "")).join(", ")} at ${REGISTER_AUDIT.capMs} ms -- a bound, not a measurement` : "none timed out");
}

console.log("\n3. THE MESSAGE THE REGISTER RECORDS IS THE MESSAGE THE GATE GIVES");
{
    // AMONG the gate's failing lines, not just its FIRST. A gate with several reds is ordinary, and asking only
    // about the first reported drift on two gates that had not drifted at all -- the recorded line was still there,
    // with another one printed above it. The register names ONE line; the question is whether the gate still says it.
    const rows = RED_AT_V4279.map((e) => { const a = byGate.get(e.gate) || {};
        const rec = norm(e.fails), all = (a.all || []).map(norm);
        const head = rec.slice(0, 45);
        const matches = !!rec && all.some((n) => n.startsWith(head) || rec.startsWith(n.slice(0, 45)));
        return { gate: e.gate, rec, now: all.join(" | "), matches, exit: a.exit, nLines: all.length }; });
    const drifted = rows.filter((r) => r.exit !== "timeout" && !r.matches);
    for (const d of drifted) {
        console.log(`        ${d.gate.replace("tools/ship/", "")}`);
        console.log(`          register: ${d.rec.slice(0, 120) || "(nothing recorded)"}`);
        console.log(`          gate now: ${d.now.slice(0, 160) || "(no FAIL line on either stream)"}${d.nLines > 1 ? `   [${d.nLines} failing lines]` : ""}`);
    }
    ok(`!! *** every entry's recorded failing line is still the line the gate gives: ${rows.length - drifted.length} of ${rows.length} agree ***`,
        drifted.length === 0,
        drifted.length ? `${drifted.length} DRIFTED -- an entry describing a red the gate no longer gives is a red nobody has read since it was filed, which is how vendoredLicences went 52 rounds and rigJobs went 250`
                       : "so no entry is describing a red that has moved on without it");
}

console.log("\n5. v4400 -- THE REGISTER KEEPS A RENDERING WHERE IT SHOULD KEEP THE SOURCE");
{
    // *** SECTION 3 ABOVE COMPARES THE FIRST 45 CHARACTERS AND IS GREEN, AND THAT IS THE FINDING. ***
    // Forty-five characters reaches the end of an assertion's NAME and stops before its READING, so an entry
    // whose count went stale sails through the check that exists to catch a stale entry. Measured with the
    // whole line: NINE of the twenty-seven quote a number no run of that gate now produces.
    //
    // The two claims are different and both are worth holding, so they are two checks rather than one loosened
    // one. Section 3 says THE REGISTER IS NOT DESCRIBING A DELETED CHECK. This says THE READING IT QUOTES IS
    // STALE -- and the answer is not to retype nine numbers, it is to stop storing the reading at all.
    // *** AND THE FIRST DRAFT OF ALL THREE CHECKS BELOW WAS VACUOUS. *** This file's ok() is (name, cond,
    // detail); gateSweep-selfcheck's is (cond, name, detail). The arguments went in the other file's order, so
    // the CONDITION was printed as the name -- "PASS true" -- and the NAME, a non-empty string, was the
    // condition. Three checks that could not fail, in the round about a register that could not be wrong.
    // Caught by reading the output rather than the exit code, which is the only thing that could have caught it.
    const d = divergence(RED_AT_V4279, REGISTER_AUDIT);
    const age = auditAge(REGISTER_AUDIT, ENGINE_VERSION_NOW());
    for (const k of ["exact", "truncation", "drifted", "moved", "uncaptured", "no-row", "no-line"])
        if (d.counts[k]) console.log(`        ${String(d.counts[k]).padStart(3)}  ${k}`);
    for (const r of d.rows.filter((x) => x.kind === "drifted" || x.kind === "moved" || x.kind === "uncaptured"))
        console.log(`        ${r.kind.padEnd(11)}${r.gate.replace("tools/ship/", "")}`);

    const UNBACKED_CEILING = 10;
    ok(`!! *** entries whose quoted line no recorded run produces may only SHRINK: ${d.unbacked} of ${d.rows.length} ***`,
       d.unbacked <= UNBACKED_CEILING,
       `${d.counts.exact || 0} match a run exactly, ${d.counts.truncation || 0} are a TRUNCATION of one -- a ` +
       `rendering by definition -- and ${d.unbacked} are backed by no run: ${d.counts.drifted || 0} quote a stale ` +
       `READING of a live check, ${d.counts.moved || 0} name something the gate no longer says, ` +
       `${d.counts.uncaptured || 0} cannot be checked because the audit's ${REGISTER_AUDIT.capMs} ms cap cut the ` +
       "gate off before it printed. THE THREE ARE NOT FOLDED TOGETHER: a stale number, a deleted check and an " +
       "uncaptured gate need different work, and one bucket for three species is the defect this section is about");

    // *** AND THE SPECIES SPLIT IS ASSERTED, NOT MERELY REPORTED, BECAUSE A SABOTAGE PROVED IT WAS DECORATION.
    // *** Reverting the classifier to the one-sided normalisation that misread three entries cost ZERO RED: the
    // unbacked TOTAL is the same whichever species an entry lands in, so the ceiling above could not see it.
    // The claim worth holding is the one the measurement actually made -- NOT ONE ENTRY NAMES SOMETHING ITS
    // GATE NO LONGER SAYS. Every divergence in this register is a live check quoting a stale reading, which is
    // a different and much better problem than a register full of deleted checks.
    ok("!! ...and NOT ONE entry names a check the gate no longer has: every divergence is a stale READING",
       (d.counts.moved || 0) === 0,
       `${d.counts.moved || 0} moved, ${d.counts.drifted || 0} drifted. THE REGISTER IS NOT WRONG ABOUT WHAT IS ` +
       "FAILING, IT IS WRONG ABOUT HOW MUCH -- and that is why the fix is to render the reading from the audit " +
       "rather than to prune entries. A classifier that folds the two together cannot tell those apart, and one " +
       "that normalises the filed line but not the recorded one reports the first as the second");

    // *** THE SOURCE MUST BE ABLE TO SAY WHEN IT WAS TAKEN, AND FOR TWENTY ROUNDS IT COULD NOT. ***
    // freezeRegisterAudit.mjs wrote `at: "v4380"` as a STRING LITERAL, so every re-freeze produced a file
    // claiming v4380 -- including one taken at v4399 while measuring exactly this species. It reads main.js now.
    // A canonical source nobody can date is a projection with extra steps, which is this section one level down.
    const AGE_CEILING = 12;
    ok(`!! ...and the audit the register renders from is no more than ${AGE_CEILING} rounds old`,
       age.rounds !== null && age.rounds <= AGE_CEILING,
       age.rounds === null ? "THE AUDIT CANNOT SAY WHEN IT WAS TAKEN, which is how this went unasked: the " +
       "freezer typed the version instead of reading it" :
       `frozen at ${age.frozenAt}, read at ${age.current} -- ${age.rounds} round(s). It was TWENTY when this ` +
       "section was written, and nine readings had drifted in that gap. THE CANONICAL THING GOES STALE TOO; " +
       "the difference is that re-taking it is a command, and retyping nine numbers is a chore nobody does");

    // AND THE LINE A READER SHOULD SEE IS DERIVED, not stored. Proven on the entries that have a run: the
    // rendered line comes from the audit and matches what the gate printed, at the register's own width.
    const rendered = RED_AT_V4279.map((e) => ({ gate: e.gate, ...renderFor(e.gate, REGISTER_AUDIT) }));
    const withLine = rendered.filter((r) => r.line);
    ok("!! ...and every entry with a captured run can have its line RENDERED rather than retyped",
       withLine.length === RED_AT_V4279.length - (d.counts.uncaptured || 0),
       `${withLine.length} of ${RED_AT_V4279.length} render from the audit; ` +
       `${(d.counts.uncaptured || 0)} cannot, and each says why rather than showing a blank. THE TYPED LINE ` +
       "ADDS NOTHING: asked which of its words appear in no recorded line of that gate, four entries answer " +
       "with a FILENAME CUT IN HALF by the 110-column clip, which is not information but a broken rendering");

    REPORT.table("the register against the runs it should render from",
        ["how the quoted line stands to the run", "entries"],
        [["matches a run exactly", d.counts.exact || 0],
         ["a truncation of one", d.counts.truncation || 0],
         ["a stale READING of a live check", d.counts.drifted || 0],
         ["names something the gate no longer says", d.counts.moved || 0],
         ["no line captured (the audit's cap)", d.counts.uncaptured || 0]],
        "Section 3 compares the first 45 characters and is green: that reaches the end of an assertion's NAME " +
        "and stops before its READING. The register is not describing deleted checks; it is quoting stale " +
        "numbers, and the fix is to stop storing the reading rather than to retype it.");
    REPORT.table("how old the source is",
        ["field", "value"],
        [["audit frozen at", age.frozenAt], ["read at", age.current], ["rounds between", age.rounds]],
        "The freezer wrote this version as a string literal until v4400, so the audit claimed v4380 for twenty " +
        "rounds including a re-freeze taken at v4399.");
    REPORT.write();
}

console.log("\n4. A RED WHOSE REASON CANNOT BE READ");
{
    const stderrOnly = REGISTER_AUDIT.rows.filter((r) => r.onStderr);
    ok(`!! *** every gate prints its FAIL line where the tree reads it: ${REGISTER_AUDIT.rows.length - stderrOnly.length} of ${REGISTER_AUDIT.rows.length} on stdout ***`,
        stderrOnly.length === 0,
        stderrOnly.length ? `${stderrOnly.map((r) => r.gate).join(", ")} prints to STDERR. It still exits 1, so the sweep sees the red -- but every consumer in this tree scrapes stdout, so the REASON is invisible. That is most of the way to a red nobody opens, which is the failure this whole gate exists for`
                          : "so a red's reason reaches every consumer that scrapes a verdict");
    const noLine = REGISTER_AUDIT.rows.filter((r) => r.exit !== "timeout" && r.count === 0);
    ok("  and a gate that fails without printing any FAIL line at all is named, because an exit code with no sentence is a red nobody can act on",
        noLine.length === 0, noLine.length ? noLine.map((r) => r.gate).join(", ") : "every failing gate says something");
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4380.
//   BJ the shaderCensus entry put back to the stale count of 4 -> exit=1, 1 red, naming the gate and printing both
//      lines: what the register says and what the gate says. That is the whole mechanism in one failure.
//   BK the FAIL line moved back to stderr in engine/frameDirtyCensus-selfcheck.mjs, with the audit RE-FROZEN so the
//      change is observed rather than assumed -> exit=1, 1 red. Re-freezing is part of the sabotage: a check that
//      read the source instead of a run would have caught this one for the wrong reason.
//
// AND THIS GATE'S FIRST DRAFT REPORTED DRIFT ON TWO GATES THAT HAD NOT DRIFTED. It compared the register's line
// against the gate's FIRST failing line, and a gate with several reds is ordinary -- boundaryLint and
// pagePlacements each print another line above the one recorded, so both read as drifted when the recorded line was
// still there. The audit now freezes EVERY failing line and the comparison asks whether the recorded one is among
// them: 4 drifted became 2, and the two that remain are real.
// SABOTAGE LOG for section 5 -- applied, gate run, exit code read, restored. MEASURED at v4400.
//   BJ the unbacked ceiling dropped by one -> exit=1, 1 red naming the count.
//   BK the audit's recorded version rolled back to v4380 -> exit=1, 1 red: 19 rounds against a ceiling of 12.
//      THAT IS THE STATE THIS ROUND FOUND THE TREE IN, reproduced as a sabotage.
//   BL the classifier reverted to the one-sided normalisation that misread three entries -> *** 0 RED THE FIRST
//      TIME, AND THAT WAS A GAP RATHER THAN A PASS. *** The unbacked TOTAL is identical whichever species an
//      entry lands in, so the ceiling could not see a misclassification at all -- the split was decoration. The
//      claim the measurement actually made is now asserted (not one entry names a check the gate no longer
//      has), and the same sabotage takes it red at 9 moved / 0 drifted.
//
// AND ALL THREE OF THIS SECTION'S FIRST-DRAFT CHECKS WERE VACUOUS. This file's ok() is (name, cond, detail);
// gateSweep-selfcheck's is (cond, name, detail). They went in the other file's order, so the CONDITION printed
// as the name -- "PASS true" -- and the NAME, a non-empty string, served as the condition. Three checks that
// could not fail, in the round about a register that could not be wrong. Caught by READING THE OUTPUT rather
// than the exit code, which was zero throughout.
//
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether a red SHOULD be accepted, which is a judgement and not a comparison -- this gate only " +
    "asks whether the register's description matches the gate's; whether the three findings the v4380 audit turned up are " +
    "REPAIRED -- the third was, at v4383, and the other two are named in the header rather than folded into a count; and " +
    "whether a COUNT a register records is itself correct, which this gate cannot ask and which is how shaderCensus's " +
    "entry and its gate agreed for eleven hundred rounds on a number neither of them had re-derived.");
process.exit(fails ? 1 : 0);
