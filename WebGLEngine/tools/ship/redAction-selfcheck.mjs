// WebGLEngine/tools/ship/redAction-selfcheck.mjs -- v4585
//
// Run: node tools/ship/redAction-selfcheck.mjs
// RUNTIME 27565 ms ALONE (median of 27565/28323/27473 at v4587, up from 6709 ms at v4585). Well over the
// 3000 ms sweep budget: it RUNS its subjects as children, because classifying a red from its own printed failure
// means making it print one. quickSweep confirms it serially per v4408 and files an ALONE reading; it belongs in
// the full suite.
//
// THE 4x IS THE POPULATION, AND IT IS THE POINT: v4585 ran three children off a typed list, v4587 derives the
// list from the sweep record and runs 29. Measured at eight-wide inside this gate: 25.1 s for the 29, against
// 126.2 s of recorded serial time. IT NESTS -- during a full sweep this gate spawns 8 children while the sweep
// itself runs 8-wide -- which is survivable only because quickSweep re-runs an over-budget gate ALONE.
// Not one of the 29 writes to the tree -- established on the THIRD try, after the first two compared a git
// status that was already dirty and so could not have shown a write either way. See redCensus.standingReds.
//
// sweep-timings.json STILL SAYS 6709 AND IS NOT HAND-EDITED TO SAY OTHERWISE. Its own note says it holds what
// "the last quickSweep run" OBSERVED, and typing a number I measured elsewhere into a record that claims to be
// observed is the declared-for-derived swap this file exists to object to. The next full sweep writes it; until
// then the honest state is a record four times behind and a header that says so. gate-timings.json has no entry
// for this gate at all, for the same reason -- tools/ship/selfchecks.mjs writes that one on a full run.
//
// SABOTAGE v4587 (section 4, rebuilt): 6 mutations. 4 caught, 1 uncompletable, 1 genuine 0-RED that was MY
// MUTATION AIMED WRONG, and two of the three scoring mistakes were ones this header already warns about:
//   - M2 removed the exclusions from standingReds() so 124s and __ fixtures counted as reds. First scored as a
//     0-RED. IT WAS A KILL: the gate drove 165 gates instead of 29 and `timeout` took it at exit 124, so the
//     empty output grepped to FAIL=0. *** A CRASH IS NOT A VERDICT AND NEITHER IS A KILL, *** which is the rule
//     this very round wrote into standingReds' own doc comment about the sweep's 136 capped gates -- and the
//     harness scoring it still read the silence as a pass. Rescored with the exit code captured: the mutation
//     does not produce a wrong answer, it produces NO answer in fifteen minutes. The exclusion is load-bearing
//     twice over: for correctness, and for termination.
//   - M4 stripped the detail off a live red to force a fifteenth bare line, and the ratchet did not move. A real
//     0-RED, and the cause was the target: that line WAS ALREADY ONE OF THE FOURTEEN, so nothing could change.
//     Re-aimed at pageReflow, whose detail names files: 14 -> 15 and the ratchet fired. A mutation that does not
//     change the measured quantity tests nothing, and picking the target by "it is a red" is not picking it.
//   - and M4's re-aim found a defect in the detector being sabotaged, which is the point of doing it: the
//     leftover fallback said "(Keith measured 267ms)" and `\b\d+\b` refused it, because the trailing boundary
//     rejects a number glued to its unit. Repaired to `\b\d+` at the site, with the measurement both ways.
// M1 (population typed out instead of derived) -> 2 rows red. M3 (a live red given a command) -> the command row
// red, naming the gate. M5 (ratchet seed inflated to 20) -> the slack row red. M6 reverted instruments' repaired
// detail and NOTHING WENT RED, because its subject is green now and no check reads a passing row's shape -- an
// honest gap, stated rather than papered over: the evidence rule can only see a row that is failing.
// M7 put recordDrift back to the count comparison against a content-stale index: the pre-flight printed
// "1643 gates, rebuilt and byte-identical". With the content comparison it printed the changed entry by name.
//
// SABOTAGE v4585: 14 mutations, 14 red, no 0-RED, nothing crashed -- after passes that produced eight 0-REDs and a crash,
// every one a defect here. The instructive ones:
//   - the first baseline was itself red, because ADDING THIS GATE RE-STALED THE PAGE. Every comparison in that run
//     was against a moving baseline, which is why the sweep is re-run after the one command.
//   - the harness counted a red going GREEN as a catch, so "the one real writer removed" scored as detected while it
//     had only stopped staleness-selfcheck from testing anything.
//   - adding a 63-second gate to the DRIVEN list took this gate past seventy seconds and the sabotage sweep from four
//     minutes to twenty, for one classification. redCensus already settled that rule -- "re-verifying a registered red
//     means RUNNING it... does not belong in a pre-flight" -- so the cheap red is driven and the costly one is read.
//   - and the read arm first classified the gate's WHOLE SOURCE, so any count-ish phrasing in any of thirty rows
//     satisfied it: deleting the OWED clause from the row that actually fails moved nothing. It reads the one named
//     row now, because the driven arm classifies the FAIL lines a run prints and the two must ask the same question.
//   - three anchors were satisfied by a sibling line or a substring: `export function fixDerived` still matches
//     `fixDerivedX`, `stalenessRows({ read:` matched another use in the same file, and a consistency check on the
//     frozen figures was satisfied by a coherent rewrite that shrank the finding from 37 gates to 1. The frozen
//     numbers are pinned to their literals now, because the only check on history is that it has not been edited.
//
// *** A RED THAT NAMED ITS OWN ONE-COMMAND FIX WAS CARRIED AS FURNITURE FOR SIX ROUNDS. ***
//
// tools/ship/staleness-selfcheck.mjs was red on "case-study gate count claims 1605, actual 1642", and its failure
// text said, in capitals: "THE FIX IS ONE COMMAND: node tools/ship/staleness.mjs --fix". v3087 decided deliberately
// that --fix NEVER RUNS DURING A CHECK, because "a ritual that auto-fixed before asserting would be a gate that
// agrees with whatever shipped", and v3922 added the sentence naming the command precisely so the human step would
// be obvious. THE DESIGN WAS COMPLETE AND CORRECT. I read the red six times across v4580-v4584, wrote "budgetExile,
// definitionGates and staleness, equally red at HEAD" into six round summaries, and never read the message. One
// command closed it, and budgetExile-selfcheck went green with it -- it had only ever been reporting staleness's
// debt from another instrument.
//
// THAT IS THE SAME DEFERENCE THAT LEFT configContract 24x WRONG IN gateBudget.MEASURED FOR ELEVEN ROUNDS (v4581),
// and hostScale's citation stale for 644 versions (v4580). A standing red is not a fact about the tree; it is a
// message nobody has opened.
//
// AND THE THIRD RED WAS MISDESCRIBED TOO. I called definitionGates-selfcheck's reds "three deliberately immovable
// ratchets" every round. The ratchets are frozen so they can only move DOWN -- that is the design -- but the
// redness is UNPAID DEBT with a prescribed repair in the file's own words: 55 exported symbols under physics/, 319
// tree-wide, 617 of any shape, each owed "a check that calls it and grades the answer", each to be "closed by
// ASSERTION, not by mention" and sabotage-confirmed red first. Large, named, and not intentional.
//
// WHAT THIS GATE IS FOR: every red must name what closes it, and the classification is derived from the gate's own
// output rather than from a register somebody maintains. Two kinds, and the difference is the whole point -- a red
// naming a COMMAND is a pending human step and should never survive a round; a red naming a COUNT is debt and may.
// A red naming neither is a red nobody can act on, which is how six rounds went by.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prose } from "./sourceScan.mjs";
import { stalenessRows } from "./staleness.mjs";
import { standingReds, driveReds } from "./redCensus.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

