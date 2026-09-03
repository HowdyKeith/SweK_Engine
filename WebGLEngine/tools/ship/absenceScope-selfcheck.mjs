// tools/ship/absenceScope-selfcheck.mjs -- v4435 -- the gate for tools/ship/absenceScope.mjs.
//
// *** WHAT IS BEING GRADED IS A CLAIM I SHIPPED ONE ROUND AGO AND GOT WRONG. *** docs/EXPLAIN-ITSELF.md
// item 10 said the tree has no BVH, citing a grep over three directories. The tree holds twelve files of
// real BVH code and the claim named two. This gate holds the correction in place and, more usefully, holds
// the SHAPE of the correction in place: an absence claim is only as wide as where it looked.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Revert tokenMatch to a plain \b word boundary          -> 10 RED
//     THIS IS THE ONE THAT MATTERS. It is the bug the first draft of the module actually shipped with, and
//     it is invisible to every check that does not name mesh/meshBVH.mjs specifically, because \b finds
//     twelve of the thirteen files. A detector that is 92% right about a question whose whole answer is the
//     missing 8% reads as working.
//  B. Run the denial pass BEFORE the codeOnly pass           -> 2 RED (s2 ordering, s3 denial list)
//     physics/sph/bvhNeighbours.mjs builds a Morton BVH and its header says "rather than to replace it";
//     with the passes swapped it is scored a denial and vanishes from the real-implementation count.
//  C. Drop the path check from scan()                        -> 0 RED, THEN 1 RED AFTER THE REPAIR
//     *** A SABOTAGE THAT GOES ZERO RED IS A FINDING, NOT A PASS, AND THIS ONE FOUND A CHECK THAT COULD NOT
//     FAIL. *** With tokenMatch fixed, every file in this tree named for the term ALSO spells it in code --
//     measured, the path check rescues 0 of 14 -- so removing it cost nothing at all. It is not wrong; it is
//     unfalsifiable, which in this tree is the same problem. Section 1 now grades it against a fixture tree
//     holding a file named sceneBvh.mjs whose code never says the word, and the sabotage costs one row.
//  D. Widen `exclude` to swallow the whole outOfScope list    -> 6 RED
//     The hole the module leaves open on purpose. Section 5 is why it cannot be widened quietly.
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That every absence claim in the tree is now graded. ONE is: item 10's. The other nine items in
// EXPLAIN-ITSELF.md make absence claims too and none of them is wired in here, because each needs a term
// chosen by a person and a wrong term produces a confident wrong answer -- which is the defect this whole
// file is about, and building a term-guesser would be committing it a third time in one round.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
    ENG, KINDS, tokenMatch, denialRe, classifyFile, scan, gradeClaim, sourceFiles, BVH_AT_V4435,
} from "./absenceScope.mjs";
import { codeOnly } from "./sourceScan.mjs";

