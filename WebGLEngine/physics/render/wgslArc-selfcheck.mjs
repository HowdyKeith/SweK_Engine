// physics/render/wgslArc-selfcheck.mjs -- v4478 -- the gate for physics/render/wgslArc.mjs.
//
// Run: node physics/render/wgslArc-selfcheck.mjs
//
// *** THE ROUND'S DELIVERABLE IS A DOOR, SO THE FIRST THING TO GRADE IS WHETHER THE DOOR OPENS. *** Section 1
// CALLS reportLines and asserts the seven appear in what a reader would see, because a door that renders
// nothing is the decorative door physicsReach's own limits warn about, and adding a row to move a counter
// would be exactly the defect this tree keeps finding.
//
// ---- *** FIVE SABOTAGES, RESULTS BY NAME *** ----------------------------------------------------------------
//
//  A. `sourceOf` looks for the constant only, not the builder  -> 5 RED
//  B. `faultReached` returns true unconditionally              -> 1 RED
//  C. Report every row's shape as "constant"                   -> 2 RED
//  D. Count producers from the rows that worked                -> 0 RED, THEN 2 RED AFTER THE REPAIR
//  E. Ignore the injected `load` and read the real arc          -> 4 RED
//
// *** D WENT ZERO-RED BECAUSE NOTHING IN THIS TREE FAILS TO YIELD SOURCE. *** Counting `rows.length` and
// counting `rows.filter(bytes > 0).length` give the same 7 on today's arc, so the assertion could not tell the
// two definitions apart -- it was true, and it was true of both. A count is only checkable on a population
// where the definitions DISAGREE, so section 4 now builds one: three producers, one emitting nothing, where
// the honest answer is producers 3 and withSource 2. A census that quietly drops what it could not read
// reports a smaller, cleaner, wronger tree and reports it as success.
//
// B reads 1 because one assertion owns that claim; the synthetic producer beside it is what makes the claim
// mean anything, and it is reported as 1 rather than described as "caught".
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** ------------------------------------------------------------------
//
// That the shaders are correct -- crossBackend and wgslCorpus own that, and a clean census over seven wrong
// shaders would pass here. That the bench page renders well, only that it is handed the seven. And that the
// arc's faults being reachable makes them RIGHT: a bit the shader consults could still be consulted wrongly.

import * as A from "./wgslArc.mjs";
import * as backendParity from "../../render/backendParity.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("wgslArc-selfcheck -- seven producers that had no front door\n");

const census = await A.arcCensus();

// ---- 1. THE DOOR OPENS --------------------------------------------------------------------------------------
console.log("1. the deliverable is a door, so the door is what gets graded first");

const lines = await A.reportLines();
say(lines.join("\n  ----  "));
ok("!! every producer appears in what a reader of the bench would actually see",
    A.PRODUCERS.every((p) => lines.some((l) => l.includes(p.split("/").pop()))),
    "instrument-bench.html renders reportLines; if this were empty the row would be decorative");
ok("...and the report carries the numbers, not just the names",
    lines.some((l) => /\d{4} b/.test(l)) && lines.some((l) => /declared faults/.test(l)));
// *** THE FIRST VERSION OF THIS CHECK WROTE ITS OWN STRIPPER AND REPRODUCED THE BUG v4461 FIXED. *** An
// unanchored /\*[\s\S]*?\*\// treats a `/*` inside a key STRING as the start of a block comment and swallows
// everything to the next `*/` -- which is precisely how physicsReach's old door went blind to 45.8% of
// instruments.mjs and manufactured most of the 35 phantom debt. The repair there was to anchor the pattern to
// the line start, because that is how this tree writes block comments and a mid-line glob cannot. So this
// reads THAT stripper rather than a second copy of the idea: one definition, and the check for the door uses
// the same eyes the door does.
ok("the instruments row names all seven module paths, which is what physicsReach reads", (() => {
    const src = fs.readFileSync(path.join(ENG, "physics", "instruments.mjs"), "utf8");
    const code = src
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, "")
        .replace(/^\s*\/\/.*$/gm, "");
    return A.PRODUCERS.every((p) => code.includes(p));
})(), "in CODE rather than in a comment -- physicsReach strips comments before it looks, anchored to the line start");

// ---- 2. TWO SHAPES, AND THE ONE A NAIVE CENSUS MISSES --------------------------------------------------------
console.log("\n2. five producers export their shader, two build it, and that distinction is the finding");

say(`shapes: ${JSON.stringify(census.byShape)}; ${census.withSource} of ${census.producers} yield source`);
ok("!! every producer yields a shader", census.withSource === census.producers,
    `${census.withSource}/${census.producers}`);
ok("!! and BOTH shapes are present, so the distinction is exercised rather than described",
    (census.byShape.constant || 0) >= 1 && (census.byShape.builder || 0) >= 1,
    "sabotage A: reading for a `*_WGSL` constant alone finds five and calls two of them empty -- " +
    "this round's own first probe did exactly that");
ok("the builders are named by the call that produced the text, not by a guess",
    census.rows.filter((r) => r.shape === A.SHAPE.builder).every((r) => /\(\)$/.test(r.via)),
    "sabotage C: dropping `shape` leaves a census right about the total and silent about every member");
ok("every emitted text really is WGSL by the tree's own classifier",
    census.rows.every((r) => r.lang === backendParity.LANG.WGSL),
    "read through render/backendParity.classify rather than a regex written here");