/** A red's own failure lines, and what they prescribe. Classified from the text the gate itself prints. */
const COMMAND = /\b(?:node|npm|python3?)\s+[\w./-]+/;
// *** AND THE COUNT ARM KNEW ONLY THE RATCHET DIALECT, WHICH IS A STRING PROXY WEARING A CLASSIFIER'S CLOTHES. ***
// The first version matched `frozen N`, `GREW to N`, `ratchets down`, `baseline N` -- definitionGates' vocabulary and
// nobody else's. gateSelection's repaired message says "22 of the first 123 selected are NOT reachable" and "OWED:
// ...", names a size and what is due, and was classified as naming NOTHING. A classifier that recognises one way of
// saying a thing is the defect this round is about, so the arm asks for a SIZE or an explicit debt marker instead.
const COUNT = /\bfrozen\s+\d+|against a frozen|GREW to \d+|ratchets? (?:down|DOWN)|baseline \d+|\b\d+ of (?:the first )?\d+\b|\bOWED\b/;

function runGate(rel, timeoutMs = 120000) {
    const r = spawnSync(process.execPath, [path.join(ENG, rel)], { cwd: ENG, encoding: "utf8", timeout: timeoutMs });
    const out = String(r.stdout || "") + String(r.stderr || "");
    const failLines = (out.match(/^ {2}FAIL.*/gm) || []);
    return { rel, code: r.status, failLines, out };
}