let fails = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
    if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
};
const ok = (name, cond, detail = "") => {
    if (!cond) fails++;
    console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`);
};

// ---- 1. THE MATCHER, AND THE CAMEL HUMP THAT BROKE IT ----------------------------------------------------
console.log("\n1. tokenMatch -- a programmer's word is not a regex's word");

for (const [text, want, why] of [
    ["class MeshBVH {", true, "the camel hump -- \\b cannot see this and it is the whole round"],
    ["const bvhNode = 1", true, "hump on the trailing edge"],
    ["BVHNode x", true, "all-caps run followed by a capital"],
    ["a bvh here", true, "the ordinary case still works"],
    ["bvh", true, "the whole string"],
    ["abvhc", false, "buried inside a lowercase word is NOT a match"],
    ["subvh", false, "a lowercase prefix is not a boundary"],
    ["bvhx", false, "a lowercase suffix is not a boundary"],
]) eq(`tokenMatch(${JSON.stringify(text)}) -- ${why}`, tokenMatch(text, "bvh"), want);

// *** THE SPECIFIC MISS, NAMED, SO SABOTAGE A CANNOT PASS. *** The tree's ray-triangle BVH carries the term
// in exactly one identifier and a plain \b finds none of them.
const meshBvhSrc = fs.readFileSync(path.join(ENG, "mesh", "meshBVH.mjs"), "utf8");
ok("the tree's ray-triangle BVH is found by tokenMatch", tokenMatch(meshBvhSrc, "bvh"));
ok("...and a plain \\b word boundary does NOT find it in its code -- the miss, reproduced",
   !/\bbvh\b/i.test(meshBvhSrc.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")),
   "identifier is MeshBVH; there is no boundary between Mesh and BVH");
// *** SABOTAGE C READ ZERO RED AND THAT IS THE FINDING. *** Removing the path check from scan() cost nothing,
// because once tokenMatch understood camel humps EVERY file in this tree named for the term also spells it in
// code -- measured: the path check rescues 0 of 14. It is real belt-and-braces for a file that could arrive
// tomorrow, but nothing in the tree can fail it, and a check nothing can fail is not a check. So it is graded
// against a FIXTURE TREE instead: a file named for the term whose code never spells it. That is the case the
// path check exists for, and it is now the case that breaks when the check goes.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "absenceScope-"));
fs.mkdirSync(path.join(fixtureRoot, "accel"));
fs.writeFileSync(path.join(fixtureRoot, "accel", "sceneBvh.mjs"), "export const build = (n) => n;\n");
fs.writeFileSync(path.join(fixtureRoot, "accel", "plain.mjs"), "export const other = 1;\n");
const fixture = scan("bvh", { root: fixtureRoot });
eq("a file NAMED for the term whose code never spells it is still code -- the path check, made falsifiable",
   fixture.code, ["accel/sceneBvh.mjs"]);
ok("...and its neighbour that neither names nor spells it is not picked up",
   fixture.denial.length === 0 && fixture.mention.length === 0);
fs.rmSync(fixtureRoot, { recursive: true, force: true });

ok("in the real tree the path check currently rescues nothing, which is why the fixture exists", (() => {
    const all = sourceFiles(ENG);
    return all.filter((f) => tokenMatch(f, "bvh") &&
        classifyFile(fs.readFileSync(path.join(ENG, f), "utf8"), "bvh") !== "code").length === 0;
})());

// ---- 2. THE ORDER OF THE TWO STRIPPERS ------------------------------------------------------------------
console.log("\n2. codeOnly first, prose second -- and the order is load-bearing");

// A file that BUILDS the thing and also carries a sentence denying it. codeOnly answers first, so no prose
// can argue with it. Run the passes the other way and this is scored `denial`.
const buildsAndDenies = `// there is no bvh in the tracer at all\nexport function buildBvh(n) { return n; }\n`;
eq("a file that builds it and denies it in prose is CODE", classifyFile(buildsAndDenies, "bvh"), "code");
eq("prose alone that denies it is DENIAL", classifyFile("// NO BVH -- linear over the geometries\n", "bvh"), "denial");
eq("prose alone that merely names it is MENTION", classifyFile("// a bvh would help here one day\n", "bvh"), "mention");
eq("a file that never says it at all is null", classifyFile("export const x = 1;\n", "bvh"), null);
ok("the real Morton BVH is code, not a denial, though its header argues about replacing things",
   scan("bvh").code.includes("physics/sph/bvhNeighbours.mjs"));
ok("denialRe matches rtPipeline's actual sentence",
   denialRe("bvh").test("Linear over the geometries. NO BVH -- honest at four spheres"));

// ---- 3. ITEM 10 AS WRITTEN AT v4432, GRADED -------------------------------------------------------------
console.log("\n3. the claim itself -- three failure modes, named apart");

const graded = gradeClaim({
    term: BVH_AT_V4435.term,
    searched: [...BVH_AT_V4435.searched],
    said: [...BVH_AT_V4435.said],
    exclude: [...BVH_AT_V4435.exclude],
});

ok("the claim is NOT sound, which is the finding", graded.sound === false);
eq("out of scope -- real BVH code the three directories could not reach", graded.outOfScope, [...BVH_AT_V4435.outOfScope]);
eq("in scope and summarised away", graded.inScopeMissed, [...BVH_AT_V4435.inScopeMissed]);
eq("matched only because they ASSERT the absence", graded.wide.denial, [...BVH_AT_V4435.denial]);
ok("the tree holds twelve real BVH files where the claim named two",
   graded.realImplementations === 12 && BVH_AT_V4435.said.length === 2,
   `${graded.realImplementations} vs ${BVH_AT_V4435.said.length}`);

// *** AND THE NARROW CLAIM SURVIVES, WHICH IS THE HALF THAT IS STILL TRUE. *** The tracer has no BVH. It is
// asserted from the tracer's own file rather than from the absence of a hit, because an absence read as a
// pass is v4402's defect.
const rt = fs.readFileSync(path.join(ENG, "physics", "render", "rtPipeline.mjs"), "utf8");
ok("the tracer really has no BVH -- rtPipeline.mjs says so in its own words",
   /NO BVH/i.test(rt) && classifyFile(rt, "bvh") === "denial");

// ---- 4. THE FROZEN RECORD MATCHES THE TREE ---------------------------------------------------------------
console.log("\n4. the record is a record, not a rendering");

const live = scan("bvh");
const liveOut = live.code.filter((f) =>
    !BVH_AT_V4435.exclude.includes(f) && !f.startsWith("physics/") && !f.startsWith("render/") && !f.startsWith("world/"));
eq("BVH_AT_V4435.outOfScope still equals what the tree holds", liveOut, [...BVH_AT_V4435.outOfScope]);
ok("every name in the record is a file that exists",
   [...BVH_AT_V4435.outOfScope, ...BVH_AT_V4435.inScopeMissed, ...BVH_AT_V4435.denial]
       .every((f) => fs.existsSync(path.join(ENG, f))));
ok("realImplementations agrees with a fresh grade", graded.realImplementations === BVH_AT_V4435.realImplementations);

// ---- 5. THE HOLE, HELD SHUT BY NAME ----------------------------------------------------------------------
console.log("\n5. `exclude` is a hole, and this is the lid");

eq("exactly two exclusions, and they are this module and this gate",
   [...BVH_AT_V4435.exclude], ["tools/ship/absenceScope-selfcheck.mjs", "tools/ship/absenceScope.mjs"]);
// *** THIS ROW WENT RED ON ITS OWN TEST FIXTURE, WHICH IS THE TWO-STRIPPER RULE ARRIVING UNINVITED. *** The
// first draft scanned RAW TEXT and matched the string "class MeshBVH {" in section 1 above -- a fixture, not
// a class. The question here is what the file DOES, so it is codeOnly's question, and codeOnly blanks string
// bodies. Asked correctly, both files are registers.
ok("both excluded files really are registers rather than BVHs -- no build, no traversal, no intersection",
   BVH_AT_V4435.exclude.every((f) =>
       !/function\s+build[A-Z]|class\s+\w*BVH\b|intersect\w*\s*\(/.test(
           codeOnly(fs.readFileSync(path.join(ENG, f), "utf8")))));
ok("excluding the whole outOfScope list would make the claim read SOUND -- which is why the list is asserted",
   gradeClaim({ term: "bvh", searched: [...BVH_AT_V4435.searched],
                said: [...BVH_AT_V4435.said, ...BVH_AT_V4435.inScopeMissed],
                exclude: [...BVH_AT_V4435.exclude, ...BVH_AT_V4435.outOfScope] }).sound === true);

// ---- 6. THE MODULE'S OWN SURFACE -------------------------------------------------------------------------
console.log("\n6. surface");
eq("KINDS is the three, in the order they are tried", [...KINDS], ["code", "denial", "mention"]);
ok("sourceFiles reaches the whole tree and skips vendor", (() => {
    const all = sourceFiles(ENG);
    return all.length > 500 && !all.some((f) => f.startsWith("vendor/")) && all.includes("mesh/meshBVH.mjs");
})());

console.log(`\nabsenceScope-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
