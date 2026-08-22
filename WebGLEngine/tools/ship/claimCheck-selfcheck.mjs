// tools/ship/claimCheck-selfcheck.mjs -- v3742
//
// The gate for tools/ship/claimCheck.mjs -- the notes-vs-tree checker.
//
// *** WHY IT EXISTS: across this session the notes were found stale FIVE times and a HUMAN OR A GREP caught it
// every time, never a tool. "pageReach is red at 104 vs 103" survived SIXTY-EIGHT VERSIONS after raycast.html
// was filed. A NOTE THAT SURVIVES ITS OWN SUBJECT SENDS SOMEBODY TO REDO CLOSED WORK. ***
//
// *** AND THE THING THIS GATE MOSTLY GUARDS IS THE DISTINCTION THAT ALMOST SHIPPED WRONG: A DATED RECORD IS
// NOT A CLAIM ABOUT NOW. The first run pointed the checker at twelve changelog entries and called ten of them
// contradictions -- every one TRUE WHEN WRITTEN. BACKLOG.md is append-only history. Present-tense checking is
// the NEWEST ENTRY ONLY; older entries are DRIFT, which is what a changelog is for. ***

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLAIM_SHAPES, extractClaims, unreadableLines, deriveAll, checkText, backlogHead, isPresentTense } from "./claimCheck.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { gateFiles } from "./staleness.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "claimCheck.mjs"), "utf8");

// ---- 1. IT CATCHES A WRONG NUMBER --------------------------------------------------------------------------
console.log("1. A FALSE CLAIM IS CONTRADICTED, AND A TRUE ONE IS NOT");
{
    const live = gateFiles().length;
    const truthy = "The build has " + live + " gates.";
    const lie = "The build has " + (live + 7) + " gates.";
    const a = await checkText(truthy), b = await checkText(lie);
    ok("!! a claim matching the tree reads AGREES",
        a.agrees.length === 1 && a.contradicted.length === 0,
        "stated " + live + ", derived " + live + " through gateFiles() -- THE TREE'S OWN SHARED FUNCTION, not a " +
        "second spelling of 'count the -selfcheck files' (v3719: a regex over a registry is that registry again)");
    ok("!! *** AND A CLAIM SEVEN OFF IS CONTRADICTED, WITH THE TREE'S NUMBER NAMED ***",
        b.contradicted.length === 1 && b.contradicted[0].actual === live && b.agrees.length === 0,
        "a checker that never fires is the ratchet nobody has seen fail. THE NUMBER IS REPORTED so the reader " +
        "can tell WHICH of the two is wrong -- usually the note, sometimes the tree, and NAMING WHICH IS A " +
        "PERSON'S JOB");
}

// ---- 2. THE THIRD STATE ------------------------------------------------------------------------------------
console.log("\n2. UNCHECKABLE IS NOT A PASS");
{
    const opaque = "The rotation ran for 4 hours and the residue was 3.65e-4 at every step.";
    const r = await checkText(opaque);
    ok("!! *** A LINE FULL OF NUMBERS THIS READER CANNOT PARSE IS COUNTED, NOT DROPPED ***",
        r.agrees.length === 0 && r.contradicted.length === 0 && r.uncheckableLines.length === 1,
        "if unreadable text were silently ignored, A FILE OF NONSENSE WOULD GET A CLEAN BILL -- v3698's " +
        "PROPOSED / UNGRADABLE / UNMEASURED, where answering 'nothing to do' because a census failed to LOAD " +
        "is the most expensive lie because it LOOKS LIKE COMPLETION");
    ok("a line with no digits at all is not counted as unread -- it was never a numeric claim",
        unreadableLines("A sentence about physics with no numbers in it.").length === 0);
}

// ---- 3. A FAILED DERIVATION IS ITS OWN BUCKET -------------------------------------------------------------
console.log("\n3. A DERIVATION THAT THROWS IS NEITHER AGREEMENT NOR CONTRADICTION");
{
    const truth = await deriveAll();
    const broken = Object.entries(truth).filter(([, t]) => t.error !== null).map(([k]) => k);
    ok("every declared shape derives cleanly in this tree today",
        broken.length === 0,
        CLAIM_SHAPES.length + " shapes: " + CLAIM_SHAPES.map((s) => s.id).join(", ") +
        (broken.length ? "   BROKEN: " + broken.join(", ") : ""));
    ok("!! ...and the code routes a throw to `unresolved` rather than folding it into either verdict",
        /unresolved\.push/.test(codeOnly(SRC)) && /t\.error !== null/.test(codeOnly(SRC)),
        "a derivation that failed has NOT agreed with anything. Calling it a pass would be the worst " +
        "direction: the checker would go quiet exactly when it stopped working");
}