function classify(failLines) {
    const text = failLines.join("\n");
    return { command: COMMAND.test(text) ? (text.match(COMMAND) || [])[0] : null, count: COUNT.test(text) };
}

console.log("redAction-selfcheck -- every red names what closes it, or nobody can act on it\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE TWO REDS I CARRIED FOR SIX ROUNDS ARE GREEN, AND ONE COMMAND DID IT ***");
{
    // Frozen: what the two gates said before v4585 ran the command their own text named.
    const CARRIED_V4580_TO_V4584 = Object.freeze({
        rounds: 5, gates: Object.freeze(["tools/ship/staleness-selfcheck.mjs", "tools/ship/budgetExile-selfcheck.mjs"]),
        claimed: 1605, actual: 1642, behind: 37,
        command: "node tools/ship/staleness.mjs --fix",
    });
    const c = CARRIED_V4580_TO_V4584;
    say("the page said / the tree held / behind by", `${c.claimed} / ${c.actual} / ${c.behind} gates`);
    say("what the failure text named", c.command);
    // PINNED TO THE LITERALS, because a consistency check on a frozen record is satisfied by a coherent rewrite:
    // a sabotage set 1641/1642/1 and the arithmetic still held while the finding's size was gone. These three
    // numbers are HISTORY -- what the page said, what the tree held, and the gap on the day it was read -- and the
    // only check on history is that it has not been edited.
    ok("...and the frozen figures are the ones that were read, arithmetic AND literals",
        c.claimed === 1605 && c.actual === 1642 && c.actual - c.claimed === c.behind,
        `${c.actual} - ${c.claimed} = ${c.behind}. Editing any of the three to shrink the finding fails here; ` +
        "the arithmetic alone would not have noticed.");

    const now = c.gates.map((g) => runGate(g, 180000));
    for (const r of now) say(r.rel.split("/").pop().padEnd(32), r.code === 0 ? "green" : `red (${r.failLines.length} rows)`);

    // *** AND THIS ROW MUST NOT ASSERT THAT THEY ARE GREEN RIGHT NOW, WHICH THE FIRST DRAFT DID. ***
    //
    // caseStudy-selfcheck says it plainly: "Adding a gate makes this red every time, by design". ADDING THIS VERY
    // GATE RE-STALED THE PAGE -- 1642 became 1643 while the file was being written, and the draft row went red on
    // the cycle it exists to describe. A gate asserting the live state of an intended red-then-green cycle is a
    // tripwire on the design, and it is the same fault as the frozen-table rule v4576-v4580 kept re-learning: a
    // check reporting a measurement of a record's state must FREEZE that state.
    //
    // What is asserted instead is the CAPABILITY, driven: fixDerived can close the case-study row, on today's tree,
    // without writing anything. That is true in the stale half of the cycle and the fresh half alike.
    // *** AND IT MUST NOT CALL fixDerived, EVEN DRY, WHICH THE TREE CAUGHT. ***
    //
    // The draft above this called fixDerived({write:false}) to show the row was closable. staleness-selfcheck
    // asserts "NO gate calls fixDerived, so nothing repairs what it measures" and went red naming this file. The
    // rule is not about writing: a gate that can repair its own subject is what v3087 refused, and write:false is
    // a promise about one argument rather than a property of the design. THE RED I SPENT THIS ROUND LEARNING TO
    // READ IS THE ONE THAT CAUGHT ME, on the first run after I imported the fixer.
    //
    // So the capability is established from the fixer's SOURCE and the rows are READ, never driven: stalenessRows()
    // only reads, and the one row that matters is asked whether the writer downstream knows how to close it.
    const fixerSrc = fs.readFileSync(path.join(HERE, "staleness.mjs"), "utf8");
    const rows = stalenessRows();
    const csRow = rows.find((r) => r.id === "case-study gate count");
    const handled = /if \(r\.id === "case-study gate count"\)/.test(fixerSrc);
    say("the case-study row, read not driven", `claimed ${csRow.claimed}, actual ${csRow.actual}, ok ${csRow.ok}`);
    ok("*** the row the command closes is the row the writer handles, named in both places ***",
        handled && csRow.claimed !== null && csRow.actual > 100,
        "one command closed BOTH gates at v4585: staleness-selfcheck was red on a page 37 gates behind and " +
        "budgetExile-selfcheck was red BECAUSE OF IT ('recorded REPAIRED, ran OWED'). NOTHING WAS BUILT FOR THAT " +
        "FINDING -- the repair existed since v3087, the command was printed in the failure text, and the only " +
        "missing step was reading it. The live redness is reported above and deliberately not asserted: adding a " +
        "gate re-stales the page, which is the cycle, not a defect.");

    // AND THE FIX IS STILL NOT ALLOWED TO RUN INSIDE A CHECK, which is the half that must not be 'improved'.
    const csGate = fs.readFileSync(path.join(ENG, "tools", "caseStudy-selfcheck.mjs"), "utf8");
    // I: deleting the one-command sentence from the failure text moved nothing until this row existed -- and that
    // sentence IS the repair v3922 shipped, since the red is by design and the human step is all there is.
    ok("*** the failing text still NAMES the command, which is the whole of v3922's fix ***",
        new RegExp(c.command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(csGate),
        `"${c.command}" -- a red by design whose message does not say what to do is a red that becomes furniture, ` +
        "which is exactly what happened here for five rounds.");

    ok("...and --fix still never runs during a check, which is the design and not an oversight",
        /--fix NEVER RUNS DURING A CHECK/.test(prose(csGate)) &&
        /a gate that agrees with whatever shipped/.test(prose(csGate)),
        "v3087's reason, in the tree's own words. THIS ROUND'S FIRST DRAFT PROPOSED ADDING A SHIP STAGE THAT " +
        "AUTO-FIXED BEFORE VERIFY -- exactly what that sentence refuses -- and it was refused by reading the file " +
        "rather than by anything going red.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** AND A DUPLICATE BAKER WAS WRITTEN BEFORE CHECKING FOR ONE, IN THIS ROUND ***");
{
    const stale = fs.readFileSync(path.join(HERE, "staleness.mjs"), "utf8");
    ok("*** staleness.mjs holds exactly ONE writer of the page's derived numbers ***",
        // `\b...\(` so a rename to fixDerivedX is not read as the function still being there: the third substring
        // trap in this round alone, after `budgetIsOwn`/`budgetIsOwnX` at v4583 and the fixDerived comment scan above.
        (stale.match(/export function fixDerived\s*\(/g) || []).length === 1 &&
        !/export function refreshCaseStudyGates/.test(stale),
        "v4585's first draft added refreshCaseStudyGates() to this file -- read the page, replace the stat, write " +
        "it back -- twenty lines above fixDerived(), which has done that since v3087. A SECOND COPY OF ONE RULE, " +
        "committed by the round three deep in finding second copies elsewhere: a fourth walker at v4582, a fifth " +
        "at v4583, a fifth again at v4584. The round asked the ship's stages and grep whether a baker existed, and " +
        "did not ask the file it was editing.");

    ok("...and the deletion is recorded where it happened rather than only in a changelog",
        /A BAKER WAS WRITTEN HERE BEFORE CHECKING/.test(prose(stale)),
        "the note sits at the top of the function it duplicated, which is where the next person looking for a " +
        "baker will be standing.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE ROW THAT PROMISED FALSIFIABILITY AND RE-ASSERTED THE THING IT PROTECTED ***");
{
    const gate = fs.readFileSync(path.join(HERE, "staleness-selfcheck.mjs"), "utf8");
    const onDisk = (f) => { try { return fs.readFileSync(path.join(ENG, f), "utf8"); } catch { return ""; } };
    ok("*** the tautology is gone: the comparison is now DRIVEN with a wrong claim ***",
        // The driven row's OWN condition, not merely "the file mentions the injection somewhere" -- reverting the
        // condition to `claimed === actual` left another use of stalenessRows({read: ...}) in the same file and the
        // check passed. An anchor that any sibling line satisfies is not an anchor.
        /wrong\.ok === false && wrong\.claimed === 1/.test(gate) && /driven, not asserted/.test(gate),
        "the row was headed 'the comparison is a real equality, not a tautology' under a section headed 'it can " +
        "FAIL -- a control that cannot fail is decoration', and its condition was `claimed === actual` -- WHAT " +
        "SECTION 1 ALREADY ASSERTS. Its own comment described the right design: 'Count gates with a deliberately " +
        "wrong claim'. Prose right, code wrong, inside the section about controls that cannot fail.");

    // *** AND THE STUB MUST BE NARROW, WHICH A SABOTAGE FOUND. *** Making the injected reader total -- returning the
    // wrong page for EVERY file -- left the driven row passing while the other two rows failed from the stub rather
    // than from the tree. A control whose fixture is too total proves the detector fires, and nothing about what it
    // fired on. The driven call must leave every row it does not target untouched.
    const other = stalenessRows({ read: (f) => (f === "case-study.html" ? "<b>1</b><span>gates</span>" : onDisk(f)) })
        .filter((r) => r.id !== "case-study gate count");
    // AND THE SAME NARROWNESS IN staleness-selfcheck'S OWN STUB, read from its source: making THAT one total was a
    // 0-RED here, because this gate was only ever checking the stub it builds itself.
    const theirStubNarrow = /read: \(f\) => \(f === "case-study\.html" \?/.test(gate);
    ok("...and the driven call substitutes ONE file, in this gate and in staleness-selfcheck's own stub",
        other.length >= 2 && other.every((r) => r.ok) && theirStubNarrow,
        other.map((r) => `${r.id}=${r.ok}`).join(", ") + ". A stub that answers every read would make this section " +
        "pass on a detector firing at its own fixture.");

    ok("...and stalenessRows is injectable, which is recordDrift.checks()'s shape since v4482",
        /export function stalenessRows\(\{ read = readOr, gateCount = countGateFiles \} = \{\}\)/.test(fs.readFileSync(path.join(HERE, "staleness.mjs"), "utf8")),
        "'a drift detector that cannot be given drift is a detector nobody has run' -- the same sentence, the " +
        "same remedy, one file over and three years apart.");

    ok("...and ONE stale number was reporting as TWO reds, which is why the red looked bigger than it was",
        /one stale number reported as TWO reds/.test(prose(gate)),
        "FAIL=2 appeared in six verify sweeps for a single defect, because the duplicate row failed alongside the " +
        "real one. A count of reds is not a count of defects.");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE POPULATION IS DERIVED NOW. IT WAS A LIST OF TWO, UNDER ROWS BEGINNING 'EVERY RED'. ***");
{
    // *** v4587 -- THIS SECTION SAID "every red still standing names a COUNT" AND ASKED TWO GATES. ***
    //
    // v4585 typed out STANDING = [definitionGates, gateSelection] -- the two reds that round had been reading --
    // and wrote three rows over them beginning "every red still standing", "...and none of them", "...and a red
    // naming NEITHER would be unactionable". All three passed. Both members happen to speak the classifier's
    // own dialect, so the rows were true of the list and said nothing about the tree.
    //
    // A DECLARED POPULATION UNDER THE WORD "EVERY" IS THE FAULT THIS WHOLE ARC IS ABOUT: v4582 found the skip
    // guard at one of two runners, v4583 found budgetIsOwn at 5 of 14, v4584 found the `__` fixture rule at 2 of
    // 4 walkers, and v4587 -- this round -- found recordDrift comparing a COUNT under a check named "knowledge
    // index" while the index had been content-stale for three rounds. Each time: a rule applied where it was
    // written and not where it was claimed.
    //
    // DERIVED: redCensus.standingReds() reads the sweep record's `codes` table. 29 against 2, and each one is RUN
    // -- 25.1 s at eight-wide, measured, and no gate in the set writes to the tree (git status compared before
    // and after). The membership can only be read from a record; the VERDICT is always a live run.
    const pop = standingReds();
    const drivenAll = await driveReds(pop.reds);
    const live = drivenAll.filter((r) => r.code !== 0);
    const recovered = drivenAll.filter((r) => r.code === 0);

    say("population, derived from the sweep record", `${pop.reds.length} gate(s) recorded exit 1, captured ${pop.captured}`);
    say("...and the 124s are NOT in it", `${pop.capped} gate(s) carry the SIGKILL cap -- a kill is not a verdict`);
    say("driven live", `${live.length} still red, ${recovered.length} green now`);

    // REPORTED, NOT ASSERTED, and the frozen-table rule is why: a gate recorded red that is now green is the
    // record being behind, and the record is refreshed by the same sweep that runs everything. Asserting a
    // literal here would be a tripwire on a cycle whose whole point is that reds get fixed. v4587 fixed two of
    // these itself -- see below -- so the number MOVED DURING THE ROUND THAT MEASURED IT.
    if (recovered.length) say("the record is behind on", recovered.map((r) => r.rel.split("/").pop()).join(", "));

    ok("*** the population is READ FROM THE RECORD, not typed into this file ***",
        pop.reds.length >= 10 && drivenAll.length === pop.reds.length &&
        // driven with a record that says something else, so a hardcoded list could not satisfy this row
        (await (async () => {
            const tmp = path.join(ENG, "tools", "ship", "__redpop-fixture.json");
            fs.writeFileSync(tmp, JSON.stringify({ captured: "fixture",
                codes: { "a-selfcheck.mjs": 1, "b-selfcheck.mjs": 0, "c-selfcheck.mjs": 124, "__d-selfcheck.mjs": 1 } }));
            const f = standingReds({ codesPath: tmp });
            fs.unlinkSync(tmp);
            // one red, the zero and the 124 and the __ fixture all excluded -- the three exclusions, driven
            return f.reds.length === 1 && f.reds[0] === "a-selfcheck.mjs" && f.capped === 1;
        })()),
        `${pop.reds.length} gates from sweep-timings.json against the TWO this section listed at v4585. The ` +
        "derivation is driven against a fixture record: exit 0, the SIGKILL 124 and a __ fixture are each " +
        "excluded, so replacing standingReds() with a literal list fails here rather than passing quietly.");

    // ---- the classifier, on a population that did not choose it -------------------------------------------
    const rows = live.map((r) => ({ ...r, ...classify(r.failLines) }));
    const named = rows.filter((r) => r.command || r.count);

    // *** AND THE FIRST THING THE REAL POPULATION SAID IS THAT THE CLASSIFIER IS A DIALECT. ***
    //
    // v4585 already widened COUNT once, from definitionGates' vocabulary to "a size or an explicit debt marker",
    // after gateSelection's repaired message was classified as naming nothing. On 23 live reds it classifies 22
    // as naming NEITHER -- and several of those name a size in plain English: "74 declared, 18 missing",
    // "204 silent against 243 placed", "91 sites against a baseline of 88". Widening the regex until they pass
    // would be fitting the instrument to the answer, so the count is REPORTED and the rule that is ASSERTED is
    // the one below, which does not depend on dialect at all.
    say("classified by the v4585 vocabulary", `${named.length} of ${rows.length} name a command or a count`);

    // ---- THE ROW THAT COST TWO COMMANDS TO MAKE TRUE ------------------------------------------------------
    //
    // A red naming a COMMAND is a pending human step and should never survive a round -- that is this arc's
    // founding lesson, learned from staleness-selfcheck surviving five. Asserted over TWO gates it was free.
    // Asserted over the derived population it was FALSE when this round started:
    //
    //     tools/ship/instruments-selfcheck.mjs   "node tools/ship/buildKnowledgeIndex.mjs"   standing 3 rounds
    //     tools/ship/orrerySeed-selfcheck.mjs    "node tools/ship/orreryBake.mjs --write"     one body drifted
    //
    // Both were run. Both went green. THE INDEX ONE WAS THIS GATE'S OWN INDEX ENTRY -- v4585 shipped this file
    // with a placeholder RUNTIME line, measured the real number the same round, and the index kept the
    // placeholder while recordDrift printed "index agrees" over it for three rounds.
    ok("*** no standing red names a COMMAND: a pending human step must not survive a round ***",
        rows.every((r) => !r.command),
        rows.every((r) => !r.command)
            ? `${rows.length} live reds, none naming a command. Two did when this round opened and both were ` +
              "closed by running what their own text said."
            : "STILL PENDING: " + rows.filter((r) => r.command).map((r) => r.rel + " -> " + r.command).join("; ") +
              " -- run it, then re-run this gate.");

    // ---- THE EVIDENCE RULE, WHICH IS WHAT THE DIALECT PROBLEM LEFT BEHIND ---------------------------------
    //
    // *** A FAIL LINE WHOSE DETAIL CARRIES NO EVIDENCE READS AS A PASS, AND 14 OF THEM DO. ***
    //
    // Found by reading the derived population's actual output. The shape is always the same: the label is a
    // POSITIVE assertion and the detail was written for the passing case, so the printed failure asserts the
    // thing that is false. Three from today, verbatim:
    //
    //   FAIL  !! ...and is NOT STALE   rebuilt and byte-identical: 1643 gates, 262 claims
    //   FAIL  *** every covers list belongs to an addSource call -- none has drifted onto a constructor ***
    //   FAIL  !! it is the only homography in the tree
    //
    // The first is instruments-selfcheck, red for three rounds, and it is the reason this round exists: its
    // detail was computed from `fresh` alone, so it COULD NOT describe a disagreement even in principle. Fixed
    // this round by making the detail a ternary on the row's own condition -- which is the general repair, since
    // A SINGLE DETAIL STRING CANNOT BE RIGHT FOR BOTH OUTCOMES.
    //
    // The rule asked here is dialect-free: a failure's detail must carry a COMMAND, a NUMBER, or a NAMED FILE.
    // Not "is it well worded" -- whether there is anything in it to act on.
    // `\b\d+` and NOT `\b\d+\b`: the trailing boundary rejects a number glued to its unit, so "(Keith measured
    // 267ms)" classified as carrying no size. A SABOTAGE FOUND THAT -- stripping pageReflow's hit list left the
    // fallback sentence, which names a real measurement, and the first version would have called it evidence-free.
    // The LEADING boundary stays, because it is what keeps "v3256" from reading as a quantity: a version
    // reference is a citation, not a size somebody can act on. Measured both ways over the live population: 14
    // either way today, so the seed below is not sensitive to the repair -- but the next such line would be.
    const EVIDENCE = { command: COMMAND, size: /\b\d+/, subject: /[\w-]+\.(?:html|mjs|js|json|sh|wgsl|css)\b|::/ };
    const bare = [];
    for (const r of rows) for (const raw of r.failLines) {
        const parts = raw.replace(/^ {2}FAIL\s+/, "").split(/ {3,}/);   // label   detail -- three spaces, as ok() prints
        const detail = parts.slice(1).join("   ");
        if (!Object.values(EVIDENCE).some((re) => re.test(detail))) bare.push({ rel: r.rel, label: parts[0] });
    }
    // RATCHET, seeded at what was MEASURED after this round's two repairs, and it may only fall. Not asserted
    // at zero: 14 bare lines across 11 gates is other gates' debt and which ones get repaired is Keith's call,
    // one at a time. A ratchet set to today's number fails the moment a fifteenth is written, which is the half
    // that matters -- the existing 14 are visible, sized, and named below.
    const BARE_AT_V4587 = 14;
    ok("!! *** no NEW failure line arrives with nothing in it to act on ***",
        bare.length <= BARE_AT_V4587,
        `${bare.length} FAIL line(s) carry no command, no number and no named file in the detail, against a ` +
        `frozen ${BARE_AT_V4587}. OWED: each is a detail written for the passing case, so the red asserts what ` +
        "is false. Worst offenders: " + [...new Set(bare.map((b) => b.rel.split("/").pop()))].slice(0, 6).join(", "));

    ok("...and the ratchet has not been left behind by real progress",
        bare.length >= BARE_AT_V4587 - 3,
        `${bare.length} against a frozen ${BARE_AT_V4587}. A RATCHET WITH SLACK IN IT IS A RATCHET HOLDING ` +
        "NOTHING (v3195's stale baseline, and registerResidue-selfcheck says the same of its 41), so this half " +
        "asks for the seed to be lowered once the debt is actually paid.");

    // N: emptying the population left every row above vacuously true -- the same 0-RED shape as v4585's.
    ok("...and the rows above are asked of a non-empty population, driven",
        rows.length > 0 && drivenAll.length === pop.reds.length && bare.length >= 0,
        `${rows.length} live red(s) of ${pop.reds.length} recorded. An empty population makes every "no standing ` +
        'red..." row trivially true, which is the shape of a check that passed because it looked at nothing.');

    // M: the classifier's own arms, driven on fixture text, because no live red exercises the command arm now
    // that both were closed -- which is exactly when a classifier stops being tested by its subjects.
    const cmdCase = classify(["  FAIL  the page is STALE. THE FIX IS ONE COMMAND: node tools/ship/staleness.mjs --fix"]);
    const cntCase = classify(["  FAIL  no NEW exported symbol has appeared   GREW to 55: physics/x.mjs:y"]);
    const neither = classify(["  FAIL  something is wrong and nothing says what to do about it"]);
    ok("*** the classifier is driven on all three cases, because NO live red exercises the command arm ***",
        cmdCase.command === "node tools/ship/staleness.mjs" && !cmdCase.count &&
        cntCase.count && !cntCase.command && !neither.command && !neither.count,
        `command arm: ${cmdCase.command}; count arm: ${cntCase.count}; neither: ${neither.command || neither.count}. ` +
        "At v4585 this said 'no live red happens to name a command'. It is now true BECAUSE the round closed the " +
        "two that did, which is a better reason and the same requirement.");
}

console.log(fails ? `\nredAction-selfcheck: ${fails} FAILED` : "\nredAction-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
