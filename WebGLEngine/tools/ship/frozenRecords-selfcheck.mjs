#!/usr/bin/env node
// WebGLEngine/tools/ship/frozenRecords-selfcheck.mjs -- v4487 -- the gate for tools/ship/frozenRecords.mjs.
//
// Run: node tools/ship/frozenRecords-selfcheck.mjs
//
// *** THE EXPENSIVE HALF OF THIS ROUND CANNOT LIVE IN A GATE. *** The corruption sweep bumps 135 fields and
// runs a gate for each, in place, restoring after every one. That is an hour and it writes to the tree, and a
// gate must do neither. So the sweep is FROZEN and this file grades the two things that are affordable: the
// enumeration, driven both ways on fixtures, and the record's own arithmetic.
//
// ---- *** SIX SABOTAGES *** ------------------------------------------------------------------------------------
//
//  A. The record pattern loses its version stamp        -> 2 RED
//  B. Guardians are the SIBLING gate rather than derived-> 2 RED
//  C. A gate that names a record is not counted         -> 3 RED
//  D. `exclude` is ignored, so the file counts itself   -> 2 RED
//  E. The record's own arithmetic stops adding up       -> 2 RED
//  F. The probe's stated limit is dropped               -> 1 RED
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** --------------------------------------------------------------------
//
// That 52 fields are 52 defects. UNNOTICED is not UNGUARDED: a +7 bump is a corruption a gate may reasonably
// survive, and the record carries a demonstration of exactly that on this round's own repair. Nor that the
// sweep would reproduce today -- it is a reading taken at v4487, and the two repairs this round shipped have
// already moved it, which is why the frozen number is compared against nothing live.
"use strict";
import { census, reportLines, sources, RECORD_RE, PROBE_AT_V4487 as REC, ENG }
    from "./frozenRecords.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("frozenRecords-selfcheck -- which of this tree's frozen numbers anything actually checks\n");

// A fixture tree: the enumerator is handed source text, never the disk.
const F = (name, body) => path.join(ENG, "__fx_" + name + ".mjs");
// *** THE FIXTURES ARE ASSEMBLED, NEVER SPELLED, AND THIS GATE IS WHERE THAT MATTERS MOST. *** Written as
// literals they ARE version-stamped frozen exports, so they land in the census they exist to test -- the
// first draft did exactly that and section 2 caught it, reporting three new records where one was expected.
// v4409's rule (a fixture is not a gate) arriving through a string, for the FIFTH time this session, in the
// file built to count the things it is an instance of.
const EC = "export " + "const ", FR = " = Object." + "freeze(";
const T = "THING" + "_AT_V4321", L = "LONELY" + "_AT_V4322";
const FIX = {
    "mod": `${EC}${T}${FR}{\n  alpha: 3,\n  beta: 11,\n});\n${EC}PLAIN${FR}{ gamma: 1 });\n`,
    "mod-selfcheck": `import { ${T} } from "./mod.mjs";\nok(${T}.alpha === 3);\n`,
    "lonely": `${EC}${L}${FR}{\n  delta: 5,\n});\n`,
    "far-selfcheck": `import { ${L} } from "../lonely.mjs";\n`,
};
const run = (names) => census({
    files: names.map((n) => F(n)),
    read: (f) => FIX[path.basename(f).replace(/^__fx_|\.mjs$/g, "")],
    exclude: null,
});

// ---- 1. THE ENUMERATION, ON TEXT WHOSE ANSWER IS KNOWN BEFORE THE CODE RUNS -------------------------------------
console.log("1. what counts as a record, and who counts as its guardian");

{
    const c = run(["mod", "mod-selfcheck"]);
    ok("!! a version-stamped frozen export is a record, and a plain frozen one is not",
        c.records.length === 1 && c.records[0].name === T,
        "sabotage A: without the version stamp the pattern matches 427 frozen ALL-CAPS exports instead of 74, " +
        "and the population stops being 'a number a round measured and wrote down'");
    ok("...and its integer fields are enumerated",
        c.records[0].fields.join(",") === "alpha,beta");
    ok("!! ...and the gate that NAMES it is its guardian",
        c.records[0].guardians.length === 1 && /mod-selfcheck/.test(c.records[0].guardians[0]),
        "sabotage C: a guardian set that misses a real reader turns a guarded field into a finding");
}
{
    // *** THE GUARDIAN IS DERIVED, NOT ASSUMED, AND THIS IS THE FIXTURE FOR WHY. *** The first sweep of this
    // round probed each record against its SIBLING gate. Twenty-nine of seventy-four are not named by their
    // sibling -- 15 named elsewhere, 14 by nothing -- and 31 of the 83 catches came from a gate somewhere
    // else entirely.
    const c = run(["lonely", "far-selfcheck"]);
    const r = c.records[0];
    ok("!! *** a record guarded from ANOTHER DIRECTORY is guarded, and its sibling names it not at all ***",
        r.guardians.length === 1 && /far-selfcheck/.test(r.guardians[0]) && r.siblingNamesIt === false,
        "sabotage B: the sibling rule reports this one unguarded, which is what the first sweep did to " +
        "RECHECK_V4314 -- read by slowCensus-selfcheck.mjs and probed against redCensus-selfcheck.mjs");
    ok("...and `siblingNamesIt` is reported per record, so the two questions stay apart",
        typeof r.siblingNamesIt === "boolean" && c.siblingWrong === 1);
}
{
    const c = run(["lonely"]);
    ok("!! a record NO gate names is reported as such rather than as guarded",
        c.unguarded.length === 1 && c.unguarded[0] === L,
        "14 of the tree's 74 are in this state -- a number written down, version-stamped, frozen, and read " +
        "by nothing at all");
}

