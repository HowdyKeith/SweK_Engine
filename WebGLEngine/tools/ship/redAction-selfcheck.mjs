// WebGLEngine/tools/ship/redAction-selfcheck.mjs -- v4585
//
// Run: node tools/ship/redAction-selfcheck.mjs
// RUNTIME 6709 ms ALONE (median of 6709/6730/6696) and about 6.9 s at eight-wide. Well over the
// 3000 ms sweep budget: it RUNS three gates as children -- staleness, budgetExile and definitionGates -- because
// classifying a red from its own printed failure means making it print one. quickSweep confirms it serially per
// v4408 and files an ALONE reading; it belongs in the full suite.
//
// SABOTAGE: 14 mutations, 14 red, no 0-RED, nothing crashed -- after passes that produced eight 0-REDs and a crash,
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
console.log("\n4. EVERY REMAINING RED NAMES WHAT CLOSES IT -- A COMMAND OR A COUNT");
{
    // The gates this arc has been calling standing reds. Each is RUN, and its own output is classified.
    // gateSelection joined this list at v4585 BECAUSE IT FAILED THE RULE: its failure read "first 123 selected are
    // all reachable", which describes the intent and reads like a pass, naming neither a command nor a count. It is
    // reproducible and it is growth -- `reachable` now exceeds a 180 s budget's selection, so the truncation is the
    // normal case. Its message says "22 of the first 123 selected are NOT reachable" and states what is owed now,
    // which is the minimum for a red somebody can act on.
    // *** AND ONE OF THE TWO IS CLASSIFIED FROM ITS SOURCE, BECAUSE RUNNING IT COSTS 63 SECONDS. ***
    //
    // Adding gateSelection to the driven list took this gate from 6.8 s to over seventy, and the sabotage sweep from
    // four minutes to twenty -- for one classification. tools/ship/redCensus.mjs states the rule this tree already
    // settled on: "Re-verifying a registered red means RUNNING it, which is redCensus-selfcheck's two minutes and
    // does not belong in a pre-flight." So the cheap one is DRIVEN and the expensive one is read: its message text
    // lives in its source, and what is being classified is the MESSAGE, which a source read answers exactly.
    const DRIVEN = ["tools/ship/definitionGates-selfcheck.mjs"];
    // *** AND THE READ ARM MUST TARGET THE FAILING ROW, NOT THE WHOLE FILE. ***
    // Its first version joined EVERY ok(...) block in the source and classified that, so any count-ish phrasing
    // anywhere in a 30-row gate satisfied the classification. Deleting the OWED clause from the row that actually
    // fails moved nothing -- a 0-RED -- because a sibling row still carried a number. The driven arm classifies the
    // FAIL lines a run produces; the read arm now reads the one row known to fail, named with it.
    const READ_ONLY = [{ rel: "tools/ship/gateSelection-selfcheck.mjs",
                         row: "reachable gates are scheduled FIRST" }];
    const STANDING = [...DRIVEN, ...READ_ONLY.map((x) => x.rel)];
    const rows = [
        ...DRIVEN.map((g) => { const r = runGate(g, 180000); return { ...r, ...classify(r.failLines), how: "run" }; }),
        ...READ_ONLY.map(({ rel, row }) => {
            const src = fs.readFileSync(path.join(ENG, rel), "utf8");
            const at = src.indexOf(row);
            // From the row's label to the end of its ok(...) call -- the text THAT row prints and nothing else.
            const block = at < 0 ? "" : src.slice(at, src.indexOf(");", at) + 2);
            return { rel, code: 1, failLines: [block], ...classify([block]), how: "read", found: at >= 0 };
        }),
    ];
    for (const r of rows)
        say(r.rel.split("/").pop().padEnd(34), (r.code === 0 ? "green" : `red; names a command: ${r.command || "no"}; names a count: ${r.count}`) + `   [${r.how}]`);

    // M: breaking the COMMAND pattern moved nothing, because no standing red happens to name a command -- so the
    // classifier was never exercised on the case it exists to separate. Driven on fixture text instead.
    const cmdCase = classify(["  FAIL  the page is STALE. THE FIX IS ONE COMMAND: node tools/ship/staleness.mjs --fix"]);
    const cntCase = classify(["  FAIL  no NEW exported symbol has appeared   GREW to 55: physics/x.mjs:y"]);
    const neither = classify(["  FAIL  something is wrong and nothing says what to do about it"]);
    ok("*** the classifier is driven on all three cases, because no live red exercises the command arm ***",
        cmdCase.command === "node tools/ship/staleness.mjs" && !cmdCase.count &&
        cntCase.count && !cntCase.command && !neither.command && !neither.count,
        `command arm: ${cmdCase.command}; count arm: ${cntCase.count}; neither: ` +
        `${neither.command || neither.count}. A classifier tested only on today's reds is tested on one arm.`);

    // N: emptying the standing list left every row below vacuously true.
    ok("...and the standing list is not empty, and both arms are populated",
        STANDING.length > 0 && rows.length === STANDING.length && DRIVEN.length > 0 && READ_ONLY.length > 0 &&
        rows.filter((r) => r.how === "read").every((r) => r.found),
        `${STANDING.length} gate(s) driven. An empty list makes every 'every red...' row below trivially true, ` +
        "which is the shape of a check that passed because it looked at nothing.");

    ok("*** every red still standing names a COUNT, so it is debt rather than a pending human step ***",
        rows.every((r) => r.code === 0 || r.count),
        "definitionGates' three rows are frozen ratchets that may only move DOWN, and the redness is 55 exported " +
        "symbols under physics/, 319 tree-wide and 617 of any shape, each owed 'a check that calls it and grades " +
        "the answer'. I CALLED THESE 'THREE DELIBERATELY IMMOVABLE RATCHETS' IN SIX SUMMARIES: the freezing is " +
        "deliberate, the redness is unpaid, and describing debt as design is how it stops being paid.");

    ok("...and none of them names a command, which is what separates debt from a step somebody skipped",
        rows.every((r) => r.code === 0 || !r.command),
        "a red naming a command should never survive a round -- staleness's survived five. A red naming a count " +
        "may survive many, and saying which is which is the only thing that makes a standing red readable.");

    ok("...and a red naming NEITHER would be unactionable, which is the class this gate exists to forbid",
        rows.every((r) => r.code === 0 || r.command || r.count),
        "the classifier reads the gate's own printed failure, not a register somebody maintains: " +
        "tools/ship/redCensus.mjs records 29 registered reds with the line that failed and NOT what closes it, " +
        "which is the field whose absence let six rounds go by.");
}

console.log(fails ? `\nredAction-selfcheck: ${fails} FAILED` : "\nredAction-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
