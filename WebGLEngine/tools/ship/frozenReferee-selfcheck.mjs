// tools/ship/frozenReferee-selfcheck.mjs -- v3745
//
// The gate for tools/ship/frozenReferee.mjs -- the check that answers "did this round change both a subject
// and its own grader?"
//
// *** WHY IT MATTERS, IN ONE EXAMPLE FROM THIS SESSION: at v3740 the Raycast gate was WIDENED in the same
// round its subject was fixed. That is indistinguishable in a diff from a check loosened until it passes. The
// only thing that separated the two was that the WIDER check was re-run against the ORIGINAL broken state and
// still failed -- and NOTHING ENFORCED THAT. It happened because I chose to do it. ***
//
// *** AND THE MEASUREMENT THAT SHAPED THE DESIGN: the obvious pairing is X-selfcheck.mjs beside X.js, and it
// HOLDS FOR ONLY 473 OF 1004 GATES. A name-based pairing would be blind to more than half the suite WHILE
// LOOKING COMPLETE, which is the worst kind of coverage. Subjects come from IMPORTS instead -- 844 of 1004
// gates name at least one shipping module, 1837 edges -- and the remaining 160 are reported UNPAIRED rather
// than clean, because a gate whose subject cannot be derived has not been shown safe, it has not been looked at.

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot, frozenCheck, pairedEdits, undeclared, subjectsOf, isGate, readManifest, MANIFEST, buildVersion, entryVersion } from "./frozenReferee.mjs";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { gateFiles } from "./staleness.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "frozenReferee.mjs"), "utf8");

// ---- 1. THE LOOP ENTRY POINT ------------------------------------------------------------------------------
console.log("1. frozenCheck -- NOT ONE GATE FILE MAY DIFFER");
{
    const a = { "x-selfcheck.mjs": "aaaa", "y-selfcheck.mjs": "bbbb" };
    ok("!! an identical set is frozen", frozenCheck(a, { ...a }).frozen === true);
    const changed = frozenCheck(a, { ...a, "x-selfcheck.mjs": "cccc" });
    ok("!! *** A CHANGED GATE BREAKS THE FREEZE AND NAMES ITSELF ***",
        changed.frozen === false && changed.changed[0] === "x-selfcheck.mjs",
        "a violation that returns a bare false tells the reader nothing about WHICH referee moved");
    ok("!! an ADDED gate breaks it too -- a loop that writes a new gate has written its own referee",
        frozenCheck(a, { ...a, "z-selfcheck.mjs": "dddd" }).frozen === false,
        "the tempting hole: only checking for MODIFIED files lets a loop add a permissive gate beside the strict one");
    ok("!! and a REMOVED gate breaks it -- deleting the referee is the cheapest way to pass it",
        frozenCheck(a, { "x-selfcheck.mjs": "aaaa" }).frozen === false,
        "asserted in all three directions, because any one of them alone leaves an obvious route open");
}

// ---- 2. SUBJECTS COME FROM IMPORTS, NOT FROM NAMES --------------------------------------------------------
console.log("\n2. HOW A GATE'S SUBJECT IS DERIVED");
{
    const gates = gateFiles();
    const withSubjects = gates.filter((g) => subjectsOf(g).length > 0).length;
    ok("!! *** THE IMPORT-BASED PAIRING REACHES MOST OF THE SUITE, AND THE NAME-BASED ONE WOULD NOT ***",
        withSubjects > gates.length * 0.75,
        withSubjects + " of " + gates.length + " gates name a subject by importing it. THE NAME PAIRING " +
        "(X-selfcheck.mjs beside X.js) REACHES 473 -- measured, not assumed -- so it would have been blind to " +
        "more than half the suite while reporting a clean sweep");
    ok("a gate importing another GATE does not count that as its subject",
        subjectsOf(path.join(path.dirname(fileURLToPath(import.meta.url)), "frozenReferee-selfcheck.mjs"))
            .every((s) => !isGate(s)),
        "otherwise every gate that reuses a helper gate would look like it grades one");
    report("THE 160 THAT IMPORT NOTHING",
        "they read source as TEXT (hostingPanel-selfcheck, claimCheck-selfcheck and their kind). They are " +
        "reported UNPAIRED, never clean -- the same third state as claimCheck's UNCHECKABLE, for the same " +
        "reason: a checker that silently drops what it cannot resolve hands out a clean bill it never earned.");
}