// ---- 2. *** THE FILE IS ITSELF A RECORD, SO IT MOVED THE COUNT IT MEASURES *** -----------------------------------
console.log("\n2. the observer effect, checked to be exactly one");

{
    const all = census();
    const without = census({ exclude: /frozenRecords/ });
    ok("!! *** counting this module adds EXACTLY ONE record, which is PROBE_AT_V4487 ***",
        all.records.length - without.records.length === 1 &&
        all.records.some((r) => r.name === "PROBE_AT_V4487") &&
        !without.records.some((r) => r.name === "PROBE_AT_V4487"),
        "sabotage D: v3453's observer effect in a file built to count the things it is an instance of. " +
        "'The number changed when I wrote it down' is a curiosity until somebody checks it changed by one");
    ok("...and the excluded reading is the one the frozen sweep was taken against",
        without.records.length === REC.records && without.fields === REC.fields,
        `${without.records.length} records and ${without.fields} fields now, ` +
        `against ${REC.records} and ${REC.fields} at v4487`);
    say(reportLines(without).join("\n  ----  "));
}

// ---- 3. THE FROZEN SWEEP'S OWN ARITHMETIC ------------------------------------------------------------------------
console.log("\n3. the record the sweep left behind");

ok("!! noticed and unnoticed account for every field probed",
    REC.noticed + REC.unnoticed === REC.fields,
    `sabotage E: ${REC.noticed} + ${REC.unnoticed} = ${REC.fields}. A headline beside a list that does not ` +
    "add up is v4296's mistake, and it is the cheapest of all of these to check");
ok("...and the counted subsets do not exceed the population they are drawn from",
    REC.nothingNoticesAnyField <= REC.withFields && REC.fullyGuarded <= REC.withFields &&
    REC.noGateNamesIt <= REC.records && REC.caughtByANonSiblingGate <= REC.noticed);
ok("!! *** the method is stated, so a later sweep can be compared rather than merely disagreed with ***",
    /bump one integer field by 7/.test(REC.method) && /every gate that NAMES/.test(REC.method));
ok("!! ...and the FIRST sweep is kept, with what was wrong with it",
    REC.firstSweepUsedSiblingsOnly.unnoticedPct === 37.0 &&
    /assumed/.test(REC.firstSweepUsedSiblingsOnly.wrong),
    "37.0% against 38.5%: THE HEADLINE BARELY MOVED AND THE ATTRIBUTION MOVED ENORMOUSLY. A discarded " +
    "reading is evidence about the method, and this one says a defensible number can rest on a guess");
// *** THE DETAIL IS COMPUTED DEFENSIVELY, AND THAT IS THE FOURTH TIME THIS SESSION. *** Reading the field
// eagerly here means a sabotage that DELETES it throws before `ok` is called, no FAIL line prints, and a
// count of FAIL lines reads the crash as a clean zero -- which is what sabotage F did on the first run.
// v4485's gate had it, v4486's runner grew a load-check for it, changedPaths was repaired for it, and it
// arrived again here. FOUR INSTANCES, ONE SHAPE: a detail string that assumes the thing the condition is
// about to say may be missing.
const LIMIT = REC.probeCatchesOneDirection || {};
ok("!! *** and the limit is DEMONSTRATED on this round's own repair, not merely asserted ***",
    !!REC.probeCatchesOneDirection && LIMIT.stillUnnoticed === true &&
    /TAINT_AT_V4479/.test(String(LIMIT.shown)),
    `sabotage F: ${LIMIT.why || "NO LIMIT RECORDED"}. The guard added to that record catches a DOWNWARD ` +
    "corruption; the probe applies an UPWARD one; so a real guard reads here as no guard, and the field " +
    "stays in the unnoticed count rather than being argued out of it");
ok("the record is frozen", Object.isFrozen(REC) && Object.isFrozen(LIMIT));

// ---- 4. THE TWO REPAIRS THIS ROUND SHIPPED ------------------------------------------------------------------------
console.log("\n4. what was closed, checked against the files rather than claimed");

{
    const shape = fs.readFileSync(path.join(ENG, "tools/ship/assertionShape-selfcheck.mjs"), "utf8");
    ok("!! *** assertionShape compares ALL NINE rows of its census, where it compared four ***",
        /\["gates", REC\.gates/.test(shape) && /\["usesOk", REC\.usesOk/.test(shape) &&
        /\["nameFirst", REC\.nameFirst/.test(shape) && /\["unknownSignature"/.test(shape),
        "gates, usesOk, nameFirst, distinctDefinitions and unknownSignature were re-taken by hand every " +
        "round with nothing checking them -- and vba/runtimeGap.mjs found the IDENTICAL defect in itself at " +
        "v4462, eighteen rounds earlier. The lesson did not travel");
    const taint = fs.readFileSync(path.join(ENG, "tools/roundhouse/observableTaint-selfcheck.mjs"), "utf8");
    ok("...and observableTaint's build counts are at least consistent, which is SAID to be less than derived",
        /buildsWhereNothingMoved <= REC\.builds/.test(taint) && /NOT a re-derivation/.test(taint),
        "the sweep those numbers came from is 40 builds, so a gate cannot re-run it -- and a consistency " +
        "check that pretended to be a re-derivation would be the worse of the two failures");
}

console.log(`\nfrozenRecords-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