// ---- 4. HISTORY IS NOT CONTRADICTION ----------------------------------------------------------------------
console.log("\n4. A DATED RECORD IS NOT A CLAIM ABOUT NOW");
ok("!! only the newest changelog entry is present-tense, and the tool says so structurally",
    isPresentTense(0) === true && isPresentTense(1) === false && /--history/.test(SRC),
    "*** THE FIRST RUN READ TWELVE ENTRIES AND CALLED TEN OF THEM CONTRADICTIONS -- 999 gates, DEVICE_NAMES 84, " +
    "150 instrument rows -- AND EVERY ONE WAS TRUE WHEN WRITTEN. BACKLOG.md is append-only history; an entry " +
    "describes the build it shipped. The CLI no longer takes an entry count for the present-tense check, " +
    "because passing one is how that happened; --history is a separate, differently-labelled DRIFT report ***");

// *** A QUOTATION IS NOT A CLAIM -- AND THE TOOL FOUND THIS OUT ON ITS OWN CHANGELOG ENTRY, which quotes
// three past numbers as examples of staleness and had all three called contradictions. THE TEMPTING FIX WAS
// TO DELETE THE NUMERALS FROM THE RECORD so the checker would go green: EDITING THE RECORD TO PLEASE THE
// CHECKER, which is reward hacking in miniature and precisely what the tennis-xgboost autoresearch run
// documented. THE RECORD INFORMS THE TOOL, NEVER THE OTHER WAY ROUND. ***
{
    const live = gateFiles().length;
    const quoted = 'The old entry said "' + (live + 11) + ' gates." back then.';
    const bare = "The build has " + (live + 11) + " gates.";
    const q = await checkText(quoted), b2 = await checkText(bare);
    ok("!! a number inside double quotes is a QUOTATION and is not asserted",
        q.contradicted.length === 0 && q.agrees.length === 0,
        "reports of what an older note said are not claims about this build");
    ok("!! ...and the SAME number unquoted is still contradicted, so the skip is narrow",
        b2.contradicted.length === 1,
        "asserted BOTH ways: a quote-skipper that swallowed everything would pass every file. NARROW ON " +
        "PURPOSE -- it notices quotation marks, it does not understand attribution, and a claim quoted without " +
        "them is still read as a claim. A KNOWN LIMIT, REPORTED");
}

const head = backlogHead(1);
ok("the newest entry parses and yields at least one checkable claim",
    !!head && extractClaims(head).length > 0,
    "if a round ever writes an entry with NO checkable number, this goes red -- and the right response is to " +
    "state a number in the entry, not to widen the reader");

// ---- 5. NO WRITE PATH -------------------------------------------------------------------------------------
console.log("\n5. IT CANNOT EDIT WHAT IT GRADES");
ok("!! *** claimCheck HAS NO WRITE PATH -- asserted by mechanism, not by promise ***",
    !/\bwriteFileSync|appendFileSync|createWriteStream|\.rm\(|unlinkSync/.test(codeOnly(SRC)),
    "the curriculum proposer's refusal (v3698) applies with full force here: A LOOP THAT BOTH WRITES THE RECORD " +
    "AND GRADES IT CAN MARK ITS OWN WORK PASSED. This module reads and reports. WHEN SOMEBODY WANTS IT TO FIX " +
    "A STALE NUMBER AUTOMATICALLY, THAT IS A DIFFERENT TOOL AND IT NEEDS ITS OWN ARGUMENT -- do not weaken this line");

report("WHAT THIS DOES NOT CLAIM, AND IT IS THE LIMIT THAT MATTERS MOST",
    "That the notes are correct. THE NOTES MOST AT RISK ARE NOT IN THE TREE AT ALL -- the handoff and open-list " +
    "live outside it, and every staleness this session actually cost a round was in those. What this reaches is " +
    "BACKLOG.md, the changelog written each round, which is the tree's own copy of the same habit. IT CHECKS " +
    "THREE NUMERIC SHAPES AND NOTHING ELSE: no prose, no reasoning, no 'is this claim sound'. A wide reader " +
    "would be pretending at comprehension, so the remainder is reported as UNCHECKABLE and stays a person's job.");

console.log("\nclaimCheck-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
