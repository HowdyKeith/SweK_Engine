// tools/ship/decisionIndex-selfcheck.mjs
//
// Run: node tools/ship/decisionIndex-selfcheck.mjs   (~0.2s)
//
// v3172 -- THE TREE ALREADY DECIDED IT, AND THE DECISION WAS IN A COMMENT NOBODY GREPS.
//
// *** SIX TIMES IN ONE SESSION I PROPOSED A ROUND THAT WAS ALREADY DONE. *** Android discovery, the Termux
// launchers, the Android dependency analysis, Terasology's record-and-replay, its one-owner event rule, and
// then -- most pointedly -- "wire binaryFaces into the mesher", which mesh/meshChoice-selfcheck.mjs opens by
// answering: "I SET OUT TO CONNECT binaryFaces TO greedyMesh3d AND MEASURED MY WAY OUT OF IT", with a 144:1
// ratio proving that even an INFINITELY FAST binaryFaces could not move the total.
//
// THE CORRECTIVE IS NOT "CHECK HARDER". Every one of those answers was written down, gated and shipped. *** A
// DECISION NOT TO DO SOMETHING LOOKS EXACTLY LIKE AN ABSENCE FROM OUTSIDE THE FILE THAT RECORDS IT *** -- and
// this tree has ~579 gates, most carrying a paragraph on what was tried and why it stopped. A body of
// decisions with no index.
//
// *** THIS IS A REPORT, NOT A RULE, AND THAT IS DELIBERATE. *** It cannot tell a decision from a description,
// and pretending otherwise would make it a filter that HIDES work -- the opposite of the point. It surfaces
// candidates and names the file; a human reads the paragraph. v3103's law: a report is where a real judgement
// goes when source alone cannot decide.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "decisionIndex.mjs")).href);
const rows = D.decisionIndex(ENG);

// ---- 1. IT FINDS THE ONE THAT CAUGHT ME --------------------------------------------------------------------
{
    ok("!! the index finds the gate that answers a question I asked anyway",
        rows.some((r) => /meshChoice-selfcheck/.test(r.file)),
        "meshChoice-selfcheck has recorded since v2587 that connecting binaryFaces to greedyMesh3d CANNOT help " +
        "-- a 144:1 ratio, so even an infinitely fast binaryFaces moves nothing. I PROPOSED THAT EXACT ROUND " +
        "five versions later. THE ANSWER WAS SHIPPED AND UNFINDABLE");

    ok("!! and it finds more than one, so it is an index rather than an anecdote",
        rows.length >= 8,
        rows.length + " gates record a closed question: " + rows.slice(0, 4).map((r) => r.file.split("/").pop()).join(", ") +
        " and others. Each is a paragraph somebody wrote when they STOPPED, which is exactly the knowledge that " +
        "does not survive being in a comment");

    ok("...and every hit names the FILE and quotes the sentence",
        rows.every((r) => r.file && r.says && r.says.length > 10),
        "'somebody decided something somewhere' is not an index. The file plus the sentence is enough to go read " +
        "the paragraph, which is all this can honestly offer");
}

// ---- 2. THE MARKS ARE DECIDABLE, AND THE LOOSE ONE WAS CAUGHT ------------------------------------------------------
{
    const src = fs.readFileSync(path.join(HERE, "decisionIndex.mjs"), "utf8");
    ok("!! *** /circular/ ALONE IS NOT A MARK, and the reason is measured ***",
        !/^\s*\/circular\/i,\s*$/m.test(src) && /would be circular/.test(src) && /is circular\\b/.test(src),
        "MY FIRST VERSION MATCHED IT AND PULLED IN FOUR PHYSICS GATES on 'circular orbit' -- blackHole, mission, " +
        "neutronStar, diffraction. 22 hits became 12. A REPORT THAT IS MOSTLY NOISE TRAINS PEOPLE TO IGNORE IT, " +
        "which is worse than not having one");

    ok("!! no physics gate is in the index",
        !rows.some((r) => /blackHole|neutronStar|diffraction|mission-selfcheck/.test(r.file)),
        "those four describe orbits, not decisions. The mark has to be DECIDABLE rather than suggestive -- " +
        "v3141's exemption rule, applied to a scan instead of an exemption");

    // v3214 -- *** TWO GATES WANTED OPPOSITE THINGS AND BOTH WERE RIGHT ABOUT THE PROPERTY. *** This asserted
    // the LITERAL `readdirSync(dir, { withFileTypes: true })`, so when decisionIndex.mjs stopped keeping its own
    // walk -- because singleSource-selfcheck had been saying for rounds that a second walker is a third counter
    // waiting to disagree -- this went red on a change that made the module strictly better. Fixing one gate's
    // complaint broke the other's.
    //
    // NEITHER CHECK CARED ABOUT readdirSync. Both cared that THE CORPUS IS DERIVED RATHER THAN TYPED, and
    // importing a derived walker satisfies that at least as well as owning one. Asserted as the property: it
    // walks by SOME means, and there is no hand-maintained list.
    ok("!! the corpus is DERIVED, not a typed list",
        (/gateFiles\(/.test(src) || /readdirSync\(/.test(src)) && !/const GATES = \[/.test(src),
        "a gate added tomorrow is indexed without anybody remembering to add it. A TYPED CORPUS WOULD BE THE " +
        "THING THIS MODULE EXISTS TO PREVENT, one level up -- and whether the walk is OWNED or IMPORTED is not " +
        "what decides that. It now imports staleness.mjs's gateFiles(), which is the tree's one definition of " +
        "which files are gates");
}

// ---- 3. IT REFUSES TO BE A RULE --------------------------------------------------------------------------------------
{
    ok("!! it is a REPORT -- nothing here fails a build on a match",
        (() => { const src = fs.readFileSync(path.join(HERE, "decisionIndex.mjs"), "utf8");
                 return !/process\.exit/.test(src) && !/throw new Error/.test(src); })(),
        "it CANNOT tell a decision from a description, and a filter built on that would HIDE work -- the exact " +
        "opposite of the point. v3103: a report is where a real judgement goes when source alone cannot decide");

    ok("...and a header with no closure mark is not indexed",
        rows.length < 60,
        rows.length + " of ~579 gates. If most matched, the marks would be measuring 'is a gate' rather than " +
        "'records a decision', and the index would be a directory listing with extra steps");
}

console.log();
console.log("  ----  THE INDEX, so the next round meets a closed question before re-opening it:");
for (const r of rows) console.log("  ----    " + r.file.split("/").pop().replace("-selfcheck.mjs", "").padEnd(22) + r.says.slice(0, 74));
console.log("  ----  NOT WIRED INTO ANYTHING. Reading this before proposing work is a HABIT, not a gate, and a");
console.log("  ----  gate that tried to enforce it would be guessing at intent. The honest version is that it");
console.log("  ----  exists and is one command away.");
if (fails) { console.log("decisionIndex-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("decisionIndex-selfcheck: all checks pass");