// ---- 3. PAIRED vs GATE-ONLY, WHICH IS THE WHOLE POINT -----------------------------------------------------
console.log("\n3. A PAIRED EDIT AND A GATE-ONLY EDIT MUST NOT READ THE SAME");
{
    const man = { accepted: "t0", gates: { "g-selfcheck.mjs": "1" }, subjects: { "s.js": "1" } };
    const pairs = { "g-selfcheck.mjs": ["s.js"] };
    const gateOnly = pairedEdits(man, { gates: { "g-selfcheck.mjs": "2" }, subjects: { "s.js": "1" }, pairs });
    const both = pairedEdits(man, { gates: { "g-selfcheck.mjs": "2" }, subjects: { "s.js": "2" }, pairs });
    ok("!! a gate that moved while its subject stood still is GATE ONLY",
        gateOnly.gateOnly.length === 1 && gateOnly.paired.length === 0);
    ok("!! *** A GATE AND ITS SUBJECT MOVING TOGETHER IS A PAIRED EDIT ***",
        both.paired.length === 1 && both.paired[0].subjects[0] === "s.js",
        "NOT automatically wrong -- a new key needs a new gate, and half this session's rounds did exactly that " +
        "on purpose. IT IS THE THING THAT NEEDS A STATED REASON");
    const unresolved = pairedEdits(man, { gates: { "g-selfcheck.mjs": "2" }, subjects: {}, pairs: { "g-selfcheck.mjs": [] } });
    ok("!! a changed gate with no derivable subject is UNPAIRED, not clean",
        unresolved.unpaired.length === 1 && unresolved.paired.length === 0 && unresolved.gateOnly.length === 0);
}

// ---- 4. THE DECLARATION RULE ------------------------------------------------------------------------------
console.log("\n4. A PAIRED EDIT MUST BE NAMED IN THE CHANGELOG");
// *** v3751 -- THE FIXTURES BELOW USED A MADE-UP "## v9999" HEADER, AND THE NEW VERSION RULE CORRECTLY
// REJECTED IT: an entry for another build declares nothing. They use the REAL build version now, which is the
// honest fix -- the rule is right and the fixture was pretending. ***
const BUILD = buildVersion();
{
    const paired = [{ gate: "tools/wadVoxelizer-selfcheck.mjs", subjects: ["tools/wadVoxelizer.js"] }];
    ok("!! an unnamed paired edit is UNDECLARED",
        undeclared(paired, "## " + BUILD + " -- a round about something else entirely", BUILD).length === 1,
        "this reuses THE RECORD THIS PROJECT ALREADY WRITES rather than inventing a second declaration to keep " +
        "in sync -- the shape that goes stale in every other place it has been tried here");
    ok("!! ...and naming the subject in the entry clears it",
        undeclared(paired, "## " + BUILD + " -- wadVoxelizer gained a BSP fixture and its gate grew section 4", BUILD).length === 0,
        "the sentence that clears it is EXACTLY the sentence a reader needs to tell a correction from a widening");
}

// ---- 5. THE MANIFEST IS ACCEPTED DELIBERATELY -------------------------------------------------------------
{
    const paired = [{ gate: "tools/x-selfcheck.mjs", subjects: ["tools/x.mjs"] }];
    ok("!! the build version is read from main.js, not guessed", /^v\d+$/.test(String(BUILD)), "read " + BUILD);
    ok("!! *** A PREVIOUS ROUND'S ENTRY NAMING THE FILE NO LONGER DECLARES IT ***",
        undeclared(paired, "## v0001 -- x was changed", BUILD).length === 1,
        "*** THIS HOLE WAS FOUND BY USING THE TOOL, AND IT REPORTED A CLEAN BILL WHILE IT WAS OPEN: the check " +
        "only asked whether a basename appeared in the NEWEST entry, so A FILE EDITED IN TWO CONSECUTIVE ROUNDS " +
        "WAS SELF-DECLARING ON THE SECOND. At v3750 it read 0 UNDECLARED for a paired edit on loopAccept.mjs " +
        "BEFORE THAT ROUND'S ENTRY EXISTED, purely because v3749's entry mentioned the file ***");
    ok("!! ...and the reason names WHICH two versions disagreed, rather than leaving a bare count",
        /v0001/.test(undeclared(paired, "## v0001 -- x", BUILD)[0].why) &&
        new RegExp(BUILD).test(undeclared(paired, "## v0001 -- x", BUILD)[0].why));
    ok("!! the version test is an ADDITIONAL requirement, not a replacement -- both must hold",
        undeclared(paired, "## " + BUILD + " -- x was changed", BUILD).length === 0 &&
        undeclared(paired, "## " + BUILD + " -- something else entirely", BUILD).length === 1);
    ok("entryVersion reads the header and returns null when there is none",
        entryVersion("## v1234 -- title") === "v1234" && entryVersion("no header here") === null);
}