// ---- 3. THE FAULT VOCABULARY, WITH A PRODUCER BUILT TO FAIL IT ----------------------------------------------
console.log("\n3. a fault the shader never consults is a plant nobody can plant");

say(`${census.declaredFaults} declared faults across ${census.producers} producers, ${census.unreachedFaults.length} unreached`);
ok("!! today every declared fault is consulted by the shader that declares it",
    census.unreachedFaults.length === 0, "a clean bill, stated as one");
// *** THE LINE THAT WAS HERE PASSED A FUNCTION AS ITS CONDITION AND SO COULD NEVER FAIL. *** `ok(name,
// async () => true)` grades a truthy function object, not its result, and would have read PASS with the whole
// arc broken. It said "the check that says so can be MADE to fail" -- a promise about the block below, worth
// nothing next to the block below actually doing it. Deleted rather than repaired: the control is real.
{
    // the positive control: a synthetic producer declaring a bit its shader never reads
    const fake = {
        FAULT: Object.freeze({ real: 1, phantom: 64 }),
        // *** THE MARKER IS SPLIT ON PURPOSE, AND THE FIRST VERSION WAS NOT. *** A literal "@compute" in this
        // file made backendParity's census count THIS GATE as a WGSL-bearing source: 69 where 68 was recorded,
        // a fixture inflating the very population it is used to measure. That is v4409's rule -- a fixture is
        // not a gate, and a gate that leaves one behind grows what it measures -- arriving through a string
        // rather than a file. backendParity's own WGSL_MARKS are written "@" + "vertex" for this exact reason.
        FAKE_WGSL: "@" + "compute fn main() { if ((p.faults & 1u) != 0u) { x = 1.0; } }",
    };
    const c = await A.arcCensus({ producers: ["synthetic/fake.mjs"], load: async () => fake });
    say(`synthetic producer: declared ${c.declaredFaults}, unreached ${JSON.stringify(c.unreachedFaults)}`);
    ok("!! the unreachable fault is found and NAMED",
        c.unreachedFaults.length === 1 && c.unreachedFaults[0].endsWith(":phantom"),
        "sabotage B: faultReached returning true always makes section 3's clean bill vacuous");
    ok("...and the reachable one beside it is NOT flagged, so the check is not simply saying no",
        c.rows[0].faults === 2 && !c.unreachedFaults.some((f) => f.endsWith(":real")));
    ok("the injected loader is actually used", c.producers === 1 && census.producers === 7,
        "sabotage E: a fixture the code does not read makes the control above vacuous");
}

// ---- 4. THE ARC IS THE ONE physicsReach IS COUNTING ----------------------------------------------------------
console.log("\n4. the seven named here are the seven that went doorless, read from the ratchet itself");

ok("PRODUCERS is the list and the census agrees with it today",
    A.PRODUCERS.length === 7 && census.producers === A.PRODUCERS.length);
// *** THE LINE ABOVE WENT ZERO-RED AND THE REASON IS THAT NOTHING IN THIS TREE FAILS TO YIELD SOURCE. ***
// Sabotage D counted only rows with bytes > 0; today that is all seven, so the total was identical and the
// assertion could not tell the two definitions apart. A count is only checkable against a population where
// the definitions DISAGREE, so one is built: three producers, one of which emits nothing. `producers` must
// still read 3, because a census that quietly drops what it could not read reports a smaller, cleaner,
// wronger tree -- and reports it as success.
{
    const empty = { FAULT: Object.freeze({}) };                       // no constant, no builder
    const real = { FAULT: Object.freeze({ a: 1 }), X_WGSL: "@" + "compute fn m() { if ((p.faults & 1u) != 0u) {} }" };
    const c = await A.arcCensus({
        producers: ["a/one.mjs", "a/two.mjs", "a/three.mjs"],
        load: async (rel) => (rel === "a/two.mjs" ? empty : real),
    });
    say(`three producers, one emitting nothing: producers ${c.producers}, withSource ${c.withSource}`);
    ok("!! a producer that yields NO shader is still counted, and shows up as a shortfall rather than a smaller tree",
        c.producers === 3 && c.withSource === 2,
        "sabotage D: counting only the rows that worked turns a broken producer into a tidier census");
    ok("...and section 2's 'every producer yields a shader' would have caught it",
        c.withSource !== c.producers,
        "the two numbers are reported separately so the gap is visible rather than absorbed");
}
ok("every named producer exists on disk",
    A.PRODUCERS.every((p) => fs.existsSync(path.join(ENG, p))));
ok("every named producer is GRADED, which is what puts it in physicsReach's population",
    A.PRODUCERS.every((p) => fs.existsSync(path.join(ENG, p.replace(/\.mjs$/, "-selfcheck.mjs")))),
    "an ungraded module is not in the ratchet's set at all, so a door for one would prove nothing");
ok("the frozen record matches what the census reports now",
    A.ARC_AT_V4478.producers === census.producers &&
    A.ARC_AT_V4478.declaredFaults === census.declaredFaults &&
    A.ARC_AT_V4478.unreachedFaults === census.unreachedFaults.length &&
    A.ARC_AT_V4478.byShape.constant === census.byShape.constant &&
    A.ARC_AT_V4478.byShape.builder === census.byShape.builder);
ok("the record is frozen", Object.isFrozen(A.ARC_AT_V4478) && Object.isFrozen(A.PRODUCERS));

console.log(`\nwgslArc-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