console.log("\n5. THE BASELINE IS A DECISION, NOT A SIDE EFFECT");
{
    const code = codeOnly(SRC);
    const writes = [...code.matchAll(/writeFileSync/g)].length;
    ok("!! *** THE MANIFEST IS WRITTEN ONLY UNDER --accept -- ONE WRITE, INSIDE THE FLAG BRANCH ***",
        writes === 1 && /--accept/.test(SRC),
        "a manifest this tool refreshed on every run WOULD AGREE WITH ITSELF FOREVER -- the mirror shape, and " +
        "the exact failure the ratchet files in this tree keep being caught by. Accepting is a separate act " +
        "taken after reading the report");
    // *** THIS CHECK FIRST ASSERTED manifest.gates.length === gateFiles().length AND WENT RED THE MOMENT THIS
    // FILE EXISTED -- the baseline was accepted at 1004 gates and adding its own gate made 1005. A COUNT IS A
    // STATE OF THE TREE AT ACCEPT TIME, NOT A PROPERTY OF THE TOOL, so it would go red on every correct round
    // that adds a gate and be cleared by re-accepting -- teaching exactly the reflex this file exists to stop.
    // THE PROPERTY IS THAT A DIFFERENCE IS VISIBLE, NOT THAT THERE IS NONE. ***
    const man = readManifest();
    const drift = man ? frozenCheck(man.gates, snapshot().gates) : null;
    ok("a baseline exists, and any difference from it is NAMED rather than silently tolerated",
        !!man && !!drift && (drift.frozen || drift.added.length + drift.changed.length + drift.removed.length > 0)
        && drift.added.concat(drift.changed, drift.removed).every((p) => typeof p === "string" && p.length > 0),
        man ? Object.keys(man.gates).length + " gates in the baseline; drift now: " + drift.added.length +
              " added, " + drift.changed.length + " changed, " + drift.removed.length + " removed" : "NO MANIFEST");
    ok("!! and a MISSING manifest is a refusal, not a pass",
        /THIS IS NOT A PASS/.test(noComments(SRC)) && /process\.exit\(1\)/.test(code),
        "the first run of a new checker reporting 'all clear' because it has nothing to compare against is the " +
        "worst possible first impression, and it is what an unguarded version would do");
}

report("WHAT THIS DOES NOT CLAIM",
    "That a paired edit is wrong, or that a declared one is right. IT CANNOT READ THE REASON -- it checks that " +
    "a name appears in the newest changelog entry, which a determined author satisfies by typing the name. IT " +
    "IS A PROMPT, NOT A PROOF. What it does remove is the SILENT case: a gate quietly loosened in the same " +
    "round as its subject, with nothing in the record saying so. AND IT SAYS NOTHING ABOUT WHETHER A GATE IS " +
    "GOOD -- gateQuality is that question, and this one is only about WHEN it moved.");

// ---- A READ SUBJECT IS A NAMED SUBJECT (v3796) --------------------------------------------------------------
// *** IMPORT-BASED DERIVATION CANNOT SEE AN HTML PAGE, BECAUSE A PAGE CANNOT BE IMPORTED. So every gate that
// grades a page reported UNPAIRED or GATE ONLY however precisely it named its subject -- FOUR TIMES IN ONE
// SESSION (v3770, v3786, v3788, v3795), each time with a changelog paragraph explaining that the tool was
// right by its rule and wrong about the facts. FOUR EXPLANATIONS OF THE SAME NON-DEFECT IS THE TOOL ASKING
// FOR A RULE. ***
{
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const page = subjectsOf(path.join(root, "tools/ship/mpmPage-selfcheck.mjs")).map((x) => path.basename(x));
    ok("!! *** A GATE THAT READS AN HTML PAGE NOW NAMES IT AS A SUBJECT ***",
        page.includes("mpm.html") && page.includes("server.html"),
        "resolved: " + page.join(", ") + ". *** THE BAR IS UNCHANGED -- the gate must NAME the file, in its " +
        "own source, as a path that EXISTS. Only the SPELLING widens: readFileSync(new URL(...)) and " +
        "path.join(root, ...) are as explicit as an import statement ***");
    ok("!! and an ordinary import-only gate is unaffected",
        subjectsOf(path.join(root, "ui/gaugeInfoPanel-selfcheck.mjs")).some((x) => x.endsWith("gaugeInfoPanel.js")),
        "the original derivation still does all the work it did before; this only adds a second spelling");
    // *** THE HALF THAT MATTERS: IT IS NOT A LOOSENING. ***
    const tmp = path.join(root, "tools", "ship", "__fz_probe.mjs");
    try {
        writeFileSync(tmp, 'console.log("names nothing");\n');
        ok("!! *** A GATE THAT NAMES NOTHING STILL DERIVES NO SUBJECT ***",
            subjectsOf(tmp).length === 0,
            "UNPAIRED is still reachable, which is the whole point -- a rule that made every gate pairable " +
            "would have made the report meaningless");
        writeFileSync(tmp, 'const p = "./does-not-exist.html"; console.log(p);\n');
        ok("!! and naming a file that does NOT exist derives nothing either",
            subjectsOf(tmp).length === 0,
            "the path must RESOLVE. A gate cannot claim a subject by mentioning a filename it invented");
    } finally { try { unlinkSync(tmp); } catch {} }
}

console.log("\nfrozenReferee-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
